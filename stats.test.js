const { hourlyByCategory, dailyByCategory } = require('./stats');

const local = (h, m = 0) => new Date(2026, 10, 21, h, m, 0).toISOString();
const row = (app, id, start, end) => ({ app_name: app, app_identifier: id, start_time: start, end_time: end });

describe('hourlyByCategory', () => {
  it('returns 24 empty hours when there are no sessions', () => {
    const hours = hourlyByCategory([]);
    expect(hours).toHaveLength(24);
    expect(hours.every((h) => h.productive === 0 && h.neutral === 0 && h.distracting === 0)).toBe(true);
  });

  it('puts minutes in the right hour and category', () => {
    const hours = hourlyByCategory([
      row('Code', 'Code.app', local(9, 0), local(9, 40)),
      row('Netflix', 'Netflix.exe', local(9, 40), local(9, 55)),
    ]);
    expect(hours[9].productive).toBeCloseTo(40);
    expect(hours[9].distracting).toBeCloseTo(15);
    expect(hours[9].neutral).toBe(0);
    expect(hours[8].productive).toBe(0);
  });

  it('splits a session that spans several hours', () => {
    const hours = hourlyByCategory([row('Code', 'Code.app', local(9, 45), local(11, 15))]);
    expect(hours[9].productive).toBeCloseTo(15);
    expect(hours[10].productive).toBeCloseTo(60);
    expect(hours[11].productive).toBeCloseTo(15);
  });

  it('categorises websites by domain and respects overrides', () => {
    const rows = [row('youtube.com', 'site:youtube.com', local(14, 0), local(14, 20))];
    expect(hourlyByCategory(rows)[14].distracting).toBeCloseTo(20);
    expect(hourlyByCategory(rows, { 'youtube.com': 'productive' })[14].productive).toBeCloseTo(20);
  });

  it('conserves total time', () => {
    const rows = [
      row('Code', 'Code.app', local(8, 10), local(10, 50)),
      row('Slack', 'Slack.app', local(10, 50), local(11, 5)),
    ];
    const total = hourlyByCategory(rows).reduce((t, h) => t + h.productive + h.neutral + h.distracting, 0);
    expect(total).toBeCloseTo(2 * 60 + 40 + 15);
  });
});

describe('dailyByCategory', () => {
  const rows = [
    { date: '2026-11-20', name: 'Code', identifier: 'Code.app', duration: 3600 },
    { date: '2026-11-20', name: 'Netflix', identifier: 'Netflix.exe', duration: 600 },
    { date: '2026-11-21', name: 'Finder', identifier: 'Finder.app', duration: 300 },
  ];

  it('totals seconds per category per day', () => {
    const days = dailyByCategory(rows, {}, '2026-11-20', '2026-11-21');
    expect(days).toEqual([
      { date: '2026-11-20', productive: 3600, neutral: 0, distracting: 600, total: 4200 },
      { date: '2026-11-21', productive: 0, neutral: 300, distracting: 0, total: 300 },
    ]);
  });

  it('includes days with no activity', () => {
    const days = dailyByCategory(rows, {}, '2026-11-19', '2026-11-22');
    expect(days.map((d) => d.date)).toEqual(['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(days[0].total).toBe(0);
    expect(days[3].total).toBe(0);
  });

  it('applies category overrides', () => {
    const days = dailyByCategory(rows, { Netflix: 'productive' }, '2026-11-20', '2026-11-20');
    expect(days[0].productive).toBe(4200);
    expect(days[0].distracting).toBe(0);
  });
});
