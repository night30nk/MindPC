// Decides when to nudge the user about their daily screen-time goal.
// Pure: the caller supplies the numbers and stores the returned state.

const THRESHOLDS = [80, 100];

// Local calendar day as YYYY-MM-DD (the same day boundary the dashboard uses).
function localDateKey(date = new Date()) {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * @param {Object} params
 * @param {number} params.totalSeconds - Screen time so far today
 * @param {number|null} params.limitMinutes - Daily goal in minutes; null/0 = off
 * @param {string} params.today - Local date, YYYY-MM-DD
 * @param {Object|null} params.state - What was already notified (from last call)
 * @returns {{ notify: 80|100|null, state: Object }}
 */
function evaluateLimit({ totalSeconds, limitMinutes, today, state }) {
  // A new day or a changed goal starts fresh, so lowering the goal can notify again.
  const current =
    state && state.date === today && state.limitMinutes === limitMinutes
      ? state
      : { date: today, limitMinutes, levels: [] };

  if (!limitMinutes || limitMinutes <= 0) {
    return { notify: null, state: current };
  }

  const percent = (totalSeconds / (limitMinutes * 60)) * 100;
  const reached = THRESHOLDS.filter((t) => percent >= t && !current.levels.includes(t));
  if (reached.length === 0) {
    return { notify: null, state: current };
  }

  // Jumping straight past both thresholds (e.g. goal lowered to below current
  // usage) gives one notification for the highest, not two.
  return {
    notify: Math.max(...reached),
    state: { ...current, levels: [...current.levels, ...reached] },
  };
}

function formatMinutes(totalMinutes) {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = Math.round(totalMinutes % 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
}

// Worded as a break reminder, not a scolding: long hours are often real work.
function notificationText(level, limitMinutes) {
  const goal = formatMinutes(limitMinutes);
  if (level === 100) {
    return {
      title: 'Daily screen-time goal reached',
      body: `You've reached your ${goal} goal for today. Time for a break?`,
    };
  }
  return {
    title: 'Almost at your daily goal',
    body: `You're at ${level}% of your ${goal} screen-time goal.`,
  };
}

module.exports = { evaluateLimit, notificationText, formatMinutes, localDateKey, THRESHOLDS };
