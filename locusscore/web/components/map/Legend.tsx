import { legendItems } from "@/lib/style/colors";

export interface LegendProps {
  title: string;
}

/** Always visible per CLAUDE.md Section 8 -- never conditionally hidden. */
export default function Legend({ title }: LegendProps) {
  const items = legendItems();
  return (
    <div className="rounded-md bg-white/95 p-3 text-xs shadow-md ring-1 ring-black/10 dark:bg-neutral-900/95 dark:text-neutral-100">
      <div className="mb-1.5 font-medium">{title}</div>
      <div className="flex items-center gap-0.5">
        {items.map((item) => (
          <div key={item.color} className="flex flex-col items-center" style={{ width: 28 }}>
            <div className="h-3 w-full" style={{ backgroundColor: item.color }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-500">
        <span>0</span>
        <span>100</span>
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-neutral-200 pt-1.5 dark:border-neutral-700">
        <div
          className="h-3 w-3 shrink-0 rounded-sm"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #8a8a8a, #8a8a8a 2px, #c9c9c9 2px, #c9c9c9 5px)",
          }}
        />
        <span>Unsuitable (gate failed)</span>
      </div>
    </div>
  );
}
