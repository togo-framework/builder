import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Callout, Input, StatusBadge, cn } from "@togo-framework/ui";
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, File, FileImage,
  FileSpreadsheet, FileText, FileType, Library, RefreshCw, Search, Trash2,
  TriangleAlert, Upload, X,
} from "lucide-react";
import {
  deleteDoc, downloadURL, humanSize, listDocs, reingestDoc, uploadDoc, type Doc,
} from "../lib/docs";
import {
  FilterChip, FormCard, FormFooter, ListSkeleton, MonoBadge, PageShell, Row,
  RowMeta, RowTitle, Rows, Section, Stat, StatRow,
} from "../components/page-shell";
import { EmptyState } from "../components/ui/empty-state";
import { ConfirmAction } from "../components/ui/confirm-action";
import {
  Footprint, FootprintArtefact, FootprintRow, type FootprintStatus,
} from "../components/ui/footprint";
import { exactTime, relativeTime, useDocsStrings } from "../lib/i18n.vault";

/**
 * docs — the reference library, and the upload that has to be trustworthy.
 *
 * The failure this screen was rebuilt around: a PDF upload that reported
 * "upload failed" with no filename and no reason. With one file that is merely
 * unhelpful; with five selected at once it is unusable, because the operator
 * cannot tell WHICH file failed, whether the others landed, or whether
 * re-uploading is safe.
 *
 * So the upload is a queue with one row per file, and each row states its own
 * outcome in its own words. Three outcomes, deliberately distinct:
 *
 *   in the brain   stored AND its text was extracted and chunked
 *   stored only    stored, extraction failed — the file is SAFE, and the row
 *                  says so, because "failed" here sends the operator
 *                  re-uploading something that is already on the server
 *   failed         the request itself did not succeed; the reason is the
 *                  server's own sentence, verbatim, next to the filename
 *
 * There is no percentage bar. `uploadDoc` is a fetch, which cannot report
 * bytes, and a bar that animates on a guess is worse than no bar — it is the
 * component that lies while the thing it describes hangs. Progress is reported
 * at the granularity the page actually knows: which file is uploading now, and
 * how many of them have finished.
 *
 * The queue is a Footprint for the same reason the vault's audit log is: it is
 * a list of actions with outcomes and artefacts, and it should be recognised as
 * one shape wherever it appears.
 */

type QueueStatus = "queued" | "uploading" | "ingested" | "stored" | "failed";

interface QueueItem {
  key: string;
  file: File;
  caption: string;
  status: QueueStatus;
  chunks: number;
  /** The server's own sentence. Never paraphrased, never swallowed. */
  message: string;
}

const QUEUE_GLYPH: Record<QueueStatus, FootprintStatus> = {
  queued: "pending",
  uploading: "running",
  ingested: "done",
  // Stored-but-unreadable is not a failure and must not wear the failure
  // glyph. "blocked" is the warning shape: the file arrived, the knowledge
  // did not.
  stored: "blocked",
  failed: "failed",
};

const KIND_ICON: Record<string, typeof FileText> = {
  text: FileText,
  csv: FileSpreadsheet,
  pdf: FileType,
  image: FileImage,
};

const isImage = (f: File) => f.type.startsWith("image/");

/** Square, quiet row action. Label doubles as the accessible name — a title
 *  attribute alone is invisible to a screen reader. */
const IconAction = ({
  icon, label, onClick, disabled = false, danger = false,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    onClick={onClick}
    disabled={disabled}
    className={cn(
      "motion-hover motion-press inline-flex size-8 shrink-0 items-center justify-center rounded-field",
      "text-muted-foreground hover:bg-muted hover:text-foreground",
      "disabled:pointer-events-none disabled:opacity-40 [&>svg]:size-4",
      danger && "hover:bg-destructive/10 hover:text-destructive",
    )}
  >
    {icon}
  </button>
);
IconAction.displayName = "IconAction";

const FilterBox = ({
  value, onChange, placeholder, clearLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  clearLabel: string;
}) => (
  <div className="motion-hover flex h-8 items-center gap-1.5 rounded-field border border-border bg-background px-2 focus-within:border-primary/50">
    <Search aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
    <input
      type="search"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-32 min-w-0 bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground sm:w-44"
    />
    {value && (
      <button
        type="button"
        onClick={() => onChange("")}
        title={clearLabel}
        aria-label={clearLabel}
        className="motion-hover shrink-0 text-muted-foreground hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
    )}
  </div>
);
FilterBox.displayName = "FilterBox";

/* ------------------------------------------------------------------ */
/* One document                                                        */
/* ------------------------------------------------------------------ */

const DocRow = ({
  d, onChanged, onError, onRequestDelete,
}: {
  d: Doc;
  onChanged: () => void;
  onError: (m: string) => void;
  onRequestDelete: (d: Doc) => void;
}) => {
  const { S, ar } = useDocsStrings();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [showExcerpt, setShowExcerpt] = useState(false);

  const handleReingest = async () => {
    setBusy(true);
    setNote("");
    try {
      const r = await reingestDoc(d.id);
      setNote(r.ok ? S.reindexed(r.chunks ?? 0) : r.error || S.reindexFailed);
      onChanged();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const broken = d.ingestStatus === "error";
  const Icon = KIND_ICON[d.kind] ?? File;
  const Chevron = showExcerpt ? ChevronDown : ar ? ChevronLeft : ChevronRight;

  return (
    <Row
      danger={broken}
      leading={
        <span
          aria-hidden="true"
          className={cn(
            "flex size-8 items-center justify-center rounded-full",
            broken ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>
      }
      trailing={
        <>
          <a
            href={downloadURL(d.id)}
            title={S.download}
            aria-label={S.download}
            className="motion-hover motion-press inline-flex size-8 shrink-0 items-center justify-center rounded-field text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Download className="size-4" />
          </a>
          <IconAction
            icon={<RefreshCw className={busy ? "animate-spin motion-reduce:animate-none" : ""} />}
            label={busy ? S.reindexing : S.reindex}
            onClick={() => void handleReingest()}
            disabled={busy}
          />
          <IconAction
            icon={<Trash2 />}
            label={S.del}
            danger
            disabled={busy}
            onClick={() => onRequestDelete(d)}
          />
        </>
      }
    >
      <RowTitle>
        {/* The filename is the one thing that matters on this row, so it reads
            first and in the UI face — not in mono behind a coloured chip.
            <bdi> with NO dir: a filename is user-supplied, so its base
            direction has to be detected, not asserted. Forcing dir="ltr" on
            "تقييم-التوترات.pdf" throws the ".pdf" to the wrong end of an
            otherwise Arabic name. The isolate is still what stops it from
            disturbing the badges beside it. */}
        <bdi className="min-w-0 break-all text-sm font-medium text-foreground">{d.name}</bdi>
        {broken && <StatusBadge tone="danger">{S.notInBrain}</StatusBadge>}
      </RowTitle>

      {d.caption && <p className="mt-1 text-sm text-muted-foreground">{d.caption}</p>}

      <RowMeta>
        <MonoBadge>{d.kind || "?"}</MonoBadge>
        {/* "80 B" is a number followed by a Latin unit. Dropped bare into an
            RTL meta line the bidi algorithm renders it "B 80". The isolate is
            what keeps a file size readable in Arabic. */}
        <bdi dir="ltr" className="numeric">
          {humanSize(d.sizeBytes)}
        </bdi>
        {d.ingestStatus === "ok" && <span className="numeric">{S.chunksCount(d.chunks)}</span>}
        <span title={exactTime(d.createdAt, ar)}>{relativeTime(d.createdAt, ar)}</span>
        {d.uploadedBy && <bdi className="font-mono">{d.uploadedBy}</bdi>}
      </RowMeta>

      {/* The extractor's own words. A generic "could not read this file" is
          exactly the message that made the last PDF failure unactionable. */}
      {d.ingestError && (
        <p className="mt-2 break-words rounded-field bg-destructive/10 px-2 py-1 text-xs text-destructive">
          <bdi dir="ltr" className="font-mono">
            {d.ingestError}
          </bdi>
        </p>
      )}

      {!d.excerpt && d.kind === "image" && !d.caption && (
        <p className="mt-2 flex items-start gap-1.5 text-xs text-warning">
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {S.imageNeedsCaption}
        </p>
      )}

      {/* What the extractor actually read. Collapsed by default: at three lines
          per row it drowns a twenty-document library, and "is it in the brain"
          is already answered above. Open, it is the only thing that answers
          "why is the agent quoting nonsense". */}
      {d.excerpt && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowExcerpt((v) => !v)}
            aria-expanded={showExcerpt}
            className="motion-hover inline-flex items-center gap-1 rounded-field text-xs text-muted-foreground hover:text-foreground"
          >
            <Chevron aria-hidden="true" className="size-3.5" />
            {showExcerpt ? S.hidePreview : S.preview}
          </button>
          {showExcerpt && (
            <p
              className="motion-entrance mt-1.5 max-h-40 overflow-auto whitespace-pre-wrap rounded-field bg-muted/40 p-2 font-mono text-xs text-muted-foreground"
              aria-label={S.previewLabel}
            >
              {/* Extracted text can be Arabic. dir="auto" lets the excerpt
                  pick its own base direction instead of being flattened to
                  LTR, which would scramble an Arabic document's preview. */}
              <bdi dir="auto">{d.excerpt}</bdi>
            </p>
          )}
        </div>
      )}

      {note && <p className="mt-2 text-xs text-muted-foreground">{note}</p>}
    </Row>
  );
};
DocRow.displayName = "DocRow";

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export const Docs = () => {
  const { S, ar } = useDocsStrings();

  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "ok" | "error">("all");

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const seq = useRef(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const queueRef = useRef<QueueItem[]>([]);

  const [pendingDelete, setPendingDelete] = useState<Doc | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  const load = () => {
    listDocs()
      .then((d) => setDocs(d.documents))
      .catch((e: Error) => setErr(String(e.message)));
  };

  useEffect(load, []);

  /* ---------------- queue ---------------- */

  const enqueue = (files: FileList | File[]) => {
    const added: QueueItem[] = Array.from(files).map((file) => ({
      key: `f${(seq.current += 1)}`,
      file,
      caption: "",
      status: "queued",
      chunks: 0,
      message: "",
    }));
    if (added.length === 0) return;
    setErr("");
    setQueue((q) => [...q, ...added]);
  };

  const patch = (key: string, p: Partial<QueueItem>) =>
    setQueue((q) => q.map((it) => (it.key === key ? { ...it, ...p } : it)));

  /**
   * Sequential, not parallel. Five concurrent multipart PDFs is how an upload
   * ends up half-landed with no way to say which half, and the server does the
   * extraction inline — parallelism here buys a race, not speed.
   */
  const run = async (keys: string[]) => {
    setUploading(true);
    try {
      for (const key of keys) {
        const item = queueRef.current.find((i) => i.key === key);
        if (!item) continue;
        patch(key, { status: "uploading", message: "" });
        try {
          const r = await uploadDoc(item.file, item.caption);
          if (r.ingested) {
            patch(key, { status: "ingested", chunks: r.chunks ?? 0, message: "" });
          } else {
            // A 201 with ingested:false IS a success — the bytes are stored.
            patch(key, { status: "stored", message: r.error || "" });
          }
        } catch (e) {
          patch(key, { status: "failed", message: (e as Error).message });
        }
        load();
      }
    } finally {
      setUploading(false);
    }
  };

  const pending = queue.filter((q) => q.status === "queued");
  const finished = queue.filter((q) => q.status !== "queued" && q.status !== "uploading");
  const settled = queue.filter(
    (q) => q.status === "ingested" || q.status === "stored" || q.status === "failed",
  ).length;

  /* ---------------- drag and drop ---------------- */

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current -= 1;
    if (dragDepth.current <= 0) setDragging(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    if (e.dataTransfer.files.length > 0) enqueue(e.dataTransfer.files);
  };

  /* ---------------- delete ---------------- */

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteDoc(pendingDelete.id);
      setPendingDelete(null);
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  /* ---------------- derived ---------------- */

  const all = docs ?? [];
  const inBrain = all.filter((d) => d.ingestStatus === "ok").length;
  const unreadable = all.filter((d) => d.ingestStatus === "error").length;
  const chunks = all.reduce((n, d) => n + d.chunks, 0);

  const shown = useMemo(() => {
    if (!docs) return null;
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (filter === "ok" && d.ingestStatus !== "ok") return false;
      if (filter === "error" && d.ingestStatus !== "error") return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.caption.toLowerCase().includes(q) ||
        d.kind.toLowerCase().includes(q)
      );
    });
  }, [docs, query, filter]);

  const filtering = filter !== "all" || query.trim() !== "";

  const queueLabel = (it: QueueItem) =>
    it.status === "queued"
      ? S.stQueued
      : it.status === "uploading"
        ? S.stUploading
        : it.status === "ingested"
          ? S.stIngested(it.chunks)
          : it.status === "stored"
            ? S.stStored
            : S.stFailed;

  const queueTone = (s: QueueStatus) =>
    s === "ingested"
      ? "text-success"
      : s === "stored"
        ? "text-warning"
        : s === "failed"
          ? "text-destructive"
          : "text-muted-foreground";

  return (
    <PageShell
      title={S.title}
      description={S.description}
      icon={<Library />}
      actions={
        <Button onClick={() => fileRef.current?.click()}>
          <Upload className="me-1.5 size-4" />
          {S.choose}
        </Button>
      }
    >
      <StatRow>
        <Stat label={S.statDocs} value={docs?.length ?? 0} />
        <Stat label={S.statInBrain} value={inBrain} tone={inBrain ? "success" : "muted"} />
        <Stat label={S.statUnreadable} value={unreadable} tone={unreadable ? "danger" : "muted"} />
        <Stat label={S.statChunks} value={chunks} />
      </StatRow>

      {err && (
        <Callout kind="warn" title={S.errTitle}>
          {err}
        </Callout>
      )}

      <FormCard title={S.uploadTitle}>
        {/* One input for the whole page: the header button, the drop zone and
            the empty state all open the same picker. */}
        <input
          ref={fileRef}
          id="file"
          type="file"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files) enqueue(e.target.files);
            e.target.value = "";
          }}
        />

        <div
          onDragEnter={handleDragEnter}
          onDragOver={(e) => e.preventDefault()}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "motion-hover flex flex-col items-center justify-center rounded-card border border-dashed px-4 py-8 text-center",
            dragging ? "border-primary bg-primary/5" : "border-border bg-card/40",
          )}
        >
          <span
            aria-hidden="true"
            className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground"
          >
            <Upload className="size-5" />
          </span>
          <p className="text-sm font-semibold text-foreground">
            {dragging ? S.dropActive : S.dropTitle}
          </p>
          <p className="mt-1 max-w-[52ch] text-xs text-muted-foreground">{S.dropHint}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => fileRef.current?.click()}
          >
            {queue.length > 0 ? S.addMore : S.choose}
          </Button>
        </div>

        {queue.length > 0 && (
          <div className="motion-entrance mt-4">
            <div className="mb-2 flex items-center gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {S.queueTitle}
              </h3>
              <span className="numeric text-[11px] text-muted-foreground">
                {settled === queue.length ? S.queueAllDone : S.queueProgress(settled, queue.length)}
              </span>
              {finished.length > 0 && !uploading && (
                <button
                  type="button"
                  onClick={() => setQueue((q) => q.filter((i) => i.status === "queued"))}
                  className="motion-hover ms-auto rounded-field text-xs text-muted-foreground hover:text-foreground"
                >
                  {S.clearFinished}
                </button>
              )}
            </div>

            <Footprint bordered>
              {queue.map((it) => {
                const needsCaption = isImage(it.file) && !it.caption.trim();
                const editable = it.status === "queued" || it.status === "failed";

                return (
                  <FootprintRow
                    key={it.key}
                    status={QUEUE_GLYPH[it.status]}
                    arabic={ar}
                    title={
                      <bdi className="break-all font-medium text-foreground">{it.file.name}</bdi>
                    }
                    artefacts={
                      <FootprintArtefact>{humanSize(it.file.size)}</FootprintArtefact>
                    }
                    trailing={
                      <>
                        {it.status === "failed" && (
                          <IconAction
                            icon={<RefreshCw />}
                            label={S.retry}
                            onClick={() => void run([it.key])}
                            disabled={uploading}
                          />
                        )}
                        {it.status !== "uploading" && (
                          <IconAction
                            icon={<X />}
                            label={S.removeFromQueue}
                            onClick={() => setQueue((q) => q.filter((i) => i.key !== it.key))}
                          />
                        )}
                      </>
                    }
                  >
                    <p className={cn("mt-0.5 text-xs", queueTone(it.status))}>{queueLabel(it)}</p>

                    {/* The reason, verbatim and beside the filename it belongs
                        to. This pairing is the entire point of the queue. */}
                    {it.message && (
                      <p className="mt-1 break-words rounded-field bg-muted/60 px-2 py-1 text-[11px] text-muted-foreground">
                        <bdi dir="ltr" className="font-mono">
                          {it.message}
                        </bdi>
                      </p>
                    )}

                    {it.status === "stored" && (
                      <p className="mt-1 text-[11px] text-muted-foreground">{S.stStoredWhy}</p>
                    )}

                    {editable && (
                      <div className="mt-2">
                        <Input
                          value={it.caption}
                          onChange={(e) => patch(it.key, { caption: e.target.value })}
                          placeholder={S.captionPlaceholder}
                          aria-label={S.captionAria}
                          className="h-8 text-xs"
                        />
                        {needsCaption && (
                          <p className="mt-1 flex items-start gap-1.5 text-[11px] text-warning">
                            <TriangleAlert aria-hidden="true" className="mt-px size-3 shrink-0" />
                            {S.imageNeedsCaption}
                          </p>
                        )}
                      </div>
                    )}
                  </FootprintRow>
                );
              })}
            </Footprint>
          </div>
        )}

        <FormFooter note={S.footerNote}>
          <Button
            onClick={() => void run(pending.map((p) => p.key))}
            disabled={uploading || pending.length === 0}
          >
            <Upload className="me-1.5 size-4" />
            {uploading
              ? S.uploadingCta
              : pending.length === 0
                ? S.uploadIdle
                : S.uploadCta(pending.length)}
          </Button>
        </FormFooter>
      </FormCard>

      <Section
        title={S.sectionDocs}
        count={docs?.length}
        actions={
          all.length > 0 ? (
            <div className="flex flex-wrap items-center gap-1.5">
              <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
                {S.fAll}
              </FilterChip>
              <FilterChip active={filter === "ok"} onClick={() => setFilter("ok")}>
                {S.fInBrain}
                <span className="numeric opacity-70">{inBrain}</span>
              </FilterChip>
              <FilterChip active={filter === "error"} onClick={() => setFilter("error")}>
                {S.fUnreadable}
                <span className="numeric opacity-70">{unreadable}</span>
              </FilterChip>
              <FilterBox
                value={query}
                onChange={setQuery}
                placeholder={S.filterPlaceholder}
                clearLabel={S.clearFilter}
              />
            </div>
          ) : undefined
        }
      >
        {docs === null && <ListSkeleton rows={3} />}

        {docs?.length === 0 && (
          <EmptyState
            icon={<FileText />}
            title={S.emptyTitle}
            description={S.emptyDesc}
            action={
              <Button onClick={() => fileRef.current?.click()}>
                <Upload className="me-1.5 size-4" />
                {S.choose}
              </Button>
            }
          />
        )}

        {all.length > 0 && shown?.length === 0 && (
          <EmptyState
            variant="filtered"
            size="sm"
            icon={<Search />}
            title={S.noMatchTitle}
            description={S.noMatchDesc}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setQuery("");
                  setFilter("all");
                }}
              >
                {S.clearFilter}
              </Button>
            }
          />
        )}

        {shown && shown.length > 0 && (
          <Rows>
            {shown.map((d) => (
              <DocRow
                key={d.id}
                d={d}
                onChanged={load}
                onError={setErr}
                onRequestDelete={setPendingDelete}
              />
            ))}
          </Rows>
        )}

        {filtering && shown && shown.length > 0 && shown.length < all.length && (
          <p className="numeric text-[11px] text-muted-foreground">
            {shown.length} / {all.length}
          </p>
        )}
      </Section>

      {/* Replaces window.confirm(): themed, translated, and able to list what
          is actually lost — which the browser dialog could never do. */}
      <ConfirmAction
        open={pendingDelete !== null}
        onOpenChange={(next) => {
          if (!next) setPendingDelete(null);
        }}
        title={S.deleteTitle}
        description={
          <span>
            {S.deleteDescLead}
            <bdi dir="ltr" className="font-mono">
              {pendingDelete?.name}
            </bdi>
            {S.deleteDescTail}
          </span>
        }
        consequences={[S.deleteC1, S.deleteC2, S.deleteC3]}
        confirmLabel={S.deleteConfirm}
        busy={deleting}
        onConfirm={handleDelete}
      />
    </PageShell>
  );
};
Docs.displayName = "Docs";
