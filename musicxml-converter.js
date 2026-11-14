const zlib = require('zlib');
const { Midi } = require('@tonejs/midi');

const STEP_TO_SEMITONE = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11
};

const FIFTHS_MAJOR = [
  'Cb Major', 'Gb Major', 'Db Major', 'Ab Major', 'Eb Major', 'Bb Major', 'F Major',
  'C Major', 'G Major', 'D Major', 'A Major', 'E Major', 'B Major', 'F# Major', 'C# Major'
];

const FIFTHS_MINOR = [
  'Ab Minor', 'Eb Minor', 'Bb Minor', 'F Minor', 'C Minor', 'G Minor', 'D Minor',
  'A Minor', 'E Minor', 'B Minor', 'F# Minor', 'C# Minor', 'G# Minor', 'D# Minor', 'A# Minor'
];

const VF_MAJOR_KEYS_BY_FIFTHS = [
  'Cb', 'Gb', 'Db', 'Ab', 'Eb', 'Bb', 'F',
  'C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#'
];

const VF_MINOR_KEYS_BY_FIFTHS = [
  'Abm', 'Ebm', 'Bbm', 'Fm', 'Cm', 'Gm', 'Dm',
  'Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m'
];

function fifthsAndModeToVfKey(fifths, mode = 'major') {
  const idx = Math.max(0, Math.min(14, Math.round(Number(fifths) || 0) + 7));
  const normalizedMode = String(mode || 'major').toLowerCase();
  return normalizedMode.includes('minor')
    ? VF_MINOR_KEYS_BY_FIFTHS[idx]
    : VF_MAJOR_KEYS_BY_FIFTHS[idx];
}

const HARMONY_KIND_SUFFIX = {
  major: '',
  minor: 'm',
  augmented: 'aug',
  diminished: 'dim',
  dominant: '7',
  'major-seventh': 'maj7',
  'minor-seventh': 'm7',
  'diminished-seventh': 'dim7',
  'half-diminished': 'm7b5',
  'major-sixth': '6',
  'minor-sixth': 'm6',
  'dominant-ninth': '9',
  'major-ninth': 'maj9',
  'minor-ninth': 'm9',
  'suspended-second': 'sus2',
  'suspended-fourth': 'sus4',
  power: '5',
  none: ''
};

const BEAT_UNIT_MULTIPLIER = {
  whole: 4,
  half: 2,
  quarter: 1,
  eighth: 0.5,
  '16th': 0.25,
  '32nd': 0.125
};

function isMusicXmlFileName(fileName) {
  return /\.(musicxml|xml|mxl)$/i.test(String(fileName || ''));
}

function isCompressedMxlFileName(fileName) {
  return /\.mxl$/i.test(String(fileName || ''));
}

function toNodeBuffer(input) {
  if (Buffer.isBuffer(input)) return input;
  if (input instanceof ArrayBuffer) return Buffer.from(input);
  if (ArrayBuffer.isView(input)) return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  throw new Error('Invalid buffer input for MusicXML converter.');
}

function decodeXmlBuffer(buf) {
  if (!buf || buf.length === 0) return '';
  if (buf.length >= 2 && buf[0] === 0xFF && buf[1] === 0xFE) {
    return buf.slice(2).toString('utf16le');
  }
  if (buf.length >= 2 && buf[0] === 0xFE && buf[1] === 0xFF) {
    const swapped = Buffer.alloc(buf.length - 2);
    for (let i = 2; i + 1 < buf.length; i += 2) {
      swapped[i - 2] = buf[i + 1];
      swapped[i - 1] = buf[i];
    }
    return swapped.toString('utf16le');
  }
  if (buf.length >= 3 && buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
    return buf.slice(3).toString('utf8');
  }
  return buf.toString('utf8');
}

/**
 * Pure-Node ZIP reader for compressed .mxl files using built-in zlib.inflateRawSync.
 */
function extractZipEntries(zipBuf) {
  const entries = new Map();

  // Locate End of Central Directory (PK\x05\x06) verifying commentLen reaches end of buffer
  const minOffset = Math.max(0, zipBuf.length - 65557);
  let eocdOffset = -1;
  for (let i = zipBuf.length - 22; i >= minOffset; i--) {
    if (
      zipBuf[i] === 0x50 &&
      zipBuf[i + 1] === 0x4B &&
      zipBuf[i + 2] === 0x05 &&
      zipBuf[i + 3] === 0x06
    ) {
      const commentLen = zipBuf.readUInt16LE(i + 20);
      if (i + 22 + commentLen === zipBuf.length) {
        eocdOffset = i;
        break;
      }
    }
  }

  const readEntryAtLocalHeader = (localOffset, expectedMethod, expectedCompSize, fallbackName) => {
    if (localOffset < 0 || localOffset + 30 > zipBuf.length) {
      throw new Error('Corrupt .mxl archive: local file header out of bounds.');
    }
    if (zipBuf.readUInt32LE(localOffset) !== 0x04034B50) {
      throw new Error('Corrupt .mxl archive: invalid local file header signature.');
    }
    const method = expectedMethod !== undefined ? expectedMethod : zipBuf.readUInt16LE(localOffset + 8);
    const compSize = expectedCompSize !== undefined ? expectedCompSize : zipBuf.readUInt32LE(localOffset + 18);
    const nameLen = zipBuf.readUInt16LE(localOffset + 26);
    const extraLen = zipBuf.readUInt16LE(localOffset + 28);
    const nameStart = localOffset + 30;
    const dataStart = nameStart + nameLen + extraLen;
    const entryName = fallbackName || zipBuf.slice(nameStart, nameStart + nameLen).toString('utf8');

    if (dataStart + compSize > zipBuf.length) {
      throw new Error(`Corrupt .mxl archive: entry "${entryName}" is truncated.`);
    }

    const compressed = zipBuf.slice(dataStart, dataStart + compSize);
    let data;
    if (method === 0) {
      data = compressed;
    } else if (method === 8) {
      data = zlib.inflateRawSync(compressed, { maxOutputLength: 64 * 1024 * 1024 });
    } else {
      throw new Error(`Unsupported ZIP compression method (${method}) in .mxl file.`);
    }
    return { entryName, data };
  };

  if (eocdOffset !== -1) {
    const totalEntries = zipBuf.readUInt16LE(eocdOffset + 10);
    const cdOffset = zipBuf.readUInt32LE(eocdOffset + 16);
    let ptr = cdOffset;
    for (let i = 0; i < totalEntries && ptr + 46 <= zipBuf.length; i++) {
      if (zipBuf.readUInt32LE(ptr) !== 0x02014B50) break;
      const flags = zipBuf.readUInt16LE(ptr + 8);
      const method = zipBuf.readUInt16LE(ptr + 10);
      const compSize = zipBuf.readUInt32LE(ptr + 20);
      const nameLen = zipBuf.readUInt16LE(ptr + 28);
      const extraLen = zipBuf.readUInt16LE(ptr + 30);
      const commentLen = zipBuf.readUInt16LE(ptr + 32);
      const localOffset = zipBuf.readUInt32LE(ptr + 42);
      const entryName = zipBuf.slice(ptr + 46, ptr + 46 + nameLen).toString('utf8');

      if ((flags & 0x01) !== 0) {
        throw new Error('Encrypted .mxl archives are not supported.');
      }
      if (!entryName.endsWith('/')) {
        const { data } = readEntryAtLocalHeader(localOffset, method, compSize, entryName);
        entries.set(entryName.replace(/\\/g, '/'), data);
      }
      ptr += 46 + nameLen + extraLen + commentLen;
    }
  } else {
    // Fallback: scan sequential local headers
    let ptr = 0;
    while (ptr + 30 <= zipBuf.length && zipBuf.readUInt32LE(ptr) === 0x04034B50) {
      const method = zipBuf.readUInt16LE(ptr + 8);
      const compSize = zipBuf.readUInt32LE(ptr + 18);
      const nameLen = zipBuf.readUInt16LE(ptr + 26);
      const extraLen = zipBuf.readUInt16LE(ptr + 28);
      const entryName = zipBuf.slice(ptr + 30, ptr + 30 + nameLen).toString('utf8');
      const dataStart = ptr + 30 + nameLen + extraLen;
      if (!entryName.endsWith('/')) {
        const { data } = readEntryAtLocalHeader(ptr, method, compSize, entryName);
        entries.set(entryName.replace(/\\/g, '/'), data);
      }
      ptr = dataStart + compSize;
    }
  }

  return entries;
}

function decodeXmlEntities(str) {
  if (!str || !str.includes('&')) return str;
  return str.replace(/&(#x?[0-9a-fA-F]+|amp|lt|gt|quot|apos);/g, (full, entity) => {
    switch (entity) {
      case 'amp': return '&';
      case 'lt': return '<';
      case 'gt': return '>';
      case 'quot': return '"';
      case 'apos': return '\'';
      default: {
        if (entity.startsWith('#x') || entity.startsWith('#X')) {
          const code = parseInt(entity.slice(2), 16);
          return Number.isFinite(code) ? String.fromCodePoint(code) : full;
        }
        if (entity.startsWith('#')) {
          const code = parseInt(entity.slice(1), 10);
          return Number.isFinite(code) ? String.fromCodePoint(code) : full;
        }
        return full;
      }
    }
  });
}

function parseAttributes(attrStr) {
  const attrs = {};
  if (!attrStr) return attrs;
  const re = /([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(attrStr)) !== null) {
    attrs[m[1]] = decodeXmlEntities(m[2] !== undefined ? m[2] : m[3]);
  }
  return attrs;
}

/**
 * Lightweight, zero-dependency pure-JS XML parser so Node tests and Electron renderer
 * produce identical ASTs without requiring jsdom.
 */
function parseXmlTree(xmlText) {
  const root = { tag: '__root__', attrs: {}, children: [], text: '' };
  const stack = [root];
  const len = xmlText.length;
  let pos = 0;

  while (pos < len) {
    const lt = xmlText.indexOf('<', pos);
    if (lt === -1) {
      const trailing = xmlText.slice(pos).trim();
      if (trailing && stack.length > 0) {
        stack[stack.length - 1].text += decodeXmlEntities(trailing);
      }
      break;
    }

    if (lt > pos) {
      const txt = xmlText.slice(pos, lt);
      if (txt.trim() && stack.length > 0) {
        stack[stack.length - 1].text += decodeXmlEntities(txt);
      }
    }

    // Comments
    if (xmlText.startsWith('<!--', lt)) {
      const endComment = xmlText.indexOf('-->', lt + 4);
      pos = endComment === -1 ? len : endComment + 3;
      continue;
    }

    // CDATA
    if (xmlText.startsWith('<![CDATA[', lt)) {
      const endCdata = xmlText.indexOf(']]>', lt + 9);
      const cdataText = endCdata === -1 ? xmlText.slice(lt + 9) : xmlText.slice(lt + 9, endCdata);
      if (stack.length > 0) {
        stack[stack.length - 1].text += cdataText;
      }
      pos = endCdata === -1 ? len : endCdata + 3;
      continue;
    }

    // Processing instruction <?...?>
    if (xmlText.startsWith('<?', lt)) {
      const endPi = xmlText.indexOf('?>', lt + 2);
      pos = endPi === -1 ? len : endPi + 2;
      continue;
    }

    // DOCTYPE <!DOCTYPE ...> (may contain nested [...] internal subset)
    if (xmlText.startsWith('<!', lt)) {
      let i = lt + 2;
      let inBracket = false;
      while (i < len) {
        const ch = xmlText[i];
        if (ch === '[') inBracket = true;
        else if (ch === ']') inBracket = false;
        else if (ch === '>' && !inBracket) {
          i++;
          break;
        }
        i++;
      }
      pos = i;
      continue;
    }

    // Closing tag </tag>
    if (xmlText[lt + 1] === '/') {
      const gt = xmlText.indexOf('>', lt + 2);
      if (gt === -1) break;
      const closeTag = xmlText.slice(lt + 2, gt).trim();
      for (let s = stack.length - 1; s >= 1; s--) {
        if (stack[s].tag === closeTag) {
          stack.length = s;
          break;
        }
      }
      pos = gt + 1;
      continue;
    }

    // Opening or self-closing tag
    let gt = lt + 1;
    let quoteChar = null;
    while (gt < len) {
      const ch = xmlText[gt];
      if (quoteChar) {
        if (ch === quoteChar) quoteChar = null;
      } else if (ch === '"' || ch === '\'') {
        quoteChar = ch;
      } else if (ch === '>') {
        break;
      }
      gt++;
    }
    if (gt >= len) break;

    let inner = xmlText.slice(lt + 1, gt).trim();
    const selfClosing = inner.endsWith('/');
    if (selfClosing) {
      inner = inner.slice(0, -1).trim();
    }

    const spaceIdx = inner.search(/\s/);
    const tag = spaceIdx === -1 ? inner : inner.slice(0, spaceIdx);
    const attrStr = spaceIdx === -1 ? '' : inner.slice(spaceIdx + 1);
    const node = {
      tag,
      attrs: parseAttributes(attrStr),
      children: [],
      text: ''
    };

    stack[stack.length - 1].children.push(node);
    if (!selfClosing) {
      stack.push(node);
    }
    pos = gt + 1;
  }

  return root.children[0] || null;
}

function getChild(node, tag) {
  if (!node || !node.children) return null;
  for (const c of node.children) {
    if (c.tag === tag) return c;
  }
  return null;
}

function getChildren(node, tag) {
  if (!node || !node.children) return [];
  return node.children.filter((c) => c.tag === tag);
}

function getText(node, tag) {
  const c = tag ? getChild(node, tag) : node;
  if (!c) return '';
  return (c.text || '').trim();
}

function extractMusicXmlTextFromBuffer(arrayBufferOrBuffer, fileName = '') {
  const buf = toNodeBuffer(arrayBufferOrBuffer);
  if (buf.length < 4) {
    throw new Error('File is empty or too small to be a MusicXML score.');
  }

  const isZipMagic = buf[0] === 0x50 && buf[1] === 0x4B && (buf[2] === 0x03 || buf[2] === 0x05);
  if (isCompressedMxlFileName(fileName) || isZipMagic) {
    if (!isZipMagic) {
      throw new Error(`"${fileName || 'File'}" is not a valid compressed .mxl (ZIP) archive.`);
    }
    const entries = extractZipEntries(buf);
    if (entries.size === 0) {
      throw new Error('Compressed .mxl archive contains no readable files.');
    }

    let rootPath = null;
    for (const [entryPath, entryData] of entries.entries()) {
      if (entryPath.toLowerCase() === 'meta-inf/container.xml') {
        const containerXml = decodeXmlBuffer(entryData);
        const containerDoc = parseXmlTree(containerXml);
        const rootfiles = containerDoc ? getChild(containerDoc, 'rootfiles') : null;
        const rootfile = rootfiles ? getChild(rootfiles, 'rootfile') : null;
        if (rootfile && rootfile.attrs['full-path']) {
          rootPath = rootfile.attrs['full-path'].replace(/\\/g, '/').replace(/^\/+|^\.\//, '');
        }
        break;
      }
    }

    if (rootPath && entries.has(rootPath)) {
      return decodeXmlBuffer(entries.get(rootPath));
    }

    // Fallback: find any .musicxml or .xml outside META-INF
    for (const [entryPath, entryData] of entries.entries()) {
      if (!entryPath.toLowerCase().startsWith('meta-inf/') && /\.(musicxml|xml)$/i.test(entryPath)) {
        return decodeXmlBuffer(entryData);
      }
    }

    throw new Error('Could not locate a MusicXML score inside the .mxl archive.');
  }

  return decodeXmlBuffer(buf);
}

function formatKeySignatureLabel(fifths, mode) {
  const idx = Math.max(0, Math.min(14, fifths + 7));
  if (String(mode || '').toLowerCase() === 'minor') {
    return FIFTHS_MINOR[idx];
  }
  return FIFTHS_MAJOR[idx];
}

function formatHarmonySymbol(harmonyNode) {
  const root = getChild(harmonyNode, 'root');
  if (!root) return null;
  const rootStep = getText(root, 'root-step');
  if (!rootStep) return null;
  const rootAlter = parseInt(getText(root, 'root-alter') || '0', 10);
  const accidental = rootAlter === 1 ? '#' : rootAlter === -1 ? 'b' : rootAlter === 2 ? '##' : rootAlter === -2 ? 'bb' : '';
  const kindRaw = getText(harmonyNode, 'kind') || 'major';
  const kindSuffix = HARMONY_KIND_SUFFIX[kindRaw] !== undefined ? HARMONY_KIND_SUFFIX[kindRaw] : '';
  return `${rootStep}${accidental}${kindSuffix}`;
}

function convertTimewiseToPartwise(doc) {
  const partList = getChild(doc, 'part-list');
  const work = getChild(doc, 'work');
  const movementTitle = getChild(doc, 'movement-title');

  const partMap = new Map();
  const partOrder = [];

  for (const measureNode of getChildren(doc, 'measure')) {
    const measureAttrs = { ...measureNode.attrs };
    for (const partSlice of getChildren(measureNode, 'part')) {
      const pid = partSlice.attrs.id || `P${partOrder.length + 1}`;
      if (!partMap.has(pid)) {
        partMap.set(pid, []);
        partOrder.push(pid);
      }
      partMap.get(pid).push({
        tag: 'measure',
        attrs: measureAttrs,
        children: partSlice.children || [],
        text: ''
      });
    }
  }

  const children = [];
  if (work) children.push(work);
  if (movementTitle) children.push(movementTitle);
  if (partList) children.push(partList);
  for (const pid of partOrder) {
    children.push({
      tag: 'part',
      attrs: { id: pid },
      children: partMap.get(pid),
      text: ''
    });
  }

  return {
    tag: 'score-partwise',
    attrs: doc.attrs || {},
    children,
    text: ''
  };
}

/**
 * Unroll <repeat direction="forward|backward"> and <ending number="1,2" type="start|stop|discontinue">
 * into a flat sequence of measure indices.
 */
function unrollMeasuresWithRepeats(measures, warnings) {
  const total = measures.length;
  if (total === 0) return [];

  const MAX_UNROLLED = 2000;
  const sequence = [];
  let forwardIdx = 0;
  const repeatCounts = new Map(); // backwardMeasureIdx -> times already jumped
  let currentPass = 1;
  let skippingEnding = false;
  let idx = 0;

  while (idx < total && sequence.length < MAX_UNROLLED) {
    const m = measures[idx];
    const barlines = getChildren(m, 'barline');

    let hasForwardRepeat = false;
    let backwardRepeat = null;
    let endingStartNums = null;
    let endingEnds = false;

    for (const bl of barlines) {
      const rep = getChild(bl, 'repeat');
      if (rep) {
        if (rep.attrs.direction === 'forward') {
          hasForwardRepeat = true;
        } else if (rep.attrs.direction === 'backward') {
          const times = Math.max(2, parseInt(rep.attrs.times || '2', 10) || 2);
          backwardRepeat = { times };
        }
      }

      const ending = getChild(bl, 'ending');
      if (ending) {
        const type = ending.attrs.type;
        if (type === 'start') {
          const numStr = String(ending.attrs.number || '1');
          endingStartNums = numStr
            .split(',')
            .map((s) => parseInt(s.trim(), 10))
            .filter((n) => Number.isFinite(n));
        } else if (type === 'stop' || type === 'discontinue') {
          endingEnds = true;
        }
      }
    }

    if (hasForwardRepeat) {
      if (forwardIdx !== idx) {
        forwardIdx = idx;
        currentPass = 1;
      }
    }

    if (endingStartNums && endingStartNums.length > 0) {
      if (!endingStartNums.includes(currentPass)) {
        skippingEnding = true;
      } else {
        skippingEnding = false;
      }
    }

    if (!skippingEnding) {
      sequence.push(idx);
    }

    const wasSkippingEnding = skippingEnding;
    if (endingEnds) {
      skippingEnding = false;
    }

    if (backwardRepeat && !wasSkippingEnding) {
      const used = repeatCounts.get(idx) || 0;
      if (used + 1 < backwardRepeat.times) {
        repeatCounts.set(idx, used + 1);
        currentPass += 1;
        idx = forwardIdx;
        continue;
      } else {
        currentPass = 1;
      }
    }

    idx += 1;
  }

  if (sequence.length >= MAX_UNROLLED) {
    warnings.push(`Repeat unrolling capped at ${MAX_UNROLLED} measures to prevent an infinite loop.`);
  }

  return sequence;
}

function isPianoPartMeta(partMeta) {
  const combined = `${partMeta.name || ''} ${partMeta.instrumentName || ''}`.toLowerCase();
  if (/(piano|keyboard|grand|keys|harpsichord|clav|organ|celesta|synth)/i.test(combined)) {
    return true;
  }
  if (partMeta.midiProgram >= 0 && partMeta.midiProgram <= 7) {
    return true;
  }
  return false;
}

function ticksToSeconds(ticks, tempoChanges, ppq) {
  let seconds = 0;
  let lastTick = 0;
  let currentBpm = tempoChanges.length > 0 ? tempoChanges[0].bpm : 120;

  for (const tc of tempoChanges) {
    if (tc.ticks >= ticks) break;
    if (tc.ticks > lastTick) {
      const deltaBeats = (tc.ticks - lastTick) / ppq;
      seconds += deltaBeats * (60 / currentBpm);
      lastTick = tc.ticks;
    }
    currentBpm = tc.bpm;
  }

  if (ticks > lastTick) {
    const deltaBeats = (ticks - lastTick) / ppq;
    seconds += deltaBeats * (60 / currentBpm);
  }
  return seconds;
}

function convertMusicXmlToMidiBuffer(arrayBufferOrBuffer, fileName = 'Untitled Spell.musicxml') {
  const xmlText = extractMusicXmlTextFromBuffer(arrayBufferOrBuffer, fileName);
  let doc = parseXmlTree(xmlText);

  if (!doc) {
    throw new Error('Could not parse XML structure from file.');
  }

  if (doc.tag === 'score-timewise') {
    doc = convertTimewiseToPartwise(doc);
  } else if (doc.tag !== 'score-partwise') {
    const err = new Error(`Unsupported XML root <${doc.tag}>. Expected a MusicXML <score-partwise> or <score-timewise> file.`);
    err.code = 'NOT_MUSICXML';
    throw err;
  }

  const warnings = [];
  const ppq = 480;

  // Title extraction
  const workNode = getChild(doc, 'work');
  const workTitle = workNode ? getText(workNode, 'work-title') : '';
  const movementTitle = getText(doc, 'movement-title');
  const fallbackTitle = String(fileName || 'Untitled Spell').replace(/\.(musicxml|xml|mxl)$/i, '');
  const title = workTitle || movementTitle || fallbackTitle;

  // Part list metadata
  const partMetaMap = new Map();
  const partListNode = getChild(doc, 'part-list');
  if (partListNode) {
    for (const sp of getChildren(partListNode, 'score-part')) {
      const pid = sp.attrs.id;
      const name = getText(sp, 'part-name') || pid || 'Part';
      const scoreInst = getChild(sp, 'score-instrument');
      const instrumentName = scoreInst ? getText(scoreInst, 'instrument-name') : name;
      const midiInst = getChild(sp, 'midi-instrument');
      const midiProgramRaw = midiInst ? parseInt(getText(midiInst, 'midi-program') || '1', 10) : 1;
      const midiChannelRaw = midiInst ? parseInt(getText(midiInst, 'midi-channel') || '1', 10) : 1;
      partMetaMap.set(pid, {
        id: pid,
        name,
        instrumentName,
        midiProgram: Number.isFinite(midiProgramRaw) ? Math.max(0, Math.min(127, midiProgramRaw - 1)) : 0,
        isPercussion: midiChannelRaw === 10
      });
    }
  }

  const parts = getChildren(doc, 'part');
  if (parts.length === 0) {
    throw new Error('MusicXML score contains no <part> elements.');
  }

  const globalTempoChanges = []; // { ticks, bpm }
  const globalTimeSignatures = []; // { ticks, timeSignature: [num, den] }
  const globalKeySignatures = []; // { ticks, fifths, mode, vfKeySpec }
  const globalMeasures = []; // { index, number, startTicks, endTicks, numerator, denominator, fifths, mode, vfKeySpec }
  let primaryKeySignature = null;
  let primaryKeyFifths = null;
  let primaryKeyMode = 'major';
  const chordMarkers = []; // { ticks, symbol }
  let lyricCount = 0;
  let skippedGraceNotes = 0;
  let skippedOrnaments = 0;

  const parsedParts = [];

  // Compute unified repeat/ending unrolling once across the score so all parts stay synchronized
  const partWithRepeats = parts.find((p) =>
    getChildren(p, 'measure').some((m) =>
      getChildren(m, 'barline').some((bl) => Boolean(getChild(bl, 'repeat') || getChild(bl, 'ending')))
    )
  ) || parts[0];
  const sharedMeasureOrder = unrollMeasuresWithRepeats(getChildren(partWithRepeats, 'measure'), warnings);

  parts.forEach((partNode, pIdx) => {
    const pid = partNode.attrs.id || `P${pIdx + 1}`;
    const meta = partMetaMap.get(pid) || {
      id: pid,
      name: `Part ${pIdx + 1}`,
      instrumentName: 'Piano',
      midiProgram: 0,
      isPercussion: false
    };

    const rawMeasures = getChildren(partNode, 'measure');
    const measureOrder = sharedMeasureOrder;

    let divisions = 1;
    let declaredStaves = 1;
    let measureStartTicks = 0;
    let currentNum = 4;
    let currentDen = 4;
    let currentFifths = 0;
    let currentMode = 'major';

    const staffNotes = new Map(); // staffNum (1, 2, ...) -> note[]
    const activeTies = new Map(); // `${staffNum}:${voice}:${pitch}` -> noteObj
    const partMeasures = [];

    const ensureStaffList = (staffNum) => {
      if (!staffNotes.has(staffNum)) staffNotes.set(staffNum, []);
      return staffNotes.get(staffNum);
    };

    for (const mIdx of measureOrder) {
      const m = rawMeasures[mIdx];
      if (!m) continue;
      let cursorTicks = measureStartTicks;
      let lastNoteStartTicks = measureStartTicks;
      let maxMeasureEndTicks = measureStartTicks;

      for (const child of m.children) {
        if (child.tag === 'attributes') {
          const divText = getText(child, 'divisions');
          if (divText) {
            const parsedDiv = parseFloat(divText);
            if (Number.isFinite(parsedDiv) && parsedDiv > 0) divisions = parsedDiv;
          }

          const stavesText = getText(child, 'staves');
          if (stavesText) {
            const parsedStaves = parseInt(stavesText, 10);
            if (Number.isFinite(parsedStaves) && parsedStaves >= 1) {
              declaredStaves = Math.max(declaredStaves, parsedStaves);
            }
          }

          const keyNode = getChild(child, 'key');
          if (keyNode) {
            const fifths = parseInt(getText(keyNode, 'fifths') || '0', 10);
            const mode = getText(keyNode, 'mode') || 'major';
            if (Number.isFinite(fifths)) {
              if (!primaryKeySignature) {
                primaryKeySignature = formatKeySignatureLabel(fifths, mode);
                primaryKeyFifths = fifths;
                primaryKeyMode = mode;
              }
              const vfKeySpec = fifthsAndModeToVfKey(fifths, mode);
              currentFifths = fifths;
              currentMode = mode;
              globalKeySignatures.push({
                ticks: measureStartTicks,
                fifths,
                mode,
                vfKeySpec
              });
            }
          }

          const timeNode = getChild(child, 'time');
          if (timeNode) {
            const beats = parseInt(getText(timeNode, 'beats') || '4', 10);
            const beatType = parseInt(getText(timeNode, 'beat-type') || '4', 10);
            if (Number.isFinite(beats) && beats > 0 && Number.isFinite(beatType) && beatType > 0) {
              currentNum = beats;
              currentDen = beatType;
              globalTimeSignatures.push({
                ticks: measureStartTicks,
                timeSignature: [beats, beatType]
              });
            }
          }
        } else if (child.tag === 'sound') {
          const tempoAttr = parseFloat(child.attrs.tempo);
          if (Number.isFinite(tempoAttr) && tempoAttr > 0) {
            globalTempoChanges.push({ ticks: cursorTicks, bpm: Math.round(tempoAttr) });
          }
        } else if (child.tag === 'direction') {
          const soundNode = getChild(child, 'sound');
          if (soundNode && soundNode.attrs.tempo) {
            const tVal = parseFloat(soundNode.attrs.tempo);
            if (Number.isFinite(tVal) && tVal > 0) {
              globalTempoChanges.push({ ticks: cursorTicks, bpm: Math.round(tVal) });
            }
          } else {
            const dirType = getChild(child, 'direction-type');
            const metro = dirType ? getChild(dirType, 'metronome') : null;
            if (metro) {
              const beatUnit = getText(metro, 'beat-unit') || 'quarter';
              const hasDot = Boolean(getChild(metro, 'beat-unit-dot'));
              const perMin = parseFloat(getText(metro, 'per-minute') || '');
              if (Number.isFinite(perMin) && perMin > 0) {
                const mult = (BEAT_UNIT_MULTIPLIER[beatUnit] || 1) * (hasDot ? 1.5 : 1);
                globalTempoChanges.push({ ticks: cursorTicks, bpm: Math.round(perMin * mult) });
              }
            }
          }
        } else if (child.tag === 'harmony') {
          const symbol = formatHarmonySymbol(child);
          if (symbol) {
            chordMarkers.push({ ticks: cursorTicks, symbol });
          }
        } else if (child.tag === 'backup') {
          const durDivs = parseFloat(getText(child, 'duration') || '0') || 0;
          const backTicks = Math.round((durDivs / divisions) * ppq);
          cursorTicks = Math.max(measureStartTicks, cursorTicks - backTicks);
        } else if (child.tag === 'forward') {
          const durDivs = parseFloat(getText(child, 'duration') || '0') || 0;
          const fwdTicks = Math.round((durDivs / divisions) * ppq);
          cursorTicks += fwdTicks;
          if (cursorTicks > maxMeasureEndTicks) maxMeasureEndTicks = cursorTicks;
        } else if (child.tag === 'note') {
          const isGrace = Boolean(getChild(child, 'grace'));
          if (isGrace) {
            skippedGraceNotes += 1;
            continue;
          }

          if (getChildren(child, 'lyric').length > 0) {
            lyricCount += getChildren(child, 'lyric').length;
          }

          const notations = getChild(child, 'notations');
          if (notations && getChild(notations, 'ornaments')) {
            skippedOrnaments += 1;
          }

          const isChord = Boolean(getChild(child, 'chord'));
          const isRest = Boolean(getChild(child, 'rest'));
          const isCue = Boolean(getChild(child, 'cue'));
          const durDivs = parseFloat(getText(child, 'duration') || '0') || 0;
          const noteTicks = Math.max(1, Math.round((durDivs / divisions) * ppq));
          const noteStartTicks = isChord ? lastNoteStartTicks : cursorTicks;

          if (!isChord) {
            lastNoteStartTicks = noteStartTicks;
            cursorTicks = noteStartTicks + noteTicks;
          }
          if (noteStartTicks + noteTicks > maxMeasureEndTicks) {
            maxMeasureEndTicks = noteStartTicks + noteTicks;
          }

          if (isRest || isCue) continue;

          const pitchNode = getChild(child, 'pitch');
          if (!pitchNode) continue;

          const step = getText(pitchNode, 'step').toUpperCase();
          const octave = parseInt(getText(pitchNode, 'octave') || '4', 10);
          const alter = parseFloat(getText(pitchNode, 'alter') || '0') || 0;
          const semitone = STEP_TO_SEMITONE[step];
          if (semitone === undefined || !Number.isFinite(octave)) continue;

          const midiPitch = Math.max(0, Math.min(127, Math.round((octave + 1) * 12 + semitone + alter)));
          const staffNum = Math.max(1, parseInt(getText(child, 'staff') || '1', 10) || 1);
          const voiceId = (getText(child, 'voice') || '1').trim() || '1';

          // Check tie start/stop in <tie> and <notations><tied>
          let tieStart = false;
          let tieStop = false;
          for (const tNode of getChildren(child, 'tie')) {
            if (tNode.attrs.type === 'start') tieStart = true;
            if (tNode.attrs.type === 'stop') tieStop = true;
          }
          if (notations) {
            for (const tNode of getChildren(notations, 'tied')) {
              if (tNode.attrs.type === 'start') tieStart = true;
              if (tNode.attrs.type === 'stop') tieStop = true;
            }
          }

          const tieKey = `${staffNum}:${voiceId}:${midiPitch}`;
          const existingTie = activeTies.get(tieKey);

          if (tieStop && existingTie) {
            existingTie.durationTicks = Math.max(1, (noteStartTicks + noteTicks) - existingTie.ticks);
            if (!tieStart) {
              activeTies.delete(tieKey);
            }
          } else {
            const dynVel = parseFloat(child.attrs.dynamics);
            const velocity = Number.isFinite(dynVel)
              ? Math.max(0.15, Math.min(1, (dynVel / 100) * 0.8))
              : 0.8;

            const noteObj = {
              midi: midiPitch,
              ticks: noteStartTicks,
              durationTicks: noteTicks,
              velocity,
              staffNum
            };
            ensureStaffList(staffNum).push(noteObj);

            if (tieStart) {
              activeTies.set(tieKey, noteObj);
            }
          }
        }
      }

      const fullBarTicks = Math.max(1, Math.round(ppq * currentNum * (4 / Math.max(1, currentDen))));
      const nextMeasureStart = maxMeasureEndTicks > measureStartTicks
        ? maxMeasureEndTicks
        : (measureStartTicks + fullBarTicks);

      partMeasures.push({
        index: partMeasures.length,
        number: m.attrs.number || String(partMeasures.length + 1),
        startTicks: measureStartTicks,
        endTicks: nextMeasureStart,
        numerator: currentNum,
        denominator: currentDen,
        fifths: currentFifths,
        mode: currentMode,
        vfKeySpec: fifthsAndModeToVfKey(currentFifths, currentMode),
        isPickup: m.attrs.implicit === 'yes' || (nextMeasureStart - measureStartTicks) < (fullBarTicks - Math.max(4, ppq * 0.02))
      });

      measureStartTicks = nextMeasureStart;
    }

    parsedParts.push({
      meta,
      declaredStaves,
      staffNotes,
      measures: partMeasures
    });
  });

  // Sort & deduplicate tempo changes
  globalTempoChanges.sort((a, b) => a.ticks - b.ticks);
  const tempoChanges = [];
  for (const tc of globalTempoChanges) {
    if (tempoChanges.length > 0 && tempoChanges[tempoChanges.length - 1].ticks === tc.ticks) {
      tempoChanges[tempoChanges.length - 1].bpm = tc.bpm;
    } else {
      tempoChanges.push(tc);
    }
  }
  if (tempoChanges.length === 0) {
    tempoChanges.push({ ticks: 0, bpm: 120 });
  }

  // Deduplicate time signatures
  globalTimeSignatures.sort((a, b) => a.ticks - b.ticks);
  const timeSignatures = [];
  for (const ts of globalTimeSignatures) {
    if (timeSignatures.length > 0 && timeSignatures[timeSignatures.length - 1].ticks === ts.ticks) {
      timeSignatures[timeSignatures.length - 1] = ts;
    } else {
      timeSignatures.push(ts);
    }
  }
  if (timeSignatures.length === 0) {
    timeSignatures.push({ ticks: 0, timeSignature: [4, 4] });
  }

  // Deduplicate key signatures
  globalKeySignatures.sort((a, b) => a.ticks - b.ticks);
  const keySignatures = [];
  for (const ks of globalKeySignatures) {
    if (keySignatures.length > 0 && keySignatures[keySignatures.length - 1].ticks === ks.ticks) {
      keySignatures[keySignatures.length - 1] = ks;
    } else {
      keySignatures.push(ks);
    }
  }

  // Build @tonejs/midi object
  const midi = new Midi();
  midi.header.name = title;
  midi.header.tempos = tempoChanges.map((tc) => ({
    ticks: tc.ticks,
    bpm: tc.bpm
  }));
  midi.header.timeSignatures = timeSignatures.map((ts) => ({
    ticks: ts.ticks,
    timeSignature: ts.timeSignature
  }));
  midi.header.update();

  // Pick primary Piano / Grand Staff part if multi-part
  let pianoPartIdx = parsedParts.findIndex((p) => p.declaredStaves >= 2 || p.staffNotes.size >= 2);
  if (pianoPartIdx === -1) {
    pianoPartIdx = parsedParts.findIndex((p) => isPianoPartMeta(p.meta) && !p.meta.isPercussion);
  }
  if (pianoPartIdx === -1) {
    pianoPartIdx = parsedParts.findIndex((p) => !p.meta.isPercussion);
  }
  if (pianoPartIdx === -1) {
    pianoPartIdx = 0;
  }

  let isGrandStaff = false;
  const addNotesToMidiTrack = (midiTrack, noteList) => {
    for (const n of noteList) {
      const startSec = ticksToSeconds(n.ticks, tempoChanges, ppq);
      const endSec = ticksToSeconds(n.ticks + n.durationTicks, tempoChanges, ppq);
      midiTrack.addNote({
        midi: n.midi,
        time: startSec,
        duration: Math.max(0.05, endSec - startSec),
        velocity: n.velocity
      });
    }
  };

  const primaryPart = parsedParts[pianoPartIdx];
  const staff1Notes = primaryPart.staffNotes.get(1) || [];
  const staff2Notes = primaryPart.staffNotes.get(2) || [];

  if (staff1Notes.length > 0 && staff2Notes.length > 0) {
    isGrandStaff = true;
    const rhTrack = midi.addTrack();
    rhTrack.name = 'Piano - Right Hand (Staff 1)';
    rhTrack.channel = 0;
    rhTrack.instrument.number = 0;
    addNotesToMidiTrack(rhTrack, staff1Notes);

    const lhTrack = midi.addTrack();
    lhTrack.name = 'Piano - Left Hand (Staff 2)';
    lhTrack.channel = 1;
    lhTrack.instrument.number = 0;
    addNotesToMidiTrack(lhTrack, staff2Notes);
  } else {
    const allPrimaryNotes = [];
    for (const list of primaryPart.staffNotes.values()) {
      allPrimaryNotes.push(...list);
    }
    const soloTrack = midi.addTrack();
    soloTrack.name = primaryPart.meta.name || 'Piano';
    soloTrack.channel = 0;
    soloTrack.instrument.number = primaryPart.meta.midiProgram;
    addNotesToMidiTrack(soloTrack, allPrimaryNotes);
  }

  // Route remaining parts as Backing Band tracks (switchable in Audio & Keys)
  const BACKING_MIDI_CHANNELS = [2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14, 15];
  let backingChannelCursor = 0;
  parsedParts.forEach((part, idx) => {
    if (idx === pianoPartIdx) return;
    const allNotes = [];
    for (const list of part.staffNotes.values()) {
      allNotes.push(...list);
    }
    if (allNotes.length === 0) return;

    const tr = midi.addTrack();
    tr.name = part.meta.name || `Part ${idx + 1}`;
    if (part.meta.isPercussion) {
      tr.channel = 9;
    } else {
      tr.channel = BACKING_MIDI_CHANNELS[backingChannelCursor % BACKING_MIDI_CHANNELS.length];
      backingChannelCursor++;
    }
    tr.instrument.number = part.meta.midiProgram;
    addNotesToMidiTrack(tr, allNotes);
  });

  if (skippedGraceNotes > 0) {
    warnings.push(`Skipped ${skippedGraceNotes} grace note${skippedGraceNotes === 1 ? '' : 's'} (unsupported in highway timing).`);
  }
  if (skippedOrnaments > 0) {
    warnings.push(`Played base notes for ${skippedOrnaments} ornament${skippedOrnaments === 1 ? '' : 's'} (trills/mordents simplified).`);
  }

  const midiBytes = midi.toArray();
  const midiArrayBuffer = midiBytes.buffer.slice(midiBytes.byteOffset, midiBytes.byteOffset + midiBytes.byteLength);

  const seenChords = new Set();
  const dedupedChordMarkers = [];
  for (const cm of chordMarkers.slice().sort((a, b) => a.ticks - b.ticks)) {
    const key = `${cm.ticks}::${cm.symbol}`;
    if (seenChords.has(key)) continue;
    seenChords.add(key);
    dedupedChordMarkers.push(cm);
  }
  const chordMarkersWithTime = dedupedChordMarkers.map((cm) => ({
    ticks: cm.ticks,
    time: ticksToSeconds(cm.ticks, tempoChanges, ppq),
    symbol: cm.symbol
  }));

  const selectedMeasures = (primaryPart?.measures && primaryPart.measures.length > 0)
    ? primaryPart.measures
    : (parsedParts[0]?.measures || globalMeasures);
  const measuresWithTime = selectedMeasures.map((gm) => ({
    ...gm,
    startTime: ticksToSeconds(gm.startTicks, tempoChanges, ppq),
    endTime: ticksToSeconds(gm.endTicks, tempoChanges, ppq)
  }));

  return {
    midiArrayBuffer,
    warnings,
    metadata: {
      title,
      bpm: tempoChanges[0].bpm,
      timeSignature: `${timeSignatures[0].timeSignature[0]}/${timeSignatures[0].timeSignature[1]}`,
      keySignature: primaryKeySignature,
      keyFifths: primaryKeyFifths,
      keyMode: primaryKeyMode,
      ppq,
      tempoChanges,
      timeSignatures,
      keySignatures,
      measures: measuresWithTime,
      isGrandStaff,
      partNames: parsedParts.map((p) => p.meta.name),
      chordMarkers: chordMarkersWithTime,
      lyricCount,
      skippedGraceNotes,
      skippedOrnaments
    }
  };
}

module.exports = {
  isMusicXmlFileName,
  isCompressedMxlFileName,
  fifthsAndModeToVfKey,
  extractMusicXmlTextFromBuffer,
  convertMusicXmlToMidiBuffer
};
