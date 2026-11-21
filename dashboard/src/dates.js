// Calendar-day helpers. A day is a "YYYY-MM-DD" string in the user's own time
// zone. Parsing "2026-11-21" with new Date() would read it as UTC and give the
// previous day west of Greenwich, so every date here is built from its parts.

export function parseDay(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dayKey(date) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function todayKey(now = new Date()) {
  return dayKey(now);
}

// Moves by calendar days (never by 24-hour blocks), so daylight-saving changes
// cannot skip or repeat a day.
export function addDays(key, n) {
  const d = parseDay(key);
  return dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n));
}

export function formatLongDate(key, today = todayKey()) {
  if (key === today) return "Today";
  if (key === addDays(today, -1)) return "Yesterday";
  return parseDay(key).toLocaleDateString([], { weekday: "long", day: "numeric", month: "long" });
}

export function formatShortDate(key) {
  return parseDay(key).toLocaleDateString([], { day: "numeric", month: "short" });
}

export function weekdayLetter(key) {
  return parseDay(key).toLocaleDateString("en-US", { weekday: "narrow" });
}

export function weekdayShort(key) {
  return parseDay(key).toLocaleDateString([], { weekday: "short" });
}
