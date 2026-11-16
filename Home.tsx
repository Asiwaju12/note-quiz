import { useEffect, useRef, useState, type RefObject } from "react";
import { cn } from "@/utils/cn";
import { parseNotes } from "@/game/parseNotes";
import { loadCloudNote, saveCloudNote } from "./cloud";
import { SAMPLE_DECK } from "@/game/deck";
import type { Deck, Pace, ScoreEntry } from "@/game/types";
import { PACES, paceSeconds } from "@/game/types";
import type { PublicAccount } from "@/game/auth";
import type { FileExtraction } from "@/game/files";
import {
  clearScores,
  loadNotes,
  loadNotesAsync,
  loadNoteTitle,
  loadPlayed,
  loadScores,
  saveNoteTitle,
  saveNotes,
} from "@/game/storage";
import { sfx } from "@/game/sound";
import { Icon, type IconName } from "./Icons";
import { HighScoreTable } from "./HighScoreTable";
import type { ParticleHandle } from "./ParticleField";
import { SiteHeader } from "./SiteHeader";
import { AccountPanel } from "./AccountPanel";
import { Avatar } from "./Avatar";
import { FileImporter, uploadSuccessLabel } from "./FileImporter";
import { PacePicker } from "./PacePicker";
import { DailyChallenge } from "./DailyChallenge";
import { Fernandez, FernandezSay } from "./Fernandez";
import { AnimatedNumber, Logo, MarqueeStrip, SectionLabel } from "./ui";

const SAMPLE_NOTES = `The hippocampus encodes new long-term memories.
Neuroplasticity: the brain's ability to rewire its connections.
REM sleep supports memory consolidation.
Spaced repetition: spreading reviews over time beats cramming.
What is active recall?
Retrieving information from memory without looking.
Dopamine is linked to reward, motivation and learning.`;

const STEPS: Array<{
  number: string;
  title: string;
  body: string;
  color: string;
  icon: IconName;
  visual: "notes" | "question" | "level";
}> = [
  {
    number: "01",
    title: "Bring the notes",
    body: "Paste a messy brain dump, upload slides and readings, or photograph your notebook. Fernandez pulls out the facts.",
    color: "bg-lilac",
    icon: "note",
    visual: "notes",
  },
  {
    number: "02",
    title: "Fernandez flips it into a quiz",
    body: "Fernandez reads your notes and writes multiple-choice questions — with your original line saved as the explanation.",
    color: "bg-card",
    icon: "sparkle",
    visual: "question",
  },
  {
    number: "03",
    title: "Climb the levels",
    body: "Three clean answers clears a level. Every level is faster, richer in points, and one step closer to a new personal best.",
    color: "bg-coral",
    icon: "bolt",
    visual: "level",
  },
];

const RULES = [
  { icon: "bolt" as IconName, text: "Each correct answer banks 100 × level, plus a time bonus and streak fuel." },
  { icon: "layers" as IconName, text: "Clear 3 questions to level up. A flawless level restores a lost heart." },
  { icon: "heart" as IconName, text: "Three hearts. Wrong answers and timeouts cost one. Lose all three and the run ends." },
  { icon: "trophy" as IconName, text: "Sign in to sync your profile, notes and scores across devices." },
];

function NoteDoodle() {
  return (
    <div className="relative mx-auto h-[104px] w-[152px]">
      <div className="absolute left-1 top-3 h-[88px] w-[124px] rotate-[-7deg] rounded-lg border-2 border-ink bg-paper shadow-[3px_3px_0_#1B1A14]" />
      <div className="absolute left-5 top-1 h-[92px] w-[128px] rotate-[3deg] rounded-lg border-2 border-ink bg-card p-3 shadow-[3px_3px_0_#1B1A14]">
        <div className="mb-2 h-1.5 w-16 rounded-full bg-ink/70" />
        <div className="mb-1.5 h-1 w-20 rounded-full bg-ink/25" />
        <div className="mb-1.5 h-1 w-16 rounded-full bg-ink/25" />
        <div className="h-1 w-[72px] rounded-full bg-ink/25" />
      </div>
      <span className="absolute -right-1 -top-2 grid h-10 w-10 rotate-12 place-items-center rounded-full border-2 border-ink bg-lime font-display text-lg font-bold shadow-[2px_2px_0_#1B1A14]">
        ?
      </span>
    </div>
  );
}

function QuestionDoodle() {
  return (
    <div className="flex w-full items-end justify-center">
      <Fernandez size={68} mood="happy" className="relative z-10 -mr-3 rotate-[-4deg]" />
      <div className="w-full max-w-[168px] rounded-lg border-2 border-ink bg-paper p-2.5 shadow-[3px_3px_0_#1B1A14]">
        <p className="mb-2 font-display text-[10px] font-bold leading-tight">The brain&apos;s reward chemical is…</p>
        <div className="flex items-center gap-1.5 rounded border-2 border-ink bg-lime px-2 py-1">
          <span className="grid h-3 w-3 place-items-center rounded-full bg-ink text-lime">
            <Icon name="check" size={8} strokeWidth={3} />
          </span>
          <span className="text-[9px] font-bold">Dopamine</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 rounded border border-ink/25 px-2 py-1">
          <span className="h-2 w-2 rounded-full border border-ink/40" />
          <span className="text-[9px]">Serotonin</span>
        </div>
      </div>
    </div>
  );
}

function LevelDoodle() {
  return (
    <div className="flex w-full max-w-[188px] flex-col gap-1.5">
      {[3, 2, 1].map((level, index) => (
        <div
          key={level}
          className={cn(
            "flex items-center justify-between rounded-md border-2 border-ink px-2.5 py-1.5",
            index === 0 ? "bg-lime shadow-[2px_2px_0_#1B1A14]" : "bg-card",
          )}
        >
          <span className="font-mono text-[9px] font-medium uppercase tracking-widest">Level {level}</span>
          <span className="flex gap-0.5">
            {Array.from({ length: 3 }).map((_, dot) => (
              <span
                key={dot}
                className={cn(
                  "h-1.5 w-3 rounded-full",
                  index === 0 ? "bg-ink" : dot === 0 ? "bg-ink/50" : "bg-ink/15",
                )}
              />
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export function Home({
  activeDeck,
  account,
  pace,
  onPaceChange,
  onDeckChange,
  onStart,
  onStartDaily,
  muted,
  onToggleSound,
  onHowTo,
  onSignIn,
  onCreate,
  onSignOut,
  particles,
}: {
  activeDeck: Deck;
  account: PublicAccount | null;
  pace: Pace;
  onPaceChange: (pace: Pace) => void;
  onDeckChange: (deck: Deck) => void;
  onStart: (deck?: Deck) => void;
  onStartDaily: (deck: Deck, date: string) => void;
  muted: boolean;
  onToggleSound: () => void;
  onHowTo: () => void;
  onSignIn: () => void;
  onCreate: () => void;
  onSignOut: () => void;
  particles: RefObject<ParticleHandle | null>;
}) {
  const initialNotesRef = useRef(loadNotes());
  const [notes, setNotes] = useState(initialNotesRef.current);
  const [notesHydrated, setNotesHydrated] = useState(false);
  const [cloudNotesReady, setCloudNotesReady] = useState(false);
  const [title, setTitle] = useState(() => loadNoteTitle());
  const [generated, setGenerated] = useState<Deck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sourceTab, setSourceTab] = useState<"paste" | "files">("paste");
  const [fileMeta, setFileMeta] = useState<FileExtraction | null>(null);
  const fernandezTip = error
    ? "We'll get there. Add a few facts and give it another go."
    : generated
      ? `${generated.questions.length} questions ready. You've got this.`
      : fileMeta
        ? "Uploaded. Ready to build whenever you are."
        : notes.trim().length === 0
          ? "Messy notes welcome. I speak fluent bullet point."
          : notes.trim().length < 24
            ? "A little more, please. Three facts and I'm happy."
            : "Good. Keep going — one fact per line is my love language.";
  const fernandezMood = error ? "worried" : generated ? "hyped" : fileMeta ? "happy" : "idle";
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [played, setPlayed] = useState(() => loadPlayed());

  useEffect(() => {
    let active = true;
    loadNotesAsync().then((stored) => {
      if (!active) return;
      if (stored) {
        setNotes((current) => (current === initialNotesRef.current ? stored : current));
      }
      setNotesHydrated(true);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    if (!account) {
      setCloudNotesReady(true);
      return () => { active = false; };
    }
    setCloudNotesReady(false);
    void loadCloudNote().then((stored) => {
      if (!active) return;
      if (stored) {
        setNotes(stored.content);
        setTitle(stored.title);
      }
      setCloudNotesReady(true);
    }).catch((error) => {
      console.error("Could not load notes from Supabase:", error);
      if (active) setCloudNotesReady(true);
    });
    return () => { active = false; };
  }, [account?.id]);

  useEffect(() => {
    if (!notesHydrated) return;
    if (account && !cloudNotesReady) return;
    const timer = window.setTimeout(() => {
      if (account) void saveCloudNote(account.id, title, notes).catch((error) => console.error("Could not save notes to Supabase:", error));
      else saveNotes(notes);
    }, 500);
    return () => window.clearTimeout(timer);
  }, [notes, notesHydrated, account, cloudNotesReady, title]);

  useEffect(() => {
    const timer = window.setTimeout(() => saveNoteTitle(title), 350);
    return () => window.clearTimeout(timer);
  }, [title]);

  useEffect(() => {
    const refresh = () => {
      setScores(loadScores());
      setPlayed(loadPlayed());
    };
    refresh();
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);

  const bestScore = scores[0]?.score ?? 0;
  const bestStreak = scores.reduce((best, entry) => Math.max(best, entry.streak), 0);
  const runCount = Math.max(played, scores.length);

  const celebrate = () => {
    const target = document.getElementById("note-card");
    if (target) {
      const rect = target.getBoundingClientRect();
      particles.current?.burst(rect.left + rect.width / 2, rect.top + rect.height * 0.3, {
        count: 30,
        power: 430,
      });
    }
  };

  const buildDeck = (): Deck | null => {
    const result = parseNotes(notes, title);
    if (!result.ok) {
      setError(result.error);
      setGenerated(null);
      return null;
    }
    setError(null);
    setGenerated(result.deck);
    onDeckChange(result.deck);
    return result.deck;
  };

  const handleGenerate = () => {
    const deck = buildDeck();
    if (deck) {
      celebrate();
      sfx.correct(2);
    }
  };

  const handleStart = () => {
    if (activeDeck.kind === "notes") {
      onStart(activeDeck);
      return;
    }
    if (notes.trim().length >= 24) {
      const deck = buildDeck();
      if (deck) {
        onStart(deck);
        return;
      }
      document.getElementById("notes")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    onStart(activeDeck);
  };

  const loadSample = () => {
    setNotes(SAMPLE_NOTES);
    setTitle("Memory & the brain");
    setGenerated(null);
    setFileMeta(null);
    setError(null);
    setSourceTab("paste");
    const result = parseNotes(SAMPLE_NOTES, "Memory & the brain");
    if (result.ok) {
      setGenerated(result.deck);
      onDeckChange(result.deck);
    }
    sfx.tap();
  };

  const resetToSample = () => {
    setGenerated(null);
    setFileMeta(null);
    setSourceTab("paste");
    setNotes("");
    setTitle("");
    setError(null);
    saveNotes("");
    onDeckChange(SAMPLE_DECK);
    sfx.tap();
  };

  const handleClearBoard = () => {
    if (scores.length === 0) return;
    if (window.confirm("Clear every saved score on this device?")) {
      clearScores();
      window.location.reload();
    }
  };

  const handleFilesExtract = (result: FileExtraction) => {
    setNotes(result.text);
    setFileMeta(result);
    setGenerated(null);
    setError(null);
    setTitle(result.title);
    setSourceTab("paste");
    const card = document.getElementById("note-card");
    if (card) {
      const rect = card.getBoundingClientRect();
      particles.current?.burst(rect.left + rect.width / 2, rect.top + rect.height * 0.45, { count: 22, power: 380 });
    }
  };

  return (
    <div className="grain relative min-h-dvh overflow-x-hidden bg-paper">
      <SiteHeader
        account={account}
        muted={muted}
        onToggleSound={onToggleSound}
        onStart={handleStart}
        onHowTo={onHowTo}
        onSignIn={onSignIn}
        onCreate={onCreate}
        onSignOut={onSignOut}
        onScores={() => {
          sfx.tap();
          document.getElementById("scores")?.scrollIntoView({ behavior: "smooth", block: "start" });
        }}
      />

      <main className="relative">
        <section className="relative overflow-hidden border-b border-ink/10">
          <div className="pointer-events-none absolute inset-0 bg-dotgrid opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_92%)]" />
          <div
            className="pointer-events-none absolute -right-20 top-10 hidden h-[420px] w-[420px] rounded-full border-[2px] border-ink/10 lg:block"
            aria-hidden="true"
          />

          <div className="relative mx-auto grid w-full max-w-[1240px] gap-10 px-4 pb-16 pt-10 sm:px-6 sm:pt-14 lg:grid-cols-[1.06fr_0.94fr] lg:gap-12 lg:px-8 lg:pb-20 lg:pt-16">
            <div className="relative z-10 flex flex-col items-start">
              <div className="mb-6 flex animate-fade-up items-center gap-2">
                <span className="inline-flex rotate-[-1deg] items-center gap-2 rounded-full border-2 border-ink bg-lime px-3 py-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-ink shadow-[2px_2px_0_#1B1A14]">
                  <Icon name="sparkle" size={12} />
                  Notes in. Recall out.
                </span>
                <span className="hidden font-serif text-lg italic text-muted sm:inline">hosted by Fernandez</span>
              </div>

              <h1
                className="animate-fade-up font-display text-[clamp(2.85rem,7.1vw,5.4rem)] font-extrabold leading-[0.92] tracking-[-0.055em] text-ink [animation-delay:60ms]"
                style={{ animationFillMode: "both" }}
              >
                <span className="block">
                  Feed it{" "}
                  <span className="relative inline-block">
                    <span className="absolute inset-x-[-6px] bottom-[8%] h-[56%] -rotate-[1.4deg] rounded-[5px] border-2 border-ink bg-lime" />
                    <span className="relative">notes.</span>
                  </span>
                </span>
                <span className="mt-1 block">
                  Beat the{" "}
                  <span className="relative inline-block font-serif font-normal italic tracking-[-0.03em]">
                    clock.
                    <svg
                      className="absolute -bottom-2 left-0 w-full text-coral"
                      viewBox="0 0 200 14"
                      fill="none"
                      aria-hidden="true"
                    >
                      <path d="M3 9c28-6 56-7 92-4 34 2 68 3 102-2" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
                    </svg>
                  </span>
                </span>
              </h1>

              <p className="mt-7 max-w-[30rem] animate-fade-up text-pretty text-[16px] leading-relaxed text-ink/65 [animation-delay:140ms] sm:text-[17px]" style={{ animationFillMode: "both" }}>
                Paste them, upload a PDF or DOCX, or snap a photo of your notes. They become a fast, juicy quiz game — answer quick, chain combos, climb levels, and actually remember it when it counts.
              </p>

              <div className="mt-7 flex w-full animate-fade-up flex-col gap-2.5 [animation-delay:210ms] sm:w-auto sm:flex-row sm:items-center" style={{ animationFillMode: "both" }}>
                <button
                  type="button"
                  onClick={handleStart}
                  className="press group inline-flex w-full items-center justify-between gap-3 rounded-xl border-2 border-ink bg-ink px-2 py-2 pl-4 text-cream shadow-[4px_4px_0_#CBF54A] sm:w-auto"
                >
                  <span className="font-display text-[17px] font-bold tracking-tight">Start a run</span>
                  <span className="grid h-9 w-9 place-items-center rounded-lg border border-cream/20 bg-lime text-ink transition-transform group-hover:rotate-[-6deg]">
                    <Icon name="play" size={16} />
                  </span>
                </button>
                <a
                  href="#notes"
                  onClick={() => sfx.tap()}
                  className="press inline-flex w-full items-center justify-center gap-2 rounded-xl border-2 border-ink bg-card px-4 py-[13px] font-display text-[15px] font-bold text-ink shadow-hard-sm sm:w-auto"
                >
                  <Icon name="note" size={17} />
                  Build from my notes
                </a>
              </div>

              <div className="relative z-20 mt-4 flex animate-fade-up flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[10px] uppercase tracking-[0.12em] text-ink/55 [animation-delay:260ms]" style={{ animationFillMode: "both" }}>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="heart" size={12} className="text-coral" /> 3 lives
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="bolt" size={12} /> 3 right = level up
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Icon name="clock" size={12} /> {paceSeconds(pace)}s clock
                </span>
                <a
                  href="#daily"
                  onClick={() => sfx.tap()}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink/25 bg-coral/40 px-2 py-0.5 font-medium text-ink/75 transition-colors hover:border-ink hover:bg-coral/60 hover:text-ink"
                >
                  <Icon name="calendar" size={11} /> Daily drop
                </a>
              </div>

              <div className="relative z-20 mt-3 animate-fade-up [animation-delay:290ms]" style={{ animationFillMode: "both" }}>
                {account ? (
                  <button
                    type="button"
                    onClick={() => document.getElementById("scores")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                    className="group inline-flex max-w-full items-center gap-2 rounded-full border-2 border-ink/20 bg-card/70 py-1 pl-1 pr-2.5 text-left transition-colors hover:border-ink hover:bg-card"
                  >
                    <Avatar account={account} size="xs" />
                    <span className="min-w-0 truncate font-mono text-[9px] uppercase tracking-[0.1em] text-ink/65">
                      Signed in · <span className="font-semibold text-ink">{account.name}</span>
                    </span>
                    <Icon name="check" size={11} strokeWidth={3} className="shrink-0 text-ink/50" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onSignIn}
                    className="group inline-flex max-w-full items-center gap-2 rounded-full border-2 border-dashed border-ink/30 bg-card/50 px-2.5 py-1.5 text-left transition-colors hover:border-ink hover:bg-card"
                  >
                    <span className="grid h-5 w-5 place-items-center rounded-full border border-ink/30 text-ink/55">
                      <Icon name="user" size={11} />
                    </span>
                    <span className="font-mono text-[9px] uppercase tracking-[0.08em] text-ink/60">
                      Guest run · <span className="font-semibold text-ink underline decoration-dotted underline-offset-2">sign in to keep your name</span>
                    </span>
                  </button>
                )}
              </div>

              <div className="mt-3 hidden items-center gap-3 rounded-xl border-2 border-dashed border-ink/20 bg-card/60 px-3.5 py-2.5 animate-fade-up lg:flex" style={{ animationFillMode: "both" }}>
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-ink/20 bg-paper">
                  <Icon name="clock" size={15} />
                </span>
                <div className="min-w-0">
                  <p className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted">Loaded &amp; ready</p>
                  <p className="max-w-[280px] truncate font-display text-sm font-bold">
                    {activeDeck.title}{" "}
                    <span className="font-sans text-[11px] font-medium text-muted">· {activeDeck.questions.length} Qs</span>
                  </p>
                  <p className="font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
                    {paceSeconds(pace)}s per question · {PACES.find((item) => item.id === pace)?.label}
                  </p>
                </div>
              </div>

              <div className="mt-5 hidden w-full max-w-[350px] animate-fade-up [animation-delay:280ms] lg:flex" style={{ animationFillMode: "both" }}>
                <FernandezSay mood="happy" size={62} tone="lime" bubbleClassName="flex-1">
                  “I read the notes so you can take the credit. Let&apos;s begin.”
                </FernandezSay>
              </div>
            </div>

            <div className="relative z-10 animate-fade-up [animation-delay:120ms]" style={{ animationFillMode: "both" }}>
              <div className="pointer-events-none absolute -right-2 -top-4 hidden h-8 w-24 rotate-[8deg] border border-ink/25 bg-lime/80 sm:block" aria-hidden="true" />
              <div className="relative mx-auto max-w-[460px]">
                <div className="absolute inset-0 translate-x-2 translate-y-2 rotate-[1.4deg] rounded-[22px] border-2 border-ink bg-lilac" aria-hidden="true" />
                <div className="absolute inset-0 -translate-x-1.5 translate-y-3 -rotate-[0.8deg] rounded-[22px] border-2 border-ink bg-coral" aria-hidden="true" />

                <div id="note-card" className="relative rounded-[22px] border-2 border-ink bg-card p-4 shadow-[7px_7px_0_#1B1A14] sm:p-5">
                  <div className="mb-4 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-ink/70">
                      <Fernandez size={23} mood="happy" bob={false} /> Your note deck
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-ink/15 bg-paper px-2 py-1 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
                      <Icon name="lock" size={9} /> {account ? "private cloud" : "guest · this device"}
                    </span>
                  </div>

                  <label htmlFor="deck-title" className="mb-1.5 block font-mono text-[9px] uppercase tracking-[0.14em] text-muted">
                    Deck name
                  </label>
                  <input
                    id="deck-title"
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    placeholder="e.g. Biology — Chapter 4"
                    className="mb-3 w-full rounded-lg border-2 border-ink/15 bg-paper/60 px-3 py-2 font-display text-[15px] font-bold text-ink placeholder:font-sans placeholder:text-sm placeholder:font-normal placeholder:text-muted/60 focus:border-ink focus:outline-none"
                  />

                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex rounded-lg border border-ink/15 bg-paper/70 p-0.5" role="tablist" aria-label="Note source">
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sourceTab === "paste"}
                        onClick={() => setSourceTab("paste")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.08em] transition-colors",
                          sourceTab === "paste" ? "bg-ink text-cream" : "text-muted hover:text-ink",
                        )}
                      >
                        <Icon name="note" size={10} /> Paste text
                      </button>
                      <button
                        type="button"
                        role="tab"
                        aria-selected={sourceTab === "files"}
                        onClick={() => {
                          setSourceTab("files");
                          sfx.tap();
                        }}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-[9px] font-medium uppercase tracking-[0.08em] transition-colors",
                          sourceTab === "files" ? "bg-ink text-cream" : "text-muted hover:text-ink",
                        )}
                      >
                        <Icon name="upload" size={10} /> Upload
                      </button>
                    </div>
                    <span className="font-mono text-[8px] uppercase tracking-[0.08em] text-muted">
                      {sourceTab === "files" ? "documents & photos" : "no length limit"}
                    </span>
                  </div>

                  {fileMeta && sourceTab === "paste" && (
                    <div className="mb-2 flex items-center justify-between gap-2 rounded-lg border border-lime-deep/50 bg-lime/30 px-2.5 py-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full border border-ink/25 bg-lime">
                          <Icon name="check" size={10} strokeWidth={3} />
                        </span>
                        <p className="truncate text-[11px] font-semibold leading-tight">{uploadSuccessLabel(fileMeta.files)}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setFileMeta(null)}
                        aria-label="Dismiss upload confirmation"
                        className="grid h-5 w-5 shrink-0 place-items-center rounded-full hover:bg-ink/10"
                      >
                        <Icon name="close" size={10} />
                      </button>
                    </div>
                  )}

                  {sourceTab === "files" ? (
                    <div id="notes">
                      <FileImporter onExtract={handleFilesExtract} />
                      <p className="mt-2 flex items-center justify-between gap-2 font-mono text-[8px] uppercase tracking-[0.06em] text-muted">
                        <span>Upload PDFs, documents, text files or photos</span>
                        <button type="button" onClick={loadSample} className="shrink-0 underline decoration-dotted underline-offset-2 hover:text-ink">
                          use sample notes
                        </button>
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="relative">
                        <label htmlFor="notes" className="sr-only">
                          Paste your notes
                        </label>
                        <textarea
                          id="notes"
                          value={notes}
                          onChange={(event) => {
                            setNotes(event.target.value);
                            if (error) setError(null);
                          }}
                          onKeyDown={(event) => {
                            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                              event.preventDefault();
                              handleGenerate();
                            }
                          }}
                          rows={7}
                          placeholder={"Paste notes, facts, definitions — anything.\n\nThe hippocampus encodes long-term memories.\nNeuroplasticity: the brain's ability to rewire.\n\nOne fact per line works best."}
                          className="paper-lines hide-scrollbar h-[186px] w-full resize-none rounded-xl border-2 border-ink/15 bg-card/45 p-3 text-[13px] leading-[31px] text-ink placeholder:text-muted/55 focus:border-ink focus:bg-card/70 focus:outline-none focus:ring-2 focus:ring-lime"
                        />
                      </div>

                      <div className="mt-2 flex items-center justify-between font-mono text-[9px] text-muted">
                        <span>Q? → answer on the next line, or use “term: meaning”.</span>
                        <button
                          type="button"
                          onClick={loadSample}
                          className="shrink-0 font-medium uppercase tracking-[0.08em] underline decoration-dotted underline-offset-2 hover:text-ink"
                        >
                          try sample
                        </button>
                      </div>
                    </>
                  )}

                  <div className="mt-3 border-t border-ink/10 pt-3">
                    <PacePicker pace={pace} onChange={onPaceChange} />
                  </div>

                  {error && (
                    <div className="mt-3 flex animate-shake items-start gap-2 rounded-lg border-2 border-ink bg-coral/35 px-3 py-2 text-[11px] leading-snug text-ink" role="alert">
                      <Icon name="close" size={13} className="mt-0.5 shrink-0" />
                      {error}
                    </div>
                  )}

                  {generated && !error && (
                    <div className="mt-3 animate-scale-in rounded-xl border-2 border-ink bg-lime/50 p-3">
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 font-mono text-[9px] font-medium uppercase tracking-[0.13em]">
                          <Icon name="check" size={11} strokeWidth={3} /> Deck ready
                        </span>
                        <span className="rounded-full bg-ink px-2 py-0.5 font-mono text-[9px] uppercase tracking-wider text-lime">
                          {generated.questions.length} questions
                        </span>
                      </div>
                      <p className="mb-2.5 line-clamp-2 font-display text-[12px] font-semibold leading-snug text-ink/80">
                        {generated.questions[0]?.prompt}
                      </p>
                      <button
                        type="button"
                        onClick={() => onStart(generated)}
                        className="press inline-flex w-full items-center justify-between gap-2 rounded-lg border-2 border-ink bg-ink px-3 py-2 text-cream shadow-[2px_2px_0_#FFFCF2]"
                      >
                        <span className="font-display text-[13px] font-bold">Play this deck</span>
                        <Icon name="arrow" size={15} />
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={handleGenerate}
                    className="press mt-3 inline-flex w-full items-center justify-between gap-2 rounded-xl border-2 border-ink bg-card px-3.5 py-2.5 font-display text-[14px] font-bold text-ink shadow-hard-sm hover:bg-lime/50"
                  >
                    <span className="inline-flex items-center gap-2">
                      <Icon name="sparkle" size={15} />
                      {generated ? "Regenerate questions" : "Turn my notes into a quiz"}
                    </span>
                    <Icon name="arrow" size={16} />
                  </button>

                  <div
                    key={fernandezTip}
                    className="mt-2.5 flex animate-fade-in items-center gap-1.5 rounded-xl border border-ink/15 bg-sky/25 py-1 pl-1 pr-2.5"
                  >
                    <Fernandez size={34} mood={fernandezMood} />
                    <div className="min-w-0">
                      <p className="font-mono text-[8px] font-medium uppercase tracking-[0.14em] text-muted">Fernandez says</p>
                      <p className="line-clamp-2 text-[10px] font-medium leading-snug text-ink/75">{fernandezTip}</p>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-ink/10 pt-3">
                    <div className="flex min-w-0 items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted">
                      <span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", activeDeck.kind === "notes" ? "bg-lime-deep" : "bg-coral")} />
                      <span className="truncate">
                        {activeDeck.kind === "notes" ? "Loaded" : "Default"}: {activeDeck.kind === "notes" ? activeDeck.title : "random questions, never the same"} · {activeDeck.questions.length} Qs
                      </span>
                    </div>
                    {activeDeck.kind === "notes" ? (
                      <button type="button" onClick={resetToSample} className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-muted underline decoration-dotted underline-offset-2 hover:text-ink">
                        use random default
                      </button>
                    ) : (
                      <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.08em] text-muted">fresh every run</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <MarqueeStrip />

        <DailyChallenge account={account} onStartDaily={onStartDaily} />

        <section id="how" className="relative mx-auto w-full max-w-[1240px] scroll-mt-24 px-4 py-16 sm:px-6 lg:px-8 lg:py-20">
          <div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <SectionLabel className="mb-3">The loop</SectionLabel>
              <h2 className="max-w-xl font-display text-[clamp(2rem,4.2vw,3.2rem)] font-extrabold leading-[0.98] tracking-[-0.045em]">
                Notes in. <span className="font-serif font-normal italic">Recall out.</span>
              </h2>
            </div>
            <p className="max-w-[290px] text-sm leading-relaxed text-muted">
              Three moves. No setup ritual. Your notes become a game before your coffee cools.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            {STEPS.map((step, index) => (
              <article
                key={step.number}
                className={cn(
                  "group relative flex min-h-[300px] flex-col overflow-hidden rounded-[22px] border-2 border-ink p-5 shadow-[4px_4px_0_#1B1A14] transition-transform duration-200 hover:-translate-y-1 hover:rotate-[-0.35deg]",
                  step.color,
                )}
              >
                <div className="mb-3 flex items-start justify-between">
                  <span className="rounded-full border border-ink/30 bg-paper/50 px-2.5 py-1 font-mono text-[10px] font-medium uppercase tracking-[0.14em]">
                    Step {step.number}
                  </span>
                  <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-card/70">
                    <Icon name={step.icon} size={17} />
                  </span>
                </div>
                <h3 className="max-w-[230px] font-display text-[23px] font-extrabold leading-[1.02] tracking-[-0.03em]">
                  {step.title}
                </h3>
                <p className="mt-2 max-w-[290px] text-[13px] leading-relaxed text-ink/70">{step.body}</p>
                <div className="mt-auto flex justify-center pt-5">
                  {step.visual === "notes" && <NoteDoodle />}
                  {step.visual === "question" && <QuestionDoodle />}
                  {step.visual === "level" && <LevelDoodle />}
                </div>
                <span className="absolute -bottom-4 right-2 font-display text-[74px] font-extrabold leading-none text-ink/[0.06]">
                  {index + 1}
                </span>
              </article>
            ))}
          </div>
        </section>

        <section
          id="scores"
          className="relative scroll-mt-24 border-y border-ink/10 bg-[#EFE8D5] px-4 py-16 sm:px-6 lg:px-8 lg:py-20"
        >
          <div className="mx-auto w-full max-w-[1240px]">
            <div className="mb-9 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <SectionLabel className="mb-3">Personal bests</SectionLabel>
                <h2 className="max-w-xl font-display text-[clamp(2rem,4.2vw,3.2rem)] font-extrabold leading-[0.98] tracking-[-0.045em]">
                  Chase your own <span className="font-serif font-normal italic">high score.</span>
                </h2>
              </div>
              <p className="max-w-[290px] text-sm leading-relaxed text-muted">
                Saved locally, ranked forever (or until you hit reset). Your notes never leave this device.
              </p>
            </div>

            <AccountPanel
              account={account}
              scores={scores}
              onSignIn={onSignIn}
              onCreate={onCreate}
              onSignOut={onSignOut}
            />

            <div className="grid gap-4 lg:grid-cols-[1.08fr_0.92fr]">
              <div className="relative rounded-[22px] border-2 border-ink bg-card p-4 shadow-[5px_5px_0_#1B1A14] sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-9 w-9 place-items-center rounded-full border-2 border-ink bg-lime">
                      <Icon name="trophy" size={17} />
                    </span>
                    <div>
                      <p className="font-display text-[15px] font-bold leading-tight">Local legends</p>
                      <p className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">This device · top 5</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-ink/15 px-2 py-1 font-mono text-[8px] uppercase tracking-widest text-muted">
                    {account ? "profile active" : "guest board"}
                  </span>
                </div>

                <HighScoreTable entries={scores} limit={5} highlightName={account?.handle} />

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl border border-ink/15 bg-paper/70 px-2.5 py-2">
                    <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted">All-time best</p>
                    <p className="font-display text-lg font-extrabold tabular-nums">
                      <AnimatedNumber value={bestScore} />
                    </p>
                  </div>
                  <div className="rounded-xl border border-ink/15 bg-paper/70 px-2.5 py-2">
                    <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted">Runs</p>
                    <p className="font-display text-lg font-extrabold tabular-nums">{runCount}</p>
                  </div>
                  <div className="rounded-xl border border-ink/15 bg-paper/70 px-2.5 py-2">
                    <p className="font-mono text-[8px] uppercase tracking-[0.12em] text-muted">Best streak</p>
                    <p className="font-display text-lg font-extrabold tabular-nums">{bestStreak}</p>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleStart}
                    className="press inline-flex items-center gap-1.5 rounded-lg bg-ink px-3 py-2 font-display text-[12px] font-bold text-cream shadow-[2px_2px_0_#CBF54A]"
                  >
                    <Icon name="play" size={11} /> Beat it
                  </button>
                  <button
                    type="button"
                    onClick={handleClearBoard}
                    className={cn(
                      "font-mono text-[9px] uppercase tracking-[0.08em] text-muted underline decoration-dotted underline-offset-2 hover:text-ink",
                      scores.length === 0 && "pointer-events-none opacity-40",
                    )}
                  >
                    reset board
                  </button>
                </div>
              </div>

              <div className="relative overflow-hidden rounded-[22px] border-2 border-ink bg-night p-5 text-cream shadow-[5px_5px_0_#B9A6F2] sm:p-6">
                <div className="pointer-events-none absolute inset-0 bg-dotgrid-light opacity-40" />
                <div className="relative">
                  <div className="mb-4 flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 rounded-full border border-cream/30 px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.14em] text-cream/70">
                      <Icon name="bolt" size={11} className="text-lime" /> Shortcut sheet
                    </span>
                    <span className="font-serif text-lg italic text-lime">play sharp</span>
                  </div>
                  <h3 className="max-w-[260px] font-display text-[24px] font-extrabold leading-[1.02] tracking-[-0.03em]">
                    The rules, <span className="font-serif font-normal italic text-lime">quickly.</span>
                  </h3>

                  <ul className="mt-4 space-y-2.5">
                    {RULES.map((rule) => (
                      <li key={rule.text} className="flex items-start gap-2.5 text-[12px] leading-snug text-cream/70">
                        <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border border-cream/20 bg-cream/5 text-lime">
                          <Icon name={rule.icon} size={12} />
                        </span>
                        {rule.text}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5 grid grid-cols-2 gap-2">
                    {[
                      ["1", "2", "3", "4"],
                      ["Space", "P"],
                    ].map((row, rowIndex) => (
                      <div key={rowIndex} className="flex flex-wrap items-center gap-1">
                        {row.map((key) => (
                          <kbd key={key} className="rounded border border-cream/25 bg-cream/10 px-1.5 py-1 font-mono text-[9px] text-cream/80">
                            {key}
                          </kbd>
                        ))}
                        <span className="font-mono text-[8px] uppercase tracking-wider text-cream/40">
                          {rowIndex === 0 ? "answer" : "next · pause"}
                        </span>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleStart}
                    className="press mt-5 inline-flex w-full items-center justify-between gap-2 rounded-xl border-2 border-lime bg-lime px-4 py-2.5 text-ink shadow-[3px_3px_0_#FFFCF2]"
                  >
                    <span className="font-display text-[15px] font-extrabold">Protect your streak</span>
                    <Icon name="arrow" size={17} />
                  </button>
                  <p className="mt-2 text-center font-mono text-[8px] uppercase tracking-[0.1em] text-cream/35">
                    sound optional · bragging rights included
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="relative mx-auto w-full max-w-[1240px] px-4 py-14 sm:px-6 lg:px-8 lg:py-16">
          <div className="relative overflow-hidden rounded-[24px] border-2 border-ink bg-lime p-6 shadow-hard-lg sm:p-9">
            <div className="pointer-events-none absolute inset-0 bg-dotgrid opacity-30" />
            <svg className="pointer-events-none absolute -right-6 -top-8 h-40 w-40 text-ink/10" viewBox="0 0 100 100" fill="none" aria-hidden="true">
              <path d="m50 4 12 30 32 2-24 21 7 31-27-17-27 17 7-31L6 36l32-2L50 4Z" stroke="currentColor" strokeWidth="2" />
            </svg>
            <div className="relative flex flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-ink/60">Ready when you are</p>
                <h2 className="font-display text-[clamp(1.9rem,4vw,3rem)] font-extrabold leading-[0.96] tracking-[-0.045em]">
                  Your notes called. <span className="font-serif font-normal italic">They want a rematch.</span>
                </h2>
              </div>
              <button
                type="button"
                onClick={handleStart}
                className="press inline-flex shrink-0 items-center gap-3 rounded-xl border-2 border-ink bg-ink px-4 py-3 text-cream shadow-[4px_4px_0_#FFFCF2]"
              >
                <span className="font-display text-base font-bold">Run it back</span>
                <span className="grid h-7 w-7 place-items-center rounded-full bg-lime text-ink">
                  <Icon name="play" size={13} />
                </span>
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-ink/15 px-4 pb-8 pt-7 sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <Logo />
          <p className="max-w-[330px] text-xs leading-relaxed text-muted">
            Written and hosted by <span className="font-semibold text-ink">Fernandez</span>, for people with 47 tabs open. Made to turn passive reading into active recall.
          </p>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
            <a href="#how" className="hover:text-ink">How it works</a>
            <a href="#scores" className="hover:text-ink">High scores</a>
            <button type="button" onClick={onHowTo} className="uppercase tracking-[0.1em] hover:text-ink">Rules</button>
            <span className="text-ink/30">© {new Date().getFullYear()} Recall</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
