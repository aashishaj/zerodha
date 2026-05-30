import type { Timeframe } from "../../types";

const options: Timeframe[] = ["5s", "10s", "15s", "30s", "1m", "2m", "3m", "4m", "5m", "10m", "15m", "30m", "1d", "1w"];

export function TimeframeSelector({
  value,
  onChange,
}: {
  value: Timeframe;
  onChange: (value: Timeframe) => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
      {options.map((option) => (
        <button
          key={option}
          onClick={() => onChange(option)}
          className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
            value === option ? "bg-blue-50 text-blue-700" : "text-slate-500"
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}
