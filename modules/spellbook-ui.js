'use strict';

/**
 * College of Keys — Issue #184: Extracted Grimoire Spellbook UI Module
 * Encapsulates Spellbook spread navigation, 30s Audio Preview UI wiring,
 * Hall of Legends spread rendering, and Song Details / Bundle strip updates.
 */

function createSpellbookUI(ctx) {
  const {
    fs, path, pathToFileURL, Midi, Tone, shell,
    SPELLBOOK_TIERS,
    grimoireSpells, songPlayHistory,
    hasPreviewBackingAudio, getAvailablePreviewSources, createGrimoirePreviewController,
    computeHallOfLegends, formatLegendDate,
    isMusicXmlFileName, convertMusicXmlToMidiBuffer, buildDemoSpellMidiBytes,
    foldMidiNoteDetails, midiToNoteName, formatSeconds, formatAnnalsDate,
    getSpellbookTierIndexForLevel, getSongHistoryRecord, isGrimoireEntryDeletable,
    toggleGrimoireFavorite, openDeleteSpellConfirmModal, saveSpellbookFavoritesFilter,
    playSpellbookPageTurnSound, showTavernMenu, hideTavernMenu, computeKeyGeometry,
    pausePlayback, closeAllConservatoryPopovers, closeStreakPopover,
    ensureAudioReady, getActiveInstrument, getBackingAudioVolumeFromSlider,
    showGrimoireToast, loadGrimoireEntry, resetPlaybackToStart, updateTavernMenuStats,
    openSongBundleModal,
    // DOM elements
    grimoireSpellbookModal, grimoireCountBadge, spellbookSearchInput, spellbookSearchRow,
    btnSpellbookFavoritesFilter, spellbookFavCount, spellbookSongList, spellbookEmptyState,
    spellbookPageNumLeft, spellbookPageNumRight, spellbookDetailPanel,
    spellbookLegendsLeftPanel, spellbookLegendsRightPanel,
    spellbookLegendsAccList, spellbookLegendsAccEmpty,
    spellbookLegendsXpList, spellbookLegendsXpEmpty,
    spellbookTierBadge, spellbookTierXp, spellbookTierName, spellbookTierDesc,
    spellbookSpread, spellbookTierPips,
    btnCloseSpellbook, btnSpellbookPrevPage, btnSpellbookNextPage,
    spellbookDetailTierChip, spellbookDetailKeySig, spellbookDetailSource,
    spellbookDetailTitle, spellbookDetailFile, spellbookDetailBpm,
    spellbookDetailDuration, spellbookDetailNps, spellbookDetailNotes,
    spellbookDetailPlays, spellbookDetailBestAcc, spellbookDetailLastAcc,
    spellbookDetailTotalXp, spellbookDetailLastPlayed, spellbookDetailAudioBadge,
    spellbookBundleNotesChip, spellbookBundleSheetChip, spellbookBundleAudioChip,
    spellbookBundleSpotifyLink, btnSpellbookBundle,
    btnSpellbookLoadSong, btnSpellbookPreviewSong, btnSpellbookFavoriteSong, btnSpellbookDeleteSong,
    spellbookPreviewMenu, btnPreviewSourceRecording, btnPreviewSourceMidi, btnPlayPause
  } = ctx;

  function openGrimoireSpellbook(origin = 'highway') {
    pausePlayback();
    closeAllConservatoryPopovers();
    closeStreakPopover();
    ctx.previousSpellbookOrigin = origin;

    // Default to the currently loaded song's tier if active (and not in Attuned filter)
    if (ctx.currentSong && ctx.currentSong.difficulty) {
      if (!ctx.spellbookFavoritesOnly) {
        ctx.currentSpellbookTierIndex = getSpellbookTierIndexForLevel(ctx.currentSong.difficulty.spellLevel);
      }
      ctx.selectedSpellbookEntryId = ctx.currentSong.songId || null;
    }

    if (grimoireCountBadge) {
      grimoireCountBadge.textContent = String(grimoireSpells.size);
    }

    if (grimoireSpellbookModal) {
      grimoireSpellbookModal.classList.remove('hidden');
    }

    if (spellbookSearchInput) {
      spellbookSearchInput.value = '';
    }

    renderSpellbookSpread();

    if (btnCloseSpellbook) {
      btnCloseSpellbook.focus();
    }
  }

  let previewMenuEntryId = null;

  async function extractPreviewNotesForGrimoireEntry(entry) {
    if (!entry) return [];
    let arrayBuf = null;
    if (entry.filePath === 'BUILTIN_DEMO') {
      const bytes = buildDemoSpellMidiBytes();
      arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
    } else if (entry.filePath && fs.existsSync(entry.filePath)) {
      const rawBuf = fs.readFileSync(entry.filePath);
      if (isMusicXmlFileName(entry.fileName || entry.filePath)) {
        const converted = convertMusicXmlToMidiBuffer(rawBuf, entry.fileName || path.basename(entry.filePath));
        if (converted && converted.midiBytes) {
          arrayBuf = converted.midiBytes.buffer.slice(
            converted.midiBytes.byteOffset,
            converted.midiBytes.byteOffset + converted.midiBytes.byteLength
          );
        }
      } else {
        arrayBuf = rawBuf.buffer.slice(rawBuf.byteOffset, rawBuf.byteOffset + rawBuf.byteLength);
      }
    }
    if (!arrayBuf) return [];

    const midi = new Midi(arrayBuf);
    const extracted = [];
    for (const track of midi.tracks) {
      if (track.channel === 9) continue;
      for (const note of track.notes) {
        const folded = foldMidiNoteDetails(note.midi);
        extracted.push({
          midi: note.midi,
          foldedMidi: folded.foldedMidi,
          name: midiToNoteName(folded.foldedMidi),
          foldedName: midiToNoteName(folded.foldedMidi),
          time: note.time,
          duration: note.duration,
          velocity: note.velocity
        });
      }
    }
    return extracted;
  }

  const grimoirePreviewController = createGrimoirePreviewController({
    Tone,
    AudioCtor: typeof Audio !== 'undefined' ? Audio : null,
    pathToFileURL,
    getBackingVolume: () => getBackingAudioVolumeFromSlider(),
    ensureAudioReady,
    getPianoInstrument: () => getActiveInstrument(),
    extractNotesForEntry: extractPreviewNotesForGrimoireEntry,
    onStateChange: (state) => updateGrimoirePreviewUI(state),
    onError: (msg) => showGrimoireToast(msg, 'warning')
  });

  function closeSpellbookPreviewMenu() {
    previewMenuEntryId = null;
    if (spellbookPreviewMenu) {
      spellbookPreviewMenu.classList.add('hidden');
    }
  }

  function stopGrimoirePreview() {
    closeSpellbookPreviewMenu();
    grimoirePreviewController.stopPreview();
  }

  function updateGrimoirePreviewUI(state = grimoirePreviewController.getState()) {
    const activeId = state && state.isPlaying ? state.entryId : null;
    const pct = state && state.isPlaying ? Math.round((state.progress || 0) * 100) : 0;

    if (spellbookSongList) {
      spellbookSongList.querySelectorAll('.spellbook-card-preview-btn').forEach((btn) => {
        const isThis = Boolean(activeId && btn.dataset.entryId === activeId);
        btn.classList.toggle('is-previewing', isThis);
        btn.style.setProperty('--preview-pct', `${isThis ? pct : 0}%`);
        btn.textContent = isThis ? '\u25A0' : '\u25B6';
        btn.setAttribute('aria-pressed', isThis ? 'true' : 'false');
        const title = btn.dataset.entryTitle || 'spell';
        btn.title = isThis
          ? `Stop 30s preview of "${title}"`
          : `Preview 30s of "${title}"`;
        btn.setAttribute('aria-label', isThis ? `Stop preview of ${title}` : `Preview ${title}`);
      });
    }

    if (btnSpellbookPreviewSong) {
      const selectedId = ctx.selectedSpellbookEntryId;
      const isSelectedPreviewing = Boolean(activeId && selectedId && activeId === selectedId);
      btnSpellbookPreviewSong.classList.toggle('is-previewing', isSelectedPreviewing);
      btnSpellbookPreviewSong.setAttribute('aria-pressed', isSelectedPreviewing ? 'true' : 'false');
      if (isSelectedPreviewing) {
        const remaining = Math.max(0, Math.ceil((state.durationSec || PREVIEW_DURATION_SEC) - (state.elapsedSec || 0)));
        const srcLabel = state.source === 'recording' ? 'Recording' : 'Piano';
        btnSpellbookPreviewSong.textContent = `\u25A0 Stop (${srcLabel} ${remaining}s)`;
      } else {
        btnSpellbookPreviewSong.textContent = '\uD83C\uDFA7 Preview';
      }
    }
  }

  function openSpellbookPreviewMenu(entry, anchorEl) {
    if (!spellbookPreviewMenu || !entry) return;
    const hasRecording = hasPreviewBackingAudio(entry);
    previewMenuEntryId = entry.id;

    if (btnPreviewSourceRecording) {
      btnPreviewSourceRecording.classList.toggle('hidden', !hasRecording);
      btnPreviewSourceRecording.disabled = !hasRecording;
    }

    spellbookPreviewMenu.classList.remove('hidden');

    const container = grimoireSpellbookModal?.querySelector('.spellbook-container');
    if (container && anchorEl) {
      const cRect = container.getBoundingClientRect();
      const aRect = anchorEl.getBoundingClientRect();
      const menuW = spellbookPreviewMenu.offsetWidth || 184;
      const menuH = spellbookPreviewMenu.offsetHeight || 110;
      let left = aRect.right - cRect.left - menuW;
      if (left < 12) left = aRect.left - cRect.left;
      if (left + menuW > cRect.width - 12) left = Math.max(12, cRect.width - menuW - 12);
      let top = aRect.bottom - cRect.top + 6;
      if (top + menuH > cRect.height - 12) {
        top = Math.max(12, aRect.top - cRect.top - menuH - 6);
      }
      spellbookPreviewMenu.style.left = `${Math.round(left)}px`;
      spellbookPreviewMenu.style.top = `${Math.round(top)}px`;
    }
  }

  function handleGrimoirePreviewButtonClick(entry, anchorEl) {
    if (!entry) return;
    if (grimoirePreviewController.isPreviewingEntry(entry.id)) {
      stopGrimoirePreview();
      return;
    }
    const sources = getAvailablePreviewSources(entry);
    if (sources.length === 1) {
      closeSpellbookPreviewMenu();
      void grimoirePreviewController.startPreview(entry, sources[0]);
      return;
    }
    if (previewMenuEntryId === entry.id && spellbookPreviewMenu && !spellbookPreviewMenu.classList.contains('hidden')) {
      closeSpellbookPreviewMenu();
      return;
    }
    openSpellbookPreviewMenu(entry, anchorEl);
  }

  if (btnPreviewSourceRecording) {
    btnPreviewSourceRecording.addEventListener('click', (e) => {
      e.stopPropagation();
      const entry = previewMenuEntryId ? grimoireSpells.get(previewMenuEntryId) : null;
      closeSpellbookPreviewMenu();
      if (entry) {
        void grimoirePreviewController.startPreview(entry, 'recording');
      }
    });
  }

  if (btnPreviewSourceMidi) {
    btnPreviewSourceMidi.addEventListener('click', (e) => {
      e.stopPropagation();
      const entry = previewMenuEntryId ? grimoireSpells.get(previewMenuEntryId) : null;
      closeSpellbookPreviewMenu();
      if (entry) {
        void grimoirePreviewController.startPreview(entry, 'midi');
      }
    });
  }

  if (btnSpellbookPreviewSong) {
    btnSpellbookPreviewSong.addEventListener('click', (e) => {
      e.stopPropagation();
      const entry = ctx.selectedSpellbookEntryId ? grimoireSpells.get(ctx.selectedSpellbookEntryId) : null;
      if (!entry) return;
      handleGrimoirePreviewButtonClick(entry, btnSpellbookPreviewSong);
    });
  }

  document.addEventListener('click', (e) => {
    if (!spellbookPreviewMenu || spellbookPreviewMenu.classList.contains('hidden')) return;
    if (spellbookPreviewMenu.contains(e.target)) return;
    if (e.target && e.target.closest && (e.target.closest('.spellbook-card-preview-btn') || e.target.closest('#btn-spellbook-preview-song'))) {
      return;
    }
    closeSpellbookPreviewMenu();
  });

  function closeGrimoireSpellbook() {
    stopGrimoirePreview();
    if (grimoireSpellbookModal) {
      grimoireSpellbookModal.classList.add('hidden');
    }
    if (ctx.previousSpellbookOrigin === 'tavern') {
      showTavernMenu();
    } else {
      hideTavernMenu();
      if (btnPlayPause) {
        btnPlayPause.focus();
      }
      setTimeout(() => {
        computeKeyGeometry();
      }, 40);
    }
  }

  const HALL_OF_LEGENDS_SPREAD_INDEX = SPELLBOOK_TIERS.length;
  const TOTAL_SPELLBOOK_SPREADS = SPELLBOOK_TIERS.length + 1;

  function flipSpellbookPage(direction) {
    if (ctx.isSpellbookFlipping || ctx.spellbookFavoritesOnly) return;
    const targetIndex = ctx.currentSpellbookTierIndex + direction;
    if (targetIndex < 0 || targetIndex >= TOTAL_SPELLBOOK_SPREADS) return;
    navigateToSpellbookTier(targetIndex, direction > 0 ? 'forward' : 'backward');
  }

  function navigateToSpellbookTier(targetIndex, animDirection = 'forward') {
    if (ctx.isSpellbookFlipping) return;
    if (targetIndex < 0 || targetIndex >= TOTAL_SPELLBOOK_SPREADS) return;
    if (targetIndex === ctx.currentSpellbookTierIndex && !ctx.spellbookFavoritesOnly) return;

    stopGrimoirePreview();
    if (ctx.spellbookFavoritesOnly) {
      ctx.spellbookFavoritesOnly = false;
      saveSpellbookFavoritesFilter();
    }
    ctx.isSpellbookFlipping = true;
    playSpellbookPageTurnSound();

    const animClass = animDirection === 'forward' ? 'flipping-forward' : 'flipping-backward';
    if (spellbookSpread) {
      spellbookSpread.classList.remove('flipping-forward', 'flipping-backward');
      void spellbookSpread.offsetWidth; // Force reflow
      spellbookSpread.classList.add(animClass);
    }

    setTimeout(() => {
      ctx.currentSpellbookTierIndex = targetIndex;
      renderSpellbookSpread();
      if (spellbookSpread) {
        spellbookSpread.classList.remove(animClass);
      }
      ctx.isSpellbookFlipping = false;
    }, 240);
  }

  function renderSpellbookTierPips() {
    if (!spellbookTierPips) return;
    spellbookTierPips.innerHTML = '';
    SPELLBOOK_TIERS.forEach((tier, idx) => {
      const isActive = !ctx.spellbookFavoritesOnly && idx === ctx.currentSpellbookTierIndex;
      const pip = document.createElement('button');
      pip.type = 'button';
      pip.className = `tier-pip${isActive ? ' active' : ''}`;
      pip.textContent = tier.pipLabel;
      pip.title = `${tier.title} (${tier.xp}) \u2014 Click to view`;
      pip.setAttribute('role', 'tab');
      pip.setAttribute('aria-selected', isActive ? 'true' : 'false');
      pip.addEventListener('click', (e) => {
        e.stopPropagation();
        navigateToSpellbookTier(idx, idx > ctx.currentSpellbookTierIndex ? 'forward' : 'backward');
      });
      spellbookTierPips.appendChild(pip);
    });

    // Issue #162: 11th Bookmark Tab — Hall of Legends (Personal Records)
    const isLegendsActive = !ctx.spellbookFavoritesOnly && ctx.currentSpellbookTierIndex === HALL_OF_LEGENDS_SPREAD_INDEX;
    const legendsPip = document.createElement('button');
    legendsPip.type = 'button';
    legendsPip.id = 'tier-pip-hall-of-legends';
    legendsPip.className = `tier-pip tier-pip-legends${isLegendsActive ? ' active' : ''}`;
    legendsPip.textContent = '\uD83C\uDFC6';
    legendsPip.title = 'Hall of Legends \u2014 Personal Piano Records (Best Accuracy & Biggest XP)';
    legendsPip.setAttribute('role', 'tab');
    legendsPip.setAttribute('aria-label', 'Hall of Legends');
    legendsPip.setAttribute('aria-selected', isLegendsActive ? 'true' : 'false');
    legendsPip.addEventListener('click', (e) => {
      e.stopPropagation();
      navigateToSpellbookTier(
        HALL_OF_LEGENDS_SPREAD_INDEX,
        HALL_OF_LEGENDS_SPREAD_INDEX > ctx.currentSpellbookTierIndex ? 'forward' : 'backward'
      );
    });
    spellbookTierPips.appendChild(legendsPip);
  }

  function findGrimoireEntryForLegendRecord(rec) {
    if (!rec) return null;
    const entries = Array.from(grimoireSpells.values());
    if (rec.songId) {
      const byId = entries.find((e) => e.songId === rec.songId || e.id === rec.songId);
      if (byId) return byId;
    }
    if (rec.filePath) {
      try {
        const targetResolved = path.resolve(rec.filePath).toLowerCase();
        const byPath = entries.find((e) => e.filePath && path.resolve(e.filePath).toLowerCase() === targetResolved);
        if (byPath) return byPath;
      } catch {
        // Ignore path resolution errors
      }
    }
    if (rec.title) {
      const targetTitle = rec.title.toLowerCase();
      const byTitle = entries.find((e) => e.title && e.title.toLowerCase() === targetTitle);
      if (byTitle) return byTitle;
    }
    return null;
  }

  function renderHallOfLegendsList(listEl, emptyEl, records, kind) {
    if (!listEl) return;
    listEl.innerHTML = '';
    const hasRecords = Array.isArray(records) && records.length > 0;
    if (emptyEl) {
      emptyEl.classList.toggle('hidden', hasRecords);
    }
    if (!hasRecords) return;

    records.forEach((rec, idx) => {
      const grimoireEntry = findGrimoireEntryForLegendRecord(rec);
      const isLoadable = Boolean(
        grimoireEntry &&
        (grimoireEntry.isBuiltin ||
          grimoireEntry.filePath === 'BUILTIN_DEMO' ||
          (grimoireEntry.filePath && fs.existsSync(grimoireEntry.filePath)))
      );

      const li = document.createElement('li');
      li.className = `legends-record-row${idx < 3 ? ` legends-rank-${idx + 1}` : ''}${isLoadable ? '' : ' legends-row-missing'}`;
      li.dataset.songId = rec.songId;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'legends-record-btn';
      btn.disabled = !isLoadable;
      btn.title = isLoadable
        ? `Load "${rec.title}" onto the Spell Highway`
        : `"${rec.title}" scroll file is not currently in your Grimoire`;

      const rankSpan = document.createElement('span');
      rankSpan.className = 'legends-rank-badge';
      rankSpan.textContent = idx === 0 ? '\uD83E\uDD47' : idx === 1 ? '\uD83E\uDD48' : idx === 2 ? '\uD83E\uDD49' : `#${idx + 1}`;

      const infoDiv = document.createElement('div');
      infoDiv.className = 'legends-song-info';
      const titleSpan = document.createElement('span');
      titleSpan.className = 'legends-song-title';
      titleSpan.textContent = rec.title;
      const dateSpan = document.createElement('span');
      dateSpan.className = 'legends-song-date';
      dateSpan.textContent = isLoadable
        ? formatLegendDate(rec.setAt)
        : `${formatLegendDate(rec.setAt)} \u2022 Scroll missing`;
      infoDiv.appendChild(titleSpan);
      infoDiv.appendChild(dateSpan);

      const valSpan = document.createElement('span');
      valSpan.className = `legends-record-value ${kind === 'accuracy' ? 'legends-val-acc' : 'legends-val-xp'}`;
      valSpan.textContent = kind === 'accuracy' ? `${rec.value}%` : `${Number(rec.value).toLocaleString()} XP`;

      btn.appendChild(rankSpan);
      btn.appendChild(infoDiv);
      btn.appendChild(valSpan);

      if (isLoadable) {
        btn.addEventListener('click', () => {
          grimoireEntry.newlyIngested = false;
          ctx.selectedSpellbookEntryId = grimoireEntry.id;
          loadSelectedSpellbookSong();
        });
      }

      li.appendChild(btn);
      listEl.appendChild(li);
    });
  }

  function renderHallOfLegendsSpread() {
    if (spellbookTierBadge) {
      spellbookTierBadge.textContent = '\uD83C\uDFC6 Hall of Legends';
      spellbookTierBadge.className = 'tier-ribbon-badge tier-legends';
    }
    if (spellbookTierXp) {
      spellbookTierXp.textContent = 'Piano Records';
    }
    if (spellbookTierName) spellbookTierName.textContent = 'Hall of Legends';
    if (spellbookTierDesc) spellbookTierDesc.textContent = 'Your top 10 personal piano records \u2022 Beat a record for +50 Bonus XP';
    if (spellbookPageNumLeft) spellbookPageNumLeft.textContent = 'Page XI \u2022 Best Accuracy';
    if (spellbookPageNumRight) spellbookPageNumRight.textContent = 'Page XIb \u2022 Biggest XP';

    if (spellbookSearchRow) spellbookSearchRow.classList.add('hidden');
    if (spellbookSongList) spellbookSongList.classList.add('hidden');
    if (spellbookEmptyState) spellbookEmptyState.classList.add('hidden');
    if (spellbookDetailPanel) spellbookDetailPanel.classList.add('hidden');
    if (spellbookLegendsLeftPanel) spellbookLegendsLeftPanel.classList.remove('hidden');
    if (spellbookLegendsRightPanel) spellbookLegendsRightPanel.classList.remove('hidden');

    const board = computeHallOfLegends(songPlayHistory);
    renderHallOfLegendsList(spellbookLegendsAccList, spellbookLegendsAccEmpty, board.accuracy, 'accuracy');
    renderHallOfLegendsList(spellbookLegendsXpList, spellbookLegendsXpEmpty, board.xp, 'xp');

    if (btnSpellbookPrevPage) {
      btnSpellbookPrevPage.disabled = false;
    }
    if (btnSpellbookNextPage) {
      btnSpellbookNextPage.disabled = true;
    }
    renderSpellbookTierPips();
  }

  function renderSpellbookSpread() {
    if (!grimoireSpellbookModal) return;

    const isLegendsSpread = !ctx.spellbookFavoritesOnly && ctx.currentSpellbookTierIndex === HALL_OF_LEGENDS_SPREAD_INDEX;
    if (isLegendsSpread) {
      renderHallOfLegendsSpread();
      return;
    }

    // Restore standard tier / Attuned panels when leaving Hall of Legends
    if (spellbookSearchRow) spellbookSearchRow.classList.remove('hidden');
    if (spellbookSongList) spellbookSongList.classList.remove('hidden');
    if (spellbookDetailPanel) spellbookDetailPanel.classList.remove('hidden');
    if (spellbookLegendsLeftPanel) spellbookLegendsLeftPanel.classList.add('hidden');
    if (spellbookLegendsRightPanel) spellbookLegendsRightPanel.classList.add('hidden');

    const tier = SPELLBOOK_TIERS[ctx.currentSpellbookTierIndex] || SPELLBOOK_TIERS[0];
    const allEntries = Array.from(grimoireSpells.values());
    const favoriteEntries = allEntries.filter((e) => Boolean(e.isFavorite));

    // Update Favorites filter toggle button & count badge
    if (btnSpellbookFavoritesFilter) {
      btnSpellbookFavoritesFilter.classList.toggle('active', ctx.spellbookFavoritesOnly);
      btnSpellbookFavoritesFilter.setAttribute('aria-pressed', ctx.spellbookFavoritesOnly ? 'true' : 'false');
      const starEl = btnSpellbookFavoritesFilter.querySelector('.fav-filter-star');
      if (starEl) {
        starEl.textContent = ctx.spellbookFavoritesOnly ? '\u2605' : '\u2606';
      }
    }
    if (spellbookFavCount) {
      spellbookFavCount.textContent = String(favoriteEntries.length);
    }
    if (spellbookSearchInput) {
      spellbookSearchInput.placeholder = ctx.spellbookFavoritesOnly
        ? '\uD83D\uDD0D Search attuned...'
        : '\uD83D\uDD0D Search tier...';
    }

    // Left Page: Header (Attuned view vs Tier view)
    if (ctx.spellbookFavoritesOnly) {
      if (spellbookTierBadge) {
        spellbookTierBadge.textContent = '\u2605 Attuned';
        spellbookTierBadge.className = 'tier-ribbon-badge tier-favorites';
      }
      if (spellbookTierXp) {
        spellbookTierXp.textContent = `${favoriteEntries.length} Attuned`;
      }
      if (spellbookTierName) spellbookTierName.textContent = 'Attuned Spells';
      if (spellbookTierDesc) spellbookTierDesc.textContent = 'Spells bound to your bard across all tiers';
      if (spellbookPageNumLeft) spellbookPageNumLeft.textContent = 'Attuned \u2022 All Tiers';
      if (spellbookPageNumRight) spellbookPageNumRight.textContent = 'Attuned \u2022 Details';
    } else {
      if (spellbookTierBadge) {
        spellbookTierBadge.textContent = tier.title;
        spellbookTierBadge.className = `tier-ribbon-badge ${tier.badgeClass}`;
      }
      if (spellbookTierXp) spellbookTierXp.textContent = tier.xp;
      if (spellbookTierName) spellbookTierName.textContent = tier.subtitle;
      if (spellbookTierDesc) spellbookTierDesc.textContent = tier.desc;
      if (spellbookPageNumLeft) spellbookPageNumLeft.textContent = `Page ${tier.roman} \u2022 ${tier.title}`;
      if (spellbookPageNumRight) spellbookPageNumRight.textContent = `Page ${tier.roman}b \u2022 Details`;
    }

    // Filter songs for Attuned or current tier
    const query = (spellbookSearchInput?.value || '').trim().toLowerCase();
    const basePool = ctx.spellbookFavoritesOnly
      ? favoriteEntries
      : allEntries.filter((e) => getSpellbookTierIndexForLevel(e.spellLevel) === ctx.currentSpellbookTierIndex);

    const matchingSongs = basePool.filter((e) => {
      if (!query) return true;
      return e.title.toLowerCase().includes(query) || e.fileName.toLowerCase().includes(query);
    });

    // Alphabetical sort by title
    matchingSongs.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));

    // Capture focused star button entry ID so keyboard focus survives re-render
    const activeStarEntryId = document.activeElement?.classList?.contains('spellbook-card-star-btn')
      ? document.activeElement.dataset.entryId || null
      : null;

    // Render Left Page Song List or Empty State
    if (spellbookSongList) {
      spellbookSongList.innerHTML = '';
    }

    if (matchingSongs.length === 0) {
      ctx.selectedSpellbookEntryId = null;
      if (spellbookEmptyState) {
        spellbookEmptyState.classList.remove('hidden');
        const emptyHeading = spellbookEmptyState.querySelector('.empty-tier-heading');
        if (emptyHeading) {
          if (ctx.spellbookFavoritesOnly) {
            emptyHeading.textContent = query ? 'No Matching Attuned Spells' : 'No Attuned Spells Yet';
          } else {
            emptyHeading.textContent = query ? 'No Matching Spells in this Tier' : `No ${tier.title} Yet`;
          }
        }
        const emptyText = spellbookEmptyState.querySelector('.empty-tier-text');
        if (emptyText) {
          if (ctx.spellbookFavoritesOnly) {
            emptyText.textContent = query
              ? `No attuned spells matched "${query}". Clear the search box to see all attuned spells.`
              : 'Tap the \u2606 star on any spell card or detail panel to attune your focus songs here.';
          } else {
            emptyText.textContent = query
              ? `No songs matched "${query}". Clear the search box or check other tiers.`
              : `No ${tier.title.toLowerCase()} cataloged in your grimoire yet. Visit the Quest Board to forge new spells!`;
          }
        }
      }
      renderSpellbookDetails(null);
    } else {
      if (spellbookEmptyState) {
        spellbookEmptyState.classList.add('hidden');
      }

      // Determine currently selected entry
      let selectedEntry = matchingSongs.find((e) => e.id === ctx.selectedSpellbookEntryId);
      if (!selectedEntry && ctx.currentSong) {
        selectedEntry = matchingSongs.find((e) => {
          return (
            (ctx.currentSong.filePath && e.filePath && path.resolve(String(ctx.currentSong.filePath)) === path.resolve(String(e.filePath))) ||
            ctx.currentSong.fileName.toLowerCase() === e.fileName.toLowerCase()
          );
        });
      }
      if (!selectedEntry) {
        selectedEntry = matchingSongs[0];
      }
      ctx.selectedSpellbookEntryId = selectedEntry.id;

      let starBtnToRefocus = null;

      for (const entry of matchingSongs) {
        const isSelected = entry.id === ctx.selectedSpellbookEntryId;
        const isActiveHighway = Boolean(
          ctx.currentSong &&
          ((ctx.currentSong.filePath && entry.filePath && path.resolve(String(ctx.currentSong.filePath)) === path.resolve(String(entry.filePath))) ||
           ctx.currentSong.fileName.toLowerCase() === entry.fileName.toLowerCase())
        );

        const item = document.createElement('div');
        item.className = `spellbook-song-item${isSelected ? ' selected' : ''}${entry.newlyIngested ? ' newly-ingested' : ''}`;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', isSelected ? 'true' : 'false');
        item.tabIndex = 0;

        const titleWrap = document.createElement('div');
        titleWrap.className = 'spellbook-song-item-title';
        titleWrap.title = entry.title;

        if (isActiveHighway) {
          const activeIndicator = document.createElement('span');
          activeIndicator.className = 'song-active-indicator';
          activeIndicator.title = 'Currently Loaded on Spell Highway';
          activeIndicator.textContent = '\u25B6 ';
          titleWrap.appendChild(activeIndicator);
        }

        const titleText = document.createElement('span');
        titleText.textContent = entry.title;
        titleWrap.appendChild(titleText);

        const metaSpan = document.createElement('span');
        metaSpan.className = 'spellbook-song-item-meta';
        metaSpan.title = `${entry.spellLevel} \u2022 ${entry.bpm} BPM \u2022 ${formatSeconds(entry.duration)}`;
        metaSpan.textContent = ctx.spellbookFavoritesOnly
          ? `${entry.spellLevel} \u2022 ${formatSeconds(entry.duration)}`
          : `${entry.bpm} \u2022 ${formatSeconds(entry.duration)}`;

        const isPreviewingThis = grimoirePreviewController.isPreviewingEntry(entry.id);
        const cardPreviewBtn = document.createElement('button');
        cardPreviewBtn.type = 'button';
        cardPreviewBtn.className = `spellbook-card-preview-btn${isPreviewingThis ? ' is-previewing' : ''}`;
        cardPreviewBtn.dataset.entryId = entry.id;
        cardPreviewBtn.dataset.entryTitle = entry.title;
        cardPreviewBtn.textContent = isPreviewingThis ? '\u25A0' : '\u25B6';
        cardPreviewBtn.title = isPreviewingThis
          ? `Stop 30s preview of "${entry.title}"`
          : `Preview 30s of "${entry.title}"`;
        cardPreviewBtn.setAttribute('aria-label', isPreviewingThis ? `Stop preview of ${entry.title}` : `Preview ${entry.title}`);
        cardPreviewBtn.setAttribute('aria-pressed', isPreviewingThis ? 'true' : 'false');
        cardPreviewBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          handleGrimoirePreviewButtonClick(entry, cardPreviewBtn);
        });
        cardPreviewBtn.addEventListener('dblclick', (e) => {
          e.stopPropagation();
        });

        const cardStarBtn = document.createElement('button');
        cardStarBtn.type = 'button';
        cardStarBtn.className = `spellbook-card-star-btn${entry.isFavorite ? ' is-favorite' : ''}`;
        cardStarBtn.dataset.entryId = entry.id;
        cardStarBtn.textContent = entry.isFavorite ? '\u2605' : '\u2606';
        cardStarBtn.title = entry.isFavorite ? `Unattune "${entry.title}"` : `Attune "${entry.title}"`;
        cardStarBtn.setAttribute('aria-label', entry.isFavorite ? `Unattune ${entry.title}` : `Attune ${entry.title}`);
        cardStarBtn.setAttribute('aria-pressed', entry.isFavorite ? 'true' : 'false');
        cardStarBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          toggleGrimoireFavorite(entry.id);
        });

        if (activeStarEntryId && activeStarEntryId === entry.id) {
          starBtnToRefocus = cardStarBtn;
        }

        item.appendChild(titleWrap);
        item.appendChild(metaSpan);
        item.appendChild(cardPreviewBtn);
        item.appendChild(cardStarBtn);

        if (isGrimoireEntryDeletable(entry)) {
          const cardDeleteBtn = document.createElement('button');
          cardDeleteBtn.type = 'button';
          cardDeleteBtn.className = 'spellbook-card-delete-btn';
          cardDeleteBtn.textContent = '\uD83D\uDDD1';
          cardDeleteBtn.title = `Remove "${entry.title}" and move to ./Archive`;
          cardDeleteBtn.setAttribute('aria-label', `Archive ${entry.title}`);
          cardDeleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            openDeleteSpellConfirmModal(entry);
          });
          item.appendChild(cardDeleteBtn);
        }

        item.addEventListener('click', () => {
          entry.newlyIngested = false;
          ctx.selectedSpellbookEntryId = entry.id;
          // Update selection UI & aria-selected
          spellbookSongList.querySelectorAll('.spellbook-song-item').forEach((el) => {
            el.classList.remove('selected');
            el.setAttribute('aria-selected', 'false');
          });
          item.classList.add('selected');
          item.setAttribute('aria-selected', 'true');
          renderSpellbookDetails(entry);
        });

        item.addEventListener('dblclick', () => {
          entry.newlyIngested = false;
          ctx.selectedSpellbookEntryId = entry.id;
          loadSelectedSpellbookSong();
        });

        item.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            entry.newlyIngested = false;
            ctx.selectedSpellbookEntryId = entry.id;
            loadSelectedSpellbookSong();
          }
        });

        spellbookSongList.appendChild(item);
      }

      if (starBtnToRefocus) {
        starBtnToRefocus.focus();
      }

      renderSpellbookDetails(selectedEntry);
    }

    // Navigation button states & Bookmark Tabs / Tier Pips (including Hall of Legends)
    if (btnSpellbookPrevPage) {
      btnSpellbookPrevPage.disabled = ctx.spellbookFavoritesOnly || ctx.currentSpellbookTierIndex <= 0;
    }
    if (btnSpellbookNextPage) {
      btnSpellbookNextPage.disabled = ctx.spellbookFavoritesOnly || ctx.currentSpellbookTierIndex >= TOTAL_SPELLBOOK_SPREADS - 1;
    }

    renderSpellbookTierPips();
  }

  function renderSpellbookDetails(entry) {
    const tier = SPELLBOOK_TIERS[ctx.currentSpellbookTierIndex] || SPELLBOOK_TIERS[0];

    if (!entry) {
      if (spellbookDetailTierChip) spellbookDetailTierChip.textContent = ctx.spellbookFavoritesOnly ? 'Attuned' : tier.levelName;
      if (spellbookDetailKeySig) spellbookDetailKeySig.classList.add('hidden');
      if (spellbookDetailSource) spellbookDetailSource.textContent = '\u2014';
      if (spellbookDetailTitle) spellbookDetailTitle.textContent = 'No Spell Selected';
      if (spellbookDetailFile) spellbookDetailFile.textContent = '\u2014';
      if (spellbookDetailBpm) spellbookDetailBpm.textContent = '\u2014 BPM';
      if (spellbookDetailDuration) spellbookDetailDuration.textContent = '\u2014';
      if (spellbookDetailNps) spellbookDetailNps.textContent = '\u2014 NPS';
      if (spellbookDetailNotes) spellbookDetailNotes.textContent = '\u2014';
      if (spellbookDetailPlays) spellbookDetailPlays.textContent = '0';
      if (spellbookDetailBestAcc) spellbookDetailBestAcc.textContent = '\u2014';
      if (spellbookDetailLastAcc) spellbookDetailLastAcc.textContent = '\u2014';
      if (spellbookDetailTotalXp) spellbookDetailTotalXp.textContent = '0 XP';
      if (spellbookDetailLastPlayed) spellbookDetailLastPlayed.textContent = 'Never performed on stage';
      if (spellbookDetailAudioBadge) spellbookDetailAudioBadge.classList.add('hidden');
      if (spellbookBundleStrip) spellbookBundleStrip.classList.add('hidden');
      if (spellbookBundleSheetChip) spellbookBundleSheetChip.classList.add('hidden');
      if (spellbookBundleSpotifyLink) spellbookBundleSpotifyLink.classList.add('hidden');
      if (btnSpellbookBundle) btnSpellbookBundle.disabled = true;
      if (btnSpellbookLoadSong) btnSpellbookLoadSong.disabled = true;
      if (btnSpellbookFavoriteSong) {
        btnSpellbookFavoriteSong.disabled = true;
        btnSpellbookFavoriteSong.classList.remove('is-favorite');
        btnSpellbookFavoriteSong.textContent = '\u2606';
        btnSpellbookFavoriteSong.setAttribute('aria-pressed', 'false');
        btnSpellbookFavoriteSong.title = 'Attune this spell';
      }
      if (btnSpellbookPreviewSong) {
        btnSpellbookPreviewSong.disabled = true;
        btnSpellbookPreviewSong.classList.remove('is-previewing');
        btnSpellbookPreviewSong.textContent = '\uD83C\uDFA7 Preview';
        btnSpellbookPreviewSong.setAttribute('aria-pressed', 'false');
      }
      if (btnSpellbookDeleteSong) btnSpellbookDeleteSong.classList.add('hidden');
      return;
    }

    if (spellbookDetailTierChip) {
      spellbookDetailTierChip.textContent = `${entry.spellLevel} (${entry.xpMultiplier.toFixed(1)}x XP)`;
    }
    if (spellbookDetailKeySig) {
      if (entry.keySignature) {
        spellbookDetailKeySig.textContent = entry.keySignature;
        spellbookDetailKeySig.classList.remove('hidden');
      } else {
        spellbookDetailKeySig.classList.add('hidden');
      }
    }
    if (spellbookDetailSource) {
      spellbookDetailSource.textContent = entry.filePath === 'BUILTIN_DEMO' ? 'Built-In Conservatory Spell' : entry.sourceTag;
    }
    if (spellbookDetailTitle) {
      spellbookDetailTitle.textContent = entry.title;
    }
    if (spellbookDetailFile) {
      spellbookDetailFile.textContent = entry.fileName;
    }
    if (spellbookDetailBpm) {
      spellbookDetailBpm.textContent = `${entry.bpm} BPM`;
    }
    if (spellbookDetailDuration) {
      spellbookDetailDuration.textContent = formatSeconds(entry.duration);
    }
    if (spellbookDetailNps) {
      spellbookDetailNps.textContent = `${entry.nps.toFixed(2)} NPS`;
    }
    if (spellbookDetailNotes) {
      spellbookDetailNotes.textContent = String(entry.totalNotes || '\u2014');
    }

    // Issue #76: Populate compact 1-row Grimoire Song Bundle strip
    const hasSheet = Boolean(entry.sheetMusicPath && fs.existsSync(entry.sheetMusicPath));
    const hasAudio = Boolean(entry.backingAudioPath && fs.existsSync(entry.backingAudioPath));
    const validSpotify = Boolean(entry.spotifyUrl && /^https?:\/\/\S+$/i.test(entry.spotifyUrl));
    const validYoutube = Boolean(entry.youtubeUrl && /^https?:\/\/\S+$/i.test(entry.youtubeUrl));
    const isBuiltInDemo = entry.filePath === 'BUILTIN_DEMO';

    if (spellbookBundleStrip) {
      spellbookBundleStrip.classList.remove('hidden');
    }
    if (spellbookBundleNotesChip) {
      const noteType = isMusicXmlFileName(entry.fileName || '') ? 'XML' : 'MIDI';
      const isClean = entry._appliedCleanupEnabled !== undefined
        ? Boolean(entry._appliedCleanupEnabled)
        : Boolean(midiCleanupGlobalEnabled);
      spellbookBundleNotesChip.textContent = isClean
        ? `\uD83C\uDFB9 ${noteType} \u2022 Clean`
        : `\uD83C\uDFB9 ${noteType}`;
      spellbookBundleNotesChip.title = isClean
        ? `${noteType} notes with Smart MIDI Hygiene ON`
        : `${noteType} notes (Raw uncleaned)`;
    }
    if (spellbookBundleSheetChip) {
      if (hasSheet) {
        const sheetExt = (path.extname(entry.sheetMusicPath) || '.SHEET').replace(/^\./, '').toUpperCase();
        spellbookBundleSheetChip.textContent = `\uD83D\uDCDC ${sheetExt}`;
        spellbookBundleSheetChip.title = `Open sheet music ref: ${path.basename(entry.sheetMusicPath)}`;
        spellbookBundleSheetChip.classList.remove('hidden');
      } else {
        spellbookBundleSheetChip.classList.add('hidden');
      }
    }
    if (spellbookBundleAudioChip) {
      spellbookBundleAudioChip.classList.toggle('chip-missing', !hasAudio);
      if (hasAudio) {
        const off = clampAudioOffsetSec(entry.audioOffsetSec || 0);
        const offBadge = Math.abs(off) >= 0.005 ? ` (${off >= 0 ? '+' : ''}${off.toFixed(2)}s)` : '';
        spellbookBundleAudioChip.textContent = `\uD83C\uDFB5 Audio${offBadge}`;
        spellbookBundleAudioChip.title = `Backing audio: ${path.basename(entry.backingAudioPath)}${offBadge ? ` \u2022 Offset ${offBadge.trim()}` : ''}`;
      } else {
        spellbookBundleAudioChip.textContent = '\uD83D\uDD07 No Audio';
        spellbookBundleAudioChip.title = 'No paired backing audio attached yet';
      }
    }
    if (spellbookBundleSpotifyLink) {
      if (validSpotify) {
        spellbookBundleSpotifyLink.textContent = '\u2197 Spotify';
        spellbookBundleSpotifyLink.title = entry.spotifyUrl;
        spellbookBundleSpotifyLink.classList.remove('hidden');
      } else if (validYoutube) {
        spellbookBundleSpotifyLink.textContent = '\u2197 YouTube';
        spellbookBundleSpotifyLink.title = entry.youtubeUrl;
        spellbookBundleSpotifyLink.classList.remove('hidden');
      } else {
        spellbookBundleSpotifyLink.classList.add('hidden');
      }
    }
    if (btnSpellbookBundle) {
      btnSpellbookBundle.disabled = isBuiltInDemo;
      const hasExtras = hasSheet || hasAudio || validSpotify || validYoutube;
      btnSpellbookBundle.textContent = hasExtras ? '\u2699 Bundle' : '+ Bundle';
      btnSpellbookBundle.title = isBuiltInDemo
        ? 'Song Bundle editor is unavailable for the Built-In Demo Spell'
        : 'Attach or manage Backing Audio, Sheet Music & Bundle Sync';
    }

    // Load rehearsal history from songPlayHistory store
    const hist = getSongHistoryRecord(entry);
    if (spellbookDetailPlays) {
      const plays = hist ? Number(hist.plays) || 0 : 0;
      spellbookDetailPlays.textContent = `${plays}`;
    }
    if (spellbookDetailBestAcc) {
      const bestAcc = hist && typeof hist.bestAccuracy === 'number' && hist.bestAccuracy > 0 ? hist.bestAccuracy : null;
      spellbookDetailBestAcc.textContent = bestAcc !== null ? `${bestAcc}%` : '\u2014';
    }
    if (spellbookDetailLastAcc) {
      const lastAcc = hist && typeof hist.lastAccuracy === 'number' && hist.lastAccuracy > 0 ? hist.lastAccuracy : null;
      spellbookDetailLastAcc.textContent = lastAcc !== null ? `${lastAcc}%` : '\u2014';
    }
    if (spellbookDetailTotalXp) {
      const xp = hist ? Number(hist.totalXpEarned) || 0 : 0;
      spellbookDetailTotalXp.textContent = `${xp.toLocaleString()} XP`;
    }
    if (spellbookDetailLastPlayed) {
      spellbookDetailLastPlayed.textContent = hist && hist.lastPlayed
        ? `Last played: ${formatAnnalsDate(hist.lastPlayed)}`
        : 'Never performed on stage';
    }

    // Backing audio badge
    if (spellbookDetailAudioBadge) {
      if (hasAudio) {
        spellbookDetailAudioBadge.classList.remove('hidden');
        spellbookDetailAudioBadge.textContent = '\uD83C\uDFB5 Backing Audio Synced';
      } else {
        spellbookDetailAudioBadge.classList.add('hidden');
      }
    }

    if (btnSpellbookLoadSong) {
      btnSpellbookLoadSong.disabled = false;
    }
    if (btnSpellbookPreviewSong) {
      btnSpellbookPreviewSong.disabled = false;
      updateGrimoirePreviewUI();
    }

    if (btnSpellbookFavoriteSong) {
      btnSpellbookFavoriteSong.disabled = false;
      const isFav = Boolean(entry.isFavorite);
      btnSpellbookFavoriteSong.classList.toggle('is-favorite', isFav);
      btnSpellbookFavoriteSong.textContent = isFav ? '\u2605' : '\u2606';
      btnSpellbookFavoriteSong.setAttribute('aria-pressed', isFav ? 'true' : 'false');
      btnSpellbookFavoriteSong.title = isFav ? `Unattune "${entry.title}"` : `Attune "${entry.title}"`;
      btnSpellbookFavoriteSong.setAttribute('aria-label', isFav ? `Unattune ${entry.title}` : `Attune ${entry.title}`);
    }

    // Delete button available for all file-backed Grimoire entries (Imports/ & Test Library)
    if (btnSpellbookDeleteSong) {
      if (isGrimoireEntryDeletable(entry)) {
        btnSpellbookDeleteSong.classList.remove('hidden');
        btnSpellbookDeleteSong.title = `Remove "${entry.title}" and move files to ./Archive`;
        btnSpellbookDeleteSong.setAttribute('aria-label', `Archive ${entry.title}`);
      } else {
        btnSpellbookDeleteSong.classList.add('hidden');
      }
    }
  }

  function loadSelectedSpellbookSong() {
    const entry = (ctx.selectedSpellbookEntryId && grimoireSpells.get(ctx.selectedSpellbookEntryId)) || null;
    if (!entry) return;

    stopGrimoirePreview();
    loadGrimoireEntry(entry);
    closeGrimoireSpellbook();
    hideTavernMenu();
    resetPlaybackToStart();
    showGrimoireToast(`\uD83D\uDCD6 Inscribed "${entry.title}" (${entry.spellLevel}) on Spell Highway!`);
  }

  function deleteSelectedSpellbookSong() {
    const entry = (ctx.selectedSpellbookEntryId && grimoireSpells.get(ctx.selectedSpellbookEntryId)) || null;
    if (!entry || !isGrimoireEntryDeletable(entry)) return;
    openDeleteSpellConfirmModal(entry);
  }

  /**
   * Backward-compatible helper called across the codebase to update Grimoire stats
   * and refresh the open spellbook spread
   */
  function renderGrimoireSidebar() {
    if (grimoireCountBadge) {
      grimoireCountBadge.textContent = String(grimoireSpells.size);
    }
    updateTavernMenuStats();
    if (grimoireSpellbookModal && !grimoireSpellbookModal.classList.contains('hidden')) {
      renderSpellbookSpread();
    }
  }

  /**
   * Load a selected Spell Card from The Grimoire onto the Spell Highway
   */

  return {
    HALL_OF_LEGENDS_SPREAD_INDEX,
    grimoirePreviewController,
    openGrimoireSpellbook,
    closeSpellbookPreviewMenu,
    stopGrimoirePreview,
    updateGrimoirePreviewUI,
    openSpellbookPreviewMenu,
    handleGrimoirePreviewButtonClick,
    closeGrimoireSpellbook,
    flipSpellbookPage,
    navigateToSpellbookTier,
    renderSpellbookTierPips,
    findGrimoireEntryForLegendRecord,
    renderHallOfLegendsList,
    renderHallOfLegendsSpread,
    renderSpellbookSpread,
    renderSpellbookDetails,
    loadSelectedSpellbookSong,
    deleteSelectedSpellbookSong,
    renderGrimoireSidebar
  };
}

module.exports = { createSpellbookUI };
