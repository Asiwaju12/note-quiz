import { cn } from "@/lib/cn";

export function Avatar({ name, color, size = "md", className }: { name: string; color?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "S";
  const dims = size === "sm" ? "h-7 w-7 text-[11px]" : size === "lg" ? "h-14 w-14 text-lg" : "h-9 w-9 text-[13px]";
  return (
    <span
      className={cn("grid shrink-0 place-items-center rounded-full font-semibold text-white", dims, className)}
      style={{ background: color ? color : "linear-gradient(135deg, #8B71EE, #4A2BB8)" }}
      aria-hidden
    >
      {initials}
    </span>
  );
}
