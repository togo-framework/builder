import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Pencil, Trash2, Eye, Plus, Download } from "lucide-react";
import {
  PageHeader, Button, Badge, Alert,
  DataTable, DataTableToolbar, DataTableSearch, DataTableFacetFilter, DataTableViewOptions, DataTableBulkActions, DataTablePagination,
  useDataTable, type DataTableColumn, type DataTableSort,
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
  toast,
} from "@fadymondy/nasaq/web";
import {
  adminListPaged, adminCreate, adminUpdate, adminDelete, resourceFields,
  controlFor, formatValue, type ResourceField, type PagedResult,
} from "../lib/admin";
import { ResourceForm, validateForm } from "../components/admin/ResourceForm";
import { Infolist } from "../components/admin/Infolist";
import { useLang } from "../lib/locale";
import { API } from "../lib/api";

type Row = Record<string, any>;
type Mode = "create" | "edit" | "view" | "delete";

const labelOf = (name: string) => name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

const PAGE_SIZE = 20;

export function AdminResource() {
  const { resource } = useParams({ strict: false }) as { resource: string };
  const { locale: language, tx } = useLang();
  const single = resource.replace(/s$/, "");

  // Data state
  const [result, setResult] = useState<PagedResult | null>(null);
  const [fields, setFields] = useState<ResourceField[]>([]);
  const [err, setErr] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Server-side state: the table reports changes, we re-fetch.
  const [sort, setSort] = useState<DataTableSort | null>(null);
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");

  // Modal + form state
  const [modal, setModal] = useState<{ mode: Mode; row?: Row; ids?: string[] } | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // Latest query state, so the live-update listener refetches the current page.
  const state = useRef({ sort, page, query });
  state.current = { sort, page, query };

  const refresh = useCallback(async () => {
    const { sort: s, page: p, query: q } = state.current;
    const r = await adminListPaged(resource, {
      page: p + 1,
      pageSize: PAGE_SIZE,
      sort: s?.id,
      order: s?.direction,
      search: q || undefined,
    }).catch(() => ({ items: [], total: 0, page: 1, pageSize: PAGE_SIZE }));
    setResult(r);
  }, [resource]);

  // Reset state when switching resources, and follow live changes over SSE.
  useEffect(() => {
    setSort(null); setPage(0); setQuery("");
    state.current = { sort: null, page: 0, query: "" };
    setResult(null);
    resourceFields(resource).then(setFields);
    refresh();
    const es = new EventSource(`${API}/events`);
    es.onmessage = () => refresh();
    return () => es.close();
  }, [resource, refresh]);

  useEffect(() => { refresh(); }, [sort, page, query, refresh]);

  function open(mode: Mode, row?: Row) {
    const init: Record<string, string> = {};
    fields.forEach((f) => (init[f.name] = row ? String(row[f.name] ?? "") : ""));
    setForm(init); setErr(""); setErrors({}); setModal({ mode, row });
  }

  async function save() {
    setErr("");
    const { errors: errs, ok } = validateForm(fields, form);
    setErrors(errs);
    if (!ok) return;
    setSaving(true);
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const v = form[f.name] ?? "";
      const c = controlFor(f);
      if (v === "") { if (!f.nullable && c !== "switch") payload[f.name] = ""; continue; }
      payload[f.name] = c === "number" || c === "relation" ? Number(v) : c === "switch" ? v === "true" : c === "json" ? safeJson(v) : v;
    }
    try {
      if (modal?.mode === "edit") { await adminUpdate(resource, modal.row!.id, payload); toast.success(tx("Updated", "تم التحديث")); }
      else { await adminCreate(resource, payload); toast.success(tx("Created", "تم الإنشاء")); }
      setModal(null); await refresh();
    } catch (e: any) { setErr(e.message); toast.error(e.message); }
    finally { setSaving(false); }
  }

  async function del(ids: string[]) {
    setErr("");
    try {
      await Promise.all(ids.map((id) => adminDelete(resource, id)));
      setModal(null); table.setSelection(new Set());
      toast.success(tx(`Deleted ${ids.length}`, `تم حذف ${ids.length}`)); await refresh();
    } catch (e: any) { setErr(e.message); toast.error(e.message); }
  }

  const columns = useMemo<DataTableColumn<Row>[]>(() => [
    { id: "id", header: "ID", cell: (r) => <span className="text-muted-foreground">#{String(r.id)}</span>, sortValue: (r) => r.id, hideable: false },
    ...fields.map((f): DataTableColumn<Row> => ({
      id: f.name,
      header: labelOf(f.name),
      cell: (r) => <Cell f={f} v={r[f.name]} language={language} />,
      sortValue: (r) => r[f.name],
      filterValue: (r) => String(r[f.name] ?? ""),
    })),
  ], [fields, language]);

  // Per-column facet filters for enum + boolean fields (Filament-style table filters).
  const facets = useMemo(() =>
    fields.filter((f) => f.enum?.length || /bool/.test(f.type.toLowerCase())).map((f) => ({
      column: f.name,
      options: (f.enum?.length ? f.enum : ["true", "false"]).map((v) => ({ value: v, label: v })),
    })), [fields]);

  // The API pages, sorts and searches; facet filters narrow the loaded page.
  const [filters, setFilters] = useState<Record<string, string[]>>({});
  const rows = useMemo(() => (result?.items ?? []).filter((r: Row) =>
    Object.entries(filters).every(([k, vs]) => !vs.length || vs.includes(String(r[k] ?? "")))), [result, filters]);

  const table = useDataTable<Row>({
    data: rows,
    columns,
    getRowId: (r) => String(r.id),
    pageSize: PAGE_SIZE,
    selectable: true,
    manual: true,
    rowCount: result?.total ?? 0,
    sort: { value: sort, onChange: (s) => { setSort(s); setPage(0); } },
    page: { value: page, onChange: setPage },
    query: { value: query, onChange: (q) => { setQuery(q); setPage(0); } },
    filters: { value: filters, onChange: setFilters },
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={labelOf(resource)}
        description={`${result?.total ?? 0} ${tx("records", "سجل")}`}
        actions={<Button variant="primary" onClick={() => open("create")}><Plus />{tx("Create", "إضافة")}</Button>}
      />
      {err && <Alert tone="danger" onDismiss={() => setErr("")}>{err}</Alert>}

      <div className="flex flex-col gap-3">
        <DataTableToolbar>
          <DataTableSearch table={table} />
          {facets.map((f) => <DataTableFacetFilter key={f.column} table={table} column={f.column} options={f.options} />)}
          <DataTableViewOptions table={table} className="ms-auto" />
        </DataTableToolbar>
        <DataTableBulkActions table={table}>
          <Button size="sm" variant="secondary" onClick={() => exportRows(table.selectedRows, resource)}><Download />{tx("Export", "تصدير")}</Button>
          <Button size="sm" variant="danger" onClick={() => setModal({ mode: "delete", ids: [...table.selection] })}><Trash2 />{tx("Delete", "حذف")}</Button>
        </DataTableBulkActions>
        <DataTable
          table={table}
          label={labelOf(resource)}
          loading={result === null}
          onRowClick={(r) => open("view", r)}
          rowActions={(r) => [
            { id: "view", label: tx("View", "عرض"), icon: Eye, onSelect: () => open("view", r) },
            { id: "edit", label: tx("Edit", "تعديل"), icon: Pencil, onSelect: () => open("edit", r) },
            { id: "delete", label: tx("Delete", "حذف"), icon: Trash2, danger: true, group: "danger", onSelect: () => setModal({ mode: "delete", ids: [String(r.id)] }) },
          ]}
        />
        <DataTablePagination table={table} />
      </div>

      {/* Create / edit — schema form with validation + relation pickers. */}
      <Dialog open={modal?.mode === "create" || modal?.mode === "edit"} onOpenChange={(o) => { if (!o) setModal(null); }}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader><DialogTitle className="capitalize">{modal?.mode === "edit" ? tx("Edit", "تعديل") : tx("Create", "إضافة")} {single}</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-0.5 py-1">
            <ResourceForm fields={fields} value={form} errors={errors} onChange={setForm} language={language} />
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setModal(null)}>{tx("Cancel", "إلغاء")}</Button>
            <Button variant="primary" onClick={save} loading={saving}>{tx("Save", "حفظ")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View — infolist. */}
      <Dialog open={modal?.mode === "view"} onOpenChange={(o) => { if (!o) setModal(null); }}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader><DialogTitle className="capitalize">{single}</DialogTitle></DialogHeader>
          {modal?.row && <Infolist row={modal.row} fields={fields} language={language} />}
          <DialogFooter>
            <Button variant="secondary" onClick={() => setModal(null)}>{tx("Close", "إغلاق")}</Button>
            <Button variant="primary" onClick={() => modal?.row && open("edit", modal.row)}>{tx("Edit", "تعديل")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation (one row or the bulk selection). */}
      <AlertDialog open={modal?.mode === "delete"} onOpenChange={(o) => { if (!o) setModal(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {(modal?.ids?.length ?? 0) > 1 ? tx(`Delete ${modal?.ids?.length} records?`, `حذف ${modal?.ids?.length} سجلات؟`) : tx("Delete this record?", "حذف هذا السجل؟")}
            </AlertDialogTitle>
            <AlertDialogDescription>{tx("This action cannot be undone.", "لا يمكن التراجع عن هذا الإجراء.")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tx("Cancel", "إلغاء")}</AlertDialogCancel>
            <AlertDialogAction variant="danger" onClick={() => del(modal?.ids ?? [])}>{tx("Delete", "حذف")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function Cell({ f, v, language }: { f: ResourceField; v: any; language: string }) {
  const c = controlFor(f);
  if (v === null || v === undefined || v === "") return <span className="text-muted-foreground">—</span>;
  if (c === "switch" || typeof v === "boolean") {
    const on = v === true || v === "true";
    return <Badge variant={on ? "success" : "neutral"}>{on ? "Yes" : "No"}</Badge>;
  }
  if (c === "select") return <Badge variant="neutral" className="capitalize">{String(v)}</Badge>;
  if (c === "relation") return <Badge variant="outline">#{String(v)}</Badge>;
  return <span className="line-clamp-1 max-w-[28ch]">{formatValue(f, v, language)}</span>;
}

function safeJson(s: string): unknown { try { return JSON.parse(s); } catch { return s; } }

/** Export selected rows as a CSV download (bulk action). */
function exportRows(rows: Record<string, any>[], name: string) {
  if (!rows.length) return;
  const cols = Array.from(new Set(rows.flatMap((r) => Object.keys(r))));
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a"); a.href = url; a.download = `${name}-selected.csv`; a.click(); URL.revokeObjectURL(url);
}
