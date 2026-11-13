/**
 * College of Keys — Song Bundle Store, Sync Math & Audio Onset Calibrator (Issue #76)
 *
 * Pure CJS helper module shared between renderer.js and unit tests:
 * - Binds clean playable notes (.mid/.musicxml) with optional sheet music ref, stereo backing audio,
 *   Spotify bookmark URL, and per-song calibration (`audioOffsetSec`, `audioTempoRatio`, `midiCleanupEnabled`).
 * - Computes drift-aware audio time mapping and estimates first acoustic onset for Auto-Align.
 */

const fs = require('fs');
const path = require('path');

const BUNDLE_STORE_FILENAME = 'grimoire_bundles.json';
const BACKING_AUDIO_EXTS = ['.wav', '.mp3', '.ogg', '.m4a', '.flac'];
const SHEET_REF_EXTS = ['.musicxml', '.mxl', '.xml', '.pdf'];

const MIN_OFFSET_SEC = -30.0;
const MAX_OFFSET_SEC = 30.0;
const MIN_TEMPO_RATIO = 0.85;
const MAX_TEMPO_RATIO = 1.15;

function clampAudioOffsetSec(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const clamped = Math.max(MIN_OFFSET_SEC, Math.min(MAX_OFFSET_SEC, num));
  return Math.round(clamped * 1000) / 1000;
}

function clampAudioTempoRatio(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return 1.0;
  const clamped = Math.max(MIN_TEMPO_RATIO, Math.min(MAX_TEMPO_RATIO, num));
  return Math.round(clamped * 10000) / 10000;
}

function normalizeComparablePath(filePath) {
  if (!filePath || typeof filePath !== 'string' || filePath === 'BUILTIN_DEMO') return null;
  try {
    const resolved = path.resolve(filePath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  } catch {
    return null;
  }
}

function isSameFilePath(pathA, pathB) {
  const normA = normalizeComparablePath(pathA);
  const normB = normalizeComparablePath(pathB);
  return Boolean(normA && normB && normA === normB);
}

function toPortablePath(targetPath, baseDir) {
  if (!targetPath || typeof targetPath !== 'string' || targetPath === 'BUILTIN_DEMO') return null;
  try {
    const resolvedTarget = path.resolve(targetPath);
    if (baseDir) {
      const resolvedBase = path.resolve(baseDir);
      const rel = path.relative(resolvedBase, resolvedTarget);
      if (rel && !rel.startsWith('..') && !path.isAbsolute(rel)) {
        return rel.split(path.sep).join('/');
      }
    }
    return resolvedTarget;
  } catch {
    return targetPath;
  }
}

function fromPortablePath(storedPath, baseDir) {
  if (!storedPath || typeof storedPath !== 'string' || storedPath === 'BUILTIN_DEMO') return null;
  try {
    if (path.isAbsolute(storedPath)) {
      return path.resolve(storedPath);
    }
    if (baseDir) {
      return path.resolve(baseDir, storedPath);
    }
    return path.resolve(storedPath);
  } catch {
    return storedPath;
  }
}

function getSidecarBundlePath(notesFilePath) {
  if (!notesFilePath || typeof notesFilePath !== 'string' || notesFilePath === 'BUILTIN_DEMO') return null;
  const baseNoExt = notesFilePath.replace(/\.(mid|midi|musicxml|xml|mxl)$/i, '');
  if (!baseNoExt || baseNoExt === notesFilePath) {
    return `${notesFilePath}.bundle.json`;
  }
  return `${baseNoExt}.bundle.json`;
}

function readJsonFileSafe(filePath, fallback) {
  try {
    if (!filePath || !fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function loadBundlesStore(storePath) {
  const data = readJsonFileSafe(storePath, null);
  if (data && data.bundles && typeof data.bundles === 'object' && !Array.isArray(data.bundles)) {
    return { version: 1, bundles: data.bundles };
  }
  return { version: 1, bundles: {} };
}

function saveBundlesStore(storePath, store) {
  if (!storePath) return false;
  try {
    const payload = {
      version: 1,
      updatedAt: new Date().toISOString(),
      bundles: store?.bundles && typeof store.bundles === 'object' ? store.bundles : {}
    };
    fs.writeFileSync(storePath, JSON.stringify(payload, null, 2), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function sanitizeExternalHttpUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return null;
  if (/^https?:\/\/\S+$/i.test(trimmed)) return trimmed;
  return null;
}

function findSiblingAsset(notesFilePath, exts, excludeSelf = false) {
  if (!notesFilePath || notesFilePath === 'BUILTIN_DEMO') return null;
  try {
    const dir = path.dirname(notesFilePath);
    const resolvedSelf = path.resolve(notesFilePath);
    const base = path.basename(notesFilePath).replace(/\.(mid|midi|musicxml|xml|mxl)$/i, '');
    for (const ext of exts) {
      const candidate = path.join(dir, `${base}${ext}`);
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        if (excludeSelf && isSameFilePath(candidate, resolvedSelf)) continue;
        return candidate;
      }
    }
  } catch {
    // Ignore sibling filesystem check error
  }
  return null;
}

/**
 * Resolve bundle metadata and asset paths for any Grimoire song.
 * Priority: grimoire_bundles.json (by notesPath or songId) > <Base>.bundle.json sidecar > sibling file matching.
 */
function resolveBundleForSong({
  filePath = null,
  fileName = null,
  songId = null,
  title = null,
  store = null,
  projectRoot = null
} = {}) {
  const baseDir = projectRoot || process.cwd();
  const entries = store?.bundles ? Object.values(store.bundles) : [];
  const normFile = normalizeComparablePath(filePath);

  const isDemoFile = filePath === 'BUILTIN_DEMO';
  let matchedRecord = null;
  if (isDemoFile) {
    matchedRecord = entries.find((rec) => rec && rec.notesPath === 'BUILTIN_DEMO') || null;
  } else if (normFile) {
    matchedRecord = entries.find((rec) => {
      if (!rec || rec.notesPath === 'BUILTIN_DEMO') return false;
      const recResolved = fromPortablePath(rec.notesPath, baseDir);
      return isSameFilePath(recResolved, filePath);
    }) || null;
  }

  const sidecarPath = isDemoFile ? null : getSidecarBundlePath(filePath);
  let sidecarRecord = null;
  if (sidecarPath && fs.existsSync(sidecarPath)) {
    const sidecarData = readJsonFileSafe(sidecarPath, null);
    if (sidecarData && typeof sidecarData === 'object') {
      sidecarRecord = sidecarData;
    }
  }

  if (!isDemoFile && !matchedRecord && songId && songId !== 'builtin::demo') {
    matchedRecord = entries.find((rec) => {
      if (!rec || !rec.songId || rec.songId !== songId || rec.notesPath === 'BUILTIN_DEMO') return false;
      if (!filePath) return true;
      const recNotes = rec.notesPath ? fromPortablePath(rec.notesPath, baseDir) : null;
      // Only fall back to songId when re-linking a missing/moved file, not stealing another existing file's bundle
      return !recNotes || !fs.existsSync(recNotes);
    }) || null;
  }
  if (!isDemoFile && !matchedRecord && fileName) {
    const lowerName = String(fileName).toLowerCase();
    const byName = entries.filter((rec) => {
      if (!rec || !rec.fileName || String(rec.fileName).toLowerCase() !== lowerName || rec.notesPath === 'BUILTIN_DEMO') return false;
      if (!filePath) return true;
      const recNotes = rec.notesPath ? fromPortablePath(rec.notesPath, baseDir) : null;
      return !recNotes || !fs.existsSync(recNotes);
    });
    if (byName.length === 1) {
      matchedRecord = byName[0];
    }
  }

  // Merge record (compare updatedAt when both store and sidecar exist; sidecar fills any missing fields)
  const matchedTs = matchedRecord?.updatedAt ? Date.parse(matchedRecord.updatedAt) : NaN;
  const sidecarTs = sidecarRecord?.updatedAt ? Date.parse(sidecarRecord.updatedAt) : NaN;
  const sidecarIsNewer = Boolean(
    matchedRecord &&
    sidecarRecord &&
    Number.isFinite(sidecarTs) &&
    (!Number.isFinite(matchedTs) || sidecarTs > matchedTs)
  );
  const record = sidecarIsNewer ? sidecarRecord : (matchedRecord || sidecarRecord || null);
  const fallbackRecord = matchedRecord && sidecarRecord ? (sidecarIsNewer ? matchedRecord : sidecarRecord) : null;

  const pickExistingPath = (rawPath, pathBaseDir) => {
    if (!rawPath) return null;
    const candidate = fromPortablePath(rawPath, pathBaseDir);
    try {
      if (candidate && fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // Ignore broken candidate
    }
    return null;
  };

  const sidecarDir = sidecarPath ? path.dirname(sidecarPath) : baseDir;
  const audioUnlinked = Boolean(record?.audioUnlinked ?? fallbackRecord?.audioUnlinked);
  const sheetUnlinked = Boolean(record?.sheetUnlinked ?? fallbackRecord?.sheetUnlinked);

  const orderedSources = sidecarIsNewer
    ? [
        { rec: sidecarRecord, dir: sidecarDir },
        { rec: matchedRecord, dir: baseDir }
      ]
    : [
        { rec: matchedRecord, dir: baseDir },
        { rec: sidecarRecord, dir: sidecarDir }
      ];

  let backingAudioPath = null;
  if (!audioUnlinked) {
    for (const src of orderedSources) {
      backingAudioPath = pickExistingPath(src.rec?.backingAudioPath, src.dir);
      if (backingAudioPath) break;
    }
    if (!backingAudioPath && filePath && !isDemoFile) {
      backingAudioPath = findSiblingAsset(filePath, BACKING_AUDIO_EXTS, false);
    }
  }

  let sheetMusicPath = null;
  if (!sheetUnlinked) {
    for (const src of orderedSources) {
      sheetMusicPath = pickExistingPath(src.rec?.sheetMusicPath, src.dir);
      if (sheetMusicPath) break;
    }
    if (!sheetMusicPath && filePath && !isDemoFile) {
      // Exclude primary MusicXML itself unless user explicitly attached PDF/sibling sheet,
      // OR recognize sibling .pdf / .musicxml / .mxl attached alongside a .mid
      sheetMusicPath = findSiblingAsset(filePath, SHEET_REF_EXTS, true);
    }
  }

  const audioOffsetSec = clampAudioOffsetSec(
    record?.audioOffsetSec ?? fallbackRecord?.audioOffsetSec ?? 0
  );
  const audioTempoRatio = clampAudioTempoRatio(
    record?.audioTempoRatio ?? fallbackRecord?.audioTempoRatio ?? 1.0
  );
  const midiCleanupEnabled =
    typeof record?.midiCleanupEnabled === 'boolean'
      ? record.midiCleanupEnabled
      : (typeof fallbackRecord?.midiCleanupEnabled === 'boolean' ? fallbackRecord.midiCleanupEnabled : null);

  const youtubeUrl = sanitizeExternalHttpUrl(record?.youtubeUrl ?? fallbackRecord?.youtubeUrl);
  const spotifyUrl = sanitizeExternalHttpUrl(record?.spotifyUrl ?? fallbackRecord?.spotifyUrl);

  const resolvedNotesPath = filePath ||
    pickExistingPath(record?.notesPath, sidecarIsNewer ? sidecarDir : baseDir) ||
    pickExistingPath(fallbackRecord?.notesPath, sidecarIsNewer ? baseDir : sidecarDir);

  return {
    id: record?.id || songId || fileName || title || null,
    title: record?.title || fallbackRecord?.title || title || null,
    notesPath: resolvedNotesPath,
    sheetMusicPath: sheetMusicPath || null,
    backingAudioPath: backingAudioPath || null,
    audioUnlinked,
    sheetUnlinked,
    youtubeUrl: youtubeUrl || null,
    spotifyUrl: spotifyUrl || null,
    audioOffsetSec,
    audioTempoRatio,
    midiCleanupEnabled,
    sidecarPath: sidecarPath && fs.existsSync(sidecarPath) ? sidecarPath : null,
    hasCustomBundle: Boolean(
      sheetMusicPath ||
      backingAudioPath ||
      audioUnlinked ||
      sheetUnlinked ||
      youtubeUrl ||
      spotifyUrl ||
      Math.abs(audioOffsetSec) > 0.0001 ||
      Math.abs(audioTempoRatio - 1.0) > 0.0001 ||
      typeof midiCleanupEnabled === 'boolean'
    )
  };
}

/**
 * Persist a bundle record to grimoire_bundles.json and (when inside writable Imports/ or existing sidecar)
 * write a portable <Base>.bundle.json sidecar alongside the notes file.
 */
function saveBundleRecord({
  storePath,
  projectRoot,
  importsDir = null,
  writeSidecar = false,
  record = {}
} = {}) {
  const baseDir = projectRoot || process.cwd();
  const store = loadBundlesStore(storePath);

  const notesAbs = record.notesPath && record.notesPath !== 'BUILTIN_DEMO'
    ? path.resolve(record.notesPath)
    : null;
  const portableNotes = notesAbs ? toPortablePath(notesAbs, baseDir) : (record.notesPath === 'BUILTIN_DEMO' ? 'BUILTIN_DEMO' : null);
  const key = portableNotes || (record.songId ? `song::${record.songId}` : null) || (record.fileName ? `file::${String(record.fileName).toLowerCase()}` : null);
  if (!key) {
    throw new Error('Cannot save bundle without a notesPath, songId, or fileName.');
  }

  const existing = store.bundles[key] || {};
  const nextSheetPath = record.sheetMusicPath !== undefined
    ? toPortablePath(record.sheetMusicPath, baseDir)
    : (existing.sheetMusicPath || null);
  const nextAudioPath = record.backingAudioPath !== undefined
    ? toPortablePath(record.backingAudioPath, baseDir)
    : (existing.backingAudioPath || null);

  const nextAudioUnlinked = nextAudioPath
    ? false
    : (record.audioUnlinked !== undefined ? Boolean(record.audioUnlinked) : Boolean(existing.audioUnlinked));
  const nextSheetUnlinked = nextSheetPath
    ? false
    : (record.sheetUnlinked !== undefined ? Boolean(record.sheetUnlinked) : Boolean(existing.sheetUnlinked));

  const nextEntry = {
    id: record.id || existing.id || record.songId || key,
    songId: record.songId || existing.songId || null,
    title: record.title !== undefined ? record.title : (existing.title || null),
    fileName: record.fileName || existing.fileName || (notesAbs ? path.basename(notesAbs) : null),
    notesPath: portableNotes || existing.notesPath || null,
    sheetMusicPath: nextSheetPath,
    backingAudioPath: nextAudioPath,
    audioUnlinked: nextAudioUnlinked,
    sheetUnlinked: nextSheetUnlinked,
    youtubeUrl: record.youtubeUrl !== undefined
      ? sanitizeExternalHttpUrl(record.youtubeUrl)
      : (existing.youtubeUrl || null),
    spotifyUrl: record.spotifyUrl !== undefined
      ? sanitizeExternalHttpUrl(record.spotifyUrl)
      : (existing.spotifyUrl || null),
    audioOffsetSec: clampAudioOffsetSec(
      record.audioOffsetSec !== undefined ? record.audioOffsetSec : (existing.audioOffsetSec ?? 0)
    ),
    audioTempoRatio: clampAudioTempoRatio(
      record.audioTempoRatio !== undefined ? record.audioTempoRatio : (existing.audioTempoRatio ?? 1.0)
    ),
    midiCleanupEnabled: record.midiCleanupEnabled !== undefined
      ? (typeof record.midiCleanupEnabled === 'boolean' ? record.midiCleanupEnabled : null)
      : (typeof existing.midiCleanupEnabled === 'boolean' ? existing.midiCleanupEnabled : null),
    updatedAt: new Date().toISOString()
  };

  store.bundles[key] = nextEntry;
  saveBundlesStore(storePath, store);

  let sidecarWrittenPath = null;
  if (notesAbs && notesAbs !== 'BUILTIN_DEMO') {
    const sidecarPath = getSidecarBundlePath(notesAbs);
    const inImportsDir = importsDir && normalizeComparablePath(path.dirname(notesAbs)) === normalizeComparablePath(importsDir);
    const hasSidecarAlready = sidecarPath && fs.existsSync(sidecarPath);

    if (sidecarPath && (writeSidecar || inImportsDir || hasSidecarAlready)) {
      const sidecarDir = path.dirname(sidecarPath);
      const sidecarPayload = {
        version: 1,
        title: nextEntry.title,
        notesFile: path.basename(notesAbs),
        sheetMusicPath: nextEntry.sheetMusicPath
          ? toPortablePath(fromPortablePath(nextEntry.sheetMusicPath, baseDir), sidecarDir)
          : null,
        backingAudioPath: nextEntry.backingAudioPath
          ? toPortablePath(fromPortablePath(nextEntry.backingAudioPath, baseDir), sidecarDir)
          : null,
        audioUnlinked: nextEntry.audioUnlinked,
        sheetUnlinked: nextEntry.sheetUnlinked,
        youtubeUrl: nextEntry.youtubeUrl,
        spotifyUrl: nextEntry.spotifyUrl,
        audioOffsetSec: nextEntry.audioOffsetSec,
        audioTempoRatio: nextEntry.audioTempoRatio,
        midiCleanupEnabled: nextEntry.midiCleanupEnabled,
        updatedAt: nextEntry.updatedAt
      };
      try {
        fs.writeFileSync(sidecarPath, JSON.stringify(sidecarPayload, null, 2), 'utf8');
        sidecarWrittenPath = sidecarPath;
      } catch {
        // Ignore read-only sidecar write failure; global store still persisted
      }
    }
  }

  return {
    key,
    record: nextEntry,
    sidecarPath: sidecarWrittenPath
  };
}

function removeBundleRecordForSong({ storePath, projectRoot, filePath, songId, fileName }) {
  const baseDir = projectRoot || process.cwd();
  const store = loadBundlesStore(storePath);
  let removed = false;

  for (const [k, rec] of Object.entries(store.bundles)) {
    if (!rec) continue;
    const recNotes = rec.notesPath && rec.notesPath !== 'BUILTIN_DEMO'
      ? fromPortablePath(rec.notesPath, baseDir)
      : null;

    let shouldDelete = false;
    if (filePath && filePath !== 'BUILTIN_DEMO') {
      if (recNotes) {
        shouldDelete = isSameFilePath(recNotes, filePath);
      } else if (rec.notesPath !== 'BUILTIN_DEMO') {
        shouldDelete = Boolean(songId && rec.songId && rec.songId === songId);
      }
    } else if (filePath === 'BUILTIN_DEMO') {
      shouldDelete = rec.notesPath === 'BUILTIN_DEMO';
    } else {
      const matchId = Boolean(songId && rec.songId && rec.songId === songId);
      const matchName = Boolean(fileName && rec.fileName && rec.fileName.toLowerCase() === fileName.toLowerCase());
      shouldDelete = matchId || matchName;
    }

    if (shouldDelete) {
      delete store.bundles[k];
      removed = true;
    }
  }

  if (removed) {
    saveBundlesStore(storePath, store);
  }
  return removed;
}

/**
 * Sync mapping formula:
 * targetAudioTime = songTime * audioTempoRatio + audioOffsetSec
 */
function getMappedBackingAudioTime(songTime, sync = {}) {
  const offset = clampAudioOffsetSec(sync?.audioOffsetSec ?? 0);
  const ratio = clampAudioTempoRatio(sync?.audioTempoRatio ?? 1.0);
  const rawAudioTime = Number(songTime || 0) * ratio + offset;
  return {
    rawAudioTime,
    clampedAudioTime: Math.max(0, rawAudioTime),
    isBeforeAudioStart: rawAudioTime < 0
  };
}

function getEffectiveBackingPlaybackRate(playbackSpeed = 1.0, audioTempoRatio = 1.0) {
  const speed = Math.max(0.25, Math.min(2.0, Number(playbackSpeed) || 1.0));
  const ratio = clampAudioTempoRatio(audioTempoRatio);
  return Math.round(speed * ratio * 100000) / 100000;
}

function computeAudioOffsetForBeat1(heardAudioSec, firstPlayableNoteSec = 0, audioTempoRatio = 1.0) {
  const heard = Number(heardAudioSec);
  const firstNote = Math.max(0, Number(firstPlayableNoteSec) || 0);
  const ratio = clampAudioTempoRatio(audioTempoRatio);
  if (!Number.isFinite(heard)) return 0;
  return clampAudioOffsetSec(heard - firstNote * ratio);
}

/**
 * Detect first musical onset time (in seconds) from float PCM samples (e.g. Web Audio channelData).
 * Uses 20ms sliding RMS energy with noise-floor estimation and short transient confirmation
 * so leading silence or YouTube intros are detected cleanly without triggering on room hiss.
 */
function detectFirstAudioOnsetSec(samples, sampleRate, maxScanSeconds = 35) {
  if (!samples || samples.length === 0 || !Number.isFinite(sampleRate) || sampleRate <= 0) {
    return null;
  }

  const hopSamples = Math.max(128, Math.floor(sampleRate * 0.02)); // 20ms resolution
  const maxSamples = Math.min(samples.length, Math.floor(sampleRate * maxScanSeconds));
  const frameRms = [];

  for (let start = 0; start + hopSamples <= maxSamples; start += hopSamples) {
    let sumSq = 0;
    for (let i = start; i < start + hopSamples; i++) {
      const s = samples[i];
      sumSq += s * s;
    }
    frameRms.push(Math.sqrt(sumSq / hopSamples));
  }

  if (frameRms.length === 0) return null;

  let peakRms = 0;
  for (const r of frameRms) {
    if (r > peakRms) peakRms = r;
  }
  if (peakRms < 0.008) return null; // Essentially silent file

  const sortedRms = frameRms.slice().sort((a, b) => a - b);
  const noiseFloor = sortedRms[Math.floor(sortedRms.length * 0.2)] || 0;
  const threshold = Math.max(0.012, noiseFloor * 3.5, peakRms * 0.08);

  for (let idx = 0; idx < frameRms.length; idx++) {
    if (frameRms[idx] >= threshold) {
      const nextRms = frameRms[idx + 1] ?? frameRms[idx];
      // Require sustained note body or strong attack (filters 20ms click/pop)
      if (nextRms >= threshold * 0.65 || frameRms[idx] >= peakRms * 0.2) {
        return Math.round(((idx * hopSamples) / sampleRate) * 1000) / 1000;
      }
    }
  }

  return null;
}

module.exports = {
  BUNDLE_STORE_FILENAME,
  BACKING_AUDIO_EXTS,
  SHEET_REF_EXTS,
  clampAudioOffsetSec,
  clampAudioTempoRatio,
  normalizeComparablePath,
  isSameFilePath,
  toPortablePath,
  fromPortablePath,
  getSidecarBundlePath,
  loadBundlesStore,
  saveBundlesStore,
  resolveBundleForSong,
  saveBundleRecord,
  removeBundleRecordForSong,
  getMappedBackingAudioTime,
  getEffectiveBackingPlaybackRate,
  computeAudioOffsetForBeat1,
  detectFirstAudioOnsetSec
};
