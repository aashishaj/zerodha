import type { ReactNode, MouseEvent } from "react";
import { BarChart3, Ellipsis, Layers3 } from "lucide-react";

interface WatchlistQuickActionsProps {
  loading?: boolean;
  onBuy: () => void;
  onSell: () => void;
  onDepth: () => void;
  onChart: () => void;
  onRemove: () => void;
  onMore: () => void;
}

const baseClass =
  "flex h-6 min-w-6 items-center justify-center rounded-[2px] border px-1.5 text-[10px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function ActionButton({
  title,
  disabled,
  className,
  onClick,
  children,
}: {
  title: string;
  disabled?: boolean;
  className: string;
  onClick: (event: MouseEvent<HTMLButtonElement>) => void;
  children: ReactNode;
}) {
  return (
    <div className="group/action relative">
      <button title={title} disabled={disabled} onMouseDown={(event) => event.stopPropagation()} onClick={onClick} className={className}>
        {children}
      </button>
      <div className="pointer-events-none absolute -top-8 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded-[3px] bg-slate-900 px-2 py-1 text-[11px] font-medium text-white group-hover/action:block">
        {title}
      </div>
    </div>
  );
}

export function WatchlistQuickActions({
  loading,
  onBuy,
  onSell,
  onDepth,
  onChart,
  onRemove,
  onMore,
}: WatchlistQuickActionsProps) {
  return (
    <div className="absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 bg-white pl-2 group-hover:flex group-focus-within:flex">
      <ActionButton
        title="Buy (B)"
        disabled={loading}
        onClick={(event) => {
          event.stopPropagation();
          onBuy();
        }}
        className={`${baseClass} border-[#4184f3] bg-[#4184f3] text-white hover:brightness-95`}
      >
        B
      </ActionButton>
      <ActionButton
        title="Sell (S)"
        disabled={loading}
        onClick={(event) => {
          event.stopPropagation();
          onSell();
        }}
        className={`${baseClass} border-[#ff5722] bg-[#ff5722] text-white hover:brightness-95`}
      >
        S
      </ActionButton>
      <ActionButton
        title="Market depth"
        disabled={loading}
        onClick={(event) => {
          event.stopPropagation();
          onDepth();
        }}
        className={`${baseClass} border-[#d8dee5] bg-white text-[#4b5563] hover:bg-[#f6f8fa]`}
      >
        <Layers3 className="h-3.5 w-3.5" />
      </ActionButton>
      <ActionButton
        title="Chart"
        disabled={loading}
        onClick={(event) => {
          event.stopPropagation();
          onChart();
        }}
        className={`${baseClass} border-[#d8dee5] bg-white text-[#4b5563] hover:bg-[#f6f8fa]`}
      >
        <BarChart3 className="h-3.5 w-3.5" />
      </ActionButton>
      <ActionButton
        title="More"
        disabled={loading}
        onClick={(event) => {
          event.stopPropagation();
          onMore();
        }}
        className={`${baseClass} border-[#d8dee5] bg-white text-[#4b5563] hover:bg-[#f6f8fa]`}
      >
        <Ellipsis className="h-3.5 w-3.5" />
      </ActionButton>
    </div>
  );
}
