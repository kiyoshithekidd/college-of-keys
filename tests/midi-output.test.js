'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clampMidiByte,
  normalizeMidiChannel,
  normalizeMidiVelocity,
  enumerateMidiOutputs,
  shouldMuteLocalPianoSynth,
  createMidiOutputController
} = require('../midi-output.js');

function createMockMidiOutput(id = 'out-1', name = 'Digital Piano USB', state = 'connected') {
  const sent = [];
  return {
    id,
    name,
    manufacturer: 'Roland',
    state,
    sent,
    send(bytes) {
      sent.push(Array.from(bytes));
    }
  };
}

test('clampMidiByte, normalizeMidiChannel, and normalizeMidiVelocity handle bounds cleanly', () => {
  assert.equal(clampMidiByte(-5), 0);
  assert.equal(clampMidiByte(140), 127);
  assert.equal(clampMidiByte(60.4), 60);

  assert.equal(normalizeMidiChannel(-1), 0);
  assert.equal(normalizeMidiChannel(20), 15);
  assert.equal(normalizeMidiChannel(2), 2);

  assert.equal(normalizeMidiVelocity(0.5), 64);
  assert.equal(normalizeMidiVelocity(1.0), 127);
  assert.equal(normalizeMidiVelocity(95), 95);
  assert.equal(normalizeMidiVelocity(200), 127);
});

test('enumerateMidiOutputs filters disconnected ports and extracts metadata', () => {
  const portA = createMockMidiOutput('p1', 'Yamaha P-125', 'connected');
  const portB = createMockMidiOutput('p2', 'Offline Synth', 'disconnected');
  const mockAccess = {
    outputs: new Map([
      ['p1', portA],
      ['p2', portB]
    ])
  };
  const list = enumerateMidiOutputs(mockAccess);
  assert.equal(list.length, 1);
  assert.equal(list[0].id, 'p1');
  assert.equal(list[0].name, 'Yamaha P-125');
});

test('shouldMuteLocalPianoSynth only mutes when an external output is active and enabled', () => {
  assert.equal(shouldMuteLocalPianoSynth({ muteLocalSynth: true }, false), false);
  assert.equal(shouldMuteLocalPianoSynth({ muteLocalSynth: true }, true), true);
  assert.equal(shouldMuteLocalPianoSynth({ muteLocalSynth: false }, true), false);
});

test('createMidiOutputController sends Note On/Off, CC 64 Sustain, and flushes All Notes Off', () => {
  const scheduled = [];
  let nextTimerId = 1;
  const cleared = new Set();

  const controller = createMidiOutputController({
    setTimer(fn, ms) {
      const id = nextTimerId++;
      scheduled.push({ id, fn, ms });
      return id;
    },
    clearTimer(id) {
      cleared.add(id);
    }
  });

  const port = createMockMidiOutput('piano-1', 'Kawai ES920');
  controller.setOutputPort(port, 'piano-1');
  controller.setChannel(1);
  assert.ok(port.sent.some((msg) => msg[0] === 0xb0 && msg[1] === 123 && msg[2] === 0));
  port.sent.length = 0;

  assert.equal(controller.sendNoteWithDuration(60, 0.5, 0.8), true);
  assert.deepEqual(port.sent[0], [0x91, 60, 102]);
  assert.equal(scheduled.length, 1);
  assert.equal(scheduled[0].ms, 500);

  controller.sendSustainPedal(true);
  assert.deepEqual(port.sent[1], [0xb1, 64, 127]);

  // Panic / stop should cancel scheduled timer, send Note Off for active note 60, CC 64=0, CC 123=0, CC 120=0
  controller.sendAllNotesOff();
  assert.ok(cleared.has(scheduled[0].id));
  assert.deepEqual(port.sent.slice(2), [
    [0x81, 60, 0],
    [0xb1, 64, 0],
    [0xb1, 123, 0],
    [0xb1, 120, 0]
  ]);
  assert.equal(controller.getStatus().activeNoteCount, 0);
});

test('switching output ports sends All Notes Off to the previous port first', () => {
  const controller = createMidiOutputController();
  const port1 = createMockMidiOutput('p1', 'Piano 1');
  const port2 = createMockMidiOutput('p2', 'Piano 2');

  controller.setOutputPort(port1, 'p1');
  controller.sendNoteOn(64, 90);
  controller.setOutputPort(port2, 'p2');

  assert.ok(port1.sent.some((msg) => msg[0] === 0xb0 && msg[1] === 123 && msg[2] === 0));
  assert.equal(port2.sent.length, 0);
  assert.equal(controller.getStatus().outputId, 'p2');
});
