'use strict';

/**
 * College of Keys — Issue #175: In-App Tap-to-Sync Lyric Editor
 * Pure, testable state machine for parsing plain or .lrc lyrics (preserving UTF-8),
 * tapping Space to stamp line timestamps, undoing taps, nudging/re-anchoring lines,
 * and serializing clean .lrc output.
 */

function formatTapSyncTimestamp(sec) {
  // Round to total centiseconds first so 59.996s rolls over to [01:00.00] (#231)
  const totalCentis = Math.max(0, Math.round((Number(sec) || 0) * 100));
  const mins = Math.floor(totalCentis / 6000);
  const wholeSecs = Math.floor((totalCentis % 6000) / 100);
  const hundredths = totalCentis % 100;
  const mm = String(mins).padStart(2, '0');
  const ss = String(wholeSecs).padStart(2, '0');
  const xx = String(hundredths).padStart(2, '0');
  return `[${mm}:${ss}.${xx}]`;
}

function parseEditableLyricLines(rawText) {
  if (typeof rawText !== 'string' || !rawText.trim()) return [];
  const lines = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const out = [];
  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    // Skip LRC metadata tags like [ar:...], [ti:...], [offset:...]
    if (/^\[[a-zA-Z]+:[^\]]*\]$/.test(trimmed)) continue;

    const lrcMatch = trimmed.match(/^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]\s*(.*)$/);
    if (lrcMatch) {
      const mins = Number(lrcMatch[1]) || 0;
      const secs = Number(lrcMatch[2]) || 0;
      const fracRaw = lrcMatch[3] || '0';
      const frac = fracRaw.length === 3 ? Number(fracRaw) / 1000 : fracRaw.length === 1 ? Number(fracRaw) / 10 : Number(fracRaw) / 100;
      const text = (lrcMatch[4] || '').replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').replace(/\s+/g, ' ').trim();
      if (text) {
        out.push({ text, timeSec: Math.round((mins * 60 + secs + frac) * 100) / 100 });
      }
    } else {
      const clean = trimmed.replace(/<\d{1,3}:\d{2}(?:[.:]\d{1,3})?>/g, '').replace(/\s+/g, ' ').trim();
      if (clean) {
        out.push({ text: clean, timeSec: null });
      }
    }
  }
  return out;
}

function createTapSyncSession(initialInput) {
  const parsed = Array.isArray(initialInput)
    ? initialInput.map((item) => ({
        text: String(item?.text || '').trim(),
        timeSec: Number.isFinite(Number(item?.timeSec)) ? Math.max(0, Number(item.timeSec)) : null
      })).filter((item) => item.text.length > 0)
    : parseEditableLyricLines(String(initialInput || ''));

  let activeIndex = 0;
  const undoStack = [];

  // Snapshot every timestamp so Undo can revert tap, nudge and re-anchor alike (#244)
  function pushUndoSnapshot() {
    undoStack.push({ activeIndex, times: parsed.map((l) => l.timeSec) });
    if (undoStack.length > 200) undoStack.shift();
  }

  function tapCurrentLine(songTimeSec) {
    if (activeIndex < 0 || activeIndex >= parsed.length) {
      return { stamped: false, activeIndex, line: null };
    }
    pushUndoSnapshot();
    const stampedTime = Math.max(0, Math.round((Number(songTimeSec) || 0) * 100) / 100);
    parsed[activeIndex].timeSec = stampedTime;
    const stampedIndex = activeIndex;
    if (activeIndex < parsed.length) {
      activeIndex += 1;
    }
    return {
      stamped: true,
      stampedIndex,
      stampedTime,
      activeIndex,
      completed: activeIndex >= parsed.length
    };
  }

  function undoLastTap() {
    if (undoStack.length === 0) return false;
    const last = undoStack.pop();
    if (!Array.isArray(last.times) || last.times.length !== parsed.length) return false;
    for (let i = 0; i < parsed.length; i++) {
      parsed[i].timeSec = last.times[i];
    }
    activeIndex = Math.max(0, Math.min(Math.max(0, parsed.length - 1), last.activeIndex));
    return true;
  }

  function setActiveIndex(idx) {
    if (parsed.length === 0) {
      activeIndex = 0;
      return 0;
    }
    activeIndex = Math.max(0, Math.min(parsed.length - 1, Math.floor(Number(idx) || 0)));
    return activeIndex;
  }

  function nudgeLine(index, deltaSec) {
    if (index < 0 || index >= parsed.length) return null;
    pushUndoSnapshot();
    const base = parsed[index].timeSec !== null ? parsed[index].timeSec : 0;
    const next = Math.max(0, Math.round((base + (Number(deltaSec) || 0)) * 100) / 100);
    parsed[index].timeSec = next;
    return next;
  }

  function reanchorFromLine(index, newTimeSec) {
    if (index < 0 || index >= parsed.length) return 0;
    pushUndoSnapshot();
    const targetTime = Math.max(0, Math.round((Number(newTimeSec) || 0) * 100) / 100);
    const oldTime = parsed[index].timeSec;
    if (oldTime === null) {
      parsed[index].timeSec = targetTime;
      return 1;
    }
    const delta = targetTime - oldTime;
    let shifted = 0;
    for (let i = index; i < parsed.length; i++) {
      if (parsed[i].timeSec !== null) {
        parsed[i].timeSec = Math.max(0, Math.round((parsed[i].timeSec + delta) * 100) / 100);
        shifted += 1;
      }
    }
    return shifted;
  }

  function serializeToLrc() {
    const out = [];
    for (const item of parsed) {
      if (item.timeSec !== null) {
        out.push(`${formatTapSyncTimestamp(item.timeSec)} ${item.text}`);
      } else {
        out.push(item.text);
      }
    }
    return out.join('\n');
  }

  function getState() {
    return {
      lines: parsed.map((l, idx) => ({ ...l, index: idx })),
      activeIndex,
      totalLines: parsed.length,
      stampedCount: parsed.filter((l) => l.timeSec !== null).length,
      canUndo: undoStack.length > 0
    };
  }

  return {
    tapCurrentLine,
    undoLastTap,
    setActiveIndex,
    nudgeLine,
    reanchorFromLine,
    serializeToLrc,
    getState
  };
}

const api = {
  formatTapSyncTimestamp,
  parseEditableLyricLines,
  createTapSyncSession
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = api;
}
if (typeof window !== 'undefined') {
  window.CollegeLyricsSyncEditor = api;
}
