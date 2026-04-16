import { cookies } from "next/headers";
import CFOPasswordGate from "@/components/CFOPasswordGate";
import FinanceSidebar from "@/components/FinanceSidebar";

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const isAuthed = cookieStore.get("cfo-auth")?.value === "true";

  if (!isAuthed) {
    return (
      <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-6">
        <div className="flex items-center gap-3 mb-10">
          <div className="w-8 h-8 rounded-lg bg-emerald-700 flex items-center justify-center">
            <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <div>
            <div className="text-white font-semibold text-sm">Finance Hub</div>
            <div className="text-gray-500 text-xs">DZV Distributing LLC</div>
          </div>
        </div>
        <CFOPasswordGate />
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-950">
      <FinanceSidebar />
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>
    </div>
  );
}
