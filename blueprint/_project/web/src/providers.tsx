import { ReactNode } from "react";
import { NasaqProvider, Toaster } from "@fadymondy/nasaq/web";

// Storage key the language choice has always lived under. Nasaq owns the theme
// (persisted under "nasaq-theme", applied before paint by the script in
// index.html) but keeps the locale in memory, so the choice is persisted here.
const LANG_KEY = "sentra:lang";

function applyDir(lang: "en" | "ar") {
  const el = document.documentElement;
  el.lang = lang;
  el.dir = lang === "ar" ? "rtl" : "ltr";
}

/**
 * The language this session should start in.
 *
 * `?lang=` first, because that is how a FeedbackOS app window tells a framed
 * screen which language the surrounding product is in -- without it the window
 * title was Arabic and the screen inside came up in English. Then the stored
 * choice, then the document, then English. The param is written to storage so
 * it also leads on the next load of the same frame.
 */
function initialLanguage(): "en" | "ar" {
  if (typeof window === "undefined") return "en";
  const q = new URLSearchParams(window.location.search).get("lang");
  if (q === "ar" || q === "en") {
    try { localStorage.setItem(LANG_KEY, q); } catch { /* private mode: the value below still applies */ }
    applyDir(q);
    return q;
  }
  try {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored === "ar" || stored === "en") {
      applyDir(stored);
      return stored;
    }
  } catch { /* private mode: fall through to the document */ }
  const fromDoc = document.documentElement.lang.startsWith("ar") ? "ar" : "en";
  applyDir(fromDoc);
  return fromDoc;
}

// NasaqProvider applies the ToGO brand (data-brand="togo"), the light/dark theme
// and the EN/AR locale with its direction on <html>. Toaster is mounted once, here.
export function Providers({ children }: { children: ReactNode }) {
  return (
    <NasaqProvider
      brand="togo"
      defaultTheme="dark"
      defaultLocale={initialLanguage()}
      onLocaleChange={(l) => { try { localStorage.setItem(LANG_KEY, l.startsWith("ar") ? "ar" : "en"); } catch { /* ignore */ } }}
    >
      {children}
      <Toaster />
    </NasaqProvider>
  );
}
