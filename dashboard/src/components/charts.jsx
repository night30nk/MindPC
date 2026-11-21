import { CATEGORIES, CATEGORY_ORDER, formatDuration } from "../api";
import { weekdayLetter } from "../dates";

const cv = (key) => CATEGORIES[key].color;

// Progress ring: time against a goal, split by category. With no goal the ring is
// the whole day, split by category.
export function Ring({ totals, goalSeconds, label }) {
  const r = 84;
  const circumference = 2 * Math.PI * r;
  const total = totals.productive + totals.neutral + totals.distracting;
  const scale = goalSeconds ? goalSeconds : total || 1;
  const segments = [];
  let start = 0;
  for (const key of CATEGORY_ORDER) {
    const length = Math.min(totals[key] / scale, 1) * circumference;
    segments.push({ key, length, start });
    start += length;
  }
  return (
    <svg viewBox="0 0 210 210" role="img" aria-label={label} className="w-full h-full block">
      <circle cx="105" cy="105" r={r} fill="none" stroke="var(--surface2)" strokeWidth="20" />
      {segments.map(({ key, length, start: offset }) => (
        <circle
          key={key}
          cx="105"
          cy="105"
          r={r}
          fill="none"
          stroke={cv(key)}
          strokeWidth="20"
          strokeDasharray={`${length} ${circumference - length}`}
          strokeDashoffset={-offset}
          transform="rotate(-90 105 105)"
        />
      ))}
    </svg>
  );
}

// One stacked bar per day, split by category. `max` sets the scale.
export function WeekBars({ days, max, today, selected, onSelect }) {
  const scale = Math.max(max, 3600);
  return (
    <div className="flex items-end gap-2.5 h-[132px]" role="group" aria-label="Screen time per day">
      {days.map((day) => {
        const height = (day.total / scale) * 100;
        const isToday = day.date === today;
        const content = (
          <>
            <div
              className="w-full max-w-[36px] rounded-lg overflow-hidden flex flex-col-reverse bg-surface2"
              style={{ height: `${Math.max(height, day.total ? 4 : 2)}%` }}
              title={`${day.date}: ${formatDuration(day.total)}`}
            >
              {CATEGORY_ORDER.map((key) => (
                <i
                  key={key}
                  className="block"
                  style={{ height: `${day.total ? (day[key] / day.total) * 100 : 0}%`, background: cv(key) }}
                />
              ))}
            </div>
            <span className={`text-xs ${isToday || selected === day.date ? "text-fg font-bold" : "text-muted"}`}>
              {weekdayLetter(day.date)}
            </span>
          </>
        );
        const base = "flex-1 flex flex-col items-center justify-end gap-2 h-full min-w-0";
        return onSelect ? (
          <button
            key={day.date}
            type="button"
            onClick={() => onSelect(day.date)}
            aria-pressed={selected === day.date}
            aria-label={`${day.date}, ${formatDuration(day.total)}`}
            className={`${base} rounded-lg ${selected === day.date ? "bg-surface2/70" : "hover:bg-surface2/50"}`}
          >
            {content}
          </button>
        ) : (
          <div key={day.date} className={base}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

function minutesOfDay(iso) {
  const d = new Date(iso);
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

// The day as a strip: coloured where something was used, empty where nothing was.
export function DayStrip({ sessions }) {
  const spans = sessions.map((s) => ({
    start: minutesOfDay(s.start_time),
    end: minutesOfDay(s.end_time),
    category: s.category,
  }));
  const first = spans.length ? Math.min(...spans.map((s) => s.start)) : 8 * 60;
  const last = spans.length ? Math.max(...spans.map((s) => s.end)) : 18 * 60;
  // Whole hours around the activity, at least a working-day wide.
  const from = Math.min(Math.floor(first / 60) * 60, 8 * 60);
  const to = Math.max(Math.ceil(last / 60) * 60, 18 * 60);
  const W = 600;
  const x = (m) => ((m - from) / (to - from)) * W;
  const step = (to - from) / 60 > 12 ? 3 : 2;
  const ticks = [];
  for (let h = Math.ceil(from / 60); h * 60 <= to; h += step) ticks.push(h);
  const label = (h) => (h === 0 || h === 24 ? "12a" : h === 12 ? "12p" : h > 12 ? `${h - 12}p` : `${h}a`);
  return (
    <svg viewBox={`-14 0 ${W + 28} 84`} role="img" aria-label="Your day, coloured by category" className="w-full h-auto block">
      <rect x="0" y="10" width={W} height="44" rx="10" fill="var(--surface2)" />
      {spans.map((s, i) => (
        <rect
          key={i}
          x={x(s.start)}
          y="10"
          width={Math.max(x(s.end) - x(s.start), 2)}
          height="44"
          fill={cv(s.category)}
        />
      ))}
      {ticks.map((h) => (
        <text key={h} x={x(h * 60)} y="76" fontSize="11" textAnchor="middle" fill="var(--muted)">
          {label(h)}
        </text>
      ))}
    </svg>
  );
}

// Minutes per hour of a day, stacked by category (the hourly view).
export function HourBars({ hours, from = 7, to = 19 }) {
  const W = 640;
  const H = 230;
  const left = 38;
  const bottom = 24;
  const top = 8;
  const span = to - from;
  const bw = (W - left - 8) / span;
  const y = (m) => top + (H - top - bottom) * (1 - m / 60);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Minutes per hour, by category" className="w-full h-auto block">
      {[0, 15, 30, 45, 60].map((g) => (
        <g key={g}>
          <line x1={left} x2={W - 8} y1={y(g)} y2={y(g)} stroke="var(--line)" />
          <text x={left - 6} y={y(g) + 3} fontSize="10" textAnchor="end" fill="var(--muted)">
            {g ? `${g}m` : "0"}
          </text>
        </g>
      ))}
      {hours.slice(from, to).map((hour, i) => {
        const h = from + i;
        const bx = left + i * bw + 3;
        let cursor = H - bottom;
        return (
          <g key={h}>
            {CATEGORY_ORDER.map((key) => {
              const minutes = Math.min(hour[key], 60);
              if (!minutes) return null;
              const height = (minutes / 60) * (H - top - bottom);
              cursor -= height;
              return <rect key={key} x={bx} y={cursor} width={bw - 6} height={height} rx="1.5" fill={cv(key)} />;
            })}
            {h % 2 === 0 && (
              <text x={bx + (bw - 6) / 2} y={H - 7} fontSize="10" textAnchor="middle" fill="var(--muted)">
                {String(h).padStart(2, "0")}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
