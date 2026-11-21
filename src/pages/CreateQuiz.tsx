import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { CheckCircle2, Cpu, FileUp, GripVertical, Loader2, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { useAccount } from "@/app/account";
import { createDeck, updateDeck } from "@/data/repos";
import { parseNotes } from "@/lib/game/parseNotes";
import type { Question, QuestionType } from "@/lib/game/types";
import { extractFiles } from "@/lib/game/files";
import { loadNotes, loadNotesAsync, loadNoteTitle, saveNotes, saveNoteTitle } from "@/lib/game/storage";
import { loadCloudNote, saveCloudDeck, saveCloudNote, uploadStudyFiles } from "@/services/cloud";
import { generateWithAi, useAiStatus } from "@/services/ai";
import type { GeneratedQuestion, QuestionTypeOption } from "@/lib/ai/contract";
import { toQuestion } from "@/lib/study/generate";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Card, Chips, Field, Input, PageHeader, Select, Textarea } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/Tabs";
import { toast } from "@/components/ui/Toast";

const SAMPLE_NOTES = `The hippocampus encodes new long-term memories.
Neuroplasticity: the brain's ability to rewire its connections.
REM sleep supports memory consolidation.
Spaced repetition: spreading reviews over time beats cramming.
What is active recall?
Retrieving information from memory without looking.
Dopamine is linked to reward, motivation and learning.`;

function FromNotes() {
  const navigate = useNavigate();
  const { account } = useAccount();
  const ai = useAiStatus();
  const initialRef = useRef(loadNotes());
  const [notes, setNotes] = useState(initialRef.current);
  const [title, setTitle] = useState(() => loadNoteTitle());
  const [hydrated, setHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"files" | "ai" | null>(null);
  const [result, setResult] = useState<{ deckId: string; count: number; source: "ai" | "local"; questions: Question[] } | null>(null);
  const [count, setCount] = useState(15);
  const [types, setTypes] = useState<QuestionTypeOption[]>(["mcq", "tf", "fill", "short"]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  // Restore draft (local, large-note storage, or Supabase when signed in) — original behaviour.
  useEffect(() => {
    let active = true;
    void loadNotesAsync().then((stored) => {
      if (!active) return;
      if (stored) setNotes((current) => (current === initialRef.current ? stored : current));
      setHydrated(true);
    });
    if (account) {
      void loadCloudNote()
        .then((cloud) => {
          if (active && cloud) {
            setNotes(cloud.content);
            setTitle(cloud.title);
          }
        })
        .catch((e) => console.error("Could not load notes from Supabase:", e));
    }
    return () => {
      active = false;
    };
  }, [account]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      saveNotes(notes);
      saveNoteTitle(title);
      if (account) void saveCloudNote(account.id, title, notes).catch((e) => console.error("Could not save notes to Supabase:", e));
    }, 500);
    return () => window.clearTimeout(timer);
  }, [notes, title, hydrated, account]);

  const handleFiles = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy("files");
    setError(null);
    try {
      const extracted = await extractFiles(Array.from(list));
      if (account) {
        const accepted = new Set(extracted.files.map((f) => f.name));
        await uploadStudyFiles(account.id, Array.from(list).filter((f) => accepted.has(f.name))).catch((e) => console.error("Cloud upload failed:", e));
      }
      setNotes(extracted.text);
      if (!title.trim()) setTitle(extracted.title);
      toast(extracted.files.length === 1 ? "File imported" : `${extracted.files.length} files imported`, { description: "Review the text, then generate your quiz." });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That file couldn't be read.");
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const save = (questions: Question[], source: "ai" | "local") => {
    const deck = createDeck({ title: title.trim() || "My notes", kind: "notes", questions, source });
    if (account) {
      void saveCloudDeck({ title: deck.title, kind: "notes", questions })
        .then((row) => updateDeck(deck.id, { cloudId: row.id }))
        .catch((e) => {
          console.error("Could not save deck history:", e);
          toast("Saved on this device", { tone: "info", description: "We couldn't sync this deck to your account." });
        });
    }
    setResult({ deckId: deck.id, count: questions.length, source, questions });
  };

  const generateLocal = () => {
    const parsed = parseNotes(notes, title);
    if (!parsed.ok) {
      setError(parsed.error);
      return;
    }
    setError(null);
    save(parsed.deck.questions, "local");
  };

  const generateAi = async () => {
    if (notes.trim().length < 40) {
      setError("Add a little more text first — a few sentences or definitions.");
      return;
    }
    setBusy("ai");
    setError(null);
    try {
      const response = await generateWithAi<{ questions: GeneratedQuestion[] }>({
        task: "questions",
        document: { title: title || "Notes", text: notes.slice(0, 200_000), truncated: notes.length > 200_000 },
        options: { count, types, difficulty: "mixed" },
      });
      const questions = response.questions.map((q, i) => toQuestion(q, i, "ai", 0)).filter((q): q is Question => Boolean(q));
      if (!questions.length) throw new Error("No usable questions were generated.");
      save(questions, "ai");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Generation failed.");
    } finally {
      setBusy(null);
    }
  };

  if (result) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}>
        <Card className="p-6 text-center sm:p-10">
          <motion.span initial={{ scale: 0.5, rotate: -10 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: "spring", damping: 12 }} className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-success-soft text-success">
            <CheckCircle2 className="h-7 w-7" />
          </motion.span>
          <h2 className="mt-4 text-xl font-semibold">{result.count} questions ready</h2>
          <p className="mt-1 text-sm text-muted">
            Saved to My Decks as “{title.trim() || "My notes"}” · {result.source === "ai" ? "written by Recall AI" : "built from your notes on this device"}
          </p>
          <p className="mx-auto mt-4 max-w-md rounded-xl bg-surface-2 p-3 text-left text-sm">
            <span className="text-subtle">First question: </span>
            {result.questions[0]?.prompt}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={() => navigate(`/quiz/practice/${result.deckId}`)}>Practise now</Button>
            <Button variant="secondary" onClick={() => navigate(`/quiz/arcade?deck=${result.deckId}`)}>
              Play arcade
            </Button>
            <Button variant="ghost" onClick={() => navigate(`/decks/${result.deckId}`)}>
              View deck
            </Button>
          </div>
          <button type="button" onClick={() => setResult(null)} className="mt-4 text-sm text-muted hover:text-text">
            Create another
          </button>
        </Card>
      </motion.div>
    );
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-4">
          <Field label="Deck name">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Biology — Chapter 4" />}</Field>
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label htmlFor="notes" className="text-[13px] font-medium">
                Your notes
              </label>
              <button type="button" onClick={() => setNotes(SAMPLE_NOTES)} className="text-xs text-muted hover:text-text">
                Try sample notes
              </button>
            </div>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
                setError(null);
              }}
              rows={12}
              placeholder={"Paste notes, facts or definitions.\n\nNeuroplasticity: the brain's ability to rewire.\nWhat is active recall?\nRetrieving information without looking.\n\nOne fact per line works best."}
              className="min-h-[260px] font-[450]"
            />
            <p className="mt-1.5 text-xs text-subtle">Tip: write “Term: meaning” or put a question on one line and its answer on the next. Drafts save automatically.</p>
          </div>
          <input ref={fileRef} type="file" multiple accept=".pdf,.docx,.txt,.md,.markdown,.csv,.tsv,.json,.rtf,.html,.xml,.yaml,.yml,.log,application/pdf,image/*" className="sr-only" onChange={(e) => void handleFiles(e.target.files)} aria-label="Import files" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy === "files"}
            className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-border-strong px-4 py-4 text-sm text-muted transition-colors hover:border-accent hover:text-accent-text disabled:opacity-60"
          >
            {busy === "files" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
            {busy === "files" ? "Reading your files…" : "Import PDF, Word, text or a photo of your notes"}
          </button>
        </div>
      </Card>

      <div className="space-y-4">
        {ai?.configured && (
          <Card className="p-5">
            <p className="mb-3 text-sm font-semibold">Recall AI options</p>
            <p className="mb-2 text-xs text-muted">Questions</p>
            <Chips label="Number of questions" value={count} onChange={(v) => setCount(v as number)} options={[10, 15, 20, 30].map((v) => ({ value: v, label: String(v) }))} />
            <p className="mb-2 mt-4 text-xs text-muted">Types</p>
            <Chips label="Question types" multiple value={types} onChange={(v) => setTypes(v as QuestionTypeOption[])} options={[{ value: "mcq", label: "MCQ" }, { value: "tf", label: "True/false" }, { value: "fill", label: "Fill blank" }, { value: "short", label: "Short" }]} />
          </Card>
        )}
        <AnimatePresence>
          {error && (
            <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} role="alert" className="flex gap-2 rounded-2xl bg-danger-soft p-3.5 text-sm text-danger">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" /> {error}
            </motion.p>
          )}
        </AnimatePresence>
        <div className="flex flex-col gap-2">
          {ai?.configured && (
            <Button size="lg" onClick={() => void generateAi()} loading={busy === "ai"} icon={<Sparkles className="h-4 w-4" />} disabled={!notes.trim()}>
              Generate with Recall AI
            </Button>
          )}
          <Button size="lg" variant={ai?.configured ? "secondary" : "primary"} onClick={generateLocal} disabled={!notes.trim() || busy === "ai"} icon={<Cpu className="h-4 w-4" />}>
            {ai?.configured ? "Quick generate (offline)" : "Turn notes into a quiz"}
          </Button>
          <p className="text-center text-xs text-subtle">{ai?.configured ? "Offline mode builds multiple-choice questions from definitions and facts." : "Builds multiple-choice questions from your definitions and facts, on this device."}</p>
        </div>
      </div>
    </div>
  );
}

type Draft = { id: string; type: QuestionType; prompt: string; options: string[]; answer: number; answerText: string; explanation: string; topic: string };
const blank = (): Draft => ({ id: Math.random().toString(36).slice(2), type: "mcq", prompt: "", options: ["", "", "", ""], answer: 0, answerText: "", explanation: "", topic: "" });

function validDraft(d: Draft): boolean {
  if (!d.prompt.trim()) return false;
  if (d.type === "mcq") return d.options.filter((o) => o.trim()).length >= 2 && Boolean(d.options[d.answer]?.trim());
  if (d.type === "tf") return d.answer === 0 || d.answer === 1;
  return Boolean(d.answerText.trim());
}

function Manual() {
  const navigate = useNavigate();
  const { account } = useAccount();
  const [title, setTitle] = useState("");
  const [drafts, setDrafts] = useState<Draft[]>([blank()]);
  const update = (id: string, changes: Partial<Draft>) => setDrafts((list) => list.map((d) => (d.id === id ? { ...d, ...changes } : d)));
  const ready = drafts.filter(validDraft);

  const save = () => {
    const questions: Question[] = ready.map((d, index) => {
      const options = d.type === "mcq" ? d.options.map((o) => o.trim()).filter(Boolean) : d.type === "tf" ? ["True", "False"] : [];
      const answer = d.type === "mcq" ? options.indexOf(d.options[d.answer].trim()) : d.type === "tf" ? d.answer : -1;
      return {
        id: `manual-${index}-${d.id}`,
        type: d.type,
        prompt: d.prompt.trim(),
        options,
        answer,
        answerText: d.type === "short" || d.type === "fill" ? d.answerText.trim() : options[answer],
        explanation: d.explanation.trim(),
        category: d.topic.trim() || "General",
        topic: d.topic.trim() || "General",
      };
    });
    const deck = createDeck({ title: title.trim() || "My questions", kind: "manual", questions });
    if (account) void saveCloudDeck({ title: deck.title, kind: "manual", questions }).then((row) => updateDeck(deck.id, { cloudId: row.id })).catch(() => undefined);
    toast("Deck saved", { description: `${questions.length} questions` });
    navigate(`/decks/${deck.id}`);
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <Field label="Deck name">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Network security revision" />}</Field>
      </Card>
      <AnimatePresence initial={false}>
        {drafts.map((d, index) => (
          <motion.div key={d.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}>
            <Card className="p-5">
              <div className="mb-4 flex items-center gap-2">
                <GripVertical className="h-4 w-4 text-subtle" />
                <span className="text-sm font-semibold">Question {index + 1}</span>
                <Select value={d.type} onChange={(e) => update(d.id, { type: e.target.value as QuestionType, answer: 0 })} aria-label="Question type" className="ml-auto h-9 w-auto text-sm">
                  <option value="mcq">Multiple choice</option>
                  <option value="tf">True / false</option>
                  <option value="short">Short answer</option>
                  <option value="fill">Fill in the blank</option>
                </Select>
                <Button variant="ghost" size="icon-sm" onClick={() => setDrafts((list) => (list.length > 1 ? list.filter((x) => x.id !== d.id) : list))} aria-label={`Remove question ${index + 1}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="space-y-3">
                <Textarea value={d.prompt} onChange={(e) => update(d.id, { prompt: e.target.value })} rows={2} placeholder={d.type === "fill" ? "Use _____ for the missing word" : "Question"} aria-label="Question" />
                {d.type === "mcq" && (
                  <div className="space-y-2" role="radiogroup" aria-label="Options — select the correct one">
                    {d.options.map((option, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <button type="button" role="radio" aria-checked={d.answer === i} onClick={() => update(d.id, { answer: i })} aria-label={`Mark option ${i + 1} correct`} className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", d.answer === i ? "border-success bg-success" : "border-border-strong")}>
                          {d.answer === i && <span className="h-2 w-2 rounded-full bg-white" />}
                        </button>
                        <Input value={option} onChange={(e) => update(d.id, { options: d.options.map((o, j) => (j === i ? e.target.value : o)) })} placeholder={`Option ${i + 1}`} className="h-10" />
                      </div>
                    ))}
                  </div>
                )}
                {d.type === "tf" && <Segmented label="Correct answer" value={String(d.answer)} onChange={(v) => update(d.id, { answer: Number(v) })} items={[{ id: "0", label: "True" }, { id: "1", label: "False" }]} />}
                {(d.type === "short" || d.type === "fill") && <Input value={d.answerText} onChange={(e) => update(d.id, { answerText: e.target.value })} placeholder={d.type === "fill" ? "Missing word or phrase" : "Model answer"} aria-label="Answer" />}
                <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
                  <Input value={d.explanation} onChange={(e) => update(d.id, { explanation: e.target.value })} placeholder="Explanation (optional)" aria-label="Explanation" className="h-10" />
                  <Input value={d.topic} onChange={(e) => update(d.id, { topic: e.target.value })} placeholder="Topic (optional)" aria-label="Topic" className="h-10" />
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </AnimatePresence>
      <div className="flex flex-col gap-2 sm:flex-row sm:justify-between">
        <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => setDrafts((list) => [...list, blank()])}>
          Add question
        </Button>
        <Button onClick={save} disabled={!ready.length}>
          Save deck ({ready.length} question{ready.length === 1 ? "" : "s"})
        </Button>
      </div>
    </div>
  );
}

export default function CreateQuiz() {
  const [params, setParams] = useSearchParams();
  const mode = params.get("mode") === "manual" ? "manual" : "notes";
  return (
    <div>
      <PageHeader eyebrow="Quiz" title="Create a quiz" description={mode === "notes" ? "Turn your notes or files into practice questions." : "Write questions by hand — any type."} />
      <Segmented label="Creation method" value={mode} onChange={(value) => setParams({ mode: value }, { replace: true })} className="mb-5" items={[{ id: "notes", label: "From notes" }, { id: "manual", label: "Write manually" }]} />
      {mode === "notes" ? <FromNotes /> : <Manual />}
    </div>
  );
}
