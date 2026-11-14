/**
 * College of Keys — Achievements & Milestones (Issue #65)
 * Pure CommonJS module for evaluating, persisting, and summarizing Bardic milestones.
 */

const ACHIEVEMENT_ICON_PATH = 'assets/images/icons/icon-achievement-seal.png';

const ACHIEVEMENTS = [
  {
    id: 'first-spell-cast',
    title: 'First Spell Cast',
    description: 'Complete your first full song on the Spell Highway.',
    xpReward: 50,
    category: 'performance',
    badgeLabel: 'Milestone I'
  },
  {
    id: 'critical-acclaim',
    title: 'Critical Acclaim',
    description: 'Roll a Natural 20 on a Performance Check.',
    xpReward: 75,
    category: 'performance',
    badgeLabel: 'Nat 20'
  },
  {
    id: 'dedicated-troubadour',
    title: 'Dedicated Troubadour',
    description: 'Maintain a 7-day Hearthfire practice streak.',
    xpReward: 100,
    category: 'dedication',
    badgeLabel: '7-Day Streak'
  },
  {
    id: 'archmages-trial',
    title: "Archmage's Trial",
    description: 'Finish a song at full difficulty (100% speed, both hands, Wait Mode off) or a 9th-Level Spell.',
    xpReward: 100,
    category: 'mastery',
    badgeLabel: 'Full Trial'
  },
  {
    id: 'flawless-incantation',
    title: 'Flawless Incantation',
    description: 'Complete a song with 100% Somatic Accuracy.',
    xpReward: 100,
    category: 'mastery',
    badgeLabel: '100% Accuracy'
  },
  {
    id: 'enchanted-tavern',
    title: 'Enchanted the Tavern',
    description: 'Raise the Tavern Crowd Meter all the way to Enchanted.',
    xpReward: 50,
    category: 'tavern',
    badgeLabel: 'Crowd Hype'
  },
  {
    id: 'headliner',
    title: 'Headliner',
    description: 'Perform a complete Tavern Setlist from start to finish.',
    xpReward: 75,
    category: 'tavern',
    badgeLabel: 'Setlist'
  }
];

function normalizeUnlockedAchievements(raw) {
  const result = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return result;
  }
  const validIds = new Set(ACHIEVEMENTS.map((a) => a.id));
  for (const [id, entry] of Object.entries(raw)) {
    if (!validIds.has(id) || !entry || typeof entry !== 'object') continue;
    result[id] = {
      unlockedAt: typeof entry.unlockedAt === 'string' ? entry.unlockedAt : new Date().toISOString(),
      xpAwarded: Math.max(0, Number(entry.xpAwarded) || 0)
    };
  }
  return result;
}

function isAchievementConditionMet(id, context = {}) {
  switch (id) {
    case 'first-spell-cast':
      return Number(context.songsCompleted) >= 1;
    case 'critical-acclaim':
      return Number(context.rolledFace) === 20;
    case 'dedicated-troubadour':
      return Number(context.streakDays) >= 7;
    case 'archmages-trial':
      return Boolean(context.isFullDifficulty);
    case 'flawless-incantation':
      return (
        typeof context.accuracyPct === 'number' &&
        Number.isFinite(context.accuracyPct) &&
        context.accuracyPct >= 100 &&
        (context.totalAttempts === undefined || Number(context.totalAttempts) > 0)
      );
    case 'enchanted-tavern':
      return context.crowdMoodId === 'enchanted';
    case 'headliner':
      return Boolean(context.setlistCompleted);
    default:
      return false;
  }
}

function evaluateAchievements(context = {}, unlockedMap = {}, nowIso = new Date().toISOString()) {
  const nextUnlockedMap = normalizeUnlockedAchievements(unlockedMap);
  const newlyUnlocked = [];
  let totalBonusXp = 0;

  for (const achievement of ACHIEVEMENTS) {
    if (Object.prototype.hasOwnProperty.call(nextUnlockedMap, achievement.id)) {
      continue;
    }
    if (isAchievementConditionMet(achievement.id, context)) {
      nextUnlockedMap[achievement.id] = {
        unlockedAt: nowIso,
        xpAwarded: achievement.xpReward
      };
      newlyUnlocked.push(achievement);
      totalBonusXp += achievement.xpReward;
    }
  }

  return {
    newlyUnlocked,
    totalBonusXp,
    nextUnlockedMap
  };
}

function getAchievementSummary(unlockedMap = {}) {
  const normalized = normalizeUnlockedAchievements(unlockedMap);
  let unlockedCount = 0;
  let totalXpEarned = 0;

  const items = ACHIEVEMENTS.map((achievement) => {
    const entry = normalized[achievement.id] || null;
    const unlocked = Boolean(entry);
    if (unlocked) {
      unlockedCount++;
      totalXpEarned += entry.xpAwarded || achievement.xpReward;
    }
    return {
      ...achievement,
      unlocked,
      unlockedAt: entry ? entry.unlockedAt : null,
      xpAwarded: entry ? entry.xpAwarded : 0
    };
  });

  return {
    totalCount: ACHIEVEMENTS.length,
    unlockedCount,
    totalXpEarned,
    items
  };
}

module.exports = {
  ACHIEVEMENT_ICON_PATH,
  ACHIEVEMENTS,
  normalizeUnlockedAchievements,
  evaluateAchievements,
  getAchievementSummary
};
