const SHL_DOMAIN = process.env.SHL_SHOPIFY_DOMAIN ?? "a11c08-ce.myshopify.com";
const SHL_TOKEN = process.env.SHL_SHOPIFY_TOKEN ?? "";
const API_VERSION = "2025-01";

async function shlRaw<T>(endpoint: string): Promise<{ data: T; linkHeader: string | null }> {
  const url = `https://${SHL_DOMAIN}/admin/api/${API_VERSION}/${endpoint}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHL_TOKEN,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`SHL Shopify API error: ${res.status} ${res.statusText}`);
  }

  return { data: await res.json(), linkHeader: res.headers.get("link") };
}

function getNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return match ? match[1] : null;
}

export async function getSHLOrders(params: string) {
  const allOrders: SHLOrder[] = [];

  const first = await shlRaw<{ orders: SHLOrder[] }>(
    `orders.json?${params}&limit=250&status=any`
  );
  allOrders.push(...first.data.orders);

  let nextPageInfo = getNextPageInfo(first.linkHeader);
  while (nextPageInfo) {
    const next = await shlRaw<{ orders: SHLOrder[] }>(
      `orders.json?page_info=${nextPageInfo}&limit=250`
    );
    allOrders.push(...next.data.orders);
    nextPageInfo = getNextPageInfo(next.linkHeader);
  }

  return { orders: allOrders };
}

export async function getSHLOrderRefunds(orderId: number) {
  const data = await shlRaw<{ refunds: SHLRefund[] }>(`orders/${orderId}/refunds.json`);
  return data.data.refunds;
}

export interface SHLOrder {
  id: number;
  name: string;
  created_at: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  total_shipping_price_set: { shop_money: { amount: string } };
  financial_status: string;
  fulfillment_status: string | null;
  refunds: SHLRefund[];
}

export interface SHLRefund {
  id: number;
  created_at: string;
  transactions: { amount: string; kind: string; status: string }[];
  refund_line_items: { subtotal: string; total_tax: string }[];
}
