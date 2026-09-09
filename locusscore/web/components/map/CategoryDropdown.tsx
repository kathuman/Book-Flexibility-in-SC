import type { ProfileManifest } from "@/lib/style/types";

export interface CategoryDropdownProps {
  profile: ProfileManifest;
  selectedCategoryId: string | null;
  onChange: (categoryId: string | null) => void;
}

/** Drill-down: colour by a single cat_<profile>_<category> instead of the
 * composite (CLAUDE.md Section 8). */
export default function CategoryDropdown({ profile, selectedCategoryId, onChange }: CategoryDropdownProps) {
  return (
    <label className="flex items-center gap-2 rounded-md bg-white/95 px-3 py-1.5 text-sm shadow-md ring-1 ring-black/10 dark:bg-neutral-900/95 dark:text-neutral-100">
      <span className="text-neutral-500 dark:text-neutral-400">Colour by</span>
      <select
        className="bg-transparent font-medium outline-none"
        value={selectedCategoryId ?? "__composite__"}
        onChange={(e) => onChange(e.target.value === "__composite__" ? null : e.target.value)}
      >
        <option value="__composite__">Composite score</option>
        {profile.categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label} {c.sign === -1 ? "(negative)" : ""}
          </option>
        ))}
      </select>
    </label>
  );
}
