const electron = window.require ? window.require('electron') : require('electron');
const { ipcRenderer } = electron;

// 用户原配置失败时的回退壁纸池（不会覆盖用户设置）
// 优先使用本地 assets/dw*.{png,jpg}（打包进应用，离线可用），
// 如果本地文件加载失败，再降级到在线 URL
const FALLBACK_WALLPAPER_LOCAL = [
  'assets/dw1.png',
  'assets/dw2.png',
  'assets/dw3.jpg',
  'assets/dw4.png'
];
const FALLBACK_WALLPAPER_ONLINE = [
  'https://luckycola.com.cn/public/imgs/luckycola_Imghub_forever_KXUAEbuJ17831741447088712.png',
  'https://luckycola.com.cn/public/imgs/luckycola_Imghub_forever_XDx1So5a17831741555375465.png',
  'https://luckycola.com.cn/public/imgs/luckycola_Imghub_forever_5Z1Q1XpG17752164264304110.jpg',
  'https://luckycola.com.cn/public/imgs/luckycola_Imghub_forever_cjIr5FKD17701864981356073.png'
];
let fallbackIndex = 0;
// 标记是否已处于回退模式：避免 1 秒后 startImageRotation 覆盖回退轮播
let isInFallbackMode = false;

const styleCategories = {
  random: '',
  landscape: 'nature',
  cartoon: 'anime',
  game: 'game',
  animal: 'animal',
  city: 'city',
  cool: 'abstract',
  space: 'space',
  car: 'car',
  girl: 'girl',
  sport: 'sport',
  '4k': ''
};

let settings = {};
let currentWallpaper = 1;
let imageTimer = null;
let progressTimer = null;
let clockTimer = null;
let lastMousePos = { x: 0, y: 0 };
let localImageList = [];
let localImageIndex = 0;
let multiUrlList = [];
let multiUrlIndex = 0;
let videoElement = null;
// 隐藏鼠标相关状态：仅在"任意动作退出"模式下可用
let isCursorHidden = false;

function parseMultiUrls(text) {
  if (!text) return [];
  return text.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

function loadSettings() {
  try {
    settings = ipcRenderer.sendSync('get-settings');
  } catch (e) {
    settings = {
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
  }
}

function getOnlineWallpaperUrl() {
  const category = styleCategories[settings.imageStyle] || '';
  let url = 'https://wp.upx8.com/api.php';
  if (category) {
    url += `?category=${category}`;
  } else if (settings.imageStyle === '4k') {
    url += '?resolution=3840x2160';
  } else {
    url += '?resolution=1920x1080';
  }
  url += `&t=${Date.now()}`;
  return url;
}

async function scanLocalFolder() {
  if (!settings.localFolderPath) return [];
  try {
    const images = await ipcRenderer.invoke('scan-folder-images', settings.localFolderPath);
    return images || [];
  } catch (e) {
    console.error('扫描本地文件夹失败:', e);
    return [];
  }
}

function getNextLocalImage() {
  if (localImageList.length === 0) return null;
  if (localImageList.length === 1) return localImageList[0];
  localImageIndex = (localImageIndex + 1) % localImageList.length;
  return localImageList[localImageIndex];
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function preloadImage(url, callback) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => callback(null, img.src);
  img.onerror = () => callback(new Error('Failed to load image'), null);
  img.src = url;
}

function getNextWallpaperUrl() {
  const source = settings.wallpaperSource || 'online';

  if (source === 'url' && settings.customWallpaperUrl) {
    return settings.customWallpaperUrl;
  }

  if (source === 'customApi' && settings.customApiUrl) {
    let url = settings.customApiUrl;
    if (!url.includes('?')) {
      url += '?t=' + Date.now();
    } else {
      url += '&t=' + Date.now();
    }
    return url;
  }

  if (source === 'multiUrl') {
    if (multiUrlList.length === 0) return getOnlineWallpaperUrl();
    if (multiUrlList.length === 1) return multiUrlList[0];
    multiUrlIndex = (multiUrlIndex + 1) % multiUrlList.length;
    return multiUrlList[multiUrlIndex];
  }

  if (source === 'local' && settings.localWallpaperPath) {
    return 'file:///' + settings.localWallpaperPath.replace(/\\/g, '/');
  }

  if (source === 'folder') {
    const img = getNextLocalImage();
    if (img) return 'file:///' + img.replace(/\\/g, '/');
  }

  return getOnlineWallpaperUrl();
}

function isFixedSource() {
  const source = settings.wallpaperSource || 'online';
  if (source === 'url') return true;
  if (source === 'local') return true;
  if (source === 'video') return true;
  if (source === 'videoUrl') return true;
  if (source === 'multiUrl' && multiUrlList.length <= 1) return true;
  if (source === 'folder' && localImageList.length <= 1) return true;
  return false;
}

function isVideoSource() {
  const source = settings.wallpaperSource || 'online';
  return source === 'video' || source === 'videoUrl';
}

function setupVideo() {
  if (!videoElement) return;
  const source = settings.wallpaperSource;
  if (source !== 'video' && source !== 'videoUrl') {
    stopVideo();
    return;
  }

  let videoUrl = '';
  if (source === 'video') {
    if (!settings.localVideoPath) {
      stopVideo();
      return;
    }
    videoUrl = 'file:///' + settings.localVideoPath.replace(/\\/g, '/');
  } else if (source === 'videoUrl') {
    if (!settings.customVideoUrl) {
      stopVideo();
      return;
    }
    videoUrl = settings.customVideoUrl;
  }

  if (videoElement.dataset.src === videoUrl) {
    return;
  }

  videoElement.dataset.src = videoUrl;
  videoElement.src = videoUrl;

  videoElement.loop = true;
  videoElement.muted = settings.enableVideoAudio !== true;
  videoElement.volume = 1;
  videoElement.controls = false;
  videoElement.disablePictureInPicture = true;
  videoElement.setAttribute('controlsList', 'nodownload nofullscreen noremoteplayback');

  const playPromise = videoElement.play();
  if (playPromise && typeof playPromise.catch === 'function') {
    playPromise.catch(() => {});
  }

  hideWallpaperLayers();
  videoElement.classList.add('active');
  const loadingIndicator = document.getElementById('loading-indicator');
  if (loadingIndicator) loadingIndicator.classList.remove('visible');
}

function stopVideo() {
  if (!videoElement) return;
  try {
    videoElement.pause();
  } catch (e) {}
  videoElement.removeAttribute('src');
  videoElement.load();
  videoElement.dataset.src = '';
  videoElement.classList.remove('active');
}

function hideWallpaperLayers() {
  const wp1 = document.getElementById('wallpaper1');
  const wp2 = document.getElementById('wallpaper2');
  if (wp1) {
    wp1.classList.remove('active');
    wp1.style.backgroundImage = '';
  }
  if (wp2) {
    wp2.classList.remove('active');
    wp2.style.backgroundImage = '';
  }
}

function updateWallpaper() {
  const loadingIndicator = document.getElementById('loading-indicator');
  if (!loadingIndicator) return;

  if (isVideoSource()) {
    setupVideo();
    return;
  }

  stopVideo();

  // 根据用户设置决定是否显示加载提示（避免旋转图标在切图瞬间显得突兀）
  if (settings.showLoadingIndicator !== false) {
    loadingIndicator.classList.add('visible');
  }

  const url = getNextWallpaperUrl();

  preloadImage(url, (error, src) => {
    if (error) {
      console.error('获取壁纸失败:', error, '→ 尝试回退到默认壁纸');
      loadingIndicator.classList.remove('visible');
      // 标记进入回退模式（避免 1 秒后 startImageRotation 覆盖回退轮播）
      isInFallbackMode = true;
      // 停止用户原始轮播
      stopImageRotation();
      // 弹出左下角提示（不覆盖用户设置）
      showToast('壁纸加载失败，使用默认壁纸');
      // 改用回退 URL 池
      tryFallbackWallpaper();
      return;
    }

    const nextWallpaper = currentWallpaper === 1 ? 2 : 1;
    const currentEl = document.getElementById(`wallpaper${currentWallpaper}`);
    const nextEl = document.getElementById(`wallpaper${nextWallpaper}`);

    if (!currentEl || !nextEl) return;

    nextEl.style.backgroundImage = `url(${src})`;
    nextEl.classList.remove('loading');

    setTimeout(() => {
      currentEl.classList.remove('active');
      nextEl.classList.add('active');
      currentWallpaper = nextWallpaper;

      setTimeout(() => {
        currentEl.style.backgroundImage = '';
        currentEl.classList.add('loading');
        loadingIndicator.classList.remove('visible');
      }, 1000);
    }, 100);
  });
}

function tryFallbackWallpaper() {
  // 优先尝试本地资源（离线可用），全部失败再降级到在线 URL
  tryFallbackFromList(FALLBACK_WALLPAPER_LOCAL, 0, () => {
    showToast('本地默认壁纸加载失败，尝试在线资源');
    // 重置索引，从在线池开始
    fallbackIndex = 0;
    tryFallbackFromList(FALLBACK_WALLPAPER_ONLINE, 0, () => {
      showToast('所有默认壁纸加载失败，请检查网络');
    });
  });
}

function tryFallbackFromList(list, startIndex, onAllFailed) {
  const fallbackUrl = list[startIndex % list.length];
  preloadImage(fallbackUrl, (err, src) => {
    if (err) {
      console.error('回退壁纸加载失败:', fallbackUrl, err);
      const nextIndex = startIndex + 1;
      if (nextIndex < list.length) {
        tryFallbackFromList(list, nextIndex, onAllFailed);
      } else {
        // 整个池子都失败
        if (onAllFailed) onAllFailed();
      }
      return;
    }
    // 成功加载
    const nextWallpaper = currentWallpaper === 1 ? 2 : 1;
    const currentEl = document.getElementById(`wallpaper${currentWallpaper}`);
    const nextEl = document.getElementById(`wallpaper${nextWallpaper}`);
    if (!currentEl || !nextEl) return;
    nextEl.style.backgroundImage = `url(${src})`;
    nextEl.classList.remove('loading');
    setTimeout(() => {
      currentEl.classList.remove('active');
      nextEl.classList.add('active');
      currentWallpaper = nextWallpaper;
      setTimeout(() => {
        currentEl.style.backgroundImage = '';
        currentEl.classList.add('loading');
      }, 1000);
    }, 100);
    // 记录当前使用的池（用于轮播）
    currentFallbackList = list;
    // 进入回退模式：强制启动回退池内部轮播（不依赖用户设置，也不影响用户原设置）
    startFallbackRotation();
  });
}

let fallbackTimer = null;
let currentFallbackList = null; // 当前正在使用的回退池（local / online）
function startFallbackRotation() {
  // 先停止任何已存在的轮播（包括用户的 autoSwitch 轮播）
  if (imageTimer) {
    clearInterval(imageTimer);
    imageTimer = null;
  }
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
  }
  if (!currentFallbackList) currentFallbackList = FALLBACK_WALLPAPER_LOCAL;
  const interval = Math.max(5, (settings.imageInterval || 30)) * 1000;
  fallbackTimer = setInterval(() => {
    fallbackIndex = (fallbackIndex + 1) % currentFallbackList.length;
    const url = currentFallbackList[fallbackIndex];
    preloadImage(url, (err, src) => {
      if (err) {
        console.error('回退轮播跳过:', url, err);
        return;
      }
      const nextWallpaper = currentWallpaper === 1 ? 2 : 1;
      const currentEl = document.getElementById(`wallpaper${currentWallpaper}`);
      const nextEl = document.getElementById(`wallpaper${nextWallpaper}`);
      if (!currentEl || !nextEl) return;
      nextEl.style.backgroundImage = `url(${src})`;
      nextEl.classList.remove('loading');
      setTimeout(() => {
        currentEl.classList.remove('active');
        nextEl.classList.add('active');
        currentWallpaper = nextWallpaper;
        setTimeout(() => {
          currentEl.style.backgroundImage = '';
          currentEl.classList.add('loading');
        }, 1000);
      }, 100);
    });
  }, interval);
  // 启动进度条
  startProgressBar();
}

function stopFallbackRotation() {
  if (fallbackTimer) {
    clearInterval(fallbackTimer);
    fallbackTimer = null;
  }
}

let toastTimer = null;
function showToast(text) {
  const toast = document.getElementById('toast-notification');
  if (!toast) return;
  const textEl = toast.querySelector('.toast-text');
  if (textEl) textEl.textContent = text;
  toast.classList.add('visible');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('visible');
  }, 5000);
}

function switchWallpaper() {
  if (isFixedSource()) return;
  stopImageRotation();
  stopFallbackRotation();
  isInFallbackMode = false;
  updateWallpaper();
  setTimeout(() => {
    if (isInFallbackMode) return;  // 如果回退也失败了，不要启动用户轮播
    startImageRotation();
  }, 2000);
}

function startImageRotation() {
  // 如果已处于回退模式，不要启动用户原始轮播
  if (isInFallbackMode) return;
  stopImageRotation();
  // 用户原始壁纸恢复轮播时，停止回退池轮播
  stopFallbackRotation();

  if (!settings.autoSwitchWallpaper) {
    return;
  }

  if (isFixedSource()) {
    return;
  }

  imageTimer = setInterval(() => {
    updateWallpaper();
  }, settings.imageInterval * 1000);

  startProgressBar();
}

function stopImageRotation() {
  if (imageTimer) {
    clearInterval(imageTimer);
    imageTimer = null;
  }
  stopProgressBar();
}

function startProgressBar() {
  stopProgressBar();
  
  const progressBar = document.getElementById('progress-bar');
  if (!progressBar) return;
  
  const interval = 100;
  const totalTime = settings.imageInterval * 1000;
  let elapsed = 0;
  
  progressTimer = setInterval(() => {
    elapsed += interval;
    const percentage = (elapsed / totalTime) * 100;
    progressBar.style.width = `${Math.min(percentage, 100)}%`;
    
    if (elapsed >= totalTime) {
      elapsed = 0;
    }
  }, interval);
}

function stopProgressBar() {
  if (progressTimer) {
    clearInterval(progressTimer);
    progressTimer = null;
  }
}

function updateClock() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  
  let timeStr;
  if (settings.showSeconds) {
    const seconds = String(now.getSeconds()).padStart(2, '0');
    timeStr = `${hours}:${minutes}:${seconds}`;
  } else {
    timeStr = `${hours}:${minutes}`;
  }
  
  const timeEl = document.getElementById('time');
  if (timeEl) timeEl.textContent = timeStr;
  
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const day = now.getDate();
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = weekdays[now.getDay()];
  
  const dateStr = `${year}年${month}月${day}日 ${weekday}`;
  const dateEl = document.getElementById('date');
  if (dateEl) dateEl.textContent = dateStr;
}

function startClock() {
  if (!settings.showClock) return;
  
  const clockContainer = document.getElementById('clock-container');
  if (!clockContainer) return;
  
  const position = settings.clockPosition || 'bottom-left';
  clockContainer.className = `pos-${position}`;
  clockContainer.classList.add('visible');
  
  const font = settings.clockFont || 'Comic Sans MS';
  const timeEl = document.getElementById('time');
  const dateEl = document.getElementById('date');
  if (timeEl) timeEl.style.fontFamily = `'${font}', cursive`;
  if (dateEl) dateEl.style.fontFamily = `'${font}', cursive`;
  
  updateClock();
  
  clockTimer = setInterval(updateClock, 1000);
}

function stopClock() {
  if (clockTimer) {
    clearInterval(clockTimer);
    clockTimer = null;
  }
  
  const clockContainer = document.getElementById('clock-container');
  if (clockContainer) clockContainer.classList.remove('visible');
}

function updateButtonVisibility() {
  const closeBtn = document.getElementById('btnClose');
  const switchBtn = document.getElementById('btnSwitch');
  const isActivity = settings.exitMode === 'activity';
  const fixed = isFixedSource();

  if (closeBtn) closeBtn.style.display = isActivity ? 'none' : 'flex';
  if (switchBtn) switchBtn.style.display = (isActivity || fixed) ? 'none' : 'flex';
}

// 根据设置初始化鼠标隐藏状态：仅在"任意动作退出"模式 + 开启隐藏鼠标开关时生效
function applyHideCursorSetting() {
  isCursorHidden = settings.exitMode === 'activity' && settings.hideCursor === true;
  if (isCursorHidden) {
    document.body.classList.add('cursor-hidden');
  } else {
    document.body.classList.remove('cursor-hidden');
  }
}

function exitScreensaver() {
  stopImageRotation();
  stopClock();
  stopVideo();
  try {
    ipcRenderer.send('stop-screensaver');
  } catch (e) {
    console.error('Failed to stop screensaver:', e);
  }
}

function handleActivity() {
  if (settings.exitMode === 'activity') {
    exitScreensaver();
  }
}

function handleKeydown(e) {
  // 屏保快捷键：Esc 退出，C 退出屏保，S 切换壁纸
  // 提示：用户不会在屏保页面上看到快捷键说明，需要在设置页告知
  if (e.key === 'Escape' || e.key === 'c' || e.key === 'C') {
    e.preventDefault();
    exitScreensaver();
    return;
  }
  if (e.key === 's' || e.key === 'S') {
    e.preventDefault();
    switchWallpaper();
    return;
  }
  handleActivity();
}

function handleMouseMove(e) {
  if (settings.exitMode !== 'activity') return;

  const dx = Math.abs(e.clientX - lastMousePos.x);
  const dy = Math.abs(e.clientY - lastMousePos.y);

  if (dx > 50 || dy > 50) {
    exitScreensaver();
    return;
  }

  lastMousePos = { x: e.clientX, y: e.clientY };
}

async function init() {
  loadSettings();
  videoElement = document.getElementById('videoPlayer');
  if (videoElement) {
    videoElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  applyHideCursorSetting();
  updateButtonVisibility();

  if (settings.wallpaperSource === 'folder') {
    localImageList = await scanLocalFolder();
    localImageIndex = Math.floor(Math.random() * Math.max(localImageList.length, 1));
    if (localImageList.length > 0) {
      localImageList = shuffleArray(localImageList);
    }
  }

  if (settings.wallpaperSource === 'multiUrl') {
    multiUrlList = parseMultiUrls(settings.customWallpaperUrls);
    multiUrlIndex = Math.floor(Math.random() * Math.max(multiUrlList.length, 1));
    if (multiUrlList.length > 0) {
      multiUrlList = shuffleArray(multiUrlList);
    }
  }

  updateWallpaper();

  setTimeout(() => {
    // 如果已处于回退模式，不要启动用户原始轮播（避免覆盖回退轮播）
    if (isInFallbackMode) {
      startClock();
      return;
    }
    startImageRotation();
    startClock();
  }, 1000);

  document.getElementById('btnClose').addEventListener('click', (e) => {
    e.stopPropagation();
    exitScreensaver();
  });

  document.getElementById('btnSwitch').addEventListener('click', (e) => {
    e.stopPropagation();
    switchWallpaper();
  });

  if (settings.exitMode === 'activity') {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleActivity);
  }
  document.addEventListener('keydown', handleKeydown);

  try {
    ipcRenderer.send('user-activity');
  } catch (e) {}
}

document.addEventListener('DOMContentLoaded', init);
