const { app, BrowserWindow, ipcMain, globalShortcut, powerSaveBlocker, screen, Tray, Menu, powerMonitor, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.argv.includes('--dev');
const isDebug = isDev || process.argv.includes('--debug');

if (process.platform === 'win32') {
  app.commandLine.appendSwitch('high-dpi-support', 'true');
  app.commandLine.appendSwitch('force-device-scale-factor', '1');
}

const SETTINGS_FILE = path.join(app.getPath('userData'), 'screensaver-settings.json');
let settingsWindow = null;
let screensaverWindow = null;
let previewWindow = null;
let tray = null;
let idleTimer = null;
let powerBlockerId = null;
let isEntertainmentMode = false;
let lastInputTime = Date.now();

const defaultSettings = {
  idleMinutes: 5,
  wallpaperSource: 'online',
  imageStyle: 'random',
  imageInterval: 30,
  autoSwitchWallpaper: true,
  customWallpaperUrl: '',
  customWallpaperUrls: '',
  localWallpaperPath: '',
  localFolderPath: '',
  showClock: true,
  showSeconds: false,
  showEffects: true,
  exitMode: 'manual',
  clockPosition: 'bottom-left',
  clockFont: 'Comic Sans MS'
};

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      return { ...defaultSettings, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
  }
  return defaultSettings;
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Failed to save settings:', error);
  }
}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.ico');
  tray = new Tray(iconPath);
  tray.setToolTip('Ruanftrix 屏保');
  
  updateTrayMenu();
  
  tray.on('click', () => {
    if (settingsWindow) {
      if (settingsWindow.isMinimized()) {
        settingsWindow.restore();
      }
      settingsWindow.show();
      settingsWindow.focus();
    } else {
      createSettingsWindow();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;
  
  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开设置',
      click: () => {
        if (settingsWindow) {
          if (settingsWindow.isMinimized()) {
            settingsWindow.restore();
          }
          settingsWindow.show();
          settingsWindow.focus();
        } else {
          createSettingsWindow();
        }
      }
    },
    { type: 'separator' },
    {
      label: isEntertainmentMode ? '关闭娱乐模式' : '开启娱乐模式',
      click: () => {
        isEntertainmentMode = !isEntertainmentMode;
        resetIdleTimer();
        updateTrayMenu();
        if (isEntertainmentMode && screensaverWindow) {
          hideScreensaver();
        }
      }
    },
    { type: 'separator' },
    {
      label: '立即显示屏保',
      click: () => {
        if (!isEntertainmentMode) {
          showScreensaver();
        }
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);
  
  tray.setContextMenu(contextMenu);
}

function createSettingsWindow() {
  settingsWindow = new BrowserWindow({
    width: 600,
    height: 760,
    resizable: false,
    frame: false,
    title: 'Ruanftrix 屏保设置',
    icon: path.join(__dirname, 'assets', 'app-icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      zoomFactor: screen.getPrimaryDisplay().scaleFactor
    }
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.setMenuBarVisibility(false);
  
  if (isDev) {
    settingsWindow.webContents.openDevTools();
  }

  settingsWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      settingsWindow.hide();
    }
  });
  
  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

function createPreviewWindow() {
  if (previewWindow) {
    previewWindow.focus();
    return;
  }
  
  const settingsBounds = settingsWindow ? settingsWindow.getBounds() : null;
  
  const previewWidth = 427;
  const previewHeight = 260;
  
  let x, y;
  if (settingsBounds) {
    x = settingsBounds.x + settingsBounds.width + 10;
    y = settingsBounds.y;
    
    const display = screen.getDisplayNearestPoint({ x: settingsBounds.x, y: settingsBounds.y });
    if (x + previewWidth > display.bounds.x + display.size.width) {
      x = settingsBounds.x - previewWidth - 10;
    }
  } else {
    x = 100;
    y = 100;
  }
  
  previewWindow = new BrowserWindow({
    width: previewWidth,
    height: previewHeight,
    x: x,
    y: y,
    minWidth: 280,
    minHeight: 180,
    resizable: true,
    frame: false,
    title: '实时预览',
    icon: path.join(__dirname, 'assets', 'app-icon.ico'),
    alwaysOnTop: true,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      zoomFactor: screen.getPrimaryDisplay().scaleFactor
    }
  });

  previewWindow.loadFile(path.join(__dirname, 'preview.html'));
  previewWindow.setMenuBarVisibility(false);
  
  if (isDev) {
    previewWindow.webContents.openDevTools({ mode: 'detach' });
  }

  previewWindow.on('closed', () => {
    previewWindow = null;
    if (settingsWindow) {
      settingsWindow.webContents.send('preview-closed');
    }
  });
}

function closePreviewWindow() {
  if (previewWindow) {
    previewWindow.close();
    previewWindow = null;
  }
}

function sendSettingsToPreview() {
  if (previewWindow && !previewWindow.isDestroyed()) {
    const settings = loadSettings();
    previewWindow.webContents.send('preview-settings', settings);
  }
}

function createScreensaverWindow() {
  if (screensaverWindow) return;

  const primaryDisplay = screen.getPrimaryDisplay();
  screensaverWindow = new BrowserWindow({
    width: primaryDisplay.size.width,
    height: primaryDisplay.size.height,
    x: primaryDisplay.bounds.x,
    y: primaryDisplay.bounds.y,
    frame: false,
    fullscreen: true,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    kiosk: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      zoomFactor: screen.getPrimaryDisplay().scaleFactor
    }
  });

  screensaverWindow.loadFile(path.join(__dirname, 'screensaver.html'));
  screensaverWindow.setMenuBarVisibility(false);

  powerBlockerId = powerSaveBlocker.start('prevent-display-sleep');

  screensaverWindow.on('closed', () => {
    screensaverWindow = null;
    if (powerBlockerId) {
      powerSaveBlocker.stop(powerBlockerId);
      powerBlockerId = null;
    }
    resetIdleTimer();
  });
}

function showScreensaver() {
  if (isEntertainmentMode) return;
  
  if (!screensaverWindow) {
    createScreensaverWindow();
  } else {
    screensaverWindow.show();
  }
}

function hideScreensaver() {
  if (screensaverWindow) {
    screensaverWindow.close();
    screensaverWindow = null;
  }
}

function resetIdleTimer() {
  lastInputTime = Date.now();
}

function startIdleTimer() {
  stopIdleTimer();

  idleTimer = setInterval(() => {
    const systemIdleTime = powerMonitor.getSystemIdleTime();
    const settings = loadSettings();
    const idleSeconds = settings.idleMinutes * 60;
    const remaining = idleSeconds - systemIdleTime;

    if (isDebug) {
      let status;
      if (isEntertainmentMode) {
        status = '娱乐模式(已暂停)';
      } else if (screensaverWindow) {
        status = '屏保运行中';
      } else {
        status = '等待中';
      }
      const entertainment = isEntertainmentMode ? '是' : '否';
      const displayRemaining = isEntertainmentMode ? idleSeconds : remaining;
      console.log(`[计时器] 状态: ${status} | 系统空闲: ${systemIdleTime}秒 / ${idleSeconds}秒 | 剩余: ${displayRemaining}秒 | 娱乐模式: ${entertainment}`);
    }

    if (isEntertainmentMode) {
      return;
    }

    if (systemIdleTime >= idleSeconds && !screensaverWindow) {
      if (isDebug) console.log('[计时器] 系统空闲时间已到，启动屏保');
      showScreensaver();
    }
  }, 1000);
}

function stopIdleTimer() {
  if (idleTimer) {
    clearInterval(idleTimer);
    idleTimer = null;
  }
}

app.whenReady().then(() => {
  createTray();
  createSettingsWindow();
  startIdleTimer();

  console.log(`[启动] Ruanftrix 屏保已启动 | 开发模式: ${isDev ? '开启' : '关闭'}`);

  globalShortcut.register('Escape', () => {
    if (screensaverWindow) {
      hideScreensaver();
      resetIdleTimer();
    }
  });

  ipcMain.on('get-settings', (event) => {
    event.returnValue = loadSettings();
  });

  ipcMain.on('save-settings', (event, settings) => {
    saveSettings(settings);
    resetIdleTimer();
    sendSettingsToPreview();
  });

  ipcMain.on('start-screensaver', () => {
    if (!isEntertainmentMode) {
      showScreensaver();
    }
  });

  ipcMain.on('stop-screensaver', () => {
    hideScreensaver();
    resetIdleTimer();
  });

  ipcMain.on('reset-idle', () => {
    resetIdleTimer();
  });
  
  ipcMain.on('user-activity', () => {
    resetIdleTimer();
  });

  ipcMain.on('window-minimize', () => {
    if (settingsWindow) {
      settingsWindow.minimize();
    }
  });

  ipcMain.on('window-hide', () => {
    if (settingsWindow) {
      settingsWindow.hide();
    }
  });

  ipcMain.on('window-close', () => {
    if (settingsWindow) {
      settingsWindow.hide();
    }
  });

  ipcMain.on('open-preview', () => {
    createPreviewWindow();
  });

  ipcMain.on('close-preview', () => {
    closePreviewWindow();
  });

  ipcMain.on('preview-settings-update', (event, settings) => {
    if (previewWindow && !previewWindow.isDestroyed()) {
      previewWindow.webContents.send('preview-settings', settings);
    }
  });

  ipcMain.handle('select-local-file', async () => {
    const result = await dialog.showOpenDialog(settingsWindow, {
      title: '选择壁纸图片',
      properties: ['openFile'],
      filters: [
        { name: '图片文件', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'gif', 'webp'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('select-local-folder', async () => {
    const result = await dialog.showOpenDialog(settingsWindow, {
      title: '选择壁纸文件夹',
      properties: ['openDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('scan-folder-images', async (event, folderPath) => {
    try {
      const files = fs.readdirSync(folderPath);
      const imageExts = ['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.webp'];
      const images = files.filter(f => {
        const ext = path.extname(f).toLowerCase();
        return imageExts.includes(ext);
      }).map(f => path.join(folderPath, f));
      return images;
    } catch (e) {
      console.error('扫描文件夹失败:', e);
      return [];
    }
  });

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createSettingsWindow();
    } else if (settingsWindow) {
      settingsWindow.show();
    }
  });

  screen.on('display-metrics-changed', () => {
    if (screensaverWindow) {
      hideScreensaver();
    }
  });
});

app.on('window-all-closed', () => {
});

app.on('before-quit', () => {
  app.isQuiting = true;
  stopIdleTimer();
  globalShortcut.unregisterAll();
  if (tray) {
    tray.destroy();
    tray = null;
  }
});
