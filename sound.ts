type ToneType = OscillatorType;

let context: AudioContext | null = null;
let muted = false;
let master: GainNode | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!context) {
    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) return null;
    context = new AudioCtor();
    master = context.createGain();
    master.gain.value = muted ? 0 : 0.55;
    master.connect(context.destination);
  }
  if (context.state === "suspended") void context.resume();
  return context;
}

export function setMuted(value: boolean): void {
  muted = value;
  if (master && context) {
    master.gain.setTargetAtTime(value ? 0 : 0.55, context.currentTime, 0.02);
  }
}

export function armAudio(): void {
  getContext();
}

function tone(
  frequency: number,
  duration: number,
  options: { type?: ToneType; delay?: number; volume?: number; glideTo?: number } = {},
): void {
  if (muted) return;
  const ctx = getContext();
  if (!ctx || !master) return;
  const { type = "sine", delay = 0, volume = 0.16, glideTo } = options;
  const start = ctx.currentTime + delay;
  const oscillator = ctx.createOscillator();
  const gain = ctx.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, start);
  if (glideTo) oscillator.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(volume, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  oscillator.connect(gain);
  gain.connect(master);
  oscillator.start(start);
  oscillator.stop(start + duration + 0.02);
}

export const sfx = {
  tap(): void {
    tone(310, 0.055, { type: "triangle", volume: 0.08 });
  },
  hover(): void {
    tone(520, 0.03, { type: "sine", volume: 0.025 });
  },
  start(): void {
    [392, 523.25, 659.25].forEach((frequency, index) => {
      tone(frequency, 0.16, { type: "triangle", delay: index * 0.075, volume: 0.13 });
    });
  },
  correct(streak: number): void {
    const lift = Math.pow(2, Math.min(streak, 7) / 12);
    const base = 523.25 * lift;
    tone(base, 0.14, { type: "triangle", volume: 0.16 });
    tone(base * 1.25, 0.18, { type: "triangle", delay: 0.075, volume: 0.14 });
    tone(base * 1.5, 0.16, { type: "sine", delay: 0.145, volume: 0.09 });
  },
  wrong(): void {
    tone(196, 0.2, { type: "sawtooth", volume: 0.09, glideTo: 118 });
    tone(148, 0.22, { type: "triangle", delay: 0.06, volume: 0.08, glideTo: 92 });
  },
  timeout(): void {
    tone(320, 0.16, { type: "square", volume: 0.06, glideTo: 210 });
    tone(180, 0.24, { type: "square", delay: 0.12, volume: 0.05, glideTo: 120 });
  },
  levelUp(): void {
    [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
      tone(frequency, 0.24, { type: "triangle", delay: index * 0.085, volume: 0.13 });
    });
  },
  gameOver(): void {
    [392, 329.63, 261.63, 196].forEach((frequency, index) => {
      tone(frequency, 0.32, { type: "triangle", delay: index * 0.14, volume: 0.1 });
    });
  },
  pause(): void {
    tone(440, 0.1, { type: "sine", volume: 0.07 });
    tone(330, 0.14, { type: "sine", delay: 0.08, volume: 0.06 });
  },
};
