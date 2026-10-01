import { useNasaq } from "@fadymondy/nasaq/web";

export type Language = "en" | "ar";

/**
 * The active language, over Nasaq's locale. The builder dictionaries (i18n*.ts)
 * only know "en" and "ar", so any `ar-*` locale folds to "ar".
 *
 * The locale -- and the page direction on <html> -- lives in NasaqProvider;
 * switch it with `setLanguage`.
 */
export function useLocale() {
  const { locale, setLocale, isRtl } = useNasaq();
  const language: Language = locale.startsWith("ar") ? "ar" : "en";
  return { language, setLanguage: (l: Language) => setLocale(l), isRTL: isRtl };
}

/** EN/AR helper: `tx("Save", "حفظ")` picks the active language. */
export function useLang() {
  const { locale, setLocale, isRtl } = useNasaq();
  const ar = locale.startsWith("ar");
  return { locale, setLocale, ar, isRtl, tx: (en: string, arText: string) => (ar ? arText : en) };
}
