// Single source of truth for cross-cutting business constants.

// Import tariff applied to base supplier COGS to get landed cost. Set in
// /Users/jett/proline-analytics-dashboard/src/lib/constants.ts so every place
// that computes margin uses the same rate. Update here when the rate changes.
export const TARIFF_RATE = 0.45;
