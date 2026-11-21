import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, CheckCircle2, Circle, Cpu, Plus, Sparkles, Target, Trash2, X } from "lucide-react";
import { dayKey, useCollection } from "@/data/db";
import type { Artifact, Attempt, Flashcard, Folder, Goal, GuideData, PlanTask, StudyDocument, TopicProgress } from "@/data/models";
import { createGoal, createTask, db, toggleTask } from "@/data/repos";
import { buildLocalPlan, type PlanItem } from "@/lib/learning/planner";
import { classifyTopics, topicStats } from "@/lib/learning/insights";
import { generateWithAi, useAiStatus } from "@/services/ai";
import type { GeneratedPlanTask } from "@/lib/ai/contract";
import { formatMinutes } from "@/lib/hooks";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/Button";
import { Badge, Card, Chips, EmptyState, Field, Input, PageHeader, ProgressBar, Select } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Overlay";
import { confirmAction } from "@/components/ui/Confirm";
import { toast } from "@/components/ui/Toast";

const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return dayKey(d);
};

function GoalDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const folders = useCollection<Folder>("folders");
  const documents = useCollection<StudyDocument>("documents").filter((d) => d.status === "ready");
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("");
  const [targetDate, setTargetDate] = useState(inDays(14));
  const [minutes, setMinutes] = useState(45);
  const [docIds, setDocIds] = useState<string[]>([]);
  const valid = title.trim() && targetDate >= dayKey();
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New study goal"
      description="For example: “Pass the Network Security exam”."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={!valid}
            onClick={() => {
              createGoal({ title: title.trim(), subject: folders.find((f) => f.id === subject)?.name ?? subject, targetDate, dailyMinutes: minutes, docIds, deckIds: [] });
              toast("Goal created", { description: "Now build a plan for it." });
              setTitle("");
              setDocIds([]);
              onClose();
            }}
          >
            Create goal
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Goal">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Pass my final exam" data-autofocus />}</Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Subject">
            {(id) => (
              <Select id={id} value={subject} onChange={(e) => setSubject(e.target.value)}>
                <option value="">General</option>
                {folders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Target date">{(id) => <Input id={id} type="date" min={dayKey()} value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />}</Field>
        </div>
        <div>
          <p className="mb-2 text-[13px] font-medium">Time per day</p>
          <Chips label="Time per day" value={minutes} onChange={(v) => setMinutes(v as number)} options={[20, 30, 45, 60, 90].map((v) => ({ value: v, label: `${v}m` }))} />
        </div>
        {documents.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-medium">Study material</p>
            <div className="max-h-40 space-y-1.5 overflow-y-auto">
              {documents.map((doc) => {
                const on = docIds.includes(doc.id);
                return (
                  <button key={doc.id} type="button" aria-pressed={on} onClick={() => setDocIds((list) => (on ? list.filter((x) => x !== doc.id) : [...list, doc.id]))} className={cn("flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-sm", on ? "border-accent bg-accent-softer" : "border-border")}>
                    {on ? <CheckCircle2 className="h-4 w-4 text-accent-text" /> : <Circle className="h-4 w-4 text-border-strong" />}
                    <span className="truncate">{doc.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}

function PlanBuilder({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const ai = useAiStatus();
  const artifacts = useCollection<Artifact>("artifacts");
  const progress = useCollection<TopicProgress>("topicProgress");
  const attempts = useCollection<Attempt>("attempts");
  const cards = useCollection<Flashcard>("cards");
  const documents = useCollection<StudyDocument>("documents");
  const [items, setItems] = useState<PlanItem[] | null>(null);
  const [rationale, setRationale] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputs = useMemo(() => {
    if (!goal) return null;
    const topics = goal.docIds.flatMap((docId) => {
      const guide = artifacts.find((a) => a.id === `${docId}:guide`)?.data as GuideData | undefined;
      const doc = documents.find((d) => d.id === docId);
      if (!guide) return doc ? [{ title: `Read and summarise ${doc.title}`, minutes: 30, link: `/study/${docId}?tab=summary` }] : [];
      return guide.topics.filter((t) => !progress.some((p) => p.id === `${docId}:${t.id}`)).map((t) => ({ title: t.title, minutes: t.estimatedMinutes, link: `/study/${docId}?tab=guide` }));
    });
    const weak = classifyTopics(topicStats(attempts.filter((a) => !goal.docIds.length || (a.docId && goal.docIds.includes(a.docId))))).weak.map((w) => ({ title: w.topic, link: w.docId ? `/study/${w.docId}?tab=practice&topic=${encodeURIComponent(w.topic)}` : "/quiz" }));
    return { topics, weak, hasFlashcards: cards.length > 0 };
  }, [goal, artifacts, progress, attempts, cards, documents]);

  const local = () => {
    if (!goal || !inputs) return;
    setRationale("Built on this device: weak topics first, remaining study-guide topics spread across the days, daily flashcard review, and a practice exam on the last day.");
    setItems(buildLocalPlan({ today: new Date(), targetDate: goal.targetDate, dailyMinutes: goal.dailyMinutes, topics: inputs.topics, weakTopics: inputs.weak, hasFlashcards: inputs.hasFlashcards }));
  };

  const withAi = async () => {
    if (!goal || !inputs) return;
    setBusy(true);
    setError(null);
    try {
      const result = await generateWithAi<{ tasks: GeneratedPlanTask[]; rationale: string }>({
        task: "plan",
        options: { plan: { goal: goal.title, subject: goal.subject || "General", today: dayKey(), targetDate: goal.targetDate, dailyMinutes: goal.dailyMinutes, topicsRemaining: inputs.topics.map((t) => t.title), weakTopics: inputs.weak.map((w) => w.title) } },
      });
      setRationale(result.rationale);
      setItems(result.tasks.filter((t) => /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.date >= dayKey() && t.date <= goal.targetDate).map((t) => ({ date: t.date, title: t.title, minutes: Math.max(5, Math.min(goal.dailyMinutes, t.minutes)) })));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Couldn't build a plan.");
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setItems(null);
    setRationale(null);
    setError(null);
    onClose();
  };

  return (
    <Modal
      open={Boolean(goal)}
      onClose={close}
      size="lg"
      title={items ? "Review your plan" : "Build a study plan"}
      description={goal ? `${goal.title} · by ${new Date(goal.targetDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })} · ${goal.dailyMinutes} min/day` : undefined}
      footer={
        items ? (
          <>
            <Button variant="secondary" onClick={() => setItems(null)}>
              Back
            </Button>
            <Button
              disabled={!items.length}
              onClick={() => {
                if (!goal) return;
                db.tasks.removeWhere((t) => t.goalId === goal.id && !t.done);
                items.forEach((item) => createTask({ goalId: goal.id, title: item.title, date: item.date, minutes: item.minutes, link: item.link }));
                toast("Plan saved", { description: `${items.length} tasks added to your planner` });
                close();
              }}
            >
              Save {items.length} tasks
            </Button>
          </>
        ) : undefined
      }
    >
      {!items ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-surface-2 p-4 text-sm text-muted">
            {inputs?.topics.length ? `${inputs.topics.length} topic${inputs.topics.length === 1 ? "" : "s"} still to cover` : "No study-guide topics linked yet — link documents with a study guide for a richer plan"}
            {inputs?.weak.length ? ` · ${inputs.weak.length} weak topic${inputs.weak.length === 1 ? "" : "s"} detected` : ""}.
          </div>
          {error && <p className="rounded-xl bg-danger-soft p-3 text-sm text-danger">{error}</p>}
          <div className="grid gap-2 sm:grid-cols-2">
            {ai?.configured && (
              <button type="button" onClick={() => void withAi()} disabled={busy} className="card card-interactive flex items-start gap-3 p-4 text-left disabled:opacity-60">
                <Sparkles className="mt-0.5 h-5 w-5 text-accent-text" />
                <span>
                  <span className="block text-sm font-semibold">{busy ? "Recall AI is planning…" : "Recommend with Recall AI"}</span>
                  <span className="text-xs text-subtle">Uses your topics, weak areas, time and exam date.</span>
                </span>
              </button>
            )}
            <button type="button" onClick={local} className="card card-interactive flex items-start gap-3 p-4 text-left">
              <Cpu className="mt-0.5 h-5 w-5 text-subtle" />
              <span>
                <span className="block text-sm font-semibold">Quick schedule</span>
                <span className="text-xs text-subtle">Rule-based, built instantly on this device.</span>
              </span>
            </button>
          </div>
        </div>
      ) : (
        <div>
          {rationale && <p className="mb-4 text-sm leading-relaxed text-muted">{rationale}</p>}
          {!items.length && <p className="text-sm text-subtle">No tasks could be scheduled before the target date.</p>}
          <ul className="space-y-1.5">
            {items.map((item, index) => (
              <li key={index} className="flex items-center gap-2 rounded-xl border border-border p-2">
                <input type="date" value={item.date} min={dayKey()} max={goal?.targetDate} onChange={(e) => setItems((list) => list!.map((x, i) => (i === index ? { ...x, date: e.target.value } : x)))} className="tabular w-[8.5rem] shrink-0 rounded-lg bg-surface-2 px-2 py-1.5 text-xs" aria-label="Task date" />
                <input value={item.title} onChange={(e) => setItems((list) => list!.map((x, i) => (i === index ? { ...x, title: e.target.value } : x)))} className="min-w-0 flex-1 bg-transparent text-sm focus:outline-none" aria-label="Task title" />
                <span className="tabular shrink-0 text-xs text-subtle">{item.minutes}m</span>
                <button type="button" onClick={() => setItems((list) => list!.filter((_, i) => i !== index))} className="rounded-lg p-1 text-subtle hover:text-danger" aria-label="Remove task">
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Modal>
  );
}

function TaskRow({ task, goal }: { task: PlanTask; goal?: Goal }) {
  return (
    <motion.li layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, height: 0 }} className="group flex items-center gap-3 px-4 py-3">
      <button type="button" onClick={() => toggleTask(task.id)} aria-pressed={task.done} aria-label={task.done ? "Mark as not done" : "Mark as done"}>
        {task.done ? (
          <motion.span initial={{ scale: 0.6 }} animate={{ scale: 1 }} className="block">
            <CheckCircle2 className="h-5 w-5 text-success" />
          </motion.span>
        ) : (
          <Circle className="h-5 w-5 text-border-strong hover:text-accent" />
        )}
      </button>
      <span className="min-w-0 flex-1">
        {task.link && !task.done ? (
          <Link to={task.link} className="block truncate text-sm hover:text-accent-text">
            {task.title}
          </Link>
        ) : (
          <span className={cn("block truncate text-sm", task.done && "text-subtle line-through")}>{task.title}</span>
        )}
        {goal && <span className="block truncate text-xs text-subtle">{goal.title}</span>}
      </span>
      {task.minutes ? <span className="tabular shrink-0 text-xs text-subtle">{task.minutes}m</span> : null}
      <button type="button" onClick={() => db.tasks.remove(task.id)} className="rounded-lg p-1 text-subtle opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100" aria-label="Delete task">
        <Trash2 className="h-4 w-4" />
      </button>
    </motion.li>
  );
}

export default function Planner() {
  const goals = useCollection<Goal>("goals").filter((g) => !g.archived);
  const tasks = useCollection<PlanTask>("tasks");
  const [goalOpen, setGoalOpen] = useState(false);
  const [planning, setPlanning] = useState<Goal | null>(null);
  const [newTask, setNewTask] = useState("");
  const today = dayKey();
  const weekEnd = inDays(7);
  const sorted = [...tasks].sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
  const groups = [
    { label: "Overdue", items: sorted.filter((t) => t.date < today && !t.done) },
    { label: "Today", items: sorted.filter((t) => t.date === today) },
    { label: "This week", items: sorted.filter((t) => t.date > today && t.date <= weekEnd) },
    { label: "Later", items: sorted.filter((t) => t.date > weekEnd) },
  ].filter((g) => g.items.length);

  return (
    <div>
      <PageHeader
        title="Study planner"
        description="Set goals, get a realistic schedule, and tick off tasks."
        actions={
          <Button onClick={() => setGoalOpen(true)} icon={<Plus className="h-4 w-4" />}>
            New goal
          </Button>
        }
      />
      {goals.length === 0 && tasks.length === 0 ? (
        <EmptyState icon={<CalendarDays className="h-6 w-6" />} title="Plan your revision" description="Create a goal with a target date. Recall schedules your remaining topics, weak areas and flashcard reviews around the time you have." action={<Button onClick={() => setGoalOpen(true)}>Create a goal</Button>} />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
          <div className="space-y-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTask.trim()) return;
                createTask({ goalId: null, title: newTask.trim(), date: today });
                setNewTask("");
              }}
              className="flex gap-2"
            >
              <Input value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder="Add a task for today" aria-label="New task" />
              <Button type="submit" variant="secondary" disabled={!newTask.trim()}>
                Add
              </Button>
            </form>
            {groups.length === 0 && <p className="py-6 text-center text-sm text-subtle">No tasks yet — build a plan from one of your goals.</p>}
            {groups.map((group) => (
              <Card key={group.label} className="overflow-hidden">
                <p className={cn("border-b border-border px-4 py-2.5 text-xs font-semibold", group.label === "Overdue" ? "text-danger" : "text-muted")}>
                  {group.label} · {group.items.filter((t) => !t.done).length} open
                </p>
                <ul className="divide-y divide-border">
                  <AnimatePresence initial={false}>
                    {group.items.slice(0, group.label === "Later" ? 15 : 50).map((task) => (
                      <TaskRow key={task.id} task={task} goal={goals.find((g) => g.id === task.goalId)} />
                    ))}
                  </AnimatePresence>
                </ul>
              </Card>
            ))}
          </div>
          <div className="space-y-3">
            <p className="px-1 text-sm font-semibold text-muted">Goals</p>
            {goals.map((goal) => {
              const own = tasks.filter((t) => t.goalId === goal.id);
              const done = own.filter((t) => t.done).length;
              const daysLeft = Math.ceil((new Date(goal.targetDate).getTime() - new Date(today).getTime()) / 86_400_000);
              return (
                <Card key={goal.id} className="p-5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug">{goal.title}</p>
                      <p className="mt-0.5 text-xs text-subtle">
                        {goal.subject || "General"} · {formatMinutes(goal.dailyMinutes)}/day
                      </p>
                    </div>
                    <Badge tone={daysLeft <= 3 ? "danger" : daysLeft <= 7 ? "warning" : "neutral"}>{daysLeft < 0 ? "Past" : daysLeft === 0 ? "Today" : `${daysLeft}d left`}</Badge>
                  </div>
                  {own.length > 0 && (
                    <>
                      <ProgressBar value={done / own.length} className="mt-4" />
                      <p className="tabular mt-1.5 text-xs text-subtle">
                        {done}/{own.length} tasks done
                      </p>
                    </>
                  )}
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="soft" icon={<Target className="h-3.5 w-3.5" />} onClick={() => setPlanning(goal)}>
                      {own.length ? "Re-plan" : "Build plan"}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        if (await confirmAction({ title: `Archive “${goal.title}”?`, description: "Its open tasks are removed.", confirmLabel: "Archive" })) {
                          db.tasks.removeWhere((t) => t.goalId === goal.id && !t.done);
                          db.goals.patch(goal.id, { archived: true });
                        }
                      }}
                    >
                      Archive
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}
      <GoalDialog open={goalOpen} onClose={() => setGoalOpen(false)} />
      <PlanBuilder goal={planning} onClose={() => setPlanning(null)} />
    </div>
  );
}
