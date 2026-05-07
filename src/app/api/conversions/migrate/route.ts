import { NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { getSql } from "@/lib/db";

export async function POST() {
  try {
    const file = path.join(
      process.cwd(),
      "src/lib/migrations/003_conversion_uploads.sql"
    );
    const ddl = await readFile(file, "utf-8");
    const sql = getSql();
    await sql.unsafe(ddl);
    const [{ uploads }] = await sql<{ uploads: number }[]>`
      select count(*)::int as uploads from conversion_uploads
    `;
    const [{ calls }] = await sql<{ calls: number }[]>`
      select count(*)::int as calls from callrail_calls
    `;
    return NextResponse.json({ ok: true, uploads, calls });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
