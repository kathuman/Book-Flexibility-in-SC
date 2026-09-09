import type { ProfileManifest } from "@/lib/style/types";

export interface ProfileSelectorProps {
  profiles: ProfileManifest[];
  selectedId: string;
  onChange: (id: string) => void;
}

/** Segmented control (CLAUDE.md Section 8). Switching only changes MapView
 * props, which update paint properties in place -- no data reload. */
export default function ProfileSelector({ profiles, selectedId, onChange }: ProfileSelectorProps) {
  return (
    <div
      role="radiogroup"
      aria-label="Objective"
      className="inline-flex rounded-md bg-white/95 p-1 shadow-md ring-1 ring-black/10 dark:bg-neutral-900/95"
    >
      {profiles.map((p) => {
        const active = p.id === selectedId;
        return (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(p.id)}
            className={
              "rounded px-3 py-1.5 text-sm font-medium transition-colors " +
              (active
                ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800")
            }
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}
