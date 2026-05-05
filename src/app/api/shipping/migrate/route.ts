import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSql } from "@/lib/db";

export async function POST() {
  try {
    const file = path.join(process.cwd(), "src/lib/migrations/001_shipping_costs.sql");
    const ddl = await readFile(file, "utf-8");
    const sql = getSql();
    await sql.unsafe(ddl);
    const [{ count }] = await sql`select count(*)::int as count from shipping_costs`;
    return NextResponse.json({ ok: true, rows: count });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
