"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { useTheme } from "@/components/ThemeProvider";

interface NavItem { href: string; label: string; icon: string; }
// Top-level sections with optional sub-items
interface ExpandableItem {
  href: string;
  label: string;
  icon: string;
  children?: NavItem[];
}

interface ExpandableSection {
  label: string;
  items: ExpandableItem[];
  cfo?: boolean;
}

const navSections: ExpandableSection[] = [
  {
    label: "Revenue",
    items: [
      { href: "/dashboard", label: "Overview", icon: "⬛" },
      { href: "/dashboard/sales", label: "Daily & Monthly Sales", icon: "📈" },
      { href: "/dashboard/shopify", label: "Shopify Live Orders", icon: "🟢" },
      { href: "/dashboard/marketplace", label: "Marketplace Sales", icon: "🏪" },
    ],
  },
  {
    label: "Performance",
    items: [
      { href: "/dashboard/scorecard", label: "Scorecard", icon: "🎯" },
    ],
  },
  {
    label: "Advertising",
    items: [
      { href: "/dashboard/ad-spend", label: "All Ad Spend", icon: "💰" },
      {
        href: "/dashboard/google-ads",
        label: "Google Ads",
        icon: "🔵",
        children: [
          { href: "/dashboard/pmax", label: "PMAX Campaigns", icon: "⚡" },
          { href: "/dashboard/shopping", label: "Shopping", icon: "🛒" },
          { href: "/dashboard/search", label: "Search Campaigns", icon: "🔍" },
          { href: "/dashboard/demand-gen", label: "Demand Gen", icon: "📣" },
          { href: "/dashboard/gclid", label: "GCLID Attribution", icon: "🔗" },
          { href: "/dashboard/google-mer", label: "Google MER", icon: "📊" },
        ],
      },
      { href: "/dashboard/bing", label: "Bing / Microsoft", icon: "🪟" },
      { href: "/dashboard/connexity", label: "Connexity", icon: "🟣" },
      { href: "/dashboard/meta", label: "Meta", icon: "📘" },
      { href: "/dashboard/pinterest", label: "Pinterest", icon: "📌" },
      { href: "/dashboard/amazon-ads", label: "Amazon Ads", icon: "🟠" },
    ],
  },
  {
    label: "Email Marketing",
    items: [
      {
        href: "/dashboard/email",
        label: "Email Overview",
        icon: "📧",
        children: [
          { href: "/dashboard/email/campaigns", label: "Campaigns", icon: "📨" },
          { href: "/dashboard/email/flows", label: "Flows", icon: "🔄" },
        ],
      },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/refunds", label: "Shopify Refunds", icon: "↩️" },
      { href: "/dashboard/products", label: "Product Profitability", icon: "📦" },
      { href: "/dashboard/fulfillment", label: "Order Fulfillment", icon: "🚚" },
      {
        href: "/dashboard/customers",
        label: "Customers",
        icon: "👤",
        children: [
          { href: "/dashboard/customers", label: "Customer Insights", icon: "👤" },
          { href: "/dashboard/customers/acquisition", label: "Acquisition & Retention", icon: "🎯" },
        ],
      },
      { href: "/dashboard/shopping-feed", label: "Product Ad Performance", icon: "📋" },
    ],
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  // Track which expandable items are open
  // Auto-open Google Ads if on a Google Ads sub-page, Bing if on Bing sub-page
  const googleAdsSubPaths = ["/dashboard/pmax", "/dashboard/shopping", "/dashboard/search", "/dashboard/demand-gen", "/dashboard/gclid"];
  const customersSubPaths = ["/dashboard/customers"];
  const emailSubPaths = ["/dashboard/email"];
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    "/dashboard/google-ads": googleAdsSubPaths.some(p => pathname.startsWith(p)),
    "/dashboard/customers": customersSubPaths.some(p => pathname.startsWith(p)),
    "/dashboard/email": emailSubPaths.some(p => pathname.startsWith(p)),
  });

  function toggleGroup(href: string) {
    setOpenGroups(prev => ({ ...prev, [href]: !prev[href] }));
  }

  const { theme, toggle: toggleTheme } = useTheme();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <div className="flex flex-col h-full w-64 bg-gray-900 border-r border-gray-800 flex-shrink-0">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-gray-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
          </div>
          <div>
            <div className="text-white font-semibold text-sm leading-tight">Proline Analytics</div>
            <div className="text-gray-500 text-xs">Range Hoods</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {navSections.map((section) => (
          <div key={section.label}>
            <div className={`px-3 mb-2 text-xs font-semibold uppercase tracking-wider ${section.cfo ? "text-emerald-600" : "text-gray-500"}`}>
              {section.label}
            </div>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href;
                const hasChildren = item.children && item.children.length > 0;
                const isOpen = openGroups[item.href];
                const isChildActive = hasChildren && item.children!.some(c => pathname === c.href);
                const isCFO = section.cfo;

                return (
                  <div key={item.href}>
                    {hasChildren ? (
                      // Expandable group header
                      <button
                        onClick={() => toggleGroup(item.href)}
                        className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                          isChildActive || isActive
                            ? "bg-blue-600/20 text-blue-400 font-medium"
                            : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                        }`}
                      >
                        <span className="text-base">{item.icon}</span>
                        <span className="flex-1 text-left">{item.label}</span>
                        <svg
                          className={`w-3 h-3 transition-transform ${isOpen ? "rotate-180" : ""}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </button>
                    ) : (
                      // Regular link
                      <Link
                        href={item.href}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? isCFO
                              ? "bg-emerald-600/20 text-emerald-400 font-medium"
                              : "bg-blue-600/20 text-blue-400 font-medium"
                            : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                        }`}
                      >
                        <span className="text-base">{item.icon}</span>
                        {item.label}
                      </Link>
                    )}

                    {/* Sub-items */}
                    {hasChildren && isOpen && (
                      <div className="mt-0.5 ml-3 pl-3 border-l border-gray-800 space-y-0.5">
                        {/* Link to parent page too */}
                        <Link
                          href={item.href}
                          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                            isActive
                              ? "text-blue-400 font-medium"
                              : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                          }`}
                        >
                          Overview
                        </Link>
                        {item.children!.map((child) => {
                          const childActive = pathname === child.href;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                                childActive
                                  ? "bg-blue-600/20 text-blue-400 font-medium"
                                  : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
                              }`}
                            >
                              <span>{child.icon}</span>
                              {child.label}
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 py-4 border-t border-gray-800 space-y-1">
        <Link
          href="/finance"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-emerald-600 hover:text-emerald-400 hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Finance Hub
        </Link>
        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
        >
          {theme === "dark" ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 7a5 5 0 100 10A5 5 0 0012 7z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
          {theme === "dark" ? "Light mode" : "Dark mode"}
        </button>

        <button
          onClick={handleLogout}
          className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
          </svg>
          Sign out
        </button>
      </div>
    </div>
  );
}
