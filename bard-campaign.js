/**
 * College of Keys — Campaign Mode: Gigs at Venues (Issue #29)
 * Pure CommonJS module for the 4-Act Story Campaign ("The Ballad of the Silver Keys"),
 * venue DCs, setlist generation, and unlock progression.
 */

const CAMPAIGN_ICON_PATH = 'assets/images/icons/icon-campaign-map.png';

const CAMPAIGN_VENUES = [
  {
    id: 'street-corner',
    actLabel: 'Act I',
    name: 'Cobblestone Street Corner',
    location: 'Oakhaven Square',
    dc: 10,
    songCount: 1,
    rewardXp: 75,
    backdropPath: './assets/images/practice/venue-street-corner.png',
    storyIntro:
      'Dusk settles over Oakhaven Square. With an upturned felt hat and a borrowed spellbook, you play for passersby—hoping to catch the ear of Barnaby, proprietor of The Silver Flagon.',
    storyOutro:
      'Clinking copper fills your hat! Barnaby steps out from the lantern-lit alley, grinning: "Not bad, kid. Come play Tuesday night at The Silver Flagon—if you can handle a real tavern crowd."'
  },
  {
    id: 'silver-flagon',
    actLabel: 'Act II',
    name: 'The Silver Flagon Tavern',
    location: 'Hearth District',
    dc: 12,
    songCount: 2,
    rewardXp: 125,
    backdropPath: './assets/images/practice/practice-stage-backdrop.png',
    storyIntro:
      'Smoke, clinking tankards, and rowdy mercenaries. Barnaby gestures toward the hearth stage: "Two songs, no choking. Win over the room and the Guild will hear of you."',
    storyOutro:
      'The tavern erupts in cheers! A hooded Conservatory scout slips a wax-sealed invitation onto your keyboard before vanishing into the night.'
  },
  {
    id: 'conservatory-hall',
    actLabel: 'Act III',
    name: 'Grand Conservatory Hall',
    location: 'High Ward',
    dc: 15,
    songCount: 2,
    rewardXp: 175,
    backdropPath: './assets/images/practice/venue-concert-hall.png',
    storyIntro:
      'Stained glass towers above polished oak. The Arch-Cantor and three stern critics watch from the balcony. Every phrase must ring true to earn a royal summons.',
    storyOutro:
      'The Arch-Cantor rises in slow, approving applause. "Precision and soul in equal measure. Highgarden Keep awaits you at the Solstice Gala."'
  },
  {
    id: 'royal-court',
    actLabel: 'Act IV',
    name: 'The Royal Court',
    location: 'Highgarden Keep',
    dc: 18,
    songCount: 3,
    rewardXp: 300,
    backdropPath: './assets/images/practice/venue-royal-court.png',
    storyIntro:
      "Crimson banners, crystal chandeliers, and the Monarch's throne. Three back-to-back ballads stand between a former street busker and the Royal Seal of Master Bard.",
    storyOutro:
      "The Monarch lifts a golden goblet in salute as the court bursts into standing ovation. From Oakhaven's cobblestones to the Royal Court—your legend is sealed!"
  }
];

function getCampaignVenueById(venueId) {
  return CAMPAIGN_VENUES.find((v) => v.id === venueId) || null;
}

function createDefaultCampaignProgress() {
  return {
    clearedVenues: {}
  };
}

function normalizeCampaignProgress(raw) {
  const base = createDefaultCampaignProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base;
  }
  const validIds = new Set(CAMPAIGN_VENUES.map((v) => v.id));
  if (raw.clearedVenues && typeof raw.clearedVenues === 'object' && !Array.isArray(raw.clearedVenues)) {
    for (const [id, entry] of Object.entries(raw.clearedVenues)) {
      if (!validIds.has(id) || !entry || typeof entry !== 'object') continue;
      base.clearedVenues[id] = {
        clearedAt: typeof entry.clearedAt === 'string' ? entry.clearedAt : new Date().toISOString(),
        bestRoll: Math.max(0, Number(entry.bestRoll) || 0)
      };
    }
  }
  return base;
}

function isVenueUnlocked(venueId, progressState = {}) {
  const idx = CAMPAIGN_VENUES.findIndex((v) => v.id === venueId);
  if (idx < 0) return false;
  if (idx === 0) return true;
  const norm = normalizeCampaignProgress(progressState);
  const prevVenue = CAMPAIGN_VENUES[idx - 1];
  return Boolean(norm.clearedVenues[prevVenue.id]);
}

function buildVenueSetlistItems(venue, catalogEntries = []) {
  if (!venue) return [];
  const count = Math.max(1, Number(venue.songCount) || 1);
  const pool = Array.isArray(catalogEntries) && catalogEntries.length > 0
    ? catalogEntries
    : [{ songId: 'builtin::demo', title: 'Ballad of the Silver Flagon (Demo Spell)', filePath: 'BUILTIN_DEMO', spellLevel: 1 }];

  // Sort pool by difficulty ascending so later venues lean toward harder songs if available
  const sorted = [...pool].sort((a, b) => (Number(a.spellLevel) || 0) - (Number(b.spellLevel) || 0));
  const venueIdx = Math.max(0, CAMPAIGN_VENUES.findIndex((v) => v.id === venue.id));
  const startOffset = sorted.length > 1 ? Math.min(sorted.length - 1, venueIdx) : 0;

  const items = [];
  for (let i = 0; i < count; i++) {
    const pick = sorted[(startOffset + i) % sorted.length];
    items.push({
      songId: pick.songId || pick.filePath || pick.title || 'builtin::demo',
      title: pick.title || pick.fileName || 'Untitled Scroll',
      filePath: pick.filePath || 'BUILTIN_DEMO'
    });
  }
  return items;
}

function evaluateVenueCheck(venueId, rolledTotal, progressState = {}, nowIso = new Date().toISOString()) {
  const venue = getCampaignVenueById(venueId);
  const nextProgress = normalizeCampaignProgress(progressState);
  if (!venue) {
    return { passed: false, firstClear: false, rewardXp: 0, nextUnlockedVenue: null, venue: null, rolledTotal: 0, nextProgress };
  }

  const total = Number(rolledTotal) || 0;
  const passed = total >= venue.dc;
  if (!passed) {
    return { passed: false, firstClear: false, rewardXp: 0, nextUnlockedVenue: null, venue, rolledTotal: total, nextProgress };
  }

  const prev = nextProgress.clearedVenues[venue.id];
  const firstClear = !prev;
  nextProgress.clearedVenues[venue.id] = {
    clearedAt: prev ? prev.clearedAt : nowIso,
    bestRoll: Math.max(prev ? prev.bestRoll : 0, total)
  };

  const idx = CAMPAIGN_VENUES.findIndex((v) => v.id === venue.id);
  const nextUnlockedVenue = firstClear && idx >= 0 && idx + 1 < CAMPAIGN_VENUES.length
    ? CAMPAIGN_VENUES[idx + 1]
    : null;

  return {
    passed: true,
    firstClear,
    rewardXp: firstClear ? venue.rewardXp : 0,
    nextUnlockedVenue,
    venue,
    rolledTotal: total,
    nextProgress
  };
}

function getCampaignVenueViewModels(progressState = {}) {
  const norm = normalizeCampaignProgress(progressState);
  return CAMPAIGN_VENUES.map((venue) => {
    const clearedEntry = norm.clearedVenues[venue.id] || null;
    return {
      ...venue,
      unlocked: isVenueUnlocked(venue.id, norm),
      cleared: Boolean(clearedEntry),
      bestRoll: clearedEntry ? clearedEntry.bestRoll : 0,
      clearedAt: clearedEntry ? clearedEntry.clearedAt : null
    };
  });
}

module.exports = {
  CAMPAIGN_ICON_PATH,
  CAMPAIGN_VENUES,
  getCampaignVenueById,
  createDefaultCampaignProgress,
  normalizeCampaignProgress,
  isVenueUnlocked,
  buildVenueSetlistItems,
  evaluateVenueCheck,
  getCampaignVenueViewModels
};
