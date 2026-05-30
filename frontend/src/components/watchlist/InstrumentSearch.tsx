import { Search, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTradingStore } from "../../store/useTradingStore";
import { SearchResults } from "./SearchResults";

export function InstrumentSearch() {
  const inputRef = useRef<HTMLInputElement>(null);
  const {
    searchQuery,
    searchResults,
    activeSearchIndex,
    searchOpen,
    setSearchQuery,
    setSearchOpen,
    setActiveSearchIndex,
    searchTarget,
    setSearchTarget,
    addWatchlist,
    selectInstrument,
    setCompareInstrument,
  } = useTradingStore();

  const applySelection = (instrument: (typeof searchResults)[number]) => {
    if (searchTarget === "compare") {
      void setCompareInstrument(instrument);
    } else {
      void selectInstrument(instrument);
    }
    setSearchOpen(false);
    setSearchTarget("primary");
  };

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
        setSearchOpen(true);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
      }
      if (!searchOpen || !searchResults.length) return;
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setActiveSearchIndex(Math.min(activeSearchIndex + 1, searchResults.length - 1));
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setActiveSearchIndex(Math.max(activeSearchIndex - 1, 0));
      }
      if (event.key === "Enter" && searchResults[activeSearchIndex]) {
        event.preventDefault();
        applySelection(searchResults[activeSearchIndex]);
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [
    activeSearchIndex,
    searchOpen,
    searchResults,
    setActiveSearchIndex,
    setSearchOpen,
    searchTarget,
    setSearchTarget,
    selectInstrument,
    setCompareInstrument,
  ]);

  useEffect(() => {
    const handler = () => {
      inputRef.current?.focus();
      setSearchOpen(true);
    };
    window.addEventListener("instrument-search-focus", handler);
    return () => window.removeEventListener("instrument-search-focus", handler);
  }, [setSearchOpen]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    const handle = window.setTimeout(() => {
      void setSearchQuery(searchQuery);
    }, 160);
    return () => window.clearTimeout(handle);
  }, [searchQuery, setSearchQuery]);

  return (
    <div className="relative border-b border-[#e8edf3] bg-white px-3 py-4">
      <div className="flex h-12 items-center gap-2 rounded-[2px] border border-[#dde4ec] bg-white px-4">
        <Search className="h-4 w-4 text-slate-400" />
        <input
          ref={inputRef}
          value={searchQuery}
          onChange={(event) => {
            useTradingStore.setState({ searchQuery: event.target.value, searchOpen: true });
          }}
          onFocus={() => setSearchOpen(true)}
          placeholder="Search eg: infy bse, nifty fut, index"
          className="w-full border-0 bg-transparent p-0 text-[12px] text-slate-800 outline-none placeholder:text-[#9aa3af]"
        />
        {searchTarget === "compare" && <div className="text-[10px] font-medium uppercase text-[#ff5722]">Compare</div>}
        <div className="rounded-[2px] border border-[#dde4ec] px-2 py-1 text-[10px] text-slate-400">Ctrl + K</div>
        <button className="flex h-6 w-6 items-center justify-center rounded-sm text-[#9aa3af] hover:bg-[#f7f8fa]">
          <SlidersHorizontal className="h-3.5 w-3.5" />
        </button>
      </div>
      {searchOpen && searchQuery.trim() && (
        <div className="absolute left-3 right-3 top-[calc(100%-2px)] z-20">
          <SearchResults
            results={searchResults}
            activeIndex={activeSearchIndex}
            onSelect={applySelection}
            onCompare={(instrument) => {
              void setCompareInstrument(instrument);
              setSearchOpen(false);
              setSearchTarget("primary");
            }}
            onAddWatchlist={(instrument) => addWatchlist(instrument)}
          />
        </div>
      )}
    </div>
  );
}
