const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "861fdb.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN ?? "";
const API_VERSION = "2025-01";

// Internal fetch — returns data + Link header for pagination
async function shopifyRaw<T>(endpoint: string): Promise<{ data: T; linkHeader: string | null }> {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/${endpoint}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  }

  const data = await res.json();
  return { data, linkHeader: res.headers.get("link") };
}

// Public simple fetch — for routes that just need data, no pagination
export async function shopifyFetch<T>(endpoint: string): Promise<T> {
  const { data } = await shopifyRaw<T>(endpoint);
  return data;
}

// Extract next page_info cursor from Shopify Link header
function getNextPageInfo(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<[^>]*[?&]page_info=([^&>]+)[^>]*>;\s*rel="next"/);
  return match ? match[1] : null;
}

export function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

// Get ALL orders for a date range — auto-paginates through all Shopify pages
export async function getOrders(params: string): Promise<{ orders: ShopifyOrder[] }> {
  const allOrders: ShopifyOrder[] = [];

  // First page — date filters only work on the first request
  const first = await shopifyRaw<{ orders: ShopifyOrder[] }>(
    `orders.json?${params}&limit=250&status=any`
  );
  allOrders.push(...first.data.orders);

  // Keep fetching subsequent pages via cursor
  let nextPageInfo = getNextPageInfo(first.linkHeader);
  while (nextPageInfo) {
    const next = await shopifyRaw<{ orders: ShopifyOrder[] }>(
      `orders.json?page_info=${nextPageInfo}&limit=250`
    );
    allOrders.push(...next.data.orders);
    nextPageInfo = getNextPageInfo(next.linkHeader);
  }

  return { orders: allOrders };
}

// Get full refund details for a specific order
export async function getOrderRefunds(orderId: number) {
  const data = await shopifyFetch<{ refunds: FullRefund[] }>(`orders/${orderId}/refunds.json`);
  return data.refunds;
}

export interface FullRefund {
  id: number;
  created_at: string;
  transactions: { amount: string; kind: string; status: string }[];
  refund_line_items: { subtotal: string; total_tax: string }[];
}

export interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  total_discounts: string;
  financial_status: string;
  fulfillment_status: string | null;
  tags: string;
  source_name: string;
  landing_site: string | null;
  referring_site: string | null;
  note_attributes: { name: string; value: string }[];
  refunds: ShopifyRefund[];
  line_items: ShopifyLineItem[];
  billing_address: { province: string; province_code: string; city: string; country_code: string } | null;
  customer: { id: number; email: string; first_name: string; last_name: string; orders_count?: number; tags?: string } | null;
}

export interface ShopifyRefund {
  id: number;
  created_at: string;
  transactions: { amount: string; kind: string; status: string }[];
  refund_line_items: { subtotal: string; total_tax: string }[];
}

export interface ShopifyLineItem {
  id: number;
  title: string;
  sku: string;
  quantity: number;
  price: string;
  variant_title: string | null;
}
