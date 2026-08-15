// A form rendered from a JSON Schema.
//
// The schemas live in Go (internal/integrations), and they are already the
// server's validation contract. Rendering the form from the same declaration
// means a field cannot be required on one side and optional on the other, and
// adding an integration needs no UI work at all.
//
// This handles the subset the catalogue actually uses — string, integer,
// boolean, enum, plus `format` hints for secrets and URLs. It is deliberately
// not a general JSON Schema implementation: supporting oneOf and nested objects
// would be a lot of code for shapes nothing declares, and the moment something
// does declare one this file should grow rather than the schema shrink.

import { useMemo, useState } from "react";
import {
  Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea,
} from "@togo-framework/ui";

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  title?: string;
  description?: string;
  default?: unknown;
  enum?: string[];
  format?: string;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
}

export type Values = Record<string, unknown>;

/** Seed a form from the schema's own defaults, so a field with a sensible
 *  default arrives filled rather than empty. */
export function defaultsOf(schema: JSONSchema): Values {
  const out: Values = {};
  for (const [k, p] of Object.entries(schema.properties ?? {})) {
    if (p.default !== undefined) out[k] = p.default;
    else if (p.type === "boolean") out[k] = false;
  }
  return out;
}

/**
 * Validate against the schema, returning one message per bad field.
 *
 * Client-side only, and it is a courtesy rather than a control: the server
 * validates the same schema and its answer is the one that counts. What this
 * buys is telling someone a URL is malformed before a round trip, not
 * permission to skip the server check.
 */
export function validate(schema: JSONSchema, values: Values): Record<string, string> {
  const errs: Record<string, string> = {};
  const required = new Set(schema.required ?? []);

  for (const [k, p] of Object.entries(schema.properties ?? {})) {
    const v = values[k];
    const empty = v === undefined || v === null || v === "";

    if (required.has(k) && empty) {
      errs[k] = "Required";
      continue;
    }
    if (empty) continue;

    if (p.type === "integer" || p.type === "number") {
      const n = Number(v);
      if (!Number.isFinite(n)) errs[k] = "Must be a number";
      else if (p.minimum !== undefined && n < p.minimum) errs[k] = `Minimum ${p.minimum}`;
      else if (p.maximum !== undefined && n > p.maximum) errs[k] = `Maximum ${p.maximum}`;
      continue;
    }
    const s = String(v);
    if (p.minLength && s.length < p.minLength) errs[k] = `At least ${p.minLength} characters`;
    else if (p.maxLength && s.length > p.maxLength) errs[k] = `At most ${p.maxLength} characters`;
    else if (p.pattern && !new RegExp(p.pattern).test(s)) errs[k] = "Wrong format";
    else if (p.format === "uri" && !/^https?:\/\/\S+$/i.test(s)) errs[k] = "Must be a URL";
    else if (p.format === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s)) errs[k] = "Must be an email";
  }
  return errs;
}

function Label({ name, p, required }: { name: string; p: JSONSchema; required: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-sm font-medium">{p.title || name}</span>
      {required && <span className="text-xs text-danger">*</span>}
      {p.format === "secret-name" && (
        // Said on the form, not just in the docs: people paste the token here
        // otherwise, and a token in a config column is readable by everyone
        // with SELECT and lands in every backup.
        <span className="text-[11px] text-muted-foreground">
          — the secret&apos;s NAME, not its value
        </span>
      )}
    </div>
  );
}

export function SchemaForm({
  schema, values, errors, onChange,
}: {
  schema: JSONSchema;
  values: Values;
  errors: Record<string, string>;
  onChange: (next: Values) => void;
}) {
  const required = useMemo(() => new Set(schema.required ?? []), [schema]);
  const set = (k: string, v: unknown) => onChange({ ...values, [k]: v });

  const entries = Object.entries(schema.properties ?? {});
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing to configure.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map(([k, p]) => {
        const err = errors[k];
        const val = values[k];
        return (
          <div key={k} className="flex flex-col gap-1">
            <Label name={k} p={p} required={required.has(k)} />
            {p.description && (
              <p className="text-xs text-muted-foreground">{p.description}</p>
            )}

            {p.enum ? (
              <Select value={String(val ?? "")} onValueChange={(v) => set(k, v)}>
                <SelectTrigger><SelectValue placeholder="Choose…" /></SelectTrigger>
                <SelectContent>
                  {p.enum.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            ) : p.type === "boolean" ? (
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(val)}
                  onChange={(e) => set(k, e.target.checked)}
                  className="size-4 accent-[var(--color-primary)]"
                />
                <span className="text-muted-foreground">{p.title || k}</span>
              </label>
            ) : p.type === "integer" || p.type === "number" ? (
              <Input
                type="number"
                value={val === undefined ? "" : String(val)}
                min={p.minimum}
                max={p.maximum}
                onChange={(e) => set(k, e.target.value === "" ? undefined : Number(e.target.value))}
              />
            ) : (p.maxLength ?? 0) > 400 ? (
              // A query or a body is multi-line by nature; a single-line input
              // for a SQL statement is unreadable the moment it has a JOIN.
              <Textarea
                rows={4}
                value={String(val ?? "")}
                onChange={(e) => set(k, e.target.value)}
                className="font-mono text-xs"
                dir="ltr"
              />
            ) : (
              <Input
                // dir=ltr on anything machine-shaped: a URL, a DSN or an id
                // reorders visually inside an Arabic page otherwise, and the
                // operator cannot tell what they pasted.
                dir={p.format === "uri" || p.format === "secret-name" ? "ltr" : undefined}
                value={String(val ?? "")}
                onChange={(e) => set(k, e.target.value)}
                placeholder={p.default !== undefined ? String(p.default) : undefined}
              />
            )}

            {err && <p className="text-xs text-danger">{err}</p>}
          </div>
        );
      })}
    </div>
  );
}

/** A convenience for the caller: schema + values → validated payload or errors. */
export function useSchemaForm(schema: JSONSchema | undefined) {
  const [values, setValues] = useState<Values>(() => (schema ? defaultsOf(schema) : {}));
  const [errors, setErrors] = useState<Record<string, string>>({});

  const check = () => {
    if (!schema) return true;
    const e = validate(schema, values);
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  /** Drop empty optionals so the stored config holds what was set and nothing
   *  else — an explicit "" is indistinguishable from a deliberate blank later. */
  const payload = () =>
    Object.fromEntries(
      Object.entries(values).filter(([, v]) => v !== undefined && v !== null && v !== ""),
    );

  return { values, setValues, errors, setErrors, check, payload };
}
