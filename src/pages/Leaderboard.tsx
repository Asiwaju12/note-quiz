import { useEffect, useState } from "react";
import { CalendarDays, RefreshCw, Timer, Trophy } from "lucide-react";
import { useAccount } from "@/app/account";
import type { ScoreEntry } from "@/lib/game/types";
import { clearScores, loadScores } from "@/lib/game/storage";
import { dayLabel } from "@/lib/game/daily";
import { clearCloudScores, migrateLocalScores } from "@/services/cloud";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Badge, Card, PageHeader } from "@/components/ui/primitives";
import { Segmented } from "@/components/ui/Tabs";
import { DailyBoardList, ScoreTable, useDailyBoard } from "@/components/quiz/Boards";
import { confirmAction } from "@/components/ui/Confirm";

export default function Leaderboard() {
  const { account, mode, openAuth } = useAccount();
  const [view, setView] = useState<"daily" | "arcade">("daily");
  const { date, board, loading, reset, refresh } = useDailyBoard();
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());

  useEffect(() => {
    if (!account) return setScores(loadScores());
    void migrateLocalScores(account.id, account.handle).then(setScores).catch((e) => console.error("Could not load cloud scores:", e));
  }, [account]);

  return (
    <div>
      <PageHeader title="Leaderboard" description="Compete on the Daily Drop and chase your arcade high score." />
      <Segmented label="Board" value={view} onChange={setView} className="mb-5" items={[{ id: "daily", label: "Daily Drop" }, { id: "arcade", label: "Arcade high scores" }]} />
      {view === "daily" ? (
        <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">{dayLabel(date)}</p>
                <p className="text-xs text-subtle">{board?.online ? "Shared board" : "This device (shared board unavailable)"}</p>
              </div>
              <Button variant="ghost" size="icon-sm" onClick={() => void refresh()} aria-label="Refresh leaderboard">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
            <DailyBoardList board={board} loading={loading} limit={25} highlightHandle={account?.handle} highlightId={account?.id} />
          </Card>
          <div className="space-y-4">
            <Card className="p-5">
              <CalendarDays className="h-5 w-5 text-accent-text" />
              <p className="mt-3 font-semibold">Today's Daily Drop</p>
              <p className="mt-1 text-sm text-muted">Eight questions, the same for everyone. Your best score counts.</p>
              <p className="tabular mt-3 inline-flex items-center gap-1.5 text-xs text-subtle">
                <Timer className="h-3.5 w-3.5" /> New questions in {reset}
              </p>
              <ButtonLink to="/quiz/arcade?daily=1" className="mt-4 w-full">
                Play now
              </ButtonLink>
            </Card>
            {mode === "local" ? (
              <p className="rounded-2xl bg-surface-2 p-4 text-xs leading-relaxed text-muted">
                <Badge tone="warning" className="mb-2">Local mode</Badge>
                <br />
                Scores are saved on this device. The shared online board needs the account backend (Supabase) to be connected.
              </p>
            ) : (
              !account && (
                <Button variant="secondary" className="w-full" onClick={() => openAuth("signin")}>
                  Sign in to join the shared board
                </Button>
              )
            )}
          </div>
        </div>
      ) : (
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <p className="flex items-center gap-2 text-sm font-semibold">
              <Trophy className="h-4 w-4 text-warning" /> {account ? "Your account's best runs" : "Best runs on this device"}
            </p>
            {scores.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  if (!(await confirmAction({ title: "Reset high scores?", description: account ? "Clears your saved arcade scores from your account." : "Clears every arcade score saved on this device.", confirmLabel: "Reset", danger: true }))) return;
                  if (account) await clearCloudScores();
                  else clearScores();
                  setScores([]);
                }}
              >
                Reset
              </Button>
            )}
          </div>
          <ScoreTable entries={scores} highlightName={account?.handle} limit={10} />
          <ButtonLink to="/quiz" variant="secondary" className="mt-5">
            Play arcade
          </ButtonLink>
        </Card>
      )}
    </div>
  );
}
