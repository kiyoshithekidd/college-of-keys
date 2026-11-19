#!/usr/bin/env node
/**
 * Cross-platform launcher for the College of Keys regression test suite (Issue #133).
 * Runs headless Electron under xvfb-run on Linux when DISPLAY is unset, or invokes Electron directly.
 */
const { spawnSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const testEntry = path.join(__dirname, 'regression.test.js');
const electronBin = require('electron');

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
