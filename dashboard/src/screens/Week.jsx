import { useState } from "react";
import { api, formatDuration, isSite, CATEGORIES, CATEGORY_ORDER } from "../api";
import { useData } from "../hooks";
import { addDays, formatLongDate, formatShortDate, todayKey } from "../dates";
import { Avatar, Button, Card, EmptyState, ErrorNote, Icon, Skeleton } from "../components/ui";
import { HourBars, WeekBars } from "../components/charts";

const REFRESH_MS = 15000;
const sumDays = (days, key) => days.reduce((t, d) => t + d[key], 0);

function Stat({ label, value, delta, goodWhenUp }) {
  // Only productive time rising is "good" and only distracting time rising is "bad";
  // total screen time is shown without judgement, since long hours are often real work.
  const tone = delta === null || goodWhenUp === null ? "text-muted" : (delta >= 0) === goodWhenUp ? "text-prod" : "text-dis";
  return (
    <Card>
      <div className="text-[13px] font-semibold text-muted">{label}</div>
      <div className="text-[28px] font-bold tracking-tight leading-tight mt-1 tabular">{formatDuration(value)}</div>
      <div className={`text-xs mt-1 ${tone}`}>
        {delta === null ? "No earlier week to compare" : `${delta >= 0 ? "+" : "−"}${formatDuration(Math.abs(delta))} vs the 7 days before`}
      </div>
    </Card>
  );
}

export default function Week() {
  const today = todayKey();
  const [end, setEnd] = useState(today);
  const [picked, setPicked] = useState(null);
  const from = addDays(end, -6);
  const live = end === today ? REFRESH_MS : 0;

  const current = useData(`week:${end}`, () => api.getWeek(from, end), live);
  const previous = useData(`prev:${end}`, () => api.getWeek(addDays(end, -13), addDays(end, -7)));
  const apps = useData(`weekapps:${end}`, () => api.getAppsRange(from, end), live);

  const day = picked && picked >= from && picked <= end ? picked : end;
  const hourly = useData(`hourly:${day}`, () => api.getHourly(day), day === today ? REFRESH_MS : 0);

  const error = current.error || previous.error || apps.error || hourly.error;
  const days = current.data ?? [];
  const prevDays = previous.data ?? [];
  const prevTotal = sumDays(prevDays, "total");
  const delta = (key) => (prevTotal > 0 ? sumDays(days, key) - sumDays(prevDays, key) : null);

  const hours = hourly.data ?? [];
  const active = hours.map((h, i) => (h.productive + h.neutral + h.distracting > 0 ? i : -1)).filter((i) => i >= 0);
  const hourFrom = Math.min(7, active[0] ?? 7);
  const hourTo = Math.max(19, (active[active.length - 1] ?? 18) + 1);

  const entries = (apps.data?.apps ?? []).slice(0, 8);
  const max = entries[0]?.duration || 1;
  const reload = () => { current.reload(); previous.reload(); apps.reload(); hourly.reload(); };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight leading-tight">{end === today ? "Last 7 days" : "Week"}</h1>
          <p className="text-muted">
            {formatShortDate(from)} to {formatShortDate(end)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => { setEnd(addDays(end, -7)); setPicked(null); }} aria-label="Previous 7 days">
            <Icon name="left" />
          </Button>
          <Button onClick={() => { setEnd(addDays(end, 7) > today ? today : addDays(end, 7)); setPicked(null); }} disabled={end >= today} aria-label="Next 7 days">
            <Icon name="right" />
          </Button>
          {end !== today && (
            <Button variant="primary" onClick={() => { setEnd(today); setPicked(null); }}>
              This week
            </Button>
          )}
        </div>
      </header>

      {error && <ErrorNote message={error} onRetry={reload} />}

      {current.loading || previous.loading ? (
        <Skeleton className="h-[420px]" />
      ) : (
        <>
          <div className="grid sm:grid-cols-3 gap-5">
            <Stat label="Total screen time" value={sumDays(days, "total")} delta={delta("total")} goodWhenUp={null} />
            <Stat label="Productive" value={sumDays(days, "productive")} delta={delta("productive")} goodWhenUp={true} />
            <Stat label="Distracting" value={sumDays(days, "distracting")} delta={delta("distracting")} goodWhenUp={false} />
          </div>

          <Card title="Each day (pick one to see its hours)">
            <WeekBars
              days={days}
              max={Math.max(...days.map((d) => d.total), 0)}
              today={today}
              selected={day}
              onSelect={setPicked}
            />
          </Card>

          <Card
            title={`Hours of ${formatLongDate(day, today).toLowerCase()}`}
            action={
              <div className="flex gap-3 text-xs text-muted">
                {CATEGORY_ORDER.map((key) => (
                  <span key={key} className="inline-flex items-center gap-1.5">
                    <i className="w-2.5 h-2.5 rounded-sm block" style={{ background: CATEGORIES[key].color }} />
                    {CATEGORIES[key].label}
                  </span>
                ))}
              </div>
            }
          >
            {hourly.loading ? (
              <Skeleton className="h-[200px]" />
            ) : active.length === 0 ? (
              <p className="text-muted text-sm py-6">Nothing was recorded on this day.</p>
            ) : (
              <HourBars hours={hours} from={hourFrom} to={hourTo} />
            )}
          </Card>

          <Card title="Most used this week">
            {entries.length === 0 ? (
              <EmptyState title="No activity in this period">Use your computer as usual and it will show up here.</EmptyState>
            ) : (
              <ul className="flex flex-col gap-3.5">
                {entries.map((entry) => (
                  <li key={entry.name + entry.identifier} className="grid grid-cols-[30px_minmax(0,1fr)_76px] gap-3.5 items-center">
                    <Avatar entry={entry} />
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {entry.name}
                        {isSite(entry) && <span className="ml-2 text-[10px] font-bold tracking-wider uppercase text-muted">site</span>}
                      </div>
                      <div className="h-1.5 rounded-full bg-surface2 mt-1.5 overflow-hidden">
                        <i className="block h-full rounded-full" style={{ width: `${(entry.duration / max) * 100}%`, background: CATEGORIES[entry.category].color }} />
                      </div>
                    </div>
                    <div className="font-semibold tabular text-right">{formatDuration(entry.duration)}</div>
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
