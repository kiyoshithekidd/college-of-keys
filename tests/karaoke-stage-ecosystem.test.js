'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  decodeTxtChartBuffer,
  parseTxtVocalChart,
  inspectTxtVocalChartBuffer,
  buildVocalChartFromTxt
} = require('../txt-vocal-chart.js');
const {
  clampKaraokeKeyShift,
  formatKeyShiftLabel,
  createKaraokePitchShiftBus
} = require('../karaoke-pitch-shift.js');
const {
  createVocalSessionScorer
} = require('../spell-singing.js');

test('#172 parseTxtVocalChart handles CRLF, comma BPM, #RELATIVE:YES, Radiant (*), Rap (F/G), and Windows-1252 accents', () => {
  // Windows-1252 buffer with "Café" (0xe9 = é)
  const rawStr = [
    '#TITLE:Caf? Tavern',
    '#ARTIST:Bard Quartet',
    '#BPM:120,0',
    '#GAP:1000',
    '#MP3:cafe_tavern.mp3',
    '#RELATIVE:YES',
    ': 0 4 0 Hel',
    '* 4 4 2 lo ',
    '- 8',
    'F 0 4 0 Yo ',
    'G 4 4 0 Caf?',
    'E'
  ].join('\r\n');

  const bytes = Buffer.from(rawStr, 'latin1');
  // Replace '?' (0x3f) with Windows-1252 é (0xe9)
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x3f) bytes[i] = 0xe9;
  }

  const decoded = decodeTxtChartBuffer(bytes);
  assert.ok(decoded.includes('Café Tavern'), 'Should decode Windows-1252 accented title');

  const meta = inspectTxtVocalChartBuffer(bytes, 'cafe.txt');
  assert.equal(meta.isTxtVocalChart, true);
  assert.equal(meta.title, 'Café Tavern');
  assert.equal(meta.audioFileName, 'cafe_tavern.mp3');
  assert.equal(meta.hasRadiant, true);
  assert.equal(meta.hasRap, true);
  assert.equal(meta.noteCount, 4);

  const parsed = parseTxtVocalChart(bytes);
  const chart = buildVocalChartFromTxt(parsed);
  assert.equal(chart.phrases.length, 2);
  assert.equal(chart.notes[0].time, 1.0); // GAP 1000ms + beat 0
  assert.equal(chart.notes[1].isGolden, true);
  assert.equal(chart.notes[2].isRap, true);
  assert.equal(chart.notes[3].isRap, true);
  assert.equal(chart.notes[3].isGolden, true);
});

test('#172 parseTxtVocalChart separates P1/P2 duet blocks without interleaving', () => {
  const duetTxt = [
    '#TITLE:Duet Ballad',
    '#BPM:120',
    '#GAP:0',
    'P1',
    ': 0 4 0 Lead',
    'P2',
    ': 0 4 7 Harm',
    'E'
  ].join('\n');

  const parsed = parseTxtVocalChart(duetTxt);
  assert.equal(parsed.isDuet, true);
  assert.equal(parsed.voices.P1.length, 1);
  assert.equal(parsed.voices.P2.length, 1);
  assert.equal(parsed.voices.P1[0].lyric, 'Lead');
  assert.equal(parsed.voices.P2[0].lyric, 'Harm');

  const chartP2 = buildVocalChartFromTxt(parsed, { voice: 'P2' });
  assert.equal(chartP2.activeVoice, 'P2');
  assert.equal(chartP2.notes[0].lyric, 'Harm');
});

test('#173 Radiant 2x XP, Rap RMS voice-activity scoring, and Per-Line Rating Pops work accurately', () => {
  const chart = {
    notes: [
      { index: 0, time: 0.0, endTime: 0.5, duration: 0.5, midi: 60, lyric: 'Gold', isGolden: true, isRap: false },
      { index: 1, time: 0.6, endTime: 1.1, duration: 0.5, midi: 60, lyric: 'Rap', isGolden: false, isRap: true }
    ],
    phrases: [
      { index: 0, startTime: 0.0, endTime: 1.1, notes: [], text: 'Gold Rap', minMidi: 60, maxMidi: 60 }
    ]
  };
  chart.phrases[0].notes = chart.notes;

  const scorer = createVocalSessionScorer(chart, { octaveAgnostic: true, rapEnergyGate: 0.02 });
  // Frame 1..3 on Golden note (perfect C4 = 60) -> 2x points (12 * 2 = 24 per frame)
  for (let t = 0.05; t <= 0.45; t += 0.1) {
    scorer.recordFrame(t, { midiFloat: 60.0, rms: 0.1 }, { scoringActive: true });
  }
  assert.equal(scorer.state.vocalScorePoints, 5 * 24);

  // Frame 4..6 on Rap note: no pitch (midiFloat: null), only RMS voice energy!
  for (let t = 0.65; t <= 1.05; t += 0.1) {
    const res = scorer.recordFrame(t, { midiFloat: null, rms: 0.05 }, { scoringActive: true });
    assert.equal(res.inTune, true, 'Rap bar should accept RMS voice activity without pitch');
  }

  // Advance past phrase.endTime + 0.12s -> triggers Per-Line Rating Pop!
  const endRes = scorer.recordFrame(1.25, { midiFloat: null, rms: 0 }, { scoringActive: true });
  assert.ok(endRes.phraseRating, 'Should emit Per-Line Rating Pop after phrase ends');
  assert.equal(endRes.phraseRating.label, 'Perfect!');
  assert.equal(endRes.phraseRating.xpBonus, 20);

  const summary = scorer.getSummary();
  assert.equal(summary.radiantCompletedNotes, 1);
  assert.equal(summary.phraseBonusXp, 20);
  assert.ok(summary.vocalXpEarned >= 28 + 14 + 20);
});

test('#174 clampKaraokeKeyShift, PitchShiftBus, and shifted vocal target scoring stay aligned', () => {
  assert.equal(clampKaraokeKeyShift(-10), -6);
  assert.equal(clampKaraokeKeyShift(10), 6);
  assert.equal(formatKeyShiftLabel(0), '0 st (Orig)');
  assert.equal(formatKeyShiftLabel(3), '+3 st');
  assert.equal(formatKeyShiftLabel(-2), '-2 st');

  const bus = createKaraokePitchShiftBus({});
  assert.equal(bus.setSemitones(4), 4);
  assert.equal(bus.getSemitones(), 4);
  assert.equal(bus.setSemitones(9), 6);
  bus.dispose();

  const chart = {
    notes: [{ index: 0, time: 0.0, endTime: 0.8, duration: 0.8, midi: 60, lyric: 'La' }],
    phrases: [{ index: 0, startTime: 0.0, endTime: 0.8, notes: [], text: 'La', minMidi: 60, maxMidi: 60 }]
  };
  chart.phrases[0].notes = chart.notes;

  const scorer = createVocalSessionScorer(chart, { octaveAgnostic: true, keyShiftSemitones: 3 });
  // Target is C4 (60) + 3 st = Eb4 (63). Singing 63.0 should be 'perfect', singing 60.0 should be 'off'
  const hitShifted = scorer.recordFrame(0.2, { midiFloat: 63.0, rms: 0.1 }, { scoringActive: true });
  assert.equal(hitShifted.inTune, true);
  assert.equal(hitShifted.tier, 'perfect');

  const missOrig = scorer.recordFrame(0.4, { midiFloat: 60.0, rms: 0.1 }, { scoringActive: true });
  assert.equal(missOrig.inTune, false);
});
