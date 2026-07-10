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
      customApiUrl: '',
      localWallpaperPath: '',
      localFolderPath: '',
      localVideoPath: '',
      customVideoUrl: '',
      enableVideoAudio: false,
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
  if (currentSettings.customApiUrl) {
    const customApiInput = document.getElementById('customApiInput');
    if (customApiInput) customApiInput.value = currentSettings.customApiUrl;
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
  if (currentSettings.localVideoPath) {
    const infoEl = document.getElementById('localVideoInfo');
    if (infoEl) {
      infoEl.textContent = currentSettings.localVideoPath;
      infoEl.title = currentSettings.localVideoPath;
      infoEl.dataset.path = currentSettings.localVideoPath;
    }
  }
  if (currentSettings.customVideoUrl) {
    const customVideoUrlInput = document.getElementById('customVideoUrlInput');
    if (customVideoUrlInput) customVideoUrlInput.value = currentSettings.customVideoUrl;
  }

  document.getElementById('imageInterval').value = currentSettings.imageInterval;

  const autoSwitch = document.getElementById('autoSwitch');
  autoSwitch.classList.toggle('checked', currentSettings.autoSwitchWallpaper !== false);
  updateAutoSwitchGroupState();

  document.getElementById('showClock').classList.toggle('checked', currentSettings.showClock);
  document.getElementById('showSeconds').classList.toggle('checked', currentSettings.showSeconds);
  document.getElementById('showEffects').classList.toggle('checked', currentSettings.showEffects);
  document.getElementById('enableVideoAudio').classList.toggle('checked', currentSettings.enableVideoAudio === true);
  updateVideoAudioVisibility(source);

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

  const isFixed = source === 'url' || source === 'local' || source === 'video' || source === 'videoUrl';
  const autoSwitchContainer = document.getElementById('autoSwitchContainer');
  const imageIntervalGroup = document.getElementById('imageIntervalGroup');
  if (autoSwitchContainer) autoSwitchContainer.style.display = isFixed ? 'none' : '';
  if (imageIntervalGroup) imageIntervalGroup.style.display = isFixed ? 'none' : '';
  updateVideoAudioVisibility(source);
}

function updateVideoAudioVisibility(source) {
  const container = document.getElementById('enableVideoAudioContainer');
  const hint = document.getElementById('enableVideoAudioHint');
  const isVideo = source === 'video' || source === 'videoUrl';
  if (container) container.style.display = isVideo ? 'flex' : 'none';
  if (hint) hint.style.display = isVideo ? 'block' : 'none';
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

  const customApiInput = document.getElementById('customApiInput');
  const customApiUrl = customApiInput ? customApiInput.value.trim() : '';

  return {
    idleMinutes: idleMinutes,
    wallpaperSource: document.querySelector('.source-tab.active')?.dataset.source || 'online',
    imageStyle: document.querySelector('.style-option.selected')?.dataset.style || 'random',
    imageInterval: parseInt(document.getElementById('imageInterval').value) || 30,
    autoSwitchWallpaper: document.getElementById('autoSwitch').classList.contains('checked'),
    customWallpaperUrl: document.getElementById('customUrlInput').value.trim(),
    customWallpaperUrls: document.getElementById('multiUrlInput').value.trim(),
    customApiUrl: customApiUrl,
    localWallpaperPath: document.getElementById('localFileInfo').dataset.path || '',
    localFolderPath: document.getElementById('localFolderInfo').dataset.path || '',
    localVideoPath: document.getElementById('localVideoInfo')?.dataset.path || '',
    customVideoUrl: document.getElementById('customVideoUrlInput')?.value.trim() || '',
    enableVideoAudio: document.getElementById('enableVideoAudio')?.classList.contains('checked') || false,
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
  const localVideoInfo = document.getElementById('localVideoInfo');
  if (localVideoInfo) {
    localVideoInfo.textContent = '未选择视频';
    localVideoInfo.removeAttribute('data-path');
  }
  document.getElementById('customUrlInput').value = '';
  document.getElementById('multiUrlInput').value = '';
  const customApiInput = document.getElementById('customApiInput');
  if (customApiInput) customApiInput.value = '';
  const customVideoUrlInput = document.getElementById('customVideoUrlInput');
  if (customVideoUrlInput) customVideoUrlInput.value = '';
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

const CHANGELOG_FALLBACK = [
  {
    version: 'v1.0.8',
    date: '2026-07-09',
    items: [
      '【新增】自定义网络壁纸API、本地视频/URL视频（Beta）、视频声音开关、娱乐模式一键开关、开机自启动教程',
      '【优化】设置窗口固定大小、滚动条位置、跨平台标题栏（Windows/macOS/Linux）、macOS 系统菜单栏',
      '【调试】新增 --win/--macos/--linux 命令行参数',
      '【系统支持】1.0.8 已实现 Windows / macOS / Linux 三平台同步发布（NSIS+便携 / DMG x64+arm64 / AppImage+DEB）',
      '【macOS Gatekeeper】未配置 Apple 签名证书（年费 99 USD），首次打开需在「系统设置 → 隐私与安全性」点击「仍要打开」，或执行 xattr -dr com.apple.quarantine 命令',
      '【🛡️ 安全声明】100% 开源，无任何恶意行为：不收集隐私、不上传数据、无后门/广告/挖矿，源代码公开可审计（GitHub）',
      '【求助】开发者无 MacBook，macOS 菜单栏需要 Mac 用户协助测试',
      '【反馈】用户反馈了娱乐模式一键开关、滚动条上边距、Poftorix 边缘拖动诡异等多项改进'
    ]
  },
  {
    version: 'v1.0.1',
    date: '2026-07-09',
    items: [
      '切换网络壁纸API为 wp.upx8.com',
      '新增壁纸分类：动物、城市、宇宙、汽车、美女、运动',
      '更新分类图标和名称'
    ]
  },
  {
    version: 'v1.0.0',
    date: '2026-07-04',
    items: [
      '多种壁纸来源：网络壁纸、自定义URL、多张URL、本地单图、本地文件夹',
      '自动切换壁纸，可自定义切换间隔',
      '两种退出方式：仅手动关闭 / 任意动作退出',
      '实时时钟显示，可选位置和字体',
      '视觉特效：淡入淡出过渡效果',
      '娱乐模式：暂停屏保计时',
      '预览窗口：实时预览屏保效果',
      '深色主题界面'
    ]
  }
];

function parseChangelogMarkdown(md) {
  const lines = md.split(/\r?\n/);
  const entries = [];
  let current = null;
  let inItems = false;
  const itemRegex = /^[ \t]*[-*]\s+(.+)$/;
  const versionHeaderRegex = /^##\s+(v?\d+\.\d+\.\d+)\s*\(?(\d{4}-\d{2}-\d{2})?\)?/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('# ')) {
      continue;
    }

    const m = trimmed.match(versionHeaderRegex);
    if (m) {
      if (current) entries.push(current);
      current = { version: m[1], date: m[2] || '', items: [] };
      inItems = true;
      continue;
    }

    if (current && inItems) {
      if (trimmed === '' || trimmed.startsWith('### ')) {
        if (trimmed.startsWith('### ')) {
          continue;
        }
        continue;
      }
      const itemMatch = trimmed.match(itemRegex);
      if (itemMatch) {
        current.items.push(itemMatch[1].trim());
      }
    }
  }
  if (current) entries.push(current);
  return entries;
}

async function loadChangelog() {
  try {
    const result = await ipcRenderer.invoke('read-changelog');
    if (result && result.success && result.content) {
      const parsed = parseChangelogMarkdown(result.content);
      if (parsed.length > 0) return parsed;
    }
  } catch (e) {
    console.warn('加载 CHANGELOG.md 失败，使用内置数据:', e);
  }
  return CHANGELOG_FALLBACK;
}

function escapeHtml(s) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function showChangelog() {
  const content = document.getElementById('changelogContent');
  if (!content) return;
  content.innerHTML = '<div style="text-align:center; color: var(--text-muted); padding: 20px;">加载中...</div>';
  const modal = document.getElementById('changelogModal');
  if (modal) modal.classList.add('visible');

  loadChangelog().then(entries => {
    content.innerHTML = entries.map(entry => `
      <div class="changelog-entry">
        <div class="changelog-header">
          <span class="changelog-version">${escapeHtml(entry.version)}</span>
          <span class="changelog-date">${escapeHtml(entry.date || '')}</span>
        </div>
        <ul class="changelog-list">
          ${entry.items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
        </ul>
      </div>
    `).join('');
  });
}

function updateEntertainmentUI(isActive) {
  const btn = document.getElementById('btnEntertainmentMode');
  const btnText = document.getElementById('entertainmentBtnText');
  const status = document.getElementById('entertainmentStatus');
  if (isActive) {
    btn.classList.add('active');
    btnText.textContent = '关闭娱乐模式';
    status.style.display = 'flex';
  } else {
    btn.classList.remove('active');
    btnText.textContent = '开启娱乐模式';
    status.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();

  // 初始化娱乐模式状态
  try {
    const isEntertainment = ipcRenderer.sendSync('get-entertainment-mode');
    updateEntertainmentUI(isEntertainment);
  } catch (e) {}

  ipcRenderer.on('entertainment-mode-changed', (event, isEntertainment) => {
    updateEntertainmentUI(isEntertainment);
  });

  // 平台信息（macOS / Linux 自定义标题栏显示对应按钮）
  ipcRenderer.on('platform-info', (event, info) => {
    try {
      if (info && info.isMac) {
        document.body.classList.add('platform-mac');
      } else if (info && info.isLinux) {
        document.body.classList.add('platform-linux');
      }
    } catch (e) {}
  });
  
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

  // 双击标题栏图标最小化到托盘
  const titlebarIcon = document.getElementById('titlebarIcon');
  if (titlebarIcon) {
    let lastClickTime = 0;
    let clickCount = 0;
    titlebarIcon.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const now = Date.now();
      if (now - lastClickTime > 400) {
        clickCount = 0;
      }
      clickCount++;
      lastClickTime = now;
      if (clickCount >= 2) {
        clickCount = 0;
        try {
          ipcRenderer.send('window-hide');
        } catch (err) {}
      }
    });
  }
  
  document.getElementById('btnTitlebarClose').addEventListener('click', () => {
    try {
      ipcRenderer.send('window-hide');
    } catch (e) {}
  });

  // macOS 红绿灯按钮
  const macClose = document.getElementById('macClose');
  const macMinimize = document.getElementById('macMinimize');
  const macMaximize = document.getElementById('macMaximize');
  if (macClose) macClose.addEventListener('click', () => { try { ipcRenderer.send('window-hide'); } catch (e) {} });
  if (macMinimize) macMinimize.addEventListener('click', () => { try { ipcRenderer.send('window-minimize'); } catch (e) {} });
  if (macMaximize) macMaximize.addEventListener('click', () => { try { ipcRenderer.send('window-hide'); } catch (e) {} });

  // Linux 系统按钮
  const linuxClose = document.getElementById('linuxClose');
  const linuxMinimize = document.getElementById('linuxMinimize');
  const linuxMaximize = document.getElementById('linuxMaximize');
  if (linuxClose) linuxClose.addEventListener('click', () => { try { ipcRenderer.send('window-hide'); } catch (e) {} });
  if (linuxMinimize) linuxMinimize.addEventListener('click', () => { try { ipcRenderer.send('window-minimize'); } catch (e) {} });
  if (linuxMaximize) linuxMaximize.addEventListener('click', () => { try { ipcRenderer.send('window-hide'); } catch (e) {} });
  
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

  // 自定义API输入
  const customApiInput = document.getElementById('customApiInput');
  if (customApiInput) {
    customApiInput.addEventListener('input', () => {
      onSettingsChanged();
    });
  }

  // 自定义视频URL输入
  const customVideoUrlInput = document.getElementById('customVideoUrlInput');
  if (customVideoUrlInput) {
    customVideoUrlInput.addEventListener('input', () => {
      onSettingsChanged();
    });
  }

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

  // 选择本地视频
  const btnSelectLocalVideo = document.getElementById('btnSelectLocalVideo');
  if (btnSelectLocalVideo) {
    btnSelectLocalVideo.addEventListener('click', async () => {
      try {
        const filePath = await ipcRenderer.invoke('select-local-video');
        if (filePath) {
          const infoEl = document.getElementById('localVideoInfo');
          infoEl.textContent = filePath;
          infoEl.title = filePath;
          infoEl.dataset.path = filePath;
          onSettingsChanged();
        }
      } catch (e) {
        console.error('选择本地视频失败:', e);
      }
    });
  }

  // 自动切换壁纸开关
  document.getElementById('autoSwitchContainer').addEventListener('click', () => {
    document.getElementById('autoSwitch').classList.toggle('checked');
    updateAutoSwitchGroupState();
    onSettingsChanged();
  });

  // 视频声音开关
  const enableVideoAudioContainer = document.getElementById('enableVideoAudioContainer');
  if (enableVideoAudioContainer) {
    enableVideoAudioContainer.addEventListener('click', () => {
      document.getElementById('enableVideoAudio').classList.toggle('checked');
      onSettingsChanged();
    });
  }

  // 更新日志弹窗
  const btnChangelog = document.getElementById('btnChangelog');
  const changelogModal = document.getElementById('changelogModal');
  const btnChangelogClose = document.getElementById('btnChangelogClose');
  if (btnChangelog && changelogModal) {
    btnChangelog.addEventListener('click', (e) => {
      e.preventDefault();
      showChangelog();
    });
    if (btnChangelogClose) {
      btnChangelogClose.addEventListener('click', () => {
        changelogModal.classList.remove('visible');
      });
    }
    changelogModal.addEventListener('click', (e) => {
      if (e.target === changelogModal) {
        changelogModal.classList.remove('visible');
      }
    });
  }

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

  // 开机自启动教程按钮
  const autostartTutorialModal = document.getElementById('autostartTutorialModal');
  document.getElementById('btnAutostartTutorial').addEventListener('click', () => {
    autostartTutorialModal.classList.add('visible');
  });
  document.getElementById('btnAutostartTutorialClose').addEventListener('click', () => {
    autostartTutorialModal.classList.remove('visible');
  });
  autostartTutorialModal.addEventListener('click', (e) => {
    if (e.target === autostartTutorialModal) {
      autostartTutorialModal.classList.remove('visible');
    }
  });

  // 娱乐模式按钮
  document.getElementById('btnEntertainmentMode').addEventListener('click', () => {
    try {
      ipcRenderer.send('toggle-entertainment-mode');
    } catch (e) {
      console.error('切换娱乐模式失败:', e);
    }
  });

  ipcRenderer.on('preview-closed', () => {
    isPreviewOpen = false;
    updatePreviewButton();
  });
});
