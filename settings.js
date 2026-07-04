const electron = window.require ? window.require('electron') : require('electron');
const { ipcRenderer } = electron;

let currentSettings = {};
let isPreviewOpen = false;
let saveTimer = null;

function autoSave() {
  if (saveTimer) clearTimeout(saveTimer);
  
  const indicator = document.getElementById('saveIndicator');
  if (indicator) {
    indicator.textContent = '保存中...';
    indicator.className = 'save-indicator saving';
  }
  
  saveTimer = setTimeout(() => {
    try {
      const settings = getCurrentFormData();
      ipcRenderer.send('save-settings', settings);
      currentSettings = settings;
      
      if (indicator) {
        indicator.textContent = '已自动保存';
        indicator.className = 'save-indicator saved';
        
        setTimeout(() => {
          indicator.className = 'save-indicator';
        }, 2000);
      }
    } catch (e) {
      console.error('Failed to save settings:', e);
      if (indicator) {
        indicator.textContent = '保存失败';
        indicator.className = 'save-indicator error';
      }
    }
  }, 500);
}

function onSettingsChanged() {
  autoSave();
  sendPreviewUpdate();
}

function loadSettings() {
  try {
    currentSettings = ipcRenderer.sendSync('get-settings');
  } catch (e) {
    currentSettings = {
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
  }
  updateUI();
}

function updateUI() {
  const idleInput = document.getElementById('idleMinutes');
  const idleValue = currentSettings.idleMinutes;
  const isOutOfRange = idleValue > 30 || idleValue < 1 || !Number.isInteger(idleValue);

  const rangeContainer = document.getElementById('idleRangeContainer');
  const customDisplay = document.getElementById('customIdleDisplay');
  const customText = document.getElementById('customIdleText');

  if (isOutOfRange) {
    if (rangeContainer) rangeContainer.style.display = 'none';
    if (customDisplay) customDisplay.style.display = 'flex';
    if (customText) customText.textContent = idleValue + ' 分钟';
    idleInput.dataset.customValue = idleValue;
  } else {
    if (rangeContainer) rangeContainer.style.display = '';
    if (customDisplay) customDisplay.style.display = 'none';
    idleInput.value = idleValue;
    document.getElementById('idleMinutesValue').textContent = idleValue;
    updateRangeTrack(idleInput);
    delete idleInput.dataset.customValue;
  }

  // 壁纸来源
  const source = currentSettings.wallpaperSource || 'online';
  document.querySelectorAll('.source-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.source === source);
  });
  switchSourcePanel(source);

  if (currentSettings.customWallpaperUrl) {
    document.getElementById('customUrlInput').value = currentSettings.customWallpaperUrl;
  }
  if (currentSettings.customWallpaperUrls) {
    document.getElementById('multiUrlInput').value = currentSettings.customWallpaperUrls;
  }
  if (currentSettings.localWallpaperPath) {
    const infoEl = document.getElementById('localFileInfo');
    infoEl.textContent = currentSettings.localWallpaperPath;
    infoEl.title = currentSettings.localWallpaperPath;
    infoEl.dataset.path = currentSettings.localWallpaperPath;
  }
  if (currentSettings.localFolderPath) {
    const infoEl = document.getElementById('localFolderInfo');
    infoEl.textContent = currentSettings.localFolderPath;
    infoEl.title = currentSettings.localFolderPath;
    infoEl.dataset.path = currentSettings.localFolderPath;
  }

  document.getElementById('imageInterval').value = currentSettings.imageInterval;

  const autoSwitch = document.getElementById('autoSwitch');
  autoSwitch.classList.toggle('checked', currentSettings.autoSwitchWallpaper !== false);
  updateAutoSwitchGroupState();

  document.getElementById('showClock').classList.toggle('checked', currentSettings.showClock);
  document.getElementById('showSeconds').classList.toggle('checked', currentSettings.showSeconds);
  document.getElementById('showEffects').classList.toggle('checked', currentSettings.showEffects);

  document.getElementById('clockPosition').value = currentSettings.clockPosition || 'bottom-left';
  document.getElementById('clockFont').value = currentSettings.clockFont || 'Comic Sans MS';

  document.querySelectorAll('.style-option').forEach(option => {
    option.classList.toggle('selected', option.dataset.style === currentSettings.imageStyle);
  });

  document.querySelectorAll('.toggle-option').forEach(option => {
    option.classList.toggle('active', option.dataset.exit === currentSettings.exitMode);
  });
}

function switchSourcePanel(source) {
  document.querySelectorAll('.source-panel').forEach(panel => {
    panel.style.display = 'none';
  });
  const panel = document.getElementById('panel-' + source);
  if (panel) panel.style.display = 'block';

  const isFixed = source === 'url' || source === 'local';
  const autoSwitchContainer = document.getElementById('autoSwitchContainer');
  const imageIntervalGroup = document.getElementById('imageIntervalGroup');
  if (autoSwitchContainer) autoSwitchContainer.style.display = isFixed ? 'none' : '';
  if (imageIntervalGroup) imageIntervalGroup.style.display = isFixed ? 'none' : '';
}

function updateAutoSwitchGroupState() {
  const isChecked = document.getElementById('autoSwitch').classList.contains('checked');
  const group = document.getElementById('imageIntervalGroup');
  if (isChecked) {
    group.classList.remove('disabled-group');
  } else {
    group.classList.add('disabled-group');
  }
}

function updateRangeTrack(input) {
  const track = input.parentElement;
  if (!track) return;
  
  const thumb = track.querySelector('.range-thumb');
  if (!thumb) return;
  
  const value = parseInt(input.value);
  const min = parseInt(input.min);
  const max = parseInt(input.max);
  const percentage = ((value - min) / (max - min)) * 100;
  
  const rangeFill = track.querySelector('.range-fill');
  if (rangeFill) {
    rangeFill.style.width = percentage + '%';
  }
  
  thumb.style.left = percentage + '%';
}

function getCurrentFormData() {
  let idleMinutes = parseFloat(document.getElementById('idleMinutes').value);
  const customValue = document.getElementById('idleMinutes').dataset.customValue;
  if (customValue !== undefined && customValue !== '') {
    const parsed = parseFloat(customValue);
    if (!isNaN(parsed)) idleMinutes = parsed;
  }

  return {
    idleMinutes: idleMinutes,
    wallpaperSource: document.querySelector('.source-tab.active')?.dataset.source || 'online',
    imageStyle: document.querySelector('.style-option.selected')?.dataset.style || 'random',
    imageInterval: parseInt(document.getElementById('imageInterval').value) || 30,
    autoSwitchWallpaper: document.getElementById('autoSwitch').classList.contains('checked'),
    customWallpaperUrl: document.getElementById('customUrlInput').value.trim(),
    customWallpaperUrls: document.getElementById('multiUrlInput').value.trim(),
    localWallpaperPath: document.getElementById('localFileInfo').dataset.path || '',
    localFolderPath: document.getElementById('localFolderInfo').dataset.path || '',
    showClock: document.getElementById('showClock').classList.contains('checked'),
    showSeconds: document.getElementById('showSeconds').classList.contains('checked'),
    showEffects: document.getElementById('showEffects').classList.contains('checked'),
    exitMode: document.querySelector('.toggle-option.active')?.dataset.exit || 'manual',
    clockPosition: document.getElementById('clockPosition').value,
    clockFont: document.getElementById('clockFont').value
  };
}

function sendPreviewUpdate() {
  if (!isPreviewOpen) return;
  try {
    const settings = getCurrentFormData();
    ipcRenderer.send('preview-settings-update', settings);
  } catch (e) {}
}

function resetToDefault() {
  currentSettings = {
    idleMinutes: 5,
    wallpaperSource: 'online',
    imageStyle: 'random',
    imageInterval: 30,
    autoSwitchWallpaper: true,
    customWallpaperUrl: '',
    localWallpaperPath: '',
    localFolderPath: '',
    showClock: true,
    showSeconds: false,
    showEffects: true,
    exitMode: 'manual',
    clockPosition: 'bottom-left',
    clockFont: 'Comic Sans MS'
  };
  const idleInput = document.getElementById('idleMinutes');
  if (idleInput) delete idleInput.dataset.customValue;
  document.getElementById('localFileInfo').textContent = '未选择文件';
  document.getElementById('localFileInfo').removeAttribute('data-path');
  document.getElementById('localFolderInfo').textContent = '未选择文件夹';
  document.getElementById('localFolderInfo').removeAttribute('data-path');
  document.getElementById('customUrlInput').value = '';
  document.getElementById('multiUrlInput').value = '';
  updateUI();
  onSettingsChanged();
}

function previewScreensaver() {
  try {
    ipcRenderer.send('start-screensaver');
  } catch (e) {
    console.error('Failed to start screensaver:', e);
  }
}

function togglePreview() {
  if (isPreviewOpen) {
    try {
      ipcRenderer.send('close-preview');
    } catch (e) {}
  } else {
    try {
      ipcRenderer.send('open-preview');
      isPreviewOpen = true;
      updatePreviewButton();
    } catch (e) {}
  }
}

function updatePreviewButton() {
  const btn = document.getElementById('btnTogglePreview');
  if (isPreviewOpen) {
    btn.textContent = '关闭实时预览窗口';
    btn.classList.add('active');
  } else {
    btn.textContent = '开启实时预览窗口';
    btn.classList.remove('active');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  
  const reportActivity = () => {
    try {
      ipcRenderer.send('user-activity');
    } catch (e) {}
  };
  
  document.addEventListener('mousemove', reportActivity);
  document.addEventListener('keydown', reportActivity);
  document.addEventListener('click', reportActivity);
  document.addEventListener('scroll', reportActivity);
  
  document.getElementById('btnMinimize').addEventListener('click', () => {
    try {
      ipcRenderer.send('window-minimize');
    } catch (e) {}
  });
  
  document.getElementById('btnTitlebarClose').addEventListener('click', () => {
    try {
      ipcRenderer.send('window-hide');
    } catch (e) {}
  });
  
  document.getElementById('idleMinutes').addEventListener('input', (e) => {
    // 拖动进度条时清除自定义值标记
    delete e.target.dataset.customValue;
    document.getElementById('idleMinutesValue').textContent = e.target.value;
    updateRangeTrack(e.target);
    onSettingsChanged();
  });

  // 壁纸来源切换
  document.querySelectorAll('.source-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const source = tab.dataset.source;
      document.querySelectorAll('.source-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      switchSourcePanel(source);
      onSettingsChanged();
    });
  });

  // 自定义URL输入
  document.getElementById('customUrlInput').addEventListener('input', () => {
    onSettingsChanged();
  });

  // 多张URL输入
  document.getElementById('multiUrlInput').addEventListener('input', () => {
    onSettingsChanged();
  });

  // 选择本地文件
  document.getElementById('btnSelectLocalFile').addEventListener('click', async () => {
    try {
      const filePath = await ipcRenderer.invoke('select-local-file');
      if (filePath) {
        const infoEl = document.getElementById('localFileInfo');
        infoEl.textContent = filePath;
        infoEl.title = filePath;
        infoEl.dataset.path = filePath;
        onSettingsChanged();
      }
    } catch (e) {
      console.error('选择本地文件失败:', e);
    }
  });

  // 选择本地文件夹
  document.getElementById('btnSelectLocalFolder').addEventListener('click', async () => {
    try {
      const folderPath = await ipcRenderer.invoke('select-local-folder');
      if (folderPath) {
        const infoEl = document.getElementById('localFolderInfo');
        infoEl.textContent = folderPath;
        infoEl.title = folderPath;
        infoEl.dataset.path = folderPath;
        onSettingsChanged();
      }
    } catch (e) {
      console.error('选择本地文件夹失败:', e);
    }
  });

  // 自动切换壁纸开关
  document.getElementById('autoSwitchContainer').addEventListener('click', () => {
    document.getElementById('autoSwitch').classList.toggle('checked');
    updateAutoSwitchGroupState();
    onSettingsChanged();
  });

  // 自定义切换间隔输入
  document.getElementById('imageInterval').addEventListener('input', (e) => {
    let val = parseInt(e.target.value);
    if (!isNaN(val)) {
      if (val < 5) val = 5;
      if (val > 600) val = 600;
      e.target.value = val;
    }
    onSettingsChanged();
  });

  document.getElementById('imageInterval').addEventListener('blur', (e) => {
    let val = parseInt(e.target.value);
    if (isNaN(val) || val < 5) val = 30;
    if (val > 600) val = 600;
    e.target.value = val;
    onSettingsChanged();
  });

  document.getElementById('clockPosition').addEventListener('change', onSettingsChanged);
  document.getElementById('clockFont').addEventListener('change', onSettingsChanged);

  // 自定义空闲时间模态框
  const customIdleModal = document.getElementById('customIdleModal');
  const customIdleInput = document.getElementById('customIdleInput');
  const customIdleWarning = document.getElementById('customIdleWarning');
  const idleInput = document.getElementById('idleMinutes');

  document.getElementById('btnCustomIdle').addEventListener('click', () => {
    const currentValue = idleInput.dataset.customValue || idleInput.value;
    customIdleInput.value = currentValue;
    customIdleWarning.classList.remove('visible');
    customIdleWarning.textContent = '';
    customIdleModal.classList.add('visible');
    setTimeout(() => customIdleInput.focus(), 50);
  });

  function validateCustomIdle() {
    const raw = customIdleInput.value.trim();
    const val = parseFloat(raw);
    const confirmBtn = document.getElementById('btnCustomIdleConfirm');

    if (raw === '' || isNaN(val)) {
      customIdleWarning.textContent = '请输入有效的数字';
      customIdleWarning.classList.add('visible');
      confirmBtn.disabled = true;
      return null;
    }

    if (val <= 0) {
      customIdleWarning.textContent = '必须大于 0 分钟';
      customIdleWarning.classList.add('visible');
      confirmBtn.disabled = true;
      return null;
    }

    if (val < 2) {
      customIdleWarning.textContent = '提示：间隔过短（少于 2 分钟）可能会影响日常使用';
      customIdleWarning.classList.add('visible');
    } else if (val > 60) {
      customIdleWarning.textContent = '提示：间隔较长（超过 60 分钟），屏保可能很少触发';
      customIdleWarning.classList.add('visible');
    } else {
      customIdleWarning.classList.remove('visible');
      customIdleWarning.textContent = '';
    }

    confirmBtn.disabled = false;
    return val;
  }

  customIdleInput.addEventListener('input', validateCustomIdle);
  customIdleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      document.getElementById('btnCustomIdleConfirm').click();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      document.getElementById('btnCustomIdleCancel').click();
    }
  });

  document.getElementById('btnCustomIdleCancel').addEventListener('click', () => {
    customIdleModal.classList.remove('visible');
  });

  document.getElementById('btnCustomIdleConfirm').addEventListener('click', () => {
    const val = validateCustomIdle();
    if (val === null) return;

    const isOutOfRange = val > 30 || val < 1 || !Number.isInteger(val);
    const rangeContainer = document.getElementById('idleRangeContainer');
    const customDisplay = document.getElementById('customIdleDisplay');
    const customText = document.getElementById('customIdleText');

    if (isOutOfRange) {
      idleInput.dataset.customValue = val;
      if (rangeContainer) rangeContainer.style.display = 'none';
      if (customDisplay) customDisplay.style.display = 'flex';
      if (customText) customText.textContent = val + ' 分钟';
    } else {
      delete idleInput.dataset.customValue;
      if (rangeContainer) rangeContainer.style.display = '';
      if (customDisplay) customDisplay.style.display = 'none';
      idleInput.value = val;
      document.getElementById('idleMinutesValue').textContent = val;
      updateRangeTrack(idleInput);
    }

    onSettingsChanged();
    customIdleModal.classList.remove('visible');
  });

  // 点击遮罩关闭模态框
  customIdleModal.addEventListener('click', (e) => {
    if (e.target === customIdleModal) {
      customIdleModal.classList.remove('visible');
    }
  });
  
  document.querySelectorAll('.style-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.style-option').forEach(opt => opt.classList.remove('selected'));
      option.classList.add('selected');
      currentSettings.imageStyle = option.dataset.style;
      onSettingsChanged();
    });
  });
  
  document.querySelectorAll('.toggle-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.toggle-option').forEach(opt => opt.classList.remove('active'));
      option.classList.add('active');
      currentSettings.exitMode = option.dataset.exit;
      onSettingsChanged();
    });
  });
  
  document.getElementById('showClockContainer').addEventListener('click', () => {
    document.getElementById('showClock').classList.toggle('checked');
    onSettingsChanged();
  });
  
  document.getElementById('showSecondsContainer').addEventListener('click', () => {
    document.getElementById('showSeconds').classList.toggle('checked');
    onSettingsChanged();
  });
  
  document.getElementById('showEffectsContainer').addEventListener('click', () => {
    document.getElementById('showEffects').classList.toggle('checked');
    onSettingsChanged();
  });
  
  document.getElementById('btnTogglePreview').addEventListener('click', togglePreview);
  
  document.getElementById('btnReset').addEventListener('click', resetToDefault);
  
  document.getElementById('btnPreview').addEventListener('click', previewScreensaver);
  
  ipcRenderer.on('preview-closed', () => {
    isPreviewOpen = false;
    updatePreviewButton();
  });
});
