/* global window, performance */
'use strict';

/**
 * College of Keys — Issue #184: Extracted Highway & 61-Key Canvas Renderer Module
 * Encapsulates 61-key geometry, falling Spell Highway blocks, CC 64 Sustain lane,
 * particles/motes/runes, notation playhead compositing, and hit-testing.
 */

function createHighwayRenderer(deps) {
  const {
    MIN_MIDI, MAX_MIDI, BLACK_SEMITONES, CHORD_CLUSTER_WINDOW_SEC,
    canvas, canvasCtx, stageContainer,
    whiteKeys, blackKeys, keyGeometry, activeNotes,
    playbackState, rehearsalLoopState, notationRenderer,
    getEffectiveHighwayPxPerSec,
    parseKeySpecForDegrees, formatFallingNoteLabel, findFirstNoteIndexAtOrAfter,
    hasValidRehearsalLoop, updateChordBannerHUD, syncNotationWaitOverlayPill,
    drawLiveHitErrorBar, midiToNoteName,
    strikeParticles, strikeShockwaves, floatingRunes, ambientMotes
  } = deps;

  const ctx = canvasCtx;
  function computeKeyGeometry() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.floor(rect.width * dpr));
    canvas.height = Math.max(1, Math.floor(rect.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    deps.cachedCanvasWidth = width;
    deps.cachedCanvasHeight = height;

    const keyboardHeight = Math.max(145, Math.min(210, Math.round(height * 0.22)));
    const keyboardY = Math.max(1, height - keyboardHeight);

    let notationHeight = 0;
    let highwayTopY = 0;
    if (deps.stageViewMode === 'score') {
      notationHeight = Math.max(0, keyboardY);
      highwayTopY = keyboardY;
    } else if (deps.stageViewMode === 'split') {
      const maxSplitNotation = Math.max(120, keyboardY - 90);
      notationHeight = Math.max(
        0,
        Math.min(
          keyboardY,
          Math.max(Math.min(175, maxSplitNotation), Math.min(maxSplitNotation, Math.round(keyboardY * 0.52)))
        )
      );
      highwayTopY = notationHeight;
    }
    cachedNotationPaneHeight = notationHeight;
    deps.cachedHighwayTopY = highwayTopY;

    if (stageContainer) {
      stageContainer.style.setProperty('--notation-pane-height', `${notationHeight}px`);
      stageContainer.style.setProperty('--keyboard-height', `${keyboardHeight}px`);
    }

    whiteKeys.length = 0;
    blackKeys.length = 0;

    const totalWhiteKeys = 36;
    const whiteKeyWidth = width / totalWhiteKeys;

    let whiteIdx = 0;
    for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
      const semitone = midi % 12;
      const isBlack = BLACK_SEMITONES.has(semitone);
      if (!isBlack) {
        const keyObj = {
          midi,
          name: midiToNoteName(midi),
          isBlack: false,
          x: whiteIdx * whiteKeyWidth,
          y: keyboardY,
          width: whiteKeyWidth,
          height: keyboardHeight,
          whiteIndex: whiteIdx
        };
        keyGeometry[midi] = keyObj;
        whiteKeys.push(keyObj);
        whiteIdx++;
      }
    }

    const blackKeyWidth = whiteKeyWidth * 0.62;
    const blackKeyHeight = keyboardHeight * 0.62;

    for (let midi = MIN_MIDI; midi <= MAX_MIDI; midi++) {
      const semitone = midi % 12;
      if (BLACK_SEMITONES.has(semitone)) {
        const prevWhite = keyGeometry[midi - 1];
        const offsetRatio = BLACK_KEY_OFFSETS[semitone] || 0.5;
        const boundaryX = prevWhite.x + prevWhite.width;
        const x = boundaryX - blackKeyWidth * offsetRatio;

        const keyObj = {
          midi,
          name: midiToNoteName(midi),
          isBlack: true,
          x,
          y: keyboardY,
          width: blackKeyWidth,
          height: blackKeyHeight
        };
        keyGeometry[midi] = keyObj;
        blackKeys.push(keyObj);
      }
    }

    // Pre-build shared vertical LinearGradients for the 36 white keys and 25 black keys
    const makeVGrad = (y0, h, stops) => {
      const g = ctx.createLinearGradient(0, y0, 0, y0 + h);
      for (const [offset, color] of stops) {
        g.addColorStop(offset, color);
      }
      return g;
    };

    deps.cachedKeyGradients = {
      whiteIdle: makeVGrad(keyboardY, keyboardHeight, [[0, '#e8e2d5'], [0.88, '#f7f3eb'], [1, '#cfc6b4']]),
      whitePressed: makeVGrad(keyboardY, keyboardHeight, [[0, '#fff3b0'], [0.35, '#ffd700'], [1, '#c59b27']]),
      whiteLocked: makeVGrad(keyboardY, keyboardHeight, [[0, '#a7f3d0'], [0.4, '#34d399'], [1, '#059669']]),
      whiteGuideT1: makeVGrad(keyboardY, keyboardHeight, [[0, '#fff5b8'], [0.4, '#f5d76e'], [1, '#d9c589']]),
      whiteGuideT2: makeVGrad(keyboardY, keyboardHeight, [[0, '#b3f8ff'], [0.4, '#67e8f9'], [1, '#99d5e0']]),
      blackIdle: makeVGrad(keyboardY, blackKeyHeight, [[0, '#332920'], [0.8, '#18130e'], [1, '#0c0907']]),
      blackPressed: makeVGrad(keyboardY, blackKeyHeight, [[0, '#ffd700'], [0.5, '#e5a900'], [1, '#9c6f00']]),
      blackLocked: makeVGrad(keyboardY, blackKeyHeight, [[0, '#34d399'], [1, '#065f46']]),
      blackGuideT1: makeVGrad(keyboardY, blackKeyHeight, [[0, '#ffd700'], [1, '#6e5200']]),
      blackGuideT2: makeVGrad(keyboardY, blackKeyHeight, [[0, '#00e5ff'], [1, '#005662']])
    };
  }

  /**
   * Draw the 60 FPS falling glowing rectangles ("The Spell Highway")
   * Track 1 = Radiant Gold (#ffd700), Track 2 = Eldritch Blue (#00e5ff)
   * Also collects active strike-line notes so the 61-key piano can show guide highlights.
   */
  const reusableStrikeLineGuides = new Map();

  function drawFallingSpellHighway(strikeLineY, width, highwayTopY = 0, collectOnly = false) {
    reusableStrikeLineGuides.clear();
    const strikeLineGuides = reusableStrikeLineGuides; // midi -> { handTrack, lockedInWait }
    if (!deps.currentSong) return strikeLineGuides;

    const laneTopY = Math.max(0, highwayTopY);
    const laneHeight = Math.max(120, strikeLineY - laneTopY);
    playbackState.lastHighwayHeight = laneHeight;
    const curTime = playbackState.currentTime;
    const fallSpeed = getEffectiveHighwayPxPerSec(laneHeight);
    const visibleTimeWindow = collectOnly
      ? 0.5
      : Math.max(0.25, (laneHeight + 40) / fallSpeed);

    // Issue #179: Sustain Pedal (CC 64) left-edge hold ribbon & live indicator
    if (!collectOnly && playbackState.sustainLaneEnabled) {
      const spans = Array.isArray(deps.currentSong.sustainSpans) ? deps.currentSong.sustainSpans : [];
      const railX = 2;
      const railW = 8;
      ctx.save();
      ctx.fillStyle = 'rgba(212, 175, 55, 0.08)';
      ctx.fillRect(railX, laneTopY, railW, laneHeight);
      for (const sp of spans) {
        if (sp.endTime < curTime) continue;
        if (sp.startTime > curTime + visibleTimeWindow) break;
        const yBottom = Math.min(strikeLineY, strikeLineY - (sp.startTime - curTime) * fallSpeed);
        const yTop = Math.max(laneTopY, strikeLineY - (sp.endTime - curTime) * fallSpeed);
        const h = yBottom - yTop;
        if (h > 1) {
          ctx.fillStyle = 'rgba(250, 204, 21, 0.58)';
          ctx.beginPath();
          ctx.roundRect(railX + 1, yTop, railW - 2, h, 3);
          ctx.fill();
        }
      }
      if (deps.sustainPedalDown) {
        ctx.fillStyle = '#ffd700';
        ctx.beginPath();
        ctx.arc(railX + railW / 2, strikeLineY - 6, 4, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // Resolve key signature & transposition once per frame for Scale Degrees label mode (#179, #186)
    // notationScore.primaryKeySpec is already transposed by song.transposeSemitones
    const labelMode = playbackState.fallingNoteLabelMode || 'notes';
    let tonicPitchClass = 0;
    let keyIsMinor = false;
    if (labelMode === 'degrees') {
      if (deps.currentSong.notationScore?.primaryKeySpec) {
        const parsedKey = parseKeySpecForDegrees(deps.currentSong.notationScore.primaryKeySpec);
        tonicPitchClass = parsedKey.tonicPc;
        keyIsMinor = parsedKey.isMinor;
      } else {
        const rawKey = deps.currentSong.headerKeySignatures?.[0]?.key || deps.currentSong.keySignature || 'C';
        const parsedKey = parseKeySpecForDegrees(rawKey);
        tonicPitchClass = (parsedKey.tonicPc + (Number(deps.currentSong.transposeSemitones) || 0) + 120) % 12;
        keyIsMinor = parsedKey.isMinor;
      }
    }

    // 1. Draw scrolling horizontal beat/measure grid lines (honoring mid-song tempo/meter changes & pickup bars)
    if (!collectOnly && laneHeight > 0) {
      const scoreMeasures = deps.currentSong.notationScore?.measures;
      const windowEnd = curTime + visibleTimeWindow;
      ctx.save();

      if (Array.isArray(scoreMeasures) && scoreMeasures.length > 0) {
        const drawGridLine = (timeSec, isMeasureLine) => {
          if (timeSec < curTime || timeSec > windowEnd) return;
          const y = strikeLineY - (timeSec - curTime) * fallSpeed;
          if (y < laneTopY || y > strikeLineY) return;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.strokeStyle = isMeasureLine
            ? 'rgba(212, 175, 55, 0.22)'
            : 'rgba(186, 171, 147, 0.07)';
          ctx.lineWidth = isMeasureLine ? 1.5 : 1;
          ctx.stroke();
        };

        for (const m of scoreMeasures) {
          if (m.endTime < curTime) continue;
          if (m.startTime > windowEnd) break;

          drawGridLine(m.startTime, true);
          const mSpan = Math.max(0.05, m.endTime - m.startTime);
          const numBeats = Math.max(1, Number(m.numerator) || 4);
          if (m.isPickup) {
            const denom = Math.max(1, Number(m.denominator) || 4);
            const bpm = Math.max(30, deps.currentSong.bpm || 120);
            const approxBeat = (60 / bpm) * (4 / denom);
            for (let t = m.endTime - approxBeat; t > m.startTime + 0.02; t -= approxBeat) {
              drawGridLine(t, false);
            }
          } else {
            const beatStep = mSpan / numBeats;
            for (let b = 1; b < numBeats; b++) {
              drawGridLine(m.startTime + b * beatStep, false);
            }
          }
        }
      } else {
        const denominator = Math.max(1, deps.currentSong.timeSigDenominator || 4);
        const beatDur = (60 / Math.max(30, deps.currentSong.bpm)) * (4 / denominator);
        const beatsPerMeasure = Math.max(1, deps.currentSong.beatsPerMeasure || deps.currentSong.timeSigNumerator || 4);
        const firstBeatIdx = Math.max(0, Math.floor(curTime / beatDur));
        const lastBeatIdx = Math.ceil(windowEnd / beatDur);

        for (let b = firstBeatIdx; b <= lastBeatIdx; b++) {
          const beatTime = b * beatDur;
          const y = strikeLineY - (beatTime - curTime) * fallSpeed;
          if (y < laneTopY || y > strikeLineY) continue;

          const isMeasureLine = b % beatsPerMeasure === 0;
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(width, y);
          ctx.strokeStyle = isMeasureLine
            ? 'rgba(212, 175, 55, 0.22)'
            : 'rgba(186, 171, 147, 0.07)';
          ctx.lineWidth = isMeasureLine ? 1.5 : 1;
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 2. Helper to draw (or collect strike-line guides for) a track's falling notes
    const drawTrackNotes = (notes, handTrack, primaryHex, topHex, borderHex, glowRgba) => {
      const opacity = getHandVisualOpacity(handTrack);
      if (opacity <= 0.05) return;

      if (!collectOnly) {
        ctx.save();
        ctx.globalAlpha = opacity;
      }

      const startIdx = findFirstNoteIndexAtOrAfter(notes, curTime - 8.0);
      for (let i = startIdx; i < notes.length; i++) {
        const note = notes[i];
        const noteEnd = note.time + note.duration;
        if (noteEnd < curTime) continue;
        if (note.time > curTime + visibleTimeWindow) break;

        const isAtStrikeLine = (note.time <= curTime + 0.02 && noteEnd >= curTime) ||
          (playbackState.isWaitingForStrike && Math.abs(note.time - curTime) <= CHORD_CLUSTER_WINDOW_SEC && !note.satisfied);

        if (isAtStrikeLine && opacity >= 0.9) {
          strikeLineGuides.set(note.midi, {
            handTrack,
            lockedInWait: Boolean(note.lockedInWait)
          });
        }

        if (collectOnly) continue;

        const geom = keyGeometry[note.midi];
        if (!geom) continue;

        const rawBottomY = strikeLineY - (note.time - curTime) * fallSpeed;
        const rawTopY = strikeLineY - (noteEnd - curTime) * fallSpeed;

        const bottomY = Math.min(strikeLineY, rawBottomY);
        const topY = Math.max(laneTopY - 20, rawTopY);
        const rectH = Math.max(7, bottomY - topY - 2);
        if (bottomY <= laneTopY || topY >= strikeLineY) continue;

        const padX = geom.isBlack ? 1 : 2;
        const x = geom.x + padX;
        const w = Math.max(4, geom.width - padX * 2);

        // Render falling note with zero per-frame LinearGradient allocations (Issue #15)
        ctx.fillStyle = note.lockedInWait ? '#10b981' : primaryHex;
        ctx.strokeStyle = note.lockedInWait
          ? '#ffffff'
          : (isAtStrikeLine ? '#ffffff' : (note.wasFolded ? '#fde68a' : borderHex));
        ctx.lineWidth = isAtStrikeLine ? 2.2 : 1.2;
        if (isAtStrikeLine || note.lockedInWait) {
          ctx.shadowColor = note.lockedInWait ? 'rgba(54, 211, 153, 0.85)' : glowRgba;
          ctx.shadowBlur = 16;
        } else {
          ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.roundRect(x, topY, w, rectH, 5);
        ctx.fill();
        ctx.stroke();

        // Crisp top specular highlight cap on the falling glyph
        if (rectH >= 10) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = note.lockedInWait ? '#a7f3d0' : topHex;
          ctx.fillRect(x + 1.5, topY + 1.5, Math.max(2, w - 3), Math.min(5, rectH * 0.28));
        }

        if (labelMode !== 'off' && rectH >= 18 && w >= 14) {
          const labelText = formatFallingNoteLabel(note, labelMode, tonicPitchClass, keyIsMinor);
          if (labelText) {
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#0c0907';
            ctx.font = 'bold 10px "Segoe UI", sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(labelText, x + w / 2, bottomY - 6);
          }
        }
      }

      if (!collectOnly) {
        ctx.restore();
      }
    };

    // Draw Track 2 (Left Hand / Accompaniment — Eldritch Blue)
    drawTrackNotes(
      deps.currentSong.track2Notes,
      2,
      '#00b8d4',
      '#76ffff',
      '#b3f8ff',
      'rgba(0, 229, 255, 0.65)'
    );

    // Draw Track 1 (Right Hand / Lead — Radiant Gold)
    drawTrackNotes(
      deps.currentSong.track1Notes,
      1,
      '#e5a900',
      '#fff3b0',
      '#ffd700',
      'rgba(255, 215, 0, 0.75)'
    );

    return strikeLineGuides;
  }

  // ============================================================================
  // PHASE 7: 60 FPS ARCANE PARTICLE BURSTS, SHOCKWAVES & FLOATING XP RUNES
  // ============================================================================

  const PARTICLE_PALETTES = {
    gold: ['#ffd700', '#fff3b0', '#ffae00', '#ffffff'],
    blue: ['#00e5ff', '#76ffff', '#38bdf8', '#e0f2fe'],
    roll: ['#34d399', '#a7f3d0', '#ffd700', '#ffffff'],
    inspired: ['#ffae00', '#f59e0b', '#ffd700', '#fff3b0', '#ffffff'],
    fumble: ['#fb923c', '#f87171', '#fde047']
  };

  /**
   * Spawn an arcane particle burst & optional shockwave ring at the Strike Line above a key
   */
  function spawnKeyParticleBurst(midi, theme = 'gold', count = 18, withShockwave = true) {
    const geom = keyGeometry[midi];
    if (!geom) return;

    const originX = geom.x + geom.width / 2;
    const originY = geom.y;
    const palette = PARTICLE_PALETTES[theme] || PARTICLE_PALETTES.gold;

    // Cap active particle pool so 60 FPS never dips
    if (strikeParticles.length > 260) {
      strikeParticles.splice(0, strikeParticles.length - 200);
    }

    const shapes = ['star', 'diamond', 'orb'];
    for (let i = 0; i < count; i++) {
      // Upward fountain spread (-165 deg to -15 deg)
      const angle = -Math.PI * (0.12 + Math.random() * 0.76);
      const speed = 75 + Math.random() * 235;
      const size = 2.6 + Math.random() * 4.4;
      const maxLife = 0.42 + Math.random() * 0.42;

      strikeParticles.push({
        x: originX + (Math.random() - 0.5) * Math.max(8, geom.width * 0.7),
        y: originY - 2,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size,
        color: palette[i % palette.length],
        shape: shapes[i % shapes.length],
        rotation: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 9,
        life: maxLife,
        maxLife
      });
    }

    if (withShockwave) {
      if (strikeShockwaves.length > 20) {
        strikeShockwaves.shift();
      }
      strikeShockwaves.push({
        x: originX,
        y: originY,
        rx: Math.max(8, geom.width * 0.45),
        ry: 4,
        maxRx: Math.max(36, geom.width * 2.4),
        color: palette[0],
        life: 0.36,
        maxLife: 0.36
      });
    }
  }

  /**
   * Spawn floating glowing rune/XP text rising from the Strike Line above a key
   */
  function spawnFloatingCanvasRune(midi, text, color = '#ffd700') {
    const geom = keyGeometry[midi];
    if (!geom) return;

    if (floatingRunes.length > 16) {
      floatingRunes.shift();
    }

    floatingRunes.push({
      x: geom.x + geom.width / 2,
      y: geom.y - 16,
      vy: -58,
      text,
      color,
      life: 0.85,
      maxLife: 0.85
    });
  }

  /**
   * Render subtle drifting Tavern Arcane Dust Motes in the Spell Highway background
   */
  function updateAndDrawAmbientMotes(dt, width, strikeLineY, topY = 0) {
    const minY = Math.max(0, topY);
    const span = strikeLineY - minY;
    if (width <= 0 || span <= 8) return;

    while (ambientMotes.length < 28) {
      ambientMotes.push({
        x: Math.random() * width,
        y: minY + Math.random() * span,
        vx: (Math.random() - 0.5) * 12,
        vy: -(8 + Math.random() * 16),
        radius: 1.0 + Math.random() * 2.0,
        alpha: 0.14 + Math.random() * 0.28,
        phase: Math.random() * Math.PI * 2,
        isGold: Math.random() > 0.35
      });
    }

    ctx.save();
    for (const m of ambientMotes) {
      m.phase += dt * 1.8;
      m.x += (m.vx + Math.sin(m.phase) * 6) * dt;
      m.y += m.vy * dt;

      if (m.y < minY - 10 || m.y > strikeLineY) {
        m.y = strikeLineY - 4 - Math.random() * Math.min(24, span * 0.2);
        m.x = Math.random() * width;
      }
      if (m.x < 0) m.x = width;
      if (m.x > width) m.x = 0;

      const twinkle = m.alpha * (0.65 + 0.35 * Math.sin(m.phase * 1.5));
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
      ctx.fillStyle = m.isGold
        ? `rgba(255, 215, 0, ${twinkle.toFixed(3)})`
        : `rgba(0, 229, 255, ${twinkle.toFixed(3)})`;
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * Update and draw active Strike-Line Shockwave Rings, Particle Bursts & Floating XP Runes
   */
  function updateAndDrawStrikeParticles(dt) {
    // 1. Expanding Strike-Line Shockwave Rings
    if (strikeShockwaves.length > 0) {
      ctx.save();
      for (let i = strikeShockwaves.length - 1; i >= 0; i--) {
        const sw = strikeShockwaves[i];
        sw.life -= dt;
        if (sw.life <= 0) {
          strikeShockwaves.splice(i, 1);
          continue;
        }
        const progress = 1 - sw.life / sw.maxLife;
        const curRx = sw.rx + (sw.maxRx - sw.rx) * progress;
        const curRy = sw.ry + 14 * progress;
        const alpha = Math.max(0, (sw.life / sw.maxLife) * 0.85);

        ctx.beginPath();
        ctx.ellipse(sw.x, sw.y, curRx, curRy, 0, 0, Math.PI * 2);
        ctx.strokeStyle = sw.color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 2.2 * (1 - progress * 0.5);
        ctx.shadowColor = sw.color;
        ctx.shadowBlur = 12;
        ctx.stroke();
      }
      ctx.restore();
    }

    // 2. Arcane Spark / Star / Diamond Particles
    if (strikeParticles.length > 0) {
      ctx.save();
      const gravity = 310;
      for (let i = strikeParticles.length - 1; i >= 0; i--) {
        const p = strikeParticles[i];
        p.life -= dt;
        if (p.life <= 0) {
          strikeParticles.splice(i, 1);
          continue;
        }

        p.vy += gravity * dt;
        p.vx *= 0.985;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.rotation += p.spin * dt;

        const alpha = Math.max(0, p.life / p.maxLife);
        const r = p.size * (0.45 + 0.55 * alpha);

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = p.color;
        if (strikeParticles.length <= 48) {
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
        }

        if (p.shape === 'star') {
          // 4-point arcane star
          ctx.beginPath();
          ctx.moveTo(0, -r * 1.45);
          ctx.lineTo(r * 0.42, -r * 0.42);
          ctx.lineTo(r * 1.45, 0);
          ctx.lineTo(r * 0.42, r * 0.42);
          ctx.lineTo(0, r * 1.45);
          ctx.lineTo(-r * 0.42, r * 0.42);
          ctx.lineTo(-r * 1.45, 0);
          ctx.lineTo(-r * 0.42, -r * 0.42);
          ctx.closePath();
          ctx.fill();
        } else if (p.shape === 'diamond') {
          ctx.beginPath();
          ctx.moveTo(0, -r * 1.25);
          ctx.lineTo(r * 0.85, 0);
          ctx.lineTo(0, r * 1.25);
          ctx.lineTo(-r * 0.85, 0);
          ctx.closePath();
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.85, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      ctx.restore();
    }

    // 3. Floating XP / Roll Runes
    if (floatingRunes.length > 0) {
      ctx.save();
      for (let i = floatingRunes.length - 1; i >= 0; i--) {
        const fr = floatingRunes[i];
        fr.life -= dt;
        if (fr.life <= 0) {
          floatingRunes.splice(i, 1);
          continue;
        }
        fr.y += fr.vy * dt;
        fr.vy *= 0.96;

        const alpha = Math.min(1, (fr.life / fr.maxLife) * 1.25);
        ctx.globalAlpha = alpha;
        ctx.font = 'bold 12px "Segoe UI", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = fr.color;
        ctx.shadowColor = 'rgba(0, 0, 0, 0.95)';
        ctx.shadowBlur = 6;
        ctx.fillText(fr.text, fr.x, fr.y);
      }
      ctx.restore();
    }
  }

  /**
   * Render the Spell Highway backdrop, falling notes, strike line, 61-key piano, and Phase 7 particles
   */
  function renderCanvas() {
    if (typeof deps.isTavernMenuVisible !== 'undefined' && deps.isTavernMenuVisible && !playbackState.isPlaying) {
      return;
    }
    if (deps.stageViewMode === 'karaoke') {
      if (typeof renderKaraokeFrame === 'function') {
        renderKaraokeFrame();
      }
      return;
    }

    const nowMs = performance.now();
    const particleDt = Math.min(0.05, Math.max(0.001, (nowMs - deps.lastParticleFrameMs) / 1000));
    deps.lastParticleFrameMs = nowMs;

    const width = deps.cachedCanvasWidth;
    const height = deps.cachedCanvasHeight;
    const dpr = window.devicePixelRatio || 1;

    ctx.clearRect(0, 0, width, height);

    if (whiteKeys.length === 0 || !deps.cachedKeyGradients) {
      syncNotationWaitOverlayPill(nowMs);
      return;
    }
    const strikeLineY = whiteKeys[0].y;
    const inNotationView = deps.stageViewMode === 'split' || deps.stageViewMode === 'score';
    const highwayTopY = deps.stageViewMode === 'highway'
      ? 0
      : Math.min(strikeLineY, Math.max(0, deps.cachedHighwayTopY));
    const highwayHeight = Math.max(0, strikeLineY - highwayTopY);

    let strikeLineGuides;

    if (deps.stageViewMode !== 'score' && highwayHeight > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, highwayTopY, width, highwayHeight);
      ctx.clip();

      // Phase 7: Ambient drifting arcane dust motes in the Spell Highway background
      updateAndDrawAmbientMotes(particleDt, width, strikeLineY, highwayTopY);

      // 1. Draw vertical octave lane guides in the Spell Highway area
      ctx.save();
      for (const wk of whiteKeys) {
        const semitone = wk.midi % 12;
        if (semitone === 0 || semitone === 5) {
          ctx.beginPath();
          ctx.moveTo(wk.x, highwayTopY);
          ctx.lineTo(wk.x, strikeLineY);
          ctx.strokeStyle = semitone === 0
            ? 'rgba(212, 175, 55, 0.16)'
            : 'rgba(186, 171, 147, 0.07)';
          ctx.lineWidth = semitone === 0 ? 1.5 : 1;
          ctx.stroke();
        }
      }
      ctx.restore();

      // 2. Draw 60 FPS Falling Spell Highway Notes
      strikeLineGuides = drawFallingSpellHighway(strikeLineY, width, highwayTopY, false);
      updateChordBannerHUD(playbackState.currentTime);

      // 2b. Issue #30: Draw Rehearsal Loop A/B boundary lines on the Spell Highway
      if (deps.currentSong && rehearsalLoopState.enabled && hasValidRehearsalLoop()) {
        const pxPerSec = getEffectiveHighwayPxPerSec(highwayHeight);
        const markers = [
          { t: rehearsalLoopState.startTime, label: 'LOOP A', color: 'rgba(255, 215, 0, 0.78)' },
          { t: rehearsalLoopState.endTime, label: 'LOOP B', color: 'rgba(245, 158, 11, 0.88)' }
        ];
        for (const m of markers) {
          const y = strikeLineY - (m.t - playbackState.currentTime) * pxPerSec;
          if (y >= highwayTopY + 4 && y <= strikeLineY) {
            ctx.save();
            ctx.strokeStyle = m.color;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([6, 4]);
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(width, y);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = m.color;
            ctx.font = 'bold 10px "Consolas", monospace';
            ctx.textAlign = 'right';
            ctx.fillText(m.label, width - 8, Math.max(highwayTopY + 12, y - 4));
            ctx.restore();
          }
        }
      }

      if (songSessionStats.inspirationBurstRemainingSec > 0) {
        const pulse = 0.22 + 0.12 * Math.sin(nowMs * 0.008);
        ctx.save();
        ctx.strokeStyle = `rgba(255, 215, 0, ${pulse.toFixed(2)})`;
        ctx.lineWidth = 6;
        ctx.strokeRect(3, highwayTopY + 3, Math.max(4, width - 6), Math.max(4, highwayHeight - 6));
        ctx.restore();
      }

      ctx.restore();
    } else {
      // Score Mode: Still collect active strike-line piano key guides while sheet music fills the stage
      strikeLineGuides = drawFallingSpellHighway(strikeLineY, width, strikeLineY, true);
    }

    // 2c. Issue #39: Draw Scrolling Grand-Staff Sheet Music Viewport in Split & Score modes
    if (inNotationView && cachedNotationPaneHeight > 40) {
      const waitDurationSec = playbackState.isWaitingForStrike && playbackState.waitStartedAtMs !== null
        ? Math.max(0, (nowMs - playbackState.waitStartedAtMs) / 1000)
        : 0;
      activeWaitNoteIdSet.clear();
      if (playbackState.isWaitingForStrike && playbackState.activeStrikeGroup?.notes) {
        for (const wn of playbackState.activeStrikeGroup.notes) {
          activeWaitNoteIdSet.add(wn.id);
        }
      }
      notationRenderer.renderNotationViewport(
        ctx,
        { x: 0, y: 0, width, height: cachedNotationPaneHeight },
        {
          scoreData: deps.currentSong?.notationScore || null,
          currentTime: playbackState.currentTime,
          isWaitingForStrike: playbackState.isWaitingForStrike,
          waitDurationSec,
          waitMode: playbackState.waitMode,
          rehearsalLoop: deps.currentSong && rehearsalLoopState.enabled && hasValidRehearsalLoop()
            ? {
                enabled: true,
                startTime: rehearsalLoopState.startTime,
                endTime: rehearsalLoopState.endTime
              }
            : null,
          rhOpacity: getHandVisualOpacity(1),
          lhOpacity: getHandVisualOpacity(2),
          noteLookup: deps.currentSong?.noteIdMap || null,
          activeWaitNoteIds: activeWaitNoteIdSet.size > 0 ? activeWaitNoteIdSet : null,
          dpr,
          showSplitDivider: deps.stageViewMode === 'split'
        }
      );
    }

    // 3. Draw glowing Strike Zone Line above the 61-key keyboard (with Bardic Inspiration glow at 50+ combo)
    ctx.save();
    const isWaiting = playbackState.isWaitingForStrike;
    const isInspired = isBardicInspirationActive();
    const lineH = deps.stageViewMode === 'score'
      ? (isInspired || isWaiting ? 8 : 5)
      : (isInspired ? 16 : (isWaiting ? 14 : 9));
    const strikeGrad = ctx.createLinearGradient(0, strikeLineY - lineH + 2, 0, strikeLineY + 4);
    if (isInspired) {
      strikeGrad.addColorStop(0, 'rgba(255, 170, 0, 0)');
      strikeGrad.addColorStop(0.45, 'rgba(255, 170, 0, 0.85)');
      strikeGrad.addColorStop(0.8, 'rgba(255, 215, 0, 0.95)');
      strikeGrad.addColorStop(1, '#ffffff');
    } else if (isWaiting) {
      strikeGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
      strikeGrad.addColorStop(0.5, 'rgba(255, 215, 0, 0.92)');
      strikeGrad.addColorStop(1, '#fff3b0');
    } else {
      strikeGrad.addColorStop(0, 'rgba(255, 215, 0, 0)');
      strikeGrad.addColorStop(0.55, 'rgba(255, 215, 0, 0.7)');
      strikeGrad.addColorStop(1, '#d4af37');
    }
    ctx.fillStyle = strikeGrad;
    ctx.fillRect(0, strikeLineY - lineH + 2, width, lineH);
    ctx.restore();

    // 4. Draw 36 White Keys (using pre-allocated deps.cachedKeyGradients)
    const drillHighlights = typeof deps.getDrillKeyHighlights === 'function'
      ? deps.getDrillKeyHighlights()
      : null;
    const drillActive = Boolean(drillHighlights && drillHighlights.active);
    const qwertyHighMidi = Math.min(MAX_MIDI, qwertyBaseMidi + 16);
    const firstWhiteW = whiteKeys[0].width;
    const whiteQwertyFont = `bold ${Math.max(9, Math.min(11, Math.floor(firstWhiteW * 0.36)))}px "Segoe UI", sans-serif`;
    const whiteNoteFont = `bold ${Math.max(10, Math.min(13, Math.floor(firstWhiteW * 0.42)))}px "Segoe UI", sans-serif`;
    ctx.textAlign = 'center';
    for (const key of whiteKeys) {
      const state = activeNotes.get(key.midi);
      const isPressed = Boolean(state);
      const drillTarget = drillActive && drillHighlights.targetMap
        ? drillHighlights.targetMap.get(key.midi)
        : null;
      const isDrillWrong = drillActive && drillHighlights.wrongFlashMidi === key.midi;
      const isDrillContext = drillActive && !drillTarget && drillHighlights.contextPitchClasses
        && drillHighlights.contextPitchClasses.has(key.midi % 12);
      const guide = drillTarget
        ? { handTrack: drillTarget.handTrack, lockedInWait: !drillTarget.hit }
        : strikeLineGuides.get(key.midi);
      const isInQwertyRange = deps.showQwertyKeyLabels && key.midi >= qwertyBaseMidi && key.midi <= qwertyHighMidi;
      const qwertyChar = isInQwertyRange ? OFFSET_TO_QWERTY_LABEL[key.midi - qwertyBaseMidi] : null;

      if (isDrillWrong) {
        ctx.fillStyle = '#fca5a5';
      } else if (isPressed) {
        ctx.save();
        ctx.fillStyle = deps.cachedKeyGradients.whitePressed;
        ctx.shadowColor = 'rgba(255, 215, 0, 0.75)';
        ctx.shadowBlur = 16;
      } else if (guide) {
        ctx.fillStyle = guide.lockedInWait
          ? deps.cachedKeyGradients.whiteLocked
          : (guide.handTrack === 1 ? deps.cachedKeyGradients.whiteGuideT1 : deps.cachedKeyGradients.whiteGuideT2);
      } else if (isDrillContext) {
        ctx.fillStyle = '#dbeafe';
      } else {
        ctx.fillStyle = deps.cachedKeyGradients.whiteIdle;
      }

      const pad = 0.75;
      ctx.fillRect(key.x + pad, key.y, key.width - pad * 2, key.height - 2);

      // Subtle gold top marker bar on keys inside the active QWERTY octave range (Z/X)
      if (isInQwertyRange) {
        ctx.fillStyle = isPressed ? '#1a1200' : 'rgba(212, 175, 55, 0.85)';
        ctx.fillRect(key.x + pad + 1, key.y + 1, key.width - (pad + 1) * 2, 4);
      }

      ctx.strokeStyle = isDrillWrong ? '#dc2626' : (isPressed ? '#ffd700' : (guide ? '#ffd700' : (isInQwertyRange ? '#8a6d2f' : '#2e241b')));
      ctx.lineWidth = guide || isDrillWrong ? 1.8 : 1;
      ctx.strokeRect(key.x + pad, key.y, key.width - pad * 2, key.height - 2);

      if (isPressed) {
        ctx.restore();
        ctx.textAlign = 'center';
      }

      if (qwertyChar) {
        ctx.fillStyle = isPressed || guide ? '#1a1200' : '#8a6d2f';
        ctx.font = whiteQwertyFont;
        ctx.fillText(`[${qwertyChar}]`, key.x + key.width / 2, key.y + key.height - 28);
      }

      if (key.midi % 12 === 0 || guide || isDrillContext || (deps.showQwertyKeyLabels && key.midi === qwertyBaseMidi)) {
        ctx.fillStyle = isPressed || guide ? '#1a1200' : (deps.showQwertyKeyLabels && key.midi === qwertyBaseMidi ? '#b45309' : '#5e4d3b');
        ctx.font = whiteNoteFont;
        ctx.fillText(key.name, key.x + key.width / 2, key.y + key.height - 12);
      }
    }

    // 5. Draw 25 Black Keys on top (using pre-allocated deps.cachedKeyGradients)
    const firstBlackW = blackKeys.length > 0 ? blackKeys[0].width : 16;
    const blackQwertyFont = `bold ${Math.max(8, Math.min(10, Math.floor(firstBlackW * 0.48)))}px "Segoe UI", sans-serif`;
    ctx.font = blackQwertyFont;
    for (const key of blackKeys) {
      const state = activeNotes.get(key.midi);
      const isPressed = Boolean(state);
      const drillTarget = drillActive && drillHighlights.targetMap
        ? drillHighlights.targetMap.get(key.midi)
        : null;
      const isDrillWrong = drillActive && drillHighlights.wrongFlashMidi === key.midi;
      const isDrillContext = drillActive && !drillTarget && drillHighlights.contextPitchClasses
        && drillHighlights.contextPitchClasses.has(key.midi % 12);
      const guide = drillTarget
        ? { handTrack: drillTarget.handTrack, lockedInWait: !drillTarget.hit }
        : strikeLineGuides.get(key.midi);
      const isInQwertyRange = deps.showQwertyKeyLabels && key.midi >= qwertyBaseMidi && key.midi <= qwertyHighMidi;
      const qwertyChar = isInQwertyRange ? OFFSET_TO_QWERTY_LABEL[key.midi - qwertyBaseMidi] : null;

      if (isDrillWrong) {
        ctx.fillStyle = '#dc2626';
      } else if (isPressed) {
        ctx.save();
        ctx.fillStyle = deps.cachedKeyGradients.blackPressed;
        ctx.shadowColor = 'rgba(255, 215, 0, 0.85)';
        ctx.shadowBlur = 14;
      } else if (guide) {
        ctx.fillStyle = guide.lockedInWait
          ? deps.cachedKeyGradients.blackLocked
          : (guide.handTrack === 1 ? deps.cachedKeyGradients.blackGuideT1 : deps.cachedKeyGradients.blackGuideT2);
      } else if (isDrillContext) {
        ctx.fillStyle = '#1e3a8a';
      } else {
        ctx.fillStyle = deps.cachedKeyGradients.blackIdle;
      }

      ctx.fillRect(key.x, key.y, key.width, key.height);

      ctx.strokeStyle = isDrillWrong ? '#fca5a5' : (isPressed || guide ? '#fff3b0' : (isInQwertyRange ? '#d4af37' : '#4a3b2c'));
      ctx.lineWidth = guide || isDrillWrong ? 1.6 : 1;
      ctx.strokeRect(key.x + 0.5, key.y + 0.5, key.width - 1, key.height - 1);

      if (isPressed) {
        ctx.restore();
        ctx.textAlign = 'center';
        ctx.font = blackQwertyFont;
      }

      if (qwertyChar) {
        ctx.fillStyle = isPressed || guide ? '#1a1200' : '#fde68a';
        ctx.fillText(qwertyChar, key.x + key.width / 2, key.y + key.height - 8);
      }
    }

    // 6. Phase 7: Render Strike-Line Shockwaves, Arcane Particle Bursts & Floating XP Runes on top!
    updateAndDrawStrikeParticles(particleDt);
    syncNotationWaitOverlayPill(nowMs);
  }

  /**
   * Hit-test canvas coordinates (x, y) against the 61-key piano
   */
  function getMidiKeyAtPoint(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    for (const bk of blackKeys) {
      if (x >= bk.x && x <= bk.x + bk.width && y >= bk.y && y <= bk.y + bk.height) {
        return bk.midi;
      }
    }
    for (const wk of whiteKeys) {
      if (x >= wk.x && x <= wk.x + wk.width && y >= wk.y && y <= wk.y + wk.height) {
        return wk.midi;
      }
    }
    return null;
  }

  // Issue #42 & #43: Plug-In External Instrument Rig DOM references & state
  const inputSourceModeSelect = document.getElementById('input-source-mode-select');

  return {
    computeKeyGeometry,
    drawFallingSpellHighway,
    spawnKeyParticleBurst,
    spawnFloatingCanvasRune,
    updateAndDrawAmbientMotes,
    updateAndDrawStrikeParticles,
    renderCanvas,
    getMidiKeyAtPoint
  };
}

module.exports = { createHighwayRenderer };
