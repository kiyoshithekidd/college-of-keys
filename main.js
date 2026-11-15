const { app, BrowserWindow, session, ipcMain, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

ipcMain.handle('open-folder-in-explorer', async (_event, targetDir) => {
  try {
    if (!targetDir || typeof targetDir !== 'string') {
      return { ok: false, error: 'Missing target folder path.' };
    }
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }
    const openErr = await shell.openPath(targetDir);
    if (!openErr) {
      return { ok: true };
    }
    if (process.platform === 'win32') {
      spawn('explorer.exe', [path.resolve(targetDir)], { detached: true, stdio: 'ignore' }).unref();
      return { ok: true };
    }
    return { ok: false, error: openErr };
  } catch (err) {
    return { ok: false, error: err?.message || String(err) };
  }
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

