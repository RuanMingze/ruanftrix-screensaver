const { app, BrowserWindow, ipcMain, globalShortcut, powerSaveBlocker, screen, Tray, Menu, powerMonitor, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

const isDev = process.argv.includes('--dev') || process.env.RUANFTRIX_DEV === '1';
const isDebug = isDev || process.argv.includes('--debug') || process.env.RUANFTRIX_DEBUG === '1';
const startToTray = process.argv.includes('--tray');
const forceWin = process.argv.includes('--win');
const forceMac = process.argv.includes('--macos') || process.argv.includes('--mac');
const forceLinux = process.argv.includes('--linux');
const forcePlatform = forceWin ? 'win32' : forceMac ? 'darwin' : forceLinux ? 'linux' : null;

console.log('[启动] 命令行参数:', process.argv.join(' '));
  console.log(`[启动] Ruanftrix 屏保已启动 | 平台: ${process.platform}${forcePlatform ? ` (已强制为: ${forcePlatform})` : ''} | 开发模式: ${isDev ? '开启' : '关闭'} | 调试模式: ${isDebug ? '开启' : '关闭'} | 托盘启动: ${startToTray ? '开启' : '关闭'}`);

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
  customApiUrl: '',
  localWallpaperPath: '',
  localFolderPath: '',
  localVideoPath: '',
  customVideoUrl: '',
  enableVideoAudio: false,
  showClock: true,
  showSeconds: false,
  showEffects: true,
  showLoadingIndicator: true,
  exitMode: 'manual',
  hideCursor: false,
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

function toggleEntertainmentMode() {
  isEntertainmentMode = !isEntertainmentMode;
  resetIdleTimer();
  updateTrayMenu();
  if (isEntertainmentMode && screensaverWindow) {
    hideScreensaver();
  }
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.webContents.send('entertainment-mode-changed', isEntertainmentMode);
  }
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
    {
      label: isEntertainmentMode ? '关闭娱乐模式' : '开启娱乐模式',
      click: () => {
        toggleEntertainmentMode();
      }
    },
    {
      label: '立即显示屏保',
      click: () => {
        if (!isEntertainmentMode) {
          showScreensaver();
        }
      }
    },
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
  const effectivePlatform = forcePlatform || process.platform;
  const isMac = effectivePlatform === 'darwin';
  const isLinux = effectivePlatform === 'linux';
  settingsWindow = new BrowserWindow({
    width: 600,
    height: 760,
    resizable: false,
    frame: false,
    titleBarStyle: isMac ? 'hiddenInset' : 'default',
    title: 'Ruanftrix 屏保设置',
    icon: path.join(__dirname, 'assets', 'app-icon.ico'),
    show: !startToTray,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      zoomFactor: screen.getPrimaryDisplay().scaleFactor
    }
  });

  settingsWindow.webContents.on('did-finish-load', () => {
    settingsWindow.webContents.send('platform-info', { platform: effectivePlatform, isMac, isLinux, forced: !!forcePlatform });
  });

  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.setMenuBarVisibility(false);

  // macOS 系统菜单栏
  if (isMac) {
    const macMenu = Menu.buildFromTemplate([
      {
        label: 'Ruanftrix',
        submenu: [
          { label: '关于 Ruanftrix 屏保', role: 'about' },
          { type: 'separator' },
          { label: '隐藏 Ruanftrix', role: 'hide' },
          { label: '隐藏其他', role: 'hideOthers' },
          { label: '显示全部', role: 'unhide' },
          { type: 'separator' },
          { label: '退出 Ruanftrix 屏保', role: 'quit' }
        ]
      },
      {
        label: '编辑',
        submenu: [
          { label: '撤销', role: 'undo' },
          { label: '重做', role: 'redo' },
          { type: 'separator' },
          { label: '剪切', role: 'cut' },
          { label: '复制', role: 'copy' },
          { label: '粘贴', role: 'paste' },
          { label: '全选', role: 'selectAll' }
        ]
      },
      {
        label: '窗口',
        submenu: [
          { label: '最小化', role: 'minimize' },
          { label: '关闭', role: 'close' }
        ]
      }
    ]);
    Menu.setApplicationMenu(macMenu);
  } else {
    Menu.setApplicationMenu(null);
  }

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
    // 双重保险：Windows 上 kiosk 模式 + transparent 可能让右上角出现 resize 光标
    // 显式禁用 resizable 并把 min/max 锁死，叠加 will-resize 拦截，彻底杜绝缩放
    resizable: false,
    minWidth: primaryDisplay.size.width,
    minHeight: primaryDisplay.size.height,
    maxWidth: primaryDisplay.size.width,
    maxHeight: primaryDisplay.size.height,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      zoomFactor: screen.getPrimaryDisplay().scaleFactor
    }
  });

  // 拦截 will-resize：Windows 边缘仍可能出现 resize 光标，这里直接阻止事件
  screensaverWindow.on('will-resize', (event) => {
    event.preventDefault();
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

  ipcMain.on('toggle-entertainment-mode', () => {
    toggleEntertainmentMode();
  });

  ipcMain.on('get-entertainment-mode', (event) => {
    event.returnValue = isEntertainmentMode;
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

  ipcMain.handle('select-local-video', async () => {
    const result = await dialog.showOpenDialog(settingsWindow, {
      title: '选择本地视频',
      properties: ['openFile'],
      filters: [
        { name: '视频文件', extensions: ['mp4', 'webm', 'ogg', 'mov', 'mkv', 'avi'] }
      ]
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('read-changelog', async () => {
    try {
      const candidates = [
        path.join(__dirname, 'CHANGELOG.md'),
        path.join(process.resourcesPath, 'CHANGELOG.md'),
        path.join(app.getAppPath(), 'CHANGELOG.md')
      ];
      for (const p of candidates) {
        if (fs.existsSync(p)) {
          const content = fs.readFileSync(p, 'utf-8');
          return { success: true, content };
        }
      }
      return { success: false, error: 'CHANGELOG.md not found' };
    } catch (e) {
      return { success: false, error: e.message };
    }
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
