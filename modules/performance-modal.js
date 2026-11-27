'use strict';

/**
 * College of Keys — Issue #184: Extracted Performance Check Modal & Post-Song Breakdown Module
 * Encapsulates measure-by-measure breakdown, Encore Drill, D20 roll physics/audio,
 * Hall of Legends bonus XP evaluation, and Timing Scatter rendering.
 */

function createPerformanceModalModule(deps) {
  const {
    fs, path, crypto, createD20TrayRoller,
    bardProfile, songSessionStats, songPlayHistory, playbackState, rehearsalLoopState, encoreDrillQueue,
    isQualifyingLegendRun, evaluatePersonalRecordUpdate,
    getBardicTitleForLevel, getXpRequiredForLevel,
    awardBardXp, saveBardProfile, recordSongPerformance, checkAndUnlockAchievements,
    updateTutorialProgress, updateCollegeProgress, updateLitrpgHUD,
    updatePerformanceModalSetlistUI, updatePerformanceModalCampaignUI,
    drawModalTimingScatter, closeAllConservatoryPopovers, pausePlayback,
    resetPlaybackToStart, startPlayback, seekBackingAudioToSongTime, syncBackingAudioElement,
    resetSongProgressFlags, updateTimelineUI, updateRehearsalUI,
    showGrimoireToast, formatSeconds, setWaitModeEnabled,
    // DOM elements
    performanceCheckModal, d20TrayOverlay, d20TrayCanvasHost,
    modalSongSubtitle, modalLevelupBanner, modalNewLevel, modalNewTitle,
    modalQuestsBanner, modalQuestsList, modalQuestsXpPill,
    modalRecordsBanner, modalRecordsList, modalRecordsXpPill,
    modalBardLevel, modalBardTitle, modalXpNumbers, modalXpBarFill,
    modalStatAccuracy, modalStatChain, modalStatClean, modalStatFumbled, modalStatRolls,
    modalTimingSpreadPill, modalBreakdownSection, modalBreakdownSummary,
    modalSectionBars, modalWeakMeasures, btnEncoreDrill, btnModalClose
  } = deps;

  function buildPostSongBreakdown() {
    if (!deps.currentSong || !deps.currentSong.duration) {
      return { sections: [], weakMeasures: [], totalMeasures: 0 };
    }

    const measureBounds = getSongMeasureBounds();
    const totalMeasures = Math.max(1, measureBounds.length);
    const sectionCount = Math.min(4, totalMeasures);
    const sections = [];

    for (let i = 0; i < sectionCount; i++) {
      const startIdx = Math.floor((i * totalMeasures) / sectionCount);
      const endIdx = Math.max(startIdx, Math.floor(((i + 1) * totalMeasures) / sectionCount) - 1);
      const startBar = Number(measureBounds[startIdx]?.number) || (startIdx + 1);
      const endBar = Number(measureBounds[endIdx]?.number) || (endIdx + 1);
      let clean = 0;
      let fumbled = 0;
      let missed = 0;
      for (let idx = startIdx; idx <= endIdx; idx++) {
        const mNum = Number(measureBounds[idx]?.number) || (idx + 1);
        const st = songSessionStats.measureStats[mNum];
        if (st) {
          clean += st.clean;
          fumbled += st.fumbled;
          missed += st.missed;
        }
      }
      const attempts = clean + fumbled + missed;
      const accuracyPct = attempts > 0
        ? Math.round(((clean + fumbled * 0.5) / attempts) * 100)
        : null;
      const startSec = Math.max(0, measureBounds[startIdx]?.startTime ?? 0);
      const endSec = Math.min(deps.currentSong.duration, measureBounds[endIdx]?.endTime ?? deps.currentSong.duration);
      const label = startBar === endBar ? `Bar ${startBar}` : `Bars ${startBar}–${endBar}`;
      sections.push({
        label,
        startBar,
        endBar,
        startSec,
        endSec,
        attempts,
        mistakes: fumbled + missed,
        accuracyPct
      });
    }

    const weakMeasures = [];
    for (const [mStr, st] of Object.entries(songSessionStats.measureStats)) {
      const measure = Number(mStr);
      const mistakes = st.fumbled + st.missed;
      if (mistakes <= 0) continue;
      const attempts = st.clean + st.fumbled + st.missed;
      const accuracyPct = attempts > 0
        ? Math.round(((st.clean + st.fumbled * 0.5) / attempts) * 100)
        : 0;
      const { startSec, endSec } = getMeasureTimeRange(measure);
      weakMeasures.push({
        measure,
        startSec,
        endSec,
        clean: st.clean,
        fumbled: st.fumbled,
        missed: st.missed,
        mistakes,
        attempts,
        accuracyPct
      });
    }

    weakMeasures.sort((a, b) => a.accuracyPct - b.accuracyPct || b.mistakes - a.mistakes || a.measure - b.measure);

    return {
      sections,
      weakMeasures: weakMeasures.slice(0, 3),
      totalMeasures
    };
  }

  function updateEncoreDrillBadge() {
    if (!encoreDrillBadge) return;
    if (!encoreDrillQueue.active || encoreDrillQueue.items.length === 0) {
      encoreDrillBadge.classList.add('hidden');
      encoreDrillBadge.textContent = '';
      return;
    }
    const cur = encoreDrillQueue.items[encoreDrillQueue.activeIndex];
    const total = encoreDrillQueue.items.length;
    encoreDrillBadge.classList.remove('hidden');
    encoreDrillBadge.textContent = `⚔️ Encore ${encoreDrillQueue.activeIndex + 1}/${total}: ${cur ? cur.label : ''}`;
  }

  function armRehearsalLoopWindow(startSec, endSec) {
    let a = Math.max(0, Math.min(deps.currentSong.duration, startSec));
    let b = Math.max(a, Math.min(deps.currentSong.duration, endSec));

    if ((b - a) < 2.0) {
      b = Math.min(deps.currentSong.duration, a + 2.0);
    }
    if ((b - a) < 2.0) {
      a = Math.max(0, b - 2.0);
    }

    rehearsalLoopState.startTime = a;
    rehearsalLoopState.endTime = b;
    rehearsalLoopState.enabled = (b - a) >= MIN_REHEARSAL_LOOP_SPAN_SEC;
    rehearsalLoopState.passMistakes = 0;
    rehearsalLoopState.cleanPasses = 0;
    rehearsalLoopState.totalPasses = 0;

    const jumpTime = Math.max(0, a - REHEARSAL_PREROLL_SEC);
    playbackState.currentTime = jumpTime;
    playbackState.isWaitingForStrike = false;
    playbackState.waitStartedAtMs = null;
    playbackState.activeStrikeGroup = null;
    resetSongProgressFlags(jumpTime);

    seekBackingAudioToSongTime(jumpTime);
    syncBackingAudioElement(jumpTime);
    updateTimelineUI();
    updateRehearsalUI();
    return { a, b };
  }

  function startEncoreDrill(weakMeasures) {
    if (!deps.currentSong || !deps.currentSong.duration || !Array.isArray(weakMeasures) || weakMeasures.length === 0) return;
    const sorted = [...weakMeasures].sort((a, b) => a.measure - b.measure);
    encoreDrillQueue.active = true;
    encoreDrillQueue.items = sorted.map((wm) => ({
      measure: wm.measure,
      label: `Bar ${wm.measure}`,
      startSec: wm.startSec,
      endSec: wm.endSec
    }));
    encoreDrillQueue.activeIndex = 0;
    encoreDrillQueue.totalCleared = 0;

    closePerformanceCheckModal();
    pausePlayback();
    const first = encoreDrillQueue.items[0];
    armRehearsalLoopWindow(first.startSec, first.endSec);
    updateEncoreDrillBadge();
    showGrimoireToast(`⚔️ Encore Drill armed (${encoreDrillQueue.items.length} weak bar${encoreDrillQueue.items.length === 1 ? '' : 's'}) — Starting ${first.label}`);
  }

  /**
   * Issue #62: 1-tap jump from Post-Song Breakdown into Rehearsal Loop Mode (Issue #30).
   * Pads single short bars to at least 2.0s, arms A->B loop, jumps to A - 0.8s pre-roll, and pauses.
   */
  function practiceWeakRegion(startSec, endSec, label = 'Weak Measure') {
    if (!deps.currentSong || !deps.currentSong.duration) return;

    encoreDrillQueue.active = false;
    encoreDrillQueue.items = [];
    encoreDrillQueue.activeIndex = 0;
    updateEncoreDrillBadge();

    closePerformanceCheckModal();
    pausePlayback();

    const { a, b } = armRehearsalLoopWindow(startSec, endSec);
    showGrimoireToast(`\uD83D\uDD01 Loop armed for ${label} (${formatSeconds(a)} \u2192 ${formatSeconds(b)}) \u2014 Press Space when ready`);
  }

  function getSongHistoryKey(song) {
    if (!song) return 'demo spell';
    return song.songId || (song.filePath || song.title || 'Demo Spell').toLowerCase();
  }

  function renderPostSongBreakdown(totalAttempts, priorWeakBarHistory = null) {
    if (!modalBreakdownSection || !modalBreakdownSummary || !modalSectionBars || !modalWeakMeasures) return;

    if (!deps.currentSong || totalAttempts === 0) {
      modalBreakdownSection.classList.add('hidden');
      if (btnEncoreDrill) btnEncoreDrill.classList.add('hidden');
      return;
    }

    const { sections, weakMeasures } = buildPostSongBreakdown();
    if (sections.length === 0) {
      modalBreakdownSection.classList.add('hidden');
      if (btnEncoreDrill) btnEncoreDrill.classList.add('hidden');
      return;
    }

    modalBreakdownSection.classList.remove('hidden');

    const totalMistakes = songSessionStats.fumbledNotesHit + songSessionStats.wrongOrMissedNotes;
    modalBreakdownSummary.textContent = totalMistakes === 0
      ? 'Flawless Run!'
      : `${totalMistakes} trip${totalMistakes === 1 ? '' : 's'} across ${weakMeasures.length} key bar${weakMeasures.length === 1 ? '' : 's'}`;

    if (btnEncoreDrill) {
      if (weakMeasures.length > 0) {
        btnEncoreDrill.classList.remove('hidden');
        btnEncoreDrill.textContent = `⚔️ Encore Drill (${weakMeasures.length} Weak Bar${weakMeasures.length === 1 ? '' : 's'})`;
        btnEncoreDrill.onclick = () => startEncoreDrill(weakMeasures);
      } else {
        btnEncoreDrill.classList.add('hidden');
        btnEncoreDrill.onclick = null;
      }
    }

    const prevHistory = priorWeakBarHistory || songPlayHistory[getSongHistoryKey(deps.currentSong)]?.weakBarHistory || {};

    while (modalSectionBars.firstChild) {
      modalSectionBars.removeChild(modalSectionBars.firstChild);
    }
    for (const sec of sections) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'breakdown-section-pill';
      if (sec.accuracyPct !== null) {
        if (sec.accuracyPct < 70) pill.classList.add('tier-weak');
        else if (sec.accuracyPct < 90) pill.classList.add('tier-warn');
      }
      pill.title = sec.attempts > 0
        ? `Click to practice ${sec.label} (${sec.accuracyPct}% accuracy)`
        : `${sec.label} (No player notes)`;

      const lblEl = document.createElement('span');
      lblEl.className = 'breakdown-section-label';
      lblEl.textContent = sec.label;

      const pctEl = document.createElement('span');
      pctEl.className = 'breakdown-section-pct';
      pctEl.textContent = sec.accuracyPct === null ? '—' : `${sec.accuracyPct}%`;

      const barEl = document.createElement('div');
      barEl.className = 'breakdown-section-bar';
      barEl.style.width = `${sec.accuracyPct === null ? 0 : Math.max(8, sec.accuracyPct)}%`;

      pill.appendChild(lblEl);
      pill.appendChild(pctEl);
      pill.appendChild(barEl);

      if (sec.attempts > 0) {
        pill.addEventListener('click', () => {
          practiceWeakRegion(sec.startSec, sec.endSec, sec.label);
        });
      } else {
        pill.disabled = true;
        pill.style.opacity = '0.55';
        pill.style.cursor = 'default';
      }

      modalSectionBars.appendChild(pill);
    }

    while (modalWeakMeasures.firstChild) {
      modalWeakMeasures.removeChild(modalWeakMeasures.firstChild);
    }

    // Celebrate previously weak bars that were conquered (100%) in this run (Issue #108)
    const conqueredBars = [];
    for (const [mStr, prevPct] of Object.entries(prevHistory)) {
      if (prevPct >= 100) continue;
      const st = songSessionStats.measureStats[mStr];
      if (st && (st.clean + st.fumbled + st.missed) > 0 && st.fumbled === 0 && st.missed === 0) {
        conqueredBars.push({ measure: Number(mStr), prevPct });
      }
    }
    conqueredBars.sort((a, b) => a.measure - b.measure);

    if (weakMeasures.length === 0) {
      const flawless = document.createElement('div');
      flawless.className = 'breakdown-flawless';
      flawless.textContent = conqueredBars.length > 0
        ? `✨ Conquered ${conqueredBars.map((b) => `Bar ${b.measure} (${b.prevPct}% → 100%)`).join(', ')}!`
        : '✨ No weak bars detected — every measure was clean!';
      modalWeakMeasures.appendChild(flawless);
      return;
    }

    for (const cb of conqueredBars.slice(0, 2)) {
      const row = document.createElement('div');
      row.className = 'breakdown-weak-row';
      const info = document.createElement('div');
      info.className = 'breakdown-weak-info';
      const badge = document.createElement('span');
      badge.className = 'breakdown-bar-badge';
      badge.textContent = `Bar ${cb.measure}`;
      const tag = document.createElement('span');
      tag.className = 'breakdown-delta-tag conquered';
      tag.textContent = `✨ Conquered! (${cb.prevPct}% → 100%)`;
      info.appendChild(badge);
      info.appendChild(tag);
      row.appendChild(info);
      modalWeakMeasures.appendChild(row);
    }

    for (const wm of weakMeasures) {
      const row = document.createElement('div');
      row.className = 'breakdown-weak-row';

      const info = document.createElement('div');
      info.className = 'breakdown-weak-info';

      const badge = document.createElement('span');
      badge.className = 'breakdown-bar-badge';
      badge.textContent = `Bar ${wm.measure}`;

      const parts = [];
      if (wm.missed > 0) parts.push(`${wm.missed} miss${wm.missed === 1 ? '' : 'es'}`);
      if (wm.fumbled > 0) parts.push(`${wm.fumbled} fumbled`);
      const detail = document.createElement('span');
      detail.className = 'breakdown-weak-detail';
      detail.textContent = `${wm.accuracyPct}% • ${parts.join(', ')}`;

      info.appendChild(badge);
      info.appendChild(detail);

      const prevAcc = prevHistory[String(wm.measure)];
      if (Number.isFinite(prevAcc)) {
        const delta = wm.accuracyPct - prevAcc;
        if (delta > 0) {
          const deltaEl = document.createElement('span');
          deltaEl.className = 'breakdown-delta-tag';
          deltaEl.textContent = `${prevAcc}% → ${wm.accuracyPct}% (+${delta}%)`;
          info.appendChild(deltaEl);
        }
      }

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn-practice-measure';
      btn.textContent = '🔁 Practice This';
      btn.title = `Loop Bar ${wm.measure} (${formatSeconds(wm.startSec)}–${formatSeconds(wm.endSec)})`;
      btn.addEventListener('click', () => {
        practiceWeakRegion(wm.startSec, wm.endSec, `Bar ${wm.measure}`);
      });

      row.appendChild(info);
      row.appendChild(btn);
      modalWeakMeasures.appendChild(row);
    }
  }

  let diceBounceSynth = null;

  function playDiceBounceSound(impactSpeed = 3) {
    try {
      if (typeof Tone === 'undefined') return;
      if (Tone.context.state !== 'running') {
        Tone.context.resume().catch(() => {});
      }
      if (!diceBounceSynth) {
        diceBounceSynth = new Tone.Synth({
          oscillator: { type: 'triangle' },
          envelope: { attack: 0.002, decay: 0.04, sustain: 0, release: 0.02 }
        });
        if (masterVol) {
          diceBounceSynth.connect(masterVol);
        } else {
          diceBounceSynth.toDestination();
        }
      }
      const db = Math.max(-28, Math.min(-8, -24 + impactSpeed * 1.4));
      diceBounceSynth.volume.value = db;
      const freq = 150 + Math.random() * 95;
      diceBounceSynth.triggerAttackRelease(freq, 0.045, Tone.now());
    } catch {
      // Ignore audio errors
    }
  }

  function playNat20Flourish() {
    try {
      const inst = getActiveInstrument();
      if (!inst || typeof Tone === 'undefined') return;
      const now = Tone.now();
      ['C5', 'E5', 'G5', 'C6'].forEach((note, idx) => {
        inst.triggerAttackRelease(note, 0.35, now + idx * 0.08, 0.8);
      });
    } catch {
      // Ignore audio errors
    }
  }

  function playNat1TomatoSound() {
    try {
      const inst = getActiveInstrument();
      if (!inst || typeof Tone === 'undefined') return;
      const now = Tone.now();
      inst.triggerAttackRelease('F#3', 0.25, now, 0.7);
      inst.triggerAttackRelease('C3', 0.45, now + 0.18, 0.75);
    } catch {
      // Ignore audio errors
    }
  }

  function computeBardicAccuracyMod(accuracyPct) {
    if (accuracyPct >= 95) return 5;
    if (accuracyPct >= 90) return 4;
    if (accuracyPct >= 80) return 3;
    if (accuracyPct >= 70) return 2;
    if (accuracyPct >= 60) return 1;
    return 0;
  }

  function getSongPerformanceDC(song) {
    const mult = song?.difficulty?.xpMultiplier ?? 1.0;
    if (mult >= 2.0) return 17;
    if (mult >= 1.7) return 15;
    if (mult >= 1.4) return 13;
    if (mult >= 1.2) return 12;
    return 10;
  }

  function buildD20Outcome(dieRoll, accuracyPct, song) {
    const mod = computeBardicAccuracyMod(accuracyPct);
    const dc = getSongPerformanceDC(song);
    const total = dieRoll + mod;
    const modSign = mod >= 0 ? `+${mod}` : String(mod);
    const mathText = `d20 (${dieRoll}) ${modSign} Accuracy = ${total} vs DC ${dc}`;

    if (dieRoll === 20) {
      return {
        dieRoll,
        mod,
        total,
        dc,
        tier: 'nat-20',
        bonusXp: 150,
        mathText: `${mathText} — CRITICAL! (+150 XP)`,
        gradeTitle: 'Natural 20 — The Tavern Erupts!',
        gradeFlavor: 'Thunderous applause! Patrons toss a shower of gold coins onto the stage (+150 Bonus XP).'
      };
    }
    if (dieRoll === 1) {
      return {
        dieRoll,
        mod,
        total,
        dc,
        tier: 'nat-1',
        bonusXp: 5,
        mathText: `${mathText} — FUMBLE! (+5 XP)`,
        gradeTitle: 'Natural 1 — A Tomato Hits the Stage!',
        gradeFlavor: 'Splat! A heckler in the back row has terrible aim, but you earn +5 Consolation XP.'
      };
    }
    if (total >= dc + 5) {
      return {
        dieRoll,
        mod,
        total,
        dc,
        tier: 'crit-success',
        bonusXp: 75,
        mathText: `${mathText} — Standing Ovation! (+75 XP)`,
        gradeTitle: `Total ${total} vs DC ${dc} — Masterful Encore!`,
        gradeFlavor: 'The barkeep pours celebratory honey-mead for the whole table (+75 Bonus XP).'
      };
    }
    if (total >= dc) {
      return {
        dieRoll,
        mod,
        total,
        dc,
        tier: 'success',
        bonusXp: 35,
        mathText: `${mathText} — Success! (+35 XP)`,
        gradeTitle: `Total ${total} vs DC ${dc} — Solid Tavern Performance`,
        gradeFlavor: 'Patrons raise their silver flagons and cheer your arcane melody (+35 Bonus XP).'
      };
    }
    return {
      dieRoll,
      mod,
      total,
      dc,
      tier: 'miss',
      bonusXp: 10,
      mathText: `${mathText} — Missed DC (+10 XP)`,
      gradeTitle: `Total ${total} vs DC ${dc} — Tough Crowd`,
      gradeFlavor: 'A few murmurs in the tavern, but every rehearsal sharpens your craft (+10 Consolation XP).'
    };
  }

  function refreshModalXpSection() {
    const leveledUp = bardProfile.level > songSessionStats.startingLevel;
    modalLevelupBanner.classList.toggle('hidden', !leveledUp);
    if (leveledUp) {
      modalNewLevel.textContent = `Level ${bardProfile.level}`;
      modalNewTitle.textContent = bardProfile.title;
    }

    modalBardLevel.textContent = `LVL ${bardProfile.level}`;
    modalBardTitle.textContent = bardProfile.title;
    modalXpNumbers.textContent = `${bardProfile.xpIntoLevel.toLocaleString()} / ${bardProfile.xpForNextLevel.toLocaleString()} XP (Total: ${bardProfile.totalXp.toLocaleString()} XP)`;

    const pct = bardProfile.xpForNextLevel > 0
      ? Math.min(100, Math.max(0, (bardProfile.xpIntoLevel / bardProfile.xpForNextLevel) * 100))
      : 0;
    modalXpBarFill.style.width = `${pct.toFixed(1)}%`;
    modalStatXp.textContent = `+${songSessionStats.songXpEarned.toLocaleString()} XP`;
  }

  function applyD20OutcomeToModal(outcome, isPreview = false) {
    if (d20GradeBanner) {
      d20GradeBanner.classList.toggle('nat-20', !isPreview && outcome?.tier === 'nat-20');
      d20GradeBanner.classList.toggle('nat-1', !isPreview && outcome?.tier === 'nat-1');
    }
    if (modalD20Badge) {
      modalD20Badge.classList.toggle('nat-20', !isPreview && outcome?.tier === 'nat-20');
      modalD20Badge.classList.toggle('nat-1', !isPreview && outcome?.tier === 'nat-1');
      modalD20Badge.classList.toggle('preview-ghost', isPreview);
      modalD20Badge.textContent = isPreview ? '10' : String(outcome.dieRoll);
    }
    if (modalD20Math) {
      if (isPreview || !outcome) {
        modalD20Math.classList.add('hidden');
      } else {
        modalD20Math.textContent = outcome.mathText;
        modalD20Math.classList.remove('hidden');
      }
    }
    if (isPreview) {
      modalGradeTitle.textContent = 'Preview Mode — Uncast Scroll';
      modalGradeFlavor.textContent = 'Strike notes on the Spell Highway to roll a real 3D d20 Performance Check!';
    } else if (outcome) {
      modalGradeTitle.textContent = outcome.gradeTitle;
      modalGradeFlavor.textContent = outcome.gradeFlavor;
    }
  }

  let d20DisposeTimer = null;

  function disposeActiveD20Roller() {
    if (d20DisposeTimer !== null) {
      clearTimeout(d20DisposeTimer);
      d20DisposeTimer = null;
    }
    if (deps.activeD20Roller) {
      deps.activeD20Roller.dispose();
      deps.activeD20Roller = null;
    }
    if (d20TrayOverlay) {
      d20TrayOverlay.classList.add('hidden');
    }
  }

  /**
   * Open the Post-Song "Performance Check" Modal with 3D Physics D20 Roll & LitRPG Breakdown (Issue #25)
   */
  function openPerformanceCheckModal({ recordPlay = false } = {}) {
    pausePlayback();
    closeAllConservatoryPopovers();
    disposeActiveD20Roller();

    const totalAttempts =
      songSessionStats.cleanNotesHit +
      songSessionStats.fumbledNotesHit +
      songSessionStats.wrongOrMissedNotes;

    const accuracyRatio = totalAttempts > 0
      ? (songSessionStats.cleanNotesHit + songSessionStats.fumbledNotesHit * 0.5) / totalAttempts
      : 1.0;
    const accuracyPct = Math.round(accuracyRatio * 100);

    const songName = deps.currentSong ? deps.currentSong.title : 'Practice Session';
    const diffLabel = deps.currentSong?.difficulty?.label || 'Cantrip (1.0x XP)';
    modalSongSubtitle.textContent = `${songName} • ${diffLabel}`;

    // Capture prior weakBarHistory before recordSongPerformance updates it (Issue #108)
    const priorWeakBarHistory = deps.currentSong
      ? { ...(songPlayHistory[getSongHistoryKey(deps.currentSong)]?.weakBarHistory || {}) }
      : {};

    // Record song play history & Daily Quests BEFORE rendering XP/Level-Up banner (Issue #52, #53, #67, #162)
    // Only the natural end-of-song path records play history; the manual button does not (Issue #67)
    let questOutcome = { newlyCompletedQuests: [], totalBonusXp: 0 };
    let recordOutcome = { qualified: false, beatAccuracy: false, beatXp: false, bonusXp: 0, beatenRecords: [] };
    if (recordPlay && deps.currentSong && totalAttempts > 0) {
      const priorRecord = songPlayHistory[getSongHistoryKey(deps.currentSong)] || null;
      const runXpBeforeBonus = Math.max(0, Number(songSessionStats.songXpEarned) || 0);
      const totalSongNotes = Array.isArray(deps.currentSong.notes)
        ? deps.currentSong.notes.length
        : (Number(deps.currentSong.totalNotes) || 0);
      const qualifiedForLegends = isQualifyingLegendRun({
        stageViewMode: deps.stageViewMode,
        waitMode: Boolean(playbackState.waitMode),
        playbackSpeed: playbackState.playbackSpeed,
        handIsolation: playbackState.handIsolation,
        accompanimentMode: playbackState.accompanimentMode,
        rehearsalLoopEnabled: Boolean(rehearsalLoopState?.enabled),
        encoreDrillActive: Boolean(encoreDrillQueue?.active),
        totalAttempts,
        totalNotes: totalSongNotes
      });

      recordOutcome = evaluatePersonalRecordUpdate(priorRecord, {
        accuracyPct,
        runXp: runXpBeforeBonus,
        qualified: qualifiedForLegends
      });

      questOutcome = recordSongPerformance(
        deps.currentSong,
        accuracyPct,
        songSessionStats.maxSpellChain,
        runXpBeforeBonus,
        {
          waitMode: Boolean(playbackState.waitMode),
          cleanNotesHit: songSessionStats.cleanNotesHit,
          cleanChordRolls: songSessionStats.cleanChordRolls,
          recordOutcome
        }
      ) || questOutcome;

      if (recordOutcome.bonusXp > 0) {
        awardBardXp(recordOutcome.bonusXp, { skipSongXp: true });
        const labels = recordOutcome.beatenRecords.map((r) =>
          r.kind === 'accuracy' ? `Best Accuracy (${r.current}%)` : `Biggest XP (${r.current.toLocaleString()} XP)`
        );
        showGrimoireToast(`\uD83C\uDFC6 New Personal Record: ${labels.join(' & ')} (+${recordOutcome.bonusXp} Bonus XP)`, 'success');
      }

      const isFullDifficulty =
        (!playbackState.waitMode && playbackState.playbackSpeed >= 1.0 && playbackState.handIsolation === 'both') ||
        Number(deps.currentSong?.difficulty?.index) >= 9;
      checkAndUnlockAchievements({
        songsCompleted: bardProfile.songsCompleted,
        accuracyPct,
        totalAttempts,
        isFullDifficulty
      });

      if (typeof updateTutorialProgress === 'function') {
        updateTutorialProgress({ type: 'song-completed' });
      }
      if (typeof updateCollegeProgress === 'function') {
        updateCollegeProgress({
          songCompleted: true,
          waitMode: Boolean(playbackState.waitMode),
          playbackSpeed: playbackState.playbackSpeed,
          accuracyPct,
          cleanChordRolls: songSessionStats.cleanChordRolls,
          cleanNotesHit: songSessionStats.cleanNotesHit,
          maxSpellChain: songSessionStats.maxSpellChain
        });
      }
    }

    if (modalQuestsBanner && modalQuestsList && modalQuestsXpPill) {
      const completedList = questOutcome.newlyCompletedQuests || [];
      modalQuestsBanner.classList.toggle('hidden', completedList.length === 0);
      while (modalQuestsList.firstChild) {
        modalQuestsList.removeChild(modalQuestsList.firstChild);
      }
      if (completedList.length > 0) {
        modalQuestsXpPill.textContent = `+${questOutcome.totalBonusXp.toLocaleString()} Bonus XP`;
        for (const q of completedList) {
          const li = document.createElement('li');
          const nameSpan = document.createElement('span');
          nameSpan.textContent = `✓ ${q.title} — ${q.desc}`;
          const xpStrong = document.createElement('strong');
          xpStrong.textContent = `+${q.xpReward} XP`;
          li.appendChild(nameSpan);
          li.appendChild(xpStrong);
          modalQuestsList.appendChild(li);
        }
      }
    }

    if (modalRecordsBanner && modalRecordsList && modalRecordsXpPill) {
      const beaten = recordOutcome.beatenRecords || [];
      modalRecordsBanner.classList.toggle('hidden', beaten.length === 0);
      while (modalRecordsList.firstChild) {
        modalRecordsList.removeChild(modalRecordsList.firstChild);
      }
      if (beaten.length > 0) {
        modalRecordsXpPill.textContent = `+${recordOutcome.bonusXp.toLocaleString()} Bonus XP`;
        for (const rec of beaten) {
          const li = document.createElement('li');
          const descSpan = document.createElement('span');
          if (rec.kind === 'accuracy') {
            descSpan.textContent = `\uD83C\uDFAF Best Accuracy: ${rec.previous}% \u2192 ${rec.current}%`;
          } else {
            descSpan.textContent = `\u2728 Biggest XP: ${rec.previous.toLocaleString()} \u2192 ${rec.current.toLocaleString()} XP`;
          }
          const xpStrong = document.createElement('strong');
          xpStrong.textContent = `+${rec.bonusXp} XP`;
          li.appendChild(descSpan);
          li.appendChild(xpStrong);
          modalRecordsList.appendChild(li);
        }
      }
    }

    refreshModalXpSection();

    modalStatAccuracy.textContent = totalAttempts === 0 ? '—' : `${accuracyPct}%`;
    const inspiredSuffix = songSessionStats.maxSpellChain >= BARDIC_INSPIRATION_STREAK ? ' 🔥' : '';
    modalStatChain.textContent = `${songSessionStats.maxSpellChain}${inspiredSuffix}`;
    modalStatClean.textContent = String(songSessionStats.cleanNotesHit);
    modalStatFumbled.textContent = String(songSessionStats.fumbledNotesHit);
    modalStatRolls.textContent = `${songSessionStats.cleanChordRolls} Rolls • ${songSessionStats.wrongOrMissedNotes} Off-Key`;

    if (modalTimingSpreadPill) {
      const errs = songSessionStats.timingErrorsMs || [];
      if (!playbackState.waitMode && errs.length > 0) {
        const meanMs = Math.round(errs.reduce((acc, v) => acc + v, 0) / errs.length);
        const within35Pct = Math.round((errs.filter((v) => Math.abs(v) <= 35).length / errs.length) * 100);
        const earlyCnt = errs.filter((v) => v < -35).length;
        const onTimeCnt = errs.filter((v) => Math.abs(v) <= 35).length;
        const lateCnt = errs.filter((v) => v > 35).length;
        const biasLabel = Math.abs(meanMs) <= 12
          ? 'On Time'
          : (meanMs < 0 ? 'Slightly Early' : 'Slightly Late');
        const sign = meanMs > 0 ? '+' : '';
        const rhythmSummary = playbackState.rhythmMode
          ? ` • ✨ ${songSessionStats.rhythmPerfect} Perf / ${songSessionStats.rhythmGreat} Grt / ${songSessionStats.rhythmGood} Good`
          : '';
        modalTimingSpreadPill.innerHTML = '';
        const leftSpan = document.createElement('span');
        leftSpan.innerHTML = `⏱ Timing: <strong>${sign}${meanMs}ms (${biasLabel})</strong> • ${within35Pct}% Within ±35ms${rhythmSummary}`;
        const rightSpan = document.createElement('span');
        rightSpan.textContent = `Early ${earlyCnt} • Perfect ${onTimeCnt} • Late ${lateCnt}`;
        modalTimingSpreadPill.appendChild(leftSpan);
        modalTimingSpreadPill.appendChild(rightSpan);
        modalTimingSpreadPill.classList.remove('hidden');
        drawModalTimingScatter(errs);
      } else {
        modalTimingSpreadPill.classList.add('hidden');
        modalTimingSpreadPill.textContent = '';
        if (modalTimingScatterCanvas) modalTimingScatterCanvas.classList.add('hidden');
      }
    }

    if (modalCampaignResult) {
      modalCampaignResult.classList.add('hidden');
      modalCampaignResult.classList.remove('passed', 'failed');
    }
    renderPostSongBreakdown(totalAttempts, priorWeakBarHistory);
    updatePerformanceModalSetlistUI({ recordPlay, totalAttempts });
    performanceCheckModal.classList.remove('hidden');

    if (totalAttempts === 0) {
      applyD20OutcomeToModal(null, true);
      return;
    }

    // One roll per song: if already rolled this session, show settled outcome without re-rolling
    if (songSessionStats.d20Outcome) {
      applyD20OutcomeToModal(songSessionStats.d20Outcome, false);
      return;
    }

    // Show pending state while the 3D physics die tumbles
    if (modalD20Badge) {
      modalD20Badge.textContent = '?';
      modalD20Badge.classList.remove('nat-20', 'nat-1', 'preview-ghost');
    }
    if (modalD20Math) {
      modalD20Math.classList.add('hidden');
    }
    if (d20GradeBanner) {
      d20GradeBanner.classList.remove('nat-20', 'nat-1');
    }
    modalGradeTitle.textContent = 'Rolling Performance Check...';
    modalGradeFlavor.textContent = 'The golden d20 tumbles across the tavern felt...';

    const reducedMotion = Boolean(
      typeof window !== 'undefined' &&
      window.matchMedia &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );

    if (!reducedMotion && d20TrayOverlay) {
      d20TrayOverlay.classList.remove('hidden');
    }

    if (d20TrayCanvasHost) {
      let settledSynchronously = false;
      deps.activeD20Roller = createD20TrayRoller(d20TrayCanvasHost, {
        reducedMotion,
        onBounce: (impact) => playDiceBounceSound(impact),
        onSettled: (rolledFace) => {
          settledSynchronously = true;
          const outcome = buildD20Outcome(rolledFace, accuracyPct, deps.currentSong);
          songSessionStats.d20Outcome = outcome;
          if (outcome.bonusXp > 0) {
            awardBardXp(outcome.bonusXp);
            refreshModalXpSection();
          }
          applyD20OutcomeToModal(outcome, false);
          if (typeof updateCollegeProgress === 'function') {
            updateCollegeProgress({ d20Total: outcome.total });
          }
          if (
            recordPlay &&
            totalAttempts > 0 &&
            typeof resolveCampaignVenueCheck === 'function' &&
            deps.activeCampaignVenueId &&
            !activeSetlistState.active
          ) {
            resolveCampaignVenueCheck(outcome.total);
          }
          if (outcome.tier === 'nat-20') {
            playNat20Flourish();
            checkAndUnlockAchievements({ rolledFace });
            refreshModalXpSection();
          } else if (outcome.tier === 'nat-1') {
            playNat1TomatoSound();
          }
          if (reducedMotion && d20TrayOverlay) {
            d20TrayOverlay.classList.add('hidden');
          }
          d20DisposeTimer = setTimeout(() => {
            d20DisposeTimer = null;
            disposeActiveD20Roller();
          }, reducedMotion ? 0 : 450);
        }
      });
      if (settledSynchronously && deps.activeD20Roller?.isFallback && d20TrayOverlay) {
        d20TrayOverlay.classList.add('hidden');
      }
    }
  }

  function closePerformanceCheckModal() {
    disposeActiveD20Roller();
    performanceCheckModal.classList.add('hidden');
  }

  // ============================================================================

  return {
    buildPostSongBreakdown,
    updateEncoreDrillBadge,
    armRehearsalLoopWindow,
    startEncoreDrill,
    practiceWeakRegion,
    getSongHistoryKey,
    renderPostSongBreakdown,
    playDiceBounceSound,
    playNat20Flourish,
    playNat1TomatoSound,
    computeBardicAccuracyMod,
    getSongPerformanceDC,
    buildD20Outcome,
    refreshModalXpSection,
    applyD20OutcomeToModal,
    disposeActiveD20Roller,
    openPerformanceCheckModal,
    closePerformanceCheckModal
  };
}

module.exports = { createPerformanceModalModule };
