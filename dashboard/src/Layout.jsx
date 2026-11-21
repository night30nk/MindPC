import { useEffect, useState } from "react";
import { api } from "./api";

const Layout = ({ children }) => {
  const [tracking, setTracking] = useState(null);
  const [notice, setNotice] = useState(null);
  const [autostart, setAutostart] = useState({ available: false, enabled: false });

  useEffect(() => {
    let off = () => {};
    api
      .getTracking()
      .then((s) => setTracking(s.tracking))
      .catch(() => setTracking(null));
    api
      .getAutostart()
      .then(setAutostart)
      .catch(() => setAutostart({ available: false, enabled: false }));
    try {
      off = api.onTrackingChange((s) => setTracking(s.tracking));
    } catch {
      // Not running inside the desktop app; the page shows its own error.
    }
    return off;
  }, []);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(timer);
  }, [notice]);

  const toggleTracking = async () => {
    const s = await api.setTracking(!tracking);
    setTracking(s.tracking);
  };

  const toggleAutostart = async () => {
    setAutostart(await api.setAutostart(!autostart.enabled));
  };

  const handleExport = async () => {
    const r = await api.exportData();
    if (r.exported) setNotice(`Exported ${r.count} sessions.`);
  };

  const handleDelete = async () => {
    const r = await api.deleteAllData();
    if (r.deleted) {
      setNotice("All data deleted.");
      window.location.reload();
    }
  };

  const buttonClass =
    "px-3 py-1.5 text-xs font-semibold rounded-md border border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-md shadow-blue-500/20">
              M
            </div>
            <span className="font-bold text-lg tracking-tight text-white">MindPC</span>
          </div>

          <div className="flex items-center gap-2">
            {tracking !== null && (
              <button onClick={toggleTracking} className={buttonClass}>
                <span
                  className={`inline-block w-2 h-2 rounded-full mr-2 ${
                    tracking ? "bg-emerald-400" : "bg-amber-400"
                  }`}
                />
                {tracking ? "Tracking · Pause" : "Paused · Resume"}
              </button>
            )}
            {autostart.available && (
              <button onClick={toggleAutostart} className={buttonClass}>
                Launch at login: {autostart.enabled ? "On" : "Off"}
              </button>
            )}
            <button onClick={handleExport} className={buttonClass}>
              Export
            </button>
            <button
              onClick={handleDelete}
              className={`${buttonClass} hover:border-red-700 hover:text-red-300`}
            >
              Delete data
            </button>
          </div>
        </div>
      </header>

      {notice && (
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-4 text-xs text-emerald-300">
          {notice}
        </div>
      )}

      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-8">{children}</main>

      <footer className="border-t border-slate-800/80 py-4 text-center text-xs text-slate-500">
        MindPC — your data stays on this computer.
      </footer>
    </div>
  );
};

export default Layout;
