/**
 * Issue #159: Synced Lyrics Fetcher & Enhanced Word-Level LRC Parser
 *
 * - Cleans noisy YouTube / filename titles (e.g. "YouTube John Legend - All of Me (Official Video)")
 * - Queries LRCLIB (lrclib.net `/api/get` & `/api/search`) for both word-level `lyricsfile` YAML
 *   and line-level `syncedLyrics` with ±5s duration matching
 * - Parses standard `[mm:ss.xx]` LRC and enhanced `<mm:ss.xx> word` karaoke LRC
 * - Persists sibling `<song>.lrc` files next to imported `.mid`/`.musicxml` scrolls
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const LRCLIB_USER_AGENT = 'CollegeOfKeys/1.5.2 (https://github.com/kiyoshithekidd/college-of-keys)';

/**
 * Strip YouTube prefixes, bracketed video tags, extensions, and underscores from a song title.
 * Returns { artist, track, query }.
 */
function cleanSongQueryFromTitle(rawTitle) {
  let s = String(rawTitle || '').trim();
  if (!s) return { artist: '', track: '', query: '' };

  // Strip file extensions
  s = s.replace(/\.(mid|midi|musicxml|xml|mxl|wav|mp3|m4a|ogg|flac)$/i, '');
  // Replace underscores with spaces
  s = s.replace(/_+/g, ' ');
  // Strip leading "YouTube" / "YT" prefix often added by downloads or imports
  s = s.replace(/^(?:youtube|yt)\s*[:\-–—]?\s+/i, '');
  // Strip common YouTube parenthetical/bracketed suffixes
  s = s.replace(
    /[\(\[]\s*(?:official\s*(?:music\s*)?video|official\s*audio|lyric\s*video|lyrics?|audio|hd|hq|4k|remastered|live|acoustic|karaoke|instrumental|visualizer|full\s*song|explicit|clean)[^\)\]]*[\)\]]/gi,
    ' '
  );
  // Strip trailing pipe / channel suffixes (e.g. " | VEVO")
  s = s.replace(/\s*\|\s*.*$/, '');
  s = s.replace(/\s+/g, ' ').trim();

  let artist = '';
  let track = s;
  const dashMatch = s.match(/^(.+?)\s+[-–—]\s+(.+)$/);
  if (dashMatch) {
    artist = dashMatch[1].trim();
    track = dashMatch[2].trim();
  }

  return {
    artist,
    track,
    query: artist && track ? `${artist} ${track}` : track
  };
}

/**
 * Format seconds into LRC timestamp `mm:ss.xx` using exact integer centisecond rounding.
 */
function formatLrcTimestamp(sec) {
  const totalCentis = Math.max(0, Math.round((Number(sec) || 0) * 100));
  const mins = Math.floor(totalCentis / 6000);
  const wholeSecs = Math.floor((totalCentis % 6000) / 100);
  const centis = totalCentis % 100;
  return `${String(mins).padStart(2, '0')}:${String(wholeSecs).padStart(2, '0')}.${String(centis).padStart(2, '0')}`;
}

/**
 * Parse a `[mm:ss.xx]` or `<mm:ss.xx>` timestamp capture into seconds.
 */
function parseTimestampParts(minsStr, secsStr, fracStr) {
  const mins = parseInt(minsStr, 10) || 0;
  const secs = parseInt(secsStr, 10) || 0;
  const frac = fracStr
    ? fracStr.length === 3
      ? parseInt(fracStr, 10) / 1000
      : fracStr.length === 2
        ? parseInt(fracStr, 10) / 100
        : parseInt(fracStr, 10) / 10
    : 0;
  return mins * 60 + secs + frac;
}

/**
 * Parse LRCLIB's YAML `lyricsfile` (word-level karaoke timings) into enhanced LRC text.
 * Supports `startTime` / `endTime` in milliseconds (> 1000 heuristic) or seconds.
 */
function convertLrclibLyricsfileToEnhancedLrc(yamlText) {
  if (!yamlText || typeof yamlText !== 'string') return null;
  const rawLines = yamlText.split(/\r?\n/);
  const parsedLines = [];

  let currentLine = null;
  let currentWord = null;
  let inWords = false;

  const commitWord = () => {
    if (currentLine && currentWord && currentWord.text !== undefined) {
      currentLine.words.push(currentWord);
    }
    currentWord = null;
  };

  const commitLine = () => {
    commitWord();
    if (currentLine && (currentLine.words.length > 0 || currentLine.text)) {
      parsedLines.push(currentLine);
    }
    currentLine = null;
    inWords = false;
  };

  const unquote = (val) => {
    const t = String(val || '').trim();
    if ((t.startsWith('"') && t.endsWith('"')) || (t.startsWith("'") && t.endsWith("'"))) {
      return t.slice(1, -1).replace(/\\"/g, '"').replace(/\\'/g, "'");
    }
    return t;
  };

  const parseNum = (val) => {
    const n = Number(String(val || '').replace(/#.*$/, '').trim());
    return Number.isFinite(n) ? n : null;
  };

  for (const raw of rawLines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const indent = raw.match(/^(\s*)/)[1].length;
    const trimmed = raw.trim();

    if (/^-\s+(startTime|endTime|text|words)\s*:/i.test(trimmed) && indent <= 4) {
      commitLine();
      currentLine = { startTime: null, endTime: null, words: [], text: '' };
      inWords = false;
      const keyMatch = trimmed.match(/^-\s+(startTime|endTime|text|words)\s*:(.*)$/i);
      const keyName = keyMatch[1].toLowerCase();
      const valStr = keyMatch[2];
      if (keyName === 'starttime') currentLine.startTime = parseNum(valStr);
      else if (keyName === 'endtime') currentLine.endTime = parseNum(valStr);
      else if (keyName === 'text') currentLine.text = unquote(valStr);
      else if (keyName === 'words') inWords = true;
      continue;
    }

    if (!currentLine) continue;

    if (/^words\s*:/i.test(trimmed)) {
      inWords = true;
      continue;
    }

    if (!inWords) {
      if (/^startTime\s*:/i.test(trimmed)) {
        currentLine.startTime = parseNum(trimmed.split(':').slice(1).join(':'));
      } else if (/^endTime\s*:/i.test(trimmed)) {
        currentLine.endTime = parseNum(trimmed.split(':').slice(1).join(':'));
      } else if (/^text\s*:/i.test(trimmed)) {
        currentLine.text = unquote(trimmed.split(':').slice(1).join(':'));
      }
      continue;
    }

    if (/^-\s+text\s*:/i.test(trimmed)) {
      commitWord();
      currentWord = { text: unquote(trimmed.replace(/^-\s+text\s*:/i, '')), startTime: null, endTime: null };
    } else if (/^-\s+startTime\s*:/i.test(trimmed)) {
      commitWord();
      currentWord = { text: '', startTime: parseNum(trimmed.replace(/^-\s+startTime\s*:/i, '')), endTime: null };
    } else if (currentWord) {
      if (/^text\s*:/i.test(trimmed)) {
        currentWord.text = unquote(trimmed.split(':').slice(1).join(':'));
      } else if (/^startTime\s*:/i.test(trimmed)) {
        currentWord.startTime = parseNum(trimmed.split(':').slice(1).join(':'));
      } else if (/^endTime\s*:/i.test(trimmed)) {
        currentWord.endTime = parseNum(trimmed.split(':').slice(1).join(':'));
      }
    }
  }
  commitLine();

  const wordLines = parsedLines.filter((l) => l.words.length > 0 && Number.isFinite(l.startTime));
  if (wordLines.length === 0) return null;

  let maxVal = 0;
  for (const l of wordLines) {
    if (l.startTime > maxVal) maxVal = l.startTime;
    for (const w of l.words) {
      if (Number.isFinite(w.startTime) && w.startTime > maxVal) maxVal = w.startTime;
    }
  }
  const toSec = maxVal > 1000 ? (v) => v / 1000.0 : (v) => v;

  const lrcOut = [];
  for (const l of wordLines) {
    const lineStart = toSec(l.startTime);
    const tokens = [];
    for (const w of l.words) {
      const wText = String(w.text || '').trim();
      if (!wText) continue;
      const ws = Number.isFinite(w.startTime) ? toSec(w.startTime) : lineStart;
      tokens.push(`<${formatLrcTimestamp(ws)}> ${wText}`);
    }
    if (tokens.length > 0) {
      lrcOut.push(`[${formatLrcTimestamp(lineStart)}] ${tokens.join(' ')}`);
    }
  }

  return lrcOut.length > 0 ? lrcOut.join('\n') : null;
}

/**
 * Parse standard `[mm:ss.xx] Line` OR enhanced `[mm:ss.xx] <mm:ss.xx> word <mm:ss.xx> word2` LRC text.
 * Also honors `[offset:±ms]` metadata tag and optional `offsetSec` shift.
 */
function parseEnhancedLrcText(rawText, offsetSec = 0) {
  if (!rawText || typeof rawText !== 'string') return [];
  const lines = rawText.split(/\r?\n/);
  const parsed = [];
  const lineTagRe = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
  const wordTagRe = /<(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?>/g;

  let headerOffsetSec = 0;
  for (const rawLine of lines) {
    const m = rawLine.trim().match(/^\[offset:\s*([+-]?\d+)\s*\]$/i);
    if (m) {
      headerOffsetSec = (parseInt(m[1], 10) || 0) / 1000.0;
    }
  }
  const totalShift = headerOffsetSec + (Number.isFinite(Number(offsetSec)) ? Number(offsetSec) : 0);

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) continue;
    if (/^\[(ar|ti|al|by|offset|re|ve|length):/i.test(trimmed)) continue;

    const times = [];
    let match;
    lineTagRe.lastIndex = 0;
    while ((match = lineTagRe.exec(trimmed)) !== null) {
      times.push(parseTimestampParts(match[1], match[2], match[3]));
    }

    const body = trimmed.replace(lineTagRe, '').trim();
    if (!body) continue;

    const wordMatches = [];
    wordTagRe.lastIndex = 0;
    let wm;
    while ((wm = wordTagRe.exec(body)) !== null) {
      wordMatches.push({
        time: parseTimestampParts(wm[1], wm[2], wm[3]),
        startIdx: wm.index,
        endIdx: wm.index + wm[0].length
      });
    }

    let words = null;
    let cleanText = body;
    if (wordMatches.length > 0) {
      words = [];
      const leadingText = body.slice(0, wordMatches[0].startIdx).trim();
      if (leadingText) {
        const lineStart = times.length > 0 ? Math.max(0, times[0] + totalShift) : Math.max(0, wordMatches[0].time + totalShift);
        const leadEnd = Math.max(lineStart + 0.08, wordMatches[0].time + totalShift);
        words.push({ text: leadingText, startTime: lineStart, endTime: leadEnd });
      }
      for (let i = 0; i < wordMatches.length; i++) {
        const cur = wordMatches[i];
        const next = wordMatches[i + 1];
        const sliceText = body.slice(cur.endIdx, next ? next.startIdx : body.length).trim();
        if (!sliceText) continue;
        const ws = Math.max(0, cur.time + totalShift);
        const we = next ? Math.max(ws + 0.08, next.time + totalShift) : ws + 0.45;
        words.push({ text: sliceText, startTime: ws, endTime: we });
      }
      cleanText = words.map((w) => w.text).join(' ').trim();
    }

    if (!cleanText) continue;

    if (times.length > 0) {
      for (const t of times) {
        const shiftedTime = Math.max(0, t + totalShift);
        parsed.push({
          time: shiftedTime,
          text: cleanText,
          words: words && times.length === 1 ? words : null
        });
      }
    } else {
      parsed.push({ time: null, text: cleanText, words: null });
    }
  }

  const hasTimestamps = parsed.some((p) => Number.isFinite(p.time));
  if (hasTimestamps) {
    const sorted = parsed.filter((p) => Number.isFinite(p.time)).sort((a, b) => a.time - b.time);
    for (let i = 0; i < sorted.length; i++) {
      const line = sorted[i];
      const next = sorted[i + 1];
      line.endTime = next ? Math.max(line.time + 0.3, next.time) : line.time + 4.0;
      if (line.words && line.words.length > 0) {
        const lastW = line.words[line.words.length - 1];
        if (next && lastW.endTime > next.time) {
          lastW.endTime = Math.max(lastW.startTime + 0.08, next.time);
        }
      }
    }
    return sorted;
  }
  return parsed;
}

/**
 * Simple HTTPS JSON GET helper (works in both Node tests and Electron renderer).
 */
function httpGetJson(urlStr, timeoutMs = 8000, redirectsLeft = 2) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      urlStr,
      {
        headers: {
          'User-Agent': LRCLIB_USER_AGENT,
          Accept: 'application/json'
        },
        timeout: timeoutMs
      },
      (res) => {
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          const nextUrl = new URL(res.headers.location, urlStr).toString();
          httpGetJson(nextUrl, timeoutMs, redirectsLeft - 1).then(resolve, reject);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          return resolve(null);
        }
        let body = '';
        let totalBytes = 0;
        const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          totalBytes += Buffer.byteLength(chunk, 'utf8');
          if (totalBytes > MAX_RESPONSE_BYTES) {
            req.destroy();
            return;
          }
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            resolve(null);
          }
        });
      }
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('LRCLIB request timed out'));
    });
    req.on('error', reject);
  });
}

/**
 * Score & pick the best LRCLIB result matching requested query & song duration (±5s match bonus).
 */
function selectBestLrclibCandidate(candidates, { artist = '', track = '', durationSec = 0 } = {}) {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const normTrack = String(track || '').toLowerCase();
  const normArtist = String(artist || '').toLowerCase();
  let best = null;
  let bestScore = -Infinity;

  for (const item of candidates) {
    if (!item || typeof item !== 'object') continue;
    const hasWord = Boolean(item.hasWordSync && item.lyricsfile);
    const hasSynced = Boolean(item.syncedLyrics && String(item.syncedLyrics).trim());
    const hasPlain = Boolean(item.plainLyrics && String(item.plainLyrics).trim());
    if (!hasWord && !hasSynced && !hasPlain) continue;

    let score = 0;
    if (hasWord) score += 120;
    else if (hasSynced) score += 90;
    else score += 20;

    const itemTrack = String(item.trackName || item.name || '').toLowerCase();
    const itemArtist = String(item.artistName || '').toLowerCase();
    if (normTrack && itemTrack.includes(normTrack)) score += 30;
    if (normArtist && itemArtist.includes(normArtist)) score += 25;

    if (durationSec > 10 && Number.isFinite(Number(item.duration))) {
      const diff = Math.abs(Number(item.duration) - durationSec);
      if (diff <= 5) score += 45;
      else if (diff <= 10) score += 20;
      else if (diff <= 20) score += 5;
      else score -= Math.min(40, diff * 0.5);
    }

    if (score > bestScore) {
      bestScore = score;
      best = item;
    }
  }
  return best;
}

/**
 * Query LRCLIB (`lrclib.net` `/api/get` & `/api/search`) for synced word/line lyrics.
 */
async function fetchLrclibLyrics({ title = '', artist = '', durationSec = 0, timeoutMs = 8000 } = {}) {
  const cleaned = cleanSongQueryFromTitle(title);
  const effectiveArtist = artist || cleaned.artist;
  const effectiveTrack = cleaned.track || title;
  const query = cleaned.query || `${effectiveArtist} ${effectiveTrack}`.trim();
  if (!query) return null;

  const candidates = [];

  // 1. Exact `/api/get` lookup when both artist and track are known
  if (effectiveArtist && effectiveTrack) {
    const durParam = durationSec > 10 ? `&duration=${Math.round(durationSec)}` : '';
    const getUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(effectiveTrack)}&artist_name=${encodeURIComponent(effectiveArtist)}${durParam}`;
    const exactMatch = await httpGetJson(getUrl, timeoutMs).catch(() => null);
    if (exactMatch && typeof exactMatch === 'object' && !Array.isArray(exactMatch)) {
      candidates.push(exactMatch);
    }
  }

  // 2. Search `/api/search` to also inspect word-synced `lyricsfile` candidates
  if (candidates.length === 0 || !candidates[0].hasWordSync) {
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    let results = await httpGetJson(searchUrl, timeoutMs).catch(() => null);
    if ((!Array.isArray(results) || results.length === 0) && effectiveArtist && effectiveTrack) {
      const trackUrl = `https://lrclib.net/api/search?track_name=${encodeURIComponent(effectiveTrack)}&artist_name=${encodeURIComponent(effectiveArtist)}`;
      results = await httpGetJson(trackUrl, timeoutMs).catch(() => null);
    }
    if (Array.isArray(results)) {
      candidates.push(...results);
    }
  }

  const best = selectBestLrclibCandidate(candidates, {
    artist: effectiveArtist,
    track: effectiveTrack,
    durationSec
  });
  if (!best) return null;

  let lrcText = null;
  let hasWordSync = false;
  if (best.hasWordSync && best.lyricsfile) {
    const enhanced = convertLrclibLyricsfileToEnhancedLrc(best.lyricsfile);
    if (enhanced) {
      lrcText = enhanced;
      hasWordSync = true;
    }
  }
  if (!lrcText && best.syncedLyrics) {
    lrcText = String(best.syncedLyrics).trim();
  }
  if (!lrcText && best.plainLyrics) {
    lrcText = String(best.plainLyrics).trim();
  }
  if (!lrcText) return null;

  const lines = parseEnhancedLrcText(lrcText, 0);
  return {
    source: hasWordSync ? 'lrclib-word' : best.syncedLyrics ? 'lrclib-synced' : 'lrclib-plain',
    hasWordSync,
    lrcText,
    lines,
    matchedTitle: best.trackName || best.name || effectiveTrack,
    matchedArtist: best.artistName || effectiveArtist,
    matchedDuration: Number(best.duration) || 0
  };
}

/**
 * Persist fetched `.lrc` content alongside the song's `.mid` / `.musicxml` file.
 */
function saveLrcNextToSong(songFilePath, lrcText) {
  if (!songFilePath || typeof songFilePath !== 'string' || songFilePath === 'BUILTIN_DEMO' || !lrcText) {
    return null;
  }
  try {
    const parsed = path.parse(songFilePath);
    const targetPath = path.join(parsed.dir, `${parsed.name}.lrc`);
    fs.writeFileSync(targetPath, String(lrcText), 'utf8');
    return targetPath;
  } catch {
    return null;
  }
}

module.exports = {
  cleanSongQueryFromTitle,
  formatLrcTimestamp,
  convertLrclibLyricsfileToEnhancedLrc,
  parseEnhancedLrcText,
  selectBestLrclibCandidate,
  fetchLrclibLyrics,
  saveLrcNextToSong
};
