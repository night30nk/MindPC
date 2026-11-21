// Pure helpers that turn stored sessions into what the dashboard charts need.
// They take plain rows and category overrides, so they are easy to test.

const { categorize } = require('./categories');

const KEYS = { productive: 'productive', neutral: 'neutral', distracting: 'distracting' };

function emptyTotals() {
  return { productive: 0, neutral: 0, distracting: 0 };
}

/**
 * Minutes per local hour of the day, split by category.
 * @param {Array<{app_name, app_identifier, start_time, end_time}>} sessions - one day of sessions
 * @returns {Array<{productive, neutral, distracting}>} 24 entries, minutes
 */
function hourlyByCategory(sessions, overrides = {}) {
  const hours = Array.from({ length: 24 }, emptyTotals);
  for (const s of sessions) {
    const category = KEYS[categorize(s.app_name, s.app_identifier, overrides)];
    const end = new Date(s.end_time).getTime();
    let cursor = new Date(s.start_time).getTime();
    while (cursor < end) {
      const d = new Date(cursor);
      const nextHour = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
      const segmentEnd = Math.min(end, nextHour);
      // Sessions never cross midnight, but guard so a bad row cannot index past 23.
      if (d.getHours() >= 0 && d.getHours() < 24) {
        hours[d.getHours()][category] += (segmentEnd - cursor) / 60000;
      }
      cursor = segmentEnd;
    }
  }
  return hours;
}

function dateKey(d) {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, '0'),
    String(d.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * Seconds per category for each day in [from, to], including days with no data.
 * @param {Array<{date, name, identifier, duration}>} rows - one row per app per day
 */
function dailyByCategory(rows, overrides, from, to) {
  const byDate = new Map();
  for (const row of rows) {
    const totals = byDate.get(row.date) || emptyTotals();
    totals[KEYS[categorize(row.name, row.identifier, overrides)]] += row.duration;
    byDate.set(row.date, totals);
  }

  const result = [];
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const end = new Date(ty, tm - 1, td);
  for (let d = new Date(fy, fm - 1, fd); d <= end; d.setDate(d.getDate() + 1)) {
    const key = dateKey(d);
    const totals = byDate.get(key) || emptyTotals();
    result.push({ date: key, ...totals, total: totals.productive + totals.neutral + totals.distracting });
  }
  return result;
}

module.exports = { hourlyByCategory, dailyByCategory };
