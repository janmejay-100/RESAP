
import QRCode from "qrcode";
import { startScanUpload } from "./scan-upload.js";

import {
  formatFileSize,
  sanitizeFilename,
  downloadBlob,
  loadImage
} from "./utils.js";

// DOM elements
const imageInput = document.getElementById('imageInput');
const uploadArea = document.getElementById('uploadArea');
const fileList = document.getElementById('fileList');

const qualityInput = document.getElementById('qualityInput');
const qualityValue = document.getElementById('qualityValue');
const targetSizeInput = document.getElementById('targetSizeInput');
const formatSelect = document.getElementById('formatSelect');

const compressBtn = document.getElementById('compressBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

const previewPanel = document.getElementById('previewPanel');
const originalPreview = document.getElementById('originalPreview');
const compressedCanvas = document.getElementById('compressedCanvas');

const originalDimensions = document.getElementById('originalDimensions');
const compressedDimensions = document.getElementById('compressedDimensions');

const sizeComparison = document.getElementById('sizeComparison');
const originalFileSize = document.getElementById('originalFileSize');
const compressedFileSize = document.getElementById('compressedFileSize');
const sizeReduction = document.getElementById('sizeReduction');

const toolStatus = document.getElementById('toolStatus');
// RESAP Scan & Upload
const scanUploadBtn = document.getElementById("scanUploadBtn");
const scanUploadStatus = document.getElementById("scanUploadStatus");
const scanQrContainer = document.getElementById("scanQrContainer");
const scanQrCode = document.getElementById("scanQrCode");
const scanExpiry = document.getElementById("scanExpiry");

// State
let selectedFile = null;
let originalImage = null;
let originalObjectURL = null;
let compressedBlob = null;

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXELS = 40000000;

const SUPPORTED_FORMATS = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

// Upload
uploadArea.addEventListener('click', () => {
  imageInput.click();
});

imageInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];

  if (file) {
    handleImage(file);
  }

  imageInput.value = '';
});

// Drag and drop
uploadArea.addEventListener('dragover', (event) => {
  event.preventDefault();
  uploadArea.classList.add('drag-over');
});

uploadArea.addEventListener('dragleave', () => {
  uploadArea.classList.remove('drag-over');
});

uploadArea.addEventListener('drop', (event) => {
  event.preventDefault();
  uploadArea.classList.remove('drag-over');

  const file = event.dataTransfer.files?.[0];

  if (file) {
    handleImage(file);
  }
});

// Load selected image
async function handleImage(file) {
if (!SUPPORTED_FORMATS.includes(file.type)) {
  scanUploadStatus.textContent =
    `${file.name}: Please upload a valid image file.`;

  scanUploadStatus.style.color = '#c0392b';
  return;
}
 // Clear previous upload error
  scanUploadStatus.textContent = "Image uploaded successfully.";
  scanUploadStatus.style.color = "";

  if (!file.size || file.size > MAX_FILE_SIZE) {
    showStatus('Image must be smaller than 20 MB.', true);
    return;
  }

  let newObjectURL;

  try {
    showStatus('Loading image...');

    const image = await loadImage(file);

    if (image.naturalWidth * image.naturalHeight > MAX_PIXELS) {
      showStatus('This image has too many pixels to process safely.', true);
      return;
    }

    newObjectURL = URL.createObjectURL(file);

    if (originalObjectURL) {
      URL.revokeObjectURL(originalObjectURL);
    }

    selectedFile = file;
    originalImage = image;
    originalObjectURL = newObjectURL;
    compressedBlob = null;

    originalPreview.src = originalObjectURL;

    originalDimensions.textContent =
      `${image.naturalWidth} × ${image.naturalHeight} px`;

    originalFileSize.textContent = formatFileSize(file.size);

    compressedDimensions.textContent = 'Not compressed yet';
    compressedFileSize.textContent = '—';
    sizeReduction.textContent = '—';
    sizeComparison.hidden = true;

    previewPanel.hidden = false;

    const item = document.createElement('div');
    item.className = 'file-list-item';

    const name = document.createElement('div');
    name.className = 'file-name';
    name.textContent = file.name;

    const meta = document.createElement('div');
    meta.className = 'file-meta';
    meta.textContent = formatFileSize(file.size);

    item.replaceChildren(name, meta);
    fileList.replaceChildren(item);

    formatSelect.disabled = false;

const isPNG = formatSelect.value === 'image/png';

qualityInput.disabled = isPNG;
targetSizeInput.disabled = isPNG;

    compressBtn.disabled = false;
    downloadBtn.disabled = true;
    resetBtn.disabled = false;

    showStatus('Image uploaded successfully.');

  } catch (error) {
    console.error(error);

    if (newObjectURL) {
      URL.revokeObjectURL(newObjectURL);
    }

    showStatus('Unable to load this image. Try another file.', true);
  }
}

// Quality slider
qualityInput.addEventListener('input', () => {
  qualityValue.textContent = `${qualityInput.value}%`;
  invalidateResult();
});

// Output format

formatSelect.addEventListener('change', () => {
  invalidateResult();

  const isPNG = formatSelect.value === 'image/png';

  qualityInput.disabled = isPNG || !selectedFile;
  targetSizeInput.disabled = isPNG || !selectedFile;

  if (isPNG) {
    showStatus(
      'PNG is lossless. Quality and target-size controls are unavailable for PNG.'
    );
  } else {
    showStatus('Output format changed. Compress again to apply it.');
  }
});


// Compression
compressBtn.addEventListener('click', async () => {
  if (!originalImage || !selectedFile) {
    showStatus('Upload an image first.', true);
    return;
  }

  const quality = Number(qualityInput.value) / 100;
  const targetKB = Number(targetSizeInput.value);
  const mimeType = formatSelect.value;

  if (
    targetSizeInput.value.trim() !== '' &&
    (!Number.isFinite(targetKB) || targetKB <= 0 || targetKB > 20000)
  ) {
    showStatus('Enter a target size between 1 and 20,000 KB.', true);
    return;
  }

  compressBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    showStatus('Compressing image...');

    const canvas = document.createElement('canvas');
    const width = originalImage.naturalWidth;
    const height = originalImage.naturalHeight;

    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas is not supported by this browser.');
    }

    // JPG does not support transparency.
    if (mimeType === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }

    context.drawImage(originalImage, 0, 0, width, height);

    const targetBytes = targetKB > 0
      ? targetKB * 1024
      : null;

    if (mimeType === 'image/png') {
      // PNG is lossless. Canvas ignores the quality argument for PNG.
      compressedBlob = await canvasToBlob(canvas, mimeType);

    } else if (targetBytes) {
      // Binary search for a quality close to the requested file size.
      compressedBlob = await compressToTarget(
        canvas,
        mimeType,
        targetBytes,
        quality
      );

    } else {
      compressedBlob = await canvasToBlob(
        canvas,
        mimeType,
        quality
      );
    }

    if (compressedBlob.type !== mimeType) {
      throw new Error(`Your browser could not export ${mimeType}.`);
    }

    // Display the result
    const resultURL = URL.createObjectURL(compressedBlob);
    const resultImage = new Image();

    await new Promise((resolve, reject) => {
      resultImage.onload = resolve;
      resultImage.onerror = reject;
      resultImage.src = resultURL;
    });

    compressedCanvas.width = resultImage.naturalWidth;
    compressedCanvas.height = resultImage.naturalHeight;

    const outputContext = compressedCanvas.getContext('2d');
    outputContext.drawImage(resultImage, 0, 0);

    URL.revokeObjectURL(resultURL);

    compressedDimensions.textContent =
      `${width} × ${height} px`;

    compressedFileSize.textContent =
      formatFileSize(compressedBlob.size);

    const difference = selectedFile.size - compressedBlob.size;
    const percentage = Math.abs(
      difference / selectedFile.size * 100
    );

    if (difference > 0) {
      sizeReduction.textContent = `${percentage.toFixed(1)}% smaller`;
    } else if (difference < 0) {
      sizeReduction.textContent = `${percentage.toFixed(1)}% larger`;
    } else {
      sizeReduction.textContent = 'Same file size';
    }

    sizeComparison.hidden = false;
    downloadBtn.disabled = false;

    if (mimeType === 'image/png') {
      showStatus(
        'PNG exported without lossy quality reduction. File size may not decrease.'
      );
    } else if (targetBytes && compressedBlob.size > targetBytes) {
      showStatus(
        'The target size could not be reached at the minimum quality. The actual size is shown.'
      );
    } else {
      showStatus('Image compressed successfully.');
    }

  } catch (error) {
    console.error(error);
    compressedBlob = null;
    showStatus(error.message || 'Image compression failed.', true);

  } finally {
    compressBtn.disabled = false;
  }
});

// Try to get close to target size by adjusting quality.
async function compressToTarget(canvas, mimeType, targetBytes, preferredQuality) {
  let low = 0.1;
  let high = preferredQuality;

  let bestBlob = await canvasToBlob(canvas, mimeType, low);

  if (bestBlob.size > targetBytes) {
    return bestBlob;
  }

  for (let attempt = 0; attempt < 8; attempt++) {
    const middle = (low + high) / 2;
    const candidate = await canvasToBlob(canvas, mimeType, middle);

    if (candidate.size <= targetBytes) {
      bestBlob = candidate;
      low = middle;
    } else {
      high = middle;
    }
  }

  return bestBlob;
}

// Canvas export helper
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Could not create compressed image.'));
      }
    }, type, quality);
  });
}

// Download
downloadBtn.addEventListener('click', () => {
  if (!compressedBlob || !selectedFile) return;

  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };

  const baseName = selectedFile.name.replace(/\.[^.]+$/, '');
  const filename = sanitizeFilename(
    `${baseName}-compressed.${extensions[formatSelect.value]}`
  );

  downloadBlob(compressedBlob, filename);
  showStatus('Download started.');
});

// Reset
resetBtn.addEventListener('click', () => {
  if (originalObjectURL) {
    URL.revokeObjectURL(originalObjectURL);
  }

  selectedFile = null;
  originalImage = null;
  originalObjectURL = null;
  compressedBlob = null;

  imageInput.value = '';
  fileList.replaceChildren();

  originalPreview.removeAttribute('src');

  compressedCanvas.width = 0;
  compressedCanvas.height = 0;

  originalDimensions.textContent = '—';
  compressedDimensions.textContent = '—';

  originalFileSize.textContent = '—';
  compressedFileSize.textContent = '—';
  sizeReduction.textContent = '—';

  sizeComparison.hidden = true;
  previewPanel.hidden = true;

  qualityInput.value = 90;
  qualityValue.textContent = '90%';

  targetSizeInput.value = 100;
  formatSelect.value = 'image/jpeg';

  qualityInput.disabled = true;
  targetSizeInput.disabled = true;
  formatSelect.disabled = true;

  compressBtn.disabled = true;
  downloadBtn.disabled = true;
  resetBtn.disabled = true;

  showStatus('Upload an image to begin.');
});

// Invalidate previous result when settings change
function invalidateResult() {
  compressedBlob = null;
  downloadBtn.disabled = true;
  sizeComparison.hidden = true;

  if (originalImage) {
    compressedDimensions.textContent = 'Settings changed. Compress again.';
  }
}

function showStatus(message, isError = false) {
  toolStatus.textContent = message;
  toolStatus.style.color = isError ? '#c0392b' : '';
}
// RESAP Scan & Upload
scanUploadBtn.addEventListener("click", async () => {
  scanUploadBtn.disabled = true;

  scanUploadStatus.textContent = "Generating QR code...";

  try {
    // Create upload session
    const session = await startScanUpload((file) => {
      return handleImage(file);
    });

    // Detect laptop's current network IP
    const networkResponse = await fetch(
      "http://localhost:3001/api/network-info"
    );

    if (!networkResponse.ok) {
      throw new Error("Unable to detect laptop network address.");
    }

    const networkInfo = await networkResponse.json();

    // Create QR URL using the detected IP
    const phoneUrl =
      `http://${networkInfo.address}:3000/scan-upload.html?session=${encodeURIComponent(session.sessionId)}`;

    console.log("Scan & Upload URL:", phoneUrl);

    // Generate QR code
    await QRCode.toCanvas(
      scanQrCode,
      phoneUrl,
      {
        width: 220,
        margin: 2,
      }
    );

    scanQrContainer.hidden = false;

    scanUploadStatus.textContent =
      "Scan this QR code using your phone.";

    const expiryTime = new Date(session.expiresAt);

    scanExpiry.textContent =
      `Session expires at ${expiryTime.toLocaleTimeString()}`;

  } catch (error) {
    console.error(error);

    scanUploadStatus.textContent =
      error.message ||
      "Could not create upload session.";

    scanUploadBtn.disabled = false;
  }
});
