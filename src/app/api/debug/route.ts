import { NextResponse } from "next/server";

export async function GET() {
  const key = process.env.GOOGLE_PRIVATE_KEY ?? "";
  return NextResponse.json({
    keyLength: key.length,
    keyStart: key.substring(0, 40),
    keyEnd: key.substring(key.length - 40),
    hasNewlines: key.includes("\n"),
    hasEscapedNewlines: key.includes("\\n"),
    email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    salesSheetId: process.env.SALES_REPORT_SHEET_ID ? "set" : "MISSING",
  });
}
