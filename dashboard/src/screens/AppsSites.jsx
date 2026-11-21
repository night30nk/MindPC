import { useState } from "react";
import { api, formatDuration, isSite, CATEGORIES } from "../api";
import { useData } from "../hooks";
import { addDays, todayKey } from "../dates";
import { Avatar, Card, CategorySelect, EmptyState, ErrorNote, Segmented, Skeleton } from "../components/ui";

const RANGES = { today: 0, week: 6, month: 29 };

export default function AppsSites({ notify, go }) {
  const today = todayKey();
  const [range, setRange] = useState("week");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const from = addDays(today, -RANGES[range]);

  const data = useData(`apps:${range}:${today}`, () => api.getAppsRange(from, today), 15000);
  const entries = data.data?.apps ?? [];
  const total = entries.reduce((t, e) => t + e.duration, 0);
  const needle = query.trim().toLowerCase();
  const visible = entries
    .filter((e) => filter === "all" || (filter === "site" ? isSite(e) : !isSite(e)))
    .filter((e) => !needle || e.name.toLowerCase().includes(needle));
  const max = entries[0]?.duration || 1;
  const hasSites = entries.some(isSite);

  const setCategory = async (name, category) => {
    try {
      await api.setCategory(name, category);
      data.reload();
    } catch (err) {
      notify(err.message || "Could not save the category");
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex items-end justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight leading-tight">Apps and sites</h1>
          <p className="text-muted">Everything you used, and how it counts. Change a category and it applies everywhere.</p>
        </div>
        <Segmented
          label="Period"
          value={range}
          onChange={setRange}
          options={[
            { value: "today", label: "Today" },
            { value: "week", label: "7 days" },
            { value: "month", label: "30 days" },
          ]}
        />
      </header>

      {data.error && <ErrorNote message={data.error} onRetry={data.reload} />}

      <Card
        title={data.loading ? "Loading" : `${visible.length} ${visible.length === 1 ? "entry" : "entries"} · ${formatDuration(total)} in total`}
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              aria-label="Search apps and sites"
              className="px-3 py-1.5 rounded-[10px] bg-surface2 border border-line text-[13px] w-36"
            />
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
          </div>
        }
      >
        {data.loading ? (
          <Skeleton className="h-[240px]" />
        ) : visible.length === 0 ? (
          <EmptyState
            title={needle ? "No match" : "Nothing recorded in this period"}
            action={
              !needle && !hasSites && filter !== "app" ? (
                <button type="button" onClick={() => go("settings")} className="text-accent font-semibold text-sm hover:underline">
                  Connect your browser to see websites
                </button>
              ) : null
            }
          >
            {needle ? "Try a different search." : "Use your computer as usual and entries will appear here."}
          </EmptyState>
        ) : (
          <ul>
            {visible.map((entry) => (
              <li
                key={entry.name + entry.identifier}
                className="grid grid-cols-[30px_minmax(0,1fr)_auto] sm:grid-cols-[30px_minmax(0,1fr)_132px_78px_52px] gap-x-3.5 gap-y-1 items-center py-3 border-t border-line first:border-t-0"
              >
                <Avatar entry={entry} />
                <div className="min-w-0">
                  <div className="font-semibold flex items-center gap-2 min-w-0">
                    <span className="truncate" title={entry.name}>{entry.name}</span>
                    {isSite(entry) && <span className="text-[10px] font-bold tracking-wider uppercase text-muted">site</span>}
                  </div>
                  <div className="h-1.5 rounded-full bg-surface2 mt-1.5 overflow-hidden">
                    <i className="block h-full rounded-full" style={{ width: `${(entry.duration / max) * 100}%`, background: CATEGORIES[entry.category].color }} />
                  </div>
                </div>
                <div className="sm:justify-self-end col-start-2 sm:col-start-auto row-start-2 sm:row-start-auto">
                  <CategorySelect value={entry.category} name={entry.name} onChange={(c) => setCategory(entry.name, c)} />
                </div>
                <div className="text-right font-semibold tabular">{formatDuration(entry.duration)}</div>
                <div className="hidden sm:block text-right text-muted tabular text-sm">{total ? Math.round((entry.duration / total) * 100) : 0}%</div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
