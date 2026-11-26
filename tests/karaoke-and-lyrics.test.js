const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  cleanSongQueryFromTitle,
  formatLrcTimestamp,
  convertLrclibLyricsfileToEnhancedLrc,
  parseEnhancedLrcText,
  selectBestLrclibCandidate
} = require('../lyrics-fetcher');

const {
  parseLrcText,
  computeAutoAlignLyricsOffset,
  simplifyVocalNotesForSinging,
  buildVocalChart,
  createVocalSessionScorer
} = require('../spell-singing');

const {
  DEFAULT_LEAD_VOCAL_VOLUME,
  createDefaultVocalMix,
  normalizeVocalMix,
  clampLyricsOffsetSec,
  computeVocalMixMatrixGains,
  createMidSideVocalProcessor
} = require('../vocal-harmony-dsp');

const {
  resolveBundleForSong,
  saveBundleRecord,
  loadBundlesStore
} = require('../song-bundle');

test('Issue #159: cleanSongQueryFromTitle strips YouTube prefix, tags & channel pipes', () => {
  const res = cleanSongQueryFromTitle('YouTube John Legend - All of Me (Official Video) | VEVO.mid');
  assert.equal(res.artist, 'John Legend');
  assert.equal(res.track, 'All of Me');
  assert.equal(res.query, 'John Legend All of Me');
  assert.equal(formatLrcTimestamp(9.999), '00:10.00');
});

test('Issue #159: convertLrclibLyricsfileToEnhancedLrc & parseEnhancedLrcText parse word timestamps', () => {
  const yaml = `
version: '1.0'
lines:
  - startTime: 10000
    endTime: 12000
    words:
      - text: "What"
        startTime: 10000
        endTime: 10400
      - text: "would"
        startTime: 10500
        endTime: 10900
      - text: "I"
        startTime: 11000
        endTime: 11400
`;
  const enhanced = convertLrclibLyricsfileToEnhancedLrc(yaml);
  assert.ok(enhanced && enhanced.includes('[00:10.00]'));
  assert.ok(enhanced.includes('<00:10.50> would'));

  const parsed = parseEnhancedLrcText(enhanced, 1.5);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].time, 11.5);
  assert.equal(parsed[0].words.length, 3);
  assert.equal(parsed[0].words[1].text, 'would');
  assert.equal(parsed[0].words[1].startTime, 12.0);
});

test('Issue #159: selectBestLrclibCandidate prefers word-sync & ±5s duration match', () => {
  const best = selectBestLrclibCandidate(
    [
      { trackName: 'All of Me', artistName: 'John Legend', duration: 270, syncedLyrics: '[00:10.00] Line' },
      { trackName: 'All of Me', artistName: 'John Legend', duration: 269, hasWordSync: true, lyricsfile: 'lines: []', syncedLyrics: '[00:10.00] Line' }
    ],
    { artist: 'John Legend', track: 'All of Me', durationSec: 269 }
  );
  assert.equal(best.hasWordSync, true);
});

test('Issue #159: buildVocalChart leaves zero Solfege clutter when real lyrics exist and honors lyricsOffsetSec', () => {
  const notes = [
    { time: 10.0, duration: 0.4, midi: 64 },
    { time: 10.5, duration: 0.4, midi: 66 },
    { time: 11.0, duration: 0.4, midi: 68 },
    { time: 11.5, duration: 0.4, midi: 69 }
  ];
  const lrc = parseLrcText('[00:05.00] All of me');
  const offset = computeAutoAlignLyricsOffset(notes, lrc);
  assert.equal(offset, 5.0);

  const chart = buildVocalChart({
    vocalNotes: notes,
    lrcLines: lrc,
    lyricsOffsetSec: offset
  });
  assert.equal(chart.lyricSource, 'lrc');
  assert.equal(chart.phrases.length, 1);
  assert.equal(chart.phrases[0].text, 'All of me');
  assert.equal(chart.phrases[0].startTime, 10.0);
  assert.ok(chart.phrases[0].words.length === 3);
  // No Solfege words leaked onto melisma notes
  assert.ok(chart.notes.every((n) => !['Do', 'Di', 'Re', 'Ri', 'Mi', 'Fa', 'Fi', 'Sol', 'Si', 'La', 'Li', 'Ti'].includes(n.lyric)));
});

test('Issue #160: simplifyVocalNotesForSinging absorbs vibrato, merges micro-gaps, flags Bezier slides & maintains combo across slides', () => {
  const raw = [
    { time: 1.0, duration: 0.35, endTime: 1.35, midi: 64 },
    // ±1 semitone 90ms vibrato flicker returning to 64
    { time: 1.37, duration: 0.09, endTime: 1.46, midi: 65 },
    { time: 1.48, duration: 0.30, endTime: 1.78, midi: 64 },
    // Legato slide up to 67 (+3 semitones, 60ms gap)
    { time: 1.84, duration: 0.40, endTime: 2.24, midi: 67 }
  ];
  const simplified = simplifyVocalNotesForSinging(raw);
  assert.equal(simplified.length, 2);
  assert.equal(simplified[0].midi, 64);
  assert.ok(simplified[0].endTime >= 1.77);
  assert.equal(simplified[0].slideToNext, true);
  assert.equal(simplified[1].midi, 67);

  // Scorer interpolates pitch smoothly across the glide gap (1.78..1.84) and preserves combo
  const scorer = createVocalSessionScorer({ notes: simplified, phrases: [] });
  const midTarget = scorer.findTargetNoteAtTime(1.81);
  assert.ok(midTarget && midTarget.isGlideBridge);
  assert.ok(midTarget.midi > 64.5 && midTarget.midi < 66.5);

  scorer.recordFrame(1.5, { midiFloat: 64.0, rms: 0.2 }, { scoringActive: true });
  const bridgeFrame = scorer.recordFrame(1.81, { midiFloat: 65.5, rms: 0.2 }, { scoringActive: true });
  assert.equal(bridgeFrame.inTune, true);
  assert.equal(scorer.state.vocalCombo, 2);
});

test('Issue #161: vocalMix defaults to 25% Guide Vocal + Harmonies ON, computes Mid/Side gains & resumes suspended AudioContext', () => {
  const def = createDefaultVocalMix();
  assert.equal(def.leadVolume, DEFAULT_LEAD_VOCAL_VOLUME);
  assert.equal(def.leadVolume, 0.25);
  assert.equal(def.harmoniesEnabled, true);
  assert.deepEqual(normalizeVocalMix({ leadVolume: 2, harmoniesEnabled: false }), { leadVolume: 1, harmoniesEnabled: false });
  assert.equal(clampLyricsOffsetSec(-45), -30);

  const guideWithHarm = computeVocalMixMatrixGains({
    leadVolume: 0.25,
    harmoniesEnabled: true,
    masterVolume: 0.8,
    backingBandEnabled: true,
    vocalStemAudible: true
  });
  assert.equal(guideWithHarm.midGain, 0.2);
  assert.equal(guideWithHarm.sideGain, 0.8);

  const mutedAll = computeVocalMixMatrixGains({
    leadVolume: 0,
    harmoniesEnabled: false,
    masterVolume: 0.8,
    backingBandEnabled: true,
    vocalStemAudible: true
  });
  assert.equal(mutedAll.midGain, 0);
  assert.equal(mutedAll.sideGain, 0);

  // Mock Web Audio context verifying explicit 2-channel speakers upmix + resume guard
  let resumed = false;
  const createdGains = [];
  const mockNode = () => ({
    gain: { value: 1, setTargetAtTime(v) { this.value = v; } },
    connect() {},
    disconnect() {}
  });
  const mockCtx = {
    state: 'suspended',
    currentTime: 0,
    destination: {},
    resume() {
      resumed = true;
      this.state = 'running';
      return Promise.resolve();
    },
    createMediaElementSource: () => mockNode(),
    createChannelSplitter: () => mockNode(),
    createChannelMerger: () => mockNode(),
    createGain: () => {
      const g = mockNode();
      createdGains.push(g);
      return g;
    }
  };
  const proc = createMidSideVocalProcessor(mockCtx, {});
  assert.ok(proc);
  assert.equal(createdGains[0].channelCount, 2);
  assert.equal(createdGains[0].channelInterpretation, 'speakers');
  proc.updateGains(0.25, 1.0);
  assert.equal(resumed, true);
  proc.disconnect();
});

test('Issue #159 & #161: song-bundle persists vocalMix, lyricsOffsetSec, and optional AI vocal sub-stems', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cok-bundle-'));
  try {
    const storePath = path.join(tmpDir, 'grimoire_bundles.json');
    const midPath = path.join(tmpDir, 'All_of_Me.mid');
    const stemsDir = path.join(tmpDir, 'All_of_Me_stems');
    fs.writeFileSync(midPath, 'MThd');
    fs.mkdirSync(stemsDir);
    fs.writeFileSync(path.join(stemsDir, 'vocals.wav'), 'RIFF');
    fs.writeFileSync(path.join(stemsDir, 'vocals_lead.wav'), 'RIFF');
    fs.writeFileSync(path.join(stemsDir, 'vocals_backing.wav'), 'RIFF');

    saveBundleRecord({
      storePath,
      projectRoot: tmpDir,
      record: {
        songId: 'all-of-me',
        notesPath: midPath,
        vocalMix: { leadVolume: 0.15, harmoniesEnabled: false },
        lyricsOffsetSec: 2.4
      }
    });

    const store = loadBundlesStore(storePath);
    const resolved = resolveBundleForSong({ filePath: midPath, songId: 'all-of-me', store, projectRoot: tmpDir });
    assert.deepEqual(resolved.vocalMix, { leadVolume: 0.15, harmoniesEnabled: false });
    assert.equal(resolved.lyricsOffsetSec, 2.4);
    assert.ok(resolved.stems.vocals_lead.endsWith('vocals_lead.wav'));
    assert.ok(resolved.stems.vocals_backing.endsWith('vocals_backing.wav'));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
