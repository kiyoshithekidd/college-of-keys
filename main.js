const { app, BrowserWindow, session } = require('electron');
const path = require('path');

function createWindow() {
  // Automatically grant Web MIDI permissions in Electron's Chromium session
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'midi' || permission === 'midiSysex') {
      callback(true);
      return;
    }
    callback(true);
  });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'midi' || permission === 'midiSysex') {
      return true;
    }
    return true;
  });

  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    title: 'College of Keys',
    backgroundColor: '#0b0914',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
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

