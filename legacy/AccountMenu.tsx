import { useEffect, useRef, useState } from "react";
import { loadScores } from "@/game/storage";
import type { PublicAccount } from "@/game/auth";
import type { ScoreEntry } from "@/game/types";
import { Avatar } from "./Avatar";
import { Icon } from "./Icons";

export function AccountMenu({
  account,
  onSignIn,
  onCreate,
  onSignOut,
  onScores,
}: {
  account: PublicAccount | null;
  onSignIn: () => void;
  onCreate: () => void;
  onSignOut: () => void;
  onScores: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [scores, setScores] = useState<ScoreEntry[]>([]);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setScores(loadScores());
    const onPointerDown = (event: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (!account) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <button
          type="button"
          onClick={onSignIn}
          aria-label="Sign in"
          className="press inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-ink/25 px-2 py-2 font-display text-[12px] font-bold text-ink/80 transition-colors hover:border-ink hover:bg-ink/5 hover:text-ink sm:px-3"
        >
          <Icon name="user" size={14} />
          <span className="hidden xs:inline sm:inline">Sign in</span>
        </button>
        <button
          type="button"
          onClick={onCreate}
          className="press hidden items-center gap-1 rounded-full border-2 border-ink bg-lilac px-3 py-2 font-display text-[12px] font-bold text-ink shadow-[2px_2px_0_#1B1A14] md:inline-flex"
        >
          <Icon name="sparkle" size={12} /> Create profile
        </button>
      </div>
    );
  }

  const mine = scores.filter((entry) => entry.name.toUpperCase() === account.handle.toUpperCase());
  const best = mine.reduce((value, entry) => Math.max(value, entry.score), 0);
  const runs = mine.length;

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Account menu for ${account.name}`}
        className="press inline-flex items-center gap-1.5 rounded-full border-2 border-ink bg-card py-1 pl-1 pr-2 shadow-[2px_2px_0_#1B1A14] hover:bg-lime/30 sm:gap-2 sm:pr-2.5"
      >
        <Avatar account={account} size="xs" />
        <span className="hidden max-w-[86px] truncate font-display text-[12px] font-bold sm:inline">{account.name}</span>
        <Icon name="chevron-down" size={13} className={open ? "rotate-180 transition-transform" : "transition-transform"} />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Your profile"
          className="absolute right-0 top-[calc(100%+10px)] z-50 w-[268px] animate-scale-in overflow-hidden rounded-[16px] border-2 border-ink bg-card text-ink shadow-[5px_5px_0_#1B1A14]"
        >
          <div className="relative border-b border-ink/12 bg-paper/70 p-3">
            <div className="flex items-start gap-2.5">
              <Avatar account={account} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-display text-[14px] font-extrabold leading-tight">{account.name}</p>
                <p className="truncate font-mono text-[9px] text-muted">{account.email}</p>
                <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-ink/20 bg-card px-1.5 py-0.5 font-mono text-[8px] uppercase tracking-[0.1em]">
                  <Icon name="shield" size={8} /> tag {account.handle}
                </span>
              </div>
            </div>
            <div className="mt-2.5 grid grid-cols-2 gap-1.5">
              <div className="rounded-md border border-ink/15 bg-card px-2 py-1">
                <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-muted">Best</p>
                <p className="font-display text-[14px] font-extrabold tabular-nums">{best.toLocaleString()}</p>
              </div>
              <div className="rounded-md border border-ink/15 bg-card px-2 py-1">
                <p className="font-mono text-[7px] uppercase tracking-[0.1em] text-muted">Runs</p>
                <p className="font-display text-[14px] font-extrabold tabular-nums">{runs}</p>
              </div>
            </div>
          </div>

          <div className="p-1.5">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onScores();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-display text-[12px] font-bold transition-colors hover:bg-lime/40"
            >
              <Icon name="trophy" size={14} /> My high scores
              <Icon name="arrow" size={12} className="ml-auto text-muted" />
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left font-display text-[12px] font-bold text-ink/75 transition-colors hover:bg-coral/25 hover:text-ink"
            >
              <Icon name="logout" size={14} /> Sign out
            </button>
          </div>
          <p className="border-t border-ink/10 bg-paper/60 px-3 py-1.5 font-mono text-[8px] uppercase tracking-[0.1em] text-muted">
            Local profile · this device
          </p>
        </div>
      )}
    </div>
  );
}
