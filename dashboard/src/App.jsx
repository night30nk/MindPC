import { useCallback, useEffect, useState } from "react";
import { api } from "./api";
import { useData, useRoute, useTheme } from "./hooks";
import { Button, Icon } from "./components/ui";
import Today from "./screens/Today";
import Week from "./screens/Week";
import AppsSites from "./screens/AppsSites";
import Settings from "./screens/Settings";

const NAV = [
  { id: "today", label: "Today", icon: "today" },
  { id: "week", label: "Week", icon: "week" },
  { id: "apps", label: "Apps & sites", icon: "apps" },
  { id: "settings", label: "Settings", icon: "settings" },
];

export default function App() {
  const [route, go] = useRoute();
  const [theme, setTheme] = useTheme();
  const [goalMinutes, setGoalMinutes] = useState(null);
  const [tracking, setTracking] = useState(null);
  const [autostart, setAutostart] = useState({ available: false, enabled: false });
  const [notice, setNotice] = useState(null);
  const browser = useData("browser-connected", api.getBrowserStatus, 10000);

  const notify = useCallback((message) => setNotice(message), []);

  useEffect(() => {
    if (!window.mindpc) return undefined;
    api.getGoal().then((g) => setGoalMinutes(g.minutes)).catch(() => {});
    api.getTracking().then((s) => setTracking(s.tracking)).catch(() => {});
    api.getAutostart().then(setAutostart).catch(() => {});
    return api.onTrackingChange((s) => setTracking(s.tracking));
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 4500);
    return () => clearTimeout(timer);
  }, [notice]);

  if (!window.mindpc) {
    return (
      <div className="min-h-full grid place-items-center p-8 text-center">
        <p className="max-w-sm text-muted">MindPC's dashboard only works inside the MindPC desktop app. Open the app instead of this page.</p>
      </div>
    );
  }

  const changeGoal = async (minutes) => {
    try {
      const saved = await api.setGoal(minutes);
      setGoalMinutes(saved.minutes);
    } catch (err) {
      notify(err.message || "Could not save the goal");
    }
  };

  const changeTracking = async (enabled) => {
    const state = await api.setTracking(enabled);
    setTracking(state.tracking);
  };

  const changeAutostart = async (enabled) => {
    setAutostart(await api.setAutostart(enabled));
  };

  return (
    <div className="min-h-full min-[860px]:grid min-[860px]:grid-cols-[208px_minmax(0,1fr)]">
      <aside className="flex min-[860px]:flex-col flex-wrap items-center min-[860px]:items-stretch gap-3 min-[860px]:gap-6 px-3.5 py-3.5 min-[860px]:py-6 border-b min-[860px]:border-b-0 min-[860px]:border-r border-line min-[860px]:sticky min-[860px]:top-0 min-[860px]:h-screen">
        <div className="flex items-center gap-2.5 px-2 font-bold text-base">
          <span className="grid place-items-center w-7 h-7 rounded-lg bg-accent text-accent-fg">M</span>
          MindPC
        </div>
        <nav aria-label="Main" className="flex min-[860px]:flex-col gap-0.5 flex-wrap">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-current={route === item.id ? "page" : undefined}
              onClick={() => go(item.id)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-[11px] text-left font-medium transition-colors ${
                route === item.id ? "bg-surface text-fg font-semibold shadow-card" : "text-muted hover:text-fg"
              }`}
            >
              <Icon name={item.icon} />
              {item.label}
            </button>
          ))}
        </nav>
        {tracking !== null && (
          <div className="min-[860px]:mt-auto ml-auto min-[860px]:ml-0 flex items-center gap-2 px-2 text-[13px] text-muted">
            <span className={`w-2 h-2 rounded-full ${tracking ? "bg-prod" : "bg-warn"}`} />
            {tracking ? "Tracking" : "Paused"}
            <Button onClick={() => changeTracking(!tracking)} className="ml-auto !px-2.5 !py-0.5 !text-xs">
              {tracking ? "Pause" : "Resume"}
            </Button>
          </div>
        )}
      </aside>

      <main className="min-w-0 px-4 sm:px-7 py-6 sm:py-7 max-w-[1100px] w-full mx-auto">
        {route === "today" && (
          <Today
            goalMinutes={goalMinutes}
            onGoalChange={changeGoal}
            browserConnected={Boolean(browser.data?.connected)}
            go={go}
            notify={notify}
          />
        )}
        {route === "week" && <Week />}
        {route === "apps" && <AppsSites notify={notify} go={go} />}
        {route === "settings" && (
          <Settings
            goalMinutes={goalMinutes}
            onGoalChange={changeGoal}
            tracking={Boolean(tracking)}
            onTracking={changeTracking}
            autostart={autostart}
            onAutostart={changeAutostart}
            theme={theme}
            setTheme={setTheme}
            notify={notify}
          />
        )}
      </main>

      {notice && (
        <div
          role="status"
          className="fixed bottom-5 left-1/2 -translate-x-1/2 max-w-[90vw] rounded-xl bg-fg text-bg px-4 py-2.5 text-sm font-medium shadow-card"
        >
          {notice}
        </div>
      )}
    </div>
  );
}
