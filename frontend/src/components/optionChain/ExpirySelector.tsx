import { parseChartDate } from "../../utils/dates";

const formatExpiryChip = (value: string) => {
  const parsed = parseChartDate(value);
  if (!parsed) return value;

  const dateLabel = parsed.toLocaleDateString("en-IN", { day: "numeric", month: "short" });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((parsed.getTime() - today.getTime()) / 86_400_000);

  let duration: string;
  if (diffDays <= 0) duration = "today";
  else if (diffDays === 1) duration = "1 day";
  else if (diffDays < 7) duration = `${diffDays} days`;
  else if (diffDays < 14) duration = "1 week";
  else if (diffDays < 21) duration = "2 weeks";
  else if (diffDays < 42) duration = "1 month";
  else duration = `${Math.round(diffDays / 30)} months`;

  return `${dateLabel} (${duration})`;
};

export function ExpirySelector({
  value,
  options,
  onChange,
  className = "",
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  className?: string;
}) {
  // Show first 5 expiries inline, rest are hidden (extendable later)
  const visible = options.slice(0, 5);

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {visible.map((option) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-full px-3 py-1 text-[12px] transition ${
              active
                ? "bg-[#e9f1ff] font-medium text-[#3578e5]"
                : "text-[#4b5563] hover:bg-[#f3f4f6] hover:text-[#1f2937]"
            }`}
          >
            {formatExpiryChip(option)}
          </button>
        );
      })}
    </div>
  );
}
