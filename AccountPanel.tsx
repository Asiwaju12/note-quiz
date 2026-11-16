import type { PublicAccount } from "@/game/auth";
import type { ScoreEntry } from "@/game/types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icons";

export function AccountPanel({
  account,
  scores,
  onSignIn,
  onCreate,
  onSignOut,
}: {
  account: PublicAccount | null;
  scores: ScoreEntry[];
  onSignIn: () => void;
  onCreate: () => void;
  onSignOut: () => void;
}) {
  const mine = account
    ? scores.filter((entry) => entry.name.toUpperCase() === account.handle.toUpperCase())
    : [];
  const best = mine.reduce((value, entry) => Math.max(value, entry.score), 0);
  const streak = mine.reduce((value, entry) => Math.max(value, entry.streak), 0);

  if (!account) {
    return (
      <div className="relative mb-3 overflow-hidden rounded-[18px] border-2 border-ink bg-card p-3.5 shadow-[3px_3px_0_#1B1A14] sm:p-4">
        <div className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full border-2 border-ink/10" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-dashed border-ink/40 bg-paper text-ink/50">
              <Icon name="user" size={19} />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-[15px] font-extrabold leading-tight">You&apos;re playing as a guest.</p>
                <span className="rounded-full border border-ink/20 bg-paper px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">no profile</span>
              </div>
              <p className="mt-0.5 max-w-[380px] text-[11px] leading-snug text-muted">
                Sign in to put your name on every run. Profiles live entirely in this browser.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={onCreate}
              className="press inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-ink bg-ink px-3 py-2 font-display text-[12px] font-bold text-cream shadow-[2px_2px_0_#CBF54A] sm:flex-none"
            >
              <Icon name="sparkle" size={12} className="text-lime" /> Create profile
            </button>
            <button
              type="button"
              onClick={onSignIn}
              className="press inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border-2 border-ink/20 bg-paper/60 px-3 py-2 font-display text-[12px] font-bold hover:border-ink sm:flex-none"
            >
              Sign in <Icon name="arrow" size={12} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative mb-3 overflow-hidden rounded-[18px] border-2 border-ink bg-card p-3.5 shadow-[3px_3px_0_#1B1A14] sm:p-4">
      <div className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-lime/30" />
      <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar account={account} size="md" />
          <div className="min-w-0">
            <p className="truncate font-display text-[15px] font-extrabold leading-tight">
              Signed in as {account.name}
            </p>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-muted">tag {account.handle}</span>
              <span className="h-1 w-1 rounded-full bg-ink/25" />
              <span className="inline-flex items-center gap-1 font-mono text-[9px] uppercase tracking-[0.1em] text-muted">
                <Icon name="shield" size={9} /> local profile
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            {[
              ["Best", best.toLocaleString()],
              ["Runs", String(mine.length)],
              ["Streak", `×${streak}`],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-ink/15 bg-paper/70 px-2 py-1">
                <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-muted">{label}</p>
                <p className="font-display text-[13px] font-extrabold tabular-nums">{value}</p>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={onSignOut}
            className="press grid h-8 w-8 shrink-0 place-items-center rounded-lg border-2 border-ink/15 bg-card text-muted transition-colors hover:border-ink hover:text-ink"
            aria-label="Sign out"
            title="Sign out"
          >
            <Icon name="logout" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
