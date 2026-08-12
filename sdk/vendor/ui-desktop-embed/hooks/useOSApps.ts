'use client'

// useOSApps — talks to the `os` plugin's /api/os/apps endpoint (list of
// installed OS apps: dock/desktop entries + their window defaults).

import { useCallback, useEffect, useState } from "react";

export interface OSAppWindow {
  width: number;
  height: number;
  resizable: boolean;
}

export interface OSApp {
  slug: string;
  name: string;
  icon: string;
  color: string;
  category: string;
  window: OSAppWindow;
  enabled: boolean;
}

export interface UseOSAppsResult {
  apps: OSApp[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useOSApps(basePath = "/api/os/apps"): UseOSAppsResult {
  const [apps, setApps] = useState<OSApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(basePath, { credentials: "include" });
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      const data = await res.json();
      setApps(Array.isArray(data) ? data : (data.apps ?? []));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed to load apps");
    } finally {
      setLoading(false);
    }
  }, [basePath]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { apps, loading, error, refetch };
}
