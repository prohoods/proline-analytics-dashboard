const KLAVIYO_API_KEY = process.env.KLAVIYO_API_KEY ?? "";
const BASE = "https://a.klaviyo.com/api";
const REVISION = "2024-10-15";

function headers() {
  return {
    "Authorization": `Klaviyo-API-Key ${KLAVIYO_API_KEY}`,
    "revision": REVISION,
    "Content-Type": "application/json",
  };
}

export async function klaviyoGet(path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  }
  const res = await fetch(url.toString(), {
    headers: headers(),
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Klaviyo GET ${path}: ${res.status} — ${text.slice(0, 300)}`);
  }
  return res.json();
}

export async function klaviyoPost(path: string, body: unknown): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
    next: { revalidate: 300 },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Klaviyo POST ${path}: ${res.status} — ${text.slice(0, 300)}`);
  }
  return res.json();
}

/** Walk all pages of a GET endpoint, returning all data items. */
export async function klaviyoGetAll(path: string, params?: Record<string, string>): Promise<any[]> {
  let results: any[] = [];
  let nextUrl: string | null = null;

  // First page
  const first = await klaviyoGet(path, params);
  results = results.concat(first.data ?? []);
  nextUrl = first.links?.next ?? null;

  // Subsequent pages
  while (nextUrl) {
    const res = await fetch(nextUrl, { headers: headers(), next: { revalidate: 300 } });
    if (!res.ok) break;
    const page = await res.json();
    results = results.concat(page.data ?? []);
    nextUrl = page.links?.next ?? null;
  }

  return results;
}

/** Find the "Placed Order" metric ID — needed for revenue attribution in reports. */
export async function getPlacedOrderMetricId(): Promise<string | null> {
  const metrics = await klaviyoGetAll("/metrics/", { "page[size]": "200" });
  const metric = metrics.find((m: any) => m.attributes?.name === "Placed Order");
  return metric?.id ?? null;
}
