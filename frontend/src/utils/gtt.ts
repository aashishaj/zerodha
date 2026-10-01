/** Price maths for OCO GTT exits placed after an entry has executed. */
import type { GttLegPrices, SLSettings } from "../types";

export interface GttLegs {
  exitSide: "BUY" | "SELL";
  stop: GttLegPrices;
  target: GttLegPrices;
}

/**
 * Derive both legs of the OCO exit from the entry's price. The exit is always
 * the opposite side of the entry:
 *   BUY entry (option buying)   → SELL exit, stop below / target above
 *   SELL entry (option selling) → BUY exit,  stop above / target below
 * Offsets are magnitudes from settings; the side decides their sign.
 */
export function computeGttLegs(
  entrySide: "BUY" | "SELL",
  entryPrice: number,
  s: SLSettings,
  tickSize = 0.05,
): GttLegs {
  const tick = tickSize > 0 ? tickSize : 0.05;
  const round = (v: number) => Number((Math.round(v / tick) * tick).toFixed(2));
  if (entrySide === "BUY") {
    return {
      exitSide: "SELL",
      stop: { trigger: round(entryPrice - s.gttBuyStopTrigger), price: round(entryPrice - s.gttBuyStopPrice) },
      target: { trigger: round(entryPrice + s.gttBuyTargetTrigger), price: round(entryPrice + s.gttBuyTargetPrice) },
    };
  }
  return {
    exitSide: "BUY",
    stop: { trigger: round(entryPrice + s.gttSellStopTrigger), price: round(entryPrice + s.gttSellStopPrice) },
    target: { trigger: round(entryPrice - s.gttSellTargetTrigger), price: round(entryPrice - s.gttSellTargetPrice) },
  };
}
