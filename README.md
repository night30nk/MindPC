# MindPC

A local-first desktop tracker for Windows, macOS and Linux.

It records which application you are using and for how long, then shows your day on a dashboard.
**Everything is stored on your computer.** There is no account, no server and no network access, so it works fully offline.

## Architecture

| Layer | Tech |
|---|---|
| Desktop app + tracker | Electron (Node.js), `active-win`, idle detection via `powerMonitor` |
| Storage | SQLite through Node's built-in `node:sqlite` (no native module to build) |
| Dashboard | React 19 + Vite + Tailwind CSS 3 + Recharts, loaded inside the app window |

```
Electron main process
  tracker (every 3s) -> sessionManager -> SQLite
        | IPC (preload.js)
React dashboard
```

```
mindpc/
  main.js / preload.js   – Electron entry points and the IPC bridge
  tracker.js idle.js     – polls the active window and idle time
  sessionManager.js      – pure session logic (tested)
  storage.js             – SQLite storage and queries (tested)
  dashboard/             – React UI
```

## Run it

Requires Node 22+ and pnpm.

```bash
pnpm install
pnpm --dir dashboard install

pnpm start      # builds the dashboard and launches the app
pnpm dev        # dashboard with hot reload + app with auto-restart
pnpm test       # unit tests
```

## How it behaves

- Time is recorded only while you are active: after 5 minutes without keyboard or mouse input, the session ends at the moment you stopped.
- Sleep, screen lock and shutdown close the current session. A crash loses at most 3 seconds, and the interrupted session is recovered on next launch.
- A session that crosses midnight is split so each day gets only its own time.
- Closing the window keeps tracking in the tray. Pause or quit from the tray menu.
- Raw sessions are kept for 90 days.
- **Export** writes your data to a JSON file, and **Delete data** removes it permanently.

## Platform notes

- **Windows / macOS:** supported through `active-win`.
- **Linux:** `active-win` reads the focused window through X11. Wayland sessions may not report the active window.
- **macOS:** application names were read without extra permission in testing.

## Roadmap

1. Installers, app icon and launch at login
2. App categories, daily limits and reminders, focus mode
3. Weekly summary
4. Optional encrypted sync across devices (the earlier server version lives on the `server-sync` branch)
