import { NextRequest, NextResponse } from "next/server";
import { getSql } from "@/lib/db";

type Row = {
  order_name: string;
  shipped_at: string | null;
  carrier: string | null;
  service: string | null;
  cost: number;
  tracking: string | null;
};

// Minimal CSV parser that handles quoted fields and embedded commas.
function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else { field += c; }
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { cur.push(field); field = ""; }
      else if (c === "\n") { cur.push(field); rows.push(cur); cur = []; field = ""; }
      else if (c === "\r") { /* skip */ }
      else { field += c; }
    }
  }
  if (field.length || cur.length) { cur.push(field); rows.push(cur); }
  return rows.filter(r => r.some(v => v.trim() !== ""));
}

function pickCarrier(service: string | null): string | null {
  if (!service) return null;
  const s = service.toLowerCase();
  if (s.includes("ups")) return "UPS";
  if (s.includes("usps") || s.includes("priority") || s.includes("first class") || s.includes("ground advantage")) return "USPS";
  if (s.includes("fedex")) return "FedEx";
  if (s.includes("dhl")) return "DHL";
  return null;
}

function normalizeOrderName(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  return t.startsWith("#") ? t : `#${t}`;
}

function toIsoDate(raw: string): string | null {
  if (!raw) return null;
  const d = new Date(raw);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

export async function POST(req: NextRequest) {
  try {
    const sql = getSql();
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ ok: false, error: "No file uploaded" }, { status: 400 });
    }
    const text = await file.text();
    const rows = parseCSV(text);
    if (rows.length < 2) {
      return NextResponse.json({ ok: false, error: "CSV is empty" }, { status: 400 });
    }

    const header = rows[0].map(h => h.trim().toLowerCase());
    const idx = (name: string) => header.findIndex(h => h === name.toLowerCase());

    const orderIdx    = idx("order");
    const rateIdx     = idx("rate");
    const serviceIdx  = idx("requested service");
    const trackingIdx = idx("tracking number");
    const shippedIdx  = idx("shipped date");

    if (orderIdx === -1 || rateIdx === -1) {
      return NextResponse.json({
        ok: false,
        error: `CSV missing required columns. Found: ${header.join(", ")}`,
      }, { status: 400 });
    }

    // Aggregate by tracking — REDO CSV has one line per SKU shipped, but the
    // label cost (Rate) is repeated on every line. We want one row per
    // package, so dedupe by tracking number and keep the first cost we see.
    const byTracking = new Map<string, Row>();
    const noTracking: Row[] = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const order = normalizeOrderName(r[orderIdx] ?? "");
      const rate = parseFloat((r[rateIdx] ?? "").replace(/[$,]/g, ""));
      if (!order || !isFinite(rate) || rate <= 0) continue;

      const service = serviceIdx >= 0 ? (r[serviceIdx] ?? "").trim() || null : null;
      const tracking = trackingIdx >= 0 ? (r[trackingIdx] ?? "").trim() || null : null;
      const shipped = shippedIdx >= 0 ? toIsoDate(r[shippedIdx] ?? "") : null;

      const row: Row = {
        order_name: order,
        shipped_at: shipped,
        carrier: pickCarrier(service),
        service,
        cost: rate,
        tracking,
      };

      if (tracking) {
        if (!byTracking.has(tracking)) byTracking.set(tracking, row);
      } else {
        noTracking.push(row);
      }
    }

    const all = [...byTracking.values(), ...noTracking];
    if (all.length === 0) {
      return NextResponse.json({ ok: false, error: "No valid rows parsed" }, { status: 400 });
    }

    // Bulk insert in chunks of 500. Skip duplicates by tracking.
    let inserted = 0;
    const chunkSize = 500;
    for (let i = 0; i < all.length; i += chunkSize) {
      const chunk = all.slice(i, i + chunkSize);
      const result = await sql`
        insert into shipping_costs ${sql(chunk, "order_name", "shipped_at", "carrier", "service", "cost", "tracking")}
        on conflict (tracking) do nothing
      `;
      inserted += result.count;
    }

    const [{ total }] = await sql`select count(*)::int as total from shipping_costs`;

    return NextResponse.json({
      ok: true,
      parsed: all.length,
      inserted,
      skippedDuplicates: all.length - inserted,
      totalRowsInDb: total,
    });
  } catch (e) {
    console.error("upload error:", e);
    return NextResponse.json({
      ok: false,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 500 });
  }
}
