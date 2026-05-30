import { parseChartDate } from "../../utils/dates";

const formatExpiryChip = (value: string, index: number) => {
  const parsed = parseChartDate(value);
  if (!parsed) return value;
  const dateLabel = parsed.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
  });
  const monthCount = index + 1;
  return `${dateLabel} (${monthCount} month${monthCount > 1 ? "s" : ""})`;
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
  return (
    <div className={`flex flex-wrap items-center gap-5 ${className}`}>
      {options.map((option, index) => {
        const active = option === value;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={`rounded-full px-4 py-2 text-[13px] transition ${
              active ? "bg-[#e9f1ff] font-medium text-[#3578e5]" : "text-[#4b5563] hover:text-[#1f2937]"
            }`}
          >
            {formatExpiryChip(option, index)}
          </button>
        );
      })}
    </div>
  );
}
