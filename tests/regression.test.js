/**
 * College of Keys — Unit & Headless Electron Regression Test Suite (Issue #133)
 * Exercises all core JS modules and the real Electron BrowserWindow renderer:
 *  - Unit modules: bard-achievements, bard-campaign, bard-colleges, guild-tutorial,
 *    tavern-setlists, omr-confidence, midi-hygiene, musicxml-converter, song-bundle,
 *    notation-engine, instrument-input, spell-singing
 *  - Renderer DOM & interactive checks: 61-key piano, Spell Highway, VexFlow,
 *    Quest Board arrangement mode (#123), 6-stem mixer (#41), Plug-In External Rig (#42),
 *    Spell-Singing Karaoke Mode (#43/#124-#127), paused scoring & backward scrub (#128),
 *    modal keyboard guards & Escape (#129), custom lyrics persistence (#130),
 *    and Bardic Annals vocal stats (#132).
 */
const { app, BrowserWindow, session, ipcMain } = require('electron');
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.resolve(__dirname, '..');

// Allow software WebGL under headless Xvfb
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-webgl');

ipcMain.handle('open-folder-in-explorer', async (_event, targetDir) => {
  if (!targetDir || typeof targetDir !== 'string') {
    return { ok: false, error: 'Missing target folder path.' };
  }
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  return { ok: true, verifiedPath: path.resolve(targetDir) };
});

async function runUnitTests() {
  const results = [];
  const record = (name, fn) => {
    try {
      fn();
      results.push({ name, ok: true });
    } catch (err) {
      results.push({ name, ok: false, error: err.stack || err.message });
    }
  };

  record('Electron runtime version is 45.x', () => {
    assert.ok(process.versions.electron.startsWith('45.'), `Expected 45.x, got ${process.versions.electron}`);
  });

  record('bard-achievements module', () => {
    const mod = require(path.join(REPO_ROOT, 'bard-achievements.js'));
    const evalRes = mod.evaluateAchievements({ songsCompleted: 1, rolledFace: 20, accuracyPct: 100, totalAttempts: 12 }, {});
    assert.ok(evalRes.newlyUnlocked.length >= 3);
    assert.ok(evalRes.totalBonusXp > 0);
    const summary = mod.getAchievementSummary(evalRes.nextUnlockedMap);
    assert.strictEqual(summary.unlockedCount, evalRes.newlyUnlocked.length);
  });

  record('bard-campaign module', () => {
    const mod = require(path.join(REPO_ROOT, 'bard-campaign.js'));
    assert.strictEqual(mod.CAMPAIGN_VENUES.length, 4);
    assert.strictEqual(mod.isVenueUnlocked('street-corner', {}), true);
    assert.strictEqual(mod.isVenueUnlocked('silver-flagon', {}), false);
    const check = mod.evaluateVenueCheck('street-corner', 15, {});
    assert.strictEqual(check.passed, true);
    assert.strictEqual(check.firstClear, true);
    assert.strictEqual(mod.isVenueUnlocked('silver-flagon', check.nextProgress), true);
  });

  record('bard-colleges module', () => {
    const mod = require(path.join(REPO_ROOT, 'bard-colleges.js'));
    assert.strictEqual(mod.BARD_COLLEGES.length, 3);
    const prog = { enrolledCollegeId: 'lore', completedDrills: {}, collegeSongsCompleted: { lore: 0 } };
    const res = mod.evaluateCollegeProgress({ songCompleted: true, waitMode: true, accuracyPct: 90 }, prog);
    assert.strictEqual(res.nextProgress.collegeSongsCompleted.lore, 1);
    assert.ok(res.newlyCompletedDrills.some((d) => d.id === 'lore-wait-practice'));
  });

  record('guild-tutorial module', () => {
    const mod = require(path.join(REPO_ROOT, 'guild-tutorial.js'));
    let st = mod.createTutorialState();
    st = mod.advanceTutorialState(st, { type: 'start' });
    assert.strictEqual(st.active, true);
    st = mod.advanceTutorialState(st, { type: 'playback-started' });
    assert.strictEqual(st.stepIndex, 1);
    st = mod.advanceTutorialState(st, { type: 'note-hit', noteCount: 4, maxChain: 4 });
    assert.strictEqual(st.stepIndex, 2);
    st = mod.advanceTutorialState(st, { type: 'note-hit', noteCount: 2, maxChain: 6 });
    assert.strictEqual(st.stepIndex, 3);
    st = mod.advanceTutorialState(st, { type: 'song-completed' });
    assert.strictEqual(st.completed, true);
  });

  record('tavern-setlists module', () => {
    const mod = require(path.join(REPO_ROOT, 'tavern-setlists.js'));
    assert.strictEqual(mod.getCrowdMoodForEnergy(85).id, 'enchanted');
    assert.strictEqual(mod.getCrowdMoodForEnergy(10).id, 'asleep');
    const rec = mod.createSetlistRecord('Tavern Night', [{ title: 'Song A', filePath: 'BUILTIN_DEMO' }]);
    assert.strictEqual(rec.items.length, 1);
  });

  record('omr-confidence module', () => {
    const mod = require(path.join(REPO_ROOT, 'omr-confidence.js'));
    assert.strictEqual(mod.isOmrSheetFileName('score.pdf'), true);
    assert.strictEqual(mod.isOmrSheetFileName('song.mid'), false);
    const updatedXml = mod.applyOmrOverridesToMusicXml('<score-partwise><measure number="1"></measure></score-partwise>', {
      title: 'Tavern Jig',
      bpm: 132
    });
    assert.ok(updatedXml.includes('<work-title>Tavern Jig</work-title>'));
    assert.ok(updatedXml.includes('tempo="132"'));
  });

  record('Issue #123 buildFullSongArrangement separates RH melody and LH chords cleanly', () => {
    const { buildFullSongArrangement } = require(path.join(REPO_ROOT, 'midi-hygiene.js'));
    const noisyMix = [
      { midi: 76, time: 0.0, duration: 0.45, velocity: 102 },
      { midi: 64, time: 0.01, duration: 0.4, velocity: 75 },
      { midi: 60, time: 0.02, duration: 0.4, velocity: 72 },
      { midi: 36, time: 0.0, duration: 0.9, velocity: 90 },
      { midi: 38, time: 0.01, duration: 0.2, velocity: 65 },
      { midi: 43, time: 0.03, duration: 0.8, velocity: 82 },
      { midi: 79, time: 0.5, duration: 0.45, velocity: 104 },
      { midi: 67, time: 0.51, duration: 0.35, velocity: 70 }
    ];
    const arranged = buildFullSongArrangement(noisyMix, 120);
    assert.strictEqual(arranged.rhNotes.length, 2);
    assert.ok(arranged.rhNotes.every((n) => n.midi >= 60));
    assert.ok(arranged.lhNotes.length >= 1 && arranged.lhNotes.length <= 2);
    assert.ok(arranged.lhNotes.every((n) => n.midi >= 36 && n.midi < 60));
  });

  record('Issue #41 6-stem bundle resolution & Mute/Solo mix state helpers', () => {
    const bundle = require(path.join(REPO_ROOT, 'song-bundle.js'));
    assert.deepStrictEqual(bundle.STEM_NAMES, ['piano', 'drums', 'bass', 'vocals', 'guitar', 'other']);
    const defaultMix = bundle.createDefaultStemMix();
    assert.strictEqual(defaultMix.piano.muted, true);
    assert.strictEqual(defaultMix.drums.muted, false);
    const soloVocalsMix = bundle.normalizeStemMix({
      ...defaultMix,
      vocals: { muted: false, solo: true }
    });
    assert.strictEqual(bundle.isStemAudibleInMix('vocals', soloVocalsMix), true);
    assert.strictEqual(bundle.isStemAudibleInMix('drums', soloVocalsMix), false);
  });

  record('Issue #42 Multi-Instrument Highways & Plug-In External Input', () => {
    const hygiene = require(path.join(REPO_ROOT, 'midi-hygiene.js'));
    const instInput = require(path.join(REPO_ROOT, 'instrument-input.js'));
    assert.strictEqual(instInput.translateGmDrumMidiToHighwayLane(36), 48);
    assert.strictEqual(instInput.translateGmDrumMidiToHighwayLane(38), 50);
    assert.strictEqual(instInput.translateGmDrumMidiToHighwayLane(42), 60);
    assert.strictEqual(instInput.foldInstrumentMidiForHighway(28, 'bass'), 40);

    const sr = 44100;
    const bufA2 = new Float32Array(2048);
    for (let i = 0; i < bufA2.length; i++) bufA2[i] = 0.5 * Math.sin((2 * Math.PI * 110 * i) / sr);
    const pitchRes = instInput.detectPitchFromFloat32Buffer(bufA2, sr);
    assert.ok(pitchRes && pitchRes.midi === 45 && pitchRes.noteName === 'A2');

    const kickBuf = new Float32Array(1024);
    for (let i = 0; i < kickBuf.length; i++) kickBuf[i] = 0.6 * Math.sin((2 * Math.PI * 80 * i) / sr);
    const kickHit = instInput.classifyAcousticDrumHitFromBuffer(kickBuf, sr);
    assert.ok(kickHit && kickHit.laneMidi === 48);

    const sampleTracks = [
      { index: 0, name: 'Stem: Drums', channel: 9, isPercussion: true, notes: [{ midi: 36, time: 0, duration: 0.15, velocity: 100 }, { midi: 38, time: 0.5, duration: 0.15, velocity: 95 }] }
    ];
    const drumHighway = hygiene.mapInstrumentHighwayNotes(sampleTracks, 'drums', 120);
    assert.ok(drumHighway.track2Raw.some((n) => n.midi === 48));
    assert.ok(drumHighway.track2Raw.some((n) => n.midi === 50));
  });

  record('Issue #124 Plug-In Instrument Auto-Routing & Mic/Headphone Bleed Guard', () => {
    const instInput = require(path.join(REPO_ROOT, 'instrument-input.js'));
    assert.ok(instInput.INPUT_SOURCE_MODES.some((m) => m.id === 'vocal-mic'));
    const vocalRec = instInput.getRecommendedHighwayForInputMode('vocal-mic');
    assert.strictEqual(vocalRec.instrumentId, 'vocals');
    assert.strictEqual(vocalRec.stageViewMode, 'karaoke');

    const noMic = instInput.assessMicAndBleedGuard([]);
    assert.strictEqual(noMic.noMicWarning, true);

    const builtIn = instInput.assessMicAndBleedGuard([
      { kind: 'audioinput', deviceId: 'd1', label: 'MacBook Built-in Microphone' },
      { kind: 'audiooutput', deviceId: 'o1', label: 'Built-in Speakers' }
    ]);
    assert.strictEqual(builtIn.bleedWarning, true);

    const headset = instInput.assessMicAndBleedGuard([
      { kind: 'audioinput', deviceId: 'd2', label: 'Blue Yeti USB Mic' },
      { kind: 'audiooutput', deviceId: 'o2', label: 'AirPods Pro Headphones' }
    ]);
    assert.strictEqual(headset.bleedWarning, false);
  });

  record('Issue #125 MusicXML Lyric Extraction, .LRC Parser & Vocal Chart Builder', () => {
    const xmlConv = require(path.join(REPO_ROOT, 'musicxml-converter.js'));
    const spellSing = require(path.join(REPO_ROOT, 'spell-singing.js'));
    const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
      <score-partwise version="3.1">
        <part-list><score-part id="P1"><part-name>Voice</part-name></score-part></part-list>
        <part id="P1">
          <measure number="1">
            <attributes><divisions>1</divisions><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
            <direction><sound tempo="120"/></direction>
            <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><lyric number="1"><syllabic>begin</syllabic><text>Hel</text></lyric></note>
            <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><lyric number="1"><syllabic>end</syllabic><text>lo</text></lyric></note>
            <note><pitch><step>G</step><octave>4</octave></pitch><duration>2</duration><lyric number="1"><syllabic>single</syllabic><text>world</text></lyric></note>
          </measure>
        </part>
      </score-partwise>`;
    const converted = xmlConv.convertMusicXmlToMidiBuffer(Buffer.from(sampleXml, 'utf8'), 'test.musicxml');
    assert.strictEqual(converted.metadata.lyrics.length, 3);
    const lrcLines = spellSing.parseLrcText('[00:01.50]Hello world\n[00:04.00]Sing along');
    assert.strictEqual(lrcLines.length, 2);
    const chart = spellSing.buildVocalChart({
      vocalNotes: [
        { midi: 60, time: 0.0, duration: 0.5 },
        { midi: 64, time: 0.5, duration: 0.5 },
        { midi: 67, time: 1.0, duration: 1.0 }
      ],
      musicXmlLyrics: converted.metadata.lyrics
    });
    assert.strictEqual(chart.lyricSource, 'musicxml');
    assert.strictEqual(chart.notes[0].lyric, 'Hel');
  });

  record('Issue #127 & #128 Octave-Agnostic Vocal Scoring, Paused Guard & Backward Scrub Pruning', () => {
    const spellSing = require(path.join(REPO_ROOT, 'spell-singing.js'));
    assert.strictEqual(spellSing.calcVocalPitchDistance(57, 69, { octaveAgnostic: true }).absSemitones, 0);
    assert.strictEqual(spellSing.calcVocalPitchDistance(57, 69, { octaveAgnostic: false }).absSemitones, 12);

    const chart = spellSing.buildVocalChart({
      vocalNotes: [{ midi: 69, time: 0.0, duration: 1.0 }]
    });
    const scorer = spellSing.createVocalSessionScorer(chart, { octaveAgnostic: true });

    // Issue #128: Paused frames (scoringActive: false) must NOT increment totalScoredFrames or pitchTrail
    scorer.recordFrame(0.2, null, { scoringActive: false });
    scorer.recordFrame(0.2, { midiFloat: 57.0, rms: 0.15 }, { scoringActive: false });
    assert.strictEqual(scorer.state.totalScoredFrames, 0, 'Paused frames must not penalize totalScoredFrames');
    assert.strictEqual(scorer.state.pitchTrail.length, 0, 'Paused frames must not pollute pitchTrail');
    assert.ok(scorer.state.activePitch, 'Paused frames should still update live activePitch orb');

    // Playing frames
    for (let t = 0.05; t <= 0.45; t += 0.05) {
      scorer.recordFrame(t, { midiFloat: 57.0, rms: 0.15 }, { scoringActive: true });
    }
    scorer.recordFrame(0.50, null, { scoringActive: true });
    for (let t = 0.55; t <= 0.90; t += 0.05) {
      scorer.recordFrame(t, { midiFloat: 57.1, rms: 0.15 }, { scoringActive: true });
    }
    const summary = scorer.getSummary();
    assert.ok(summary.accuracyPct >= 85);
    assert.ok(summary.vocalXpEarned > 0);

    // Issue #128: Scrubbing backward to 0.30s trims future trail points > 0.30s
    scorer.recordFrame(0.30, { midiFloat: 57.0, rms: 0.15 }, { scoringActive: false });
    assert.ok(scorer.state.pitchTrail.every((p) => p.time <= 0.30), 'Backward scrub must prune future pitchTrail points');

    // Issue #135: Backward scrub resets lastInTuneTime so silent frames do NOT earn completion credit
    const scrubChart = spellSing.buildVocalChart({
      vocalNotes: [
        { midi: 69, time: 0.0, duration: 1.0 },
        { midi: 69, time: 10.0, duration: 1.0 }
      ]
    });
    const scrubScorer = spellSing.createVocalSessionScorer(scrubChart, { octaveAgnostic: true });
    scrubScorer.recordFrame(10.2, { midiFloat: 69.0, rms: 0.15 }, { scoringActive: true });
    // Scrub back to 0.2s and stay silent
    scrubScorer.recordFrame(0.2, null, { scoringActive: true });
    assert.strictEqual(scrubChart.notes[0].hitFrames, 0, 'Silent frame after backward scrub must not award hitFrames');

    // Issue #135: Strict tolerance must not return 'perfect'/'great' when inTune is false
    const strictOff = spellSing.calcVocalPitchDistance(60.7, 60, { toleranceSemitones: 0.5 });
    assert.strictEqual(strictOff.inTune, false);
    assert.strictEqual(strictOff.tier, 'off');

    // Issue #135: Adjacent LRC lines must not double-assign notes in 100ms overlap
    const overlapChart = spellSing.buildVocalChart({
      vocalNotes: [
        { midi: 60, time: 0.0, duration: 0.4 },
        { midi: 62, time: 0.9, duration: 0.4 }, // 100ms before line 2 at 1.0s
        { midi: 64, time: 1.1, duration: 0.4 }
      ],
      lrcLines: [
        { time: 0.0, text: 'First line' },
        { time: 1.0, text: 'Second line' }
      ]
    });
    assert.ok(!overlapChart.notes[1].lyric.includes('Second'), 'Note in 100ms overlap must not receive words from both LRC lines');
  });

  record('Issue #136 GM Tom 48/50 mapping & Issue #142 Revelry rowdy mood', () => {
    const instInput = require(path.join(REPO_ROOT, 'instrument-input.js'));
    const hygiene = require(path.join(REPO_ROOT, 'midi-hygiene.js'));
    const colleges = require(path.join(REPO_ROOT, 'bard-colleges.js'));

    // GM Hi-Mid Tom (48) & High Tom (50) -> Tom lane (64)
    assert.strictEqual(instInput.translateGmDrumMidiToHighwayLane(48), 64);
    assert.strictEqual(instInput.translateGmDrumMidiToHighwayLane(50), 64);
    const drumMap = hygiene.mapInstrumentHighwayNotes([
      { index: 0, name: 'Drums', channel: 9, isPercussion: true, notes: [{ midi: 50, time: 0.0, duration: 0.2, velocity: 100 }] }
    ], 'drums', 120);
    assert.ok(drumMap.track1Raw.some((n) => n.midi === 64), 'GM High Tom 50 must map to Tom lane 64 on Drums Highway');

    // College of Revelry 'revelry-crowd' accepts 'rowdy' mood ID
    const rev = colleges.evaluateCollegeProgress({ crowdMoodId: 'rowdy' }, { enrolledCollegeId: 'revelry', completedDrills: {}, collegeSongsCompleted: { revelry: 0 } });
    assert.ok(rev.newlyCompletedDrills.some((d) => d.id === 'revelry-crowd'), 'Rowdy crowd mood must complete revelry-crowd drill');
  });

  record('Issue #134 Notation engine dotted rests, transposed key specs & cache invalidation', () => {
    const notation = require(path.join(REPO_ROOT, 'notation-engine.js'));
    // buildScoreData transposes MusicXML per-measure vfKeySpec and includes transpose in scoreId
    const baseScore = notation.buildScoreData({
      fileName: 'Test.musicxml',
      duration: 4,
      bpm: 120,
      track1Notes: [{ midi: 60, time: 0, duration: 1.5 }],
      track2Notes: [],
      transposeSemitones: 2,
      musicXmlMeta: {
        keySignature: 'C Major',
        measures: [{ index: 0, number: '1', startTicks: 0, endTicks: 1920, numerator: 4, denominator: 4, vfKeySpec: 'C' }]
      }
    });
    assert.strictEqual(baseScore.measures[0].vfKeySpec, 'D', 'Per-measure vfKeySpec must transpose from C by +2 to D');
    assert.ok(baseScore.scoreId.includes(':t2:'), 'scoreId must include transposeSemitones');

    // invalidateMeasure executes cleanly on created renderer
    const renderer = notation.createNotationRenderer();
    renderer.invalidateMeasure(0);
    assert.strictEqual(typeof renderer.invalidateMeasure, 'function');
  });

  record('Issue #140 MusicXML volta pass reset, metronome lookup, whole rests, key sig & staff >= 3', () => {
    const mxml = require(path.join(REPO_ROOT, 'musicxml-converter.js'));
    const { Midi } = require('@tonejs/midi');
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<score-partwise version="3.1">
  <part-list>
    <score-part id="P1"><part-name>Organ</part-name></score-part>
    <score-part id="P2"><part-name>Bb Trumpet</part-name></score-part>
  </part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <staves>3</staves>
      </attributes>
      <direction>
        <direction-type><words>Allegro</words></direction-type>
        <direction-type><metronome><beat-unit>quarter</beat-unit><per-minute>144</per-minute></metronome></direction-type>
      </direction>
      <note><pitch><step>C</step><octave>5</octave></pitch><duration>4</duration><staff>1</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>4</duration><staff>2</staff></note>
      <backup><duration>4</duration></backup>
      <note><pitch><step>C</step><octave>2</octave></pitch><duration>4</duration><staff>3</staff></note>
    </measure>
    <measure number="2">
      <note><rest measure="yes"/></note>
    </measure>
    <measure number="3">
      <note><pitch><step>E</step><octave>5</octave></pitch><duration>4</duration><staff>1</staff></note>
    </measure>
  </part>
  <part id="P2">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>2</fifths><mode>major</mode></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
      </attributes>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>2</duration></note>
    </measure>
    <measure number="2">
      <note><rest measure="yes"/></note>
    </measure>
    <measure number="3">
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>4</duration></note>
    </measure>
  </part>
</score-partwise>`;
    const parsed = mxml.convertMusicXmlToMidiBuffer(Buffer.from(xml, 'utf8'), 'OrganTest.musicxml');
    const midiObj = new Midi(parsed.midiArrayBuffer);
    assert.strictEqual(Math.round(midiObj.header.tempos[0].bpm), 144, 'Metronome in second direction-type must be parsed');
    assert.strictEqual(parsed.metadata.keySignatures[0].fifths, 0, 'Part 1 concert key (C major) must not be overwritten by Part 2');
    assert.ok(midiObj.tracks.some((t) => t.name.includes('Staff 3') && t.notes.length === 1), 'Staff 3 notes must not be dropped');
    const m2 = parsed.metadata.measures[1];
    assert.ok(Math.abs((m2.endTicks - m2.startTicks) - 1920) <= 2, 'Durationless <rest measure="yes"/> must span a full 4/4 bar');
  });

  record('Issue #141 Song bundle leading-dot path, cleared fields & MIDI hygiene track selection', () => {
    const bundle = require(path.join(REPO_ROOT, 'song-bundle.js'));
    const hygiene = require(path.join(REPO_ROOT, 'midi-hygiene.js'));
    const fs = require('fs');
    const os = require('os');

    // Leading '..' filename stays portable
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cok-bundle-'));
    try {
      const dotFile = path.join(tmpDir, '...Ready_For_It.mid');
      fs.writeFileSync(dotFile, '');
      const storePath = path.join(tmpDir, 'bundles.json');
      bundle.saveBundleRecord({
        storePath,
        projectRoot: tmpDir,
        importsDir: tmpDir,
        writeSidecar: true,
        record: { notesPath: dotFile, youtubeUrl: 'https://youtu.be/abc', midiCleanupEnabled: true }
      });
      const store = bundle.loadBundlesStore(storePath);
      assert.ok(Object.prototype.hasOwnProperty.call(store.bundles, '...Ready_For_It.mid'), 'Leading-dot filename must stay portable');

      // Clearing youtubeUrl in store must not revive stale sidecar URL
      const sidecarPath = bundle.getSidecarBundlePath(dotFile);
      const oldSidecar = JSON.parse(fs.readFileSync(sidecarPath, 'utf8'));
      oldSidecar.updatedAt = new Date(Date.now() - 60000).toISOString();
      fs.writeFileSync(sidecarPath, JSON.stringify(oldSidecar, null, 2));
      store.bundles['...Ready_For_It.mid'].youtubeUrl = null;
      store.bundles['...Ready_For_It.mid'].updatedAt = new Date(Date.now() + 1000).toISOString();
      bundle.saveBundlesStore(storePath, store);
      const resolved = bundle.resolveBundleForSong({ filePath: dotFile, store, projectRoot: tmpDir });
      assert.strictEqual(resolved.youtubeUrl, null, 'Explicitly cleared youtubeUrl must not fall back to older sidecar');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    // mapInstrumentHighwayNotes chosenPlayableIndices excludes non-stem GM tracks when stem exists
    const hw = hygiene.mapInstrumentHighwayNotes([
      { index: 0, name: 'Stem: Bass', notes: [{ midi: 40, time: 0, duration: 0.5, velocity: 90 }] },
      { index: 1, name: 'Electric Bass', programNumber: 33, notes: [{ midi: 40, time: 0, duration: 0.5, velocity: 90 }] }
    ], 'bass', 10);
    assert.strictEqual(hw.chosenPlayableIndices.has(0), true);
    assert.strictEqual(hw.chosenPlayableIndices.has(1), false, 'Unselected GM bass track must not be muted when Stem: Bass is chosen');
  });

  record('Issue #139 OMR XML title override preserves $1/$& tokens safely', () => {
    const omr = require(path.join(REPO_ROOT, 'omr-confidence.js'));
    const xml = '<score-partwise version="3.1"><work><work-title>Old</work-title></work><part id="P1"><measure number="1"></measure></part></score-partwise>';
    const out = omr.applyOmrOverridesToMusicXml(xml, { title: '$100 Bill & $& Song', bpm: 112 });
    assert.ok(out.includes('<work-title>$100 Bill &amp; $&amp; Song</work-title>'), 'Special $1/$& tokens in OMR title must be preserved verbatim');
    assert.ok(out.includes('tempo="112"'), 'BPM override must be injected');
  });

  record('Issues #152-#156 Performance & QA bundles: OMR key shift, Revelry peak mood, YIN precomputedRms & stem readdirSync', () => {
    const omr = require(path.join(REPO_ROOT, 'omr-confidence.js'));
    const colleges = require(path.join(REPO_ROOT, 'bard-colleges.js'));
    const instInput = require(path.join(REPO_ROOT, 'instrument-input.js'));
    const bundle = require(path.join(REPO_ROOT, 'song-bundle.js'));
    const fs = require('fs');
    const os = require('os');

    // #154: OMR key signature shift displays vfKeySpec instead of (?) and suppresses identical repeats
    const omrReport = omr.analyzeOmrConfidence(
      {
        measures: [
          { index: 0, number: '1', startTicks: 0, endTicks: 1920, startTime: 0, endTime: 2 },
          { index: 1, number: '2', startTicks: 1920, endTicks: 3840, startTime: 2, endTime: 4 },
          { index: 2, number: '3', startTicks: 3840, endTicks: 5760, startTime: 4, endTime: 6 }
        ],
        keySignatures: [
          { ticks: 0, fifths: 0, mode: 'major', vfKeySpec: 'C' },
          { ticks: 1920, fifths: 0, mode: 'major', vfKeySpec: 'C' },
          { ticks: 3840, fifths: 2, mode: 'major', vfKeySpec: 'D' }
        ],
        timeSignatures: [
          { ticks: 0, timeSignature: [4, 4] },
          { ticks: 1920, timeSignature: [4, 4] }
        ]
      },
      {
        tracks: [
          {
            notes: [
              { midi: 60, time: 0.1, duration: 0.5 },
              { midi: 62, time: 2.1, duration: 0.5 },
              { midi: 64, time: 4.1, duration: 0.5 }
            ]
          }
        ]
      }
    );
    const keyWarnings = omrReport.flaggedMeasures.flatMap((m) => m.reasons).filter((r) => r.includes('Key signature shift'));
    assert.strictEqual(keyWarnings.length, 1, 'Identical key signature repeat must not be flagged');
    assert.ok(keyWarnings[0].includes('(D)'), 'Key signature shift must display actual vfKeySpec (D), not (?)');
    const meterWarnings = omrReport.flaggedMeasures.flatMap((m) => m.reasons).filter((r) => r.includes('Unexpected meter change'));
    assert.strictEqual(meterWarnings.length, 0, 'Identical meter repeat must not be flagged');

    // #156: Revelry crowd drill accepts peakCrowdMoodId
    const revPeak = colleges.evaluateCollegeProgress(
      { crowdMoodId: 'warming', peakCrowdMoodId: 'rowdy' },
      { enrolledCollegeId: 'revelry', completedDrills: {}, collegeSongsCompleted: { revelry: 0 } }
    );
    assert.ok(revPeak.newlyCompletedDrills.some((d) => d.id === 'revelry-crowd'), 'peakCrowdMoodId rowdy must unlock revelry-crowd');

    // #152: YIN pitch detection works with precomputedRms & reused scratch buffer
    const sr = 44100;
    const bufA2 = new Float32Array(2048);
    let sumSq = 0;
    for (let i = 0; i < bufA2.length; i++) {
      const s = 0.5 * Math.sin((2 * Math.PI * 110 * i) / sr);
      bufA2[i] = s;
      sumSq += s * s;
    }
    const rms = Math.sqrt(sumSq / bufA2.length);
    const pitchRes = instInput.detectPitchFromFloat32Buffer(bufA2, sr, { precomputedRms: rms });
    assert.ok(pitchRes && pitchRes.midi === 45 && pitchRes.noteName === 'A2');

    // #155: readdirSync sibling stem discovery
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cok-stems-'));
    try {
      const songPath = path.join(tmpDir, 'Ballad.mid');
      const stemsDir = path.join(tmpDir, 'Ballad_stems');
      fs.writeFileSync(songPath, '');
      fs.mkdirSync(stemsDir);
      fs.writeFileSync(path.join(stemsDir, 'piano.wav'), '');
      fs.writeFileSync(path.join(stemsDir, 'drums.mp3'), '');
      const stems = bundle.findSiblingStemsMap(songPath);
      assert.ok(stems && stems.piano && stems.drums, 'Single-pass readdirSync must discover sibling stems');
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  return results;
}

app.whenReady().then(async () => {
  const managedStoreFiles = ['grimoire_bundles.json', 'song_stats.json', 'bard_profile.json'].map((name) => {
    const filePath = path.join(REPO_ROOT, name);
    const existed = fs.existsSync(filePath);
    const prevContent = existed ? fs.readFileSync(filePath, 'utf8') : null;
    return { filePath, existed, prevContent };
  });
  const cleanupBundleStore = () => {
    for (const store of managedStoreFiles) {
      try {
        if (store.existed) {
          fs.writeFileSync(store.filePath, store.prevContent, 'utf8');
        } else if (fs.existsSync(store.filePath)) {
          fs.unlinkSync(store.filePath);
        }
      } catch {
        // Ignore cleanup errors
      }
    }
  };

  const unitResults = await runUnitTests();
  const rendererErrors = [];

  const ALLOWED_PERMISSIONS = new Set(['midi', 'midiSysex', 'media']);
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => {
    return ALLOWED_PERMISSIONS.has(permission);
  });

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.webContents.on('console-message', (event) => {
    const level = event.level ?? '';
    const message = event.message ?? '';
    const line = event.lineNumber ?? event.line ?? '';
    const sourceId = event.sourceId ?? '';
    if ((level === 'error' || level === 3) && !message.includes('THREE.WebGLRenderer:')) {
      rendererErrors.push(`${message} (${sourceId}:${line})`);
    }
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    rendererErrors.push(`Render process gone: ${JSON.stringify(details)}`);
  });

  await win.loadFile(path.join(REPO_ROOT, 'index.html'));
  await new Promise((r) => setTimeout(r, 2200));

  const domChecks = await win.webContents.executeJavaScript(`
    (async () => {
      const checks = {};
      checks.pianoKeyCount = (Array.isArray(whiteKeys) ? whiteKeys.length : 0) + (Array.isArray(blackKeys) ? blackKeys.length : 0);
      const canvas = document.getElementById('spell-canvas');
      checks.spellCanvasReady = Boolean(canvas && canvas.width > 0 && canvas.height > 0);
      checks.notationRendererReady = Boolean(typeof notationRenderer === 'object' && notationRenderer);

      // Issue #123
      assignSongTracksAndDifficulty('full-song-arrangement');
      checks.arrangedOk = currentSong.track1Notes.length > 0 && currentSong.track2Notes.length > 0;
      assignSongTracksAndDifficulty('auto-piano');

      // Issue #42 Plug-In Rig
      hasEnteredTavernSession = true;
      isTavernMenuVisible = false;
      setExternalInstrumentSourceMode('midi-edrums');
      onMidiMessage({ data: new Uint8Array([0x99, 38, 100]) });
      checks.edrumsSnareTriggeredD3 = activeNotes.has(50);
      onMidiMessage({ data: new Uint8Array([0x89, 38, 0]) });

      // Epic #43 + #128 + #132
      checks.level40TitleIsGrandSkald = getBardicTitleForLevel(40) === 'Grand Skald';
      const pianoXpBefore = bardProfile.totalXp;
      const pianoSongsBefore = bardProfile.songsCompleted;
      const vocalXpBefore = bardProfile.vocalXp || 0;

      setExternalInstrumentSourceMode('vocal-mic');
      checks.vocalMicAutoSwitchedKaraoke = stageViewMode === 'karaoke';
      checks.vocalChartBuilt = Boolean(spellSingingState.vocalChart && spellSingingState.vocalChart.notes.length > 0);

      // #128: While paused, synthetic audio must NOT increment totalScoredFrames
      playbackState.isPlaying = false;
      const firstNote = spellSingingState.vocalChart.notes[0];
      playbackState.currentTime = firstNote.time + Math.min(0.15, firstNote.duration * 0.5);
      const targetFreqOctaveDown = 440 * Math.pow(2, ((firstNote.midi - 12) - 69) / 12);
      const vocalWave = new Float32Array(2048);
      for (let i = 0; i < vocalWave.length; i++) vocalWave[i] = 0.45 * Math.sin((2 * Math.PI * targetFreqOctaveDown * i) / 44100);
      processAudioInstrumentFrame(vocalWave, 44100);
      checks.pausedVocalDidNotScore = spellSingingState.scorer.state.totalScoredFrames === 0;

      // While playing, synthetic audio scores & awards separate Vocal XP
      playbackState.isPlaying = true;
      processAudioInstrumentFrame(vocalWave, 44100);
      playbackState.isPlaying = false;
      renderKaraokeFrame();
      const vocalSum = spellSingingState.scorer.getSummary();
      checks.playingVocalScored = vocalSum.accuracyPct > 0 && vocalSum.vocalScorePoints > 0;
      const awarded = awardVocalSessionXp();
      checks.vocalXpSeparateFromPiano = Boolean(
        awarded &&
        awarded.vocalXpEarned > 0 &&
        bardProfile.vocalXp === vocalXpBefore + awarded.vocalXpEarned &&
        bardProfile.totalXp === pianoXpBefore &&
        bardProfile.songsCompleted === pianoSongsBefore
      );

      // #132: Bardic Annals displays Vocal Level, Vocal XP & Vocal Songs
      openBardAnnalsModal();
      checks.annalsShowsVocalStats = Boolean(
        document.getElementById('annals-vocal-level')?.textContent.includes('LVL') &&
        document.getElementById('annals-vocal-xp')?.textContent.includes('XP') &&
        Number(document.getElementById('annals-vocal-songs')?.textContent) >= 1
      );
      closeBardAnnalsModal();

      // #129: isAnyModalOpen covers omrReviewModal & setlistModal, and Escape closes Colleges & Campaign
      omrReviewModal.classList.remove('hidden');
      checks.isAnyModalDetectsOmr = isAnyModalOpen();
      omrReviewModal.classList.add('hidden');

      setlistModal.classList.remove('hidden');
      checks.isAnyModalDetectsSetlist = isAnyModalOpen();
      setlistModal.classList.add('hidden');

      bardCollegesModal.classList.remove('hidden');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      checks.escapeClosesColleges = bardCollegesModal.classList.contains('hidden');

      campaignModal.classList.remove('hidden');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      checks.escapeClosesCampaign = campaignModal.classList.contains('hidden');

      // #158: .btn-audio-sync reserves its full pill width (> 40px) instead of overflowing a 20px .btn-icon box
      const syncAnchor = document.getElementById('audio-sync-anchor');
      const wasAnchorHidden = syncAnchor.classList.contains('hidden');
      syncAnchor.classList.remove('hidden');
      const syncBtnRect = document.getElementById('btn-audio-sync').getBoundingClientRect();
      checks.audioSyncPillAutoWidth = syncBtnRect.width > 45 && Math.round(syncBtnRect.height) >= 20;
      if (wasAnchorHidden) syncAnchor.classList.add('hidden');

      // #159 & #160: Custom timed LRC word sweep (--word-fill-pct), ARIA announcer, Lyric Sync popover & Escape close
      setExternalInstrumentSourceMode('vocal-mic');
      spellSingingState.customLyricsBySongId[currentSong.songId] = '[00:00.20] <00:00.20> Sing <00:00.60> brave <00:01.00> bard';
      ensureVocalChartForCurrentSong({ forceRebuild: true });
      playbackState.currentTime = 0.4;
      renderKaraokeFrame();
      const activeWordSpan = document.querySelector('#karaoke-lyrics-current .karaoke-syl.active');
      checks.karaokeWordSweepActive = Boolean(
        activeWordSpan &&
        activeWordSpan.style.getPropertyValue('--word-fill-pct').endsWith('%') &&
        document.getElementById('karaoke-sr-announcer')?.textContent.includes('Sing brave bard')
      );
      document.getElementById('btn-karaoke-lyrics-sync').click();
      checks.lyricsSyncPopoverOpens = !document.getElementById('karaoke-lyrics-sync-popover').classList.contains('hidden');
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      checks.escapeClosesLyricsSync = document.getElementById('karaoke-lyrics-sync-popover').classList.contains('hidden');
      delete spellSingingState.customLyricsBySongId[currentSong.songId];
      ensureVocalChartForCurrentSong({ forceRebuild: true });

      // #161 & #166: Vocal Lead Highway swaps Bar 2 Practice dropdown for #btn-vocal-mix-bar (disabled on MIDI-only songs),
      // syncs Lead/Harmony state, handles discrete vocals_lead/vocals_backing without vocals.wav, and runs syncBackingAudioElement cleanly!
      setExternalInstrumentSourceMode('midi-piano');
      assignSongTracksAndDifficulty('instrument-vocals');
      checks.vocalHighwaySwapsPracticeForVocalMix = Boolean(
        document.getElementById('practice-hand-control-group').classList.contains('hidden') &&
        !document.getElementById('btn-vocal-mix-bar').classList.contains('hidden') &&
        document.getElementById('btn-vocal-mix-bar').disabled === true
      );
      updateCurrentSongVocalMix({ leadVolume: 0.4, harmoniesEnabled: false });
      checks.vocalMixControlsSynced = Boolean(
        document.getElementById('karaoke-lead-vocal-readout').textContent === '40%' &&
        document.getElementById('vocal-mix-bar-pct').textContent === '40%' &&
        document.getElementById('vocal-mix-bar-harm').textContent === 'Harm OFF'
      );

      // Exercise multi-stem syncBackingAudioElement + discrete vocals_lead/vocals_backing without combined vocals.wav (#166)
      const prevStems = currentSong.stems;
      const prevStemEls = currentSong.stemAudioEls;
      const makeMockAudio = () => ({
        muted: false,
        volume: 1,
        paused: true,
        currentTime: 0,
        duration: 10,
        playbackRate: 1,
        preservesPitch: true,
        webkitPreservesPitch: true,
        play: () => Promise.resolve(),
        pause: () => {}
      });
      currentSong.stems = { vocals_lead: 'lead.wav', vocals_backing: 'back.wav' };
      currentSong.stemAudioEls = { vocals_lead: makeMockAudio(), vocals_backing: makeMockAudio() };
      applyCurrentStemMixToAudioElements();
      checks.discreteVocalStemsWithoutCombinedWork = Boolean(
        currentSong.stemAudioEls.vocals_lead.muted === false &&
        currentSong.stemAudioEls.vocals_backing.muted === true
      );
      let multiStemSyncOk = false;
      try {
        playbackState.isPlaying = true;
        syncBackingAudioElement(1.0);
        multiStemSyncOk = true;
      } finally {
        playbackState.isPlaying = false;
        currentSong.stems = prevStems;
        currentSong.stemAudioEls = prevStemEls;
      }
      checks.multiStemSyncNoReferenceError = multiStemSyncOk;

      updateCurrentSongVocalMix({ leadVolume: 0.25, harmoniesEnabled: true });
      assignSongTracksAndDifficulty('auto-piano');
      checks.restoredHighway = stageViewMode === 'highway' && !document.getElementById('practice-hand-control-group').classList.contains('hidden');

      // Issue #162 & #163: Grimoire Hall of Legends + 30s Audio Preview DOM checks
      const prevSongRef = currentSong;
      const prevTotalXp = bardProfile.totalXp;
      const demoKey = getSongHistoryKey(currentSong);
      const prevDemoHist = songPlayHistory[demoKey] ? { ...songPlayHistory[demoKey] } : null;

      // Seed a baseline record and verify Hall of Legends 11th spread renders both lists
      songPlayHistory[demoKey] = {
        ...(prevDemoHist || {}),
        songId: demoKey,
        title: currentSong.title,
        filePath: currentSong.filePath || 'BUILTIN_DEMO',
        plays: 1,
        bestAccuracy: 85,
        bestAccuracySetAt: '2026-11-25T12:00:00.000Z',
        bestRunXp: 300,
        bestRunXpSetAt: '2026-11-25T12:00:00.000Z',
        lastPlayed: '2026-11-25T12:00:00.000Z',
        firstPlayed: '2026-11-25T12:00:00.000Z'
      };

      openGrimoireSpellbook('highway');
      const legendsPip = document.getElementById('tier-pip-hall-of-legends');
      const rowPreviewBtns = document.querySelectorAll('.spellbook-card-preview-btn');
      const detailPreviewBtn = document.getElementById('btn-spellbook-preview-song');
      checks.grimoirePreviewButtonsPresent = Boolean(rowPreviewBtns.length > 0 && detailPreviewBtn);

      // Verify Recording option is hidden when entry has no backing audio
      const firstEntry = Array.from(grimoireSpells.values())[0];
      openSpellbookPreviewMenu({ ...firstEntry, backingAudioPath: null }, detailPreviewBtn);
      checks.grimoirePreviewHidesRecordingWithoutAudio = Boolean(
        document.getElementById('btn-preview-source-recording').classList.contains('hidden')
      );
      closeSpellbookPreviewMenu();

      // Switch directly to Hall of Legends spread (index 10)
      currentSpellbookTierIndex = HALL_OF_LEGENDS_SPREAD_INDEX;
      renderSpellbookSpread();
      const legendsLeftVisible = !document.getElementById('spellbook-legends-left-panel').classList.contains('hidden');
      const legendsRightVisible = !document.getElementById('spellbook-legends-right-panel').classList.contains('hidden');
      const accRows = document.querySelectorAll('#spellbook-legends-acc-list .legends-record-row');
      const xpRows = document.querySelectorAll('#spellbook-legends-xp-list .legends-record-row');
      checks.hallOfLegendsSpreadRenders = Boolean(legendsPip && legendsLeftVisible && legendsRightVisible && accRows.length >= 1 && xpRows.length >= 1);

      // Issue #168 Finding #1: Leaving Hall of Legends must restore #spellbook-song-list
      currentSpellbookTierIndex = 0;
      renderSpellbookSpread();
      checks.hallOfLegendsRestoresSongList = Boolean(
        !document.getElementById('spellbook-song-list').classList.contains('hidden') &&
        document.getElementById('spellbook-legends-left-panel').classList.contains('hidden')
      );

      // Issue #168 Finding #6: Pressing Escape while preview menu is open closes menu without closing Grimoire
      openSpellbookPreviewMenu(firstEntry, detailPreviewBtn);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      checks.escapeClosesPreviewMenuFirst = Boolean(
        document.getElementById('spellbook-preview-menu').classList.contains('hidden') &&
        !document.getElementById('grimoire-spellbook-modal').classList.contains('hidden')
      );

      // Verify preview stops on close and never mutates currentSong or XP
      closeGrimoireSpellbook();
      checks.grimoirePreviewIsolation = Boolean(
        !grimoirePreviewController.getState().isPlaying &&
        currentSong === prevSongRef &&
        bardProfile.totalXp === prevTotalXp
      );

      // Restore seeded history
      if (prevDemoHist) {
        songPlayHistory[demoKey] = prevDemoHist;
      } else {
        delete songPlayHistory[demoKey];
      }

      // Issue #164: Tavern Crowd Warning & Boo-Off DOM checks
      const prevWaitMode164 = playbackState.waitMode;
      const prevPolicy164 = crowdFailPolicy;
      const prevCompleted164 = bardProfile.songsCompleted;

      // 1. Wait Mode is exempt from crowd warning
      playbackState.waitMode = true;
      resetSongSessionStats();
      for (let i = 0; i < 20; i += 1) {
        recordSpellChainBreak('Missed');
      }
      checks.crowdFailExemptInWaitMode = Boolean(
        songSessionStats.crowdFailState.status === 'normal' &&
        document.getElementById('crowd-warning-banner').classList.contains('hidden')
      );

      // 2. Arcade mode triggers warning at tier threshold, then End policy opens Boo-Off modal keeping XP & not counting completion
      playbackState.waitMode = false;
      crowdFailPolicy = 'end';
      resetSongSessionStats();
      songSessionStats.songXpEarned = 175;
      const demoThresholds = getCrowdWarningThreshold(currentSong?.difficulty?.spellLevel || currentSong?.difficulty?.index || 0);
      for (let i = 0; i < demoThresholds.warningMisses; i += 1) {
        recordSpellChainBreak('Missed');
      }
      const warningShown = Boolean(
        songSessionStats.crowdFailState.status === 'warning' &&
        !document.getElementById('crowd-warning-banner').classList.contains('hidden') &&
        document.getElementById('hud-crowd-meter').classList.contains('crowd-warning')
      );
      for (let i = 0; i < demoThresholds.booOffMisses; i += 1) {
        recordSpellChainBreak('Missed');
      }
      const booModalEl = document.getElementById('boo-off-modal');
      const booEndOk = Boolean(
        !booModalEl.classList.contains('hidden') &&
        document.getElementById('boo-off-xp-kept').textContent === '+175 XP' &&
        bardProfile.songsCompleted === prevCompleted164
      );
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      const booEscClosed = booModalEl.classList.contains('hidden');

      // 3. Continue policy does not open modal and does not re-fire on further misses
      crowdFailPolicy = 'continue';
      resetSongSessionStats();
      for (let i = 0; i < demoThresholds.warningMisses + demoThresholds.booOffMisses; i += 1) {
        recordSpellChainBreak('Missed');
      }
      const booContinueOk = Boolean(
        songSessionStats.crowdFailState.hasBooedOffThisRun === true &&
        booModalEl.classList.contains('hidden')
      );
      checks.crowdWarningAndBooOffEndPolicy = Boolean(warningShown && booEndOk && booEscClosed);
      checks.crowdBooOffContinuePolicy = booContinueOk;

      playbackState.waitMode = prevWaitMode164;
      crowdFailPolicy = prevPolicy164;
      resetSongSessionStats();

      // Milestone v1.9.0 (#179, #181, #182, #183) DOM checks
      const speedSlider = document.getElementById('highway-scroll-speed-slider');
      speedSlider.value = '1.8';
      speedSlider.dispatchEvent(new Event('input', { bubbles: true }));
      checks.highwayScrollSpeedPersists = Boolean(
        playbackState.highwayScrollSpeed === 1.8 &&
        document.getElementById('highway-scroll-speed-value').textContent === '1.8x' &&
        localStorage.getItem(HIGHWAY_SCROLL_SPEED_STORAGE_KEY) === '1.8'
      );
      speedSlider.value = '1.0';
      speedSlider.dispatchEvent(new Event('input', { bubbles: true }));

      const labelSel = document.getElementById('falling-note-labels-select');
      labelSel.value = 'degrees';
      labelSel.dispatchEvent(new Event('change', { bubbles: true }));
      const sustainToggle = document.getElementById('toggle-sustain-lane');
      checks.fallingLabelsAndSustainToggle = Boolean(
        playbackState.fallingNoteLabelMode === 'degrees' &&
        sustainToggle && sustainToggle.checked === true
      );
      labelSel.value = 'notes';
      labelSel.dispatchEvent(new Event('change', { bubbles: true }));

      playbackState.waitMode = false;
      drawLiveHitErrorBar();
      const shownInArcade = !document.getElementById('hud-hit-error-pill').classList.contains('hidden');
      recordLiveHitError(-25);
      drawModalTimingScatter([-25, 10, 50]);
      const scatterVisible = !document.getElementById('modal-timing-scatter-canvas').classList.contains('hidden');
      playbackState.waitMode = true;
      drawLiveHitErrorBar();
      const hiddenInWait = document.getElementById('hud-hit-error-pill').classList.contains('hidden');
      checks.liveHitErrorBarAndModalScatter = Boolean(shownInArcade && scatterVisible && hiddenInWait);

      currentSong.sectionMarkers = [{ time: 5.0, label: 'Chorus', source: 'midi' }];
      renderTimelineSectionMarkers();
      const tickEl = document.querySelector('#timeline-section-markers .timeline-section-tick');
      if (tickEl) tickEl.click();
      checks.countInAndSectionMarkersWork = Boolean(
        document.getElementById('toggle-count-in') &&
        document.getElementById('toggle-metronome-click') &&
        tickEl &&
        Math.abs(playbackState.currentTime - 5.0) < 0.05
      );
      resetPlaybackToStart();

      return checks;
    })();
  `);

  const summary = {
    electronVersion: process.versions.electron,
    unitResults,
    domChecks,
    rendererErrors
  };

  console.log('=== COLLEGE OF KEYS REGRESSION TEST SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));

  const failedUnits = unitResults.filter((u) => !u.ok);
  const allDomTrue = Object.entries(domChecks).every(([k, v]) => (k === 'pianoKeyCount' ? v === 61 : v === true));

  // Issue #166: Restore grimoire_bundles.json if created solely by the test run so git status stays clean
  if (typeof cleanupBundleStore === 'function') {
    cleanupBundleStore();
  }

  app.exit(failedUnits.length === 0 && allDomTrue && rendererErrors.length === 0 ? 0 : 1);
}).catch((err) => {
  console.error('REGRESSION_TEST_FATAL:', err);
  app.exit(1);
});
