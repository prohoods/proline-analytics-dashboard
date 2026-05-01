"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState, useMemo } from "react";
import { useTheme } from "@/components/ThemeProvider";

interface NavItem { href: string; label: string; icon: string; }
interface ExpandableItem { href: string; label: string; icon: string; children?: NavItem[]; }
interface NavSection { label: string; icon: string; items: ExpandableItem[]; }

const navSections: NavSection[] = [
  {
    label: "Revenue", icon: "💵",
    items: [
      { href: "/dashboard",          label: "Overview",             icon: "⬛" },
      { href: "/dashboard/sales",    label: "Daily & Monthly Sales",icon: "📈" },
      { href: "/dashboard/monthly-pnl", label: "Monthly P&L",       icon: "📊" },
      { href: "/dashboard/shopify",  label: "Shopify Live Orders",  icon: "🟢" },
      { href: "/dashboard/shl",      label: "Smart Home Luxury",    icon: "🏠" },
      { href: "/dashboard/marketplace", label: "Marketplace Sales", icon: "🏪" },
    ],
  },
  {
    label: "Performance", icon: "🎯",
    items: [
      { href: "/dashboard/scorecard", label: "Scorecard", icon: "🎯" },
    ],
  },
  {
    label: "Advertising", icon: "📣",
    items: [
      { href: "/dashboard/ad-spend", label: "All Ad Spend", icon: "💰" },
      {
        href: "/dashboard/google-ads", label: "Google Ads", icon: "🔵",
        children: [
          { href: "/dashboard/pmax",       label: "PMAX Campaigns",    icon: "⚡" },
          { href: "/dashboard/shopping",   label: "Shopping",          icon: "🛒" },
          { href: "/dashboard/search",     label: "Search Campaigns",  icon: "🔍" },
          { href: "/dashboard/demand-gen", label: "Demand Gen",        icon: "📣" },
          { href: "/dashboard/gclid",      label: "GCLID Attribution", icon: "🔗" },
          { href: "/dashboard/google-mer", label: "Google MER",        icon: "📊" },
        ],
      },
      { href: "/dashboard/bing",        label: "Bing / Microsoft", icon: "🪟" },
      { href: "/dashboard/connexity",   label: "Connexity",        icon: "🟣" },
      { href: "/dashboard/meta",        label: "Meta",             icon: "📘" },
      { href: "/dashboard/pinterest",   label: "Pinterest",        icon: "📌" },
      { href: "/dashboard/amazon-ads",  label: "Amazon Ads",       icon: "🟠" },
    ],
  },
  {
    label: "Email Marketing", icon: "📧",
    items: [
      {
        href: "/dashboard/email", label: "Email Overview", icon: "📧",
        children: [
          { href: "/dashboard/email/campaigns", label: "Campaigns", icon: "📨" },
          { href: "/dashboard/email/flows",     label: "Flows",     icon: "🔄" },
        ],
      },
    ],
  },
  {
    label: "Products", icon: "📦",
    items: [
      { href: "/dashboard/products",     label: "Profitability",  icon: "📦" },
      { href: "/dashboard/products/ads", label: "Ad Performance", icon: "🎯" },
    ],
  },
  {
    label: "Customers", icon: "👤",
    items: [
      { href: "/dashboard/customers",             label: "Customer Directory",      icon: "👤" },
      { href: "/dashboard/customers/acquisition", label: "Acquisition & Retention", icon: "🎯" },
    ],
  },
  {
    label: "Operations", icon: "⚙️",
    items: [
      { href: "/dashboard/refunds",     label: "Shopify Refunds",  icon: "↩️" },
      { href: "/dashboard/fulfillment", label: "Order Fulfillment", icon: "🚚" },
    ],
  },
];

// All paths that belong to each section (for auto-open logic)
function sectionContainsPath(section: NavSection, pathname: string): boolean {
  return section.items.some(item =>
    pathname === item.href ||
    pathname.startsWith(item.href + "/") ||
    item.children?.some(c => pathname === c.href || pathname.startsWith(c.href + "/"))
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggle: toggleTheme } = useTheme();

  // Section open/closed state — auto-open the active section
  const defaultOpenSections = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const section of navSections) {
      map[section.label] = sectionContainsPath(section, pathname);
    }
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // only compute once on mount

  const [openSections, setOpenSections] = useState<Record<string, boolean>>(defaultOpenSections);

  // Item-level expandable groups (Google Ads sub-pages, Customers, Email)
  const defaultOpenGroups = useMemo(() => ({
    "/dashboard/google-ads": ["/dashboard/pmax","/dashboard/shopping","/dashboard/search","/dashboard/demand-gen","/dashboard/gclid","/dashboard/google-mer"].some(p => pathname.startsWith(p)),
    "/dashboard/email":      pathname.startsWith("/dashboard/email"),
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(defaultOpenGroups);

  function toggleSection(label: string) {
    setOpenSections(prev => ({ ...prev, [label]: !prev[label] }));
  }
  function toggleGroup(href: string) {
    setOpenGroups(prev => ({ ...prev, [href]: !prev[href] }));
  }

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
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0.5">
        {navSections.map((section) => {
          const isOpen = openSections[section.label];
          const hasActive = sectionContainsPath(section, pathname);

          return (
            <div key={section.label}>
              {/* Section header — clickable toggle */}
              <button
                onClick={() => toggleSection(section.label)}
                className={`flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors group ${
                  hasActive
                    ? "text-blue-400 hover:text-blue-300"
                    : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/60"
                }`}
              >
                <span className="text-sm">{section.icon}</span>
                <span className="flex-1 text-left">{section.label}</span>
                <svg
                  className={`w-3 h-3 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {/* Section items */}
              {isOpen && (
                <div className="mb-1 space-y-0.5">
                  {section.items.map((item) => {
                    const isActive = pathname === item.href;
                    const hasChildren = !!item.children?.length;
                    const isGroupOpen = openGroups[item.href];
                    const isChildActive = hasChildren && item.children!.some(c => pathname === c.href || pathname.startsWith(c.href + "/"));

                    return (
                      <div key={item.href}>
                        {hasChildren ? (
                          <button
                            onClick={() => toggleGroup(item.href)}
                            className={`flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors ${
                              isChildActive || isActive
                                ? "bg-blue-600/20 text-blue-400 font-medium"
                                : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                            }`}
                          >
                            <span className="text-base w-5 text-center">{item.icon}</span>
                            <span className="flex-1 text-left">{item.label}</span>
                            <svg
                              className={`w-3 h-3 transition-transform duration-150 ${isGroupOpen ? "rotate-180" : ""}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                            </svg>
                          </button>
                        ) : (
                          <Link
                            href={item.href}
                            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                              isActive
                                ? "bg-blue-600/20 text-blue-400 font-medium"
                                : "text-gray-400 hover:text-gray-100 hover:bg-gray-800"
                            }`}
                          >
                            <span className="text-base w-5 text-center">{item.icon}</span>
                            {item.label}
                          </Link>
                        )}

                        {/* Sub-items */}
                        {hasChildren && isGroupOpen && (
                          <div className="mt-0.5 ml-4 pl-3 border-l border-gray-800 space-y-0.5">
                            <Link
                              href={item.href}
                              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs transition-colors ${
                                isActive ? "text-blue-400 font-medium" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800"
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
              )}
            </div>
          );
        })}
      </nav>

      {/* Settings dropdown */}
      <SettingsDropdown>
        <Link
          href="/finance"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
        >
          <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
          </svg>
          Switch to Finance Hub
        </Link>
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
      </SettingsDropdown>
    </div>
  );
}

function SettingsDropdown({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="px-3 py-3 border-t border-gray-800">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm text-gray-400 hover:text-gray-100 hover:bg-gray-800 transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
        <span className="flex-1 text-left">Settings</span>
        <svg className={`w-3 h-3 transition-transform duration-150 ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className="mt-1 space-y-0.5">
          {children}
        </div>
      )}
    </div>
  );
}
