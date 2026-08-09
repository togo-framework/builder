-- The reference library: the files a person would hand a new engineer.
--
-- Specs, plans, CSVs, PDFs, branding images, a design workflow. brain.Extract
-- and brain.IngestDocument already turn one of these into memories an agent can
-- quote; nothing stored one, so nothing ever called them. This table is the
-- half that was missing.
--
-- WHY THE BYTES LIVE HERE AND NOT ON DISK
-- The runner executes wherever it happens to run, and agents now carry per-agent
-- workdirs spanning more than one repository. A file written to local disk is
-- readable by exactly one process on one machine, and invisible to the next
-- deploy. The database is the only storage every instance already shares.
-- 25 MB is the ingestion ceiling (brain.MaxDocumentBytes), which bounds this.
--
-- WHY THE EXTRACTED TEXT IS KEPT ALONGSIDE THE BYTES
-- So a re-ingest after an embedder change does not re-parse every PDF, and so
-- an operator can see what was actually read out of a file. "The PDF is in the
-- library but the agent cannot answer from it" is otherwise unanswerable
-- without re-running the extractor by hand.

CREATE TABLE IF NOT EXISTS builder_documents (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Name is IDENTITY, matching brain.Document: re-uploading the same name
    -- replaces that document's chunks rather than adding a second copy. The
    -- UNIQUE below is what makes the upsert in the API a single statement.
    -- It is never used to build a filesystem path.
    name text NOT NULL CHECK (length(name) BETWEEN 1 AND 300),

    -- The sniffed content type, authoritative over the extension.
    mime text NOT NULL DEFAULT '',

    -- 'text' | 'csv' | 'pdf' | 'image', decided by brain.Document.Kind().
    -- Stored so a list screen can group without re-sniffing every blob.
    kind text NOT NULL DEFAULT '',

    -- Operator prose. For an image it is the only text there is until there is
    -- an OCR step, which is why an image with no caption is worth flagging.
    caption text NOT NULL DEFAULT '',

    bytes bytea NOT NULL,
    size_bytes integer NOT NULL DEFAULT 0,

    -- What the extractor actually read. Empty on an image without a caption.
    extracted_text text NOT NULL DEFAULT '',

    -- The project brain this document's chunks were retained into. A document
    -- never enters an agent's private brain — see the CHECK, which mirrors the
    -- guard in brain.IngestDocument and the one on sources.
    namespace text NOT NULL DEFAULT ''
        CHECK (namespace = '' OR namespace LIKE '%:project'),

    chunks   integer NOT NULL DEFAULT 0,
    -- '' | 'ok' | 'error'. A document that stored but failed to ingest is the
    -- state most worth being able to see: the file is safe, the knowledge is
    -- not there, and nothing else would say so.
    ingest_status text NOT NULL DEFAULT ''
        CHECK (ingest_status IN ('','ok','error')),
    ingest_error  text NOT NULL DEFAULT '',

    uploaded_by text NOT NULL DEFAULT '',
    created_at  timestamptz NOT NULL DEFAULT now(),
    updated_at  timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT builder_documents_name_uniq UNIQUE (name)
);

-- The list screen's only ordering.
CREATE INDEX IF NOT EXISTS builder_documents_recent_idx
    ON builder_documents (created_at DESC);
