// Configuration
const API_BASE = 'http://localhost:8000'; // Update for production
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

const AUDIO_QUALITIES = [
  { value: '320kbps', label: '320 kbps (Best)' },
  { value: '256kbps', label: '256 kbps (High)' },
  { value: '192kbps', label: '192 kbps (Good)' },
  { value: '128kbps', label: '128 kbps (Standard)' }
];

const VIDEO_QUALITIES = [
  { value: '2160p', label: '4K (2160p)' },
  { value: '1440p', label: '1440p (2K)' },
  { value: '1080p', label: '1080p (Full HD)' },
  { value: '720p', label: '720p (HD)' },
  { value: '480p', label: '480p (SD)' },
  { value: '360p', label: '360p (Low)' }
];

// State
let state = {
  videoId: null,
  videoTitle: '',
  channelName: '',
  duration: '',
  thumbnail: '',
  format: 'mp3',
  quality: '320kbps',
  remainingDownloads: 5,
  isDownloading: false
};

// DOM Elements
const elements = {
  videoLoading: document.getElementById('videoLoading'),
  videoDetails: document.getElementById('videoDetails'),
  videoError: document.getElementById('videoError'),
  videoTitle: document.getElementById('videoTitle'),
  videoChannel: document.getElementById('videoChannel'),
  videoThumbnail: document.getElementById('videoThumbnail'),
  formatSection: document.getElementById('formatSection'),
  qualitySection: document.getElementById('qualitySection'),
  downloadSection: document.getElementById('downloadSection'),
  progressSection: document.getElementById('progressSection'),
  limitWarning: document.getElementById('limitWarning'),
  btnMp3: document.getElementById('btnMp3'),
  btnMp4: document.getElementById('btnMp4'),
  qualitySelect: document.getElementById('qualitySelect'),
  downloadBtn: document.getElementById('downloadBtn'),
  progressFill: document.getElementById('progressFill'),
  progressText: document.getElementById('progressText'),
  quotaCount: document.getElementById('quotaCount'),
  resetTime: document.getElementById('resetTime')
};

// Initialize
document.addEventListener('DOMContentLoaded', init);

async function init() {
  await loadQuota();
  await detectVideo();
  setupEventListeners();
}

// Load remaining quota from storage
async function loadQuota() {
  const data = await chrome.storage.local.get(['quota', 'quotaResetAt']);
  const now = Date.now();

  if (data.quotaResetAt && now > data.quotaResetAt) {
    // Reset quota
    await chrome.storage.local.set({
      quota: 5,
      quotaResetAt: now + 24 * 60 * 60 * 1000
    });
    state.remainingDownloads = 5;
  } else {
    state.remainingDownloads = data.quota ?? 5;
  }

  updateQuotaDisplay();
}

function updateQuotaDisplay() {
  elements.quotaCount.textContent = state.remainingDownloads;

  if (state.remainingDownloads <= 0) {
    showLimitWarning();
  }
}

// Detect current YouTube video
async function detectVideo() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.url?.includes('youtube.com/watch')) {
      showError();
      return;
    }

    // Extract video ID from URL
    const url = new URL(tab.url);
    const videoId = url.searchParams.get('v');

    if (!videoId) {
      showError();
      return;
    }

    state.videoId = videoId;

    // Get video info from content script
    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getVideoInfo' });

    if (response?.success) {
      state.videoTitle = response.title || 'Unknown Title';
      state.channelName = response.channel || 'Unknown Channel';
      state.duration = response.duration || '';
      state.thumbnail = response.thumbnail || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;

      showVideoDetails();
    } else {
      // Fallback: use basic info
      state.videoTitle = tab.title?.replace(' - YouTube', '') || 'YouTube Video';
      state.thumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
      showVideoDetails();
    }
  } catch (err) {
    console.error('Error detecting video:', err);
    showError();
  }
}

function showVideoDetails() {
  elements.videoLoading.classList.add('hidden');
  elements.videoError.classList.add('hidden');
  elements.videoDetails.classList.remove('hidden');

  elements.videoTitle.textContent = state.videoTitle;
  elements.videoChannel.textContent = state.channelName + (state.duration ? ` • ${state.duration}` : '');
  elements.videoThumbnail.style.backgroundImage = `url(${state.thumbnail})`;

  // Show controls
  elements.formatSection.classList.remove('hidden');
  elements.qualitySection.classList.remove('hidden');
  elements.downloadSection.classList.remove('hidden');

  updateQualityOptions();
}

function showError() {
  elements.videoLoading.classList.add('hidden');
  elements.videoDetails.classList.add('hidden');
  elements.videoError.classList.remove('hidden');
}

function showLimitWarning() {
  elements.formatSection.classList.add('hidden');
  elements.qualitySection.classList.add('hidden');
  elements.downloadSection.classList.add('hidden');
  elements.limitWarning.classList.remove('hidden');

  // Calculate reset time
  chrome.storage.local.get(['quotaResetAt'], (data) => {
    if (data.quotaResetAt) {
      const hoursLeft = Math.ceil((data.quotaResetAt - Date.now()) / (1000 * 60 * 60));
      elements.resetTime.textContent = `${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''}`;
    }
  });
}

// Event listeners
function setupEventListeners() {
  elements.btnMp3.addEventListener('click', () => selectFormat('mp3'));
  elements.btnMp4.addEventListener('click', () => selectFormat('mp4'));
  elements.qualitySelect.addEventListener('change', (e) => {
    state.quality = e.target.value;
  });
  elements.downloadBtn.addEventListener('click', startDownload);
}

function selectFormat(format) {
  state.format = format;

  // Update button states
  elements.btnMp3.classList.toggle('active', format === 'mp3');
  elements.btnMp4.classList.toggle('active', format === 'mp4');

  updateQualityOptions();
}

function updateQualityOptions() {
  const qualities = state.format === 'mp3' ? AUDIO_QUALITIES : VIDEO_QUALITIES;

  elements.qualitySelect.innerHTML = qualities
    .map(q => `<option value="${q.value}">${q.label}</option>`)
    .join('');

  state.quality = qualities[0].value;
}

// Download flow
async function startDownload() {
  if (state.isDownloading || state.remainingDownloads <= 0) return;

  state.isDownloading = true;
  elements.downloadBtn.disabled = true;

  // Show progress
  elements.downloadSection.classList.add('hidden');
  elements.progressSection.classList.remove('hidden');

  try {
    updateProgress(10, 'Connecting to server...');

    // Request download from background script
    const response = await chrome.runtime.sendMessage({
      action: 'download',
      videoId: state.videoId,
      format: state.format,
      quality: state.quality,
      title: state.videoTitle
    });

    if (response.success) {
      updateProgress(100, 'Download started!');

      // Decrease quota
      state.remainingDownloads--;
      await chrome.storage.local.set({ quota: state.remainingDownloads });
      updateQuotaDisplay();

      // Track analytics
      trackDownload();

      setTimeout(() => {
        resetUI();
      }, 1500);
    } else {
      throw new Error(response.error || 'Download failed');
    }
  } catch (err) {
    console.error('Download error:', err);
    updateProgress(0, `Error: ${err.message}`);
    setTimeout(resetUI, 2000);
  }
}

function updateProgress(percent, text) {
  elements.progressFill.style.width = `${percent}%`;
  elements.progressText.textContent = text;
}

function resetUI() {
  state.isDownloading = false;
  elements.downloadBtn.disabled = false;
  elements.progressSection.classList.add('hidden');
  elements.downloadSection.classList.remove('hidden');
  elements.progressFill.style.width = '0%';

  if (state.remainingDownloads <= 0) {
    showLimitWarning();
  }
}

// Analytics tracking
async function trackDownload() {
  try {
    const fingerprint = await getFingerprint();

    await fetch(`${API_BASE}/api/track`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fingerprint,
        videoId: state.videoId,
        videoTitle: state.videoTitle,
        format: state.format,
        quality: state.quality
      })
    });
  } catch (err) {
    console.warn('Analytics tracking failed:', err);
  }
}

// Simple browser fingerprint
async function getFingerprint() {
  const data = await chrome.storage.local.get(['fingerprint']);

  if (data.fingerprint) return data.fingerprint;

  // Generate simple fingerprint
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  ctx.textBaseline = 'top';
  ctx.font = '14px Arial';
  ctx.fillText('fingerprint', 2, 2);

  const fingerprint = canvas.toDataURL().slice(-32) + Date.now().toString(36);
  await chrome.storage.local.set({ fingerprint });

  return fingerprint;
}
