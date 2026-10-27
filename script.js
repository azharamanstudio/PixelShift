// DOM Elements
const uploadSection = document.getElementById('upload-section');
const heroHeader = document.getElementById('hero-header');
const workspaceSection = document.getElementById('workspace-section');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const samplePngBtn = document.getElementById('sample-png-btn');
const sampleJpgBtn = document.getElementById('sample-jpg-btn');
const sampleWebpBtn = document.getElementById('sample-webp-btn');
const closeWorkspaceBtn = document.getElementById('close-workspace-btn');
const brandHome = document.getElementById('brand-home');

// Stage & Split Slider Elements
const comparisonStage = document.getElementById('comparison-stage');
const imgConverted = document.getElementById('img-converted');
const imgOriginal = document.getElementById('img-original');
const originalOverlay = document.getElementById('original-overlay');
const splitHandle = document.getElementById('split-handle');
const badgeOriginal = document.getElementById('badge-original');
const badgeConverted = document.getElementById('badge-converted');
const modeBtns = document.querySelectorAll('.mode-btn');

// Telemetry Elements
const metricOrig = document.getElementById('metric-orig');
const metricOrigDim = document.getElementById('metric-orig-dim');
const metricConv = document.getElementById('metric-conv');
const metricConvDim = document.getElementById('metric-conv-dim');
const savingsPill = document.getElementById('savings-pill');

// Controls
const autoDetectBadge = document.getElementById('auto-detect-badge');
const btnToJpg = document.getElementById('btn-to-jpg');
const btnToPng = document.getElementById('btn-to-png');
const btnToWebp = document.getElementById('btn-to-webp');
const jpgOptionsGroup = document.getElementById('jpg-options-group');
const pngOptionsGroup = document.getElementById('png-options-group');
const webpOptionsGroup = document.getElementById('webp-options-group');
const matteHelperText = document.getElementById('matte-helper-text');
const qualityRange = document.getElementById('quality-range');
const qualityReadout = document.getElementById('quality-readout');
const swatches = document.querySelectorAll('.swatch');
const swatchTransparent = document.getElementById('swatch-transparent');
const customColorPicker = document.getElementById('custom-color-picker');
const hexReadout = document.getElementById('hex-readout');
const scaleBtns = document.querySelectorAll('.scale-btn');
const scaleReadout = document.getElementById('scale-readout');
const outputFilename = document.getElementById('output-filename');
const outputExt = document.getElementById('output-ext');
const downloadCta = document.getElementById('download-cta');

// History
const historySection = document.getElementById('history-section');
const historyList = document.getElementById('history-list');
const clearHistoryBtn = document.getElementById('clear-history-btn');

const EMPTY_PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

// Track Blob URLs used in session history so they aren't prematurely revoked
const historyUrls = new Set();

// State
let state = {
  imageElement: null,
  origUrl: '',
  origSize: 0,
  origFormat: '',
  convUrl: '',
  previewUrl: '',
  convSize: 0,
  convFormat: 'image/jpeg',
  targetFormat: 'image/jpeg',
  quality: 0.9,
  matteColor: '#ffffff',
  lastSolidMatte: '#ffffff',
  scale: 1,
  viewMode: 'split',
  splitPos: 50,
  isDraggingSplit: false,
  loadId: 0,
  renderId: 0
};

// Safe URL Revocation (preserves URLs referenced in session history)
function safeRevokeUrl(url) {
  if (url && !historyUrls.has(url)) {
    URL.revokeObjectURL(url);
  }
}

// Sanitize Output Filename & Avoid Double Extensions
function getSanitizedFilename(ext) {
  let raw = outputFilename.value.trim() || 'converted';
  // Strip illegal filesystem characters
  raw = raw.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-');
  // Strip redundant trailing extension if user typed it manually
  raw = raw.replace(/\.(jpe?g|png|webp)$/i, '');
  // Trim leading/trailing dots and spaces
  raw = raw.replace(/^[.\s]+|[.\s]+$/g, '');
  return `${raw || 'converted'}.${ext}`;
}

// Format Extension Helper
function getFormatExt(fmt) {
  if (fmt === 'image/jpeg') return 'jpg';
  if (fmt === 'image/webp') return 'webp';
  return 'png';
}

// Format File Size Utility
function formatBytes(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Drag & Drop Events
dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));

dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    processFile(e.dataTransfer.files[0]);
  }
});

fileInput.addEventListener('change', (e) => {
  if (e.target.files && e.target.files[0]) {
    processFile(e.target.files[0]);
    // Reset input value so selecting the same file again triggers 'change'
    fileInput.value = '';
  }
});

// Process Input File
function processFile(file) {
  const isPng = file.type === 'image/png' || file.name.toLowerCase().endsWith('.png');
  const isJpg = file.type === 'image/jpeg' || /\.(jpe?g)$/i.test(file.name);
  const isWebp = file.type === 'image/webp' || file.name.toLowerCase().endsWith('.webp');

  if (!isPng && !isJpg && !isWebp) {
    alert('Unsupported file! Please upload a PNG, JPG, or WEBP file.');
    return;
  }

  if (file.size > 50 * 1024 * 1024) {
    alert('File is too large! Please upload an image up to 50MB.');
    return;
  }

  const currentLoadId = ++state.loadId;
  const nextOrigUrl = URL.createObjectURL(file);
  const img = new Image();

  img.onload = () => {
    if (currentLoadId !== state.loadId) {
      URL.revokeObjectURL(nextOrigUrl);
      return;
    }

    safeRevokeUrl(state.origUrl);
    safeRevokeUrl(state.convUrl);
    state.origUrl = nextOrigUrl;
    state.convUrl = '';
    state.previewUrl = '';
    state.convSize = 0;
    state.origSize = file.size;
    state.origFormat = isPng ? 'PNG' : isWebp ? 'WEBP' : 'JPG';
    state.imageElement = img;
    downloadCta.removeAttribute('href');

    const cleanBase = file.name.replace(/\.[^/.]+$/, '');
    outputFilename.value = `${cleanBase || 'image'}-pixelshift`;

    // Auto-select target format
    const autoTarget = isPng ? 'image/jpeg' : 'image/png';
    selectFormat(autoTarget, false, true);

    imgOriginal.src = state.origUrl;
    imgConverted.src = state.origUrl;

    uploadSection.classList.add('hidden');
    heroHeader.classList.add('hidden');
    workspaceSection.classList.remove('hidden');

    renderConversion();
  };

  img.onerror = () => {
    URL.revokeObjectURL(nextOrigUrl);
    if (currentLoadId !== state.loadId) return;
    alert('Failed to load the selected image file. Please ensure it is a valid PNG, JPG, or WEBP image.');
  };

  img.src = nextOrigUrl;
}

// Core Canvas Conversion Engine
function renderConversion() {
  if (!state.imageElement) return;

  const currentRenderId = ++state.renderId;
  const targetFmt = state.targetFormat;
  const origW = state.imageElement.naturalWidth || state.imageElement.width || 800;
  const origH = state.imageElement.naturalHeight || state.imageElement.height || 600;
  const targetW = Math.max(1, Math.round(origW * state.scale));
  const targetH = Math.max(1, Math.round(origH * state.scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');

  // Fill background matte color if converting to JPG, or to WEBP with a solid matte selected
  if (
    targetFmt === 'image/jpeg' ||
    (targetFmt === 'image/webp' && state.matteColor !== 'transparent')
  ) {
    ctx.fillStyle = state.matteColor === 'transparent' ? '#ffffff' : state.matteColor;
    ctx.fillRect(0, 0, targetW, targetH);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.imageElement, 0, 0, targetW, targetH);

  const qualityArg =
    targetFmt === 'image/jpeg' || targetFmt === 'image/webp'
      ? state.quality
      : undefined;

  canvas.toBlob(
    (blob) => {
      if (currentRenderId !== state.renderId || !blob) return;
      safeRevokeUrl(state.convUrl);

      state.convUrl = URL.createObjectURL(blob);
      state.previewUrl = state.convUrl;
      state.convSize = blob.size;
      state.convFormat = targetFmt;
      imgConverted.src = state.previewUrl;

      updateStudioMetrics(targetW, targetH, targetFmt);
    },
    targetFmt,
    qualityArg
  );
}

// Update Telemetry & Download Link
function updateStudioMetrics(w, h, fmt = state.targetFormat) {
  const ext = getFormatExt(fmt);
  const targetLabel = ext.toUpperCase();
  const origW = state.imageElement.naturalWidth || state.imageElement.width || w;
  const origH = state.imageElement.naturalHeight || state.imageElement.height || h;

  metricOrig.textContent = `${state.origFormat} • ${formatBytes(state.origSize)}`;
  metricOrigDim.textContent = `${origW} × ${origH} px`;

  metricConv.textContent = `${targetLabel} • ${formatBytes(state.convSize)}`;
  metricConvDim.textContent = `${w} × ${h} px`;

  const delta = state.convSize - state.origSize;
  const pct = state.origSize > 0 ? Math.round((Math.abs(delta) / state.origSize) * 100) : 0;

  if (delta < 0) {
    savingsPill.textContent = `↓ ${pct}% Smaller (${formatBytes(Math.abs(delta))} saved)`;
    savingsPill.style.background = 'rgba(16, 185, 129, 0.16)';
    savingsPill.style.color = '#34d399';
  } else if (delta === 0) {
    savingsPill.textContent = '0% No Size Change';
    savingsPill.style.background = 'rgba(148, 163, 184, 0.16)';
    savingsPill.style.color = '#cbd5e1';
  } else {
    savingsPill.textContent = `↑ ${pct}% Larger (+${formatBytes(delta)})`;
    savingsPill.style.background = 'rgba(245, 158, 11, 0.16)';
    savingsPill.style.color = '#fbbf24';
  }

  outputExt.textContent = `.${ext}`;
  const finalName = getSanitizedFilename(ext);
  downloadCta.href = state.convUrl;
  downloadCta.download = finalName;
}

// Sync active swatch highlight with current state.matteColor
function syncSwatchHighlight() {
  swatches.forEach((s) => {
    s.classList.toggle('active', s.dataset.color.toLowerCase() === state.matteColor.toLowerCase());
  });
  if (state.matteColor === 'transparent') {
    hexReadout.textContent = 'ALPHA';
  } else {
    hexReadout.textContent = state.matteColor.toUpperCase();
    customColorPicker.value = state.matteColor;
  }
}

// Format Selection
function selectFormat(fmt, reRender = true, isAuto = false) {
  state.targetFormat = fmt;
  btnToJpg.classList.toggle('active', fmt === 'image/jpeg');
  btnToPng.classList.toggle('active', fmt === 'image/png');
  btnToWebp.classList.toggle('active', fmt === 'image/webp');

  if (autoDetectBadge) {
    autoDetectBadge.textContent = isAuto ? 'Auto-selected' : 'Custom selected';
  }

  const ext = getFormatExt(fmt);
  outputExt.textContent = `.${ext}`;

  if (fmt === 'image/jpeg') {
    jpgOptionsGroup.classList.remove('hidden');
    pngOptionsGroup.classList.add('hidden');
    webpOptionsGroup.classList.add('hidden');
    if (swatchTransparent) swatchTransparent.classList.add('hidden');
    if (state.matteColor === 'transparent') {
      state.matteColor = state.lastSolidMatte || '#ffffff';
      syncSwatchHighlight();
    }
    matteHelperText.textContent = "JPG doesn't support transparent pixels. Choose a background fill color:";
  } else if (fmt === 'image/webp') {
    jpgOptionsGroup.classList.remove('hidden');
    pngOptionsGroup.classList.add('hidden');
    webpOptionsGroup.classList.remove('hidden');
    if (swatchTransparent) swatchTransparent.classList.remove('hidden');
    matteHelperText.textContent = 'Keep alpha transparency or choose a background matte color:';
  } else {
    jpgOptionsGroup.classList.add('hidden');
    pngOptionsGroup.classList.remove('hidden');
    webpOptionsGroup.classList.add('hidden');
  }
  if (reRender) renderConversion();
}

btnToJpg.addEventListener('click', () => selectFormat('image/jpeg', true, false));
btnToPng.addEventListener('click', () => selectFormat('image/png', true, false));
btnToWebp.addEventListener('click', () => selectFormat('image/webp', true, false));

// Quality Slider
qualityRange.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  qualityReadout.textContent = `${val}%`;
  state.quality = val / 100;
  renderConversion();
});

// Transparency Swatches & Custom Color
swatches.forEach((btn) => {
  btn.addEventListener('click', () => {
    const c = btn.dataset.color;
    state.matteColor = c;
    if (c !== 'transparent') {
      state.lastSolidMatte = c;
    }
    syncSwatchHighlight();
    renderConversion();
  });
});

customColorPicker.addEventListener('input', (e) => {
  state.matteColor = e.target.value;
  state.lastSolidMatte = e.target.value;
  syncSwatchHighlight();
  renderConversion();
});

// Resolution Scaling
scaleBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    scaleBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.scale = parseFloat(btn.dataset.scale);
    scaleReadout.textContent = `${Math.round(state.scale * 100)}%`;
    renderConversion();
  });
});

// Interactive Split Slider Logic
function setSplitPosition(clientX) {
  const rect = comparisonStage.getBoundingClientRect();
  if (!rect.width) return;
  let pos = ((clientX - rect.left) / rect.width) * 100;
  pos = Math.max(2, Math.min(98, pos));
  state.splitPos = pos;
  splitHandle.style.left = `${pos}%`;
  originalOverlay.style.clipPath = `inset(0 ${100 - pos}% 0 0)`;
}

comparisonStage.addEventListener('mousedown', (e) => {
  if (state.viewMode !== 'split') return;
  state.isDraggingSplit = true;
  setSplitPosition(e.clientX);
});
window.addEventListener('mouseup', () => (state.isDraggingSplit = false));
window.addEventListener('mousemove', (e) => {
  if (state.isDraggingSplit && state.viewMode === 'split') {
    setSplitPosition(e.clientX);
  }
});

comparisonStage.addEventListener('touchstart', (e) => {
  if (state.viewMode !== 'split' || !e.touches[0]) return;
  state.isDraggingSplit = true;
  setSplitPosition(e.touches[0].clientX);
}, { passive: true });
window.addEventListener('touchend', () => (state.isDraggingSplit = false));
window.addEventListener('touchcancel', () => (state.isDraggingSplit = false));
window.addEventListener('blur', () => (state.isDraggingSplit = false));
window.addEventListener('touchmove', (e) => {
  if (state.isDraggingSplit && state.viewMode === 'split' && e.touches[0]) {
    setSplitPosition(e.touches[0].clientX);
  }
}, { passive: true });

// View Mode Switcher
modeBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    modeBtns.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    state.viewMode = btn.dataset.mode;

    if (state.viewMode === 'split') {
      comparisonStage.classList.remove('no-split');
      originalOverlay.classList.remove('hidden');
      splitHandle.classList.remove('hidden');
      badgeOriginal.classList.remove('hidden');
      badgeConverted.classList.remove('hidden');
      originalOverlay.style.clipPath = `inset(0 ${100 - state.splitPos}% 0 0)`;
    } else if (state.viewMode === 'converted') {
      comparisonStage.classList.add('no-split');
      originalOverlay.classList.add('hidden');
      splitHandle.classList.add('hidden');
      badgeOriginal.classList.add('hidden');
      badgeConverted.classList.remove('hidden');
    } else {
      comparisonStage.classList.add('no-split');
      originalOverlay.classList.remove('hidden');
      originalOverlay.style.clipPath = 'inset(0 0 0 0)';
      splitHandle.classList.add('hidden');
      badgeOriginal.classList.remove('hidden');
      badgeConverted.classList.add('hidden');
    }
  });
});

// Filename Sync & History Logging on Download
outputFilename.addEventListener('input', () => {
  const ext = getFormatExt(state.convFormat || state.targetFormat);
  downloadCta.download = getSanitizedFilename(ext);
});

downloadCta.addEventListener('click', (e) => {
  if (!state.convUrl) {
    e.preventDefault();
    return;
  }
  addToSessionHistory();
});

function addToSessionHistory() {
  if (!state.convUrl) return;
  historySection.classList.remove('hidden');

  // Preserve these Blob URLs so subsequent conversions don't break history items
  historyUrls.add(state.convUrl);
  if (state.previewUrl) historyUrls.add(state.previewUrl);

  const extNum = getFormatExt(state.convFormat || state.targetFormat);
  const ext = extNum.toUpperCase();
  const finalDownloadName = getSanitizedFilename(extNum);
  downloadCta.download = finalDownloadName;

  const item = document.createElement('div');
  item.className = 'history-item';

  const thumb = document.createElement('img');
  thumb.src = state.previewUrl || state.convUrl;
  thumb.className = 'history-thumb';
  thumb.alt = 'thumb';

  const meta = document.createElement('div');
  meta.className = 'history-meta';

  const nameEl = document.createElement('div');
  nameEl.className = 'history-name';
  nameEl.textContent = finalDownloadName;

  const subEl = document.createElement('div');
  subEl.className = 'history-sub';
  subEl.textContent = `${state.origFormat} ➔ ${ext} • ${formatBytes(state.convSize)}`;

  meta.appendChild(nameEl);
  meta.appendChild(subEl);

  const dlLink = document.createElement('a');
  dlLink.href = state.convUrl;
  dlLink.download = finalDownloadName;
  dlLink.className = 'btn-sm';
  dlLink.textContent = '⬇';

  item.appendChild(thumb);
  item.appendChild(meta);
  item.appendChild(dlLink);

  historyList.prepend(item);
}

clearHistoryBtn.addEventListener('click', () => {
  historyUrls.forEach((url) => {
    if (url !== state.convUrl && url !== state.previewUrl) {
      URL.revokeObjectURL(url);
    }
  });
  historyUrls.clear();
  historyList.innerHTML = '';
  historySection.classList.add('hidden');
});

// Sample Generators
samplePngBtn.addEventListener('click', () => {
  const sampleLoadId = ++state.loadId;
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 540;
  const ctx = c.getContext('2d');

  // Neon circles on transparent alpha grid
  const grad1 = ctx.createRadialGradient(290, 260, 20, 290, 260, 180);
  grad1.addColorStop(0, '#818cf8');
  grad1.addColorStop(1, '#4f46e5');
  ctx.fillStyle = grad1;
  ctx.beginPath();
  ctx.arc(290, 260, 175, 0, Math.PI * 2);
  ctx.fill();

  const grad2 = ctx.createRadialGradient(490, 280, 20, 490, 280, 180);
  grad2.addColorStop(0, 'rgba(244, 114, 182, 0.92)');
  grad2.addColorStop(1, 'rgba(219, 39, 119, 0.85)');
  ctx.fillStyle = grad2;
  ctx.beginPath();
  ctx.arc(490, 280, 175, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 38px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('TRANSPARENT PNG', 400, 270);
  ctx.font = '500 20px Inter, sans-serif';
  ctx.fillText('Drag the split slider & test matte colors!', 400, 310);

  c.toBlob((blob) => {
    if (!blob || sampleLoadId !== state.loadId) return;
    processFile(new File([blob], 'sample-transparent-logo.png', { type: 'image/png' }));
  }, 'image/png');
});

sampleJpgBtn.addEventListener('click', () => {
  const sampleLoadId = ++state.loadId;
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 540;
  const ctx = c.getContext('2d');

  // Sunset landscape gradient
  const sky = ctx.createLinearGradient(0, 0, 0, 540);
  sky.addColorStop(0, '#1e1b4b');
  sky.addColorStop(0.55, '#7e22ce');
  sky.addColorStop(1, '#f97316');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, 800, 540);

  // Sun
  ctx.fillStyle = '#fde047';
  ctx.beginPath();
  ctx.arc(400, 320, 95, 0, Math.PI * 2);
  ctx.fill();

  // Mountains
  ctx.fillStyle = '#0f172a';
  ctx.beginPath();
  ctx.moveTo(0, 540);
  ctx.lineTo(240, 310);
  ctx.lineTo(460, 470);
  ctx.lineTo(640, 290);
  ctx.lineTo(800, 430);
  ctx.lineTo(800, 540);
  ctx.fill();

  c.toBlob((blob) => {
    if (!blob || sampleLoadId !== state.loadId) return;
    processFile(new File([blob], 'sunset-mountain-photo.jpg', { type: 'image/jpeg' }));
  }, 'image/jpeg', 0.92);
});

sampleWebpBtn.addEventListener('click', () => {
  const sampleLoadId = ++state.loadId;
  const c = document.createElement('canvas');
  c.width = 800;
  c.height = 540;
  const ctx = c.getContext('2d');

  // Cyberpunk Grid & Glow background
  const bg = ctx.createLinearGradient(0, 0, 800, 540);
  bg.addColorStop(0, '#090d16');
  bg.addColorStop(0.5, '#1e1b4b');
  bg.addColorStop(1, '#0f172a');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 800, 540);

  // Glowing ring
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(400, 250, 140, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(99, 102, 241, 0.35)';
  ctx.beginPath();
  ctx.arc(400, 250, 135, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = '800 38px Inter, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('NEXT-GEN WEBP', 400, 250);
  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 20px Inter, sans-serif';
  ctx.fillText('Convert WEBP to PNG or JPG Instantly', 400, 290);

  c.toBlob((blob) => {
    if (!blob || sampleLoadId !== state.loadId) return;
    processFile(new File([blob], 'sample-nextgen-graphic.webp', { type: 'image/webp' }));
  }, 'image/webp', 0.92);
});

// Reset Workspace / Go to Home
function goToHome(e) {
  if (e) e.preventDefault();
  state.loadId++;
  state.renderId++;
  safeRevokeUrl(state.origUrl);
  safeRevokeUrl(state.convUrl);
  state.origUrl = '';
  state.convUrl = '';
  state.previewUrl = '';
  state.convSize = 0;
  state.imageElement = null;

  // Reset studio controls to defaults
  state.quality = 0.9;
  qualityRange.value = '90';
  qualityReadout.textContent = '90%';

  state.matteColor = '#ffffff';
  state.lastSolidMatte = '#ffffff';
  syncSwatchHighlight();

  state.scale = 1;
  scaleReadout.textContent = '100%';
  scaleBtns.forEach((b) => b.classList.toggle('active', b.dataset.scale === '1'));

  state.viewMode = 'split';
  state.splitPos = 50;
  state.isDraggingSplit = false;
  modeBtns.forEach((b) => b.classList.toggle('active', b.dataset.mode === 'split'));
  comparisonStage.classList.remove('no-split');
  originalOverlay.classList.remove('hidden');
  splitHandle.classList.remove('hidden');
  badgeOriginal.classList.remove('hidden');
  badgeConverted.classList.remove('hidden');
  splitHandle.style.left = '50%';
  originalOverlay.style.clipPath = 'inset(0 50% 0 0)';

  imgOriginal.src = EMPTY_PIXEL;
  imgConverted.src = EMPTY_PIXEL;
  downloadCta.removeAttribute('href');
  fileInput.value = '';
  workspaceSection.classList.add('hidden');
  uploadSection.classList.remove('hidden');
  heroHeader.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

closeWorkspaceBtn.addEventListener('click', goToHome);
brandHome.addEventListener('click', goToHome);
