import { useState } from "react";
import { Markdown, Tabs, TabsList, TabsTab, Textarea, cn } from "@fadymondy/nasaq/web";
import { useLocale } from "../../lib/locale";

/**
 * markdown -- the two markdown surfaces the screens share, on Nasaq.
 *
 * Nasaq ships a renderer (`Markdown`) but no write/preview editor, so the
 * editor is a Textarea with a Write | Preview switch. Both keep the props the
 * screens already pass.
 */

/**
 * Render markdown as prose.
 *
 * `language` sets the text direction of THIS block. It is deliberately not the
 * UI locale: an Arabic answer inside an English UI (or the reverse) must lay
 * out as the script it is written in.
 */
export function MarkdownRenderer({
  content,
  language,
  className,
}: {
  content: string;
  language?: "en" | "ar";
  className?: string;
}) {
  return (
    <Markdown dir={language ? (language === "ar" ? "rtl" : "ltr") : undefined} className={className}>
      {content}
    </Markdown>
  );
}

/** A markdown textarea with a Write | Preview switch. */
export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minRows = 6,
  defaultView = "write",
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  minRows?: number;
  defaultView?: "write" | "preview";
  className?: string;
}) {
  const { language } = useLocale();
  const ar = language === "ar";
  const [view, setView] = useState<string>(defaultView);

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      <Tabs value={view} onValueChange={(v) => setView(String(v))}>
        <TabsList variant="segmented">
          <TabsTab value="write">{ar ? "كتابة" : "Write"}</TabsTab>
          <TabsTab value="preview">{ar ? "معاينة" : "Preview"}</TabsTab>
        </TabsList>
      </Tabs>
      {view === "write" ? (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={minRows}
          className="font-mono text-sm"
        />
      ) : (
        <div className="min-h-24 rounded-card border border-border bg-card p-3">
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <span className="text-sm text-muted-foreground">{ar ? "لا شيء للمعاينة" : "Nothing to preview"}</span>
          )}
        </div>
      )}
    </div>
  );
}
