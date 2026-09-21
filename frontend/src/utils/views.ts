import type { MainTab } from "../types";

// Views that render as a standalone full-screen workspace and are therefore
// safe to open on their own in a separate browser tab via ?view=<name>.
const STANDALONE_VIEWS: readonly MainTab[] = ["chart", "orders", "holdings", "positions"];

function isStandaloneView(value: string): value is MainTab {
  return (STANDALONE_VIEWS as readonly string[]).includes(value);
}

/**
 * The tab the app should open on, read from the ?view= query param. Falls back
 * to the chart when the param is missing or not a standalone view, so a stray
 * URL never lands the user on a blank screen.
 */
export function initialMainTab(): MainTab {
  try {
    const view = new URLSearchParams(window.location.search).get("view");
    if (view && isStandaloneView(view)) return view;
  } catch {
    // No window/search (SSR, tests) — fall through to the default.
  }
  return "chart";
}

/**
 * Open one of the standalone views in a new browser tab. The session cookie is
 * shared across tabs, so the new tab boots already authenticated.
 */
export function openViewInNewTab(view: MainTab): void {
  const url = `${window.location.pathname}?view=${encodeURIComponent(view)}`;
  window.open(url, "_blank", "noopener");
}
