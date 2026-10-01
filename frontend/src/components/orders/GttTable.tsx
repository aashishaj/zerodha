import { useState } from "react";
import { formatPrice } from "../../utils/format";
import { useTradingStore } from "../../store/useTradingStore";

const GTT_STATUS_COLOR: Record<string, string> = {
  active: "#4184f3",
  triggered: "#16a34a",
  cancelled: "#9aa3af",
  deleted: "#9aa3af",
  disabled: "#9aa3af",
  expired: "#9aa3af",
  rejected: "#dc2626",
};

/** The account's GTTs, with delete for the ones still active. */
export function GttTable() {
  const { gtts, deleteGtt } = useTradingStore();
  // Deleting is irreversible, so the button asks once before firing.
  const [confirmingId, setConfirmingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDelete = async (id: number) => {
    setDeletingId(id);
    setError(null);
    try {
      await deleteGtt(id);
      setConfirmingId(null);
    } catch (err) {
      const serverError = (err as { response?: { data?: { error?: string } } })?.response?.data?.error;
      setError(serverError ?? (err instanceof Error ? err.message : "Could not delete the GTT."));
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="flex-1 overflow-auto px-6 py-5">
      <div className="mb-3 text-[13px] text-[#6b7280]">GTT ({gtts.length})</div>
      {error && (
        <div className="mb-3 rounded-[2px] border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-600">
          {error}
        </div>
      )}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[#e8edf3] text-[11px] font-semibold uppercase tracking-wider text-[#9aa3af]">
            <th className="px-3 py-2.5 text-left">Created</th>
            <th className="px-3 py-2.5 text-left">Instrument</th>
            <th className="px-3 py-2.5 text-left">Type</th>
            <th className="px-3 py-2.5 text-left">Side</th>
            <th className="px-3 py-2.5 text-right">Qty.</th>
            <th className="px-3 py-2.5 text-right">Triggers → Limits</th>
            <th className="px-3 py-2.5 text-right">Status</th>
            <th className="px-3 py-2.5 text-right" />
          </tr>
        </thead>
        <tbody>
          {gtts.map((gtt) => {
            const side = gtt.orders[0]?.transaction_type;
            const legs = gtt.condition.trigger_values
              .map((t, i) => `${formatPrice(t)} → ${formatPrice(gtt.orders[i]?.price ?? 0)}`)
              .join("  ·  ");
            const status = (gtt.status ?? "").toLowerCase();
            return (
              <tr key={gtt.id} className="border-b border-[#f0f2f5] hover:bg-[#f7f8fa]">
                <td className="px-3 py-2.5 text-[12px] text-[#9aa3af]">{gtt.created_at ?? ""}</td>
                <td className="px-3 py-2.5 text-[12px] font-medium text-[#222]">{gtt.condition.tradingsymbol}</td>
                <td className="px-3 py-2.5 text-[12px] text-[#9aa3af]">{gtt.type === "two-leg" ? "OCO" : "Single"}</td>
                <td className="px-3 py-2.5 text-[12px]">
                  {side && (
                    <span
                      className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
                      style={{ backgroundColor: side === "BUY" ? "#387ed1" : "#e5793b" }}
                    >
                      {side}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">{gtt.orders[0]?.quantity ?? ""}</td>
                <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">{legs}</td>
                <td
                  className="px-3 py-2.5 text-right text-[12px] font-medium uppercase"
                  style={{ color: GTT_STATUS_COLOR[status] ?? "#444" }}
                >
                  {gtt.status}
                </td>
                <td className="px-3 py-2.5 text-right">
                  {status === "active" && (
                    confirmingId === gtt.id ? (
                      <span className="inline-flex items-center gap-2">
                        <button
                          onClick={() => void handleDelete(gtt.id)}
                          disabled={deletingId === gtt.id}
                          className="rounded-[2px] bg-[#dc2626] px-2.5 py-1 text-[11px] font-semibold text-white transition disabled:opacity-60"
                        >
                          {deletingId === gtt.id ? "Deleting…" : "Confirm"}
                        </button>
                        <button
                          onClick={() => setConfirmingId(null)}
                          className="text-[11px] text-[#6b7280] hover:text-[#222]"
                        >
                          Keep
                        </button>
                      </span>
                    ) : (
                      <button
                        onClick={() => { setConfirmingId(gtt.id); setError(null); }}
                        className="rounded-[2px] border border-[#d0d3d8] px-2.5 py-1 text-[11px] font-medium text-[#444] transition hover:border-[#dc2626] hover:text-[#dc2626]"
                      >
                        Delete
                      </button>
                    )
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
