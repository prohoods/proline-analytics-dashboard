import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSql } from "@/lib/db";

export async function POST() {
  try {
    const sql = getSql();
    for (const name of [
      "003_conversion_uploads.sql",
      "006_shopify_orders.sql",
    ]) {
      const ddl = await readFile(
        path.join(process.cwd(), "src/lib/migrations", name),
        "utf-8"
      );
      await sql.unsafe(ddl);
    }
    const [{ uploads }] = await sql<{ uploads: number }[]>`
      select count(*)::int as uploads from conversion_uploads
    `;
    const [{ calls }] = await sql<{ calls: number }[]>`
      select count(*)::int as calls from callrail_calls
    `;
    const [{ orders }] = await sql<{ orders: number }[]>`
      select count(*)::int as orders from shopify_orders
    `;
    return NextResponse.json({ ok: true, uploads, calls, orders });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
