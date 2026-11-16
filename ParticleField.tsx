import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  rotation: number;
  spin: number;
  gravity: number;
  drag: number;
  life: number;
  maxLife: number;
  shape: "rect" | "circle";
};

export type ParticleHandle = {
  burst: (
    x: number,
    y: number,
    options?: { count?: number; colors?: string[]; power?: number; spread?: number },
  ) => void;
  shower: () => void;
};

const PALETTE = ["#CBF54A", "#FF8061", "#B9A6F2", "#A6DCF2", "#FFFCF2", "#1B1A14"];

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

const ParticleField = forwardRef<ParticleHandle>(function ParticleField(_props, ref) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const particlesRef = useRef<Particle[]>([]);
  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef(0);
  const sizeRef = useRef({ width: 0, height: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { width: window.innerWidth, height: window.innerHeight };
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, []);

  const ensureLoop = () => {
    if (rafRef.current !== null) return;
    lastTimeRef.current = performance.now();

    const step = (time: number) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) {
        rafRef.current = null;
        return;
      }
      const delta = Math.min((time - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = time;
      const { width, height } = sizeRef.current;
      ctx.clearRect(0, 0, width, height);

      const alive: Particle[] = [];
      for (const particle of particlesRef.current) {
        particle.life -= delta;
        if (particle.life <= 0) continue;
        particle.vy += particle.gravity * delta;
        particle.vx *= 1 - particle.drag * delta;
        particle.vy *= 1 - particle.drag * delta * 0.6;
        particle.x += particle.vx * delta;
        particle.y += particle.vy * delta;
        particle.rotation += particle.spin * delta;
        if (particle.y > height + 40 || particle.x < -60 || particle.x > width + 60) continue;
        alive.push(particle);

        const alpha = Math.min(1, particle.life / 0.35);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(particle.x, particle.y);
        ctx.rotate(particle.rotation);
        ctx.fillStyle = particle.color;
        if (particle.shape === "rect") {
          ctx.fillRect(-particle.size / 2, -particle.size / 4, particle.size, particle.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, particle.size / 2.6, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      particlesRef.current = alive;
      if (alive.length > 0) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        ctx.clearRect(0, 0, width, height);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(step);
  };

  useImperativeHandle(ref, () => ({
    burst(x, y, options = {}) {
      const { count = 26, colors = PALETTE, power = 460, spread = 0.95 } = options;
      const particles = particlesRef.current;
      for (let i = 0; i < count; i += 1) {
        if (particles.length > 320) break;
        const angle = randomBetween(-Math.PI / 2 - spread, -Math.PI / 2 + spread);
        const speed = randomBetween(power * 0.35, power);
        particles.push({
          x,
          y,
          vx: Math.cos(angle) * speed + randomBetween(-50, 50),
          vy: Math.sin(angle) * speed,
          size: randomBetween(5, 12),
          color: colors[Math.floor(Math.random() * colors.length)],
          rotation: randomBetween(0, Math.PI * 2),
          spin: randomBetween(-9, 9),
          gravity: randomBetween(700, 1100),
          drag: 0.9,
          life: randomBetween(0.7, 1.35),
          maxLife: 1.35,
          shape: Math.random() > 0.35 ? "rect" : "circle",
        });
      }
      ensureLoop();
    },
    shower() {
      const { width } = sizeRef.current;
      const particles = particlesRef.current;
      for (let i = 0; i < 90; i += 1) {
        if (particles.length > 340) break;
        particles.push({
          x: randomBetween(0, width),
          y: randomBetween(-120, -10),
          vx: randomBetween(-90, 90),
          vy: randomBetween(120, 420),
          size: randomBetween(6, 14),
          color: PALETTE[Math.floor(Math.random() * PALETTE.length)],
          rotation: randomBetween(0, Math.PI * 2),
          spin: randomBetween(-8, 8),
          gravity: randomBetween(320, 620),
          drag: 0.2,
          life: randomBetween(1.8, 3.4),
          maxLife: 3.4,
          shape: Math.random() > 0.3 ? "rect" : "circle",
        });
      }
      ensureLoop();
    },
  }));

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-[95] h-full w-full"
    />
  );
});

export default ParticleField;
