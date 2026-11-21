import { cn } from "@/utils/cn";

export type FernandezMood = "idle" | "focus" | "happy" | "hyped" | "worried" | "sleepy";

function Eyes({ mood }: { mood: FernandezMood }) {
  if (mood === "happy" || mood === "hyped") {
    if (mood === "hyped") {
      return (
        <g fill="#1B1A14">
          <path d="m50 52 2.2 5.2 5.4 2.1-5.4 2.1L50 67l-2.2-5.6-5.4-2.1 5.4-2.1L50 52Z" />
          <path d="m76 52 2.2 5.2 5.4 2.1-5.4 2.1L76 67l-2.2-5.6-5.4-2.1 5.4-2.1L76 52Z" />
        </g>
      );
    }
    return (
      <g fill="none" stroke="#1B1A14" strokeWidth="4.4" strokeLinecap="round">
        <path d="M43 59c2.4-4 8.8-4 11.2 0" />
        <path d="M69 59c2.4-4 8.8-4 11.2 0" />
      </g>
    );
  }
  if (mood === "worried") {
    return (
      <g>
        <g fill="#1B1A14">
          <circle cx="49" cy="59" r="4.6" />
          <circle cx="73" cy="59" r="4.6" />
        </g>
        <g fill="#FFFCF2">
          <circle cx="50.4" cy="57.6" r="1.5" />
          <circle cx="74.4" cy="57.6" r="1.5" />
        </g>
        <g fill="none" stroke="#1B1A14" strokeWidth="3.2" strokeLinecap="round">
          <path d="m42 48 11 3.6" />
          <path d="m80 48-11 3.6" />
        </g>
      </g>
    );
  }
  return (
    <g>
      <g className={mood === "idle" ? "fernandez-blink" : undefined} fill="#1B1A14" style={{ transformOrigin: "61px 58px" }}>
        <circle cx="49" cy="58" r="5.2" />
        <circle cx="73" cy="58" r="5.2" />
        <circle cx="50.7" cy="56.2" r="1.7" fill="#FFFCF2" />
        <circle cx="74.7" cy="56.2" r="1.7" fill="#FFFCF2" />
      </g>
      {mood === "focus" && (
        <g fill="none" stroke="#1B1A14" strokeWidth="3" strokeLinecap="round">
          <path d="m42.5 47.5 11 2.2" />
          <path d="m79.5 47.5-11 2.2" />
        </g>
      )}
      {mood === "sleepy" && (
        <g fill="none" stroke="#1B1A14" strokeWidth="3" strokeLinecap="round">
          <path d="M43 63.5h11M69 63.5h11" />
        </g>
      )}
    </g>
  );
}

function Mouth({ mood }: { mood: FernandezMood }) {
  if (mood === "hyped") {
    return (
      <g>
        <path d="M49 71q12-3 23 0 0 15-11.5 15T49 71Z" fill="#1B1A14" />
        <path d="M55.5 81q5.5 4 11 0" fill="none" stroke="#FF8061" strokeWidth="4" strokeLinecap="round" />
      </g>
    );
  }
  if (mood === "happy") {
    return (
      <g>
        <path d="M48 71q12 3 24 0-1 12-12 12T48 71Z" fill="#1B1A14" />
        <path d="M57 80.5q4.5 2.6 9 0" fill="none" stroke="#FF8061" strokeWidth="3.2" strokeLinecap="round" />
      </g>
    );
  }
  if (mood === "worried") {
    return <path d="M53 78q8-6.5 16 0" fill="none" stroke="#1B1A14" strokeWidth="3.4" strokeLinecap="round" />;
  }
  if (mood === "focus") {
    return <path d="M54 76h14" fill="none" stroke="#1B1A14" strokeWidth="3.4" strokeLinecap="round" />;
  }
  if (mood === "sleepy") {
    return <path d="M55 77q6 4 12 0" fill="none" stroke="#1B1A14" strokeWidth="3.4" strokeLinecap="round" />;
  }
  return <path d="M52 73q9 7 18 0" fill="none" stroke="#1B1A14" strokeWidth="3.6" strokeLinecap="round" />;
}

export function Fernandez({
  mood = "idle",
  size = 96,
  className,
  bob = true,
}: {
  mood?: FernandezMood;
  size?: number;
  className?: string;
  bob?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      fill="none"
      role="img"
      aria-label={`Fernandez, the Recall host, looking ${mood}`}
      className={cn("shrink-0 overflow-visible", className)}
    >
      <ellipse cx="60" cy="111" rx="26" ry="4.5" fill="#1B1A14" opacity="0.16" />
      <g className={bob ? "fernandez-bob" : undefined}>
        {/* arms */}
        {mood === "hyped" ? (
          <g stroke="#1B1A14" strokeWidth="4" strokeLinecap="round" fill="#FFFCF2">
            <path d="M26 65 12 48" />
            <path d="m94 65 14-17" />
            <circle cx="11" cy="45" r="4.4" />
            <circle cx="109" cy="45" r="4.4" />
          </g>
        ) : mood === "happy" ? (
          <g stroke="#1B1A14" strokeWidth="4" strokeLinecap="round" fill="#FFFCF2">
            <path d="M24 72 11 66" />
            <path d="m96 72 13-8" />
            <circle cx="9.5" cy="65" r="4.2" />
            <circle cx="110.5" cy="62" r="4.2" />
          </g>
        ) : mood === "worried" ? (
          <g stroke="#1B1A14" strokeWidth="4" strokeLinecap="round" fill="#FFFCF2">
            <path d="M25 78 20 90" />
            <path d="m95 78 5 12" />
            <circle cx="19.5" cy="93" r="4.2" />
            <circle cx="100.5" cy="93" r="4.2" />
          </g>
        ) : (
          <g stroke="#1B1A14" strokeWidth="4" strokeLinecap="round" fill="#FFFCF2">
            <path d="M25 82 15 87" />
            <path d="m95 82 10 5" />
            <circle cx="13" cy="87.5" r="4" />
            <circle cx="107" cy="87.5" r="4" />
          </g>
        )}

        {/* antenna */}
        <path d="M55 13c-1-5 1-9 5-11" stroke="#1B1A14" strokeWidth="3.4" strokeLinecap="round" />
        <circle cx="61" cy="1.8" r="5.4" fill="#CBF54A" stroke="#1B1A14" strokeWidth="3" />
        {mood === "hyped" && (
          <g fill="#FF8061">
            <path d="m100 14 1.7 4.1 4.1 1.7-4.1 1.7L100 26l-1.7-4.5-4.1-1.7 4.1-1.7L100 14Z" />
            <path d="m18 30 1.4 3.5 3.5 1.4-3.5 1.4L18 40l-1.4-3.7-3.5-1.4 3.5-1.4L18 30Z" />
          </g>
        )}

        {/* note body */}
        <path
          d="M23 22c0-5 3-8 8-8h47l20 22v54c0 6-3 9-9 9H31c-6 0-8-3-8-9V22Z"
          fill={mood === "worried" ? "#FFF4EC" : "#FFFCF2"}
          stroke="#1B1A14"
          strokeWidth="4"
          strokeLinejoin="round"
        />
        <path d="M78 14v17c0 3 2 5 5 5h15" fill="#CBF54A" stroke="#1B1A14" strokeWidth="4" strokeLinejoin="round" />
        <path d="M78 14 98 36" stroke="#1B1A14" strokeWidth="2.4" opacity="0.35" />

        {/* face */}
        <Eyes mood={mood} />

        {/* Fernandez's round spectacles */}
        <g fill="#A6DCF2" fillOpacity="0.22" stroke="#1B1A14" strokeWidth="2.5" strokeLinejoin="round">
          <circle cx="49" cy="58" r="11" />
          <circle cx="73" cy="58" r="11" />
          <path d="M60 57.5h2" fill="none" strokeLinecap="round" />
          <path d="M38.2 55.5 30.5 52.4M83.8 55.5l7.7-3.1" fill="none" strokeLinecap="round" />
        </g>
        <path d="M43.5 52.5c1.6-2 3.6-2.7 5.4-2.4" fill="none" stroke="#FFFCF2" strokeWidth="2.2" strokeLinecap="round" opacity="0.9" />

        <circle cx="36" cy="70" r="6" fill="#FF8061" opacity="0.42" />
        <circle cx="86" cy="70" r="6" fill="#FF8061" opacity="0.42" />
        <Mouth mood={mood} />

        {/* engraved name badge */}
        <g>
          <rect x="78" y="82" width="17" height="17" rx="4.5" fill="#CBF54A" stroke="#1B1A14" strokeWidth="2.4" />
          <text
            x="86.6"
            y="95.2"
            textAnchor="middle"
            fontFamily="Bricolage Grotesque, DM Sans, sans-serif"
            fontSize="11.5"
            fontWeight="800"
            fill="#1B1A14"
          >
            F
          </text>
        </g>

        {mood === "worried" && (
          <path d="M91 42c3.2 2.6 4.2 6 1.2 8.4-2.6-2-3.4-5-1.2-8.4Z" fill="#A6DCF2" stroke="#1B1A14" strokeWidth="2.2" />
        )}
        {mood === "sleepy" && (
          <g fill="#1B1A14" fontFamily="DM Mono, monospace" fontSize="11" fontWeight="500">
            <text x="98" y="42">z</text>
            <text x="105" y="32" fontSize="8">z</text>
          </g>
        )}

        {/* little feet */}
        <path d="M41 103v5M79 103v5" stroke="#1B1A14" strokeWidth="4" strokeLinecap="round" />
      </g>
    </svg>
  );
}

const TONE_STYLES = {
  light: "border-ink bg-card text-ink shadow-[3px_3px_0_#1B1A14]",
  dark: "border-cream/25 bg-cream/[0.08] text-cream shadow-[3px_3px_0_rgba(0,0,0,0.35)]",
  lime: "border-ink bg-lime text-ink shadow-[3px_3px_0_#1B1A14]",
};

export function FernandezSay({
  children,
  mood = "idle",
  size = 48,
  tone = "light",
  className,
  bubbleClassName,
}: {
  children: React.ReactNode;
  mood?: FernandezMood;
  size?: number;
  tone?: keyof typeof TONE_STYLES;
  className?: string;
  bubbleClassName?: string;
}) {
  const dark = tone === "dark";
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Fernandez mood={mood} size={size} />
      <div className={cn("relative rounded-xl border-2 px-2.5 py-2", TONE_STYLES[tone], bubbleClassName)}>
        <span
          aria-hidden="true"
          className={cn(
            "absolute -left-[6px] top-1/2 h-2.5 w-2.5 -translate-y-1/2 rotate-45 border-b-2 border-l-2",
            dark ? "border-cream/25 bg-[#24231c]" : tone === "lime" ? "border-ink bg-lime" : "border-ink bg-card",
          )}
        />
        <p className={cn("relative font-mono text-[8px] uppercase tracking-[0.12em]", dark ? "text-cream/40" : "text-muted")}>
          Fernandez says
        </p>
        <p className={cn("relative mt-0.5 text-[11px] font-medium leading-snug", dark ? "text-cream/80" : "text-ink/80")}>
          {children}
        </p>
      </div>
    </div>
  );
}

export const FERNANDEZ_IDLE_LINES = [
  "No pressure. A little pressure.",
  "Trust that first answer.",
  "Fast is good. Right is better.",
  "I read every word. Twice.",
  "Breathe. Then begin.",
  "Your notes are in there.",
];

export const FERNANDEZ_CORRECT_LINES = [
  "Clean. That's a keeper.",
  "Yep. Knew it.",
  "Filing that under 'remembered'.",
  "Smooth brain energy — in the best way.",
  "Your notes would be proud.",
];

export const FERNANDEZ_WRONG_LINES = [
  "Oof. Filed under 'next time'.",
  "Notes are open. Just saying.",
  "One heart down. Still very winnable.",
  "That's why we do the reps.",
  "Shake it off. I believe in you.",
];

export const FERNANDEZ_LEVEL_LINES = [
  "Clean sweep. I'll allow it.",
  "New level, new brain wrinkles.",
  "They should put you on a cereal box.",
  "That's my human. Or whatever you are.",
];

export function fernandezLine(lines: string[], seed: number): string {
  if (lines.length === 0) return "";
  return lines[Math.abs(seed) % lines.length];
}


