import { useEffect, useRef } from "react";

interface MoreActionsMenuProps {
  open: boolean;
  onClose: () => void;
  onSetPrimary: () => void;
  onSetCompare: () => void;
  onRemove: () => void;
  sameAsPrimary?: boolean;
}

export function MoreActionsMenu({
  open,
  onClose,
  onSetPrimary,
  onSetCompare,
  onRemove,
  sameAsPrimary,
}: MoreActionsMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        onClose();
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  const menuItems = [
    { label: "Set as primary", action: onSetPrimary },
    { label: "Set as compare", action: onSetCompare },
    { label: "Add alert", action: onClose },
    { label: "View details", action: onClose },
    { label: "Remove from watchlist", action: onRemove },
  ];

  return (
    <div
      ref={ref}
      className="absolute right-3 top-[calc(100%-2px)] z-20 w-[170px] rounded-[2px] border border-[#d8dee5] bg-white p-1 shadow-[0_10px_20px_rgba(15,23,42,0.08)]"
    >
      {menuItems.map((item) => (
        <button
          key={item.label}
          onClick={item.action}
          className="w-full rounded-[2px] px-3 py-2 text-left text-[12px] text-slate-700 hover:bg-slate-100"
        >
          {item.label}
        </button>
      ))}
      {sameAsPrimary && <div className="px-3 py-1 text-[11px] font-medium text-[#00a86b]">Same as primary</div>}
    </div>
  );
}
