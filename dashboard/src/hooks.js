import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Loads data for `key`, optionally refreshing in the background. Data for a
 * different key is never shown while the new one loads.
 * @returns {{ data, error, loading, reload }}
 */
export function useData(key, fetcher, refreshMs = 0) {
  const [state, setState] = useState({ key: null, data: undefined, error: null });
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    let cancelled = false;
    const run = () =>
      fetcherRef
        .current()
        .then((data) => {
          if (!cancelled) setState({ key, data, error: null });
        })
        .catch((err) => {
          if (!cancelled) {
            setState((prev) => ({
              key,
              data: prev.key === key ? prev.data : undefined,
              error: err.message || "Could not load this",
            }));
          }
        });
    run();
    if (!refreshMs) {
      return () => {
        cancelled = true;
      };
    }
    const timer = setInterval(run, refreshMs);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [key, refreshMs, tick]);

  const reload = useCallback(() => setTick((t) => t + 1), []);
  const current = state.key === key;
  return {
    data: current ? state.data : undefined,
    error: current ? state.error : null,
    loading: !current,
    reload,
  };
}

const ROUTES = ["today", "week", "apps", "settings"];
const readRoute = () => {
  const name = window.location.hash.replace("#/", "");
  return ROUTES.includes(name) ? name : "today";
};

export function useRoute() {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const go = useCallback((name) => {
    window.location.hash = `#/${name}`;
  }, []);
  return [route, go];
}

const THEME_KEY = "mindpc-theme";

export function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") root.setAttribute("data-theme", theme);
  else root.removeAttribute("data-theme");
}

export function readTheme() {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState(readTheme);
  const setTheme = useCallback((next) => {
    setThemeState(next);
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Not persisted this time; the choice still applies until the app closes.
    }
  }, []);
  return [theme, setTheme];
}

// Small flags that only matter to the interface (like a dismissed hint).
export function useFlag(key) {
  const [value, setValue] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const set = useCallback(
    (next) => {
      setValue(next);
      try {
        localStorage.setItem(key, next ? "1" : "0");
      } catch {
        // Fine: the hint may come back next time.
      }
    },
    [key]
  );
  return [value, set];
}
