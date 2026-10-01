import { Infolist as NasaqInfolist, Badge, type InfolistItem } from "@fadymondy/nasaq/web";
import { controlFor, formatValue, type ResourceField } from "../../lib/admin";

const labelOf = (name: string) => name.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/** A Filament-style infolist over Nasaq's Infolist: labelled key/value rows with badges
 * for enums/bools, formatted dates, and a placeholder for empties. Driven by the resource schema. */
export function Infolist({ row, fields, language = "en" }: { row: Record<string, any>; fields: ResourceField[]; language?: string }) {
  const byName = new Map(fields.map((f) => [f.name, f]));
  // Show schema fields first (in declared order), then any extra row keys (id/timestamps).
  const keys = [
    "id",
    ...fields.map((f) => f.name).filter((n) => n !== "id"),
    ...Object.keys(row).filter((k) => k !== "id" && !byName.has(k)),
  ].filter((k, i, a) => a.indexOf(k) === i && k in row);

  const items: InfolistItem[] = keys.map((k) => {
    const f = byName.get(k);
    const v = row[k];
    const control = f ? controlFor(f) : "text";
    const base = { id: k, label: labelOf(k), value: v === "" ? undefined : v };
    if (control === "switch" || typeof v === "boolean") return { ...base, type: "boolean", value: v === null || v === undefined ? undefined : v === true || v === "true" };
    if (control === "select") return { ...base, render: (x) => <Badge variant="neutral" className="capitalize">{String(x)}</Badge> };
    if (control === "relation") return { ...base, render: (x) => <Badge variant="outline">#{String(x)}</Badge> };
    if (control === "textarea" || control === "json") return { ...base, wide: true, type: control === "json" ? "code" : "text", value: control === "json" && v != null && typeof v !== "string" ? JSON.stringify(v, null, 2) : base.value };
    if (k === "id") return { ...base, copyable: true };
    return { ...base, value: v == null || v === "" ? undefined : formatValue(f, v, language) };
  });

  return <NasaqInfolist items={items} locale={language} />;
}
