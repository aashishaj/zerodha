import { X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Instrument, OrderSide, OrderTicketPayload, OrderType, ProductType, Quote } from "../../types";
import { useTradingStore } from "../../store/useTradingStore";
import { useAllowedSides } from "../../store/useAuthStore";
import { formatInstrumentLabel, formatPrice } from "../../utils/format";

interface OrderTicketProps {
  open: boolean;
  instrument: Instrument | null;
  side: OrderSide;
  quote?: Quote;
  onClose: () => void;
}

// Zerodha palette
const THEME = {
  BUY:  { headerBg: "#387ed1", btnBg: "#387ed1", label: "Buy"  },
  SELL: { headerBg: "#e5793b", btnBg: "#e5793b", label: "Sell" },
} as const;

function productLabel(p: ProductType) {
  if (p === "MIS")  return "Intraday (MIS)";
  if (p === "CNC")  return "Overnight (CNC)";
  return "Overnight (NRML)";
}

export function OrderTicket({ open, instrument, side, quote, onClose }: OrderTicketProps) {
  const prefill = useTradingStore((state) => state.orderTicketPrefill);

  const defaultProduct = useMemo<ProductType>(() => {
    if (!instrument) return "MIS";
    const seg = instrument.segment;
    return seg === "NFO-OPT" || seg === "NFO-FUT" || seg === "MCX-FUT" || seg === "CDS-FUT"
      ? "NRML" : "CNC";
  }, [instrument]);

  const slSettings = useTradingStore((s) => s.slSettings);
  const defaultQty = useMemo(() => {
    if (!instrument) return slSettings.defaultQty;
    const seg = instrument.segment;
    // For derivatives, use lot size if greater; for equities use profile default qty
    if (seg === "NFO-OPT" || seg === "NFO-FUT") {
      return Math.max(slSettings.defaultQty, instrument.lot_size);
    }
    return slSettings.defaultQty;
  }, [instrument, slSettings]);

  const products = useMemo<ProductType[]>(() => {
    if (!instrument) return ["MIS", "CNC"];
    const seg = instrument.segment;
    return seg === "NFO-OPT" || seg === "NFO-FUT" || seg === "MCX-FUT" || seg === "CDS-FUT"
      ? ["MIS", "NRML"] : ["MIS", "CNC"];
  }, [instrument]);

  const { canBuy, canSell } = useAllowedSides();
  // Sides are strictly role-gated: buyers only BUY, sellers only SELL,
  // traders and super admins both. No exceptions for order type.
  const allowedSide = (requested: OrderSide): OrderSide => {
    if (requested === "BUY") return canBuy ? "BUY" : "SELL";
    return canSell ? "SELL" : "BUY";
  };

  const [currentSide, setCurrentSide] = useState<OrderSide>(allowedSide(side));
  const [activeTab,   setActiveTab]   = useState<"Quick" | "Regular" | "Iceberg">("Regular");
  const [product,     setProduct]     = useState<ProductType>("MIS");
  const [orderType,   setOrderType]   = useState<OrderType>("LIMIT");
  const [validity,    setValidity]    = useState<"DAY" | "IOC">("DAY");
  const [quantity,    setQuantity]    = useState(1);
  const [price,       setPrice]       = useState("");
  const [triggerPrice,setTriggerPrice]= useState("");
  const [submitting,  setSubmitting]  = useState(false);
  const [message,     setMessage]     = useState<{ text: string; ok: boolean } | null>(null);

  // Price / trigger enabled state
  const priceEnabled   = orderType === "LIMIT" || orderType === "SL";
  const triggerEnabled = orderType === "SL"    || orderType === "SL-M";

  const canUseBuy  = canBuy;
  const canUseSell = canSell;

  const availableCash = useTradingStore((s) => s.availableCash);

  // Required margin = effective price × quantity (max amount). Use the entered
  // price for LIMIT/SL orders, otherwise the last traded price.
  const effectivePrice = priceEnabled && price ? Number(price) : quote?.last_price ?? 0;
  const requiredMargin = effectivePrice * quantity;
  const insufficient =
    currentSide === "BUY" && availableCash != null && requiredMargin > availableCash;

  // Stable refs for values that must NOT re-trigger the reset.
  // quote and prefill update frequently (quotes every 5 s); they should only be
  // read at the moment the ticket opens, never used as effect dependencies.
  const sideRef    = useRef(side);
  const prefillRef = useRef(prefill);
  const quoteRef   = useRef(quote);
  sideRef.current    = side;
  prefillRef.current = prefill;
  quoteRef.current   = quote;

  // Reset ONLY when the ticket opens or the instrument changes.
  // Deliberately excludes quote/prefill/side from deps so live price updates
  // (every 5 s) never overwrite values the user has already typed.
  useEffect(() => {
    if (!open || !instrument) return;
    const p = prefillRef.current;
    const q = quoteRef.current;
    const nextOrderType = p?.orderType ?? "LIMIT";
    setCurrentSide(allowedSide(sideRef.current));
    setActiveTab("Regular");
    setProduct(defaultProduct);
    setOrderType(nextOrderType);
    setQuantity(defaultQty);
    setPrice(p?.price != null ? String(p.price) : q?.last_price ? String(q.last_price) : "");
    setTriggerPrice(p?.triggerPrice != null ? String(p.triggerPrice) : "");
    setValidity("DAY");
    setMessage(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, instrument]); // quote/prefill/side intentionally omitted — see above

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  // If the current side is ever not permitted for this role, flip to the allowed one.
  useEffect(() => {
    if (currentSide === "BUY" && !canBuy) setCurrentSide(canSell ? "SELL" : "BUY");
    if (currentSide === "SELL" && !canSell) setCurrentSide(canBuy ? "BUY" : "SELL");
  }, [currentSide, canBuy, canSell]);

  const theme = THEME[currentSide];

  const placeOrder = useTradingStore((s) => s.placeOrder);

  const handleSubmit = async () => {
    if (!instrument) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await placeOrder({
        side: currentSide,
        exchange: instrument.exchange,
        tradingsymbol: instrument.tradingsymbol,
        product,
        order_type: orderType,
        validity,
        quantity,
        price:         priceEnabled   && price        ? Number(price)        : undefined,
        trigger_price: triggerEnabled && triggerPrice ? Number(triggerPrice) : undefined,
      });
      setMessage({ text: `Order submitted. Order ID: ${res.order_id}`, ok: true });
      // Close the ticket after successful submission
      setTimeout(() => {
        useTradingStore.getState().closeOrderTicket();
      }, 1000);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Order request failed.", ok: false });
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !instrument) return null;

  return (
    <div
      className="fixed z-50 bottom-0 left-1/2 -translate-x-1/2 overflow-hidden bg-white shadow-[0_-4px_24px_rgba(0,0,0,0.18)]"
      style={{ width: 680, borderTop: "1px solid #d0d3d8", borderLeft: "1px solid #d0d3d8", borderRight: "1px solid #d0d3d8" }}
    >
      {/* ── 1. Header ── clean, full-width, no B/S toggle inside */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ backgroundColor: theme.headerBg }}
      >
        <div>
          <div className="text-[15px] font-semibold leading-tight text-white">
            {formatInstrumentLabel(instrument)}
          </div>
          <div className="mt-0.5 text-[12px] leading-tight text-white/70">
            {instrument.exchange} &middot; {instrument.segment}
            {instrument.expiry ? ` · ${instrument.expiry}` : ""}
            {quote?.last_price ? ` · ₹${quote.last_price}` : ""}
          </div>
        </div>
        <button onClick={onClose} className="ml-4 shrink-0 text-white/70 hover:text-white">
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* ── 2. Buy / Sell selector — outside header, full-width ── */}
      <div className="flex" style={{ borderBottom: "1px solid #e0e0e0" }}>
        {canUseBuy && (
          <button
            onClick={() => setCurrentSide("BUY")}
            className="flex-1 py-2.5 text-[13px] font-bold tracking-wide transition-colors"
            style={
              currentSide === "BUY"
                ? { backgroundColor: "#387ed1", color: "#fff" }
                : { backgroundColor: "#fff", color: "#9aa3af" }
            }
          >
            BUY
          </button>
        )}
        {canUseBuy && canUseSell && <div style={{ width: 1, backgroundColor: "#e0e0e0" }} />}
        {canUseSell && (
          <button
            onClick={() => setCurrentSide("SELL")}
            className="flex-1 py-2.5 text-[13px] font-bold tracking-wide transition-colors"
            style={
              currentSide === "SELL"
                ? { backgroundColor: "#e5793b", color: "#fff" }
                : { backgroundColor: "#fff", color: "#9aa3af" }
            }
          >
            SELL
          </button>
        )}
      </div>

      {/* ── 3. Tabs ── */}
      <div
        className="flex px-5"
        style={{ borderBottom: "1px solid #e8edf3", backgroundColor: "#fff" }}
      >
        {(["Quick", "Regular", "Iceberg"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`mr-6 py-3 text-[13px] font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? "border-[#333] text-[#222]"
                : "border-transparent text-[#9aa3af] hover:text-[#6b7280]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ── 4. Body ── */}
      <div className="space-y-4 px-5 py-4" style={{ backgroundColor: "#fff" }}>

        {/* Product type */}
        <div className="flex gap-2">
          {products.map((p) => (
            <button
              key={p}
              onClick={() => setProduct(p)}
              className="rounded-[2px] px-4 py-1.5 text-[12px] font-medium transition-colors border"
              style={
                product === p
                  ? { borderColor: "#387ed1", color: "#387ed1", backgroundColor: "#eef4fc" }
                  : { borderColor: "#e0e0e0", color: "#6b7280", backgroundColor: "#fff" }
              }
            >
              {productLabel(p)}
            </button>
          ))}
        </div>

        {/* ── 3-column field row: Qty · Price · Trigger price ── */}
        <div className="grid grid-cols-3 gap-4">
          {/* Qty */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[#9aa3af]">
              Qty
            </label>
            <input
              type="number"
              min={1}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              className="h-9 w-full rounded-[2px] border border-[#d0d3d8] bg-white px-3 text-[13px] text-[#222] focus:border-[#387ed1] focus:outline-none"
            />
          </div>

          {/* Price */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[#9aa3af]">
              Price
            </label>
            <input
              type="number"
              step="0.05"
              value={priceEnabled ? price : ""}
              onChange={(e) => setPrice(e.target.value)}
              disabled={!priceEnabled}
              placeholder={priceEnabled ? "0.00" : "Market"}
              className="h-9 w-full rounded-[2px] border border-[#d0d3d8] bg-white px-3 text-[13px] text-[#222] placeholder-[#9aa3af] focus:border-[#387ed1] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#f5f5f5] disabled:text-[#9aa3af]"
            />
          </div>

          {/* Trigger price */}
          <div>
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wider text-[#9aa3af]">
              Trigger price
            </label>
            <input
              type="number"
              step="0.05"
              value={triggerEnabled ? triggerPrice : ""}
              onChange={(e) => setTriggerPrice(e.target.value)}
              disabled={!triggerEnabled}
              placeholder="0.00"
              className="h-9 w-full rounded-[2px] border border-[#d0d3d8] bg-white px-3 text-[13px] text-[#222] focus:border-[#387ed1] focus:outline-none disabled:cursor-not-allowed disabled:bg-[#f5f5f5] disabled:text-[#9aa3af]"
            />
          </div>
        </div>

        {/* Order type + Validity */}
        <div className="flex items-center justify-between">
          {/* Order type pills */}
          <div className="flex gap-1">
            {(["MARKET", "LIMIT", "SL", "SL-M"] as OrderType[]).map((ot) => (
              <button
                key={ot}
                onClick={() => setOrderType(ot)}
                className="rounded-[2px] px-3 py-1.5 text-[12px] font-medium transition-colors border"
                style={
                  orderType === ot
                    ? { borderColor: "#9aa3af", backgroundColor: "#f0f3f5", color: "#222" }
                    : { borderColor: "transparent", color: "#6b7280" }
                }
              >
                {ot}
              </button>
            ))}
          </div>

          {/* Validity pills */}
          <div className="flex gap-1">
            {(["DAY", "IOC"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setValidity(v)}
                className="rounded-[2px] px-3 py-1.5 text-[12px] font-medium transition-colors border"
                style={
                  validity === v
                    ? { borderColor: "#9aa3af", backgroundColor: "#f0f3f5", color: "#222" }
                    : { borderColor: "transparent", color: "#9aa3af" }
                }
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        {/* Status message */}
        {message && (
          <div
            className={`rounded-[2px] px-3 py-2 text-[12px] border ${
              message.ok
                ? "bg-green-50 text-green-700 border-green-200"
                : "bg-red-50 text-red-600 border-red-200"
            }`}
          >
            {message.text}
          </div>
        )}
      </div>

      {/* ── 5. Footer ── */}
      <div
        className="flex items-center justify-between px-5 py-3"
        style={{ borderTop: "1px solid #e8edf3", backgroundColor: "#f7f8fa" }}
      >
        {/* Margin info */}
        <div className="space-y-0.5">
          <div className="text-[11px] text-[#9aa3af]">
            Required margin&nbsp;
            <span className={`font-medium ${insufficient ? "text-red-600" : "text-[#444]"}`}>
              ₹{formatPrice(requiredMargin)}
            </span>
          </div>
          <div className="text-[11px] text-[#9aa3af]">
            Available cash&nbsp;
            <span className="font-medium text-[#444]">
              {availableCash == null ? "—" : `₹${formatPrice(availableCash)}`}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={onClose}
            className="rounded-[2px] px-4 py-2 text-[13px] font-medium text-[#6b7280] transition-colors hover:bg-[#e8edf3]"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={submitting}
            className="rounded-[2px] px-7 py-2 text-[13px] font-semibold text-white transition-opacity disabled:opacity-60"
            style={{ backgroundColor: theme.btnBg }}
          >
            {submitting ? "Placing…" : theme.label}
          </button>
        </div>
      </div>
    </div>
  );
}
