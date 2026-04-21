// Persistence layer for parsed bank statements.
//
// Primary: Vercel Blob (when BLOB_READ_WRITE_TOKEN is configured).
// Fallback: in-memory store, scoped to the current server process. Survives
// between requests on a single dev-server / serverless instance but is not
// durable. The fallback keeps the UX working locally without Vercel config.

import type { ParsedStatement } from "./statement-parser";

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

const BLOB_PREFIX = "finance/statements/";

// Simple process-local cache used when Blob isn't configured.
// Exposed so server code (loaders) can read it directly.
const memoryStore = new Map<string, PersistedStatement>();

function hasBlobConfig(): boolean {
  return typeof process.env.BLOB_READ_WRITE_TOKEN === "string" && process.env.BLOB_READ_WRITE_TOKEN.length > 0;
}

export async function savePersistedStatement(record: PersistedStatement): Promise<{ url: string | null; persisted: "blob" | "memory" }> {
  memoryStore.set(record.id, record);

  if (!hasBlobConfig()) {
    return { url: null, persisted: "memory" };
  }

  try {
    const { put } = await import("@vercel/blob");
    const key = `${BLOB_PREFIX}${record.id}.json`;
    const body = JSON.stringify(record);
    const { url } = await put(key, body, {
      access: "public",
      contentType: "application/json",
      addRandomSuffix: false,
      allowOverwrite: true,
    });
    return { url, persisted: "blob" };
  } catch (err) {
    console.error("[persisted-statements] blob save failed, retained in memory:", err);
    return { url: null, persisted: "memory" };
  }
}

export async function listPersistedStatements(): Promise<PersistedStatement[]> {
  // Always seed with memory store (it's a superset during a session).
  const merged = new Map<string, PersistedStatement>(memoryStore);

  if (hasBlobConfig()) {
    try {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: BLOB_PREFIX });
      for (const b of blobs) {
        if (merged.has(idFromBlobKey(b.pathname))) continue;
        try {
          const res = await fetch(b.url);
          if (!res.ok) continue;
          const record = await res.json() as PersistedStatement;
          merged.set(record.id, record);
        } catch { /* skip unreadable blobs */ }
      }
    } catch (err) {
      console.error("[persisted-statements] blob list failed:", err);
    }
  }

  return Array.from(merged.values()).sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
}

export async function getPersistedStatement(id: string): Promise<PersistedStatement | null> {
  if (memoryStore.has(id)) return memoryStore.get(id)!;

  if (hasBlobConfig()) {
    try {
      const { list } = await import("@vercel/blob");
      const { blobs } = await list({ prefix: `${BLOB_PREFIX}${id}` });
      const match = blobs.find(b => idFromBlobKey(b.pathname) === id);
      if (match) {
        const res = await fetch(match.url);
        if (res.ok) {
          const record = await res.json() as PersistedStatement;
          memoryStore.set(id, record);
          return record;
        }
      }
    } catch (err) {
      console.error("[persisted-statements] blob get failed:", err);
    }
  }
  return null;
}

function idFromBlobKey(pathname: string): string {
  return pathname.replace(BLOB_PREFIX, "").replace(/\.json$/, "");
}
