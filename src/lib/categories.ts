// Classifies a Shopify line item into a shipping-cost-relevant category.
// Why categories: shipping a 60lb range hood costs vastly more than shipping
// a 1lb replacement filter. Lumping them into a single "avg per shipment"
// hides what's actually expensive. Categorization is title/SKU-driven —
// COGS coverage is incomplete, so we can't rely on it.
export type ProductCategory = "Range Hood" | "Insert" | "BBQ Hood" | "Parts" | "Other";

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

export function classifyProduct(sku: string, title: string): ProductCategory {
  const s = (sku || "").toLowerCase();
  const t = (title || "").toLowerCase();
  const both = `${s} ${t}`;

  // Parts win against most other tags — a "blower pack" is parts even if SKU
  // starts with PLJL.
  if (PARTS_KEYWORDS.some(k => both.includes(k)) && !INSERT_PATTERNS.some(p => p.test(both))) {
    return "Parts";
  }

  if (BBQ_PATTERNS.some(p => p.test(both))) return "BBQ Hood";
  if (INSERT_PATTERNS.some(p => p.test(both))) return "Insert";

  const hasHoodPrefix = HOOD_SKU_PREFIXES.some(p => sku?.toUpperCase().startsWith(p));
  const hasHoodKeyword = HOOD_TITLE_KEYWORDS.some(k => t.includes(k));
  const hasSize = SIZE_SUFFIX.test(both);

  if ((hasHoodPrefix || hasHoodKeyword) && hasSize) return "Range Hood";
  if (hasHoodPrefix && !PARTS_KEYWORDS.some(k => both.includes(k))) return "Range Hood";

  return "Other";
}

// Ranking from heaviest/largest → smallest. We classify an order by the
// "biggest" item it contains because shipping cost is dominated by the
// largest piece in the box.
const CATEGORY_RANK: Record<ProductCategory, number> = {
  "Range Hood": 5,
  "BBQ Hood": 4,
  "Insert": 3,
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

export const CATEGORY_LIST: ProductCategory[] = ["Range Hood", "BBQ Hood", "Insert", "Parts", "Other"];
