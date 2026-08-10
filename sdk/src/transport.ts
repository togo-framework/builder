import type { IssueSummary, NewIssue, Transport } from "./types";

/**
 * Default transport: talks to the builder plugin's HTTP surface.
 *
 * Attachments go as multipart, not base64-in-JSON. Base64 inflates by ~33% and
 * a 100 MB screen recording would have to be held in memory as a string twice
 * over before it ever left the browser.
 */
export function httpTransport(apiBase = ""): Transport {
  const base = apiBase.replace(/\/$/, "");

  return {
    async listByRoute(route: string): Promise<IssueSummary[]> {
      const res = await fetch(`${base}/api/builder/issues?route=${encodeURIComponent(route)}`, {
        credentials: "include",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return [];
      const data = await res.json().catch(() => null);
      return Array.isArray(data?.issues) ? data.issues : [];
    },

    async create(issue: NewIssue): Promise<{ id: string; number: number }> {
      const fd = new FormData();
      fd.set(
        "issue",
        JSON.stringify({
          type: issue.type,
          title: issue.title,
          body: issue.body,
          route: issue.route,
          page_url: issue.pageUrl,
          locale: issue.locale,
          pins: issue.pins,
          reporter_email: issue.reporterEmail ?? "",
          // undefined when absent, so the key is dropped from the JSON and the
          // server's json.RawMessage stays empty rather than the string "null".
          context: issue.context ?? undefined,
        }),
      );
      for (const a of issue.attachments) {
        fd.append("attachments", a.blob, a.name);
        fd.append("attachment_kinds", a.kind);
      }

      const res = await fetch(`${base}/api/builder/feedback`, {
        method: "POST",
        credentials: "include",
        body: fd, // no Content-Type: the browser must set the multipart boundary
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(detail || `submit failed (${res.status})`);
      }
      const data = await res.json();
      return { id: String(data.id ?? ""), number: Number(data.number ?? 0) };
    },
  };
}
