// Service-account auth for GA4 Data API + Search Console API.
//
// Single env var GA_SERVICE_ACCOUNT_JSON holds the full service-account
// JSON blob (the file Google gives you when you create a key). We sign a
// JWT locally with the private key, then exchange it at the OAuth2 token
// endpoint for an access token good for one hour.
//
// Tokens are cached in-process per scope so repeated calls within a sync
// don't re-sign and re-exchange on every request.

import crypto from "crypto";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  token_uri?: string;
}

let cachedSAKey: ServiceAccountKey | null = null;

export function getServiceAccountKey(): ServiceAccountKey {
  if (cachedSAKey) return cachedSAKey;
  const raw = process.env.GA_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error(
      "GA_SERVICE_ACCOUNT_JSON env var not set — paste the full service account JSON"
    );
  }
  let parsed: ServiceAccountKey;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(
      "GA_SERVICE_ACCOUNT_JSON is not valid JSON: " +
        (e instanceof Error ? e.message : String(e))
    );
  }
  if (!parsed.client_email || !parsed.private_key) {
    throw new Error("Service account JSON missing client_email or private_key");
  }
  // Vercel sometimes stores newlines as literal "\n" — normalize.
  parsed.private_key = parsed.private_key.replace(/\\n/g, "\n");
  cachedSAKey = parsed;
  return parsed;
}

function base64url(buf: Buffer | string): string {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

interface CachedToken {
  token: string;
  expiresAt: number; // epoch ms
}
const tokenCache = new Map<string, CachedToken>();

export async function getServiceAccountAccessToken(scope: string): Promise<string> {
  const cached = tokenCache.get(scope);
  // Refresh 60s before expiry to dodge clock skew.
  if (cached && cached.expiresAt - 60_000 > Date.now()) {
    return cached.token;
  }

  const key = getServiceAccountKey();
  const tokenUri = key.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);

  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64url(
    JSON.stringify({
      iss: key.client_email,
      scope,
      aud: tokenUri,
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claim}`;
  const signature = crypto
    .createSign("RSA-SHA256")
    .update(signingInput)
    .sign(key.private_key);
  const jwt = `${signingInput}.${base64url(signature)}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Service account token exchange failed ${res.status}: ${err}`);
  }
  const data = (await res.json()) as { access_token: string; expires_in: number };
  tokenCache.set(scope, {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  });
  return data.access_token;
}
