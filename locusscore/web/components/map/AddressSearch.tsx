"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AddressSearchResult {
  label: string;
  lng: number;
  lat: number;
}

export interface AddressSearchProps {
  onSelect: (result: AddressSearchResult) => void;
}

const DEBOUNCE_MS = 400;
const MIN_REQUEST_GAP_MS = 1000; // Nominatim usage policy: max 1 req/s.
const MIN_QUERY_LENGTH = 3;

interface NominatimResult {
  display_name: string;
  lon: string;
  lat: string;
}

/** CLAUDE.md Section 8: "Address search (Nominatim, with attribution and
 * rate-limit respect; debounce, 1 req/s) flies to location."
 *
 * Browser fetch cannot set a custom User-Agent header (browsers forbid it);
 * Nominatim's usage policy accepts an identifying HTTP Referer instead for
 * client-side use, which fetch sends automatically from the page origin.
 * A real deployment should also pass an `email=` query param per that
 * policy -- left as a TODO since it needs a real contact address, not one
 * to fabricate here. */
export default function AddressSearch({ onSelect }: AddressSearchProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRequestAtRef = useRef(0);
  const requestSeqRef = useRef(0);

  const runSearch = useCallback(async (q: string) => {
    const seq = ++requestSeqRef.current;
    lastRequestAtRef.current = Date.now();
    setLoading(true);
    try {
      const url = new URL("https://nominatim.openstreetmap.org/search");
      url.searchParams.set("format", "jsonv2");
      url.searchParams.set("q", q);
      url.searchParams.set("limit", "5");
      url.searchParams.set("countrycodes", "dk");
      url.searchParams.set("accept-language", "en");
      // Region Hovedstaden default (CLAUDE.md Section 12 item 1) -- biases
      // results, doesn't hard-restrict them (no `bounded=1`).
      url.searchParams.set("viewbox", "12.0,55.95,12.75,55.5");
      const res = await fetch(url.toString());
      if (!res.ok) throw new Error(`${res.status}`);
      const data = (await res.json()) as NominatimResult[];
      if (seq !== requestSeqRef.current) return; // stale response
      setResults(
        data.map((d) => ({ label: d.display_name, lng: parseFloat(d.lon), lat: parseFloat(d.lat) }))
      );
      setOpen(true);
    } catch {
      if (seq === requestSeqRef.current) setResults([]);
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < MIN_QUERY_LENGTH) return; // see visibleResults below
    debounceRef.current = setTimeout(() => {
      const now = Date.now();
      const wait = Math.max(0, lastRequestAtRef.current + MIN_REQUEST_GAP_MS - now);
      setTimeout(() => void runSearch(query), wait);
    }, DEBOUNCE_MS);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, runSearch]);

  // Derived rather than reset via setState in the effect above: once the
  // query shrinks back below the minimum length, stop showing stale
  // results without needing a synchronous state write.
  const visibleResults = query.trim().length >= MIN_QUERY_LENGTH ? results : [];

  return (
    <div className="relative w-72 max-w-[80vw]">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onFocus={() => visibleResults.length > 0 && setOpen(true)}
        placeholder="Search an address in Denmark…"
        className="w-full rounded-md bg-white/95 px-3 py-1.5 text-sm shadow-md ring-1 ring-black/10 outline-none dark:bg-neutral-900/95 dark:text-neutral-100"
      />
      {loading && (
        <div className="absolute right-2 top-1.5 text-xs text-neutral-400">…</div>
      )}
      {open && visibleResults.length > 0 && (
        <ul className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-md bg-white/95 py-1 text-sm shadow-lg ring-1 ring-black/10 dark:bg-neutral-900/95 dark:text-neutral-100">
          {visibleResults.map((r, i) => (
            <li key={i}>
              <button
                type="button"
                className="block w-full truncate px-3 py-1.5 text-left hover:bg-neutral-100 dark:hover:bg-neutral-800"
                onClick={() => {
                  onSelect(r);
                  setOpen(false);
                  setQuery(r.label);
                }}
              >
                {r.label}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-0.5 text-[10px] text-neutral-400">Search by Nominatim / © OpenStreetMap contributors</div>
    </div>
  );
}
