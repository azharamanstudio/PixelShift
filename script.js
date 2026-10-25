// DOM Elements
const uploadSection = document.getElementById('upload-section');
const heroHeader = document.getElementById('hero-header');
const workspaceSection = document.getElementById('workspace-section');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const samplePngBtn = document.getElementById('sample-png-btn');
const sampleJpgBtn = document.getElementById('sample-jpg-btn');
const sampleWebmBtn = document.getElementById('sample-webm-btn');
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
const btnToJpg = document.getElementById('btn-to-jpg');
const btnToPng = document.getElementById('btn-to-png');
const btnToWebm = document.getElementById('btn-to-webm');
const jpgOptionsGroup = document.getElementById('jpg-options-group');
const pngOptionsGroup = document.getElementById('png-options-group');
const webmOptionsGroup = document.getElementById('webm-options-group');
const matteHelperText = document.getElementById('matte-helper-text');
const qualityRange = document.getElementById('quality-range');
const qualityReadout = document.getElementById('quality-readout');
const swatches = document.querySelectorAll('.swatch');
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
  targetFormat: 'image/jpeg',
  quality: 0.9,
  matteColor: '#ffffff',
  scale: 1,
  viewMode: 'split',
  splitPos: 50,
  isDraggingSplit: false,
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
  raw = raw.replace(/\.(jpe?g|png|webm)$/i, '');
  return `${raw || 'converted'}.${ext}`;
}

// Format Extension Helper
function getFormatExt(fmt) {
  if (fmt === 'image/jpeg') return 'jpg';
  if (fmt === 'video/webm') return 'webm';
  return 'png';
}

// EBML / WebM Muxer Utilities (Wraps VP8 bitstream into a valid WebM container)
function concatUint8Arrays(arrays) {
  const totalLen = arrays.reduce((acc, arr) => acc + arr.length, 0);
  const out = new Uint8Array(totalLen);
  let offset = 0;
  for (const arr of arrays) {
    out.set(arr, offset);
    offset += arr.length;
  }
  return out;
}

function ebmlElement(idBytes, data) {
  const payload = Array.isArray(data) ? concatUint8Arrays(data) : data;
  const len = payload.length;
  let sizeVint;
  if (len < 127) {
    sizeVint = new Uint8Array([0x80 | len]);
  } else {
    sizeVint = new Uint8Array([
      0x10 | ((len >>> 24) & 0x0f),
      (len >>> 16) & 0xff,
      (len >>> 8) & 0xff,
      len & 0xff
    ]);
  }
  return concatUint8Arrays([new Uint8Array(idBytes), sizeVint, payload]);
}

function ebmlUint(idBytes, num) {
  const bytes = [];
  let n = num >>> 0;
  do {
    bytes.unshift(n & 0xff);
    n = n >>> 8;
  } while (n > 0);
  return ebmlElement(idBytes, new Uint8Array(bytes));
}

function ebmlAscii(idBytes, str) {
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return ebmlElement(idBytes, bytes);
}

function ebmlFloat32(idBytes, val) {
  const buf = new ArrayBuffer(4);
  new DataView(buf).setFloat32(0, val, false);
  return ebmlElement(idBytes, new Uint8Array(buf));
}

function muxVp8ToWebm(vp8FrameBytes, width, height) {
  const ebmlHeader = ebmlElement([0x1a, 0x45, 0xdf, 0xa3], [
    ebmlUint([0x42, 0x86], 1),
    ebmlUint([0x42, 0xf7], 1),
    ebmlUint([0x42, 0xf2], 4),
    ebmlUint([0x42, 0xf3], 8),
    ebmlAscii([0x42, 0x82], 'webm'),
    ebmlUint([0x42, 0x87], 2),
    ebmlUint([0x42, 0x85], 2)
  ]);

  const segmentInfo = ebmlElement([0x15, 0x49, 0xa9, 0x66], [
    ebmlUint([0x2a, 0xd7, 0xb1], 1000000),
    ebmlAscii([0x4d, 0x80], 'PixelShift Studio'),
    ebmlAscii([0x57, 0x41], 'PixelShift Studio'),
    ebmlFloat32([0x44, 0x89], 1000.0)
  ]);

  const videoSettings = ebmlElement([0xe0], [
    ebmlUint([0xb0], width),
    ebmlUint([0xba], height)
  ]);

  const trackEntry = ebmlElement([0xae], [
    ebmlUint([0xd7], 1),
    ebmlUint([0x73, 0xc5], 1),
    ebmlUint([0x9c], 0),
    ebmlAscii([0x22, 0xb5, 0x9c], 'und'),
    ebmlAscii([0x86], 'V_VP8'),
    ebmlUint([0x83], 1),
    videoSettings
  ]);

  const tracks = ebmlElement([0x16, 0x54, 0xae, 0x6b], trackEntry);

  const simpleBlockPayload = concatUint8Arrays([
    new Uint8Array([0x81, 0x00, 0x00, 0x80]),
    vp8FrameBytes
  ]);

  const cluster = ebmlElement([0x1f, 0x43, 0xb6, 0x75], [
    ebmlUint([0xe7], 0),
    ebmlElement([0xa3], simpleBlockPayload)
  ]);

  const segment = ebmlElement([0x18, 0x53, 0x80, 0x67], [
    segmentInfo,
    tracks,
    cluster
  ]);

  return new Blob([ebmlHeader, segment], { type: 'video/webm' });
}

function canvasToWebm(canvas, quality, callback) {
  const clampedQ = Math.min(0.99, Math.max(0.1, quality));
  const webpDataUrl = canvas.toDataURL('image/webp', clampedQ);

  if (webpDataUrl.startsWith('data:image/webp;base64,')) {
    const binStr = atob(webpDataUrl.split(',')[1]);
    const bytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);

    // Locate 'VP8 ' chunk inside RIFF WEBP container
    let offset = 12;
    let vp8Bytes = null;
    while (offset + 8 <= bytes.length) {
      const fourCC = String.fromCharCode(
        bytes[offset],
        bytes[offset + 1],
        bytes[offset + 2],
        bytes[offset + 3]
      );
      const chunkSize =
        (bytes[offset + 4] |
          (bytes[offset + 5] << 8) |
          (bytes[offset + 6] << 16) |
          (bytes[offset + 7] << 24)) >>>
        0;
      const dataStart = offset + 8;
      if (dataStart + chunkSize > bytes.length) break;
      if (fourCC === 'VP8 ') {
        vp8Bytes = bytes.subarray(dataStart, dataStart + chunkSize);
        break;
      }
      offset = dataStart + chunkSize + (chunkSize % 2);
    }

    if (vp8Bytes) {
      const webmBlob = muxVp8ToWebm(vp8Bytes, canvas.width, canvas.height);
      const previewBlob = new Blob([bytes], { type: 'image/webp' });
      callback(webmBlob, previewBlob);
      return;
    }
  }

  // Fallback for browsers without WebP VP8 export
  canvas.toBlob((previewBlob) => {
    callback(previewBlob, previewBlob);
  }, 'image/jpeg', clampedQ);
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
  const isWebm = file.type === 'video/webm' || file.name.toLowerCase().endsWith('.webm');

  if (!isPng && !isJpg && !isWebm) {
    alert('Unsupported file! Please upload a PNG, JPG, or WEBM file.');
    return;
  }

  safeRevokeUrl(state.origUrl);
  state.origSize = file.size;
  state.origFormat = isPng ? 'PNG' : isWebm ? 'WEBM' : 'JPG';

  // Auto-select target format
  const autoTarget = isPng ? 'image/jpeg' : 'image/png';
  selectFormat(autoTarget, false);

  const cleanBase = file.name.replace(/\.[^/.]+$/, '');
  outputFilename.value = `${cleanBase}-pixelshift`;

  if (isWebm) {
    const videoUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    let extracted = false;
    const extractFrame = () => {
      if (extracted) return;
      extracted = true;
      const c = document.createElement('canvas');
      c.width = video.videoWidth || 800;
      c.height = video.videoHeight || 540;
      const ctx = c.getContext('2d');
      ctx.drawImage(video, 0, 0, c.width, c.height);
      URL.revokeObjectURL(videoUrl);

      c.toBlob((frameBlob) => {
        if (!frameBlob) return;
        state.origUrl = URL.createObjectURL(frameBlob);
        const img = new Image();
        img.onload = () => {
          state.imageElement = img;
          imgOriginal.src = state.origUrl;
          uploadSection.classList.add('hidden');
          heroHeader.classList.add('hidden');
          workspaceSection.classList.remove('hidden');
          renderConversion();
        };
        img.src = state.origUrl;
      }, 'image/png');
    };

    video.addEventListener('loadeddata', () => {
      video.currentTime = 0.001;
      setTimeout(extractFrame, 250);
    }, { once: true });
    video.addEventListener('seeked', extractFrame, { once: true });
    video.addEventListener('error', () => {
      URL.revokeObjectURL(videoUrl);
      if (!extracted) {
        alert('Could not decode this WEBM file. Please ensure it is a valid video/webm file.');
      }
    }, { once: true });
    video.src = videoUrl;
    video.load();
    return;
  }

  state.origUrl = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    state.imageElement = img;
    imgOriginal.src = state.origUrl;

    uploadSection.classList.add('hidden');
    heroHeader.classList.add('hidden');
    workspaceSection.classList.remove('hidden');

    renderConversion();
  };
  img.onerror = () => {
    safeRevokeUrl(state.origUrl);
    state.origUrl = '';
    alert('Failed to load the selected image file.');
  };
  img.src = state.origUrl;
}

// Core Canvas Conversion Engine
function renderConversion() {
  if (!state.imageElement) return;

  const currentRenderId = ++state.renderId;
  const targetW = Math.max(1, Math.round(state.imageElement.naturalWidth * state.scale));
  const targetH = Math.max(1, Math.round(state.imageElement.naturalHeight * state.scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');

  // Fill background matte color if converting to JPG or WEBM
  if (state.targetFormat === 'image/jpeg' || state.targetFormat === 'video/webm') {
    ctx.fillStyle = state.matteColor;
    ctx.fillRect(0, 0, targetW, targetH);
  }

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(state.imageElement, 0, 0, targetW, targetH);

  if (state.targetFormat === 'video/webm') {
    canvasToWebm(canvas, state.quality, (webmBlob, previewBlob) => {
      if (currentRenderId !== state.renderId || !webmBlob) return;
      safeRevokeUrl(state.convUrl);
      safeRevokeUrl(state.previewUrl);

      state.convUrl = URL.createObjectURL(webmBlob);
      state.previewUrl = URL.createObjectURL(previewBlob);
      state.convSize = webmBlob.size;
      imgConverted.src = state.previewUrl;

      updateStudioMetrics(targetW, targetH);
    });
    return;
  }

  canvas.toBlob(
    (blob) => {
      if (currentRenderId !== state.renderId || !blob) return;
      safeRevokeUrl(state.convUrl);
      safeRevokeUrl(state.previewUrl);

      state.convUrl = URL.createObjectURL(blob);
      state.previewUrl = state.convUrl;
      state.convSize = blob.size;
      imgConverted.src = state.previewUrl;

      updateStudioMetrics(targetW, targetH);
    },
    state.targetFormat,
    state.targetFormat === 'image/jpeg' ? state.quality : undefined
  );
}

// Update Telemetry & Download Link
function updateStudioMetrics(w, h) {
  const ext = getFormatExt(state.targetFormat);
  const targetLabel = ext.toUpperCase();

  metricOrig.textContent = `${state.origFormat} • ${formatBytes(state.origSize)}`;
  metricOrigDim.textContent = `${state.imageElement.naturalWidth} × ${state.imageElement.naturalHeight} px`;

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

// Format Selection
function selectFormat(fmt, reRender = true) {
  state.targetFormat = fmt;
  btnToJpg.classList.toggle('active', fmt === 'image/jpeg');
  btnToPng.classList.toggle('active', fmt === 'image/png');
  btnToWebm.classList.toggle('active', fmt === 'video/webm');

  if (fmt === 'image/jpeg') {
    jpgOptionsGroup.classList.remove('hidden');
    pngOptionsGroup.classList.add('hidden');
    webmOptionsGroup.classList.add('hidden');
    matteHelperText.textContent = "JPG doesn't support transparent pixels. Choose a background fill color:";
  } else if (fmt === 'video/webm') {
    jpgOptionsGroup.classList.remove('hidden');
    pngOptionsGroup.classList.add('hidden');
    webmOptionsGroup.classList.remove('hidden');
    matteHelperText.textContent = 'Choose a background canvas matte color for the VP8 WebM frame:';
  } else {
    jpgOptionsGroup.classList.add('hidden');
    pngOptionsGroup.classList.remove('hidden');
    webmOptionsGroup.classList.add('hidden');
  }
  if (reRender) renderConversion();
}

btnToJpg.addEventListener('click', () => selectFormat('image/jpeg'));
btnToPng.addEventListener('click', () => selectFormat('image/png'));
btnToWebm.addEventListener('click', () => selectFormat('video/webm'));

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
    swatches.forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    const c = btn.dataset.color;
    state.matteColor = c;
    customColorPicker.value = c;
    hexReadout.textContent = c.toUpperCase();
    renderConversion();
  });
});

customColorPicker.addEventListener('input', (e) => {
  swatches.forEach((s) => s.classList.remove('active'));
  state.matteColor = e.target.value;
  hexReadout.textContent = e.target.value.toUpperCase();
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
      originalOverlay.classList.remove('hidden');
      splitHandle.classList.remove('hidden');
      badgeOriginal.classList.remove('hidden');
      badgeConverted.classList.remove('hidden');
      originalOverlay.style.clipPath = `inset(0 ${100 - state.splitPos}% 0 0)`;
    } else if (state.viewMode === 'converted') {
      originalOverlay.classList.add('hidden');
      splitHandle.classList.add('hidden');
      badgeOriginal.classList.add('hidden');
      badgeConverted.classList.remove('hidden');
    } else {
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
  const ext = getFormatExt(state.targetFormat);
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

  const ext = getFormatExt(state.targetFormat).toUpperCase();
  const finalDownloadName = downloadCta.download;

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
    processFile(new File([blob], 'sample-transparent-logo.png', { type: 'image/png' }));
  }, 'image/png');
});

sampleJpgBtn.addEventListener('click', () => {
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
    processFile(new File([blob], 'sunset-mountain-photo.jpg', { type: 'image/jpeg' }));
  }, 'image/jpeg', 0.92);
});

sampleWebmBtn.addEventListener('click', () => {
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
  ctx.fillText('WEBM VP8 FRAME', 400, 250);
  ctx.fillStyle = '#38bdf8';
  ctx.font = '600 20px Inter, sans-serif';
  ctx.fillText('Convert WEBM to PNG or JPG Instantly', 400, 290);

  canvasToWebm(c, 0.92, (webmBlob) => {
    processFile(new File([webmBlob], 'sample-vp8-frame.webm', { type: 'video/webm' }));
  });
});

// Reset Workspace / Go to Home
function goToHome(e) {
  if (e) e.preventDefault();
  fileInput.value = '';
  workspaceSection.classList.add('hidden');
  uploadSection.classList.remove('hidden');
  heroHeader.classList.remove('hidden');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

closeWorkspaceBtn.addEventListener('click', goToHome);
brandHome.addEventListener('click', goToHome);