'use strict';

/**
 * College of Keys — Issue #178: Arcane Drills Stage HUD & Controller
 * Non-blocking Warmup Dojo overlay above the 61-key canvas so MIDI, QWERTY, and Mouse
 * work naturally with live keyboard highlighting, audition playback, XP, and streaks.
 */

function createArcaneDrillsUI(deps) {
  const {
    arcaneDrillsApi,
    pausePlayback,
    clearAllHeldInputNotes,
    hideTavernMenu,
    isTavernMenuVisible,
    playAuditionNote,
    awardBardXp,
    recordPracticeDayActivity,
    updateLitrpgHUD,
    updateTavernMenuStats,
    setStatusMessage,
    requestCanvasRender
  } = deps;

  const STORAGE_KEY = arcaneDrillsApi.ARCANE_DRILLS_STORAGE_KEY;

  const overlayEl = document.getElementById('arcane-drills-overlay');
  const keySelectEl = document.getElementById('drill-key-select');
  const typeSelectEl = document.getElementById('drill-type-select');
  const handSelectEl = document.getElementById('drill-hand-select');
  const stepPromptEl = document.getElementById('drill-step-prompt');
  const stepDegreeEl = document.getElementById('drill-step-degree');
  const progressTextEl = document.getElementById('drill-progress-text');
  const progressFillEl = document.getElementById('drill-progress-fill');
  const accuracyTextEl = document.getElementById('drill-accuracy-text');
  const streakTextEl = document.getElementById('drill-streak-text');
  const lifetimeTextEl = document.getElementById('drill-lifetime-text');
  const completeCardEl = document.getElementById('drill-complete-card');
  const completeSummaryEl = document.getElementById('drill-complete-summary');
  const btnDemoEl = document.getElementById('btn-drill-demo');
  const btnRestartEl = document.getElementById('btn-drill-restart');
  const btnExitEl = document.getElementById('btn-drill-exit');
  const btnNextKeyEl = document.getElementById('btn-drill-next-key');
  const btnRepeatEl = document.getElementById('btn-drill-repeat');

  let active = false;
  let currentDrill = null;
  let session = null;
  let wrongFlashMidi = null;
  let wrongFlashUntilMs = 0;
  let demoTimers = [];

  function loadPrefs() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          return {
            key: parsed.key || 'C',
            drillId: parsed.drillId || 'scale_major',
            hand: parsed.hand || 'rh',
            completedCount: Math.max(0, Number(parsed.completedCount) || 0)
          };
        }
      }
    } catch {
      // ignore storage errors
    }
    return { key: 'C', drillId: 'scale_major', hand: 'rh', completedCount: 0 };
  }

  function savePrefs(patch = {}) {
    const prev = loadPrefs();
    const next = { ...prev, ...patch };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
    return next;
  }

  function clearDemoTimers() {
    for (const id of demoTimers) clearTimeout(id);
    demoTimers = [];
  }

  function populateSelectors() {
    const prefs = loadPrefs();
    if (keySelectEl && keySelectEl.options.length === 0) {
      for (const k of arcaneDrillsApi.DRILL_KEYS) {
        const opt = document.createElement('option');
        opt.value = k;
        opt.textContent = k;
        keySelectEl.appendChild(opt);
      }
    }
    if (typeSelectEl && typeSelectEl.options.length === 0) {
      const groups = {
        scales: document.createElement('optgroup'),
        chords: document.createElement('optgroup'),
        progressions: document.createElement('optgroup')
      };
      groups.scales.label = 'Scales & Modes';
      groups.chords.label = 'Chords & Inversions';
      groups.progressions.label = 'Progressions';

      for (const item of arcaneDrillsApi.DRILL_CATALOG) {
        const opt = document.createElement('option');
        opt.value = item.id;
        opt.textContent = item.name;
        (groups[item.category] || groups.scales).appendChild(opt);
      }
      typeSelectEl.appendChild(groups.scales);
      typeSelectEl.appendChild(groups.chords);
      typeSelectEl.appendChild(groups.progressions);
    }

    if (keySelectEl) keySelectEl.value = prefs.key;
    if (typeSelectEl) typeSelectEl.value = prefs.drillId;
    if (handSelectEl) handSelectEl.value = prefs.hand;
  }

  function startSelectedDrill() {
    clearDemoTimers();
    const key = keySelectEl ? keySelectEl.value : 'C';
    const drillId = typeSelectEl ? typeSelectEl.value : 'scale_major';
    const hand = handSelectEl ? handSelectEl.value : 'rh';

    savePrefs({ key, drillId, hand });
    currentDrill = arcaneDrillsApi.generateDrill({ key, drillId, hand });
    session = arcaneDrillsApi.createDrillSession(currentDrill);
    wrongFlashMidi = null;
    wrongFlashUntilMs = 0;

    if (completeCardEl) completeCardEl.classList.add('hidden');
    renderHUD();
    if (typeof requestCanvasRender === 'function') requestCanvasRender();
  }

  function renderHUD() {
    if (!session || !currentDrill) return;
    const p = session.getProgress();
    const pct = p.totalSteps > 0 ? Math.round((p.stepIndex / p.totalSteps) * 100) : 0;

    if (progressTextEl) {
      progressTextEl.textContent = `Step ${Math.min(p.stepIndex + 1, p.totalSteps)} / ${p.totalSteps}`;
    }
    if (progressFillEl) {
      progressFillEl.style.width = `${p.completed ? 100 : pct}%`;
    }
    if (accuracyTextEl) {
      accuracyTextEl.textContent = `${p.accuracyPct}% Acc`;
    }
    if (streakTextEl) {
      streakTextEl.textContent = `Streak ${p.currentStreak}`;
    }
    if (lifetimeTextEl) {
      const prefs = loadPrefs();
      lifetimeTextEl.textContent = `${prefs.completedCount} Drills Done`;
    }

    if (p.completed) {
      if (stepPromptEl) stepPromptEl.textContent = `${currentDrill.name} Complete!`;
      if (stepDegreeEl) stepDegreeEl.textContent = `Accuracy ${p.accuracyPct}% • Best Streak ${p.bestStreak}`;
    } else if (p.currentStep) {
      if (stepPromptEl) stepPromptEl.textContent = p.currentStep.label;
      if (stepDegreeEl) stepDegreeEl.textContent = p.currentStep.degreeLabel;
    }
  }

  function handleDrillCompleted(progress) {
    const prefs = loadPrefs();
    savePrefs({ completedCount: prefs.completedCount + 1 });

    const xp = Math.max(10, Number(progress.xpEarned) || 25);
    if (typeof recordPracticeDayActivity === 'function') {
      recordPracticeDayActivity({ type: 'drill', xpEarned: xp });
    }
    if (typeof awardBardXp === 'function') {
      awardBardXp(xp, { skipSongXp: true });
    }
    if (typeof updateLitrpgHUD === 'function') updateLitrpgHUD();
    if (typeof updateTavernMenuStats === 'function') updateTavernMenuStats();

    if (completeSummaryEl) {
      const secs = Math.max(1, Math.round((progress.elapsedMs || 0) / 1000));
      completeSummaryEl.textContent =
        `+${xp} Warmup XP • ${progress.accuracyPct}% Accuracy • ${secs}s • Practice Streak Updated`;
    }
    if (completeCardEl) completeCardEl.classList.remove('hidden');
    if (typeof setStatusMessage === 'function') {
      setStatusMessage(`Arcane Drill complete: ${currentDrill.name} (+${xp} XP)`);
    }
    renderHUD();
  }

  function handleNoteOn(midi) {
    if (!active || !session) return false;
    const res = session.handleNoteOn(midi);
    if (res.wrongKey) {
      wrongFlashMidi = midi;
      wrongFlashUntilMs = Date.now() + 280;
    } else {
      wrongFlashMidi = null;
    }
    renderHUD();
    if (res.completed) {
      handleDrillCompleted(res.progress);
    }
    if (typeof requestCanvasRender === 'function') requestCanvasRender();
    return true;
  }

  function playDrillDemo() {
    if (!currentDrill || typeof playAuditionNote !== 'function') return;
    clearDemoTimers();
    const stepMs = currentDrill.category === 'scales' ? 280 : 580;
    currentDrill.steps.forEach((step, idx) => {
      const id = setTimeout(() => {
        if (!active) return;
        for (const m of step.targetMidis) {
          playAuditionNote(m, stepMs / 1000 * 0.9, 0.72);
        }
      }, idx * stepMs);
      demoTimers.push(id);
    });
  }

  function openDrills() {
    if (typeof isTavernMenuVisible === 'function' && isTavernMenuVisible()) {
      if (typeof hideTavernMenu === 'function') hideTavernMenu();
    }
    if (typeof pausePlayback === 'function') pausePlayback();
    if (typeof clearAllHeldInputNotes === 'function') clearAllHeldInputNotes();

    populateSelectors();
    active = true;
    if (overlayEl) overlayEl.classList.remove('hidden');
    startSelectedDrill();
  }

  function closeDrills() {
    if (!active) return;
    clearDemoTimers();
    active = false;
    wrongFlashMidi = null;
    if (overlayEl) overlayEl.classList.add('hidden');
    if (typeof requestCanvasRender === 'function') requestCanvasRender();
  }

  function getDrillKeyHighlights() {
    if (!active || !session || !currentDrill) {
      return { active: false, targetMap: null, contextPitchClasses: null, wrongFlashMidi: null };
    }
    const p = session.getProgress();
    const targetMap = new Map();
    if (p.currentStep) {
      const hitSet = new Set(p.hitTargets || []);
      for (const m of p.currentStep.lhMidis) {
        targetMap.set(m, { handTrack: 2, hit: hitSet.has(m) });
      }
      for (const m of p.currentStep.rhMidis) {
        targetMap.set(m, { handTrack: 1, hit: hitSet.has(m) });
      }
    }
    const now = Date.now();
    const activeWrong = wrongFlashMidi !== null && now <= wrongFlashUntilMs ? wrongFlashMidi : null;
    return {
      active: true,
      targetMap,
      contextPitchClasses: new Set(currentDrill.contextPitchClasses || []),
      wrongFlashMidi: activeWrong
    };
  }

  // Bind UI events
  if (keySelectEl) keySelectEl.addEventListener('change', startSelectedDrill);
  if (typeSelectEl) typeSelectEl.addEventListener('change', startSelectedDrill);
  if (handSelectEl) handSelectEl.addEventListener('change', startSelectedDrill);
  if (btnDemoEl) btnDemoEl.addEventListener('click', playDrillDemo);
  if (btnRestartEl) btnRestartEl.addEventListener('click', startSelectedDrill);
  if (btnRepeatEl) btnRepeatEl.addEventListener('click', startSelectedDrill);
  if (btnExitEl) btnExitEl.addEventListener('click', closeDrills);
  if (btnNextKeyEl) {
    btnNextKeyEl.addEventListener('click', () => {
      if (keySelectEl) {
        keySelectEl.value = arcaneDrillsApi.getNextCircleOfFifthsKey(keySelectEl.value);
      }
      startSelectedDrill();
    });
  }

  return {
    openDrills,
    closeDrills,
    isActive: () => active,
    handleNoteOn,
    getDrillKeyHighlights,
    startSelectedDrill,
    playDrillDemo
  };
}

if (typeof window !== 'undefined') {
  window.createArcaneDrillsUI = createArcaneDrillsUI;
}
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { createArcaneDrillsUI };
}
