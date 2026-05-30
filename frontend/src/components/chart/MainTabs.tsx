import type { MainTab } from "../../types";

interface MainTabsProps {
  activeTab: MainTab;
  onTabChange: (tab: MainTab) => void;
}

const tabs: Array<{ value: MainTab; label: string }> = [
  { value: "chart", label: "Chart" },
  { value: "option-chain", label: "Option chain" },
  { value: "fundamentals", label: "Fundamentals" },
];

export function MainTabs({ activeTab, onTabChange }: MainTabsProps) {
  return (
    <div className="flex h-10 items-end gap-6 border-b border-[#e8edf3] bg-white px-6">
      {tabs.map((tab) => (
        <button
          key={tab.value}
          onClick={() => onTabChange(tab.value)}
          className={`relative h-full border-0 bg-transparent pb-2 text-[13px] ${
            activeTab === tab.value ? "font-medium text-[#222]" : "text-[#6b7280]"
          }`}
        >
          {tab.label}
          {activeTab === tab.value && <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#ff5722]" />}
        </button>
      ))}
    </div>
  );
}
