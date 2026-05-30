import { useState } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";
import type { WatchlistItem as WatchlistItemType } from "../../types";
import { formatChange, formatPercent, formatPrice, movementClass } from "../../utils/format";
import { WatchlistQuickActions } from "./WatchlistQuickActions";
import { MoreActionsMenu } from "./MoreActionsMenu";

interface WatchlistItemProps {
  item: WatchlistItemType;
  active?: "primary" | "compare" | false;
  onOpenPrimary: () => void;
  onOpenCompare: () => void;
  onBuy: () => void;
  onSell: () => void;
  onDepth: () => void;
  onRemove: () => void;
  loading?: boolean;
  sameAsPrimary?: boolean;
}

export function WatchlistItem({
  item,
  active,
  onOpenPrimary,
  onOpenCompare,
  onBuy,
  onSell,
  onDepth,
  onRemove,
  loading,
  sameAsPrimary,
}: WatchlistItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const movement = item.change ?? 0;
  const isPrimary = active === "primary";
  const isCompare = active === "compare";
  const toneClass = movement === 0 ? "text-slate-800" : movementClass(item.change);
  const movementIndicator = movement > 0 ? <ArrowUp className="h-3.5 w-3.5" /> : movement < 0 ? <ArrowDown className="h-3.5 w-3.5" /> : null;

  return (
    <div
      onClick={onOpenPrimary}
      className={`group relative flex h-14 cursor-pointer items-center border-b border-[#edf0f2] bg-white pr-3 text-left transition hover:bg-[#fafafa] ${
        isPrimary ? "bg-[#f8fbff]" : isCompare ? "bg-[#f8fffb]" : ""
      }`}
    >
      {isPrimary && <div className="absolute inset-y-0 left-0 w-[3px] bg-[#4184f3]" />}
      {isCompare && <div className={`absolute inset-y-0 ${isPrimary ? "left-[3px]" : "left-0"} w-[3px] bg-[#00a86b]`} />}

      <div className={`flex min-w-0 flex-1 items-center ${isPrimary || isCompare ? "pl-[13px]" : "pl-4"}`}>
        <div className="flex min-w-0 items-center">
          <span className={`max-w-[145px] truncate whitespace-nowrap text-[14px] font-medium ${toneClass}`}>{item.displayName}</span>
          {item.exchange && (
            <span className="ml-1.5 shrink-0 rounded-[2px] bg-slate-100/70 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-[0.04em] text-[#8b95a1]">
              {item.exchange}
            </span>
          )}
        </div>

        <div className="ml-auto transition group-hover:opacity-0 group-focus-within:opacity-0">
          <div className="grid grid-cols-[64px_64px_18px_74px] items-center gap-2 text-right text-[13px]">
            <span className={toneClass}>{formatChange(item.change)}</span>
            <span className={toneClass}>{formatPercent(item.changePercent)}</span>
            <span className={`flex justify-center ${toneClass}`}>{movementIndicator}</span>
            <span className={`text-[14px] font-medium ${toneClass}`}>{formatPrice(item.ltp)}</span>
          </div>
        </div>
      </div>

      <WatchlistQuickActions
        loading={loading}
        onBuy={onBuy}
        onSell={onSell}
        onDepth={onDepth}
        onChart={onOpenPrimary}
        onRemove={onRemove}
        onMore={() => setMenuOpen((value) => !value)}
      />

      <MoreActionsMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        onSetPrimary={() => {
          onOpenPrimary();
          setMenuOpen(false);
        }}
        onSetCompare={() => {
          onOpenCompare();
          setMenuOpen(false);
        }}
        onRemove={() => {
          onRemove();
          setMenuOpen(false);
        }}
        sameAsPrimary={sameAsPrimary}
      />
    </div>
  );
}
