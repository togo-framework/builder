const en = {
  fab: "Feedback",
  title: "Feedback",
  intro:
    "Found a bug, have an idea, or want to ask something about this page? It is attached to the page you are on.",
  report: "Report an issue",
  onThisPage: "On this page",
  issueCount: (n: number) => `${n} issue${n === 1 ? "" : "s"} on this page`,
  none: "Nothing reported on this page yet.",
  loading: "Loading…",
  close: "Close",
  reportTitle: "Report an issue",
  type: "Type",
  bug: "Bug",
  feature: "Feature",
  question: "Question",
  discussion: "Discussion",
  titleLabel: "Title",
  titlePlaceholder: "Brief description",
  details: "Details",
  detailsPlaceholder: "Steps to reproduce, expected vs actual, etc.",
  cancel: "Cancel",
  // Said explicitly. The body is rendered as markdown everywhere it is read —
  // the issue page, the panel, the agent's prompt — and a reporter who does
  // not know that writes a wall of plain text where a list would have done.
  markdownHint: "Markdown supported — **bold**, `code`, lists.",
  pageUrl: "Page URL",
  location: "Location",
  pin: "Pin location",
  pinAnother: "Pin another",
  pinning: "Click an element on the page…  (Esc to cancel)",
  pinned: (tag: string) => `Pinned <${tag}>`,
  clear: "Clear",
  attachments: "Attachments",
  addFile: "Add file",
  screenshot: "Screenshot",
  submit: "Submit",
  submitting: "Submitting…",
  // The disclosure is a requirement, not a nicety: a report that quietly
  // ships the page's console and network activity is surveillance, not
  // feedback. Say what is attached, and offer the way out.
  //
  // The app is NAMED. A shell can host several at once, and "the product page"
  // is not an answer when the reporter has switched between three of them —
  // they have to be able to see, before they send, that the console about to
  // be attached is auth's and not the dashboard's.
  ctxAttached: (app: string, c: number, n: number) =>
    `Console and network activity from ${app} will be attached (${c} console line${c === 1 ? "" : "s"}, ${n} request${n === 1 ? "" : "s"}).`,
  ctxOptOut: "Send without console & network activity",
  created: (n: number) => `Reported as #${n}`,
  failed: "Could not submit. Try again.",
  titleRequired: "A title is required.",
  agentWorking: "An agent is working on this",
  agentWorkingBy: (who: string) => `${who} is working on this`,
  openBoard: "Open the issue board",
  // The launcher. "Build" rather than "Admin" or "Tools": these four screens
  // are how the app in front of you gets built, and naming them for that is
  // what makes it obvious they are not part of the product.
  apps: "Build",
  appAgents: "Agents",
  appSkills: "Skills",
  appIssues: "Issues",
  appVault: "Vault",
  appMcp: "MCP",
  appSources: "Sources",
  appDocs: "Library",
  appBrain: "Brain",
  appChat: "Chat",
  appTerminal: "Terminal",
  dir: "ltr" as "ltr" | "rtl",
};

type Dict = typeof en;

const ar: Dict = {
  fab: "ملاحظات",
  title: "الملاحظات",
  intro: "وجدت خطأ، أو لديك فكرة، أو سؤال عن هذه الصفحة؟ سيتم إرفاقها بالصفحة الحالية.",
  report: "الإبلاغ عن مشكلة",
  onThisPage: "في هذه الصفحة",
  issueCount: (n: number) => `${n} مشكلة في هذه الصفحة`,
  none: "لا توجد بلاغات على هذه الصفحة بعد.",
  loading: "جارٍ التحميل…",
  close: "إغلاق",
  reportTitle: "الإبلاغ عن مشكلة",
  type: "النوع",
  bug: "خطأ",
  feature: "ميزة",
  question: "سؤال",
  discussion: "نقاش",
  titleLabel: "العنوان",
  titlePlaceholder: "وصف مختصر",
  details: "التفاصيل",
  detailsPlaceholder: "خطوات إعادة الإنتاج، المتوقع مقابل الفعلي، إلخ.",
  cancel: "إلغاء",
  markdownHint: "يدعم Markdown — **عريض**، `شيفرة`، قوائم.",
  pageUrl: "رابط الصفحة",
  location: "الموقع",
  pin: "تحديد الموقع",
  pinAnother: "تحديد موقع آخر",
  pinning: "اختر عنصرًا في الصفحة…  (Esc للإلغاء)",
  pinned: (tag: string) => `تم التحديد <${tag}>`,
  clear: "مسح",
  attachments: "المرفقات",
  addFile: "إضافة ملف",
  screenshot: "لقطة شاشة",
  submit: "إرسال",
  submitting: "جارٍ الإرسال…",
  ctxAttached: (app: string, c: number, n: number) =>
    `سيتم إرفاق نشاط وحدة التحكم والشبكة من ${app} (${c} سطر، ${n} طلب).`,
  ctxOptOut: "الإرسال دون نشاط وحدة التحكم والشبكة",
  created: (n: number) => `تم الإبلاغ برقم #${n}`,
  failed: "تعذّر الإرسال. حاول مرة أخرى.",
  titleRequired: "العنوان مطلوب.",
  agentWorking: "يعمل أحد الوكلاء على هذه المشكلة",
  agentWorkingBy: (who: string) => `${who} يعمل على هذه المشكلة`,
  openBoard: "فتح لوحة المشكلات",
  apps: "البناء",
  appAgents: "الوكلاء",
  appSkills: "المهارات",
  appIssues: "المشكلات",
  appVault: "الخزنة",
  appMcp: "MCP",
  appSources: "المصادر",
  appDocs: "المكتبة",
  appBrain: "الدماغ",
  appChat: "المحادثة",
  appTerminal: "الطرفية",
  dir: "rtl",
};

export function dict(locale: string): Dict {
  return locale.toLowerCase().startsWith("ar") ? ar : en;
}

export type { Dict };
