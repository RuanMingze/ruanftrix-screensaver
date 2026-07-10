const electron = window.require ? window.require('electron') : require('electron');
const { ipcRenderer } = electron;

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
let clockTimer = null;
let localImageList = [];
let localImageIndex = 0;
let multiUrlList = [];
let multiUrlIndex = 0;
let videoElement = null;

function parseMultiUrls(text) {
  if (!text) return [];
  return text.split(',').map(s => s.trim()).filter(s => s.length > 0);
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

function preloadImage(url, callback) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => callback(null, img.src);
  img.onerror = () => callback(new Error('Failed to load image'), null);
  img.src = url;
}

function updateWallpaper() {
  const loadingIndicator = document.getElementById('loading-indicator');
  if (!loadingIndicator) return;

  if (isVideoSource()) {
    setupVideo();
    return;
  }

  stopVideo();

  loadingIndicator.classList.add('visible');

  const url = getNextWallpaperUrl();

  preloadImage(url, (error, src) => {
    if (error) {
      console.error('获取壁纸失败:', error);
      loadingIndicator.innerHTML = '<div class="spinner"></div><div class="loading-text">失败</div>';
      setTimeout(() => {
        loadingIndicator.classList.remove('visible');
      }, 2000);
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

function switchWallpaper() {
  if (isFixedSource()) return;
  stopImageRotation();
  updateWallpaper();
  setTimeout(() => {
    startImageRotation();
  }, 2000);
}

function startImageRotation() {
  stopImageRotation();

  if (!settings.autoSwitchWallpaper) {
    return;
  }

  if (isFixedSource()) {
    return;
  }

  const interval = Math.max(settings.imageInterval || 30, 10) * 1000;
  imageTimer = setInterval(() => {
    updateWallpaper();
  }, interval);
}

function stopImageRotation() {
  if (imageTimer) {
    clearInterval(imageTimer);
    imageTimer = null;
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
  const clockContainer = document.getElementById('clock-container');
  if (!clockContainer) return;
  
  if (!settings.showClock) {
    clockContainer.classList.remove('visible');
    return;
  }
  
  const position = settings.clockPosition || 'bottom-left';
  clockContainer.className = `pos-${position}`;
  clockContainer.classList.add('visible');
  
  const font = settings.clockFont || 'Comic Sans MS';
  const timeEl = document.getElementById('time');
  const dateEl = document.getElementById('date');
  if (timeEl) timeEl.style.fontFamily = `'${font}', cursive`;
  if (dateEl) dateEl.style.fontFamily = `'${font}', cursive`;
  
  updateClock();
  
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(updateClock, 1000);
}

function updateCloseButtonVisibility() {
  const switchBtn = document.getElementById('btnSwitch');
  const isActivity = settings.exitMode === 'activity';
  const fixed = isFixedSource();

  if (switchBtn) switchBtn.style.display = (isActivity || fixed) ? 'none' : 'flex';
}

async function applySettings(newSettings) {
  const sourceChanged = settings.wallpaperSource !== newSettings.wallpaperSource
    || settings.localFolderPath !== newSettings.localFolderPath
    || settings.customWallpaperUrls !== newSettings.customWallpaperUrls;

  settings = newSettings;

  if (sourceChanged && newSettings.wallpaperSource === 'folder') {
    localImageList = await scanLocalFolder();
    localImageIndex = Math.floor(Math.random() * Math.max(localImageList.length, 1));
    if (localImageList.length > 0) {
      localImageList = shuffleArray(localImageList);
    }
  }

  if (sourceChanged && newSettings.wallpaperSource === 'multiUrl') {
    multiUrlList = parseMultiUrls(newSettings.customWallpaperUrls);
    multiUrlIndex = Math.floor(Math.random() * Math.max(multiUrlList.length, 1));
    if (multiUrlList.length > 0) {
      multiUrlList = shuffleArray(multiUrlList);
    }
  }

  startClock();
  updateCloseButtonVisibility();

  stopImageRotation();
  updateWallpaper();
  setTimeout(() => {
    startImageRotation();
  }, 1500);
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

async function init() {
  videoElement = document.getElementById('videoPlayer');
  if (videoElement) {
    videoElement.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  try {
    settings = ipcRenderer.sendSync('get-settings');
  } catch (e) {
    settings = {
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
      clockPosition: 'bottom-left',
      clockFont: 'Comic Sans MS',
      exitMode: 'manual'
    };
  }

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

  startClock();
  updateCloseButtonVisibility();
  updateWallpaper();

  setTimeout(() => {
    startImageRotation();
  }, 1500);

  document.getElementById('btnClose').addEventListener('click', (e) => {
    e.stopPropagation();
    try {
      ipcRenderer.send('close-preview');
    } catch (e) {}
  });

  document.getElementById('btnSwitch').addEventListener('click', (e) => {
    e.stopPropagation();
    switchWallpaper();
  });

  ipcRenderer.on('preview-settings', (event, newSettings) => {
    applySettings(newSettings);
  });
}

document.addEventListener('DOMContentLoaded', init);
