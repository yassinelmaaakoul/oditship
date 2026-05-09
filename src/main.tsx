import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { preloadStatusBadgeOverrides } from "./lib/statusBadgeOverrides";

preloadStatusBadgeOverrides().catch(() => { /* */ });

// --- Impersonation isolation bootstrap ---
// When this tab is in "impersonation mode" (flag set by /impersonate), redirect
// any read/write of the Supabase auth storage key from localStorage to sessionStorage.
// sessionStorage is per-tab, so the original admin tab (which uses localStorage)
// keeps its own session untouched.
(() => {
  try {
    if (typeof window === "undefined") return;
    if (sessionStorage.getItem("sb-impersonating") !== "1") return;

    const isAuthKey = (key: string) =>
      key.startsWith("sb-") && key.includes("-auth-token");

    const ls = window.localStorage;
    const ss = window.sessionStorage;
    const origGet = ls.getItem.bind(ls);
    const origSet = ls.setItem.bind(ls);
    const origRemove = ls.removeItem.bind(ls);

    ls.getItem = (key: string) => (isAuthKey(key) ? ss.getItem(key) : origGet(key));
    ls.setItem = (key: string, value: string) => {
      if (isAuthKey(key)) ss.setItem(key, value);
      else origSet(key, value);
    };
    ls.removeItem = (key: string) => {
      if (isAuthKey(key)) ss.removeItem(key);
      else origRemove(key);
    };
  } catch {
    /* no-op */
  }
})();

createRoot(document.getElementById("root")!).render(<App />);
