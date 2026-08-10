// Copy owned by the two knowledge screens — the project brain and the sources
// that feed it.
//
// It lives beside lib/i18n.ts rather than inside it because that dictionary is
// shared by every route and edited by several hands at once; a page-local file
// keeps a redesign of two screens from colliding with everything else. The
// discipline is the same: both languages in one place, plurals written out
// rather than derived by a rule Arabic does not have, and `ar` typed against
// `en` so a key can never exist in one language only.
import { useStrings } from "./i18n";

/**
 * The mirror of i18n's `ago`, for a timestamp AHEAD of now — a source's next
 * scheduled run. `ago` cannot be reused: a future instant makes its delta
 * negative and it renders "-12m ago", which reads as a bug in the scheduler
 * rather than a bug in the formatter.
 */
const inWhenEN = (iso: string | null): string => {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "due now";
  const m = Math.round(ms / 60000);
  if (m < 1) return "in under a minute";
  if (m < 60) return `in ${m}m`;
  const h = Math.round(m / 60);
  if (h < 48) return `in ${h}h`;
  return `in ${Math.round(h / 24)}d`;
};

// Latin digits on purpose: the rest of the Arabic dictionary counts in Latin
// numerals, and one screen switching to Arabic-Indic would make the same number
// look like two different values across two pages.
const inWhenAR = (iso: string | null): string => {
  if (!iso) return "—";
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return "—";
  if (ms <= 0) return "الآن";
  const m = Math.round(ms / 60000);
  if (m < 1) return "خلال أقل من دقيقة";
  if (m < 60) return `خلال ${m}د`;
  const h = Math.round(m / 60);
  if (h < 48) return `خلال ${h}س`;
  return `خلال ${Math.round(h / 24)}ي`;
};

const en = {
  brain: {
    /** The faceted filter bar over the memory list. */
    filterLabel: "Source",
    filterLegend: "Filter memories by the source they came from",
    clear: "Clear",
    mapTitle: "Entity map",
    selectionTitle: "Selection",
    selectionIdleTitle: "Nothing selected",
    selectionIdleDesc:
      "Pick a node on the map and every memory that mentions it appears here, with where it came from.",
    lastSeen: "last seen",
    /** Screen-reader prefix on the provenance line of a memory. */
    fromLabel: "Came from",
    more: "Show more",
    less: "Show less",
    filteredEmptyTitle: "Nothing from this source",
    filteredEmptyDesc:
      "It has not written a memory into the brain yet. Clear the filter to read everything.",
    showEverything: "Show everything",
    manageSources: "Go to sources",
  },

  sources: {
    healthy: "Healthy",
    neverRun: "Never run",
    attention: "Needs attention",
    rest: "Everything else",
    allSources: "All sources",
    nextRun: "next",
    inWhen: inWhenEN,
    added: (n: number) => `${n} ${n === 1 ? "memory" : "memories"} added`,
    // Run-history table
    runHistory: "Run history",
    colWhen: "When",
    colTrigger: "Trigger",
    colItems: "Items",
    colTook: "Took",
  },
};

type Knowledge = typeof en;

const ar: Knowledge = {
  brain: {
    filterLabel: "المصدر",
    filterLegend: "تصفية الذكريات حسب المصدر الذي جاءت منه",
    clear: "إزالة التصفية",
    mapTitle: "خريطة الكيانات",
    selectionTitle: "المحدَّد",
    selectionIdleTitle: "لم يُحدَّد شيء",
    selectionIdleDesc:
      "اختر عقدة من الخريطة، وستظهر هنا كل ذكرى تشير إليها مع مصدرها.",
    lastSeen: "آخر ظهور",
    fromLabel: "المصدر",
    more: "عرض المزيد",
    less: "عرض أقل",
    filteredEmptyTitle: "لا شيء من هذا المصدر",
    filteredEmptyDesc: "لم يكتب هذا المصدر أي ذكرى في الدماغ بعد. أزل التصفية لقراءة الكل.",
    showEverything: "عرض الكل",
    manageSources: "الانتقال إلى المصادر",
  },

  sources: {
    healthy: "سليم",
    neverRun: "لم يُشغَّل بعد",
    attention: "يحتاج انتباهًا",
    rest: "بقية المصادر",
    allSources: "كل المصادر",
    nextRun: "التالي",
    inWhen: inWhenAR,
    added: (n: number) =>
      n === 1
        ? "أُضيفت ذكرى واحدة"
        : n === 2
          ? "أُضيفت ذكريان"
          : n >= 3 && n <= 10
            ? `أُضيفت ${n} ذكريات`
            : `أُضيفت ${n} ذكرى`,
    runHistory: "سجل التشغيل",
    colWhen: "الوقت",
    colTrigger: "المُشغِّل",
    colItems: "العناصر",
    colTook: "المدة",
  },
};

/**
 * The page-local strings hook. It reads the locale from `useStrings` rather
 * than from the language provider directly, so there is exactly one language
 * authority in the app and this file can never disagree with the rest of a page.
 */
const useKnowledge = (): Knowledge => {
  const { language } = useStrings();
  return language === "ar" ? ar : en;
};

export { useKnowledge };
export type { Knowledge };
