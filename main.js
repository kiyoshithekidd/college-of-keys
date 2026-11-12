const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');

/**
 * Move one or more source files to the OS Recycle Bin / Trash via Electron shell.trashItem.
 * Retries once on transient Windows file locks (EBUSY/EPERM) after audio elements release.
 */
ipcMain.handle('grimoire:trash-files', async (_event, filePaths) => {
  const paths = Array.isArray(filePaths) ? filePaths : [];
  const seen = new Set();
  const trashed = [];
  const missing = [];
  const failed = [];

  for (const rawPath of paths) {
    if (!rawPath || typeof rawPath !== 'string') continue;
    const resolved = path.resolve(rawPath);
    const dedupeKey = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    try {
      if (!fs.existsSync(resolved)) {
        missing.push(resolved);
        continue;
      }
      const stat = fs.statSync(resolved);
      if (!stat.isFile()) {
        failed.push({ path: resolved, error: 'Refused to trash non-file path.' });
        continue;
      }

      try {
        await shell.trashItem(resolved);
      } catch (err) {
        if (err && (err.code === 'EBUSY' || err.code === 'EPERM')) {
          await new Promise((r) => setTimeout(r, 120));
          await shell.trashItem(resolved);
        } else {
          throw err;
        }
      }
      trashed.push(resolved);
    } catch (err) {
      failed.push({ path: resolved, error: err?.message || String(err) });
    }
  }

  return { trashed, missing, failed };
});

function createWindow() {
  // Automatically grant Web MIDI & Microphone (for Backlog Vocals) permissions in Electron's Chromium session
  const ALLOWED_PERMISSIONS = new Set(['midi', 'midiSysex', 'media']);

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(ALLOWED_PERMISSIONS.has(permission));
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return ALLOWED_PERMISSIONS.has(permission);
  });

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'College of Keys',
    backgroundColor: '#0c0907',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    console.log(`[Renderer Console ${level}] ${message} (${sourceId}:${line})`);
  });

  mainWindow.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

