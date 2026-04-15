"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function CFOTabClient({ href, label }: { href: string; label: string }) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors border-b-2 -mb-px ${
        isActive
          ? "text-emerald-400 border-emerald-500 bg-emerald-900/10"
          : "text-gray-400 border-transparent hover:text-gray-200 hover:bg-gray-800/50"
      }`}
    >
      {label}
    </Link>
  );
}
