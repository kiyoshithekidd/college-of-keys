'use strict';

/**
 * College of Keys — Issue #184: Extracted 6-Stem Mixer, Live Audio Sync & Audition Module
 * Encapsulates stem mix / vocal-harmony DSP application, Mark-Beat-1 audition,
 * onset auto-align, and backing-audio drift sync.
 */

function createAudioEngineModule(deps) {
  const {
    fs, path, pathToFileURL,
    Tone, playbackState, grimoireSpells,
    computeVocalMixMatrixGains, isStemAudibleInMix,
    renderGrimoireSidebar, getBackingAudioVolumeFromSlider, showGrimoireToast,
    audioSyncPopover
  } = deps;

  function applyCurrentStemMixToAudioElements() {
    if (!deps.currentSong?.stemAudioEls) {
      applyKaraokeKeyShiftToAudioElements();
      return;
    }
    const mix = normalizeStemMix(deps.currentSong.stemMix);
    deps.currentSong.stemMix = mix;
    const vMix = normalizeVocalMix(deps.currentSong.vocalMix);
    deps.currentSong.vocalMix = vMix;
    const vol = getBackingAudioVolumeFromSlider();

    const hasDiscreteVocalStems = Boolean(
      deps.currentSong.stemAudioEls.vocals_lead && deps.currentSong.stemAudioEls.vocals_backing
    );
    const isVocalModeActive = deps.stageViewMode === 'karaoke' || deps.currentSong.activeHighwayInstrument === 'vocals';
    const vocalStemAudible = isStemAudibleInMix('vocals', mix, playbackState.backingBandEnabled);

    for (const stemName of STEM_NAMES) {
      const stEl = deps.currentSong.stemAudioEls[stemName];

      if (stemName === 'vocals') {
        if (hasDiscreteVocalStems) {
          // Discrete AI Lead + Backing stems drive the voice; mute combined vocals.wav if present
          if (stEl) stEl.muted = true;
          const gains = computeVocalMixMatrixGains({
            leadVolume: isVocalModeActive ? vMix.leadVolume : 1.0,
            harmoniesEnabled: isVocalModeActive ? vMix.harmoniesEnabled : true,
            masterVolume: vol,
            backingBandEnabled: playbackState.backingBandEnabled,
            vocalStemAudible
          });
          const leadEl = deps.currentSong.stemAudioEls.vocals_lead;
          const backEl = deps.currentSong.stemAudioEls.vocals_backing;
          leadEl.volume = gains.discreteLeadGain;
          leadEl.muted = !vocalStemAudible || gains.discreteLeadGain <= 0.001;
          backEl.volume = gains.discreteBackingGain;
          backEl.muted = !vocalStemAudible || gains.discreteBackingGain <= 0.001;
          continue;
        }
        if (!stEl) continue;

        // Single stereo vocals.wav stem: apply Lead Vocal % & Harmonies ON/OFF via Stereo Mid/Side Matrix
        const effectiveLead = isVocalModeActive ? vMix.leadVolume : 1.0;
        const effectiveHarm = isVocalModeActive ? vMix.harmoniesEnabled : true;
        const gains = computeVocalMixMatrixGains({
          leadVolume: effectiveLead,
          harmoniesEnabled: effectiveHarm,
          masterVolume: vol,
          backingBandEnabled: playbackState.backingBandEnabled,
          vocalStemAudible
        });
        const needsMatrix = isVocalModeActive && (effectiveLead < 0.99 || !effectiveHarm);
        if (needsMatrix && !deps.currentSong.midSideVocalProcessor && typeof Tone !== 'undefined' && Tone.context?.rawContext) {
          deps.currentSong.midSideVocalProcessor = createMidSideVocalProcessor(Tone.context.rawContext, stEl);
        }
        if (deps.currentSong.midSideVocalProcessor) {
          stEl.volume = 1.0;
          stEl.muted = !vocalStemAudible || (gains.midGain <= 0.001 && gains.sideGain <= 0.001);
          deps.currentSong.midSideVocalProcessor.updateGains(gains.midGain, gains.sideGain);
        } else {
          stEl.volume = gains.discreteLeadGain;
          stEl.muted = !vocalStemAudible || gains.discreteLeadGain <= 0.001;
        }
        continue;
      }

      if (!stEl) continue;
      stEl.volume = vol;
      stEl.muted = !isStemAudibleInMix(stemName, mix, playbackState.backingBandEnabled);
    }
    applyKaraokeKeyShiftToAudioElements();
  }

  function renderStemMixerUI() {
    if (!stemMixerSection) return;
    const hasStems = Boolean(
      deps.currentSong?.stems &&
      deps.currentSong?.stemAudioEls &&
      Object.keys(deps.currentSong.stemAudioEls).length > 0
    );
    stemMixerSection.classList.toggle('hidden', !hasStems);
    if (!hasStems || !stemMixerGrid) return;

    const mix = normalizeStemMix(deps.currentSong.stemMix);
    for (const stemName of STEM_NAMES) {
      const row = stemMixerGrid.querySelector(`.stem-mixer-row[data-stem="${stemName}"]`);
      const muteBtn = stemMixerGrid.querySelector(`[data-stem-mute="${stemName}"]`);
      const soloBtn = stemMixerGrid.querySelector(`[data-stem-solo="${stemName}"]`);
      const hasFile = Boolean(deps.currentSong.stemAudioEls[stemName]);
      const stState = mix[stemName] || { muted: false, solo: false };
      const audible = hasFile && isStemAudibleInMix(stemName, mix, true);

      if (row) {
        row.classList.toggle('stem-unavailable', !hasFile);
        row.classList.toggle('stem-inaudible', hasFile && !audible);
      }
      if (muteBtn) {
        muteBtn.disabled = !hasFile;
        muteBtn.classList.toggle('active', Boolean(stState.muted));
        muteBtn.setAttribute('aria-pressed', stState.muted ? 'true' : 'false');
      }
      if (soloBtn) {
        soloBtn.disabled = !hasFile;
        soloBtn.classList.toggle('active', Boolean(stState.solo));
        soloBtn.setAttribute('aria-pressed', stState.solo ? 'true' : 'false');
      }
    }
  }

  function toggleStemMute(stemName) {
    if (!deps.currentSong?.stems || !STEM_NAMES.includes(stemName)) return;
    const mix = normalizeStemMix(deps.currentSong.stemMix);
    mix[stemName].muted = !mix[stemName].muted;
    if (mix[stemName].muted) {
      mix[stemName].solo = false;
    }
    deps.currentSong.stemMix = mix;
    applyCurrentStemMixToAudioElements();
    persistCurrentSongCalibration();
    renderStemMixerUI();
  }

  function toggleStemSolo(stemName) {
    if (!deps.currentSong?.stems || !STEM_NAMES.includes(stemName)) return;
    const mix = normalizeStemMix(deps.currentSong.stemMix);
    mix[stemName].solo = !mix[stemName].solo;
    if (mix[stemName].solo) {
      mix[stemName].muted = false;
    }
    deps.currentSong.stemMix = mix;
    applyCurrentStemMixToAudioElements();
    persistCurrentSongCalibration();
    renderStemMixerUI();
  }

  function resetStemMixToDefault() {
    if (!deps.currentSong?.stems) return;
    const activeInst = deps.currentSong.activeHighwayInstrument || 'piano';
    const nextMix = createDefaultStemMix();
    for (const st of STEM_NAMES) {
      nextMix[st] = { muted: st === activeInst, solo: false };
    }
    deps.currentSong.stemMix = normalizeStemMix(nextMix);
    applyCurrentStemMixToAudioElements();
    persistCurrentSongCalibration();
    renderStemMixerUI();
  }

  function applyLiveAudioSyncCalibration({ nextOffsetSec, nextTempoRatio, statusMessage = null } = {}) {
    if (!deps.currentSong) return;
    if (nextOffsetSec !== undefined) {
      deps.currentSong.audioOffsetSec = clampAudioOffsetSec(nextOffsetSec);
    }
    if (nextTempoRatio !== undefined) {
      deps.currentSong.audioTempoRatio = clampAudioTempoRatio(nextTempoRatio);
    }
    deps.currentSong.hasCustomBundle = Boolean(
      deps.currentSong.sheetMusicPath ||
      deps.currentSong.backingAudioPath ||
      deps.currentSong.stems ||
      deps.currentSong.youtubeUrl ||
      deps.currentSong.spotifyUrl ||
      Math.abs(deps.currentSong.audioOffsetSec || 0) > 0.0001 ||
      Math.abs((deps.currentSong.audioTempoRatio ?? 1.0) - 1.0) > 0.0001 ||
      typeof deps.currentSong.midiCleanupOverride === 'boolean'
    );

    const effRate = getEffectiveBackingPlaybackRate(
      playbackState.playbackSpeed,
      deps.currentSong.audioTempoRatio
    );
    if (deps.currentSong.backingAudioEl) {
      deps.currentSong.backingAudioEl.preservesPitch = true;
      deps.currentSong.backingAudioEl.webkitPreservesPitch = true;
      deps.currentSong.backingAudioEl.playbackRate = effRate;
    }
    if (deps.currentSong.stemAudioEls) {
      for (const stEl of Object.values(deps.currentSong.stemAudioEls)) {
        if (!stEl) continue;
        stEl.preservesPitch = true;
        stEl.webkitPreservesPitch = true;
        stEl.playbackRate = effRate;
      }
    }
    seekBackingAudioToSongTime(playbackState.currentTime);

    persistCurrentSongCalibration();
    updateAudioSyncUI(statusMessage);
    syncBackingAudioElement(playbackState.currentTime);
  }

  function updateAudioSyncUI(customHint = null) {
    const hasStems = Boolean(
      deps.currentSong?.stems &&
      deps.currentSong?.stemAudioEls &&
      Object.keys(deps.currentSong.stemAudioEls).length > 0
    );
    const hasAudio = Boolean((deps.currentSong?.backingAudioPath && deps.currentSong?.backingAudioEl) || hasStems);
    if (audioSyncAnchor) {
      audioSyncAnchor.classList.toggle('hidden', !hasAudio);
    }
    if (settingsSyncRow) {
      settingsSyncRow.classList.toggle('hidden', !hasAudio);
    }
    if (!hasAudio) {
      stopAudioAudition();
      if (audioSyncPopover) audioSyncPopover.classList.add('hidden');
      if (btnAudioSync) {
        btnAudioSync.classList.remove('active', 'sync-non-zero');
        btnAudioSync.setAttribute('aria-expanded', 'false');
      }
      return;
    }

    renderStemMixerUI();
    if (typeof syncVocalMixUI === 'function') {
      syncVocalMixUI();
    }

    const off = clampAudioOffsetSec(deps.currentSong.audioOffsetSec || 0);
    const ratio = clampAudioTempoRatio(deps.currentSong.audioTempoRatio ?? 1.0);
    const offsetText = `${off >= 0 ? '+' : ''}${off.toFixed(2)}s`;
    const driftText = `${(ratio * 100).toFixed(1)}%`;
    const isNonZero = Math.abs(off) >= 0.005 || Math.abs(ratio - 1.0) >= 0.0005;

    if (syncBadgePill) {
      syncBadgePill.textContent = hasStems ? `6-Stem • ${offsetText}` : offsetText;
    }
    if (syncOffsetReadout) syncOffsetReadout.textContent = offsetText;
    if (syncDriftReadout) syncDriftReadout.textContent = driftText;
    if (btnAudioSync) btnAudioSync.classList.toggle('sync-non-zero', isNonZero || hasStems);

    if (syncStatusHint) {
      if (customHint) {
        syncStatusHint.textContent = customHint;
      } else if (!deps.audioAuditionEl && !deps.isAuditionPending) {
        const firstNoteSec = getFirstPlayableNoteSec(deps.currentSong);
        syncStatusHint.textContent = `First note at ${firstNoteSec.toFixed(2)}s • Offset ${offsetText} • Drift ${driftText}. Saves automatically per song.`;
      }
    }
  }

  function stopAudioAudition() {
    deps.auditionRequestSeq += 1;
    deps.isAuditionPending = false;
    if (deps.audioAuditionTimer) {
      clearInterval(deps.audioAuditionTimer);
      deps.audioAuditionTimer = null;
    }
    audioAuditionStartedAtMs = null;
    if (deps.audioAuditionEl) {
      try {
        deps.audioAuditionEl._disposed = true;
        deps.audioAuditionEl.pause();
        deps.audioAuditionEl.removeAttribute('src');
        deps.audioAuditionEl.load();
      } catch {
        // Ignore audition cleanup error
      }
      deps.audioAuditionEl = null;
    }
    if (btnSyncAudition) {
      btnSyncAudition.textContent = '\uD83D\uDD0A Audition 0:00';
    }
    if (btnSyncMarkBeat1) {
      btnSyncMarkBeat1.textContent = '\uD83C\uDFAF Mark Beat 1';
    }
  }

  async function startAudioAudition() {
    if (deps.audioAuditionEl || deps.isAuditionPending) {
      stopAudioAudition();
      updateAudioSyncUI('Audition stopped.');
      return;
    }
    const targetSong = deps.currentSong;
    if (!targetSong?.backingAudioPath || !fs.existsSync(targetSong.backingAudioPath)) return;

    const seq = ++deps.auditionRequestSeq;
    deps.isAuditionPending = true;
    pausePlayback();
    if (btnSyncAudition) btnSyncAudition.textContent = '\u23F9 Stop Audition';
    if (syncStatusHint) syncStatusHint.textContent = 'Starting audition from 0:00\u2026';

    let el = null;
    const disposeEl = (targetEl) => {
      if (!targetEl) return;
      try {
        targetEl._disposed = true;
        targetEl.pause();
        targetEl.removeAttribute('src');
        targetEl.load();
      } catch {
        // Ignore audition cleanup error
      }
    };

    try {
      await ensureAudioReady();
      if (seq !== deps.auditionRequestSeq || deps.currentSong !== targetSong || !fs.existsSync(targetSong.backingAudioPath)) {
        deps.isAuditionPending = false;
        if (!deps.audioAuditionEl && btnSyncAudition) {
          btnSyncAudition.textContent = '\uD83D\uDD0A Audition 0:00';
        }
        return;
      }

      el = new Audio(pathToFileURL(targetSong.backingAudioPath).href);
      el.preload = 'auto';
      el.volume = getBackingAudioVolumeFromSlider();
      el.preservesPitch = true;
      el.webkitPreservesPitch = true;
      el.playbackRate = 1.0;

      el.addEventListener('ended', () => {
        if (el._disposed) return;
        stopAudioAudition();
        updateAudioSyncUI('Audition finished.');
      });
      el.addEventListener('error', () => {
        if (el._disposed) return;
        stopAudioAudition();
        showGrimoireToast('Could not audition backing audio file.', 'warning');
      });

      deps.audioAuditionEl = el;
      audioAuditionStartedAtMs = performance.now();
      if (btnSyncAudition) btnSyncAudition.textContent = '\u23F9 Stop Audition';

      await el.play();
      if (seq !== deps.auditionRequestSeq || el._disposed || deps.currentSong !== targetSong) {
        disposeEl(el);
        if (deps.audioAuditionEl === el) deps.audioAuditionEl = null;
        deps.isAuditionPending = false;
        return;
      }

      deps.isAuditionPending = false;
      if (btnSyncMarkBeat1) btnSyncMarkBeat1.textContent = '\uD83C\uDFAF Tap Beat 1 Now!';
      if (syncStatusHint) {
        syncStatusHint.textContent = 'Listening from 0:00… click "🎯 Tap Beat 1 Now!" when Measure 1 / Beat 1 hits.';
      }
      deps.audioAuditionTimer = setInterval(() => {
        if (!deps.audioAuditionEl || deps.audioAuditionEl._disposed) return;
        const elapsed = Number(deps.audioAuditionEl.currentTime) || 0;
        if (syncStatusHint) {
          syncStatusHint.textContent = `Auditioning: ${elapsed.toFixed(2)}s — Tap "🎯 Tap Beat 1 Now!" on Beat 1`;
        }
      }, 80);
    } catch (err) {
      disposeEl(el);
      if (seq === deps.auditionRequestSeq) {
        stopAudioAudition();
        showGrimoireToast(`Could not play audition audio: ${err?.message || err}`, 'warning');
      } else {
        deps.isAuditionPending = false;
      }
    }
  }

  function handleMarkBeat1Click() {
    if (!deps.currentSong?.backingAudioPath) return;
    const isActivelyPlaying = Boolean(deps.audioAuditionEl && !deps.audioAuditionEl.paused && deps.audioAuditionEl.currentTime > 0);
    if (deps.isAuditionPending && !isActivelyPlaying) return;
    if (!deps.audioAuditionEl || deps.audioAuditionEl.paused) {
      startAudioAudition();
      return;
    }

    const heardSec = Math.max(0, Number(deps.audioAuditionEl.currentTime) || 0);
    const firstNoteSec = getFirstPlayableNoteSec(deps.currentSong);
    const nextOffset = computeAudioOffsetForBeat1(heardSec, firstNoteSec, deps.currentSong.audioTempoRatio);
    stopAudioAudition();

    applyLiveAudioSyncCalibration({
      nextOffsetSec: nextOffset,
      statusMessage: `Beat 1 locked at ${heardSec.toFixed(2)}s (Start Offset ${nextOffset >= 0 ? '+' : ''}${nextOffset.toFixed(2)}s).`
    });
    showGrimoireToast(`\uD83C\uDFAF Beat 1 locked (${heardSec.toFixed(2)}s \u2192 Offset ${nextOffset >= 0 ? '+' : ''}${nextOffset.toFixed(2)}s)`);
  }

  async function runAutoAlignFirstOnset() {
    const targetSong = deps.currentSong;
    if (!targetSong?.backingAudioPath || !fs.existsSync(targetSong.backingAudioPath)) return;
    pausePlayback();
    stopAudioAudition();

    if (btnSyncAutoAlign) {
      btnSyncAutoAlign.disabled = true;
      btnSyncAutoAlign.textContent = '\u23F3 Analyzing...';
    }
    updateAudioSyncUI('Scanning backing audio waveform for first musical onset...');

    let audioCtx = null;
    try {
      const fileBuf = await fs.promises.readFile(targetSong.backingAudioPath);
      if (deps.currentSong !== targetSong) return;
      const arrayBuf = fileBuf.buffer.slice(fileBuf.byteOffset, fileBuf.byteOffset + fileBuf.byteLength);
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) {
        throw new Error('Web Audio API unavailable for decoding.');
      }
      audioCtx = new AudioCtx();
      const decoded = await audioCtx.decodeAudioData(arrayBuf);
      if (deps.currentSong !== targetSong) return;

      const numChannels = Math.max(1, decoded.numberOfChannels || 1);
      const maxSamples = Math.min(decoded.length, Math.floor(decoded.sampleRate * 40));
      const mono = new Float32Array(maxSamples);
      for (let ch = 0; ch < numChannels; ch++) {
        const chData = decoded.getChannelData(ch);
        for (let i = 0; i < maxSamples; i++) {
          mono[i] += chData[i] / numChannels;
        }
      }

      const onsetSec = detectFirstAudioOnsetSec(mono, decoded.sampleRate, 35);
      if (deps.currentSong !== targetSong) return;
      if (onsetSec === null) {
        updateAudioSyncUI('No distinct onset detected automatically. Try Audition 0:00 + Mark Beat 1.');
        showGrimoireToast('Could not detect Beat 1 automatically — tap Mark Beat 1 while auditioning.', 'warning');
        return;
      }

      const firstNoteSec = getFirstPlayableNoteSec(targetSong);
      const nextOffset = computeAudioOffsetForBeat1(onsetSec, firstNoteSec, targetSong.audioTempoRatio);
      applyLiveAudioSyncCalibration({
        nextOffsetSec: nextOffset,
        statusMessage: `Auto-Aligned! First onset at ${onsetSec.toFixed(2)}s \u2192 Offset ${nextOffset >= 0 ? '+' : ''}${nextOffset.toFixed(2)}s.`
      });
      showGrimoireToast(`\u26A1 Auto-Aligned! Onset ${onsetSec.toFixed(2)}s \u2192 Offset ${nextOffset >= 0 ? '+' : ''}${nextOffset.toFixed(2)}s`);
    } catch (err) {
      if (deps.currentSong === targetSong) {
        updateAudioSyncUI(`Auto-Align failed: ${err?.message || err}`);
        showGrimoireToast(`Auto-Align failed: ${err?.message || err}`, 'warning');
      }
    } finally {
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
      if (btnSyncAutoAlign) {
        btnSyncAutoAlign.disabled = false;
        btnSyncAutoAlign.textContent = '\u26A1 Auto-Align';
      }
    }
  }

  /**
   * Synchronize paired .wav / .mp3 backing audio element or 6-stem audio elements (Issue #31, #76, #41).
   * Called independently of `audioTriggerEnd >= prevTime` so backing audio immediately
   * pauses when Wait Mode freezes at a chord or when Backing Band is toggled OFF.
   */
  function syncBackingAudioElement(currentTime = playbackState.currentTime) {
    if (!deps.currentSong) return;
    const stemEntries = deps.currentSong.stemAudioEls ? Object.entries(deps.currentSong.stemAudioEls) : [];
    const hasActiveStems = stemEntries.length > 0;
    if (!deps.currentSong.backingAudioEl && !hasActiveStems) return;

    const mapped = getMappedBackingAudioTime(currentTime, {
      audioOffsetSec: deps.currentSong.audioOffsetSec,
      audioTempoRatio: deps.currentSong.audioTempoRatio
    });
    const effRate = getEffectiveBackingPlaybackRate(
      playbackState.playbackSpeed,
      deps.currentSong.audioTempoRatio
    );

    const syncSingleAudioEl = (audioEl, forceMuteOrPause = false, mutedFlag = false) => {
      if (!audioEl) return;
      const nextMuted = Boolean(mutedFlag);
      if (audioEl.muted !== nextMuted) {
        audioEl.muted = nextMuted;
      }
      const audioDur = audioEl.duration;
      const pastAudioEnd = Number.isFinite(audioDur) && audioDur > 0 && mapped.clampedAudioTime >= audioDur - 0.02;

      const shouldPlay =
        !forceMuteOrPause &&
        playbackState.isPlaying &&
        playbackState.backingBandEnabled &&
        !playbackState.isWaitingForStrike &&
        !mapped.isBeforeAudioStart &&
        !pastAudioEnd &&
        currentTime < deps.currentSong.duration;

      if (shouldPlay) {
        if (!audioEl.preservesPitch) audioEl.preservesPitch = true;
        if (!audioEl.webkitPreservesPitch) audioEl.webkitPreservesPitch = true;
        if (Math.abs((Number(audioEl.playbackRate) || 1) - effRate) > 0.0005) {
          audioEl.playbackRate = effRate;
        }
        const targetAudioTime = Number.isFinite(audioDur) && audioDur > 0
          ? Math.min(mapped.clampedAudioTime, Math.max(0, audioDur - 0.02))
          : mapped.clampedAudioTime;

        if (audioEl.paused) {
          if (!audioEl._playPending) {
            if (Math.abs((Number(audioEl.currentTime) || 0) - targetAudioTime) > 0.05) {
              try {
                audioEl.currentTime = targetAudioTime;
              } catch {
                // Ignore seek errors before audio metadata is ready
              }
            }
            audioEl._playPending = true;
            Promise.resolve(audioEl.play())
              .catch(() => {})
              .finally(() => {
                audioEl._playPending = false;
              });
          }
        } else if (Math.abs(audioEl.currentTime - targetAudioTime) > 0.28) {
          try {
            audioEl.currentTime = targetAudioTime;
          } catch {
            // Ignore seek errors
          }
        }
      } else if (!audioEl.paused || audioEl._playPending) {
        audioEl.pause();
      }
    };

    if (hasActiveStems) {
      // Pause full mix backingAudioEl when 6-stem audio elements are active so it doesn't double-play
      if (deps.currentSong.backingAudioEl && !deps.currentSong.backingAudioEl.paused) {
        deps.currentSong.backingAudioEl.pause();
      }
      const mix = deps.currentSong.stemMix || normalizeStemMix(null);
      const vMix = normalizeVocalMix(deps.currentSong.vocalMix);
      const hasDiscreteVocalStems = Boolean(
        deps.currentSong.stemAudioEls.vocals_lead && deps.currentSong.stemAudioEls.vocals_backing
      );
      const isVocalModeActive = deps.stageViewMode === 'karaoke' || deps.currentSong.activeHighwayInstrument === 'vocals';
      const vocalStemAudible = isStemAudibleInMix('vocals', mix, playbackState.backingBandEnabled);
      const vocalGains = computeVocalMixMatrixGains({
        leadVolume: isVocalModeActive ? vMix.leadVolume : 1.0,
        harmoniesEnabled: isVocalModeActive ? vMix.harmoniesEnabled : true,
        masterVolume: 1.0,
        backingBandEnabled: playbackState.backingBandEnabled,
        vocalStemAudible
      });

      const stemsPlaying =
        playbackState.isPlaying &&
        playbackState.backingBandEnabled &&
        !playbackState.isWaitingForStrike &&
        !mapped.isBeforeAudioStart &&
        currentTime < deps.currentSong.duration;

      if (stemsPlaying && deps.currentSong.midSideVocalProcessor && typeof deps.currentSong.midSideVocalProcessor.resumeContext === 'function') {
        deps.currentSong.midSideVocalProcessor.resumeContext();
      }

      for (const [stemName, stEl] of stemEntries) {
        let forceMute = false;
        if (stemName === 'vocals') {
          if (hasDiscreteVocalStems) {
            forceMute = true;
          } else {
            forceMute = !vocalStemAudible || (vocalGains.midGain <= 0.001 && vocalGains.sideGain <= 0.001);
          }
        } else if (stemName === 'vocals_lead') {
          forceMute = !vocalStemAudible || vocalGains.discreteLeadGain <= 0.001;
        } else if (stemName === 'vocals_backing') {
          forceMute = !vocalStemAudible || vocalGains.discreteBackingGain <= 0.001;
        } else {
          forceMute = !isStemAudibleInMix(stemName, mix, playbackState.backingBandEnabled);
        }
        syncSingleAudioEl(stEl, false, forceMute);
      }
    } else if (deps.currentSong.backingAudioEl) {
      syncSingleAudioEl(deps.currentSong.backingAudioEl, false, false);
    }
  }

  function applyKaraokeKeyShiftToAudioElements() {
    if (!deps.currentSong) return;
    const isKaraoke = deps.stageViewMode === 'karaoke';
    const shift = isKaraoke
      ? Math.max(-6, Math.min(6, Math.round(Number(deps.currentSong.karaokeKeyShiftSemitones) || 0)))
      : 0;

    const createBus = deps.createKaraokePitchShiftBus;
    if (!deps.currentSong.karaokePitchShiftBus && shift === 0) return;

    if (!deps.currentSong.karaokePitchShiftBus && typeof createBus === 'function' && typeof Tone !== 'undefined' && Tone.context?.rawContext) {
      deps.currentSong.karaokePitchShiftBus = createBus({ Tone, audioContext: Tone.context.rawContext });
    }
    const bus = deps.currentSong.karaokePitchShiftBus;
    if (!bus) return;

    if (deps.currentSong.stemAudioEls) {
      for (const [stemName, stEl] of Object.entries(deps.currentSong.stemAudioEls)) {
        if (!stEl || stemName === 'drums') continue;
        if (stemName === 'vocals') {
          if (!deps.currentSong.midSideVocalProcessor && typeof Tone !== 'undefined' && Tone.context?.rawContext) {
            deps.currentSong.midSideVocalProcessor = createMidSideVocalProcessor(Tone.context.rawContext, stEl);
          }
          if (deps.currentSong.midSideVocalProcessor?.outputNode) {
            bus.attachMediaElement(stEl, { customSourceNode: deps.currentSong.midSideVocalProcessor.outputNode });
          } else {
            bus.attachMediaElement(stEl);
          }
        } else {
          bus.attachMediaElement(stEl);
        }
      }
    } else if (deps.currentSong.backingAudioEl) {
      bus.attachMediaElement(deps.currentSong.backingAudioEl);
    }
    bus.setSemitones(shift);
  }

  return {
    applyCurrentStemMixToAudioElements,
    applyKaraokeKeyShiftToAudioElements,
    renderStemMixerUI,
    toggleStemMute,
    toggleStemSolo,
    resetStemMixToDefault,
    applyLiveAudioSyncCalibration,
    updateAudioSyncUI,
    stopAudioAudition,
    startAudioAudition,
    handleMarkBeat1Click,
    runAutoAlignFirstOnset,
    syncBackingAudioElement
  };
}

module.exports = { createAudioEngineModule };
