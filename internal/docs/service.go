// Package docs is the project's reference library: the files a person would
// hand a new engineer, made available to the fleet.
//
// brain.Extract and brain.IngestDocument already turned a file into memories an
// agent could quote. Nothing stored a file, so nothing ever called them — the
// extraction work shipped as a library with no caller, which is the same as not
// shipping. This package is the half that was missing: upload, store, ingest,
// list, re-ingest, delete.
package docs

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/togo-framework/builder/internal/brain"
)

// Ingester is the brain, narrowed to the two calls this package makes.
// *brain.Store satisfies it.
type Ingester interface {
	IngestDocument(ctx context.Context, ns string, d brain.Document, opts brain.ChunkOptions) (brain.IngestResult, error)
	ProjectNamespaceFor(ctx context.Context) string
	ForgetDocument(ctx context.Context, ns, name string) (int, error)
}

type Service struct {
	db    *sql.DB
	log   *slog.Logger
	brain Ingester
}

func New(db *sql.DB, log *slog.Logger, b Ingester) *Service {
	return &Service{db: db, log: log, brain: b}
}

func (s *Service) Routes(r chi.Router) {
	r.Get("/", s.handleList)
	r.Post("/", s.handleUpload)
	r.Get("/{id}/content", s.handleDownload)
	r.Post("/{id}/reingest", s.handleReingest)
	r.Delete("/{id}", s.handleDelete)
}

type view struct {
	ID           string    `json:"id"`
	Name         string    `json:"name"`
	Mime         string    `json:"mime"`
	Kind         string    `json:"kind"`
	Caption      string    `json:"caption"`
	SizeBytes    int       `json:"sizeBytes"`
	Namespace    string    `json:"namespace"`
	Chunks       int       `json:"chunks"`
	IngestStatus string    `json:"ingestStatus"`
	IngestError  string    `json:"ingestError"`
	UploadedBy   string    `json:"uploadedBy"`
	CreatedAt    time.Time `json:"createdAt"`
	// Excerpt is the first of the extracted text, so an operator can see what
	// was actually read out of a file. "It is in the library but the agent
	// cannot answer from it" is otherwise unanswerable without re-running the
	// extractor by hand.
	Excerpt string `json:"excerpt"`
}

func (s *Service) handleList(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(),
		// bytes is deliberately not selected: a list of ten PDFs would be a
		// hundred megabytes of JSON. The blob has its own endpoint.
		`SELECT id, name, mime, kind, caption, size_bytes, namespace, chunks,
		        ingest_status, ingest_error, uploaded_by, created_at,
		        left(extracted_text, 400)
		   FROM builder_documents ORDER BY created_at DESC`)
	if err != nil {
		s.log.Error("list documents", "err", err)
		httpErr(w, http.StatusInternalServerError, "could not list the documents")
		return
	}
	defer rows.Close()

	out := []view{}
	for rows.Next() {
		var v view
		if err := rows.Scan(&v.ID, &v.Name, &v.Mime, &v.Kind, &v.Caption, &v.SizeBytes,
			&v.Namespace, &v.Chunks, &v.IngestStatus, &v.IngestError, &v.UploadedBy,
			&v.CreatedAt, &v.Excerpt); err != nil {
			httpErr(w, http.StatusInternalServerError, "could not read the documents")
			return
		}
		out = append(out, v)
	}
	writeJSON(w, http.StatusOK, map[string]any{"documents": out})
}

// handleUpload stores a file and ingests it, in that order.
//
// Storing first is the whole design. Extraction can fail — an encrypted PDF, a
// format nobody anticipated — and a failed extraction must not lose the
// operator's file. The row lands with ingest_status 'error' and the bytes
// intact, so re-ingest is a button rather than another upload.
func (s *Service) handleUpload(w http.ResponseWriter, r *http.Request) {
	// One byte over the ingestion ceiling is refused before it is read into
	// memory, rather than after.
	if err := r.ParseMultipartForm(brain.MaxDocumentBytes); err != nil {
		httpErr(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("that upload is too large — the limit is %d MB", brain.MaxDocumentBytes>>20))
		return
	}
	file, header, err := r.FormFile("file")
	if err != nil {
		httpErr(w, http.StatusBadRequest, "attach a file in the \"file\" field")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(io.LimitReader(file, brain.MaxDocumentBytes+1))
	if err != nil {
		httpErr(w, http.StatusInternalServerError, "could not read the upload")
		return
	}
	if len(data) > brain.MaxDocumentBytes {
		httpErr(w, http.StatusRequestEntityTooLarge,
			fmt.Sprintf("that file is over the %d MB limit", brain.MaxDocumentBytes>>20))
		return
	}
	if len(data) == 0 {
		httpErr(w, http.StatusUnprocessableEntity, "that file is empty")
		return
	}

	name := strings.TrimSpace(r.FormValue("name"))
	if name == "" {
		name = header.Filename
	}
	// A name is identity and is never used to build a path, but it is rendered
	// in a browser and used as a memory ref, so the separators that would let
	// one document forge another's refs are refused here.
	if name == "" || strings.ContainsAny(name, "/\\\x00#") {
		httpErr(w, http.StatusUnprocessableEntity,
			"give the document a name without slashes or #")
		return
	}
	if len(name) > 300 {
		httpErr(w, http.StatusUnprocessableEntity, "that name is too long")
		return
	}

	mime := header.Header.Get("Content-Type")
	if mime == "" || mime == "application/octet-stream" {
		// The browser's guess is often absent or useless; sniff the bytes.
		mime = http.DetectContentType(data)
	}
	doc := brain.Document{
		Name:    name,
		Mime:    mime,
		Caption: strings.TrimSpace(r.FormValue("caption")),
		Data:    data,
	}

	// Extract before writing, so the row carries the text and the honest status
	// from the moment it exists. A row that says nothing about its own
	// ingestion is a row somebody has to investigate.
	text, extractErr := brain.Extract(doc)

	var id string
	err = s.db.QueryRowContext(r.Context(),
		`INSERT INTO builder_documents
		   (name, mime, kind, caption, bytes, size_bytes, extracted_text, uploaded_by)
		 VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
		 ON CONFLICT (name) DO UPDATE SET
		   mime = EXCLUDED.mime, kind = EXCLUDED.kind, caption = EXCLUDED.caption,
		   bytes = EXCLUDED.bytes, size_bytes = EXCLUDED.size_bytes,
		   extracted_text = EXCLUDED.extracted_text, updated_at = now()
		 RETURNING id`,
		doc.Name, doc.Mime, doc.Kind(), doc.Caption, doc.Data, len(doc.Data),
		text, principal(r)).Scan(&id)
	if err != nil {
		s.log.Error("store document", "name", doc.Name, "err", err)
		httpErr(w, http.StatusInternalServerError, "could not store the document")
		return
	}

	if extractErr != nil {
		s.markIngest(r.Context(), id, "", 0, "error", extractErr.Error())
		// 201, not 500: the file IS stored, which is most of what the operator
		// asked for. Reporting a failure the upload did not actually suffer
		// would send them re-uploading a file that is already safe.
		writeJSON(w, http.StatusCreated, map[string]any{
			"id": id, "name": doc.Name, "ingested": false,
			"error": "stored, but the text could not be extracted: " + extractErr.Error(),
		})
		return
	}

	res, ingestErr := s.ingest(r.Context(), id, doc)
	if ingestErr != nil {
		writeJSON(w, http.StatusCreated, map[string]any{
			"id": id, "name": doc.Name, "ingested": false,
			"error": "stored, but could not enter the brain: " + ingestErr.Error(),
		})
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{
		"id": id, "name": doc.Name, "ingested": true,
		"chunks": res.Chunks, "namespace": res.Namespace,
	})
}

// ingest pushes one document into the project brain and records the outcome.
func (s *Service) ingest(ctx context.Context, id string, doc brain.Document) (brain.IngestResult, error) {
	ns := s.brain.ProjectNamespaceFor(ctx)
	res, err := s.brain.IngestDocument(ctx, ns, doc, brain.ChunkOptions{})
	if err != nil {
		s.markIngest(ctx, id, ns, 0, "error", err.Error())
		s.log.Warn("document stored but not ingested", "name", doc.Name, "err", err)
		return res, err
	}
	s.markIngest(ctx, id, ns, res.Chunks, "ok", "")
	s.log.Info("document ingested", "name", doc.Name, "chunks", res.Chunks, "namespace", ns)
	return res, nil
}

func (s *Service) markIngest(ctx context.Context, id, ns string, chunks int, status, errText string) {
	if _, err := s.db.ExecContext(ctx,
		`UPDATE builder_documents
		    SET namespace=$2, chunks=$3, ingest_status=$4, ingest_error=$5, updated_at=now()
		  WHERE id=$1`, id, ns, chunks, status, truncate(errText, 2000)); err != nil {
		// Logged rather than discarded: this is the row that tells an operator
		// whether the knowledge is actually in the brain, and a silent failure
		// here leaves a document looking permanently mid-upload.
		s.log.Error("could not record the ingest outcome", "document", id, "err", err)
	}
}

// handleReingest re-runs extraction and ingestion from the stored bytes.
//
// The reason this exists rather than "upload it again": after an embedder
// change every document needs re-embedding, and asking an operator to find and
// re-upload thirty files is not a plan.
func (s *Service) handleReingest(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var doc brain.Document
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT name, mime, caption, bytes FROM builder_documents WHERE id=$1`, id).
		Scan(&doc.Name, &doc.Mime, &doc.Caption, &doc.Data); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpErr(w, http.StatusNotFound, "no such document")
			return
		}
		httpErr(w, http.StatusInternalServerError, "could not read the document")
		return
	}
	text, err := brain.Extract(doc)
	if err != nil {
		s.markIngest(r.Context(), id, "", 0, "error", err.Error())
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	_, _ = s.db.ExecContext(r.Context(),
		`UPDATE builder_documents SET extracted_text=$2, updated_at=now() WHERE id=$1`, id, text)

	res, err := s.ingest(r.Context(), id, doc)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"ok": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true, "chunks": res.Chunks})
}

// handleDownload serves the original bytes.
//
// Content-Disposition is attachment for everything. Serving an operator-uploaded
// file inline would render whatever HTML or SVG it contains on this origin,
// with this session's cookies.
func (s *Service) handleDownload(w http.ResponseWriter, r *http.Request) {
	var name, mime string
	var data []byte
	if err := s.db.QueryRowContext(r.Context(),
		`SELECT name, mime, bytes FROM builder_documents WHERE id=$1`,
		chi.URLParam(r, "id")).Scan(&name, &mime, &data); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpErr(w, http.StatusNotFound, "no such document")
			return
		}
		httpErr(w, http.StatusInternalServerError, "could not read the document")
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf("attachment; filename*=UTF-8''%s", urlEscape(name)))
	_, _ = w.Write(data)
}

// handleDelete removes the file AND the memories it produced.
//
// Unlike deleting a source — where the pipe goes and the knowledge stays —
// deleting a document means the operator no longer wants that text answering
// questions. Leaving its chunks behind would keep it doing exactly that, with
// no file left to explain where the answer came from.
func (s *Service) handleDelete(w http.ResponseWriter, r *http.Request) {
	var name, ns string
	if err := s.db.QueryRowContext(r.Context(),
		`DELETE FROM builder_documents WHERE id=$1 RETURNING name, namespace`,
		chi.URLParam(r, "id")).Scan(&name, &ns); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			httpErr(w, http.StatusNotFound, "no such document")
			return
		}
		httpErr(w, http.StatusInternalServerError, "could not delete the document")
		return
	}
	if ns != "" {
		if n, err := s.brain.ForgetDocument(r.Context(), ns, name); err != nil {
			// The file is already gone, so this cannot be a failure response.
			// It is a real problem though: memories now outlive their source.
			s.log.Error("document deleted but its memories remain",
				"name", name, "namespace", ns, "err", err)
		} else {
			s.log.Info("document and its memories deleted", "name", name, "chunks", n)
		}
	}
	w.WriteHeader(http.StatusNoContent)
}

func principal(r *http.Request) string {
	if v, ok := r.Context().Value(ctxUserEmail).(string); ok {
		return v
	}
	return ""
}

// ctxUserEmail mirrors the auth middleware's key. Typed, not a bare string, so
// nothing else can collide with it.
type ctxKey string

const ctxUserEmail ctxKey = "user_email"

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}

func urlEscape(s string) string {
	var b strings.Builder
	for _, r := range []byte(s) {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') ||
			r == '-' || r == '_' || r == '.' || r == '~' {
			b.WriteByte(r)
			continue
		}
		fmt.Fprintf(&b, "%%%02X", r)
	}
	return b.String()
}

func writeJSON(w http.ResponseWriter, code int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(v)
}

func httpErr(w http.ResponseWriter, code int, msg string) {
	writeJSON(w, code, map[string]string{"error": msg})
}
