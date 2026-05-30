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
export type MainTab = "chart" | "option-chain" | "fundamentals";

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
