import { Briefcase, BarChart3, ChevronDown } from "lucide-react";

export function HoldingsTab() {
  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Secondary tab bar — single active "Equity" tab with the orange underline. */}
      <div className="flex h-10 items-end gap-6 border-b border-[#e8edf3] bg-white px-6">
        <button className="relative h-full border-0 bg-transparent pb-2 text-[13px] font-medium text-[#222]">
          Equity
          <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#ff5722]" />
        </button>
      </div>

      {/* Heading row: "Holdings" with an "All equity" dropdown to its right. */}
      <div className="flex items-center justify-between px-6 py-5">
        <h1 className="text-[22px] font-medium text-[#444]">Holdings</h1>
        <button className="inline-flex items-center gap-1.5 rounded-sm border border-[#e0e0e0] px-3 py-1.5 text-[13px] text-[#444] transition hover:bg-[#f7f8fa]">
          All equity
          <ChevronDown className="h-4 w-4 text-[#9aa3af]" />
        </button>
      </div>

      {/* Centered empty state. */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <Briefcase className="h-16 w-16 text-[#d4dae3]" strokeWidth={1.25} />
        <p className="mt-6 max-w-md text-[15px] leading-6 text-[#444]">
          You don't have any stocks in your DEMAT yet. Get started with absolutely free equity
          investments.
        </p>
        <button className="mt-6 rounded-sm bg-[#4184f3] px-5 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#3574e0]">
          Get started
        </button>
        <button className="mt-5 inline-flex items-center gap-1.5 border-0 bg-transparent text-[13px] text-[#4184f3]">
          <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#4184f3]">
            <BarChart3 className="h-2.5 w-2.5" strokeWidth={2} />
          </span>
          Analytics
        </button>
      </div>
    </div>
  );
}
