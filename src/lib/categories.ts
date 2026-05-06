// Classifies a Shopify line item into a shipping-cost-relevant category.
// Why categories: shipping a 60lb range hood costs vastly more than shipping
// a 1lb replacement filter. Lumping them into a single avg hides what's
// actually expensive. Inserts and BBQ hoods roll up into Range Hood — they
// ship at similar weight/dim profile, so for shipping-cost analysis they're
// the same animal.
export type ProductCategory = "Range Hood" | "Parts" | "Other";

const PARTS_KEYWORDS = [
  "blower", "filter", "remote", "bulb", "charcoal", "grease",
  "duct", "damper", "baffle", "switch", "motor", "fan",
  "replacement", "kit", "cap", "adapter", "cover", "chimney",
  "extension", "flue", "control", "knob", "bracket",
];

const INSERT_PATTERNS = [/\bINS\b/i, /insert/i, /hurricane/i];
const BBQ_PATTERNS = [/\bBBQ\b/i, /\boutdoor\b/i, /\bgrill\b/i];
const HOOD_SKU_PREFIXES = ["PLFW", "PLFI", "PLGW", "PLJW", "PROSW", "PLFL", "PLGI", "PLJL"];
const HOOD_TITLE_KEYWORDS = ["range hood", "wall mount", "island", "under cabinet"];
// e.g. ".30", ".36", " 36", ".48" — sizes that almost always mean a full hood.
const SIZE_SUFFIX = /\b(24|28|30|34|36|40|42|46|48|52|54|58|60|72)\b/;

export interface Classification {
  category: ProductCategory;
  reason: string;
}

export function classifyProduct(sku: string, title: string): ProductCategory {
  return classifyProductWithReason(sku, title).category;
}

export function classifyProductWithReason(sku: string, title: string): Classification {
  const s = (sku || "").toLowerCase();
  const t = (title || "").toLowerCase();
  const both = `${s} ${t}`;

  const partsHit = PARTS_KEYWORDS.find(k => both.includes(k));
  if (partsHit && !INSERT_PATTERNS.some(p => p.test(both))) {
    return { category: "Parts", reason: `Title/SKU contains parts keyword "${partsHit}"` };
  }

  const bbqHit = BBQ_PATTERNS.find(p => p.test(both));
  if (bbqHit) return { category: "Range Hood", reason: `BBQ/outdoor hood (matches ${bbqHit.source}) — rolls up to Range Hood` };

  const insHit = INSERT_PATTERNS.find(p => p.test(both));
  if (insHit) return { category: "Range Hood", reason: `Insert (matches ${insHit.source}) — rolls up to Range Hood` };

  const hoodPrefix = HOOD_SKU_PREFIXES.find(p => sku?.toUpperCase().startsWith(p));
  const hoodKeyword = HOOD_TITLE_KEYWORDS.find(k => t.includes(k));
  const sizeHit = both.match(SIZE_SUFFIX);

  if ((hoodPrefix || hoodKeyword) && sizeHit) {
    const why = hoodPrefix ? `SKU prefix "${hoodPrefix}"` : `title contains "${hoodKeyword}"`;
    return { category: "Range Hood", reason: `${why} + size suffix ${sizeHit[0]}` };
  }
  if (hoodPrefix) {
    return { category: "Range Hood", reason: `SKU prefix "${hoodPrefix}" (no size detected)` };
  }

  return { category: "Other", reason: "No classification rule matched" };
}

// Ranking from heaviest/largest → smallest. We classify an order by the
// "biggest" item it contains because shipping cost is dominated by the
// largest piece in the box.
const CATEGORY_RANK: Record<ProductCategory, number> = {
  "Range Hood": 3,
  "Parts": 2,
  "Other": 1,
};

export function classifyOrder(items: { sku: string; title: string }[]): ProductCategory {
  let best: ProductCategory = "Other";
  let bestRank = 0;
  for (const it of items) {
    const c = classifyProduct(it.sku, it.title);
    if (CATEGORY_RANK[c] > bestRank) {
      best = c;
      bestRank = CATEGORY_RANK[c];
    }
  }
  return best;
}

export const CATEGORY_LIST: ProductCategory[] = ["Range Hood", "Parts", "Other"];
