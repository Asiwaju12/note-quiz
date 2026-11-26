// End-to-end walkthrough of every major workflow. See README → Testing.
const { chromium, devices } = require("playwright");
const path = require("path");
const BASE = process.env.BASE || "http://localhost:5173";
const OUT = path.join(__dirname, "..", "test-results", process.env.LABEL || "run");
const PDF = path.join(__dirname, "fixtures", "Introduction to Cybersecurity.pdf");
require("fs").mkdirSync(OUT, { recursive: true });

const results = [];
const log = (step, ok, info = "") => {
  results.push({ step, ok, info });
  console.log(`${ok ? "PASS" : "FAIL"}  ${step}${info ? " — " + info : ""}`);
};

async function overflow(page, name) {
  const o = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o > 1) log(`no horizontal overflow: ${name}`, false, `${o}px`);
  return o;
}

async function step(name, fn) {
  try {
    await fn();
    log(name, true);
  } catch (e) {
    log(name, false, String(e.message).split("\n")[0].slice(0, 200));
  }
}

(async () => {
  const mobile = process.env.MOBILE === "1";
  const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const context = await browser.newContext(mobile ? { ...devices["iPhone 13"] } : { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && !/favicon|fonts.g|Failed to load resource.*404/.test(m.text()) && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push("pageerror: " + e.message));
  const shot = (n) => page.screenshot({ path: path.join(OUT, `${n}.png`), fullPage: false });
  const ai = process.env.AI === "1";

  await step("onboarding + dashboard", async () => {
    await page.goto(BASE + "/");
    const welcome = page.getByRole("dialog");
    await welcome.locator('input[placeholder="Your first name"]').first().fill("Fernanda");
    await welcome.getByRole("button", { name: /Take the quick tour/ }).click();
    for (let i = 0; i < 3; i++) {
      await welcome.getByRole("button", { name: /^Next/ }).click();
    }
    await welcome.getByRole("button", { name: /^Finish/ }).click();
    await welcome.waitFor({ state: "hidden" });
    await shot("01-dashboard-empty");
    await overflow(page, "dashboard");
  });

  await step("upload PDF in Study Centre", async () => {
    await page.goto(BASE + "/study");
    await page.getByRole("button", { name: /Upload/ }).first().click();
    await page.locator('input[type=file]').setInputFiles(PDF);
    await page.getByRole("dialog").getByRole("button", { name: /^Upload$/ }).click();
    await page.getByText("4 pages").waitFor({ timeout: 20000 });
    await shot("02-study-centre");
    await overflow(page, "study centre");
  });

  await step("open workspace overview", async () => {
    await page.getByRole("link", { name: /Introduction to Cybersecurity/ }).click();
    await page.getByRole("tab", { name: "Overview" }).waitFor();
    await shot("03-workspace-overview");
    await overflow(page, "workspace");
  });

  const gen = async (tab, waitText) => {
    await page.getByRole("tab", { name: tab }).click();
    const btn = page.getByRole("button", { name: ai ? /Generate with Recall AI/ : /Generate in basic mode/ });
    await btn.click();
    await page.getByText(waitText).first().waitFor({ timeout: 30000 });
  };

  await step("summary generation", async () => {
    await gen("Summary", ai ? "Mock summary" : "Main ideas");
    await shot("04-summary");
  });
  if (!ai) {
    await step("notes generation", async () => {
      await gen("Notes", "Key points");
      await shot("05-notes");
    });
    await step("key terms generation", async () => {
      await gen("Key terms", "Firewall");
      await shot("06-key-terms");
    });
    await step("study guide generation + complete topic", async () => {
      await gen("Study guide", "Topic 1");
      await page.getByRole("button", { name: /Mark “.*” as complete/ }).first().click();
      await page.getByText(/1 of \d+ topics complete/).waitFor();
      await shot("07-guide");
    });
  }

  await step("PDF viewer renders + search + bookmark", async () => {
    await page.getByRole("tab", { name: "File" }).click();
    await page.waitForFunction(() => document.querySelectorAll(".pdf-text-layer span").length > 3, null, { timeout: 20000 });
    await page.getByRole("button", { name: "Next page" }).click();
    await page.getByLabel("Page number").evaluate((el) => el.value).then((v) => {
      if (v !== "2") throw new Error("page nav failed: " + v);
    });
    await page.getByRole("button", { name: "Search in document" }).click();
    await page.getByLabel("Search text").fill("firewall");
    await page.getByText(/p\. 2/).first().waitFor();
    await page.getByRole("button", { name: "Bookmark this page" }).click();
    await page.waitForTimeout(800);
    await shot("08-pdf-viewer");
    await overflow(page, "pdf viewer");
  });

  await step("highlight via text selection", async () => {
    await page.waitForFunction(() => [...document.querySelectorAll(".pdf-text-layer span")].some((span) => (span.textContent ?? "").trim().length > 20), null, { timeout: 20000 });
    await page.evaluate(() => {
      const span = [...document.querySelectorAll(".pdf-text-layer span")].find((node) => (node.textContent ?? "").trim().length > 20);
      if (!span) throw new Error("PDF text layer has no selectable text");
      const range = document.createRange();
      range.selectNodeContents(span);
      const selection = window.getSelection();
      if (!selection) throw new Error("Browser text selection is unavailable");
      selection.removeAllRanges();
      selection.addRange(range);
    });
    await page.waitForFunction(() => Boolean(window.getSelection()?.toString().trim()), null, { timeout: 5000 });
    await page.getByRole("button", { name: "Highlight", exact: true }).click();
    await page.getByText("Highlight saved").waitFor();
  });

  await step("flashcards generate + flip + rate", async () => {
    await page.getByRole("tab", { name: "Flashcards" }).click();
    if (!ai) {
      await page.getByRole("button", { name: /Generate in basic mode/ }).click();
      await page.getByText(/cards in this document/).waitFor({ timeout: 20000 });
      await page.getByRole("button", { name: /Study all/ }).click();
      await page.getByRole("button", { name: "Reveal answer" }).click();
      await page.waitForTimeout(500);
      await shot("09-flashcard-flipped");
      await page.getByRole("button", { name: "Got it" }).click();
      await page.getByText(/Card 2 of/).waitFor();
      await page.getByRole("button", { name: "End" }).click();
    }
  });

  await step("practice questions → results", async () => {
    await page.getByRole("tab", { name: "Practice" }).click();
    await page.getByRole("button", { name: ai ? /Generate with Recall AI/ : /Generate in basic mode/ }).click();
    await page.getByRole("button", { name: /Check answer|Show model answer/ }).waitFor({ timeout: 30000 });
    await shot("10-practice-question");
    for (let i = 0; i < 25; i++) {
      if (await page.getByText(/Answer review/).isVisible().catch(() => false)) break;
      const radios = page.getByRole("radio");
      if (await radios.count()) await radios.first().click();
      else {
        const box = page.getByLabel("Your answer");
        if (await box.count()) await box.fill("firewall filters network traffic");
      }
      const check = page.getByRole("button", { name: /Check answer|Show model answer/ });
      if (await check.isVisible().catch(() => false)) await check.click();
      const self = page.getByRole("button", { name: "I got it right" });
      if (await self.isVisible().catch(() => false)) await self.click();
      await page.getByRole("button", { name: /Next question|See results/ }).click();
      await page.waitForTimeout(350);
    }
    await page.getByText("Answer review").waitFor();
    await shot("11-practice-results");
    await overflow(page, "results");
  });

  if (ai) {
    await step("document AI tutor streams with page citations", async () => {
      await page.goto(BASE + "/study");
      await page.getByRole("link", { name: /Introduction to Cybersecurity/ }).click();
      await page.getByRole("tab", { name: "AI tutor" }).click();
      await page.getByLabel("Message Recall AI").fill("What does a firewall do?");
      await page.getByRole("button", { name: "Send message" }).click();
      await page.getByText("Mock tutor answer").waitFor({ timeout: 15000 });
      await page.getByText("Searched your document").waitFor();
      await page.waitForTimeout(600);
      await shot("12-ai-tutor");
    });
    await step("general Recall AI page", async () => {
      await page.goto(BASE + "/ai");
      await page.getByRole("button", { name: /Explain photosynthesis/ }).click();
      await page.getByText("Mock tutor answer").waitFor({ timeout: 15000 });
      await page.getByRole("button", { name: "Copy response" }).waitFor();
      await shot("13-ai-page");
      await overflow(page, "ai");
    });
  } else {
    await step("AI not-connected state is honest", async () => {
      await page.goto(BASE + "/ai");
      await page.getByText("Recall AI isn't connected yet").waitFor();
      await shot("12-ai-not-connected");
    });
  }

  await step("create quiz from notes (original parser) → practise", async () => {
    await page.goto(BASE + "/quiz/create");
    await page.getByRole("button", { name: "Try sample notes" }).click();
    await page.getByLabel("Deck name").fill("Memory & the brain");
    await page.getByRole("button", { name: /Turn notes into a quiz|Quick generate/ }).click();
    await page.getByText(/questions ready/).waitFor();
    await shot("14-quiz-created");
  });

  await step("arcade game: answer, results, high score", async () => {
    await page.goto(BASE + "/quiz");
    await shot("15-quiz-hub");
    await overflow(page, "quiz hub");
    await page.goto(BASE + "/quiz/arcade?deck=sample");
    await page.getByRole("button", { name: /^Answer 1/ }).waitFor();
    await shot("16-arcade");
    for (let i = 0; i < 40; i++) {
      if (await page.getByText(/Run complete/).isVisible().catch(() => false)) break;
      const keep = page.getByRole("button", { name: "Keep going" });
      if (await keep.isVisible().catch(() => false)) {
        // The game explicitly supports Enter to continue through level-up screens.
        await page.keyboard.press("Enter");
        continue;
      }
      const answer = page.getByRole("button", { name: /^Answer 1:/ });
      if (await answer.isEnabled().catch(() => false)) {
        // Use the documented 1–4 keyboard control so animated buttons don't make
        // the browser test flaky while the game is transitioning between states.
        await page.keyboard.press("1");
        await page.getByRole("button", { name: /Next question|See results|Level up/ }).waitFor({ timeout: 3000 });
        await page.keyboard.press("Enter");
      }
      await page.waitForTimeout(150);
    }
    await page.getByText(/Run complete/).waitFor({ timeout: 10000 });
    await shot("17-arcade-results");
  });

  await step("daily drop (local mode) posts to local board", async () => {
    await page.goto(BASE + "/quiz/arcade?daily=1");
    await page.getByRole("button", { name: /^Answer 1:/ }).waitFor({ timeout: 5000 });
    const heading = page.getByText(/Today's leaderboard/);
    for (let i = 0; i < 16; i++) {
      if (await heading.isVisible().catch(() => false)) break;
      const keep = page.getByRole("button", { name: "Keep going" });
      if (await keep.isVisible().catch(() => false)) {
        await page.keyboard.press("Enter");
        continue;
      }
      const answer = page.getByRole("button", { name: /^Answer 1:/ });
      if (await answer.isEnabled().catch(() => false)) {
        await page.keyboard.press("1");
        await page.getByRole("button", { name: /Next question|See results|Level up/ }).waitFor({ timeout: 3000 });
        await page.keyboard.press("Enter");
      }
      await page.waitForTimeout(150);
    }
    await heading.waitFor({ timeout: 5000 });
    const rows = page.getByRole("list", { name: "Today's daily leaderboard" }).getByRole("listitem");
    if (await rows.count() < 1) throw new Error("Daily result did not appear on the local leaderboard");
  });

  await step("exam mode: start, flag, navigate, submit", async () => {
    await page.goto(BASE + "/exam");
    await page.getByRole("button", { name: /Memory & the brain/ }).click();
    await page.getByRole("button", { name: "10", exact: true }).click();
    await page.getByRole("button", { name: "Start exam" }).click();
    await page.getByRole("button", { name: "Flag" }).click();
    await page.getByRole("radio").first().click();
    await shot("18-exam-running");
    await overflow(page, "exam");
    await page.getByRole("button", { name: "Next" }).click();
    await page.getByRole("radio").nth(1).click();
    await page.getByRole("button", { name: /Review/ }).first().click();
    await page.getByRole("button", { name: "Submit exam" }).click();
    await page.getByText("Answer review").waitFor();
    await shot("19-exam-results");
  });

  if (!ai) await step("review (FSRS) page", async () => {
    await page.goto(BASE + "/review");
    await page.getByText("Today's review").waitFor();
    await page.getByRole("button", { name: "Start review" }).click();
    await page.getByRole("button", { name: "Reveal answer" }).click();
    await page.getByRole("button", { name: /^Good/ }).click();
    await shot("20-review");
  });

  await step("planner: goal → quick plan → save → tick task", async () => {
    await page.goto(BASE + "/planner");
    await page.getByRole("button", { name: /Create a goal|New goal/ }).first().click();
    await page.getByLabel("Goal", { exact: true }).fill("Pass Cybersecurity exam");
    await page.getByRole("button", { name: /Introduction to Cybersecurity/ }).click();
    await page.getByRole("button", { name: "Create goal" }).click();
    await page.getByRole("button", { name: "Build plan" }).click();
    await page.getByRole("button", { name: /Quick schedule/ }).click();
    await page.getByRole("button", { name: /^Save \d+ tasks/ }).click();
    await page.getByText(/Today · /).waitFor();
    await page.getByRole("button", { name: "Mark as done" }).first().click();
    await shot("21-planner");
    await overflow(page, "planner");
  });

  for (const [route, name] of [["/progress", "22-progress"], ["/progress?tab=topics", "23-topics"], ["/progress?tab=achievements", "24-achievements"], ["/decks", "25-decks"], ["/leaderboard", "26-leaderboard"], ["/profile", "27-profile"], ["/", "28-dashboard-active"]]) {
    await step(`render ${route}`, async () => {
      await page.goto(BASE + route);
      await page.waitForTimeout(900);
      await shot(name);
      await overflow(page, route);
    });
  }

  if (mobile) {
    await step("mobile More sheet", async () => {
      await page.getByRole("button", { name: "More" }).click();
      await page.getByRole("link", { name: "Exam Mode" }).waitFor();
      await shot("29-more-sheet");
    });
  }

  await step("dark theme toggle", async () => {
    await page.goto(BASE + "/");
    const btn = page.getByRole("button", { name: /Switch to (dark|light) theme/ }).first();
    await btn.click();
    await page.waitForTimeout(400);
    await shot("30-theme-toggled");
  });

  await step("persistence across reload", async () => {
    await page.reload();
    await page.goto(BASE + "/study");
    await page.getByRole("link", { name: /Introduction to Cybersecurity/ }).waitFor();
  });

  log("no console errors", errors.length === 0, errors.slice(0, 5).join(" | "));
  await browser.close();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
})();
