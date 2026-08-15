// The shell chrome's own words.
//
// The Dock, Launchpad and window controls shipped English literals in a shell
// that already renders itself right-to-left and localizes every app name. An
// operator working in Arabic got Arabic tiles inside English furniture, which
// reads as a half-finished translation rather than a bilingual product.
//
// Deliberately tiny and local: this is chrome, not content. Anything an APP
// says belongs to the app.

export interface ChromeStrings {
  launchpad: string;
  applications: string;
  search: string;
  noMatch: (q: string) => string;
  open: string;
  show: string;
  keepInDock: string;
  removeFromDock: string;
  addToDesktop: string;
  removeFromDesktop: string;
  close: string;
  minimize: string;
  maximize: string;
  restore: string;
}

const EN: ChromeStrings = {
  launchpad: "Launchpad",
  applications: "Applications",
  search: "Search",
  noMatch: (q) => `No apps match \u201C${q}\u201D.`,
  open: "Open",
  show: "Show",
  keepInDock: "Keep in Dock",
  removeFromDock: "Remove from Dock",
  addToDesktop: "Add to Desktop",
  removeFromDesktop: "Remove from Desktop",
  close: "Close",
  minimize: "Minimize",
  maximize: "Maximize",
  restore: "Restore",
};

const AR: ChromeStrings = {
  launchpad: "التطبيقات",
  applications: "التطبيقات",
  search: "بحث",
  noMatch: (q) => `لا توجد تطبيقات تطابق \u00AB${q}\u00BB.`,
  open: "فتح",
  show: "إظهار",
  keepInDock: "تثبيت في الشريط",
  removeFromDock: "إزالة من الشريط",
  addToDesktop: "إضافة إلى سطح المكتب",
  removeFromDesktop: "إزالة من سطح المكتب",
  close: "إغلاق",
  minimize: "تصغير",
  maximize: "تكبير",
  restore: "استعادة",
};

export function chromeStrings(locale?: string): ChromeStrings {
  return locale === "ar" ? AR : EN;
}
