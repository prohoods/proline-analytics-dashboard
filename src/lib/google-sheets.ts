import { google } from "googleapis";

function getAuth() {
  let privateKey = process.env.GOOGLE_PRIVATE_KEY ?? "";

  // Vercel sometimes escapes newlines — unescape them
  if (privateKey.includes("\\n")) {
    privateKey = privateKey.replace(/\\n/g, "\n");
  }

  // Strip surrounding quotes if Vercel wrapped the value in them
  if (privateKey.startsWith('"') && privateKey.endsWith('"')) {
    privateKey = privateKey.slice(1, -1);
  }

  return new google.auth.GoogleAuth({
    credentials: {
      type: "service_account",
      project_id: process.env.GOOGLE_PROJECT_ID,
      private_key_id: process.env.GOOGLE_PRIVATE_KEY_ID,
      private_key: privateKey,
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      client_id: process.env.GOOGLE_CLIENT_ID,
    },
    scopes: [
      "https://www.googleapis.com/auth/spreadsheets.readonly",
      "https://www.googleapis.com/auth/drive.readonly",
    ],
  });
}

export async function getSheetData(
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
  });

  return (response.data.values as string[][]) || [];
}

// Helper: parse currency strings like "$1,234.56" → number
export function parseCurrency(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/[$,%]/g, "").replace(/,/g, "")) || 0;
}

// Helper: parse percentage strings like "43.75%" → number
export function parsePercent(val: string): number {
  if (!val) return 0;
  return parseFloat(val.replace(/%/g, "")) || 0;
}
