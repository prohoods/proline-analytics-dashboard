import postgres from "postgres";

declare global {
  var __sql: ReturnType<typeof postgres> | undefined;
}

export function getSql() {
  if (global.__sql) return global.__sql;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  global.__sql = postgres(url, { ssl: "require" });
  return global.__sql;
}

// Returns a map of Shopify order name (e.g. "#12345") → total shipping cost
// for that order, summed across all packages. Orders with no recorded shipping
// row are simply absent from the map (caller should treat as null/unknown).
export async function getShippingByOrder(orderNames: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (orderNames.length === 0) return out;
  const sql = getSql();
  const rows = await sql<{ order_name: string; total: string }[]>`
    select order_name, sum(cost)::text as total
    from shipping_costs
    where order_name = any(${orderNames})
    group by order_name
  `;
  for (const r of rows) out.set(r.order_name, parseFloat(r.total));
  return out;
}
