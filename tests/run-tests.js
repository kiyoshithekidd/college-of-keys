#!/usr/bin/env node
/**
 * Cross-platform launcher for the College of Keys regression test suite (Issues #133, #158-#161).
 * 1. Runs Node unit tests (`tests/karaoke-and-lyrics.test.js`).
 * 2. Runs headless Electron unit + BrowserWindow DOM tests (`tests/regression.test.js`) under xvfb-run on Linux when DISPLAY is unset.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const nodeUnitTests = [
  path.join(__dirname, 'karaoke-and-lyrics.test.js'),
  path.join(__dirname, 'legends-and-preview.test.js'),
  path.join(__dirname, 'crowd-fail-state.test.js'),
  path.join(__dirname, 'highway-practice-tools.test.js'),
  path.join(__dirname, 'save-backup.test.js'),
  path.join(__dirname, 'midi-output.test.js'),
  path.join(__dirname, 'arcane-drills.test.js'),
  path.join(__dirname, 'karaoke-stage-ecosystem.test.js'),
  path.join(__dirname, 'pipeline-pro.test.js')
];
const testEntry = path.join(__dirname, 'regression.test.js');
const electronBin = require('electron');

const nodeRes = spawnSync(process.execPath, ['--test', ...nodeUnitTests], {
  cwd: repoRoot,
  stdio: 'inherit'
});
if (nodeRes.status !== 0) {
  process.exit(typeof nodeRes.status === 'number' ? nodeRes.status : 1);
}

const isHeadlessLinux = process.platform === 'linux' && !process.env.DISPLAY;

let cmd = electronBin;
let args = ['--no-sandbox', testEntry];

if (isHeadlessLinux) {
  cmd = 'xvfb-run';
  args = ['-a', electronBin, '--no-sandbox', testEntry];
}

const res = spawnSync(cmd, args, {
  cwd: repoRoot,
  stdio: 'inherit'
});

process.exit(typeof res.status === 'number' ? res.status : 1);
