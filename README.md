# MindPC

A Windows desktop productivity tracker.

Tracks which application is active and for how long, then displays daily usage on a web dashboard.

## Architecture

| Layer | Tech |
|---|---|
| Desktop (tracker) | Electron (Node.js) |
| Backend API | Express + PostgreSQL (`pg`) |
| Dashboard | React 19 + Vite + Tailwind CSS 3 |

## Folder structure

```
mindpc/
  main.js / preload.js   – Electron entry points (desktop tracker)
  backend/               – Express REST API
  dashboard/             – React + Vite dashboard
```

## Quick start (development)

```bash
# 1. Backend
cd backend
cp .env.example .env      # fill in your DB credentials
pnpm install
pnpm dev                  # starts on http://localhost:3001

# 2. Dashboard
cd dashboard
pnpm dev                  # starts on http://localhost:5173

# 3. Desktop
pnpm electron-dev         # launches Electron with hot-reload
```

## Main Objectives

1. **Monitor Application Usage** — track time spent on each desktop app, show stats on a dashboard.
2. **Promote Healthy Digital Habits** — daily usage limits, reminders when limits are reached.
3. **Provide Insights** — daily/weekly reports with visual charts (Recharts).

---