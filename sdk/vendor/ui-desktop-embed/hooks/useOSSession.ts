'use client'

// useOSSession — talks to the `os` plugin's /api/os/session endpoint.
// GET on mount, PUT to persist. Same-origin cookie session (credentials:
// "include"), JSON content type — mirrors the fetch-wrapper conventions used
// by demo/web/src/lib/auth.ts and dashboard/web/lib/auth.ts, but kept generic
// here (no CSRF token machinery — GET/PUT on a same-origin API).

import { useCallback, useEffect, useState } from "react";

export interface DesktopPrefs {
  theme: string;
  accent: string;
  wallpaper: string;
  lock_wallpaper: string;
  dock_pinned: string[];
  desktop_hidden: string[];
  icon_positions: Record<string, { x: number; y: number }>;
}

const DEFAULT_PREFS: DesktopPrefs = {
  theme: "dark",
  accent: "#1FC7DC",
  wallpaper: "aurora",
  lock_wallpaper: "monterey",
  dock_pinned: [],
  desktop_hidden: [],
  icon_positions: {},
};

export interface UseOSSessionResult {
  prefs: DesktopPrefs;
  setPrefs: (prefs: DesktopPrefs | ((prev: DesktopPrefs) => DesktopPrefs)) => void;
  /** Persists the current `prefs` (or an explicit override) via PUT. */
  save: (next?: DesktopPrefs) => Promise<void>;
  loading: boolean;
  error: string | null;
}

export function useOSSession(basePath = "/api/os/session"): UseOSSessionResult {
  const [prefs, setPrefs] = useState<DesktopPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(basePath, { credentials: "include" });
        if (!res.ok) throw new Error(`request failed (${res.status})`);
        const data = await res.json();
        if (!cancelled) setPrefs({ ...DEFAULT_PREFS, ...data });
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "failed to load session");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [basePath]);

  const save = useCallback(
    async (next?: DesktopPrefs) => {
      const body = next ?? prefs;
      const res = await fetch(basePath, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`save failed (${res.status})`);
      const data = await res.json().catch(() => body);
      setPrefs({ ...DEFAULT_PREFS, ...data });
    },
    [basePath, prefs],
  );

  return { prefs, setPrefs, save, loading, error };
}
