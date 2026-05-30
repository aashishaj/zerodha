import type { Instrument } from "../types";

const expiries = ["2026-05-22", "2026-05-29"];
const niftyStrikes = [23800, 23900, 24000, 24100, 24200];
const bankniftyStrikes = [50800, 50900, 51000, 51100, 51200];
const infyStrikes = [1600, 1650, 1700];
const wiproStrikes = [177.5, 182.5, 187.5];

let token = 1000;
const nextToken = () => token++;

const buildOptions = (
  name: "NIFTY" | "BANKNIFTY" | "INFY" | "WIPRO",
  strikes: number[],
  lotSize: number,
): Instrument[] =>
  expiries.flatMap((expiry) =>
    strikes.flatMap((strike) =>
      (["CE", "PE"] as const).map((instrumentType) => ({
        instrument_token: nextToken(),
        exchange_token: nextToken(),
        tradingsymbol: `${name}${expiry.slice(5, 7)}${expiry.slice(8, 10)}${String(strike).replace(".", "")}${instrumentType}`,
        name,
        last_price:
          name === "INFY"
            ? Number((Math.max(15, 1700 - strike) / 2).toFixed(2))
            : name === "WIPRO"
              ? Number((Math.max(2, 190 - strike) * 1.5).toFixed(2))
              : strike / 100,
        expiry,
        strike,
        tick_size: 0.05,
        lot_size: lotSize,
        instrument_type: instrumentType,
        segment: "NFO-OPT",
        exchange: "NFO",
      })),
    ),
  );

const buildFutures = (name: "NIFTY" | "BANKNIFTY" | "INFY" | "WIPRO", lotSize: number): Instrument[] =>
  expiries.map((expiry) => ({
    instrument_token: nextToken(),
    exchange_token: nextToken(),
    tradingsymbol: `${name}${expiry.slice(5, 7)}${expiry.slice(8, 10)}FUT`,
    name,
    last_price: name === "NIFTY" ? 24035 : name === "BANKNIFTY" ? 51010 : name === "INFY" ? 1670.8 : 182.45,
    expiry,
    strike: null,
    tick_size: 0.05,
    lot_size: lotSize,
    instrument_type: "FUT",
    segment: "NFO-FUT",
    exchange: "NFO",
  }));

const indices: Instrument[] = [
  {
    instrument_token: nextToken(),
    exchange_token: nextToken(),
    tradingsymbol: "NIFTY 50",
    name: "NIFTY",
    last_price: 24035.8,
    expiry: null,
    strike: null,
    tick_size: 0.05,
    lot_size: 1,
    instrument_type: "INDEX",
    segment: "NSE-INDEX",
    exchange: "NSE",
  },
  {
    instrument_token: nextToken(),
    exchange_token: nextToken(),
    tradingsymbol: "BANKNIFTY",
    name: "BANKNIFTY",
    last_price: 51022.4,
    expiry: null,
    strike: null,
    tick_size: 0.05,
    lot_size: 1,
    instrument_type: "INDEX",
    segment: "NSE-INDEX",
    exchange: "NSE",
  },
  {
    instrument_token: nextToken(),
    exchange_token: nextToken(),
    tradingsymbol: "SENSEX",
    name: "SENSEX",
    last_price: 78992.1,
    expiry: null,
    strike: null,
    tick_size: 0.05,
    lot_size: 1,
    instrument_type: "INDEX",
    segment: "BSE-INDEX",
    exchange: "BSE",
  },
];

const equities: Instrument[] = [
  {
    instrument_token: nextToken(),
    exchange_token: nextToken(),
    tradingsymbol: "INFY",
    name: "INFY",
    last_price: 1670.8,
    expiry: null,
    strike: null,
    tick_size: 0.05,
    lot_size: 1,
    instrument_type: "EQ",
    segment: "NSE",
    exchange: "NSE",
  },
  {
    instrument_token: nextToken(),
    exchange_token: nextToken(),
    tradingsymbol: "WIPRO",
    name: "WIPRO",
    last_price: 182.45,
    expiry: null,
    strike: null,
    tick_size: 0.05,
    lot_size: 1,
    instrument_type: "EQ",
    segment: "NSE",
    exchange: "NSE",
  },
];

export const mockInstruments: Instrument[] = [
  ...indices,
  ...equities,
  ...buildFutures("NIFTY", 75),
  ...buildFutures("BANKNIFTY", 35),
  ...buildFutures("INFY", 300),
  ...buildFutures("WIPRO", 1500),
  ...buildOptions("NIFTY", niftyStrikes, 75),
  ...buildOptions("BANKNIFTY", bankniftyStrikes, 35),
  ...buildOptions("INFY", infyStrikes, 300),
  ...buildOptions("WIPRO", wiproStrikes, 1500),
];
