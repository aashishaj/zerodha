import { useState } from "react";
import { Notebook, History } from "lucide-react";

type OrdersSubTab = "orders" | "gtt";

const subTabs: Array<{ value: OrdersSubTab; label: string }> = [
  { value: "orders", label: "Orders" },
  { value: "gtt", label: "GTT" },
];

export function OrdersTab() {
  const [activeSubTab, setActiveSubTab] = useState<OrdersSubTab>("orders");

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Secondary tab bar — active tab gets the orange underline. */}
      <div className="flex h-10 items-end gap-6 border-b border-[#e8edf3] bg-white px-6">
        {subTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveSubTab(tab.value)}
            className={`relative h-full border-0 bg-transparent pb-2 text-[13px] ${
              activeSubTab === tab.value ? "font-medium text-[#222]" : "text-[#6b7280]"
            }`}
          >
            {tab.label}
            {activeSubTab === tab.value && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#ff5722]" />
            )}
          </button>
        ))}
      </div>

      {/* Centered empty state. */}
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        {activeSubTab === "orders" ? (
          <>
            <Notebook className="h-16 w-16 text-[#d4dae3]" strokeWidth={1.25} />
            <p className="mt-6 text-[15px] text-[#444]">You haven't placed any orders today</p>
            <button className="mt-6 rounded-sm bg-[#4184f3] px-5 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#3574e0]">
              Get started
            </button>
            <button className="mt-5 inline-flex items-center gap-1.5 border-0 bg-transparent text-[13px] text-[#4184f3]">
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#4184f3]">
                <History className="h-2.5 w-2.5" strokeWidth={2} />
              </span>
              View history
            </button>
          </>
        ) : (
          <>
            <Notebook className="h-16 w-16 text-[#d4dae3]" strokeWidth={1.25} />
            <p className="mt-6 text-[15px] text-[#444]">You haven't created any GTT orders</p>
            <button className="mt-6 rounded-sm bg-[#4184f3] px-5 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#3574e0]">
              Get started
            </button>
          </>
        )}
      </div>
    </div>
  );
}
