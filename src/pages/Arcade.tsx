import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Game } from "@/components/quiz/Game";
import ParticleField, { type ParticleHandle } from "@/components/quiz/ParticleField";
import { useAccount } from "@/app/account";
import { useCollection } from "@/data/db";
import type { SavedDeck } from "@/data/models";
import { updateSettings, useSettings } from "@/data/settings";
import { SAMPLE_DECK } from "@/lib/game/deck";
import { buildDailyDeck, dailyKey } from "@/lib/game/daily";
import { isChoiceQuestion, type Deck } from "@/lib/game/types";
import { loadInitials, saveInitials } from "@/lib/game/storage";
import { armAudio, sfx } from "@/lib/game/sound";
import { ButtonLink } from "@/components/ui/Button";

/** Full-screen arcade (original Recall game). ?deck=<id> plays a saved deck; ?daily=1 plays today's Daily Drop. */
export default function Arcade() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { account, openAuth, mode } = useAccount();
  const settings = useSettings();
  const decks = useCollection<SavedDeck>("decks");
  const particles = useRef<ParticleHandle | null>(null);
  const [initials, setInitials] = useState(() => loadInitials());
  const daily = params.get("daily") === "1";
  const deckId = params.get("deck") ?? undefined;
  const [dailyDate] = useState(() => dailyKey());

  const deck: Deck | null = useMemo(() => {
    if (daily) return buildDailyDeck(dailyDate);
    if (!deckId || deckId === "sample") return SAMPLE_DECK;
    const saved = decks.find((d) => d.id === deckId);
    if (!saved) return null;
    const playable = saved.questions.filter(isChoiceQuestion);
    return playable.length >= 3 ? { title: saved.title, kind: saved.kind, questions: playable } : null;
    // Decks are read once at start so a run isn't reset by background writes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [daily, deckId, dailyDate]);

  useEffect(() => {
    armAudio();
    sfx.start();
  }, []);

  if (!deck) {
    return (
      <div data-theme="dark" className="grid min-h-dvh place-items-center bg-bg p-6 text-center text-text">
        <div>
          <h1 className="text-xl font-semibold">This deck can't be played in arcade mode</h1>
          <p className="mt-2 text-sm text-muted">Arcade needs at least three multiple-choice or true/false questions.</p>
          <ButtonLink to="/quiz" className="mt-6">
            Back to Quiz
          </ButtonLink>
        </div>
      </div>
    );
  }

  return (
    <div data-theme="dark">
      <Game
        deck={deck}
        deckId={deckId && deckId !== "sample" ? deckId : undefined}
        account={account}
        pace={settings.pace}
        daily={daily}
        dailyDate={dailyDate}
        initials={account?.handle ?? initials}
        onInitialsChange={(value) => {
          const clean = value.slice(0, 3).toUpperCase();
          setInitials(clean);
          if (clean) saveInitials(clean);
        }}
        muted={settings.muted}
        onToggleSound={() => updateSettings({ muted: !settings.muted })}
        onExit={() => navigate(daily ? "/leaderboard" : "/quiz")}
        onSignIn={mode === "cloud" ? () => openAuth("signin") : undefined}
        particles={particles}
      />
      <ParticleField ref={particles} />
    </div>
  );
}
