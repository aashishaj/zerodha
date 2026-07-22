import { useEffect, useState } from "react";
import { Notebook, History, AlertCircle } from "lucide-react";
import { formatPrice } from "../../utils/format";
import { useTradingStore } from "../../store/useTradingStore";

type OrdersSubTab = "orders" | "gtt";

const subTabs: Array<{ value: OrdersSubTab; label: string }> = [
  { value: "orders", label: "Orders" },
  { value: "gtt", label: "GTT" },
];

const STATUS_COLOR: Record<string, string> = {
  COMPLETE: "#16a34a",
  OPEN: "#4184f3",
  REJECTED: "#dc2626",
  CANCELLED: "#9aa3af",
  PENDING: "#f59e0b",
};

export function OrdersTab() {
  const [activeSubTab, setActiveSubTab] = useState<OrdersSubTab>("orders");
  const { orders, fetchOrders, ordersError } = useTradingStore();

  useEffect(() => {
    void fetchOrders();
  }, [fetchOrders]);

  return (
    <div className="flex h-full w-full flex-col bg-white">
      {/* Secondary tab bar — active tab gets the orange underline. */}
      <div className="flex h-10 items-end gap-6 border-b border-[#e8edf3] bg-white px-6">
        {subTabs.map((tab) => (
          <button
            key={tab.value}
            onClick={() => setActiveSubTab(tab.value)}
            className={`relative h-full border-0 bg-transparent pb-2 text-[13px] ${
              activeSubTab === tab.value ? "font-medium text-[#222]" : "text-[#6b7280]"
            }`}
          >
            {tab.label}
            {activeSubTab === tab.value && (
              <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#ff5722]" />
            )}
          </button>
        ))}
      </div>

      {activeSubTab === "orders" && ordersError ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <AlertCircle className="h-14 w-14 text-[#e5793b]" strokeWidth={1.25} />
          <p className="mt-5 max-w-md text-[15px] leading-6 text-[#444]">
            Couldn't load your orders. Your Zerodha session may have expired — reconnect the account and try again.
          </p>
        </div>
      ) : activeSubTab === "orders" && orders.length > 0 ? (
        <div className="flex-1 overflow-auto px-6 py-5">
          <div className="mb-3 text-[13px] text-[#6b7280]">
            Orders ({orders.length})
          </div>
          <table className="w-full border-collapse">
            <thead>
              <tr className="border-b border-[#e8edf3] text-[11px] font-semibold uppercase tracking-wider text-[#9aa3af]">
                <th className="px-3 py-2.5 text-left">Time</th>
                <th className="px-3 py-2.5 text-left">Type</th>
                <th className="px-3 py-2.5 text-left">Instrument</th>
                <th className="px-3 py-2.5 text-left">Product</th>
                <th className="px-3 py-2.5 text-right">Qty.</th>
                <th className="px-3 py-2.5 text-right">Avg. price</th>
                <th className="px-3 py-2.5 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order, i) => {
                const qty = `${order.filled_quantity ?? 0} / ${order.quantity}`;
                const time = order.placed_at ?? order.timestamp ?? "";
                const timeShort = time.includes("T") ? time.split("T")[1]?.slice(0, 8) : time.slice(0, 8);
                return (
                  <tr key={order.order_id ?? i} className="border-b border-[#f0f2f5] hover:bg-[#f7f8fa]">
                    <td className="px-3 py-2.5 text-[12px] text-[#9aa3af]">{timeShort}</td>
                    <td className="px-3 py-2.5 text-[12px]">
                      <span
                        className="rounded px-1.5 py-0.5 text-[11px] font-semibold text-white"
                        style={{ backgroundColor: order.transaction_type === "BUY" ? "#387ed1" : "#e5793b" }}
                      >
                        {order.transaction_type}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-medium text-[#222]">{order.tradingsymbol}</td>
                    <td className="px-3 py-2.5 text-[12px] text-[#9aa3af]">{order.product}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">{qty}</td>
                    <td className="px-3 py-2.5 text-right text-[12px] text-[#222]">{formatPrice(order.average_price ?? order.price)}</td>
                    <td
                      className="px-3 py-2.5 text-right text-[12px] font-medium"
                      style={{ color: STATUS_COLOR[order.status] ?? "#444" }}
                      title={order.status_message ?? undefined}
                    >
                      {order.status}
                      {order.status_message && (
                        <div className="mt-0.5 max-w-[280px] truncate text-[11px] font-normal text-[#9aa3af]">
                          {order.status_message}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <Notebook className="h-16 w-16 text-[#d4dae3]" strokeWidth={1.25} />
          <p className="mt-6 text-[15px] text-[#444]">
            {activeSubTab === "orders"
              ? "You haven't placed any orders today"
              : "You haven't created any GTT orders"}
          </p>
          <button className="mt-6 rounded-sm bg-[#4184f3] px-5 py-2.5 text-[13px] font-medium text-white transition hover:bg-[#3574e0]">
            Get started
          </button>
          {activeSubTab === "orders" && (
            <button className="mt-5 inline-flex items-center gap-1.5 border-0 bg-transparent text-[13px] text-[#4184f3]">
              <span className="flex h-4 w-4 items-center justify-center rounded-full border border-[#4184f3]">
                <History className="h-2.5 w-2.5" strokeWidth={2} />
              </span>
              View history
            </button>
          )}
        </div>
      )}
    </div>
  );
}
