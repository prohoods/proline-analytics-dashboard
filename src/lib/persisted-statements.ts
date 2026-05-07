// Persistence layer for parsed bank statements.
//
// Primary: Neon Postgres (via DATABASE_URL). Durable across serverless
// instances and deploys, so uploaded statements are reliably visible to
// the finance pages.
// Fallback: in-memory store, scoped to the current server process. Used
// only when DATABASE_URL is unset or a DB call fails. The fallback is
// not durable and should not be relied on in production.

import type { ParsedStatement } from "./statement-parser";
import { getSql } from "./db";

export interface PersistedStatement {
  id: string;
  fileName: string;
  uploadedAt: string;
  sizeBytes: number;
  parsed: ParsedStatement;
  summary: {
    byCategory: Record<string, { count: number; total: number; pending: number }>;
    uncategorized: number;
  };
}

const memoryStore = new Map<string, PersistedStatement>();
let schemaReady = false;

function hasDb(): boolean {
  return typeof process.env.DATABASE_URL === "string" && process.env.DATABASE_URL.length > 0;
}

async function ensureSchema(): Promise<boolean> {
  if (schemaReady) return true;
  if (!hasDb()) return false;
  try {
    const sql = getSql();
    await sql.unsafe(`
      create table if not exists bank_statements (
        id            text primary key,
        file_name     text not null,
        uploaded_at   timestamptz not null default now(),
        size_bytes    integer not null,
        account       text,
        period_start  date,
        period_end    date,
        parsed        jsonb not null,
        summary       jsonb not null
      );
      create index if not exists bank_statements_period_end_idx on bank_statements (period_end);
      create index if not exists bank_statements_account_period_idx on bank_statements (account, period_end);
    `);
    schemaReady = true;
    return true;
  } catch (err) {
    console.error("[persisted-statements] schema ensure failed:", err);
    return false;
  }
}

export interface SaveResult {
  url: string | null;
  persisted: "db" | "memory";
}

export async function savePersistedStatement(record: PersistedStatement): Promise<SaveResult> {
  memoryStore.set(record.id, record);

  if (!(await ensureSchema())) {
    return { url: null, persisted: "memory" };
  }

  try {
    const sql = getSql();
    await sql`
      insert into bank_statements (
        id, file_name, uploaded_at, size_bytes, account, period_start, period_end, parsed, summary
      ) values (
        ${record.id},
        ${record.fileName},
        ${record.uploadedAt},
        ${record.sizeBytes},
        ${record.parsed.account},
        ${record.parsed.periodStart || null},
        ${record.parsed.periodEnd || null},
        ${sql.json(record.parsed as unknown as Parameters<typeof sql.json>[0])},
        ${sql.json(record.summary as unknown as Parameters<typeof sql.json>[0])}
      )
      on conflict (id) do update set
        file_name = excluded.file_name,
        uploaded_at = excluded.uploaded_at,
        size_bytes = excluded.size_bytes,
        account = excluded.account,
        period_start = excluded.period_start,
        period_end = excluded.period_end,
        parsed = excluded.parsed,
        summary = excluded.summary
    `;
    return { url: null, persisted: "db" };
  } catch (err) {
    console.error("[persisted-statements] db save failed, retained in memory:", err);
    return { url: null, persisted: "memory" };
  }
}

interface DbRow {
  id: string;
  file_name: string;
  uploaded_at: Date | string;
  size_bytes: number;
  parsed: ParsedStatement;
  summary: PersistedStatement["summary"];
}

function rowToRecord(r: DbRow): PersistedStatement {
  const uploadedAt = typeof r.uploaded_at === "string" ? r.uploaded_at : r.uploaded_at.toISOString();
  return {
    id: r.id,
    fileName: r.file_name,
    uploadedAt,
    sizeBytes: r.size_bytes,
    parsed: r.parsed,
    summary: r.summary,
  };
}

export async function listPersistedStatements(): Promise<PersistedStatement[]> {
  const merged = new Map<string, PersistedStatement>();

  if (await ensureSchema()) {
    try {
      const sql = getSql();
      const rows = await sql<DbRow[]>`
        select id, file_name, uploaded_at, size_bytes, parsed, summary
        from bank_statements
        order by uploaded_at asc
      `;
      for (const r of rows) {
        const rec = rowToRecord(r);
        merged.set(rec.id, rec);
      }
    } catch (err) {
      console.error("[persisted-statements] db list failed:", err);
    }
  }

  // Memory entries fill in anything the DB doesn't have (e.g. mid-request before commit).
  for (const [id, rec] of memoryStore) {
    if (!merged.has(id)) merged.set(id, rec);
  }

  return Array.from(merged.values()).sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

export async function getPersistedStatement(id: string): Promise<PersistedStatement | null> {
  if (await ensureSchema()) {
    try {
      const sql = getSql();
      const rows = await sql<DbRow[]>`
        select id, file_name, uploaded_at, size_bytes, parsed, summary
        from bank_statements
        where id = ${id}
        limit 1
      `;
      if (rows.length > 0) {
        const rec = rowToRecord(rows[0]);
        memoryStore.set(rec.id, rec);
        return rec;
      }
    } catch (err) {
      console.error("[persisted-statements] db get failed:", err);
    }
  }
  return memoryStore.get(id) ?? null;
}

export async function deletePersistedStatement(id: string): Promise<boolean> {
  let ok = memoryStore.delete(id);
  if (await ensureSchema()) {
    try {
      const sql = getSql();
      const rows = await sql`delete from bank_statements where id = ${id} returning id`;
      ok = ok || rows.length > 0;
    } catch (err) {
      console.error("[persisted-statements] db delete failed:", err);
    }
  }
  return ok;
}
