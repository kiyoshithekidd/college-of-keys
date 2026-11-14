/**
 * College of Keys — Bard Colleges as Learning Tracks (Issue #27)
 * Pure CommonJS module for the 3 Bard Colleges (Lore, Cadence, Revelry),
 * per-college song recommendations, and drill/progress tracking.
 */

const BARD_COLLEGES = [
  {
    id: 'lore',
    name: 'College of Lore',
    shortName: 'Lore',
    tagline: 'Sight-Reading & Musical Theory',
    description: 'Master notation reading, Wait Mode precision, and foundational repertoire.',
    iconPath: 'assets/images/icons/icon-college-lore.png',
    accentClass: 'college-lore',
    recommendedTiers: [0, 1, 2, 3],
    drills: [
      {
        id: 'lore-wait-practice',
        title: 'Sight-Read with Wait Mode',
        description: 'Complete a song with Wait Mode ON to read every glyph accurately.'
      },
      {
        id: 'lore-steady-acc',
        title: 'Scholarly Precision',
        description: 'Finish any scroll with 85%+ Somatic Accuracy.'
      },
      {
        id: 'lore-repertoire',
        title: 'Arcane Repertoire',
        description: 'Complete 3 songs while studying the College of Lore.'
      }
    ]
  },
  {
    id: 'cadence',
    name: 'College of Cadence',
    shortName: 'Cadence',
    tagline: 'Speed, Tempo & Precision',
    description: 'Sharpen your reflexes at full tempo with clean chord rolls and ironclad accuracy.',
    iconPath: 'assets/images/icons/icon-college-cadence.png',
    accentClass: 'college-cadence',
    recommendedTiers: [3, 4, 5, 6],
    drills: [
      {
        id: 'cadence-full-tempo',
        title: 'Full-Tempo Trial',
        description: 'Finish a song at 100%+ speed with Wait Mode OFF.'
      },
      {
        id: 'cadence-sharp-acc',
        title: 'Razor Accuracy',
        description: 'Achieve 92%+ Somatic Accuracy on a completed song.'
      },
      {
        id: 'cadence-chords',
        title: 'Twin-Blade Chords',
        description: 'Land 5+ clean chord rolls (or 20+ clean notes) in one song.'
      }
    ]
  },
  {
    id: 'revelry',
    name: 'College of Revelry',
    shortName: 'Revelry',
    tagline: 'Performance & Showmanship',
    description: 'Captivate the tavern crowd, sustain blazing Spell Chains, and headline setlists.',
    iconPath: 'assets/images/icons/icon-college-revelry.png',
    accentClass: 'college-revelry',
    recommendedTiers: [1, 2, 4, 5],
    drills: [
      {
        id: 'revelry-chain',
        title: 'Stage Presence',
        description: 'Reach a 25+ Spell Chain during a live performance.'
      },
      {
        id: 'revelry-crowd',
        title: 'Bring Down the House',
        description: 'Push the Tavern Crowd Meter to Lively or Enchanted.'
      },
      {
        id: 'revelry-setlist',
        title: 'Tavern Headliner',
        description: 'Complete a Tavern Setlist or roll 15+ on a Performance Check.'
      }
    ]
  }
];

function getCollegeById(collegeId) {
  return BARD_COLLEGES.find((c) => c.id === collegeId) || null;
}

function createDefaultCollegeProgress() {
  return {
    enrolledCollegeId: null,
    completedDrills: {},
    collegeSongsCompleted: {
      lore: 0,
      cadence: 0,
      revelry: 0
    }
  };
}

function normalizeCollegeProgress(raw) {
  const base = createDefaultCollegeProgress();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return base;
  }
  if (getCollegeById(raw.enrolledCollegeId)) {
    base.enrolledCollegeId = raw.enrolledCollegeId;
  }
  const validDrillIds = new Set(BARD_COLLEGES.flatMap((c) => c.drills.map((d) => d.id)));
  if (raw.completedDrills && typeof raw.completedDrills === 'object' && !Array.isArray(raw.completedDrills)) {
    for (const [id, entry] of Object.entries(raw.completedDrills)) {
      if (!validDrillIds.has(id) || !entry || typeof entry !== 'object') continue;
      base.completedDrills[id] = {
        completedAt: typeof entry.completedAt === 'string' ? entry.completedAt : new Date().toISOString()
      };
    }
  }
  if (raw.collegeSongsCompleted && typeof raw.collegeSongsCompleted === 'object') {
    for (const c of BARD_COLLEGES) {
      base.collegeSongsCompleted[c.id] = Math.max(0, Number(raw.collegeSongsCompleted[c.id]) || 0);
    }
  }
  return base;
}

function isDrillConditionMet(drillId, context = {}, nextProgress) {
  switch (drillId) {
    case 'lore-wait-practice':
      return Boolean(context.songCompleted && context.waitMode);
    case 'lore-steady-acc':
      return Boolean(context.songCompleted && Number(context.accuracyPct) >= 85);
    case 'lore-repertoire':
      return (nextProgress.collegeSongsCompleted.lore || 0) >= 3;
    case 'cadence-full-tempo':
      return Boolean(context.songCompleted && !context.waitMode && Number(context.playbackSpeed) >= 1.0);
    case 'cadence-sharp-acc':
      return Boolean(context.songCompleted && Number(context.accuracyPct) >= 92);
    case 'cadence-chords':
      return Boolean(
        context.songCompleted &&
          (Number(context.cleanChordRolls) >= 5 || Number(context.cleanNotesHit) >= 20)
      );
    case 'revelry-chain':
      return Number(context.maxSpellChain) >= 25;
    case 'revelry-crowd':
      return context.crowdMoodId === 'lively' || context.crowdMoodId === 'enchanted';
    case 'revelry-setlist':
      return Boolean(context.setlistCompleted || Number(context.d20Total) >= 15);
    default:
      return false;
  }
}

function evaluateCollegeProgress(context = {}, progressState = {}, nowIso = new Date().toISOString()) {
  const nextProgress = normalizeCollegeProgress(progressState);
  if (context.songCompleted && nextProgress.enrolledCollegeId) {
    const enrolled = nextProgress.enrolledCollegeId;
    nextProgress.collegeSongsCompleted[enrolled] = (nextProgress.collegeSongsCompleted[enrolled] || 0) + 1;
  }

  const newlyCompletedDrills = [];
  for (const college of BARD_COLLEGES) {
    for (const drill of college.drills) {
      if (Object.prototype.hasOwnProperty.call(nextProgress.completedDrills, drill.id)) {
        continue;
      }
      if (isDrillConditionMet(drill.id, context, nextProgress)) {
        nextProgress.completedDrills[drill.id] = { completedAt: nowIso };
        newlyCompletedDrills.push({ collegeId: college.id, collegeName: college.name, ...drill });
      }
    }
  }

  return {
    newlyCompletedDrills,
    nextProgress
  };
}

function getCollegeTrackViewModels(progressState = {}, catalogEntries = []) {
  const norm = normalizeCollegeProgress(progressState);
  const safeCatalog = Array.isArray(catalogEntries) ? catalogEntries : [];

  return BARD_COLLEGES.map((college) => {
    const drills = college.drills.map((d) => ({
      ...d,
      completed: Boolean(norm.completedDrills[d.id])
    }));
    const completedCount = drills.filter((d) => d.completed).length;
    const totalDrills = drills.length;
    const progressPct = totalDrills > 0 ? Math.round((completedCount / totalDrills) * 100) : 0;

    const tierSet = new Set(college.recommendedTiers || []);
    const tierMatches = safeCatalog.filter((entry) => tierSet.has(Number(entry.spellLevel ?? entry.difficultyIndex ?? 0)));
    const recommendedSongs = (tierMatches.length > 0 ? tierMatches : safeCatalog).slice(0, 4);

    return {
      ...college,
      enrolled: norm.enrolledCollegeId === college.id,
      songsCompletedInCollege: norm.collegeSongsCompleted[college.id] || 0,
      completedCount,
      totalDrills,
      progressPct,
      drills,
      recommendedSongs
    };
  });
}

module.exports = {
  BARD_COLLEGES,
  getCollegeById,
  createDefaultCollegeProgress,
  normalizeCollegeProgress,
  evaluateCollegeProgress,
  getCollegeTrackViewModels
};
