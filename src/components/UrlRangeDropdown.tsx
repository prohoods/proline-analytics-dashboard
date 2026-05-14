"use client";

// Thin client wrapper around DateRangeDropdown that writes the chosen
// range into a `?range=` query param. Server pages can read the param
// from searchParams and re-render with the matching date window — no
// API endpoints or client-side fetching required.

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { RangeKey } from "@/lib/date-ranges";
import DateRangeDropdown from "./DateRangeDropdown";

interface Props {
  value: RangeKey;
  paramKey?: string;
}

export default function UrlRangeDropdown({ value, paramKey = "range" }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function handleChange(next: RangeKey) {
    const params = new URLSearchParams(searchParams.toString());
    params.set(paramKey, next);
    router.push(`${pathname}?${params.toString()}`);
  }

  return <DateRangeDropdown value={value} onChange={handleChange} />;
}
