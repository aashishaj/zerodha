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
export type MainTab = "chart" | "option-chain" | "fundamentals" | "orders" | "holdings";
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
  /** Default order quantity (shares / lots) */
  defaultQty: number;
  /** Points added above High for BUY SL trigger price */
  buyTriggerOffset: number;
  /** Points added above High for BUY SL limit price */
  buyPriceOffset: number;
  /** Points subtracted below Low for SELL SL trigger price */
  sellTriggerOffset: number;
  /** Points subtracted below Low for SELL SL limit price */
  sellPriceOffset: number;
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
  orderType?: OrderType;
  price?: number;
  triggerPrice?: number;
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

export type OrderStatus = "PENDING" | "FILLED" | "REJECTED" | "CANCELLED";

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
  status: OrderStatus;
  filled_quantity?: number;
  pending_quantity?: number;
  average_price?: number;
  placed_at?: string;
  timestamp?: string;
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
}

export interface ActiveAccount {
  id: number;
  label: string;
}
