import QRCode from "qrcode";
import { startScanUpload } from "./scan-upload.js";
import { removeBackground } from '@imgly/background-removal';

/**
 * RESAP — Passport Photo Editor
 * AI-powered background removal and passport photo preparation.
 */

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_DIMENSION = 10000;

const el = {
  uploadArea: document.getElementById('passportUploadArea'),
  fileInput: document.getElementById('passportImageInput'),

  preset: document.getElementById('passportPreset'),
  width: document.getElementById('passportWidth'),
  height: document.getElementById('passportHeight'),
  dpi: document.getElementById('passportDpi'),

  background: document.getElementById('passportBackground'),
  customColorGroup: document.getElementById('passportCustomColorGroup'),
  customColor: document.getElementById('passportCustomColor'),

  brightness: document.getElementById('passportBrightness'),
  brightnessValue: document.getElementById('passportBrightnessValue'),
  contrast: document.getElementById('passportContrast'),
  contrastValue: document.getElementById('passportContrastValue'),

  format: document.getElementById('passportOutputFormat'),
  quality: document.getElementById('passportQuality'),
  qualityValue: document.getElementById('passportQualityValue'),

  generateBtn: document.getElementById('generatePassportBtn'),
  resetBtn: document.getElementById('resetPassportBtn'),
  downloadBtn: document.getElementById('downloadPassportBtn'),

  originalPreview: document.getElementById('passportOriginalPreview'),
  originalPlaceholder: document.getElementById('passportOriginalPlaceholder'),
  originalInfo: document.getElementById('passportOriginalInfo'),

  resultCanvas: document.getElementById('passportResultCanvas'),
  resultPlaceholder: document.getElementById('passportResultPlaceholder'),
  resultInfo: document.getElementById('passportResultInfo'),

  summary: document.getElementById('passportOutputSummary'),
  outputDimensions: document.getElementById('passportOutputDimensions'),
  outputSize: document.getElementById('passportOutputSize'),

  status: document.getElementById('passportStatus'),
  scanUploadBtn: document.getElementById("scanUploadBtn"),
scanUploadStatus: document.getElementById("scanUploadStatus"),
scanQrContainer: document.getElementById("scanQrContainer"),
scanQrCode: document.getElementById("scanQrCode"),
scanExpiry: document.getElementById("scanExpiry"),

  // Optional crop-editor elements.
  // The editor will still work without these elements.
  cropCanvas: document.getElementById('passportCropCanvas'),
  cropPlaceholder: document.getElementById('passportCropPlaceholder'),
  cropSection: document.getElementById('passportCropSection'),
  resetCropBtn: document.getElementById('passportResetCropBtn'),
  zoom: document.getElementById('passportZoom'),
  zoomValue: document.getElementById('passportZoomValue')
};

const presets = {
  '35x45': { width: 35, height: 45 },
  '2x2': { width: 50.8, height: 50.8 },
  '25x35': { width: 25, height: 35 }
};

let originalFile = null;
let originalImage = null;
let originalObjectUrl = null;

let outputBlob = null;
let outputObjectUrl = null;

// AI-processed transparent image.
let backgroundRemovedBlob = null;
let backgroundRemovedImage = null;

let isProcessing = false;

// Crop editor state.
let cropRect = null;
let cropCanvasScale = 1;
let cropZoom = 100;

let imageOffsetX = 0;
let imageOffsetY = 0;

let cropDragging = false;
let cropPointerStart = null;
let cropInitialOffset = null;


/* ==========================================
   INITIALIZATION
========================================== */

function initPassportEditor() {
  if (!el.uploadArea || !el.fileInput) {
    console.error('Passport Photo Editor elements not found.');
    return;
  }

  el.uploadArea.addEventListener('click', () => {
    el.fileInput.click();
  });

  el.fileInput.addEventListener('change', event => {
    const file = event.target.files[0];

    if (file) {
      loadPassportImage(file);
    }

    event.target.value = '';
  });

  el.uploadArea.addEventListener('dragover', event => {
    event.preventDefault();
    el.uploadArea.classList.add('drag-over');
  });

  el.uploadArea.addEventListener('dragleave', () => {
    el.uploadArea.classList.remove('drag-over');
  });

  el.uploadArea.addEventListener('drop', event => {
    event.preventDefault();
    el.uploadArea.classList.remove('drag-over');

    const file = event.dataTransfer.files[0];

    if (file) {
      loadPassportImage(file);
    }
  });

  el.preset.addEventListener('change', handlePresetChange);

  el.background.addEventListener('change', () => {
    el.customColorGroup.hidden =
      el.background.value !== 'custom';

    clearOutput();
  });

  el.customColor.addEventListener('input', clearOutput);

  el.width.addEventListener('input', clearOutput);
  el.height.addEventListener('input', clearOutput);
  el.dpi.addEventListener('change', clearOutput);

  el.brightness.addEventListener('input', () => {
    el.brightnessValue.textContent =
      `${el.brightness.value}%`;

    clearOutput();
  });

  el.contrast.addEventListener('input', () => {
    el.contrastValue.textContent =
      `${el.contrast.value}%`;

    clearOutput();
  });

  el.quality.addEventListener('input', () => {
    el.qualityValue.textContent =
      `${el.quality.value}%`;

    clearOutput();
  });

  el.format.addEventListener('change', clearOutput);

  el.generateBtn.addEventListener(
    'click',
    generatePassportPhoto
  );

  el.resetBtn.addEventListener(
    'click',
    resetPassportEditor
  );

  el.downloadBtn.addEventListener(
    'click',
    downloadPassportPhoto
  );

  // Crop controls are optional.
  if (el.resetCropBtn) {
    el.resetCropBtn.addEventListener('click', resetCrop);
  }

  if (el.zoom) {
    el.zoom.addEventListener('input', () => {
      cropZoom = Number(el.zoom.value);

      if (el.zoomValue) {
        el.zoomValue.textContent = `${cropZoom}%`;
      }

      updateCropZoom();
      drawCropEditor();
      clearOutput();
    });
  }

  if (el.cropCanvas) {
    el.cropCanvas.addEventListener(
      'pointerdown',
      handleCropPointerDown
    );

    el.cropCanvas.addEventListener(
      'pointermove',
      handleCropPointerMove
    );

    el.cropCanvas.addEventListener(
      'pointerup',
      handleCropPointerUp
    );

    el.cropCanvas.addEventListener(
      'pointercancel',
      handleCropPointerUp
    );

    el.cropCanvas.addEventListener(
      'lostpointercapture',
      handleCropPointerUp
    );
  }

  el.width.addEventListener('input', refreshCropRatio);
  el.height.addEventListener('input', refreshCropRatio);

  setStatus('', '');
}

el.scanUploadBtn.addEventListener("click", async () => {
  try {
    el.scanUploadStatus.textContent = "Generating QR code...";
    el.scanQrContainer.hidden = true;

    const session = await startScanUpload((file) => {
      loadPassportImage(file);
    });

    const networkResponse = await fetch(
      "http://localhost:3001/api/network-info"
    );

    if (!networkResponse.ok) {
      throw new Error("Unable to detect laptop network address.");
    }

    const networkInfo = await networkResponse.json();

    const phoneUrl =
      `http://${networkInfo.address}:3000/scan-upload.html?session=${encodeURIComponent(session.sessionId)}`;

    await QRCode.toCanvas(el.scanQrCode, phoneUrl, {
      width: 220,
      margin: 2,
    });

    el.scanQrContainer.hidden = false;

    el.scanUploadStatus.textContent =
      "Scan this QR code using your phone.";

    el.scanExpiry.textContent =
      `Session expires at ${new Date(session.expiresAt).toLocaleTimeString()}`;

  } catch (error) {
    console.error("Scan upload error:", error);

    el.scanUploadStatus.textContent =
      error.message || "Unable to generate QR code.";
  }
});
/* ==========================================
   LOAD IMAGE
========================================== */

async function loadPassportImage(file) {
  clearOutput();
  setStatus('', '');

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

  if (!allowedTypes.includes(file.type)) {
    setStatus(
      'Please upload a JPG, PNG or WebP image.',
      'error'
    );
    return;
  }

  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    setStatus(
      'Image must be larger than 0 bytes and no more than 10 MB.',
      'error'
    );
    return;
  }

  try {
    const image = await loadImage(file);

    const pixels =
      image.naturalWidth * image.naturalHeight;

    if (
      image.naturalWidth > MAX_DIMENSION ||
      image.naturalHeight > MAX_DIMENSION ||
      pixels > MAX_PIXELS
    ) {
      setStatus(
        'Image dimensions exceed 10,000 px per side or 40 megapixels.',
        'error'
      );

      return;
    }

    releaseOriginalUrl();

    originalFile = file;
    originalImage = image;

    originalObjectUrl = URL.createObjectURL(file);

    // Clear the previous AI result.
    backgroundRemovedBlob = null;
    backgroundRemovedImage = null;

    el.originalPreview.src = originalObjectUrl;
    el.originalPreview.hidden = false;
    el.originalPlaceholder.hidden = true;

    el.originalInfo.textContent =
      `${file.name} · ${formatFileSize(file.size)} · ` +
      `${image.naturalWidth} × ${image.naturalHeight} px`;

    enableControls();

    initializeCropEditor();

    setStatus(
      'Photograph uploaded. AI background removal will run when you generate.',
      'success'
    );

  } catch (error) {
    console.error(error);

    setStatus(
      'Unable to load this photograph.',
      'error'
    );
  }
}


function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image loading failed.'));
    };

    image.src = url;
  });
}


/* ==========================================
   PRESETS
========================================== */

function handlePresetChange() {
  const selected = el.preset.value;

  if (presets[selected]) {
    el.width.value = presets[selected].width;
    el.height.value = presets[selected].height;
  }

  if (selected === 'custom') {
    el.width.focus();
  }

  clearOutput();
}


/* ==========================================
   ENABLE CONTROLS
========================================== */

function enableControls() {
  [
    el.preset,
    el.width,
    el.height,
    el.dpi,
    el.background,
    el.customColor,
    el.brightness,
    el.contrast,
    el.format,
    el.quality
  ].forEach(input => {
    input.disabled = false;
  });

  el.generateBtn.disabled = false;
  el.resetBtn.disabled = false;
}


/* ==========================================
   AI BACKGROUND REMOVAL
========================================== */

async function getBackgroundRemovedImage() {
  if (backgroundRemovedImage) {
    return backgroundRemovedImage;
  }

  if (!originalFile) {
    throw new Error(
      'Please upload a photograph first.'
    );
  }

  setStatus(
    'AI is removing the original background. First processing may take some time...',
    'info'
  );

  // Process the uploaded photograph in the browser.
  const resultBlob = await removeBackground(
    originalFile,
    {
      output: {
        format: 'image/png',
        quality: 1
      }
    }
  );

  if (!resultBlob || resultBlob.size === 0) {
    throw new Error(
      'AI background removal returned an empty image.'
    );
  }

  backgroundRemovedBlob = resultBlob;

  backgroundRemovedImage = await loadImage(resultBlob);

  return backgroundRemovedImage;
}


/* ==========================================
   GENERATE PASSPORT PHOTO
========================================== */

async function generatePassportPhoto() {
  if (!originalImage || isProcessing) {
    if (!originalImage) {
      setStatus(
        'Please upload a photograph first.',
        'error'
      );
    }

    return;
  }

  const widthMM = Number(el.width.value);
  const heightMM = Number(el.height.value);
  const dpi = Number(el.dpi.value);
  const quality = Number(el.quality.value) / 100;

  if (
    !Number.isFinite(widthMM) ||
    !Number.isFinite(heightMM) ||
    widthMM < 10 ||
    heightMM < 10 ||
    widthMM > 100 ||
    heightMM > 100
  ) {
    setStatus(
      'Enter valid dimensions between 10 and 100 mm.',
      'error'
    );

    return;
  }

  if (
    !Number.isFinite(dpi) ||
    dpi < 72 ||
    dpi > 600
  ) {
    setStatus(
      'Please select a valid resolution.',
      'error'
    );

    return;
  }

  const widthPX = Math.round(
    (widthMM / 25.4) * dpi
  );

  const heightPX = Math.round(
    (heightMM / 25.4) * dpi
  );

  if (
    widthPX * heightPX > MAX_PIXELS ||
    widthPX > MAX_DIMENSION ||
    heightPX > MAX_DIMENSION
  ) {
    setStatus(
      'Requested output dimensions are too large.',
      'error'
    );

    return;
  }

  isProcessing = true;

  el.generateBtn.disabled = true;
  el.downloadBtn.disabled = true;

  try {
    // AI background removal happens once per uploaded photograph.
    const transparentImage =
      await getBackgroundRemovedImage();

    setStatus(
      'Preparing passport photograph...',
      'info'
    );

    await new Promise(resolve => setTimeout(resolve, 30));

    const canvas = el.resultCanvas;

    canvas.width = widthPX;
    canvas.height = heightPX;

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error(
        'Canvas is not supported by this browser.'
      );
    }

    // Draw the selected replacement background.
    context.fillStyle = getBackgroundColor();

    context.fillRect(
      0,
      0,
      widthPX,
      heightPX
    );

    // Crop the transparent AI result to the required aspect ratio.
    const crop = getSelectedSourceCrop(
      transparentImage.naturalWidth,
      transparentImage.naturalHeight
    );

    // Draw only the foreground subject over the new background.
    context.filter =
      `brightness(${el.brightness.value}%) ` +
      `contrast(${el.contrast.value}%)`;

    context.drawImage(
      transparentImage,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      widthPX,
      heightPX
    );

    context.filter = 'none';

    const format = el.format.value;

    const blob = await canvasToBlob(
      canvas,
      format,
      format === 'image/png'
        ? undefined
        : quality
    );

    outputBlob = blob;

    releaseOutputUrl();

    outputObjectUrl = URL.createObjectURL(blob);

    canvas.hidden = false;
    el.resultPlaceholder.hidden = true;

    el.resultInfo.textContent =
      `${getFormatName(format)} · ${formatFileSize(blob.size)}`;

    el.outputDimensions.textContent =
      `Dimensions: ${widthPX} × ${heightPX} px`;

    el.outputSize.textContent =
      `Resolution: ${dpi} DPI · ${widthMM} × ${heightMM} mm`;

    el.summary.hidden = false;
    el.downloadBtn.disabled = false;

    setStatus(
      'Passport photograph generated with AI background removal.',
      'success'
    );

  } catch (error) {
    console.error(
      'Passport generation error:',
      error
    );

    setStatus(
      error.message ||
      'Unable to generate the photograph. Please try again.',
      'error'
    );

  } finally {
    isProcessing = false;
    el.generateBtn.disabled = false;
  }
}


/* ==========================================
   CENTER CROP
========================================== */

function calculateCenterCrop(
  sourceWidth,
  sourceHeight,
  targetRatio
) {
  const sourceRatio = sourceWidth / sourceHeight;

  let width = sourceWidth;
  let height = sourceHeight;

  let x = 0;
  let y = 0;

  if (sourceRatio > targetRatio) {
    width = sourceHeight * targetRatio;
    x = (sourceWidth - width) / 2;

  } else {
    height = sourceWidth / targetRatio;
    y = (sourceHeight - height) / 2;
  }

  return {
    x,
    y,
    width,
    height
  };
}


/* ==========================================
   BACKGROUND COLOR
========================================== */

function getBackgroundColor() {
  const backgrounds = {
    white: '#ffffff',
    lightgray: '#eeeeee',
    blue: '#dceeff'
  };

  if (el.background.value === 'custom') {
    return el.customColor.value;
  }

  return backgrounds[el.background.value] || '#ffffff';
}


/* ==========================================
   CANVAS EXPORT
========================================== */

function canvasToBlob(canvas, format, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => {
        if (!blob) {
          reject(
            new Error('Could not export the photograph.')
          );

          return;
        }

        resolve(blob);
      },
      format,
      quality
    );
  });
}


/* ==========================================
   DOWNLOAD
========================================== */

function downloadPassportPhoto() {
  if (!outputBlob || !outputObjectUrl) {
    setStatus(
      'Generate a photograph before downloading.',
      'error'
    );

    return;
  }

  const extension = getExtension(el.format.value);

  const link = document.createElement('a');

  link.href = outputObjectUrl;
  link.download = `passport-photo.${extension}`;

  document.body.appendChild(link);

  link.click();

  link.remove();
}


/* ==========================================
   CLEAR OUTPUT
========================================== */

function clearOutput() {
  outputBlob = null;

  releaseOutputUrl();

  // Clear generated output only.
  // Do NOT hide or reset the crop editor here.
  el.resultCanvas.hidden = true;
  el.resultPlaceholder.hidden = false;

  el.resultInfo.textContent = 'No output generated';

  el.summary.hidden = true;

  el.outputDimensions.textContent = '';
  el.outputSize.textContent = '';

  el.downloadBtn.disabled = true;
}


/* ==========================================
   RESET
========================================== */

function resetPassportEditor() {
  originalFile = null;
  originalImage = null;
  outputBlob = null;

  backgroundRemovedBlob = null;
  backgroundRemovedImage = null;

  releaseOriginalUrl();
  releaseOutputUrl();

  el.fileInput.value = '';

  el.originalPreview.removeAttribute('src');
  el.originalPreview.hidden = true;

  el.originalPlaceholder.hidden = false;

  el.resultCanvas.width = 0;
  el.resultCanvas.height = 0;
  el.resultCanvas.hidden = true;

  el.resultPlaceholder.hidden = false;

  el.originalInfo.textContent =
    'No photograph uploaded';

  el.resultInfo.textContent =
    'No output generated';

  el.preset.value = '35x45';

  el.width.value = 35;
  el.height.value = 45;

  el.dpi.value = '300';

  el.background.value = 'white';
  el.customColor.value = '#ffffff';

  el.customColorGroup.hidden = true;

  el.brightness.value = 100;
  el.brightnessValue.textContent = '100%';

  el.contrast.value = 100;
  el.contrastValue.textContent = '100%';

  el.format.value = 'image/jpeg';

  el.quality.value = 90;
  el.qualityValue.textContent = '90%';

  [
    el.preset,
    el.width,
    el.height,
    el.dpi,
    el.background,
    el.customColor,
    el.brightness,
    el.contrast,
    el.format,
    el.quality
  ].forEach(input => {
    input.disabled = true;
  });

  el.generateBtn.disabled = true;
  el.resetBtn.disabled = true;
  el.downloadBtn.disabled = true;

  el.summary.hidden = true;

  // Reset crop UI only if those optional elements exist.
  if (el.cropCanvas) {
    el.cropCanvas.hidden = true;
  }

  if (el.cropPlaceholder) {
    el.cropPlaceholder.hidden = false;
  }

  if (el.cropSection) {
    el.cropSection.hidden = true;
  }

  if (el.zoom) {
    el.zoom.disabled = true;
    el.zoom.value = 100;
  }

  if (el.resetCropBtn) {
    el.resetCropBtn.disabled = true;
  }

  if (el.zoomValue) {
    el.zoomValue.textContent = '100%';
  }

  cropRect = null;
  cropZoom = 100;

  imageOffsetX = 0;
  imageOffsetY = 0;

  cropDragging = false;
  cropPointerStart = null;
  cropInitialOffset = null;

  setStatus('', '');
}


/* ==========================================
   OBJECT URL CLEANUP
========================================== */

function releaseOriginalUrl() {
  if (originalObjectUrl) {
    URL.revokeObjectURL(originalObjectUrl);
    originalObjectUrl = null;
  }
}

function releaseOutputUrl() {
  if (outputObjectUrl) {
    URL.revokeObjectURL(outputObjectUrl);
    outputObjectUrl = null;
  }
}


/* ==========================================
   HELPERS
========================================== */

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


function getFormatName(format) {
  return {
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/webp': 'WebP'
  }[format] || 'Image';
}


function getExtension(format) {
  return {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  }[format] || 'jpg';
}


function setStatus(message, type) {
  el.status.textContent = message;
  el.status.className = 'tool-status';

  if (type) {
    el.status.classList.add(`status-${type}`);
  }
}


/* ==========================================
   INTERACTIVE PASSPORT CROP EDITOR
========================================== */

function initializeCropEditor() {
  if (!originalImage || !el.cropCanvas) {
    return;
  }

  const maxCanvasWidth = 850;
  const maxCanvasHeight = 850;

  cropCanvasScale = Math.min(
    1,
    maxCanvasWidth / originalImage.naturalWidth,
    maxCanvasHeight / originalImage.naturalHeight
  );

  const canvas = el.cropCanvas;

  canvas.width = Math.round(
    originalImage.naturalWidth * cropCanvasScale
  );

  canvas.height = Math.round(
    originalImage.naturalHeight * cropCanvasScale
  );

  canvas.hidden = false;

  if (el.cropPlaceholder) {
    el.cropPlaceholder.hidden = true;
  }

  if (el.cropSection) {
    el.cropSection.hidden = false;
  }

  if (el.zoom) {
    el.zoom.disabled = false;
  }

  if (el.resetCropBtn) {
    el.resetCropBtn.disabled = false;
  }

  cropZoom = 100;

  imageOffsetX = 0;
  imageOffsetY = 0;

  if (el.zoom) {
    el.zoom.value = 100;
  }

  if (el.zoomValue) {
    el.zoomValue.textContent = '100%';
  }

  createInitialCrop();

  drawCropEditor();
}


function getCropRatio() {
  const width = Number(el.width.value);
  const height = Number(el.height.value);

  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  ) {
    return 35 / 45;
  }

  return width / height;
}


function createInitialCrop() {
  // Crop editor is optional.
  if (!el.cropCanvas) {
    cropRect = null;
    return;
  }

  const canvas = el.cropCanvas;
  const ratio = getCropRatio();

  const maxWidth = canvas.width * 0.82;
  const maxHeight = canvas.height * 0.82;

  let width = maxWidth;
  let height = width / ratio;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * ratio;
  }

  cropRect = {
    x: (canvas.width - width) / 2,
    y: (canvas.height - height) / 2,
    width,
    height
  };

  imageOffsetX = 0;
  imageOffsetY = 0;

  cropZoom = 100;

  if (el.zoom) {
    el.zoom.value = 100;
  }

  if (el.zoomValue) {
    el.zoomValue.textContent = '100%';
  }
}


function resetCrop() {
  if (!originalImage || !el.cropCanvas) {
    return;
  }

  createInitialCrop();

  drawCropEditor();

  clearOutput();

  setStatus(
    'Crop position and zoom have been reset.',
    'success'
  );
}


function refreshCropRatio() {
  // Do not access crop methods if crop controls are absent.
  if (!originalImage || !el.cropCanvas) {
    return;
  }

  createInitialCrop();

  drawCropEditor();

  clearOutput();
}


function updateCropZoom() {
  if (
    !cropRect ||
    !originalImage ||
    !el.zoom
  ) {
    return;
  }

  const oldScale = cropZoom / 100;
  const newScale = Number(el.zoom.value) / 100;

  const centerX =
    cropRect.x + cropRect.width / 2;

  const centerY =
    cropRect.y + cropRect.height / 2;

  // Preserve the same point in the photograph
  // beneath the center of the crop frame.
  const sourceCenterX =
    (centerX - imageOffsetX) / oldScale;

  const sourceCenterY =
    (centerY - imageOffsetY) / oldScale;

  cropZoom = Number(el.zoom.value);

  imageOffsetX =
    centerX - sourceCenterX * newScale;

  imageOffsetY =
    centerY - sourceCenterY * newScale;

  clampImagePosition();
}


function clampImagePosition() {
  if (!cropRect || !el.cropCanvas) {
    return;
  }

  const scale = cropZoom / 100;

  const imageWidth =
    el.cropCanvas.width * scale;

  const imageHeight =
    el.cropCanvas.height * scale;

  const minX =
    cropRect.x + cropRect.width - imageWidth;

  const maxX = cropRect.x;

  const minY =
    cropRect.y + cropRect.height - imageHeight;

  const maxY = cropRect.y;

  imageOffsetX = Math.max(
    minX,
    Math.min(maxX, imageOffsetX)
  );

  imageOffsetY = Math.max(
    minY,
    Math.min(maxY, imageOffsetY)
  );
}


function drawCropEditor() {
  if (
    !originalImage ||
    !cropRect ||
    !el.cropCanvas
  ) {
    return;
  }

  const canvas = el.cropCanvas;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return;
  }

  const scale = cropZoom / 100;

  const imageWidth = canvas.width * scale;
  const imageHeight = canvas.height * scale;

  ctx.clearRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  // Draw the zoomed and repositioned photograph.
  ctx.drawImage(
    originalImage,
    imageOffsetX,
    imageOffsetY,
    imageWidth,
    imageHeight
  );

  // Darken the area outside the crop frame.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.58)';

  ctx.fillRect(
    0,
    0,
    canvas.width,
    canvas.height
  );

  // Reveal the photograph inside the crop frame.
  ctx.save();

  ctx.beginPath();

  ctx.rect(
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height
  );

  ctx.clip();

  ctx.drawImage(
    originalImage,
    imageOffsetX,
    imageOffsetY,
    imageWidth,
    imageHeight
  );

  ctx.restore();

  // Crop frame.
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = Math.max(
    2,
    canvas.width / 300
  );

  ctx.strokeRect(
    cropRect.x,
    cropRect.y,
    cropRect.width,
    cropRect.height
  );

  // Rule-of-thirds guides.
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 1;

  for (let i = 1; i <= 2; i++) {
    const x =
      cropRect.x + cropRect.width * i / 3;

    const y =
      cropRect.y + cropRect.height * i / 3;

    ctx.beginPath();

    ctx.moveTo(x, cropRect.y);

    ctx.lineTo(
      x,
      cropRect.y + cropRect.height
    );

    ctx.stroke();

    ctx.beginPath();

    ctx.moveTo(cropRect.x, y);

    ctx.lineTo(
      cropRect.x + cropRect.width,
      y
    );

    ctx.stroke();
  }

  // Corner handles are visual guides.
  const handleSize = Math.max(
    9,
    canvas.width / 55
  );

  const corners = [
    [cropRect.x, cropRect.y],
    [cropRect.x + cropRect.width, cropRect.y],
    [cropRect.x, cropRect.y + cropRect.height],
    [
      cropRect.x + cropRect.width,
      cropRect.y + cropRect.height
    ]
  ];

  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#174D43';
  ctx.lineWidth = 2;

  corners.forEach(([x, y]) => {
    ctx.fillRect(
      x - handleSize / 2,
      y - handleSize / 2,
      handleSize,
      handleSize
    );

    ctx.strokeRect(
      x - handleSize / 2,
      y - handleSize / 2,
      handleSize,
      handleSize
    );
  });
}


/* ==========================================
   IMAGE DRAGGING
========================================== */

function getCanvasPointer(event) {
  const rect =
    el.cropCanvas.getBoundingClientRect();

  return {
    x:
      (event.clientX - rect.left) *
      el.cropCanvas.width / rect.width,

    y:
      (event.clientY - rect.top) *
      el.cropCanvas.height / rect.height
  };
}


function handleCropPointerDown(event) {
  if (!cropRect || !originalImage || !el.cropCanvas) {
    return;
  }

  const point = getCanvasPointer(event);

  // Drag the photograph only when the pointer
  // starts inside the crop frame.
  const insideCrop =
    point.x >= cropRect.x &&
    point.x <= cropRect.x + cropRect.width &&
    point.y >= cropRect.y &&
    point.y <= cropRect.y + cropRect.height;

  if (!insideCrop) {
    return;
  }

  cropDragging = true;

  cropPointerStart = point;

  cropInitialOffset = {
    x: imageOffsetX,
    y: imageOffsetY
  };

  el.cropCanvas.setPointerCapture(event.pointerId);

  event.preventDefault();
}


function handleCropPointerMove(event) {
  if (!cropDragging || !cropPointerStart) {
    return;
  }

  const point = getCanvasPointer(event);

  const dx = point.x - cropPointerStart.x;
  const dy = point.y - cropPointerStart.y;

  imageOffsetX =
    cropInitialOffset.x + dx;

  imageOffsetY =
    cropInitialOffset.y + dy;

  clampImagePosition();

  drawCropEditor();

  clearOutput();
}


function handleCropPointerUp(event) {
  if (
    el.cropCanvas &&
    el.cropCanvas.hasPointerCapture &&
    el.cropCanvas.hasPointerCapture(event.pointerId)
  ) {
    el.cropCanvas.releasePointerCapture(event.pointerId);
  }

  cropDragging = false;

  cropPointerStart = null;
  cropInitialOffset = null;
}


/* ==========================================
   GET SELECTED CROP IN ORIGINAL PIXELS
========================================== */

function getSelectedSourceCrop(
  sourceWidth,
  sourceHeight
) {
  // Without the optional crop editor,
  // use an automatic center crop.
  if (!cropRect || !el.cropCanvas) {
    return calculateCenterCrop(
      sourceWidth,
      sourceHeight,
      getCropRatio()
    );
  }

  const scale = cropZoom / 100;

  const sourceScaleX =
    sourceWidth / el.cropCanvas.width;

  const sourceScaleY =
    sourceHeight / el.cropCanvas.height;

  return {
    x:
      ((cropRect.x - imageOffsetX) / scale) *
      sourceScaleX,

    y:
      ((cropRect.y - imageOffsetY) / scale) *
      sourceScaleY,

    width:
      (cropRect.width / scale) *
      sourceScaleX,

    height:
      (cropRect.height / scale) *
      sourceScaleY
  };
}


/* ==========================================
   START
========================================== */

initPassportEditor();