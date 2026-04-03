import { NextResponse } from "next/server";
import { shopifyFetch } from "@/lib/shopify";

export async function GET() {
  // Fetch last 10 orders with any financial status
  const data = await shopifyFetch<{ orders: any[] }>(
    "orders.json?limit=10&status=any&financial_status=any"
  );

  // Find orders that have refunds
  const withRefunds = data.orders.filter(o => o.refunds && o.refunds.length > 0);

  if (withRefunds.length === 0) {
    return NextResponse.json({
      message: "No refunds found in last 10 orders",
      orderCount: data.orders.length,
      statuses: data.orders.map(o => ({ id: o.id, financial_status: o.financial_status, refunds: o.refunds })),
    });
  }

  // Return the raw refund structure of the first order with refunds
  const sample = withRefunds[0];
  return NextResponse.json({
    orderId: sample.id,
    orderName: sample.name,
    financialStatus: sample.financial_status,
    totalPrice: sample.total_price,
    refunds: sample.refunds,
  });
}
