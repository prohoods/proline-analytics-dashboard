import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { statements, q1, totalByCategory, monthRevenue, monthNetExpenses } from "@/lib/financial-data";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export async function GET() {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not set" }, { status: 500 });
    }

    const totals = totalByCategory();
    const netCashFlow = q1.netCashFlow;
    const profitMargin = ((netCashFlow / q1.totalRevenue) * 100).toFixed(1);

    const monthLines = statements.map(m => {
      const rev = monthRevenue(m);
      const exp = monthNetExpenses(m);
      const net = rev - exp;
      return `  ${m.month}: Revenue $${(rev / 1000).toFixed(0)}K | Expenses $${(exp / 1000).toFixed(0)}K | Net ${net >= 0 ? "+" : ""}$${(net / 1000).toFixed(0)}K`;
    }).join("\n");

    const topCats = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([cat, amt]) => `  ${cat}: $${(amt / 1000).toFixed(0)}K (${((amt / q1.totalExpenses) * 100).toFixed(0)}%)`)
      .join("\n");

    const prompt = `You are a CFO analyst. Analyze this Q1 2026 financial data for DZV Distributing LLC (Proline Range Hoods) and write a concise executive summary.

Q1 2026 FINANCIAL SUMMARY:
- Total Revenue (bank deposits, acct 0115): $${(q1.totalRevenue / 1000).toFixed(0)}K
- Total Expenses (both accounts, ex inter-account transfers): $${(q1.totalExpenses / 1000).toFixed(0)}K
- Net Cash Flow: ${netCashFlow >= 0 ? "+" : ""}$${(netCashFlow / 1000).toFixed(0)}K
- Net Margin: ${profitMargin}%
- Beginning Cash (Jan 1): $${(q1.acct115BeginBalance / 1000).toFixed(0)}K
- Ending Cash (Mar 31): $${(q1.acct115EndBalance / 1000).toFixed(0)}K

MONTH BY MONTH:
${monthLines}

TOP EXPENSE CATEGORIES:
${topCats}

NOTE: KBBO ACH is now itemized — Google Ads $468K (Q1), Zline (SHL wholesale supplier) $37K, Worldwide Logistic $43K, Renan Bonin (web dev) $10K. A separate "Unclassified Outflows (115)" bucket holds ~$1.05M Q1 residual — non-KBBO bank debits (likely outgoing wires/checks) that haven't been itemized yet.
NOTE: March had a double rent payment (KWS Companies paid twice — $64K × 2) which inflated March expenses.
NOTE: March payroll was ~$117K vs $87K in Feb — possible bonuses or extra headcount.

Write a 3-4 sentence executive summary covering:
1. Overall profitability verdict (are we cash-flow positive?)
2. The biggest expense drivers and any notable trends
3. Any concerns or items worth watching
4. One forward-looking observation

Be direct, specific with dollar amounts, and speak like a CFO briefing an owner — not a consultant. No bullet points, just clean prose. Keep it under 120 words.`;

    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 300,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = message.content[0].type === "text" ? message.content[0].text : "";

    return NextResponse.json({ summary, generatedAt: new Date().toISOString() }, {
      // No caching — fresh summary each visit
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("finance summary error:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
