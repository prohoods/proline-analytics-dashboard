import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSql } from "@/lib/db";

export async function POST() {
  try {
    const file = path.join(
      process.cwd(),
      "src/lib/migrations/004_call_intelligence.sql"
    );
    const ddl = await readFile(file, "utf-8");
    const sql = getSql();
    await sql.unsafe(ddl);
    const [{ total }] = await sql<{ total: number }[]>`
      select count(*)::int as total from callrail_calls
    `;
    const [{ classified }] = await sql<{ classified: number }[]>`
      select count(*)::int as classified from callrail_calls where category is not null
    `;
    return NextResponse.json({ ok: true, total, classified });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
