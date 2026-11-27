'use strict';

/**
 * Issue #162: Grimoire Hall of Legends — Personal Records Board
 * Pure helpers for qualifying piano runs, anti-farm personal record evaluation,
 * and Top-10 Best Accuracy / Biggest Single-Run XP ranking.
 */

const HALL_OF_LEGENDS_BONUS_XP = 50;
const HALL_OF_LEGENDS_MIN_COVERAGE = 0.8;
const HALL_OF_LEGENDS_LIMIT = 10;

function isQualifyingLegendRun({
  stageViewMode = 'highway',
  waitMode = false,
  playbackSpeed = 1.0,
  handIsolation = 'both',
  accompanimentMode = 'off',
  rehearsalLoopEnabled = false,
  encoreDrillActive = false,
  totalAttempts = 0,
  totalNotes = 0
} = {}) {
  if (stageViewMode === 'karaoke') return false;
  if (waitMode) return false;
  if (Number(playbackSpeed) < 1.0) return false;
  if (handIsolation !== 'both') return false;
  if (accompanimentMode === 'auto-both') return false;
  if (rehearsalLoopEnabled) return false;
  if (encoreDrillActive) return false;

  const attempts = Number(totalAttempts) || 0;
  if (attempts <= 0) return false;

  const notes = Number(totalNotes) || 0;
  if (notes > 0 && attempts / notes < HALL_OF_LEGENDS_MIN_COVERAGE) {
    return false;
  }

  return true;
}

/**
 * Evaluate whether a completed run establishes or beats a song's personal records.
 * - First run for a song sets the baseline (0 bonus XP).
 * - Ties never pay bonus XP.
 * - Strictly beating a prior non-zero record pays +50 XP per record beaten (up to +100 XP).
 */
function evaluatePersonalRecordUpdate(existingRecord, {
  accuracyPct = 0,
  runXp = 0,
  nowIso = new Date().toISOString(),
  qualified = false
} = {}) {
  const prevAcc = Math.max(0, Number(existingRecord?.bestAccuracy) || 0);
  const prevAccAt = existingRecord?.bestAccuracySetAt || (prevAcc > 0 ? (existingRecord?.lastPlayed || existingRecord?.firstPlayed || null) : null);
  const prevXp = Math.max(0, Number(existingRecord?.bestRunXp) || 0);
  const prevXpAt = existingRecord?.bestRunXpSetAt || null;

  const nextAcc = Math.max(0, Math.min(100, Math.round(Number(accuracyPct) || 0)));
  const nextXp = Math.max(0, Math.round(Number(runXp) || 0));

  let newBestAccuracy = prevAcc;
  let newBestAccuracySetAt = prevAccAt;
  let newBestRunXp = prevXp;
  let newBestRunXpSetAt = prevXpAt;

  let beatAccuracy = false;
  let beatXp = false;
  const beatenRecords = [];

  if (qualified && nextAcc > prevAcc) {
    newBestAccuracy = nextAcc;
    newBestAccuracySetAt = nowIso;
    if (prevAcc > 0) {
      beatAccuracy = true;
      beatenRecords.push({
        kind: 'accuracy',
        previous: prevAcc,
        current: nextAcc,
        bonusXp: HALL_OF_LEGENDS_BONUS_XP
      });
    }
  }

  if (qualified && nextXp > prevXp) {
    newBestRunXp = nextXp;
    newBestRunXpSetAt = nowIso;
    if (prevXp > 0) {
      beatXp = true;
      beatenRecords.push({
        kind: 'xp',
        previous: prevXp,
        current: nextXp,
        bonusXp: HALL_OF_LEGENDS_BONUS_XP
      });
    }
  }

  const bonusXp = beatenRecords.reduce((sum, rec) => sum + rec.bonusXp, 0);

  return {
    qualified: Boolean(qualified),
    beatAccuracy,
    beatXp,
    previousBestAccuracy: prevAcc,
    previousBestRunXp: prevXp,
    newBestAccuracy,
    newBestAccuracySetAt,
    newBestRunXp,
    newBestRunXpSetAt,
    bonusXp,
    beatenRecords
  };
}

function parseTimestampMs(iso) {
  if (!iso) return Number.MAX_SAFE_INTEGER;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : Number.MAX_SAFE_INTEGER;
}

/**
 * Compute Top-N personal records for Best Accuracy and Biggest Single-Run XP.
 * Each song appears at most once per list; ties break by earliest date set, then title.
 */
function computeHallOfLegends(songHistory, limit = HALL_OF_LEGENDS_LIMIT) {
  const maxItems = Math.max(1, Number(limit) || HALL_OF_LEGENDS_LIMIT);
  const bySongId = new Map();

  for (const [key, raw] of Object.entries(songHistory || {})) {
    if (!raw || typeof raw !== 'object') continue;
    const songId = String(raw.songId || key);
    const title = String(raw.title || 'Untitled Scroll');
    const filePath = raw.filePath || null;
    const bestAccuracy = Math.max(0, Number(raw.bestAccuracy) || 0);
    const bestAccuracySetAt = raw.bestAccuracySetAt || raw.lastPlayed || raw.firstPlayed || null;
    const bestRunXp = Math.max(0, Number(raw.bestRunXp) || 0);
    const bestRunXpSetAt = raw.bestRunXpSetAt || null;

    const prev = bySongId.get(songId);
    if (!prev) {
      bySongId.set(songId, {
        songId,
        title,
        filePath,
        bestAccuracy,
        bestAccuracySetAt,
        bestRunXp,
        bestRunXpSetAt
      });
    } else {
      if (bestAccuracy > prev.bestAccuracy) {
        prev.bestAccuracy = bestAccuracy;
        prev.bestAccuracySetAt = bestAccuracySetAt;
      }
      if (bestRunXp > prev.bestRunXp) {
        prev.bestRunXp = bestRunXp;
        prev.bestRunXpSetAt = bestRunXpSetAt;
      }
      if (!prev.filePath && filePath) prev.filePath = filePath;
    }
  }

  const all = Array.from(bySongId.values());

  const accuracy = all
    .filter((e) => e.bestAccuracy > 0)
    .sort((a, b) => {
      if (b.bestAccuracy !== a.bestAccuracy) return b.bestAccuracy - a.bestAccuracy;
      const dateDiff = parseTimestampMs(a.bestAccuracySetAt) - parseTimestampMs(b.bestAccuracySetAt);
      if (dateDiff !== 0) return dateDiff;
      return a.title.localeCompare(b.title);
    })
    .slice(0, maxItems)
    .map((e) => ({
      songId: e.songId,
      title: e.title,
      filePath: e.filePath,
      value: e.bestAccuracy,
      setAt: e.bestAccuracySetAt
    }));

  const xp = all
    .filter((e) => e.bestRunXp > 0)
    .sort((a, b) => {
      if (b.bestRunXp !== a.bestRunXp) return b.bestRunXp - a.bestRunXp;
      const dateDiff = parseTimestampMs(a.bestRunXpSetAt) - parseTimestampMs(b.bestRunXpSetAt);
      if (dateDiff !== 0) return dateDiff;
      return a.title.localeCompare(b.title);
    })
    .slice(0, maxItems)
    .map((e) => ({
      songId: e.songId,
      title: e.title,
      filePath: e.filePath,
      value: e.bestRunXp,
      setAt: e.bestRunXpSetAt
    }));

  return { accuracy, xp };
}

function formatLegendDate(isoStr) {
  if (!isoStr) return '\u2014';
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return '\u2014';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const HallOfLegends = {
  HALL_OF_LEGENDS_BONUS_XP,
  HALL_OF_LEGENDS_MIN_COVERAGE,
  HALL_OF_LEGENDS_LIMIT,
  isQualifyingLegendRun,
  evaluatePersonalRecordUpdate,
  computeHallOfLegends,
  formatLegendDate
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = HallOfLegends;
}
if (typeof window !== 'undefined') {
  window.HallOfLegends = HallOfLegends;
}
