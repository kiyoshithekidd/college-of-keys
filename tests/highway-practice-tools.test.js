'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampHighwayScrollSpeed,
  computeHighwayLookaheadSec,
  computeHighwayPxPerSec,
  parseKeySpecForDegrees,
  formatFallingNoteLabel,
  extractSustainPedalSpans,
  classifyTimingErrorMs,
  computeTimingSummary,
  computeCountInDurationSec,
  findMetronomeClicksInWindow,
  extractTimelineSectionMarkers
} = require('../highway-practice-tools');

test('#182 highway scroll speed is clamped and resolution-independent', () => {
  assert.equal(clampHighwayScrollSpeed(0.1), 0.5);
  assert.equal(clampHighwayScrollSpeed(3.9), 2.5);
  assert.equal(clampHighwayScrollSpeed(1.24), 1.2);
  assert.equal(computeHighwayLookaheadSec(2.0), 1.0);

  // 1080p vs 4K highway heights yield the exact same visible lookahead time
  const px1080 = computeHighwayPxPerSec(500, 1.5);
  const px4k = computeHighwayPxPerSec(1000, 1.5);
  assert.equal(Math.round((500 / px1080) * 1000), Math.round((1000 / px4k) * 1000));
});

test('#179 falling note labels support off, notes, and transposed scale degrees', () => {
  const c4 = { foldedName: 'C4', foldedMidi: 60 };
  const fSharp4 = { foldedName: 'F#4', foldedMidi: 66 };
  assert.equal(formatFallingNoteLabel(c4, 'off', 0, false), '');
  assert.equal(formatFallingNoteLabel(c4, 'notes', 0, false), 'C4');

  const gMajor = parseKeySpecForDegrees('G');
  assert.equal(gMajor.tonicPc, 7);
  assert.equal(gMajor.isMinor, false);
  assert.equal(formatFallingNoteLabel(fSharp4, 'degrees', gMajor.tonicPc, gMajor.isMinor), '7');

  const aMinor = parseKeySpecForDegrees('Am');
  assert.equal(aMinor.tonicPc, 9);
  assert.equal(aMinor.isMinor, true);
  assert.equal(formatFallingNoteLabel(c4, 'degrees', aMinor.tonicPc, aMinor.isMinor), '3');
});

test('#179 extractSustainPedalSpans merges CC 64 across tracks, closes EOF, drops glitches', () => {
  const tracks = [
    {
      channel: 0,
      controlChanges: {
        64: [
          { time: 1.0, value: 1.0 },
          { time: 1.02, value: 0.0 }, // 20ms glitch -> dropped
          { time: 2.0, value: 0.8 },
          { time: 4.5, value: 0.0 }
        ]
      }
    },
    {
      channel: 1,
      controlChanges: {
        64: [{ time: 8.0, value: 1.0 }] // open at EOF -> closed at 10.0
      }
    },
    {
      channel: 9, // drums ignored
      controlChanges: {
        64: [{ time: 0.5, value: 1.0 }]
      }
    }
  ];
  const spans = extractSustainPedalSpans(tracks, 10.0);
  assert.deepEqual(spans, [
    { startTime: 2.0, endTime: 4.5 },
    { startTime: 8.0, endTime: 10.0 }
  ]);
});

test('#181 timing error classification and scatter summary', () => {
  assert.equal(classifyTimingErrorMs(-20), 'perfect');
  assert.equal(classifyTimingErrorMs(70), 'great');
  assert.equal(classifyTimingErrorMs(-140), 'good');
  assert.equal(classifyTimingErrorMs(190), 'miss');

  const summary = computeTimingSummary([-80, -10, 0, 15, 95]);
  assert.equal(summary.count, 5);
  assert.equal(summary.meanMs, 4);
  assert.equal(summary.earlyCount, 1);
  assert.equal(summary.onTimeCount, 3);
  assert.equal(summary.lateCount, 1);
  assert.equal(summary.within45Pct, 60);
  assert.equal(summary.buckets.reduce((a, b) => a + b, 0), 5);
});

test('#183 count-in metronome beat detection & section jump markers', () => {
  const dur = computeCountInDurationSec(120, 4);
  assert.equal(dur, 2.0);

  // Across -2.0s -> 0.01s at 120 BPM (0.5s/beat), should fire beats -4, -3, -2, -1 (only -4 accented)
  const clicks = findMetronomeClicksInWindow(-2.05, -0.01, {
    bpm: 120,
    beatsPerMeasure: 4,
    countInEnabled: true,
    clickEnabled: false,
    leadInSec: dur
  });
  assert.equal(clicks.length, 4);
  assert.equal(clicks[0].isAccent, true);
  assert.equal(clicks[1].isAccent, false);

  // MIDI markers preferred over measure fallback
  const midiMarkers = extractTimelineSectionMarkers({
    headerMeta: [
      { type: 'marker', text: 'Intro', ticks: 0 },
      { type: 'marker', text: 'Chorus', ticks: 4800 }
    ],
    ticksToSeconds: (t) => t / 480,
    measures: [],
    durationSec: 30
  });
  assert.deepEqual(midiMarkers.map((m) => m.label), ['Intro', 'Chorus']);

  // Measure fallback when no MIDI markers exist
  const measures = Array.from({ length: 20 }, (_, i) => ({ startTime: i * 2 }));
  const fallbackMarkers = extractTimelineSectionMarkers({
    headerMeta: [],
    measures,
    durationSec: 40
  });
  assert.deepEqual(fallbackMarkers.map((m) => m.label), ['Bar 9', 'Bar 17']);
});
