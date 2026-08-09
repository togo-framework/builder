import { useEffect, useRef, useState } from "react";
import { Button, Callout, EmptyState, Input, PageHeader, StatusBadge } from "@togo-framework/ui";
import { Download, FileText, Library, RefreshCw, Trash2, TriangleAlert, Upload } from "lucide-react";
import {
  deleteDoc, downloadURL, humanSize, listDocs, reingestDoc, uploadDoc, type Doc,
} from "../lib/docs";
import {
  Field, FormCard, FormFooter, ListSkeleton, MonoBadge, PageShell, Row, RowTitle,
  Rows, Section, Stat, StatRow,
} from "../components/page-shell";

// The kind is a machine word, so it wears the machine-name chip. It used to
// wear a different tinted pill per format — four hues that carried no meaning
// (red did not mean danger) and, being palette literals, ignored the theme.

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
    <Row
      danger={broken}
      trailing={
        <>
          <a
            href={downloadURL(d.id)}
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
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
            title="Delete it and its memories"
            className="text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </>
      }
    >
      <RowTitle>
        <MonoBadge>{d.kind || "?"}</MonoBadge>
        <span className="break-all font-medium">{d.name}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{humanSize(d.sizeBytes)}</span>
        {/* Stored-but-unreadable is the state most worth surfacing: the
            file is safe, the knowledge is not there, and nothing else on
            this screen would say so. */}
        {broken && <StatusBadge tone="danger">Not in the brain</StatusBadge>}
        {d.ingestStatus === "ok" && (
          <span className="text-xs tabular-nums text-muted-foreground">
            {d.chunks} chunk{d.chunks === 1 ? "" : "s"}
          </span>
        )}
      </RowTitle>

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
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          An image with no caption carries no text — an agent cannot read it. Re-upload with a caption.
        </p>
      )}

      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </Row>
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
    <PageShell>
      <PageHeader
        title="Library"
        icon={<Library className="size-5" />}
        description="The reference library: specs, plans, CSVs, PDFs and branding the fleet can read and quote."
      />

      {err && <Callout kind="warn" title="Something went wrong">{err}</Callout>}
      {note && <Callout>{note}</Callout>}

      <StatRow>
        <Stat label="Documents" value={docs?.length ?? 0} />
        <Stat label="In the brain" value={inBrain} tone={inBrain ? "success" : "muted"} />
        <Stat label="Unreadable" value={unreadable} tone={unreadable ? "danger" : "muted"} />
        <Stat label="Chunks" value={chunks} />
      </StatRow>

      <FormCard title="Add to the library">
        <form onSubmit={handleUpload}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field
              label="File" htmlFor="file" required
              hint="Markdown, text, CSV and PDF are read automatically. Re-uploading the same name replaces it rather than adding a copy."
            >
              <input
                id="file" ref={fileRef} type="file"
                className="block w-full rounded-md border border-border bg-background text-sm text-muted-foreground file:me-3 file:rounded-s-md file:border-0 file:bg-muted file:px-3 file:py-2 file:text-sm file:font-medium file:text-foreground"
              />
            </Field>
            <Field
              label="Caption" htmlFor="cap"
              hint="One line on what this is and why it is here. For an image it is required — the caption is the only text an agent can read."
            >
              <Input
                id="cap" value={caption} onChange={(e) => setCaption(e.target.value)}
                placeholder="Q3 launch plan, signed off"
              />
            </Field>
          </div>
          <FormFooter note="Read into the brain the moment it lands — no separate ingest step.">
            <Button type="submit" disabled={busy}>
              <Upload className="me-1.5 size-4" />
              {busy ? "Uploading…" : "Upload"}
            </Button>
          </FormFooter>
        </form>
      </FormCard>

      <Section title="Documents" count={docs?.length}>
        {docs === null && <ListSkeleton rows={3} />}
        {docs?.length === 0 && (
          <EmptyState
            icon={<FileText className="size-6" />}
            title="Nothing in the library yet"
            description="Upload the spec or plan you would hand a new engineer, and the fleet can quote it."
          />
        )}
        {docs && docs.length > 0 && (
          <Rows>
            {docs.map((d) => <DocRow key={d.id} d={d} onChanged={load} onError={setErr} />)}
          </Rows>
        )}
      </Section>
    </PageShell>
  );
};
Docs.displayName = "Docs";
