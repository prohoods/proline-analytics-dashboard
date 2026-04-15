import { cookies } from "next/headers";
import CFOPasswordGate from "@/components/CFOPasswordGate";

const tabs = [
  { href: "/dashboard/cfo/overview", label: "Overview" },
  { href: "/dashboard/cfo/expenses", label: "Expenses" },
  { href: "/dashboard/cfo/payroll", label: "Payroll" },
];

export default async function CFOLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isAuthed = cookieStore.get("cfo-auth")?.value === "true";

  if (!isAuthed) {
    return <CFOPasswordGate />;
  }

  return (
    <div>
      {/* Restricted banner + tabs */}
      <div className="border-b border-gray-800 bg-gray-900/60 px-6">
        <div className="flex items-center justify-between pt-4 pb-0">
          <div className="flex items-center gap-2">
            <svg className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <span className="text-xs text-emerald-400 font-medium">CFO — Restricted Access</span>
            <span className="text-gray-700 text-xs ml-2">KeyBank · DZV Distributing LLC · Account …0115</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-3">
          {tabs.map(tab => (
            <CFOTab key={tab.href} href={tab.href} label={tab.label} />
          ))}
        </div>
      </div>

      {children}
    </div>
  );
}

// Client tab that highlights based on pathname
import CFOTabClient from "@/components/CFOTabClient";
function CFOTab({ href, label }: { href: string; label: string }) {
  return <CFOTabClient href={href} label={label} />;
}
