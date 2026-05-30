import {
  Camera,
  CandlestickChart,
  ChevronDown,
  Grid2X2,
  Maximize2,
  MinusSquare,
  Plus,
  Redo2,
  Save,
  Search,
  Settings2,
  SplitSquareVertical,
  SquareCheck,
  Trash2,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Timeframe } from "../../types";
import { useTradingStore } from "../../store/useTradingStore";

const timeframeOptions: Timeframe[] = ["5s", "10s", "15s", "30s", "1m", "2m", "3m", "4m", "5m", "10m", "15m", "30m", "1d", "1w"];

interface ChartToolbarProps {
  timeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
}

function ToolButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label?: string;
  onClick?: () => void;
}) {
  return (
    <button
      title={label}
      onClick={onClick}
      className="flex h-7 min-w-7 items-center justify-center rounded-[2px] border border-transparent px-1.5 text-[#6b7280] transition hover:bg-[#f7f8fa]"
    >
      {children}
    </button>
  );
}

export function ChartToolbar({ timeframe, onTimeframeChange }: ChartToolbarProps) {
  const selectedInstrument = useTradingStore((state) => state.selectedInstrument);
  const setSearchTarget = useTradingStore((state) => state.setSearchTarget);
  const [timeframeMenuOpen, setTimeframeMenuOpen] = useState(false);
  const timeframeMenuRef = useRef<HTMLDivElement>(null);

  const focusCompareSearch = () => {
    setSearchTarget("compare");
    window.dispatchEvent(new Event("instrument-search-focus"));
  };

  useEffect(() => {
    if (!timeframeMenuOpen) return;

    const onPointer = (event: MouseEvent) => {
      if (!timeframeMenuRef.current?.contains(event.target as Node)) {
        setTimeframeMenuOpen(false);
      }
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setTimeframeMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onPointer);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onPointer);
      window.removeEventListener("keydown", onKey);
    };
  }, [timeframeMenuOpen]);

  return (
    <div className="flex h-11 items-center justify-between border-b border-[#e8edf3] bg-white px-6">
      <div className="flex min-w-0 items-center gap-1">
        <div className="mr-1 flex h-7 items-center gap-1 rounded-[2px] border border-[#e5e7eb] px-2 text-[13px] text-[#444]">
          <Search className="h-3.5 w-3.5 text-[#9aa3af]" />
          <span className="max-w-[140px] truncate font-medium">{selectedInstrument?.tradingsymbol ?? "Select symbol"}</span>
          <button
            title="Compare symbol"
            onClick={focusCompareSearch}
            className="ml-1 flex h-5 w-5 items-center justify-center rounded-sm text-[#6b7280] hover:bg-[#f7f8fa]"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>

        <div ref={timeframeMenuRef} className="relative">
          <button
            onClick={() => setTimeframeMenuOpen((value) => !value)}
            className="flex h-7 items-center gap-1 rounded-sm border border-transparent px-2 text-[12px] text-[#444] hover:bg-[#f7f8fa]"
          >
            <span>{timeframe}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[#9aa3af]" />
          </button>
          {timeframeMenuOpen && (
            <div className="absolute left-0 top-[calc(100%+6px)] z-30 grid max-h-[280px] w-[180px] grid-cols-2 gap-1 overflow-auto rounded-[2px] border border-[#e5e7eb] bg-white p-2">
              {timeframeOptions.map((option) => (
                <button
                  key={option}
                  onClick={() => {
                    setTimeframeMenuOpen(false);
                    onTimeframeChange(option);
                  }}
                  className={`rounded-sm px-2 py-1.5 text-left text-[12px] ${
                    option === timeframe ? "bg-[#fff1eb] font-medium text-[#ff5722]" : "text-[#4b5563] hover:bg-[#f7f8fa]"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          )}
        </div>

        <ToolButton label="Candles">
          <CandlestickChart className="h-4 w-4" />
        </ToolButton>
        <button className="flex h-7 items-center rounded-sm border border-transparent px-2 text-[12px] text-[#6b7280] hover:bg-[#f7f8fa]">
          Indicators
        </button>
        <ToolButton label="Layout">
          <Grid2X2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Checklist">
          <SquareCheck className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Delete">
          <Trash2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Undo">
          <Undo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Redo">
          <Redo2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Split view">
          <SplitSquareVertical className="h-4 w-4" />
        </ToolButton>
        <button className="flex h-7 items-center gap-1 rounded-sm border border-transparent px-2 text-[12px] text-[#6b7280] hover:bg-[#f7f8fa]">
          <Save className="h-4 w-4" />
          <span>Save</span>
          <ChevronDown className="h-3.5 w-3.5 text-[#9aa3af]" />
        </button>
      </div>

      <div className="flex items-center gap-0.5">
        <ToolButton label="Collapse">
          <MinusSquare className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Settings">
          <Settings2 className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Camera">
          <Camera className="h-4 w-4" />
        </ToolButton>
        <ToolButton label="Fullscreen">
          <Maximize2 className="h-4 w-4" />
        </ToolButton>
      </div>
    </div>
  );
}
