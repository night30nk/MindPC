import { useEffect, useState } from "react";
import { api, formatDuration } from "../api";
import { useData } from "../hooks";
import { Button, Card, Segmented, Switch } from "../components/ui";

const GOAL_HOURS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

function Row({ title, hint, children }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 border-t border-line first:border-t-0 flex-wrap">
      <div className="min-w-0 flex-1 basis-60">
        <div className="font-semibold">{title}</div>
        {hint && <div className="text-sm text-muted mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function BrowserSection({ notify }) {
  const status = useData("browser-status", api.getBrowserStatus, 4000);
  const [copied, setCopied] = useState(false);
  const info = status.data;

  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(info.token);
      setCopied(true);
    } catch {
      notify("Select the code and copy it with Ctrl or Cmd + C.");
    }
  };

  const reveal = async () => {
    try {
      const result = await api.revealExtension();
      if (!result.opened) notify(`The extension is in ${result.path}`);
    } catch (err) {
      notify(err.message || "Could not prepare the extension folder");
    }
  };

  const reset = async () => {
    await api.resetBrowserToken();
    status.reload();
    notify("New code created. Paste it into the extension again.");
  };

  return (
    <Card
      title="Websites"
      action={
        <span className={`text-sm font-semibold ${info?.connected ? "text-prod" : "text-muted"}`}>
          {info?.connected ? "Connected" : "Not connected yet"}
        </span>
      }
    >
      {info && !info.available ? (
        <p className="text-warn text-sm">
          The browser connection could not start (its ports may be in use). MindPC still tracks your apps; websites will show under the browser's name.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-muted max-w-2xl">
            A small extension tells MindPC which website is open, so each site is tracked on its own whichever browser you use. Only the website name (like github.com) is shared, never the page address or title, and it stays on this computer. Private windows are ignored.
          </p>
          <ol className="text-sm flex flex-col gap-2 list-decimal pl-5 marker:text-muted">
            <li>
              <Button onClick={reveal} className="!py-1 mr-2">Show extension folder</Button>
              This opens a folder with the extension.
            </li>
            <li>In Chrome, Edge or Brave open the extensions page (<code className="text-xs bg-surface2 px-1.5 py-0.5 rounded">chrome://extensions</code>), turn on Developer mode, choose Load unpacked, and pick that folder.</li>
            <li>Click the extension's icon and paste this code:</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <input
              readOnly
              value={info?.token ?? ""}
              aria-label="Pairing code"
              onFocus={(e) => e.target.select()}
              className="flex-1 min-w-[15rem] px-3 py-1.5 rounded-[10px] bg-surface2 border border-line font-mono text-xs"
            />
            <Button onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
            <Button onClick={reset}>New code</Button>
          </div>
          <p className="text-xs text-muted max-w-2xl">
            Chrome will describe the extension's permission as "Read your browsing history". That is how an extension may see the active tab's address; it is reduced to the site name before anything is sent.
          </p>
        </div>
      )}
    </Card>
  );
}

export default function Settings({ goalMinutes, onGoalChange, tracking, onTracking, autostart, onAutostart, theme, setTheme, notify }) {
  const info = useData("app-info", api.getAppInfo);
  const hours = goalMinutes ? goalMinutes / 60 : null;
  const options = hours && !GOAL_HOURS.includes(hours) ? [...GOAL_HOURS, hours].sort((a, b) => a - b) : GOAL_HOURS;

  const handleExport = async () => {
    try {
      const r = await api.exportData();
      if (r.exported) notify(`Exported ${r.count} sessions.`);
    } catch (err) {
      notify(err.message || "Export failed");
    }
  };

  const handleDelete = async () => {
    try {
      const r = await api.deleteAllData();
      if (r.deleted) {
        notify("All data deleted.");
        window.location.reload();
      }
    } catch (err) {
      notify(err.message || "Delete failed");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-[30px] font-bold tracking-tight leading-tight">Settings</h1>
        <p className="text-muted">Everything stays on this computer.</p>
      </header>

      <Card title="Tracking">
        <Row title="Record my activity" hint={tracking ? "MindPC is recording which app you use." : "Paused. Nothing is recorded until you turn this back on, even after a restart."}>
          <Switch checked={tracking} onChange={onTracking} label="Record my activity" />
        </Row>
        {autostart.available && (
          <Row title="Start when I log in" hint="Starts quietly in the tray, so your day is always covered.">
            <Switch checked={autostart.enabled} onChange={onAutostart} label="Start when I log in" />
          </Row>
        )}
        <Row title="Daily goal" hint="A gentle break reminder at 80% and 100% of your screen-time goal. Off by default.">
          <select
            value={hours ?? ""}
            onChange={(e) => onGoalChange(e.target.value === "" ? null : Math.round(Number(e.target.value) * 60))}
            aria-label="Daily goal"
            className="px-3 py-1.5 rounded-[10px] bg-surface2 border border-line text-[13px] font-semibold"
          >
            <option value="">Off</option>
            {options.map((h) => (
              <option key={h} value={h}>{formatDuration(h * 3600)}</option>
            ))}
          </select>
        </Row>
      </Card>

      <Card title="Appearance">
        <Row title="Theme" hint="Follow your system, or choose one.">
          <Segmented
            label="Theme"
            value={theme}
            onChange={setTheme}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
          />
        </Row>
      </Card>

      <BrowserSection notify={notify} />

      <Card title="Your data">
        <Row title="Export" hint="Save everything MindPC recorded as a JSON file.">
          <Button onClick={handleExport}>Export…</Button>
        </Row>
        <Row title="Delete all data" hint="Permanently removes every recorded session from this computer. Your settings and category choices are kept. This cannot be undone.">
          <Button variant="danger" onClick={handleDelete}>Delete…</Button>
        </Row>
      </Card>

      <Card title="About">
        <p className="text-sm text-muted">
          MindPC {info.data ? info.data.version : ""} · Nothing is sent anywhere: there is no account, no server and no analytics. Window titles and page addresses are never read.
        </p>
      </Card>
    </div>
  );
}
