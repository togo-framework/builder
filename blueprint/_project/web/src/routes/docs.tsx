import { useEffect, useRef, useState } from "react";
import { Button, Callout, EmptyState, Input, Label, PageHeader, StatCard } from "@togo-framework/ui";
import { Download, FileText, RefreshCw, Trash2, Upload } from "lucide-react";
import {
  deleteDoc, downloadURL, humanSize, listDocs, reingestDoc, uploadDoc, type Doc,
} from "../lib/docs";

const kindColor = (k: string) =>
  ({
    pdf: "bg-red-500/15 text-red-600 dark:text-red-400",
    csv: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    image: "bg-violet-500/15 text-violet-600 dark:text-violet-400",
    text: "bg-sky-500/15 text-sky-600 dark:text-sky-400",
  })[k] ?? "bg-muted text-muted-foreground";

const DocRow = ({
  d, onChanged, onError,
}: {
  d: Doc;
  onChanged: () => void;
  onError: (m: string) => void;
}) => {
  const [busy, setBusy] = useState("");
  const [note, setNote] = useState("");

  const handleReingest = async () => {
    setBusy("reingest");
    setNote("");
    try {
      const r = await reingestDoc(d.id);
      setNote(r.ok ? `Re-read into ${r.chunks} chunk${r.chunks === 1 ? "" : "s"}.` : r.error || "Failed.");
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(
      `Delete "${d.name}"?\n\nIts memories go too — the agents will stop answering from it. ` +
      `That is the opposite of removing a source, where the knowledge stays.`,
    )) return;
    setBusy("delete");
    try {
      await deleteDoc(d.id);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy("");
    }
  };

  const broken = d.ingestStatus === "error";

  return (
    <div className={`rounded-lg border ${broken ? "border-destructive/50" : "border-border"} bg-card p-3`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 font-mono text-xs ${kindColor(d.kind)}`}>
              {d.kind || "?"}
            </span>
            <span className="break-all font-medium">{d.name}</span>
            <span className="text-xs text-muted-foreground">{humanSize(d.sizeBytes)}</span>
            {/* Stored-but-unreadable is the state most worth surfacing: the
                file is safe, the knowledge is not there, and nothing else on
                this screen would say so. */}
            {broken && (
              <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-xs font-medium text-destructive">
                Not in the brain
              </span>
            )}
            {d.ingestStatus === "ok" && (
              <span className="text-xs text-muted-foreground">
                {d.chunks} chunk{d.chunks === 1 ? "" : "s"}
              </span>
            )}
          </div>

          {d.caption && <p className="mt-1 text-sm">{d.caption}</p>}

          {d.ingestError && (
            <p className="mt-2 break-words rounded-md bg-destructive/10 px-2 py-1 text-xs text-destructive">
              {d.ingestError}
            </p>
          )}

          {/* What the extractor actually read. "It is in the library but the
              agent cannot answer from it" is otherwise unanswerable. */}
          {d.excerpt && (
            <p className="mt-2 line-clamp-3 whitespace-pre-wrap rounded-md bg-muted/40 p-2 font-mono text-xs text-muted-foreground">
              {d.excerpt}
            </p>
          )}
          {!d.excerpt && d.kind === "image" && !d.caption && (
            <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
              An image with no caption carries no text — an agent cannot read it. Re-upload with a caption.
            </p>
          )}

          {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <a
            href={downloadURL(d.id)}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Download the original"
          >
            <Download className="size-4" />
          </a>
          <Button
            variant="ghost" size="sm" onClick={handleReingest} disabled={busy !== ""}
            title="Read it again from the stored file"
          >
            <RefreshCw className={`size-4 ${busy === "reingest" ? "animate-spin" : ""}`} />
          </Button>
          <Button
            variant="ghost" size="sm" onClick={handleDelete} disabled={busy !== ""}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};
DocRow.displayName = "DocRow";

export const Docs = () => {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [err, setErr] = useState("");
  const [note, setNote] = useState("");
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    listDocs().then((d) => setDocs(d.documents)).catch((e) => setErr(String(e.message)));
  };

  useEffect(load, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setErr("Choose a file first.");
      return;
    }
    setBusy(true);
    setErr("");
    setNote("");
    try {
      const r = await uploadDoc(file, caption);
      // ingested:false is still a success — the file is stored. Saying "upload
      // failed" would send the operator re-uploading something already safe.
      setNote(
        r.ingested
          ? `${r.name} is in the brain — ${r.chunks} chunk${r.chunks === 1 ? "" : "s"}.`
          : r.error || `${r.name} is stored, but its text could not be read.`,
      );
      setCaption("");
      if (fileRef.current) fileRef.current.value = "";
      load();
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const inBrain = (docs ?? []).filter((d) => d.ingestStatus === "ok").length;
  const unreadable = (docs ?? []).filter((d) => d.ingestStatus === "error").length;
  const chunks = (docs ?? []).reduce((n, d) => n + d.chunks, 0);

  return (
    <div className="mx-auto w-full max-w-6xl p-6">
      <PageHeader
        title="Library"
        description="The reference library: specs, plans, CSVs, PDFs and branding the fleet can read and quote."
      />

      {err && <Callout kind="warn" className="mt-4">{err}</Callout>}
      {note && <Callout className="mt-4">{note}</Callout>}

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Documents" value={String(docs?.length ?? 0)} />
        <StatCard label="In the brain" value={String(inBrain)} />
        <StatCard label="Unreadable" value={String(unreadable)} />
        <StatCard label="Chunks" value={String(chunks)} />
      </div>

      <form onSubmit={handleUpload} className="mt-4 rounded-lg border border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <Label htmlFor="file">File</Label>
            <input
              id="file" ref={fileRef} type="file"
              className="mt-1 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm"
            />
          </div>
          <div>
            <Label htmlFor="cap">Caption</Label>
            <Input
              id="cap" value={caption} onChange={(e) => setCaption(e.target.value)}
              placeholder="what this is — required for images"
            />
          </div>
          <Button type="submit" disabled={busy}>
            <Upload className="size-4" />
            {busy ? "Uploading…" : "Upload"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Markdown, text, CSV and PDF are read automatically. An image needs a caption — it is the
          only text it has. Uploading the same name again replaces it rather than adding a copy.
        </p>
      </form>

      <div className="mt-4 space-y-2">
        {docs === null && <p className="text-sm text-muted-foreground">Loading…</p>}
        {docs?.length === 0 && (
          <EmptyState
            icon={<FileText className="size-6" />}
            title="Nothing in the library yet"
            description="Upload the spec or plan you would hand a new engineer, and the fleet can quote it."
          />
        )}
        {docs?.map((d) => <DocRow key={d.id} d={d} onChanged={load} onError={setErr} />)}
      </div>
    </div>
  );
};
Docs.displayName = "Docs";
