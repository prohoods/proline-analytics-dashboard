# Proline Analytics Dashboard

Internal analytics dashboard for Proline Range Hoods. Consolidates all reporting — sales, ad spend, GCLID attribution, PMAX, product profitability, and operations — into one place.

**Private — Proline team access only.**

## Pages

- Overview — KPIs, sales by channel, ad spend summary
- Daily & Monthly Sales — Shopify data by channel
- All Ad Spend — Google, Connexity, Bing, Meta, Pinterest, Amazon
- GCLID Attribution — Google Ads order attribution
- PMAX & Shopping — Campaign performance by product tier
- Search Campaigns — Branded, nonbranded, DSA performance
- Shopify Refunds — Refund log with product and notes
- Product Profitability — Margin by SKU/tier
- Marketplace Sales — Amazon, Wayfair, Home Depot

## Stack

Next.js + TypeScript + Tailwind CSS, hosted on Vercel.

## Setup

Copy `.env.example` to `.env.local` and fill in your API keys. Never commit `.env.local`.
