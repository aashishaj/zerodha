import unittest
from datetime import date

from zerodha_app.instruments import InstrumentCatalog, InstrumentRow


class InstrumentCatalogTests(unittest.TestCase):
    def setUp(self) -> None:
        self.catalog = InstrumentCatalog(
            [
                InstrumentRow(
                    instrument_token=1,
                    tradingsymbol="RELIANCE",
                    display_name="NSE:RELIANCE",
                    exchange="NSE",
                    segment="NSE",
                    instrument_type="EQ",
                    name="RELIANCE",
                    expiry=None,
                    strike=None,
                    lot_size=1,
                ),
                InstrumentRow(
                    instrument_token=2,
                    tradingsymbol="RELIANCE24JUNFUT",
                    display_name="NFO:RELIANCE24JUNFUT | 2026-06-25 FUT",
                    exchange="NFO",
                    segment="NFO-FUT",
                    instrument_type="FUT",
                    name="RELIANCE",
                    expiry=date(2026, 6, 25),
                    strike=None,
                    lot_size=250,
                ),
                InstrumentRow(
                    instrument_token=3,
                    tradingsymbol="RELIANCE24JUN2500CE",
                    display_name="NFO:RELIANCE24JUN2500CE | 2026-06-25 | 2500 CE",
                    exchange="NFO",
                    segment="NFO-OPT",
                    instrument_type="CE",
                    name="RELIANCE",
                    expiry=date(2026, 6, 25),
                    strike=2500.0,
                    lot_size=250,
                ),
                InstrumentRow(
                    instrument_token=4,
                    tradingsymbol="NIFTY26MAY24000CE",
                    display_name="NFO:NIFTY26MAY24000CE | 2026-05-26 | 24000 CE",
                    exchange="NFO",
                    segment="NFO-OPT",
                    instrument_type="CE",
                    name="NIFTY",
                    expiry=date(2026, 5, 26),
                    strike=24000.0,
                    lot_size=75,
                ),
                InstrumentRow(
                    instrument_token=5,
                    tradingsymbol="BANKNIFTY26MAY54000CE",
                    display_name="NFO:BANKNIFTY26MAY54000CE | 2026-05-26 | 54000 CE",
                    exchange="NFO",
                    segment="NFO-OPT",
                    instrument_type="CE",
                    name="BANKNIFTY",
                    expiry=date(2026, 5, 26),
                    strike=54000.0,
                    lot_size=35,
                ),
            ]
        )

    def test_search_groups_cash_futures_and_options(self) -> None:
        matches = self.catalog.search("RELIANCE")
        self.assertEqual(len(matches["cash"]), 1)
        self.assertEqual(len(matches["futures"]), 1)
        self.assertEqual(len(matches["options"]), 1)

    def test_search_can_filter_to_options(self) -> None:
        matches = self.catalog.search("RELIANCE", kind="options")
        self.assertEqual(len(matches["cash"]), 0)
        self.assertEqual(len(matches["futures"]), 0)
        self.assertEqual(len(matches["options"]), 1)

    def test_search_uses_exact_underlying_not_substring(self) -> None:
        matches = self.catalog.search("NIFTY", kind="options")
        self.assertEqual([item["tradingsymbol"] for item in matches["options"]], ["NIFTY26MAY24000CE"])

    def test_search_can_match_exact_strike_for_options(self) -> None:
        matches = self.catalog.search("24000", kind="options")
        self.assertEqual([item["tradingsymbol"] for item in matches["options"]], ["NIFTY26MAY24000CE"])


if __name__ == "__main__":
    unittest.main()
