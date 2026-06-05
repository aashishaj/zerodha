import { useTradingStore } from "../../store/useTradingStore";
import { useEffect } from "react";
import { formatPrice } from "../../utils/format";

export function OrdersPanel() {
  const orders = useTradingStore((s) => s.orders);
  const fetchOrders = useTradingStore((s) => s.fetchOrders);

  useEffect(() => {
    void fetchOrders();
    const interval = setInterval(() => void fetchOrders(), 5000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  if (orders.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center bg-white">
        <div className="text-center">
          <div className="mb-4 text-6xl text-[#e8edf3]">📋</div>
          <div className="text-[14px] font-medium text-[#444]">
            You haven't placed any orders today
          </div>
          <div className="mt-2 text-[12px] text-[#9aa3af]">
            Click on a candle to open the order ticket
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-auto bg-white p-4">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[#e8edf3] text-[11px] font-semibold text-[#9aa3af] uppercase tracking-wider">
            <th className="px-3 py-2.5 text-left">Symbol</th>
            <th className="px-3 py-2.5 text-left">Side</th>
            <th className="px-3 py-2.5 text-right">Qty</th>
            <th className="px-3 py-2.5 text-right">Price</th>
            <th className="px-3 py-2.5 text-right">Trigger</th>
            <th className="px-3 py-2.5 text-left">Type</th>
            <th className="px-3 py-2.5 text-left">Status</th>
            <th className="px-3 py-2.5 text-left">Time</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => {
            const isBuy = order.transaction_type === "BUY";
            const statusColor =
              order.status === "FILLED"
                ? "#16a34a"
                : order.status === "PENDING"
                  ? "#f59e0b"
                  : order.status === "REJECTED"
                    ? "#dc2626"
                    : "#9aa3af";
            return (
              <tr
                key={order.order_id}
                className="border-b border-[#f0f2f5] hover:bg-[#f7f8fa]"
              >
                <td className="px-3 py-2.5 text-[12px] font-medium text-[#222]">
                  {order.tradingsymbol}
                </td>
                <td className="px-3 py-2.5 text-[12px]">
                  <span
                    className="rounded px-1.5 py-0.5 font-semibold text-white"
                    style={{
                      backgroundColor: isBuy ? "#387ed1" : "#e5793b",
                    }}
                  >
                    {isBuy ? "BUY" : "SELL"}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">
                  {order.quantity}
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">
                  {order.price ? formatPrice(order.price) : "—"}
                </td>
                <td className="px-3 py-2.5 text-right text-[12px] text-[#9aa3af]">
                  {order.trigger_price ? formatPrice(order.trigger_price) : "—"}
                </td>
                <td className="px-3 py-2.5 text-[12px] text-[#9aa3af]">
                  {order.order_type}
                </td>
                <td className="px-3 py-2.5 text-[12px] font-medium" style={{ color: statusColor }}>
                  {order.status}
                </td>
                <td className="px-3 py-2.5 text-[12px] text-[#9aa3af]">
                  {order.placed_at ? new Date(order.placed_at).toLocaleTimeString() : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
