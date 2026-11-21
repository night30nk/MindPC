import { useState, useEffect } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import {
  api,
  formatDuration,
  formatTime,
  formatShortDate,
  getTodayString,
  getNDaysAgoString,
} from "../api";

// Custom Recharts Tooltip
function CustomTooltip({ active, payload }) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-slate-900 border border-slate-700 px-3 py-2 rounded-lg text-xs shadow-lg">
        <p className="font-semibold text-slate-200">{data.date}</p>
        <p className="text-blue-400 font-bold">{data.formatted}</p>
      </div>
    );
  }
  return null;
}

const CATEGORY_STYLE = {
  productive: { label: "Productive", bar: "bg-emerald-500", text: "text-emerald-400" },
  neutral: { label: "Neutral", bar: "bg-slate-500", text: "text-slate-400" },
  distracting: { label: "Distracting", bar: "bg-rose-500", text: "text-rose-400" },
};
const CATEGORY_ORDER = ["productive", "neutral", "distracting"];
const GOAL_HOURS = [1, 2, 3, 4, 5, 6, 8, 10, 12];

// Stacked bar of how the day split between productive, neutral and distracting.
function CategoryBreakdown({ totals, totalSeconds }) {
  if (totalSeconds <= 0) return null;
  return (
    <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-lg">
      <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
        How your time was spent
      </span>
      <div className="flex w-full h-3 rounded-full overflow-hidden bg-slate-950 border border-slate-800 mt-4">
        {CATEGORY_ORDER.map((key) => (
          <div
            key={key}
            className={CATEGORY_STYLE[key].bar}
            style={{ width: `${(totals[key] / totalSeconds) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-8 gap-y-2 mt-4">
        {CATEGORY_ORDER.map((key) => (
          <div key={key} className="text-xs">
            <span className={`font-semibold ${CATEGORY_STYLE[key].text}`}>
              {CATEGORY_STYLE[key].label}
            </span>{" "}
            <span className="text-slate-200 font-semibold">{formatDuration(totals[key])}</span>{" "}
            <span className="text-slate-500">
              ({Math.round((totals[key] / totalSeconds) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Optional daily screen-time goal, with progress for the selected day.
function GoalControl({ goalMinutes, totalSeconds, onChange }) {
  const hours = goalMinutes ? goalMinutes / 60 : null;
  const options = hours && !GOAL_HOURS.includes(hours) ? [...GOAL_HOURS, hours].sort((a, b) => a - b) : GOAL_HOURS;
  const percent = goalMinutes ? Math.min(100, (totalSeconds / (goalMinutes * 60)) * 100) : 0;

  return (
    <div className="mt-4 space-y-2">
      <label className="flex items-center justify-between text-xs text-slate-400">
        Daily goal
        <select
          value={hours ?? ""}
          onChange={(e) => onChange(e.target.value === "" ? null : Math.round(Number(e.target.value) * 60))}
          className="px-2 py-1 rounded-md bg-slate-950 border border-slate-700 text-slate-200 text-xs focus:outline-none focus:border-blue-500"
        >
          <option value="">Off</option>
          {options.map((h) => (
            <option key={h} value={h}>
              {formatDuration(h * 3600)}
            </option>
          ))}
        </select>
      </label>
      {goalMinutes && (
        <>
          <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
            <div
              className={`h-2 rounded-full transition-all duration-300 ${percent >= 80 ? "bg-amber-500" : "bg-blue-500"}`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <span className="text-[11px] text-slate-500">
            {Math.round((totalSeconds / (goalMinutes * 60)) * 100)}% of {formatDuration(goalMinutes * 60)}
          </span>
        </>
      )}
    </div>
  );
}

// Reads every view for one date from the local database.
async function fetchDashboard(date) {
  const fromDate = getNDaysAgoString(6, date); // 7-day window ending on the date
  const [apps, daily, sessions] = await Promise.all([
    api.getApps(date),
    api.getDaily(fromDate, date),
    api.getSessions(date),
  ]);
  return { date, apps: apps.apps, totals: apps.totals, daily, sessions };
}

export default function Dashboard() {
  const [selectedDate, setSelectedDate] = useState(getTodayString());
  const [data, setData] = useState(null); // last successful load, tagged with its date
  const [error, setError] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [goalMinutes, setGoalMinutes] = useState(null);

  useEffect(() => {
    api
      .getGoal()
      .then((g) => setGoalMinutes(g.minutes))
      .catch(() => setGoalMinutes(null));
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchDashboard(selectedDate)
        .then((result) => {
          if (cancelled) return;
          setData(result);
          setError(null);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message || "Failed to load dashboard data");
        });

    load();

    // Today is still being recorded, so keep it fresh in the background.
    if (selectedDate !== getTodayString()) return () => { cancelled = true; };
    const timer = setInterval(load, 15000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [selectedDate, reloadKey]);

  // Show the skeleton until data for the selected date has arrived.
  const loading = !error && data?.date !== selectedDate;
  const appsData = data?.date === selectedDate ? data.apps : [];
  const totals = data?.date === selectedDate ? data.totals : { productive: 0, neutral: 0, distracting: 0 };
  const dailyData = data?.daily ?? [];
  const sessionsData = data?.date === selectedDate ? data.sessions : [];

  const handleGoalChange = async (minutes) => {
    try {
      const saved = await api.setGoal(minutes);
      setGoalMinutes(saved.minutes);
    } catch (err) {
      setError(err.message || "Could not save the goal");
    }
  };

  const handleCategoryChange = async (appName, category) => {
    try {
      await api.setCategory(appName, category);
      setReloadKey((k) => k + 1);
    } catch (err) {
      setError(err.message || "Could not save the category");
    }
  };

  // Navigate date helpers
  const handlePrevDay = () => {
    const prev = getNDaysAgoString(1, selectedDate);
    setSelectedDate(prev);
  };

  const handleNextDay = () => {
    const next = getNDaysAgoString(-1, selectedDate);
    setSelectedDate(next);
  };

  const handleToday = () => {
    setSelectedDate(getTodayString());
  };

  // Compute total screen time for selected date
  const totalSeconds = appsData.reduce((acc, curr) => acc + (curr.duration || 0), 0);
  const formattedTotal = formatDuration(totalSeconds);

  // Format daily data for Recharts (convert seconds to minutes or hours)
  const chartData = dailyData.map((d) => ({
    rawDate: d.date,
    date: formatShortDate(d.date),
    minutes: Math.round((d.duration || 0) / 60),
    formatted: formatDuration(d.duration),
  }));

  return (
    <div className="space-y-8">
      {/* Top Controls: Date picker & quick buttons */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 border border-slate-800 p-4 rounded-xl">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Daily Overview
          </h1>
          <p className="text-xs text-slate-400">
            Your activity and screen time on this computer
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handlePrevDay}
            className="p-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
            title="Previous Day"
          >
            ←
          </button>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-950 border border-slate-700 text-slate-200 focus:outline-none focus:border-blue-500"
          />
          <button
            onClick={handleNextDay}
            className="p-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 transition-colors"
            title="Next Day"
          >
            →
          </button>
          <button
            onClick={handleToday}
            className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-500 text-white transition-colors shadow-sm"
          >
            Today
          </button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div className="p-4 rounded-xl bg-red-950/40 border border-red-800 text-red-300 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
          <button
            onClick={() => setReloadKey((k) => k + 1)}
            className="px-3 py-1 text-xs font-semibold rounded bg-red-900/80 hover:bg-red-800 text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-pulse">
          <div className="h-32 bg-slate-900 border border-slate-800 rounded-xl"></div>
          <div className="h-32 bg-slate-900 border border-slate-800 rounded-xl md:col-span-2"></div>
          <div className="h-64 bg-slate-900 border border-slate-800 rounded-xl md:col-span-3"></div>
        </div>
      ) : (
        <>
          {/* Summary Metric Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl flex flex-col justify-between shadow-lg">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Total Screen Time
              </span>
              <div className="my-3">
                <span className="text-4xl font-extrabold text-white tracking-tight">
                  {formattedTotal}
                </span>
              </div>
              <span className="text-xs text-slate-500">
                {totalSeconds > 0
                  ? `Active across ${appsData.length} app${appsData.length === 1 ? "" : "s"}`
                  : "No recorded activity for this date"}
              </span>
              <GoalControl
                goalMinutes={goalMinutes}
                totalSeconds={totalSeconds}
                onChange={handleGoalChange}
              />
            </div>

            {/* 7-Day Trend Chart */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl md:col-span-2 shadow-lg flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Last 7 Days Usage
                </span>
                <span className="text-xs text-slate-500">Daily totals (min)</span>
              </div>
              <div className="h-36 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -25 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                    />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      tickLine={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey="minutes"
                      fill="#3b82f6"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <CategoryBreakdown totals={totals} totalSeconds={totalSeconds} />

          {/* Top Apps & Timeline Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Top Applications list */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl shadow-lg">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                Top Applications
              </h2>

              {appsData.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No app usage recorded on this day.
                </div>
              ) : (
                <div className="space-y-4">
                  {appsData.map((app, idx) => {
                    const pct = totalSeconds > 0
                      ? Math.round((app.duration / totalSeconds) * 100)
                      : 0;

                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex justify-between items-center gap-2 text-xs font-medium">
                          <span className="text-slate-200 truncate max-w-[140px]" title={app.name}>
                            {app.name}
                          </span>
                          <span className="flex items-center gap-2">
                            <span className="text-slate-400 font-semibold">
                              {formatDuration(app.duration)} ({pct}%)
                            </span>
                            <select
                              value={app.category}
                              onChange={(e) => handleCategoryChange(app.name, e.target.value)}
                              aria-label={`Category for ${app.name}`}
                              className={`px-1 py-0.5 rounded bg-slate-950 border border-slate-700 text-[10px] focus:outline-none focus:border-blue-500 ${CATEGORY_STYLE[app.category].text}`}
                            >
                              {CATEGORY_ORDER.map((key) => (
                                <option key={key} value={key}>
                                  {CATEGORY_STYLE[key].label}
                                </option>
                              ))}
                            </select>
                          </span>
                        </div>
                        <div className="w-full bg-slate-950 rounded-full h-2 overflow-hidden border border-slate-800">
                          <div
                            className={`${CATEGORY_STYLE[app.category].bar} h-2 rounded-full transition-all duration-300`}
                            style={{ width: `${pct}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sessions Timeline Table */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-xl lg:col-span-2 shadow-lg flex flex-col">
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider mb-4">
                Sessions Timeline
              </h2>

              {sessionsData.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center py-12 text-slate-500 text-xs border border-dashed border-slate-800 rounded-lg">
                  <span className="text-2xl mb-2">⏱️</span>
                  <span>No sessions logged for this calendar date.</span>
                  <span className="text-slate-600 mt-1">
                    MindPC records in the background while it is running.
                  </span>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 uppercase text-[10px] tracking-wider">
                        <th className="pb-3 font-semibold">Application</th>
                        <th className="pb-3 font-semibold">Executable</th>
                        <th className="pb-3 font-semibold">Start Time</th>
                        <th className="pb-3 font-semibold">End Time</th>
                        <th className="pb-3 font-semibold text-right">Duration</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {sessionsData.map((session, i) => (
                        <tr key={i} className="hover:bg-slate-800/30 transition-colors">
                          <td className="py-2.5 font-medium text-slate-200">
                            {session.app_name}
                          </td>
                          <td className="py-2.5 text-slate-400 font-mono text-[11px]">
                            {session.app_identifier}
                          </td>
                          <td className="py-2.5 text-slate-300">
                            {formatTime(session.start_time)}
                          </td>
                          <td className="py-2.5 text-slate-300">
                            {formatTime(session.end_time)}
                          </td>
                          <td className="py-2.5 text-right font-semibold text-blue-400">
                            {formatDuration(session.duration_seconds)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
