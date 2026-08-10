import { useT } from "@togo-framework/ui";

/**
 * i18n.vault — EN/AR copy for the two credential-and-document screens.
 *
 * It lives beside lib/i18n.ts rather than inside it because those two screens
 * were redesigned together and their vocabulary is shared (a masked value, an
 * audited read, a file that is stored but unreadable). Same pattern as the
 * main dictionary: `useT()` stays the single language AUTHORITY — it owns the
 * locale, persists the choice and sets the document `dir` — and this file only
 * supplies the words.
 *
 * Conventions inherited from lib/i18n.ts:
 *  - Counted phrases are functions. Arabic plurals are not an `s` suffix
 *    (1 singular, 2 dual, 3–10 plural, 11+ singular accusative).
 *  - Machine values (secret names, filenames, kinds, IPs) stay verbatim in both
 *    languages — they are identifiers, not prose, and the components wrap them
 *    in <bdi dir="ltr"> so the bidi algorithm cannot reorder them.
 *  - Western digits in Arabic.
 *
 * Sentences that embed a machine name are split into a lead and a tail rather
 * than taking a `${name}` argument. A template string would force the name into
 * a plain `string`, and a plain string cannot carry the isolate that keeps
 * `GITHUB_TOKEN` intact inside an Arabic sentence.
 */

/* ------------------------------------------------------------------ */
/* Vault                                                               */
/* ------------------------------------------------------------------ */

interface VaultStrings {
  title: string;
  description: string;
  add: string;
  cancel: string;

  statSecrets: string;
  statReads: string;
  statRefused: string;
  errTitle: string;

  formTitle: string;
  fName: string;
  fNameHint: string;
  fKind: string;
  fKindHint: string;
  fValue: string;
  fValueHint: string;
  store: string;
  storing: string;
  noteReady: string;
  noteMissing: string;

  sectionSecrets: string;
  filterPlaceholder: string;
  clearFilter: string;

  hidden: string;
  hiddenHint: string;
  reveal: string;
  hide: string;
  copy: string;
  copied: string;
  copyHint: string;
  clipboardErr: string;
  grant: string;
  remove: string;

  revealBanner: string;
  revealCountdown: (seconds: number) => string;
  readsCount: (n: number) => string;
  createdLead: string;

  grantPlaceholder: string;
  grantAllow: string;
  grantNote: string;

  deleteTitle: string;
  deleteDescLead: string;
  deleteDescTail: string;
  deleteC1: string;
  deleteC2: string;
  deleteC3: string;
  deleteConfirm: string;

  emptyTitle: string;
  emptyDesc: string;
  emptySuggestLabel: string;
  noMatchTitle: string;
  noMatchDesc: string;

  auditTitle: string;
  auditEmpty: string;
  auditHuman: string;
  auditVerbOk: string;
  auditVerbDenied: string;
  auditVerbRate: string;
  auditVerbExpired: string;
}

const vaultEn: VaultStrings = {
  title: "Vault",
  description:
    "Credentials your agents can read. Every reveal is written to the audit log in the same transaction as the decrypt — a read that cannot be logged does not happen.",
  add: "Add a secret",
  cancel: "Cancel",

  statSecrets: "Secrets",
  statReads: "Reads",
  statRefused: "Refused",
  errTitle: "Something went wrong",

  formTitle: "Add a secret",
  fName: "Name",
  fNameHint: "How agents and grants refer to it — the env-var convention keeps it unambiguous.",
  fKind: "Kind",
  fKindHint: "Only a label for the list — every kind is encrypted the same way.",
  fValue: "Value",
  fValueHint:
    "Encrypted with AES-256-GCM, bound to this row's identity — a ciphertext copied to another row fails to decrypt.",
  store: "Store",
  storing: "Storing…",
  noteReady: "Stored encrypted; agents still need an explicit grant to reveal it.",
  noteMissing: "A name and a value are required.",

  sectionSecrets: "Secrets",
  filterPlaceholder: "Filter by name…",
  clearFilter: "Clear the filter",

  hidden: "Hidden",
  hiddenHint: "The masked tail is all the server will show without an audited read.",
  reveal: "Reveal",
  hide: "Hide",
  copy: "Copy",
  copied: "Copied",
  copyHint: "Copies to the clipboard without putting the value on screen. Still an audited read.",
  clipboardErr: "This browser would not give the page clipboard access. Reveal it and copy by hand.",
  grant: "Grant to an agent",
  remove: "Delete",

  revealBanner: "This read is in the audit log.",
  revealCountdown: (s) => `Hides itself in ${s}s`,
  readsCount: (n) => (n === 0 ? "Never read" : n === 1 ? "1 read" : `${n} reads`),
  createdLead: "Added",

  grantPlaceholder: "agent-slug",
  grantAllow: "Allow reveal",
  grantNote: "Reveal is its own grant — it is not implied by read or write.",

  deleteTitle: "Delete this secret?",
  deleteDescLead: "You are about to delete ",
  deleteDescTail: ". The ciphertext is destroyed, not archived.",
  deleteC1: "Agents holding a grant start failing on their next run.",
  deleteC2: "The value cannot be recovered from here — only from wherever you originally got it.",
  deleteC3: "The audit log keeps the record of every read that already happened.",
  deleteConfirm: "Delete the secret",

  emptyTitle: "No secrets yet",
  emptyDesc:
    "Store the credentials your agents need. Nothing is readable by an agent until you grant it explicitly.",
  emptySuggestLabel: "Common first ones",
  noMatchTitle: "No secret matches that filter",
  noMatchDesc: "Nothing here is named that. Clear the filter to see them all.",

  auditTitle: "Audit log",
  auditEmpty: "No reads recorded yet. The first reveal will appear here.",
  auditHuman: "a human",
  auditVerbOk: "Read",
  auditVerbDenied: "Refused a read of",
  auditVerbRate: "Rate-limited a read of",
  auditVerbExpired: "Expired grant on",
};

const vaultAr: VaultStrings = {
  title: "الخزنة",
  description:
    "بيانات الاعتماد التي يمكن لوكلائك قراءتها. كل عملية كشف تُكتب في سجل التدقيق ضمن المعاملة نفسها التي تفكّ التشفير — فالقراءة التي لا يمكن تسجيلها لا تحدث.",
  add: "إضافة سر",
  cancel: "إلغاء",

  statSecrets: "الأسرار",
  statReads: "القراءات",
  statRefused: "المرفوضة",
  errTitle: "حدث خطأ ما",

  formTitle: "إضافة سر",
  fName: "الاسم",
  fNameHint: "الاسم الذي تشير به الوكلاء والأذونات إليه — وعُرف متغيّرات البيئة يجعله بلا لبس.",
  fKind: "النوع",
  fKindHint: "مجرد تسمية في القائمة — كل الأنواع تُشفَّر بالطريقة نفسها.",
  fValue: "القيمة",
  fValueHint:
    "مشفَّرة بـ AES-256-GCM ومربوطة بهوية هذا السجل — والنص المشفَّر المنسوخ إلى سجل آخر يفشل في فكّ التشفير.",
  store: "حفظ",
  storing: "جارٍ الحفظ…",
  noteReady: "يُحفظ مشفَّرًا؛ ويظل الوكيل بحاجة إلى إذن صريح لكشفه.",
  noteMissing: "الاسم والقيمة مطلوبان.",

  sectionSecrets: "الأسرار",
  filterPlaceholder: "تصفية بالاسم…",
  clearFilter: "مسح التصفية",

  hidden: "مخفية",
  hiddenHint: "الطرف المُقنَّع هو كل ما يعرضه الخادم دون قراءة مُسجَّلة.",
  reveal: "كشف",
  hide: "إخفاء",
  copy: "نسخ",
  copied: "تم النسخ",
  copyHint: "ينسخ إلى الحافظة دون إظهار القيمة على الشاشة. ويظل قراءة مُسجَّلة في التدقيق.",
  clipboardErr: "لم يمنح المتصفح الصفحة إذن الوصول إلى الحافظة. اكشف القيمة وانسخها يدويًا.",
  grant: "منح لوكيل",
  remove: "حذف",

  revealBanner: "هذه القراءة مُسجَّلة في سجل التدقيق.",
  revealCountdown: (s) => `تختفي خلال ${s} ثانية`,
  readsCount: (n) =>
    n === 0
      ? "لم تُقرأ بعد"
      : n === 1
        ? "قراءة واحدة"
        : n === 2
          ? "قراءتان"
          : n <= 10
            ? `${n} قراءات`
            : `${n} قراءة`,
  createdLead: "أُضيف",

  grantPlaceholder: "agent-slug",
  grantAllow: "السماح بالكشف",
  grantNote: "الكشف إذن قائم بذاته — لا تتضمّنه صلاحية القراءة أو الكتابة.",

  deleteTitle: "حذف هذا السر؟",
  deleteDescLead: "أنت على وشك حذف ",
  deleteDescTail: ". يُتلَف النص المشفَّر ولا يُؤرشَف.",
  deleteC1: "ستبدأ الوكلاء التي تملك إذنًا بالفشل في تشغيلها التالي.",
  deleteC2: "لا يمكن استرجاع القيمة من هنا — بل من مصدرها الأصلي فقط.",
  deleteC3: "يحتفظ سجل التدقيق بأثر كل قراءة سبق أن حدثت.",
  deleteConfirm: "حذف السر",

  emptyTitle: "لا أسرار بعد",
  emptyDesc: "احفظ بيانات الاعتماد التي يحتاجها وكلاؤك. لا شيء منها متاح لوكيل قبل منحه إذنًا صريحًا.",
  emptySuggestLabel: "أسماء شائعة للبداية",
  noMatchTitle: "لا سر يطابق هذه التصفية",
  noMatchDesc: "لا يوجد هنا اسم كهذا. امسح التصفية لعرضها كلها.",

  auditTitle: "سجل التدقيق",
  auditEmpty: "لا قراءات مُسجَّلة بعد. أول عملية كشف ستظهر هنا.",
  auditHuman: "مستخدم بشري",
  auditVerbOk: "قراءة",
  auditVerbDenied: "رفض قراءة",
  auditVerbRate: "تقييد معدّل قراءة",
  auditVerbExpired: "انتهاء إذن على",
};

/* ------------------------------------------------------------------ */
/* Library (documents)                                                 */
/* ------------------------------------------------------------------ */

interface DocsStrings {
  title: string;
  description: string;
  errTitle: string;

  statDocs: string;
  statInBrain: string;
  statUnreadable: string;
  statChunks: string;

  uploadTitle: string;
  dropTitle: string;
  dropActive: string;
  dropHint: string;
  choose: string;
  addMore: string;

  queueTitle: string;
  queueProgress: (done: number, total: number) => string;
  queueAllDone: string;
  stQueued: string;
  stUploading: string;
  stIngested: (n: number) => string;
  stStored: string;
  stStoredWhy: string;
  stFailed: string;
  retry: string;
  removeFromQueue: string;
  clearFinished: string;
  uploadCta: (n: number) => string;
  uploadIdle: string;
  uploadingCta: string;
  footerNote: string;

  captionPlaceholder: string;
  captionAria: string;
  imageNeedsCaption: string;

  sectionDocs: string;
  filterPlaceholder: string;
  clearFilter: string;
  fAll: string;
  fInBrain: string;
  fUnreadable: string;

  chunksCount: (n: number) => string;
  notInBrain: string;
  preview: string;
  hidePreview: string;
  previewLabel: string;

  download: string;
  reindex: string;
  reindexing: string;
  reindexed: (n: number) => string;
  reindexFailed: string;

  del: string;
  deleteTitle: string;
  deleteDescLead: string;
  deleteDescTail: string;
  deleteC1: string;
  deleteC2: string;
  deleteC3: string;
  deleteConfirm: string;

  emptyTitle: string;
  emptyDesc: string;
  noMatchTitle: string;
  noMatchDesc: string;
}

const docsEn: DocsStrings = {
  title: "Library",
  description:
    "Specs, plans, CSVs, PDFs and branding the fleet can read and quote. Anything readable is chunked into the project brain the moment it lands.",
  errTitle: "Something went wrong",

  statDocs: "Documents",
  statInBrain: "In the brain",
  statUnreadable: "Unreadable",
  statChunks: "Chunks",

  uploadTitle: "Add to the library",
  dropTitle: "Drop files here",
  dropActive: "Release to queue them",
  dropHint:
    "Markdown, text, CSV and PDF are read automatically. An image carries no text, so its caption is the only thing an agent can read.",
  choose: "Choose files",
  addMore: "Add more",

  queueTitle: "This upload",
  queueProgress: (done, total) => `${done} of ${total} finished`,
  queueAllDone: "All finished.",
  stQueued: "Waiting",
  stUploading: "Uploading…",
  stIngested: (n) => (n === 1 ? "In the brain — 1 chunk" : `In the brain — ${n} chunks`),
  stStored: "Stored, but its text could not be read",
  stStoredWhy: "The file is safe and downloadable. Re-uploading it will not help — fix the source or add a caption.",
  stFailed: "Upload failed",
  retry: "Try again",
  removeFromQueue: "Remove from the queue",
  clearFinished: "Clear finished",
  uploadCta: (n) => (n === 1 ? "Upload 1 file" : `Upload ${n} files`),
  uploadIdle: "Upload",
  uploadingCta: "Uploading…",
  footerNote: "Each file is read into the brain the moment it lands — there is no separate ingest step.",

  captionPlaceholder: "One line on what this is",
  captionAria: "Caption for this file",
  imageNeedsCaption: "An image carries no text. Without a caption an agent cannot read it at all.",

  sectionDocs: "Documents",
  filterPlaceholder: "Filter by name…",
  clearFilter: "Clear the filter",
  fAll: "All",
  fInBrain: "In the brain",
  fUnreadable: "Unreadable",

  chunksCount: (n) => (n === 1 ? "1 chunk" : `${n} chunks`),
  notInBrain: "Not in the brain",
  preview: "What was read",
  hidePreview: "Hide what was read",
  previewLabel: "First of the extracted text",

  download: "Download the original",
  reindex: "Read it again",
  reindexing: "Re-reading…",
  reindexed: (n) => (n === 1 ? "Re-read into 1 chunk." : `Re-read into ${n} chunks.`),
  reindexFailed: "Could not read it again.",

  del: "Delete",
  deleteTitle: "Delete this document?",
  deleteDescLead: "You are about to delete ",
  deleteDescTail: " and everything it taught the fleet.",
  deleteC1: "Its chunks leave the project brain — agents stop answering from it.",
  deleteC2: "The stored file is destroyed. Download it first if it is the only copy.",
  deleteC3: "This is not like removing a source, where the knowledge stays behind.",
  deleteConfirm: "Delete it",

  emptyTitle: "Nothing in the library yet",
  emptyDesc:
    "Upload the spec or plan you would hand a new engineer, and the fleet can quote it back to you.",
  noMatchTitle: "No document matches",
  noMatchDesc: "Nothing here fits that filter. Clear it to see the whole library.",
};

const docsAr: DocsStrings = {
  title: "المكتبة",
  description:
    "المواصفات والخطط وملفات CSV وPDF والهوية البصرية التي يستطيع الأسطول قراءتها والاقتباس منها. وكل ما يمكن قراءته يُقسَّم إلى مقاطع في دماغ المشروع فور وصوله.",
  errTitle: "حدث خطأ ما",

  statDocs: "المستندات",
  statInBrain: "في الدماغ",
  statUnreadable: "غير مقروءة",
  statChunks: "المقاطع",

  uploadTitle: "إضافة إلى المكتبة",
  dropTitle: "أفلِت الملفات هنا",
  dropActive: "أفلِتها الآن لإضافتها إلى الطابور",
  dropHint:
    "تُقرأ ملفات Markdown والنصوص وCSV وPDF تلقائيًا. أما الصورة فلا تحمل نصًا، ووصفها هو الشيء الوحيد الذي يستطيع الوكيل قراءته.",
  choose: "اختيار ملفات",
  addMore: "إضافة المزيد",

  queueTitle: "هذا الرفع",
  queueProgress: (done, total) => `اكتمل ${done} من ${total}`,
  queueAllDone: "اكتمل كل شيء.",
  stQueued: "في الانتظار",
  stUploading: "جارٍ الرفع…",
  stIngested: (n) =>
    n === 1
      ? "في الدماغ — مقطع واحد"
      : n === 2
        ? "في الدماغ — مقطعان"
        : n <= 10
          ? `في الدماغ — ${n} مقاطع`
          : `في الدماغ — ${n} مقطعًا`,
  stStored: "حُفِظ الملف، لكن تعذّرت قراءة نصه",
  stStoredWhy: "الملف سليم وقابل للتنزيل. وإعادة رفعه لن تفيد — عالِج المصدر نفسه أو أضِف وصفًا.",
  stFailed: "فشل الرفع",
  retry: "إعادة المحاولة",
  removeFromQueue: "إزالة من الطابور",
  clearFinished: "مسح المكتمل",
  uploadCta: (n) =>
    n === 1 ? "رفع ملف واحد" : n === 2 ? "رفع ملفين" : n <= 10 ? `رفع ${n} ملفات` : `رفع ${n} ملفًا`,
  uploadIdle: "رفع",
  uploadingCta: "جارٍ الرفع…",
  footerNote: "يُقرأ كل ملف في الدماغ فور وصوله — لا توجد خطوة استيعاب منفصلة.",

  captionPlaceholder: "سطر واحد يوضّح ما هذا الملف",
  captionAria: "وصف هذا الملف",
  imageNeedsCaption: "الصورة لا تحمل نصًا. وبدون وصف لا يستطيع الوكيل قراءتها إطلاقًا.",

  sectionDocs: "المستندات",
  filterPlaceholder: "تصفية بالاسم…",
  clearFilter: "مسح التصفية",
  fAll: "الكل",
  fInBrain: "في الدماغ",
  fUnreadable: "غير مقروءة",

  chunksCount: (n) =>
    n === 1 ? "مقطع واحد" : n === 2 ? "مقطعان" : n <= 10 ? `${n} مقاطع` : `${n} مقطعًا`,
  notInBrain: "ليست في الدماغ",
  preview: "ما قُرِئ منه",
  hidePreview: "إخفاء ما قُرِئ",
  previewLabel: "أول ما استُخرج من النص",

  download: "تنزيل الملف الأصلي",
  reindex: "إعادة قراءته",
  reindexing: "جارٍ إعادة القراءة…",
  reindexed: (n) =>
    n === 1
      ? "أُعيدت قراءته إلى مقطع واحد."
      : n === 2
        ? "أُعيدت قراءته إلى مقطعين."
        : n <= 10
          ? `أُعيدت قراءته إلى ${n} مقاطع.`
          : `أُعيدت قراءته إلى ${n} مقطعًا.`,
  reindexFailed: "تعذّرت إعادة قراءته.",

  del: "حذف",
  deleteTitle: "حذف هذا المستند؟",
  deleteDescLead: "أنت على وشك حذف ",
  deleteDescTail: " وكل ما علّمه للأسطول.",
  deleteC1: "تخرج مقاطعه من دماغ المشروع — وتتوقف الوكلاء عن الإجابة منه.",
  deleteC2: "يُتلَف الملف المحفوظ. نزِّله أولًا إن كانت هذه نسخته الوحيدة.",
  deleteC3: "هذا ليس كإزالة مصدر، حيث تبقى المعرفة بعد الإزالة.",
  deleteConfirm: "حذفه",

  emptyTitle: "لا شيء في المكتبة بعد",
  emptyDesc: "ارفع المواصفة أو الخطة التي كنت ستسلّمها لمهندس جديد، ليقتبسها الأسطول لك.",
  noMatchTitle: "لا مستند مطابق",
  noMatchDesc: "لا شيء هنا يوافق هذه التصفية. امسحها لعرض المكتبة كاملة.",
};

/* ------------------------------------------------------------------ */
/* Shared formatters                                                   */
/* ------------------------------------------------------------------ */

/**
 * Relative time, in the operator's language.
 *
 * The Arabic locale is requested as `ar-u-nu-latn`: Intl would otherwise
 * return Arabic-Indic digits, and every other number on these screens is
 * Western — one timestamp in ٣ beside a "3 reads" is a inconsistency the eye
 * catches immediately.
 */
const RELATIVE: Record<string, Intl.RelativeTimeFormat> = {};

const relativeTime = (iso: string, ar: boolean): string => {
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "";
  const locale = ar ? "ar-u-nu-latn" : "en";
  RELATIVE[locale] ??= new Intl.RelativeTimeFormat(locale, { numeric: "auto", style: "narrow" });
  const rtf = RELATIVE[locale];

  const seconds = (at - Date.now()) / 1000;
  const abs = Math.abs(seconds);
  if (abs < 60) return rtf.format(Math.round(seconds), "second");
  if (abs < 3600) return rtf.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return rtf.format(Math.round(seconds / 3600), "hour");
  if (abs < 2_592_000) return rtf.format(Math.round(seconds / 86_400), "day");
  return rtf.format(Math.round(seconds / 2_592_000), "month");
};

/** The full timestamp, for the `title` of a relative one. */
const exactTime = (iso: string, ar: boolean): string => {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return "";
  return at.toLocaleString(ar ? "ar-u-nu-latn" : "en");
};

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

const useVaultStrings = (): { S: VaultStrings; ar: boolean; isRTL: boolean } => {
  const { language, isRTL } = useT();
  const ar = language === "ar";
  return { S: ar ? vaultAr : vaultEn, ar, isRTL };
};

const useDocsStrings = (): { S: DocsStrings; ar: boolean; isRTL: boolean } => {
  const { language, isRTL } = useT();
  const ar = language === "ar";
  return { S: ar ? docsAr : docsEn, ar, isRTL };
};

export { exactTime, relativeTime, useDocsStrings, useVaultStrings };
export type { DocsStrings, VaultStrings };
