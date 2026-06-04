import { useEffect, useRef, useState } from "react";
import type { LayoutId } from "../../types";

interface LayoutSetupPopoverProps {
  selectedLayout: LayoutId;
  onSelectLayout: (layout: LayoutId) => void;
  onClose: () => void;
}

function LayoutIcon({ type }: { type: LayoutId }) {
  if (type === "single") {
    return <div className="h-full w-full rounded-[1px] border border-current" />;
  }
  if (type === "twoVertical") {
    return (
      <div className="flex h-full w-full gap-[2px]">
        <div className="flex-1 rounded-[1px] border border-current" />
        <div className="flex-1 rounded-[1px] border border-current" />
      </div>
    );
  }
  return (
    <div className="flex h-full w-full flex-col gap-[2px]">
      <div className="flex-1 rounded-[1px] border border-current" />
      <div className="flex-1 rounded-[1px] border border-current" />
    </div>
  );
}

const SYNC_OPTIONS = ["Symbol", "Interval", "Crosshair", "Time", "Date range"] as const;

const LAYOUT_ROWS: Array<{ count: number; options: Array<{ id: LayoutId; title: string }> }> = [
  { count: 1, options: [{ id: "single", title: "Single chart" }] },
  {
    count: 2,
    options: [
      { id: "twoVertical", title: "2 charts side by side" },
      { id: "twoHorizontal", title: "2 charts stacked" },
    ],
  },
];

export function LayoutSetupPopover({ selectedLayout, onSelectLayout, onClose }: LayoutSetupPopoverProps) {
  const [syncToggles, setSyncToggles] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("layoutSyncToggles") ?? "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointer = (event: MouseEvent) => {
      if (!popoverRef.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    // Delay so the triggering mousedown doesn't immediately close
    const timer = window.setTimeout(() => {
      window.addEventListener("mousedown", onPointer);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const toggleSync = (key: string) => {
    setSyncToggles((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem("layoutSyncToggles", JSON.stringify(next));
      return next;
    });
  };

  return (
    <div
      ref={popoverRef}
      className="absolute right-0 top-[calc(100%+4px)] z-40 w-52 rounded border border-[#e5e7eb] bg-white shadow-lg"
    >
      {/* Layout rows */}
      <div className="px-3 pb-2 pt-2.5">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#9aa3af]">
          Layout
        </div>
        <div className="space-y-2">
          {LAYOUT_ROWS.map(({ count, options }) => (
            <div key={count} className="flex items-center gap-1.5">
              <span className="w-3 text-center text-[11px] text-[#b0b8c4]">{count}</span>
              {options.map(({ id, title }) => {
                const active = selectedLayout === id;
                return (
                  <button
                    key={id}
                    title={title}
                    onClick={() => {
                      onSelectLayout(id);
                      onClose();
                    }}
                    className={`flex h-9 w-10 items-center justify-center rounded border p-1.5 transition-colors ${
                      active
                        ? "border-[#2f7df6] bg-[#2f7df6] text-white"
                        : "border-[#d1d5db] text-[#6b7280] hover:border-[#9aa3af] hover:bg-[#f7f8fa]"
                    }`}
                  >
                    <LayoutIcon type={id} />
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-[#f0f2f5]" />

      {/* Sync toggles */}
      <div className="px-3 py-2.5">
        <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-[#9aa3af]">
          Sync
        </div>
        <div className="space-y-2">
          {SYNC_OPTIONS.map((option) => {
            const on = syncToggles[option] ?? false;
            return (
              <label key={option} className="flex cursor-pointer items-center justify-between">
                <span className="text-[12px] text-[#444]">{option}</span>
                <button
                  role="switch"
                  aria-checked={on}
                  onClick={() => toggleSync(option)}
                  className={`relative h-4 w-7 flex-none rounded-full transition-colors ${
                    on ? "bg-[#2f7df6]" : "bg-[#d1d5db]"
                  }`}
                >
                  <span
                    className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${
                      on ? "translate-x-3.5" : "translate-x-0.5"
                    }`}
                  />
                </button>
              </label>
            );
          })}
        </div>
      </div>
    </div>
  );
}
