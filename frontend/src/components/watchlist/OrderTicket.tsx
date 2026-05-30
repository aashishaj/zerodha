import { type ReactNode, useEffect, useMemo, useState } from "react";
import { ModalShell } from "../common/ModalShell";
import { ordersService } from "../../services/ordersService";
import type { Instrument, OrderSide, OrderTicketPayload, OrderType, ProductType, Quote } from "../../types";
import { useTradingStore } from "../../store/useTradingStore";

interface OrderTicketProps {
  open: boolean;
  instrument: Instrument | null;
  side: OrderSide;
  quote?: Quote;
  onClose: () => void;
}

export function OrderTicket({ open, instrument, side, quote, onClose }: OrderTicketProps) {
  const prefill = useTradingStore((state) => state.orderTicketPrefill);
  const defaultProduct = useMemo<ProductType>(() => {
    if (!instrument) return "MIS";
    return instrument.segment === "NFO-OPT" || instrument.segment === "NFO-FUT" ? "NRML" : "CNC";
  }, [instrument]);
  const defaultQuantity = useMemo(() => {
    if (!instrument) return 1;
    return instrument.segment === "NFO-OPT" || instrument.segment === "NFO-FUT" ? Math.max(1, instrument.lot_size) : 1;
  }, [instrument]);

  const [product, setProduct] = useState<ProductType>("MIS");
  const [orderType, setOrderType] = useState<OrderType>("MARKET");
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState("");
  const [triggerPrice, setTriggerPrice] = useState("");
  const [validity, setValidity] = useState<"DAY" | "IOC">("DAY");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !instrument) return;
    setProduct(defaultProduct);
    setOrderType(prefill?.orderType ?? "MARKET");
    setQuantity(defaultQuantity);
    setPrice(prefill?.price != null ? String(prefill.price) : quote?.last_price ? String(quote.last_price) : "");
    setTriggerPrice(prefill?.triggerPrice != null ? String(prefill.triggerPrice) : "");
    setValidity("DAY");
    setMessage(null);
  }, [defaultProduct, defaultQuantity, instrument, open, prefill, quote?.last_price]);

  const submitLabel = side === "BUY" ? "Buy" : "Sell";

  const onSubmit = async () => {
    if (!instrument) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const payload: OrderTicketPayload = {
        side,
        instrument_token: instrument.instrument_token,
        tradingsymbol: instrument.tradingsymbol,
        exchange: instrument.exchange,
        product,
        order_type: orderType,
        quantity,
        price: price ? Number(price) : undefined,
        trigger_price: triggerPrice ? Number(triggerPrice) : undefined,
        validity,
      };
      const response = await ordersService.placeOrder(payload);
      setMessage(response.message);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Order request failed.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalShell open={open} title={`${submitLabel} Order`} onClose={onClose}>
      {instrument ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-sm font-semibold text-slate-900">{instrument.tradingsymbol}</div>
            <div className="mt-1 text-xs text-slate-500">
              {instrument.exchange} · {instrument.segment} · Lot size {instrument.lot_size || 1}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Side">
              <input value={side} readOnly className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </Field>
            <Field label="Exchange">
              <input value={instrument.exchange} readOnly className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm" />
            </Field>
            <Field label="Product">
              <select value={product} onChange={(event) => setProduct(event.target.value as ProductType)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                {(instrument.segment === "NFO-OPT" || instrument.segment === "NFO-FUT" ? ["MIS", "NRML"] : ["MIS", "CNC"]).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Order type">
              <select value={orderType} onChange={(event) => setOrderType(event.target.value as OrderType)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                {["MARKET", "LIMIT", "SL", "SL-M"].map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </Field>
            <Field label="Quantity">
              <input type="number" min={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value) || 1)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
            </Field>
            <Field label="Validity">
              <select value={validity} onChange={(event) => setValidity(event.target.value as "DAY" | "IOC")} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm">
                <option value="DAY">DAY</option>
                <option value="IOC">IOC</option>
              </select>
            </Field>
            {(orderType === "LIMIT" || orderType === "SL") && (
              <Field label="Price">
                <input type="number" step="0.05" value={price} onChange={(event) => setPrice(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
              </Field>
            )}
            {(orderType === "SL" || orderType === "SL-M") && (
              <Field label="Trigger price">
                <input type="number" step="0.05" value={triggerPrice} onChange={(event) => setTriggerPrice(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
              </Field>
            )}
          </div>
          {message && <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">{message}</div>}
          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100">Cancel</button>
            <button
              onClick={() => void onSubmit()}
              disabled={submitting}
              className={`rounded-xl px-4 py-2 text-sm font-semibold text-white ${side === "BUY" ? "bg-blue-600 hover:bg-blue-700" : "bg-rose-600 hover:bg-rose-700"} disabled:opacity-50`}
            >
              {submitting ? "Submitting..." : submitLabel}
            </button>
          </div>
        </div>
      ) : null}
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <div className="mb-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">{label}</div>
      {children}
    </label>
  );
}
