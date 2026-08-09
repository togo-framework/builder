// Client for the reference library.
//
// A document is a file a person would hand a new engineer — a spec, a plan, a
// CSV, a PDF, a branding image. The server stores the bytes, extracts the text
// and retains it into the project brain, so an agent can quote it back.
import { API } from "./api";

export interface Doc {
  id: string;
  name: string;
  mime: string;
  /** "text" | "csv" | "pdf" | "image", decided by the extractor, not the extension. */
  kind: string;
  caption: string;
  sizeBytes: number;
  namespace: string;
  chunks: number;
  /** "" while never ingested; "error" means the file is stored but unreadable. */
  ingestStatus: "" | "ok" | "error";
  ingestError: string;
  uploadedBy: string;
  createdAt: string;
  /** The first of the extracted text, so an operator can see what was read. */
  excerpt: string;
}

export interface UploadResult {
  id: string;
  name: string;
  ingested: boolean;
  chunks?: number;
  namespace?: string;
  error?: string;
}

const base = `${API}/api/builder/docs`;

async function json<T>(res: Response): Promise<T> {
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((d as { error?: string }).error || `request failed (${res.status})`);
  return d as T;
}

export const listDocs = () =>
  fetch(base, { credentials: "include" }).then(json<{ documents: Doc[] }>);

/**
 * Upload one file.
 *
 * multipart, not JSON: a 25 MB PDF base64-encoded into a JSON body is 33 MB of
 * string the browser has to build in memory first.
 *
 * A 201 with `ingested:false` is a success, not a failure — the file IS stored.
 * Extraction can fail on an encrypted PDF, and telling the operator the upload
 * failed would send them re-uploading a file that is already safe.
 */
export const uploadDoc = (file: File, caption: string) => {
  const fd = new FormData();
  fd.append("file", file);
  if (caption) fd.append("caption", caption);
  return fetch(base, { method: "POST", credentials: "include", body: fd }).then(json<UploadResult>);
};

/** Re-run extraction from the stored bytes — after an embedder change, say. */
export const reingestDoc = (id: string) =>
  fetch(`${base}/${id}/reingest`, { method: "POST", credentials: "include" })
    .then(json<{ ok: boolean; chunks?: number; error?: string }>);

/** Removes the file AND the memories it produced. */
export const deleteDoc = (id: string) =>
  fetch(`${base}/${id}`, { method: "DELETE", credentials: "include" }).then(json<void>);

export const downloadURL = (id: string) => `${base}/${id}/content`;

export const humanSize = (n: number): string => {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};
