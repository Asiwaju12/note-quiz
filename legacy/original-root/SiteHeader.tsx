import { cn } from "@/utils/cn";
import type { PublicAccount } from "@/game/auth";
import { Icon } from "./Icons";
import { Logo, SoundToggle } from "./ui";
import { AccountMenu } from "./AccountMenu";

const NAV = [
  { label: "Daily drop", href: "#daily" },
  { label: "How it works", href: "#how" },
  { label: "High scores", href: "#scores" },
  { label: "My notes", href: "#notes" },
];

export function SiteHeader({
  account,
  muted,
  onToggleSound,
  onStart,
  onHowTo,
  onSignIn,
  onCreate,
  onSignOut,
  onScores,
}: {
  account: PublicAccount | null;
  muted: boolean;
  onToggleSound: () => void;
  onStart: () => void;
  onHowTo: () => void;
  onSignIn: () => void;
  onCreate: () => void;
  onSignOut: () => void;
  onScores: () => void;
}) {
  return (
    <header className="sticky top-0 z-40 border-b border-ink/15 bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 w-full max-w-[1240px] items-center justify-between gap-2 px-3 sm:gap-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-8">
          <Logo />
          <nav className="hidden items-center gap-5 lg:flex" aria-label="Main">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="group relative font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink/60 transition-colors hover:text-ink"
              >
                {item.label}
                <span className="absolute -bottom-1 left-0 h-[2px] w-0 bg-ink transition-all duration-200 group-hover:w-full" />
              </a>
            ))}
            <button
              type="button"
              onClick={onHowTo}
              className="font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink/60 transition-colors hover:text-ink"
            >
              Rules
            </button>
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
          <AccountMenu
            account={account}
            onSignIn={onSignIn}
            onCreate={onCreate}
            onSignOut={onSignOut}
            onScores={onScores}
          />
          {!account && <span className="hidden h-5 w-px bg-ink/15 sm:block" />}
          <SoundToggle muted={muted} onToggle={onToggleSound} />
          <button
            type="button"
            onClick={onStart}
            aria-label="Play Recall"
            className={cn(
              "press group inline-flex items-center gap-2 rounded-full border-2 border-ink bg-ink p-2 text-cream shadow-[2.5px_2.5px_0_#CBF54A] hover:bg-[#2b291f] sm:py-2 sm:pl-2.5 sm:pr-4",
            )}
          >
            <span className="grid h-6 w-6 place-items-center rounded-full bg-lime text-ink">
              <Icon name="play" size={12} />
            </span>
            <span className="hidden font-display text-sm font-bold tracking-tight sm:inline">Play now</span>
          </button>
        </div>
      </div>
    </header>
  );
}
