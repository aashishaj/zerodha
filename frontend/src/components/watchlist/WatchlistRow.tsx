import { useState } from "react";
import type { WatchlistItem as WatchlistItemType } from "../../types";
import { formatChange, formatPercent, formatPrice, movementClass } from "../../utils/format";
import { WatchlistQuickActions } from "./WatchlistQuickActions";
import { MoreActionsMenu } from "./MoreActionsMenu";

interface WatchlistRowProps {
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

export function WatchlistRow({
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
}: WatchlistRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const movement = item.change ?? 0;
  const toneClass = movement === 0 ? "text-[#222]" : movementClass(item.change);

  return (
    <div
      onClick={onOpenPrimary}
      className={`group relative flex h-15 cursor-pointer items-center border-b border-[#e8edf3] bg-white px-4 text-left hover:bg-[#fafbfc] ${
        active ? "bg-[#fafafa]" : ""
      }`}
    >
      {active === "primary" && <div className="absolute inset-y-0 left-0 w-[2px] bg-[#ff5722]" />}
      {active === "compare" && <div className="absolute inset-y-0 left-0 w-[2px] bg-[#0f9d58]" />}

      <div className={`flex min-w-0 flex-1 items-center ${active ? "pl-2" : ""}`}>
        <div className="min-w-0">
          <div className={`truncate text-[13px] font-medium ${toneClass}`}>{item.displayName}</div>
          <div className="mt-0.5 flex items-center gap-1.5 text-[10px] uppercase tracking-[0.02em] text-[#9aa3af]">
            <span>{item.exchange}</span>
            <span>{item.segment.replace("NFO-", "")}</span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-4 group-hover:opacity-0 group-focus-within:opacity-0">
          <div className={`w-[56px] text-right text-[11px] ${toneClass}`}>{formatPercent(item.changePercent)}</div>
          <div className="w-[58px] text-right text-[11px]">
            <span className={toneClass}>{formatChange(item.change)}</span>
          </div>
          <div className={`w-[74px] text-right text-[13px] font-medium ${toneClass}`}>{formatPrice(item.ltp)}</div>
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
