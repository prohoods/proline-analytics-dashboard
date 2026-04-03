const SHOPIFY_DOMAIN = process.env.SHOPIFY_STORE_DOMAIN ?? "861fdb.myshopify.com";
const SHOPIFY_TOKEN = process.env.SHOPIFY_ADMIN_API_TOKEN ?? "";
const API_VERSION = "2025-01";

export async function shopifyFetch<T>(endpoint: string): Promise<T> {
  const url = `https://${SHOPIFY_DOMAIN}/admin/api/${API_VERSION}/${endpoint}`;
  const res = await fetch(url, {
    headers: {
      "X-Shopify-Access-Token": SHOPIFY_TOKEN,
      "Content-Type": "application/json",
    },
    next: { revalidate: 300 }, // cache 5 min
  });

  if (!res.ok) {
    throw new Error(`Shopify API error: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

export function formatCurrency(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

// Get orders for a date range
export async function getOrders(params: string) {
  return shopifyFetch<{ orders: ShopifyOrder[] }>(`orders.json?${params}&limit=250&status=any`);
}

export interface ShopifyOrder {
  id: number;
  name: string;
  created_at: string;
  total_price: string;
  subtotal_price: string;
  total_tax: string;
  financial_status: string;
  fulfillment_status: string | null;
  tags: string;
  source_name: string;
  refunds: ShopifyRefund[];
  line_items: ShopifyLineItem[];
  customer: { email: string; first_name: string; last_name: string } | null;
}

export interface ShopifyRefund {
  id: number;
  created_at: string;
  transactions: { amount: string }[];
}

export interface ShopifyLineItem {
  id: number;
  title: string;
  sku: string;
  quantity: number;
  price: string;
  variant_title: string | null;
}
