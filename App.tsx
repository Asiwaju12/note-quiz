import { useEffect, useRef, useState } from "react";
import { Home } from "./components/Home";
import { Game } from "./components/Game";
import { HowToPlay } from "./components/HowToPlay";
import { AuthDialog } from "./components/AuthDialog";
import ParticleField, { type ParticleHandle } from "./components/ParticleField";
import { SAMPLE_DECK } from "./game/deck";
import type { Deck } from "./game/types";
import { initialsFor, loadSession, signOut, type PublicAccount } from "./game/auth";
import type { Pace } from "./game/types";
import { loadInitials, loadMuted, loadPace, saveInitials, saveMuted, savePace } from "./game/storage";
import { armAudio, setMuted as setSoundMuted, sfx } from "./game/sound";

type Screen = "home" | "play";
type AuthMode = "signin" | "signup";
type RunMode = "classic" | "daily";

export default function App() {
  const [screen, setScreen] = useState<Screen>("home");
  const [deck, setDeck] = useState<Deck>(() => SAMPLE_DECK);
  const [pace, setPace] = useState<Pace>(() => loadPace());
  const [runMode, setRunMode] = useState<RunMode>("classic");
  const [dailyDate, setDailyDate] = useState("");
  const [account, setAccount] = useState<PublicAccount | null>(() => loadSession());
  const [initials, setInitials] = useState(() => {
    const session = loadSession();
    return session ? initialsFor(session) : loadInitials();
  });
  const [muted, setMuted] = useState(() => loadMuted());
  const [runKey, setRunKey] = useState(1);
  const [howToOpen, setHowToOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("signin");
  const particles = useRef<ParticleHandle | null>(null);

  useEffect(() => {
    setSoundMuted(muted);
    saveMuted(muted);
  }, [muted]);

  useEffect(() => {
    savePace(pace);
  }, [pace]);

  useEffect(() => {
    const onFirstInteraction = () => armAudio();
    window.addEventListener("pointerdown", onFirstInteraction, { once: true });
    window.addEventListener("keydown", onFirstInteraction, { once: true });
    return () => {
      window.removeEventListener("pointerdown", onFirstInteraction);
      window.removeEventListener("keydown", onFirstInteraction);
    };
  }, []);

  const openAuth = (mode: AuthMode) => {
    setAuthMode(mode);
    setAuthOpen(true);
    setHowToOpen(false);
    armAudio();
    sfx.tap();
  };

  const handleAuth = (next: PublicAccount) => {
    setAccount(next);
    const tag = initialsFor(next);
    setInitials(tag);
    saveInitials(tag);
    setAuthOpen(false);
    sfx.start();
    window.setTimeout(() => particles.current?.burst(window.innerWidth / 2, window.innerHeight * 0.3, { count: 36 }), 120);
  };

  const handleSignOut = () => {
    signOut();
    setAccount(null);
    setInitials("YOU");
    saveInitials("YOU");
    sfx.tap();
  };

  const startRun = (nextDeck?: Deck) => {
    armAudio();
    setHowToOpen(false);
    setAuthOpen(false);
    if (nextDeck) setDeck(nextDeck);
    setRunMode("classic");
    setDailyDate("");
    setRunKey((key) => key + 1);
    setScreen("play");
    sfx.start();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const startDaily = (dailyDeck: Deck, date: string) => {
    armAudio();
    setHowToOpen(false);
    setAuthOpen(false);
    setDeck(dailyDeck);
    setRunMode("daily");
    setDailyDate(date);
    setRunKey((key) => key + 1);
    setScreen("play");
    sfx.start();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const goHome = () => {
    setHowToOpen(false);
    setScreen("home");
    sfx.tap();
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  };

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    setSoundMuted(next);
    saveMuted(next);
    armAudio();
    if (!next) sfx.tap();
  };

  const handleInitials = (value: string) => {
    const clean = value.slice(0, 3).toUpperCase();
    setInitials(clean);
    if (clean) saveInitials(clean);
  };

  return (
    <>
      {screen === "home" ? (
        <Home
          activeDeck={deck}
          account={account}
          pace={pace}
          onPaceChange={setPace}
          onDeckChange={setDeck}
          onStart={startRun}
          onStartDaily={startDaily}
          muted={muted}
          onToggleSound={toggleSound}
          onHowTo={() => {
            setHowToOpen(true);
            sfx.tap();
          }}
          onSignIn={() => openAuth("signin")}
          onCreate={() => openAuth("signup")}
          onSignOut={handleSignOut}
          particles={particles}
        />
      ) : (
        <Game
          key={runKey}
          deck={deck}
          account={account}
          pace={pace}
          daily={runMode === "daily"}
          dailyDate={dailyDate}
          initials={initials}
          onInitialsChange={handleInitials}
          muted={muted}
          onToggleSound={toggleSound}
          onExit={goHome}
          onSignIn={() => openAuth("signin")}
          particles={particles}
        />
      )}

      <HowToPlay open={howToOpen} onClose={() => setHowToOpen(false)} onStart={() => startRun(deck)} />
      <AuthDialog
        open={authOpen}
        initialMode={authMode}
        onClose={() => setAuthOpen(false)}
        onAuth={handleAuth}
      />
      <ParticleField ref={particles} />
    </>
  );
}
