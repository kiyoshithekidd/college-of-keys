/**
 * College of Keys — Trainer's Guild Interactive Tutorial Scenario (Issue #54)
 * Pure CommonJS state machine for the 4-step guided first-song walkthrough.
 */

const TUTORIAL_ICON_PATH = 'assets/images/icons/icon-guild-mentor.png';
const TUTORIAL_REWARD_XP = 50;

const TUTORIAL_STEPS = [
  {
    id: 'play',
    stepNumber: 1,
    title: 'Press Play to Begin',
    hint: "We've loaded the Demo Spell with Wait Mode ON. Press Play (or Space) to start the Spell Highway.",
    targetCount: 1
  },
  {
    id: 'first-notes',
    stepNumber: 2,
    title: 'Cast Your First Notes',
    hint: 'Strike 4 notes on the golden Strike Line using your MIDI keyboard, QWERTY (A–;), or mouse.',
    targetCount: 4
  },
  {
    id: 'chain',
    stepNumber: 3,
    title: 'Build a Spell Chain',
    hint: 'Hit 6 clean notes in a row to build momentum, XP, and Tavern Crowd energy!',
    targetCount: 6
  },
  {
    id: 'finish',
    stepNumber: 4,
    title: 'Finish Your First Song',
    hint: 'Play through to the end of the scroll to trigger your d20 Performance Check!',
    targetCount: 1
  }
];

function createTutorialState() {
  return {
    active: false,
    completed: false,
    stepIndex: 0,
    notesCast: 0,
    bestChain: 0
  };
}

function advanceTutorialState(state, event = {}) {
  const current = state ? { ...state } : createTutorialState();

  if (event.type === 'start') {
    return {
      active: true,
      completed: false,
      stepIndex: 0,
      notesCast: 0,
      bestChain: 0
    };
  }

  if (event.type === 'exit') {
    return {
      ...current,
      active: false
    };
  }

  if (!current.active || current.completed) {
    return current;
  }

  if (event.type === 'playback-started') {
    if (current.stepIndex === 0) {
      current.stepIndex = 1;
    }
    return current;
  }

  if (event.type === 'note-hit') {
    const noteDelta = Math.max(1, Number(event.noteCount) || 1);
    current.notesCast += noteDelta;
    current.bestChain = Math.max(current.bestChain, Number(event.maxChain) || 0);

    if (current.stepIndex === 0) {
      current.stepIndex = 1;
    }
    if (current.stepIndex === 1 && current.notesCast >= TUTORIAL_STEPS[1].targetCount) {
      current.stepIndex = 2;
    }
    if (current.stepIndex === 2 && current.bestChain >= TUTORIAL_STEPS[2].targetCount) {
      current.stepIndex = 3;
    }
    return current;
  }

  if (event.type === 'song-completed') {
    current.active = false;
    current.completed = true;
    current.stepIndex = TUTORIAL_STEPS.length - 1;
    return current;
  }

  return current;
}

function getTutorialBannerViewModel(state) {
  if (!state || !state.active) {
    return {
      visible: false,
      stepBadge: '',
      title: '',
      hint: '',
      progressText: ''
    };
  }

  const idx = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, state.stepIndex || 0));
  const step = TUTORIAL_STEPS[idx];
  let progressText = '';

  if (step.id === 'play') {
    progressText = 'Waiting for Play';
  } else if (step.id === 'first-notes') {
    const shown = Math.min(step.targetCount, state.notesCast || 0);
    progressText = `${shown} / ${step.targetCount} notes`;
  } else if (step.id === 'chain') {
    const shown = Math.min(step.targetCount, state.bestChain || 0);
    progressText = `${shown} / ${step.targetCount} chain`;
  } else if (step.id === 'finish') {
    progressText = 'Final Stretch!';
  }

  return {
    visible: true,
    stepBadge: `STEP ${step.stepNumber} / ${TUTORIAL_STEPS.length}`,
    title: step.title,
    hint: step.hint,
    progressText
  };
}

module.exports = {
  TUTORIAL_ICON_PATH,
  TUTORIAL_REWARD_XP,
  TUTORIAL_STEPS,
  createTutorialState,
  advanceTutorialState,
  getTutorialBannerViewModel
};
