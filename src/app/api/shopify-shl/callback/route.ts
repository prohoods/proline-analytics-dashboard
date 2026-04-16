import { NextRequest, NextResponse } from "next/server";

const SHOP = "a11c08-ce.myshopify.com";
const CLIENT_ID = process.env.SHL_SHOPIFY_CLIENT_ID!;
const CLIENT_SECRET = process.env.SHL_SHOPIFY_CLIENT_SECRET!;

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "No code returned from Shopify" }, { status: 400 });
  }

  // Exchange code for permanent access token
  const res = await fetch(`https://${SHOP}/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, code }),
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: `Shopify token exchange failed: ${err}` }, { status: 500 });
  }

  const { access_token } = await res.json();

  // Show the token so it can be added to Vercel
  return new NextResponse(`
    <!DOCTYPE html>
    <html>
    <head><title>SHL Token Setup</title>
    <style>
      body { font-family: monospace; background: #0a0a0a; color: #e5e5e5; display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
      .box { background: #111; border: 1px solid #333; border-radius: 12px; padding: 40px; max-width: 600px; width: 100%; }
      h2 { color: #10b981; margin-top: 0; }
      .token { background: #1a1a1a; border: 1px solid #10b981; border-radius: 8px; padding: 16px; word-break: break-all; color: #10b981; font-size: 14px; margin: 16px 0; }
      p { color: #9ca3af; line-height: 1.6; }
      strong { color: #fff; }
    </style>
    </head>
    <body>
      <div class="box">
        <h2>✓ SHL Token Generated</h2>
        <p>Copy this token and add it to Vercel as <strong>SHL_SHOPIFY_TOKEN</strong>:</p>
        <div class="token">${access_token}</div>
        <p>Go to <strong>Vercel → Project Settings → Environment Variables</strong> and add:<br/>
        Name: <strong>SHL_SHOPIFY_TOKEN</strong><br/>
        Value: the token above</p>
        <p>Then redeploy and you're done. You can close this page.</p>
      </div>
    </body>
    </html>
  `, { headers: { "Content-Type": "text/html" } });
}
