import { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/cn";

/**
 * Single-series bar chart: one hue (identity is named by the title, so no legend),
 * thin bars with rounded data-ends on the baseline, a recessive axis, a hover
 * tooltip per bar, and a visually-hidden table for screen readers.
 */
export function BarChart({
  data,
  format = (v) => String(v),
  label,
  height = 140,
  highlightLast,
}: {
  data: Array<{ key: string; label: string; value: number }>;
  format?: (value: number) => string;
  label: string;
  height?: number;
  highlightLast?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value));
  const showEvery = data.length > 14 ? Math.ceil(data.length / 7) : 1;
  return (
    <figure className="relative" aria-label={label}>
      <div className="relative flex items-end gap-[2px] border-b border-border" style={{ height }} onMouseLeave={() => setHover(null)}>
        {data.map((d, i) => (
          <div
            key={d.key}
            className="relative flex h-full flex-1 cursor-default items-end justify-center"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
            tabIndex={0}
            aria-label={`${d.label}: ${format(d.value)}`}
          >
            <motion.div
              className={cn("w-full max-w-[22px] rounded-t-[4px]", (highlightLast && i === data.length - 1) || hover === i ? "bg-accent" : "bg-accent/45")}
              initial={{ height: 0 }}
              animate={{ height: d.value ? Math.max(3, (d.value / max) * (height - 8)) : 0 }}
              transition={{ duration: 0.6, delay: i * 0.015, ease: [0.22, 1, 0.36, 1] }}
            />
            {hover === i && (
              <div className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-md">
                <span className="text-muted">{d.label}</span> <span className="tabular font-semibold text-text">{format(d.value)}</span>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="mt-1.5 flex gap-[2px]" aria-hidden>
        {data.map((d, i) => (
          <span key={d.key} className="flex-1 truncate text-center text-[10px] text-subtle">
            {i % showEvery === 0 ? d.label : ""}
          </span>
        ))}
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <tbody>
          {data.map((d) => (
            <tr key={d.key}>
              <th scope="row">{d.label}</th>
              <td>{format(d.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
