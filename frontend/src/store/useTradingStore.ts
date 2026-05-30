import { create } from "zustand";
import { chartService } from "../services/chartService";
import { instrumentsService } from "../services/instrumentsService";
import { marketDataService } from "../services/marketDataService";
import { marketDepthService } from "../services/marketDepthService";
import { watchlistService } from "../services/watchlistService";
import { optionChainService } from "../services/optionChainService";
import { parseChartDate } from "../utils/dates";
import type {
  Candle,
  Instrument,
  MainTab,
  MarketDepth,
  OptionChainRow,
  OrderSide,
  OrderTicketPrefill,
  Quote,
  Timeframe,
  WatchlistItem,
} from "../types";

type CandleCache = Record<string, Candle[]>;
const useMock = import.meta.env.VITE_USE_MOCK_DATA === "true";

const candleTimestamp = (candle: Candle) => parseChartDate(candle.time)?.getTime() ?? Number.NaN;

const mergeCandles = (existing: Candle[] = [], incoming: Candle[] = []) => {
  const merged = new Map<number, Candle>();

  existing.forEach((candle) => {
    const timestamp = candleTimestamp(candle);
    if (Number.isFinite(timestamp)) {
      merged.set(timestamp, candle);
    }
  });

  incoming.forEach((candle) => {
    const timestamp = candleTimestamp(candle);
    if (Number.isFinite(timestamp)) {
      merged.set(timestamp, candle);
    }
  });

  return Array.from(merged.entries())
    .sort((left, right) => left[0] - right[0])
    .map((entry) => entry[1]);
};

interface TradingState {
  isReady: boolean;
  loadingSearch: boolean;
  loadingChart: boolean;
  loadingInstrumentToken: number | null;
  mainTab: MainTab;
  timeframe: Timeframe;
  compareInstrument: Instrument | null;
  selectedInstrument: Instrument | null;
  instruments: Instrument[];
  searchQuery: string;
  searchResults: Instrument[];
  searchOpen: boolean;
  searchTarget: "primary" | "compare";
  activeSearchIndex: number;
  watchlist: WatchlistItem[];
  quotes: Record<string, Quote>;
  candles: CandleCache;
  profile: { userId: string; name: string } | null;
  optionChainRows: OptionChainRow[];
  selectedUnderlying: string;
  selectedExpiry: string;
  activeOrderTicketInstrument: Instrument | null;
  orderSide: OrderSide;
  orderTicketPrefill: OrderTicketPrefill | null;
  isOrderTicketOpen: boolean;
  marketDepthInstrument: Instrument | null;
  marketDepth: MarketDepth | null;
  isMarketDepthOpen: boolean;
  init: () => Promise<void>;
  refreshQuotes: (symbols?: string[]) => Promise<void>;
  refreshVisibleCharts: () => Promise<void>;
  setMainTab: (tab: MainTab) => void;
  setTimeframe: (timeframe: Timeframe) => Promise<void>;
  setSearchQuery: (query: string) => Promise<void>;
  setSearchOpen: (value: boolean) => void;
  setSearchTarget: (target: "primary" | "compare") => void;
  setActiveSearchIndex: (index: number) => void;
  selectInstrument: (instrument: Instrument) => Promise<void>;
  setCompareInstrument: (instrument: Instrument | null) => Promise<void>;
  refreshInstrument: (instrument: Instrument) => Promise<void>;
  clearCompareInstrument: () => void;
  addWatchlist: (instrument: Instrument) => void;
  removeWatchlist: (token: number) => void;
  openOrderTicket: (instrument: Instrument, side: OrderSide, prefill?: OrderTicketPrefill) => void;
  closeOrderTicket: () => void;
  openMarketDepth: (instrument: Instrument) => Promise<void>;
  closeMarketDepth: () => void;
  setOptionChainFilters: (underlying: string, expiry: string) => Promise<void>;
  refreshOptionChain: () => Promise<void>;
}

const toWatchlistItem = (instrument: Instrument, quote?: Quote): WatchlistItem => ({
  instrument_token: instrument.instrument_token,
  tradingsymbol: instrument.tradingsymbol,
  displayName: instrument.tradingsymbol,
  exchange: instrument.exchange,
  segment: instrument.segment,
  ltp: quote?.last_price ?? instrument.last_price,
  change: quote?.change ?? 0,
  changePercent: quote?.changePercent ?? 0,
});

const nearestExpiryOption = (
  instruments: Instrument[],
  {
    underlying,
    strike,
    side,
  }: {
    underlying: "NIFTY" | "BANKNIFTY";
    strike?: number;
    side?: "CE" | "PE";
  },
) =>
  instruments
    .filter(
      (item) =>
        item.name === underlying &&
        item.segment === "NFO-OPT" &&
        (!strike || item.strike === strike) &&
        (!side || item.instrument_type === side) &&
        item.expiry,
    )
    .sort((left, right) => String(left.expiry).localeCompare(String(right.expiry)))[0] ?? null;

export const useTradingStore = create<TradingState>((set, get) => ({
  isReady: false,
  loadingSearch: false,
  loadingChart: false,
  loadingInstrumentToken: null,
  mainTab: "chart",
  timeframe: "1m",
  compareInstrument: null,
  selectedInstrument: null,
  instruments: [],
  searchQuery: "",
  searchResults: [],
  searchOpen: false,
  searchTarget: "primary",
  activeSearchIndex: 0,
  watchlist: watchlistService.load(),
  quotes: {},
  candles: {},
  profile: null,
  optionChainRows: [],
  selectedUnderlying: "NIFTY",
  selectedExpiry: "",
  activeOrderTicketInstrument: null,
  orderSide: "BUY",
  orderTicketPrefill: null,
  isOrderTicketOpen: false,
  marketDepthInstrument: null,
  marketDepth: null,
  isMarketDepthOpen: false,
  async init() {
    const [instruments, profile] = await Promise.all([
      instrumentsService.getInstruments(),
      marketDataService.getProfile(),
    ]);

    const seeded = [
      instruments.find((item) => item.tradingsymbol === "NIFTY 50"),
      nearestExpiryOption(instruments, { underlying: "NIFTY", strike: 24000, side: "CE" }) ??
        nearestExpiryOption(instruments, { underlying: "NIFTY", side: "CE" }),
      nearestExpiryOption(instruments, { underlying: "NIFTY", strike: 24000, side: "PE" }) ??
        nearestExpiryOption(instruments, { underlying: "NIFTY", side: "PE" }),
      nearestExpiryOption(instruments, { underlying: "BANKNIFTY", strike: 51000, side: "CE" }) ??
        nearestExpiryOption(instruments, { underlying: "BANKNIFTY", side: "CE" }),
      nearestExpiryOption(instruments, { underlying: "BANKNIFTY", strike: 51000, side: "PE" }) ??
        nearestExpiryOption(instruments, { underlying: "BANKNIFTY", side: "PE" }),
    ].filter(Boolean) as Instrument[];

    const persisted = get().watchlist.filter((item) =>
      instruments.some((instrument) => instrument.instrument_token === item.instrument_token),
    );

    const defaultSymbols = Array.from(
      new Set(
        [
          ...seeded.map((item) => item.tradingsymbol),
          ...persisted.map((item) => item.tradingsymbol),
          "NIFTY 50",
          "BANKNIFTY",
          "SENSEX",
        ].filter(Boolean),
      ),
    );
    const quotes = await marketDataService.getQuotes(defaultSymbols);

    const watchlist = persisted.length
      ? persisted.map((item) => {
          const match = instruments.find((instrument) => instrument.instrument_token === item.instrument_token);
          return match ? toWatchlistItem(match, quotes[match.tradingsymbol]) : item;
        })
      : seeded.map((instrument) => toWatchlistItem(instrument, quotes[instrument.tradingsymbol]));

    watchlistService.save(watchlist);
    set({
      instruments,
      profile,
      quotes,
      watchlist,
      selectedInstrument: seeded[1] ?? seeded[0] ?? null,
      compareInstrument: seeded[2] ?? null,
      selectedExpiry: seeded[1]?.expiry ?? "",
      isReady: true,
    });

    if (seeded[1]) {
      await get().selectInstrument(seeded[1]);
    }
    if (seeded[2]) {
      await get().setCompareInstrument(seeded[2]);
    }
    await get().refreshOptionChain();
  },
  async refreshQuotes(symbols) {
    const requested = symbols?.length
      ? symbols
      : Array.from(
          new Set([
            ...get().watchlist.map((item) => item.tradingsymbol),
            get().selectedInstrument?.tradingsymbol,
            get().compareInstrument?.tradingsymbol,
            "NIFTY 50",
            "SENSEX",
            "BANKNIFTY",
          ].filter(Boolean) as string[]),
        );

    if (!requested.length) return;

    const quotes = await marketDataService.getQuotes(requested);
    set((state) => ({
      quotes: { ...state.quotes, ...quotes },
      watchlist: state.watchlist.map((item) => {
        const quote = quotes[item.tradingsymbol];
        return quote
          ? {
              ...item,
              ltp: quote.last_price,
              change: quote.change,
              changePercent: quote.changePercent,
            }
          : item;
      }),
    }));
  },
  async refreshVisibleCharts() {
    const { selectedInstrument, compareInstrument, timeframe } = get();
    const instruments = [selectedInstrument, compareInstrument].filter(Boolean) as Instrument[];
    if (!instruments.length) return;

    const responses = await Promise.all(
      instruments.map(async (instrument) => ({
        key: `${instrument.instrument_token}:${timeframe}`,
        candles: await chartService.getCandles(instrument.instrument_token, timeframe),
      })),
    );

    set((state) => ({
      candles: responses.reduce<CandleCache>(
        (accumulator, response) => {
          accumulator[response.key] = mergeCandles(state.candles[response.key], response.candles);
          return accumulator;
        },
        { ...state.candles },
      ),
    }));
  },
  setMainTab(tab) {
    set({ mainTab: tab });
  },
  async setTimeframe(timeframe) {
    set({ timeframe });
    if (get().selectedInstrument) {
      await get().selectInstrument(get().selectedInstrument!);
    }
    if (get().compareInstrument) {
      await get().setCompareInstrument(get().compareInstrument);
    }
  },
  async setSearchQuery(query) {
    set({ searchQuery: query, loadingSearch: true, searchOpen: true, activeSearchIndex: 0 });
    const results = await instrumentsService.search(query, get().instruments);
    set({ searchResults: results.slice(0, 32), loadingSearch: false });
  },
  setSearchOpen(value) {
    set({ searchOpen: value });
  },
  setSearchTarget(target) {
    set({ searchTarget: target });
  },
  setActiveSearchIndex(index) {
    set({ activeSearchIndex: index });
  },
  async selectInstrument(instrument) {
    const key = `${instrument.instrument_token}:${get().timeframe}`;
    set({ selectedInstrument: instrument, loadingChart: true, loadingInstrumentToken: instrument.instrument_token });
    if (!get().candles[key]) {
      const candles = await chartService.getCandles(instrument.instrument_token, get().timeframe);
      set((state) => ({ candles: { ...state.candles, [key]: mergeCandles(state.candles[key], candles) } }));
    }
    set({ loadingChart: false, loadingInstrumentToken: null });
  },
  async setCompareInstrument(instrument) {
    if (!instrument) {
      set({ compareInstrument: null });
      return;
    }
    const key = `${instrument.instrument_token}:${get().timeframe}`;
    set({ compareInstrument: instrument, loadingInstrumentToken: instrument.instrument_token });
    if (!get().candles[key]) {
      const candles = await chartService.getCandles(instrument.instrument_token, get().timeframe);
      set((state) => ({ candles: { ...state.candles, [key]: mergeCandles(state.candles[key], candles) } }));
    }
    set({ loadingInstrumentToken: null });
  },
  async refreshInstrument(instrument) {
    const key = `${instrument.instrument_token}:${get().timeframe}`;
    set({ loadingChart: true, loadingInstrumentToken: instrument.instrument_token });
    const candles = await chartService.getCandles(instrument.instrument_token, get().timeframe);
    set((state) => ({
      candles: { ...state.candles, [key]: mergeCandles(state.candles[key], candles) },
      loadingChart: false,
      loadingInstrumentToken: null,
    }));
  },
  clearCompareInstrument() {
    set({ compareInstrument: null });
  },
  addWatchlist(instrument) {
    if (get().watchlist.some((item) => item.instrument_token === instrument.instrument_token)) {
      return;
    }
    const quote = get().quotes[instrument.tradingsymbol];
    const next = [toWatchlistItem(instrument, quote), ...get().watchlist.filter((item) => item.instrument_token !== instrument.instrument_token)];
    watchlistService.save(next);
    set({ watchlist: next });
  },
  removeWatchlist(token) {
    const next = get().watchlist.filter((item) => item.instrument_token !== token);
    watchlistService.save(next);
    set((state) => ({
      watchlist: next,
      compareInstrument:
        state.compareInstrument?.instrument_token === token ? null : state.compareInstrument,
    }));
  },
  openOrderTicket(instrument, side, prefill) {
    set({
      activeOrderTicketInstrument: instrument,
      orderSide: side,
      orderTicketPrefill: prefill ?? null,
      isOrderTicketOpen: true,
    });
  },
  closeOrderTicket() {
    set({ isOrderTicketOpen: false, activeOrderTicketInstrument: null, orderTicketPrefill: null });
  },
  async openMarketDepth(instrument) {
    set({ marketDepthInstrument: instrument, isMarketDepthOpen: true });
    const depth = await marketDepthService.getDepth(instrument.instrument_token);
    set({ marketDepth: depth });
  },
  closeMarketDepth() {
    set({ isMarketDepthOpen: false, marketDepthInstrument: null, marketDepth: null });
  },
  async setOptionChainFilters(underlying, expiry) {
    set({ selectedUnderlying: underlying, selectedExpiry: expiry });
    await get().refreshOptionChain();
  },
  async refreshOptionChain() {
    const { instruments, selectedUnderlying, selectedExpiry } = get();
    const chainInstruments = instruments.filter(
      (instrument) => instrument.name === selectedUnderlying && instrument.segment === "NFO-OPT",
    );
    const targetExpiry =
      selectedExpiry ||
      chainInstruments
        .map((instrument) => instrument.expiry)
        .filter(Boolean)
        .sort()[0] ||
      "";

    const quotes = useMock
      ? await marketDataService.getQuotes(chainInstruments.map((item) => item.tradingsymbol))
      : {};
    const rows = await optionChainService.getChain(selectedUnderlying, targetExpiry, instruments, quotes);
    set((state) => ({
      optionChainRows: rows,
      selectedExpiry: targetExpiry,
      quotes: { ...state.quotes, ...quotes },
    }));
  },
}));
