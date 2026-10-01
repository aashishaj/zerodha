export type Timeframe =
  | "5s"
  | "10s"
  | "15s"
  | "30s"
  | "1m"
  | "2m"
  | "3m"
  | "4m"
  | "5m"
  | "10m"
  | "15m"
  | "30m"
  | "1h"
  | "1d"
  | "1w";
export type MainTab = "chart" | "option-chain" | "fundamentals" | "orders" | "holdings" | "positions";
export type LayoutId = "single" | "twoVertical" | "twoHorizontal";

export interface IndicatorSettings {
  vwap: boolean;
  smma: { enabled: boolean; period: number };
}

export type IndicatorSource = "open" | "high" | "low" | "close" | "hl2" | "hlc3" | "ohlc4";
export type IndicatorLineStyle = "solid" | "dashed" | "dotted";
export type VwapAnchorPeriod = "Session" | "Week" | "Month" | "Quarter" | "Year";

export interface IndicatorInstance {
  id: string;
  type: "VWAP" | "SMMA";
  enabled: boolean;
  color: string;
  lineWidth: number;
  // Style
  lineStyle?: IndicatorLineStyle;
  showPriceLine?: boolean;
  showLastValue?: boolean;
  // Inputs
  length?: number;
  source?: IndicatorSource;
  anchorPeriod?: VwapAnchorPeriod;
  // Visibility (UI/config only — eye toggle remains the live control)
  showOnAllIntervals?: boolean;
  intervals?: string[];
}

export interface SLSettings {
  /** Exchange lot size — the unit every order quantity moves in */
  lotSize: number;
  /** Quantity the order ticket opens at; a whole multiple of lotSize */
  defaultQty: number;
  /** Points added above High for BUY SL trigger price */
  buyTriggerOffset: number;
  /** Points added above High for BUY SL limit price */
  buyPriceOffset: number;
  /** Points subtracted below Low for SELL SL trigger price */
  sellTriggerOffset: number;
  /** Points subtracted below Low for SELL SL limit price */
  sellPriceOffset: number;
  /** Points beyond the entry order's price for the stop-loss trigger */
  stopLossTriggerOffset: number;
  /** Points beyond the entry order's price for the stop-loss limit */
  stopLossPriceOffset: number;
  /** OCO GTT after a BUY entry (option buying): points below entry for the stop trigger */
  gttBuyStopTrigger: number;
  /** …and the stop limit, at or below the trigger */
  gttBuyStopPrice: number;
  /** Points above entry for the target trigger */
  gttBuyTargetTrigger: number;
  /** …and the target limit, at or below the trigger so a touch fills */
  gttBuyTargetPrice: number;
  /** OCO GTT after a SELL entry (option selling): points above entry for the stop trigger */
  gttSellStopTrigger: number;
  /** …and the stop limit, at or above the trigger */
  gttSellStopPrice: number;
  /** Points below entry for the target trigger */
  gttSellTargetTrigger: number;
  /** …and the target limit, at or above the trigger so a touch fills */
  gttSellTargetPrice: number;
}

export interface Instrument {
  instrument_token: number;
  exchange_token: number;
  tradingsymbol: string;
  name: string;
  last_price: number;
  expiry: string | null;
  strike: number | null;
  tick_size: number;
  lot_size: number;
  instrument_type: string;
  segment: string;
  exchange: string;
}

export interface WatchlistItem {
  instrument_token: number;
  tradingsymbol: string;
  displayName: string;
  exchange: string;
  segment: string;
  ltp: number;
  change: number;
  changePercent: number;
}

export interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface Quote {
  instrument_token: number;
  tradingsymbol: string;
  last_price: number;
  change: number;
  changePercent: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  volume?: number;
  oi?: number;
}

export interface DepthLevel {
  price: number;
  quantity: number;
  orders: number;
}

export interface MarketDepth {
  instrument_token: number;
  tradingsymbol: string;
  last_price: number;
  bids: DepthLevel[];
  asks: DepthLevel[];
}

export type OrderSide = "BUY" | "SELL";
export type ProductType = "MIS" | "NRML" | "CNC";
export type OrderType = "MARKET" | "LIMIT" | "SL" | "SL-M";
export type OrderValidity = "DAY" | "IOC";

export interface OrderTicketPrefill {
  /** Why the ticket was opened. Every order this app places is order-type SL,
      entries included, so the order type cannot distinguish the two. */
  intent?: "entry" | "stop-loss";
  orderType?: OrderType;
  price?: number;
  triggerPrice?: number;
  /** Pre-set the order quantity. Used by the stop-loss ticket so the stop
      matches the quantity of the order it protects, not the default lot. */
  quantity?: number;
}

export interface OrderTicketPayload {
  side: OrderSide;
  instrument_token: number;
  tradingsymbol: string;
  exchange: string;
  product: ProductType;
  order_type: OrderType;
  quantity: number;
  price?: number;
  trigger_price?: number;
  validity: OrderValidity;
}

/**
 * Kite's own order statuses. COMPLETE, CANCELLED and REJECTED are terminal;
 * OPEN, TRIGGER PENDING and the transient *PENDING states are still live.
 * Left open rather than a closed union because Kite has more of them than is
 * worth enumerating and these values arrive unvalidated from the API.
 */
export type OrderStatus =
  | "OPEN"
  | "COMPLETE"
  | "CANCELLED"
  | "REJECTED"
  | "TRIGGER PENDING"
  | (string & {});

export interface Order {
  order_id: string | number;
  tradingsymbol: string;
  exchange: string;
  transaction_type: "BUY" | "SELL";
  quantity: number;
  price: number;
  trigger_price?: number;
  order_type: OrderType;
  product: ProductType;
  validity: OrderValidity;
  /** Kite order variety (regular / co / amo / iceberg). Required to cancel. */
  variety?: string;
  status: OrderStatus;
  /** Zerodha's explanation for REJECTED/CANCELLED orders. */
  status_message?: string | null;
  filled_quantity?: number;
  pending_quantity?: number;
  average_price?: number;
  placed_at?: string;
  timestamp?: string;
}

export interface Holding {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  close_price: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
}

export interface Position {
  tradingsymbol: string;
  exchange: string;
  product: string;
  quantity: number;
  average_price: number;
  last_price: number;
  close_price: number;
  pnl: number;
  unrealised?: number;
  realised?: number;
}

export interface OptionChainRow {
  strike: number;
  ceInstrument: Instrument | null;
  peInstrument: Instrument | null;
  ceLtp?: number;
  peLtp?: number;
  ceOi?: number;
  peOi?: number;
  ceVolume?: number;
  peVolume?: number;
  ceChange?: number;
  peChange?: number;
}

export interface SearchResultGroup {
  title: string;
  items: Instrument[];
}

export interface SearchQueryMeta {
  underlying?: string;
  strike?: number;
  optionType?: "CE" | "PE";
}

export interface Funds {
  availableCash: number;
}

export type AppRole = "super_admin" | "trader" | "seller" | "buyer";

export interface AppUser {
  id: number;
  username: string;
  role: AppRole;
  active?: boolean;
}

export interface AccountSummary {
  id: number;
  label: string;
  zerodha_user_id: string;
  connected: boolean;
  /** Whether the account has its own Kite app credentials stored. */
  has_credentials?: boolean;
  /** Stored Kite API key — only present for super admins. */
  api_key?: string | null;
}

export interface ActiveAccount {
  id: number;
  label: string;
}

/** One trigger/limit pair of an OCO GTT leg. */
export interface GttLegPrices {
  trigger: number;
  price: number;
}

/** Request to place (or dry-run) an OCO GTT exit. */
export interface GttPlacePayload {
  instrument_token: number;
  exit_side: "BUY" | "SELL";
  quantity: number;
  product: string;
  stop: GttLegPrices;
  target: GttLegPrices;
  dry_run?: boolean;
}

/** The server's plan for an OCO GTT: quantities split at the freeze limit. */
export interface GttPlan {
  ok: boolean;
  tradingsymbol: string;
  exchange: string;
  exit_side: "BUY" | "SELL";
  last_price: number;
  trigger_values: number[];
  freeze_limit: number | null;
  quantities: number[];
  trigger_ids?: Array<number | string>;
  message?: string;
}

/** A GTT as Kite lists it. */
export interface Gtt {
  id: number;
  type: string;
  status: string;
  created_at?: string;
  condition: {
    exchange: string;
    tradingsymbol: string;
    trigger_values: number[];
    last_price?: number;
  };
  orders: Array<{
    transaction_type: "BUY" | "SELL";
    quantity: number;
    price: number;
    order_type: string;
    product: string;
  }>;
}
