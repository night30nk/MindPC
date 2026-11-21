import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, dayKey, parseDay, todayKey, formatLongDate } from "./dates.js";

// Covers a zone east of UTC, one far west, and one with a daylight-saving change.
const ZONES = ["Asia/Kolkata", "America/Los_Angeles", "Pacific/Auckland", "UTC"];

function inEachZone(name, fn) {
  test(name, () => {
    const original = process.env.TZ;
    try {
      for (const tz of ZONES) {
        process.env.TZ = tz;
        fn(tz);
      }
    } finally {
      if (original === undefined) delete process.env.TZ;
      else process.env.TZ = original;
    }
  });
}

inEachZone("parseDay keeps the calendar day the string names", (tz) => {
  const d = parseDay("2026-11-21");
  assert.equal(d.getDate(), 21, tz);
  assert.equal(d.getMonth(), 10, tz);
  assert.equal(d.getHours(), 0, tz);
});

inEachZone("addDays moves by whole calendar days, forward and back", (tz) => {
  assert.equal(addDays("2026-11-21", 1), "2026-11-22", tz);
  assert.equal(addDays("2026-11-21", -1), "2026-11-20", tz);
  assert.equal(addDays("2026-11-21", 0), "2026-11-21", tz);
  assert.equal(addDays("2026-12-31", 1), "2027-01-01", tz);
  assert.equal(addDays("2027-03-01", -1), "2027-02-28", tz);
  assert.equal(addDays("2028-02-28", 1), "2028-02-29", tz); // leap year
});

inEachZone("addDays never skips or repeats a day across daylight-saving changes", (tz) => {
  // US spring-forward is 2026-03-08, fall-back 2026-11-01; NZ changes in April and September.
  for (const start of ["2026-03-06", "2026-10-30", "2026-04-02", "2026-09-24"]) {
    let key = start;
    for (let i = 1; i <= 10; i++) {
      const next = addDays(key, 1);
      assert.equal(parseDay(next) - parseDay(key) > 0, true, `${tz} ${key} -> ${next}`);
      assert.equal(addDays(next, -1), key, `${tz} ${key} round trip`);
      key = next;
    }
  }
});

inEachZone("a 7-day window is exactly seven distinct days", (tz) => {
  const days = Array.from({ length: 7 }, (_, i) => addDays("2026-11-21", i - 6));
  assert.equal(new Set(days).size, 7, tz);
  assert.equal(days[0], "2026-11-15", tz);
  assert.equal(days[6], "2026-11-21", tz);
});

inEachZone("dayKey and todayKey use the local day, zero-padded", (tz) => {
  assert.equal(dayKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05", tz);
  assert.equal(todayKey(new Date(2026, 11, 31, 0, 0)), "2026-12-31", tz);
});

inEachZone("formatLongDate names today and yesterday", (tz) => {
  assert.equal(formatLongDate("2026-11-21", "2026-11-21"), "Today", tz);
  assert.equal(formatLongDate("2026-11-20", "2026-11-21"), "Yesterday", tz);
  assert.notEqual(formatLongDate("2026-11-10", "2026-11-21"), "Today", tz);
});
