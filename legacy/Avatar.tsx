import { cn } from "@/utils/cn";
import type { PublicAccount } from "@/game/auth";

export function Avatar({
  account,
  size = "md",
  className,
}: {
  account: PublicAccount | null;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const label = account?.handle?.slice(0, 3).toUpperCase() || account?.name?.slice(0, 2).toUpperCase() || "?";
  const color = account?.color || "#D9D1B9";
  const sizes = {
    xs: "h-7 w-7 text-[9px] shadow-[1.5px_1.5px_0_#1B1A14]",
    sm: "h-8 w-8 text-[10px]",
    md: "h-10 w-10 text-[12px]",
    lg: "h-14 w-14 text-[17px]",
  };
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid shrink-0 place-items-center rounded-full border-2 border-ink font-display font-extrabold uppercase tracking-[-0.02em] text-ink shadow-[2px_2px_0_#1B1A14]",
        sizes[size],
        className,
      )}
      style={{ backgroundColor: color }}
    >
      {label}
    </span>
  );
}
