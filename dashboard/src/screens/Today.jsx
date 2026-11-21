import { useState } from "react";
import { api, formatDuration, formatTime, isSite, CATEGORIES, CATEGORY_ORDER } from "../api";
import { useData, useFlag } from "../hooks";
import { addDays, formatLongDate, todayKey } from "../dates";
import { Avatar, Button, Card, CategorySelect, EmptyState, ErrorNote, Icon, Segmented, Skeleton } from "../components/ui";
import { DayStrip, Ring, WeekBars } from "../components/charts";

const GOAL_HOURS = [1, 2, 3, 4, 5, 6, 8, 10, 12];
const REFRESH_MS = 15000;
const sum = (t) => t.productive + t.neutral + t.distracting;

function GoalSelect({ goalMinutes, onChange }) {
  const hours = goalMinutes ? goalMinutes / 60 : null;
  const options = hours && !GOAL_HOURS.includes(hours) ? [...GOAL_HOURS, hours].sort((a, b) => a - b) : GOAL_HOURS;
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      Daily goal
      <select
        value={hours ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Math.round(Number(e.target.value) * 60))}
        className="px-2 py-1 rounded-lg bg-surface2 border border-line text-fg text-xs"
      >
        <option value="">Off</option>
        {options.map((h) => (
          <option key={h} value={h}>
            {formatDuration(h * 3600)}
          </option>
        ))}
      </select>
    </label>
  );
}

// Shown until the first day of data exists, and dismissible.
function GettingStarted({ goalMinutes, browserConnected, go, onHide }) {
  const items = [
    { done: true, text: "MindPC is running and recording in the background." },
    { done: Boolean(goalMinutes), text: "Pick a daily goal if you want a gentle break reminder.", cta: "Set a goal", to: "settings" },
    { done: browserConnected, text: "Optional: see websites, not just browsers.", cta: "Connect your browser", to: "settings" },
  ];
  return (
    <Card title="Getting started" action={<Button onClick={onHide} className="!py-1">Hide</Button>}>
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.text} className="flex items-center gap-3 text-sm">
            <span
              className={`grid place-items-center w-6 h-6 rounded-full shrink-0 ${
                item.done ? "bg-prod text-white" : "border border-line text-transparent"
              }`}
            >
              <Icon name="check" className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1">{item.text}</span>
            {!item.done && item.cta && (
              <Button onClick={() => go(item.to)} className="!py-1">
                {item.cta}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function Today({ goalMinutes, onGoalChange, browserConnected, go, notify }) {
  const today = todayKey();
  const [date, setDate] = useState(today);
  const [filter, setFilter] = useState("all");
  const [hidden, setHidden] = useFlag("mindpc-getting-started-hidden");
  const live = date === today ? REFRESH_MS : 0;

  const apps = useData(`apps:${date}`, () => api.getApps(date), live);
  const week = useData(`week:${date}`, () => api.getWeek(addDays(date, -6), date), live);
  const sessions = useData(`sessions:${date}`, () => api.getSessions(date), live);

  const error = apps.error || week.error || sessions.error;
  const loading = apps.loading || week.loading || sessions.loading;
  const totals = apps.data?.totals ?? { productive: 0, neutral: 0, distracting: 0 };
  const total = sum(totals);
  const entries = apps.data?.apps ?? [];

  // "Your usual day": the average of the previous six days that had any activity.
  const before = (week.data ?? []).filter((d) => d.date !== date && d.total > 0);
  const usualProductive = before.length >= 2 ? before.reduce((t, d) => t + d.productive, 0) / before.length : null;
  const diff = usualProductive === null ? null : totals.productive - usualProductive;
  const goalSeconds = goalMinutes ? goalMinutes * 60 : null;
  const weekTotal = (week.data ?? []).reduce((t, d) => t + d.total, 0);
  const firstRun = !loading && !error && date === today && weekTotal === 0 && !hidden;

  const dayRows = sessions.data ?? [];
  const firstStart = dayRows.length ? dayRows.reduce((a, s) => (s.start_time < a ? s.start_time : a), dayRows[0].start_time) : null;
  const lastEnd = dayRows.length ? dayRows.reduce((a, s) => (s.end_time > a ? s.end_time : a), dayRows[0].end_time) : null;

  const visible = entries.filter((e) => filter === "all" || (filter === "site" ? isSite(e) : !isSite(e)));
  const max = entries[0]?.duration || 1;

  const setCategory = async (name, category) => {
    try {
      await api.setCategory(name, category);
      apps.reload();
      week.reload();
      sessions.reload();
    } catch (err) {
      notify(err.message || "Could not save the category");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight leading-tight">{formatLongDate(date, today)}</h1>
          <p className="text-muted">
            {date === today ? "Your time on this computer so far" : new Date(date + "T12:00:00").toLocaleDateString([], { dateStyle: "full" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
            <Icon name="left" />
          </Button>
          <input
            type="date"
            value={date}
            max={today}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            aria-label="Choose a day"
            className="px-2.5 py-1.5 rounded-[10px] bg-surface border border-line text-[13px] font-semibold"
          />
          <Button onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label="Next day">
            <Icon name="right" />
          </Button>
          {date !== today && (
            <Button variant="primary" onClick={() => setDate(today)}>
              Today
            </Button>
          )}
        </div>
      </header>

      {error && <ErrorNote message={error} onRetry={() => { apps.reload(); week.reload(); sessions.reload(); }} />}

      {loading ? (
        <div className="flex flex-col gap-5">
          <Skeleton className="h-[260px]" />
          <Skeleton className="h-[180px]" />
        </div>
      ) : (
        <>
          {firstRun && (
            <GettingStarted
              goalMinutes={goalMinutes}
              browserConnected={browserConnected}
              go={go}
              onHide={() => setHidden(true)}
            />
          )}

          <Card action={<GoalSelect goalMinutes={goalMinutes} onChange={onGoalChange} />}>
            <div className="grid sm:grid-cols-[auto_minmax(0,1fr)] gap-6 sm:gap-9 items-center">
              <div className="relative w-[200px] h-[200px] mx-auto">
                <Ring
                  totals={totals}
                  goalSeconds={goalSeconds}
                  label={total ? `${formatDuration(total)} today` : "No activity yet"}
                />
                <div className="absolute inset-0 grid place-content-center text-center">
                  <div className="text-[36px] font-bold tracking-tight leading-none tabular">{formatDuration(total)}</div>
                  <div className="text-[13px] text-muted mt-1.5">
                    {goalSeconds ? `of ${formatDuration(goalSeconds)} goal` : "screen time"}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3.5">
                {CATEGORY_ORDER.map((key) => (
                  <div key={key} className="grid grid-cols-[12px_minmax(0,1fr)_auto_44px] gap-3 items-center">
                    <span className="w-3 h-3 rounded" style={{ background: CATEGORIES[key].color }} />
                    <span>{CATEGORIES[key].label}</span>
                    <span className="font-semibold tabular">{formatDuration(totals[key])}</span>
                    <span className="text-muted text-right tabular">
                      {total ? Math.round((totals[key] / total) * 100) : 0}%
                    </span>
                  </div>
                ))}
                <div className="mt-1 rounded-xl bg-surface2 px-3.5 py-3 text-sm">
                  {!total ? (
                    "Nothing recorded yet. Work as usual and this fills in."
                  ) : (
                    <>
                      {diff !== null && (
                        <>
                          <b className={diff >= 0 ? "text-prod" : "text-fg"}>
                            {formatDuration(Math.abs(diff))} {diff >= 0 ? "more" : "less"} productive time
                          </b>{" "}
                          than your usual day.{" "}
                        </>
                      )}
                      {goalSeconds
                        ? total >= goalSeconds
                          ? "You've reached your goal. A break may do you good."
                          : `${formatDuration(goalSeconds - total)} left before your break reminder.`
                        : diff === null
                          ? "Set a daily goal to get a gentle break reminder."
                          : ""}
                    </>
                  )}
                </div>
              </div>
            </div>
          </Card>

          <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-5">
            <Card title="Last 7 days">
              <WeekBars
                days={week.data ?? []}
                max={Math.max(...(week.data ?? []).map((d) => d.total), 0)}
                today={today}
                selected={date}
                onSelect={setDate}
              />
            </Card>
            <Card title="Your day">
              {sessions.data?.length ? (
                <>
                  <DayStrip sessions={sessions.data} />
                  <dl className="grid grid-cols-3 gap-3 mt-5 text-sm">
                    <div>
                      <dt className="text-xs text-muted">First activity</dt>
                      <dd className="font-semibold tabular">{formatTime(firstStart)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Last activity</dt>
                      <dd className="font-semibold tabular">{formatTime(lastEnd)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Sessions</dt>
                      <dd className="font-semibold tabular">{dayRows.length}</dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="text-muted text-sm py-6">No activity recorded for this day.</p>
              )}
            </Card>
          </div>

          <Card
            title="Apps and sites"
            action={
              <Segmented
                label="Show"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "all", label: "All" },
                  { value: "app", label: "Apps" },
                  { value: "site", label: "Sites" },
                ]}
              />
            }
          >
            {visible.length === 0 ? (
              <EmptyState title={filter === "site" ? "No websites yet" : "Nothing here yet"}>
                {filter === "site"
                  ? "Connect your browser in Settings and websites will appear here, whichever browser you use."
                  : "Apps appear here as you use them."}
              </EmptyState>
            ) : (
              <ul>
                {visible.map((entry) => (
                  <li
                    key={entry.name + entry.identifier}
                    className="grid grid-cols-[30px_minmax(0,1fr)_auto] sm:grid-cols-[30px_minmax(0,1fr)_132px_78px] gap-x-3.5 gap-y-1 items-center py-3 border-t border-line first:border-t-0"
                  >
                    <Avatar entry={entry} />
                    <div className="min-w-0">
                      <div className="font-semibold flex items-center gap-2 min-w-0">
                        <span className="truncate" title={entry.name}>{entry.name}</span>
                        {isSite(entry) && <span className="text-[10px] font-bold tracking-wider uppercase text-muted">site</span>}
                      </div>
                      <div className="h-1.5 rounded-full bg-surface2 mt-1.5 overflow-hidden">
                        <i
                          className="block h-full rounded-full"
                          style={{ width: `${(entry.duration / max) * 100}%`, background: CATEGORIES[entry.category].color }}
                        />
                      </div>
                    </div>
                    <div className="sm:justify-self-end col-start-2 sm:col-start-auto row-start-2 sm:row-start-auto">
                      <CategorySelect value={entry.category} name={entry.name} onChange={(c) => setCategory(entry.name, c)} />
                    </div>
                    <div className="text-right font-semibold tabular">{formatDuration(entry.duration)}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
