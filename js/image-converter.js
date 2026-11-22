import QRCode from "qrcode";
import { startScanUpload } from "./scan-upload.js";
const imageInput = document.getElementById('imageInput');
const uploadArea = document.getElementById('uploadArea');
const fileList = document.getElementById('fileList');

const formatSelect = document.getElementById('formatSelect');
const qualityInput = document.getElementById('qualityInput');
const qualityValue = document.getElementById('qualityValue');

const backgroundGroup = document.getElementById('backgroundGroup');
const backgroundColor = document.getElementById('backgroundColor');

const convertBtn = document.getElementById('convertBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

const previewPanel = document.getElementById('previewPanel');
const originalPreview = document.getElementById('originalPreview');
const convertedCanvas = document.getElementById('convertedCanvas');

const originalDimensions = document.getElementById('originalDimensions');
const convertedDimensions = document.getElementById('convertedDimensions');

const sizeComparison = document.getElementById('sizeComparison');
const originalFileSize = document.getElementById('originalFileSize');
const convertedFileSize = document.getElementById('convertedFileSize');
const sizeDifference = document.getElementById('sizeDifference');

const toolStatus = document.getElementById('toolStatus');
// RESAP Scan & Upload
const scanUploadBtn = document.getElementById("scanUploadBtn");
const scanUploadStatus = document.getElementById("scanUploadStatus");
const scanQrContainer = document.getElementById("scanQrContainer");
const scanQrCode = document.getElementById("scanQrCode");
const scanExpiry = document.getElementById("scanExpiry");
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXELS = 40000000;

const SUPPORTED_FORMATS = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

let selectedFile = null;
let originalImage = null;
let originalObjectURL = null;
let convertedBlob = null;

// Upload
uploadArea.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (event) => {
  const file = event.target.files?.[0];

  if (file) handleImage(file);

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

  if (file) handleImage(file);
});

// Load image
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

  let temporaryURL;

  try {
    showStatus('Loading image...');

    temporaryURL = URL.createObjectURL(file);

    const image = new Image();

    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('Unable to read image.'));
      image.src = temporaryURL;
    });

    if (image.naturalWidth * image.naturalHeight > MAX_PIXELS) {
      throw new Error('Image dimensions are too large to process safely.');
    }

    if (originalObjectURL) {
      URL.revokeObjectURL(originalObjectURL);
    }

    selectedFile = file;
    originalImage = image;
    originalObjectURL = temporaryURL;
    temporaryURL = null;
    convertedBlob = null;

    originalPreview.src = originalObjectURL;

    originalDimensions.textContent =
      `${image.naturalWidth} × ${image.naturalHeight} px`;

    convertedDimensions.textContent = 'Not converted yet';

    originalFileSize.textContent = formatFileSize(file.size);
    convertedFileSize.textContent = '—';
    sizeDifference.textContent = '—';

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
    qualityInput.disabled = false;
    backgroundColor.disabled = false;

    convertBtn.disabled = false;
    downloadBtn.disabled = true;
    resetBtn.disabled = false;

    updateFormatSettings();

    showStatus('Image uploaded successfully.');

  } catch (error) {
    console.error(error);
    showStatus(error.message || 'Image upload failed.', true);

  } finally {
    if (temporaryURL) {
      URL.revokeObjectURL(temporaryURL);
    }
  }
}

// Format settings
formatSelect.addEventListener('change', () => {
  updateFormatSettings();
  invalidateResult();
});

function updateFormatSettings() {
  const isPNG = formatSelect.value === 'image/png';
  const isJPG = formatSelect.value === 'image/jpeg';

  qualityInput.disabled = isPNG || !selectedFile;
  backgroundGroup.hidden = !isJPG;
  backgroundColor.disabled = !isJPG || !selectedFile;
}

qualityInput.addEventListener('input', () => {
  qualityValue.textContent = `${qualityInput.value}%`;
  invalidateResult();
});

backgroundColor.addEventListener('change', invalidateResult);

// Convert image
convertBtn.addEventListener('click', async () => {
  if (!originalImage || !selectedFile) {
    showStatus('Upload an image first.', true);
    return;
  }

  const mimeType = formatSelect.value;
  const quality = Number(qualityInput.value) / 100;

  convertBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    showStatus('Converting image...');

    const width = originalImage.naturalWidth;
    const height = originalImage.naturalHeight;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas is not supported by this browser.');
    }

    // JPG cannot preserve transparency.
    if (mimeType === 'image/jpeg') {
      context.fillStyle = backgroundColor.value;
      context.fillRect(0, 0, width, height);
    }

    context.drawImage(originalImage, 0, 0, width, height);

    convertedBlob = await canvasToBlob(
      canvas,
      mimeType,
      quality
    );

    if (convertedBlob.type !== mimeType) {
      throw new Error(`Your browser could not export ${mimeType}.`);
    }

    // Show converted preview
    const previewURL = URL.createObjectURL(convertedBlob);
    const previewImage = new Image();

    try {
      await new Promise((resolve, reject) => {
        previewImage.onload = resolve;
        previewImage.onerror = () => reject(
          new Error('Unable to display converted image.')
        );
        previewImage.src = previewURL;
      });

      convertedCanvas.width = width;
      convertedCanvas.height = height;

      const previewContext = convertedCanvas.getContext('2d');

      if (!previewContext) {
        throw new Error('Could not create preview.');
      }

      previewContext.drawImage(previewImage, 0, 0);

    } finally {
      URL.revokeObjectURL(previewURL);
    }

    convertedDimensions.textContent =
      `${width} × ${height} px`;

    convertedFileSize.textContent =
      formatFileSize(convertedBlob.size);

    const difference = selectedFile.size - convertedBlob.size;
    const percentage = Math.abs(
      difference / selectedFile.size * 100
    );

    if (difference > 0) {
      sizeDifference.textContent = `${percentage.toFixed(1)}% smaller`;
    } else if (difference < 0) {
      sizeDifference.textContent = `${percentage.toFixed(1)}% larger`;
    } else {
      sizeDifference.textContent = 'Same file size';
    }

    sizeComparison.hidden = false;

    downloadBtn.disabled = false;

    showStatus('Image converted successfully.');

  } catch (error) {
    console.error(error);
    convertedBlob = null;
    showStatus(error.message || 'Conversion failed.', true);

  } finally {
    convertBtn.disabled = false;
  }
});

// Canvas export
function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
      } else {
        reject(new Error('Could not convert image.'));
      }
    }, type, quality);
  });
}

// Download
downloadBtn.addEventListener('click', () => {
  if (!convertedBlob || !selectedFile) return;

  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };

  const originalName = selectedFile.name.replace(/\.[^.]+$/, '');

  const filename =
    `${sanitizeFilename(originalName)}-converted.${extensions[formatSelect.value]}`;

  const downloadURL = URL.createObjectURL(convertedBlob);
  const link = document.createElement('a');

  link.href = downloadURL;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(downloadURL), 1000);

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
  convertedBlob = null;

  imageInput.value = '';
  fileList.replaceChildren();

  originalPreview.removeAttribute('src');

  convertedCanvas.width = 0;
  convertedCanvas.height = 0;

  originalDimensions.textContent = '—';
  convertedDimensions.textContent = '—';

  originalFileSize.textContent = '—';
  convertedFileSize.textContent = '—';
  sizeDifference.textContent = '—';

  sizeComparison.hidden = true;
  previewPanel.hidden = true;

  formatSelect.value = 'image/jpeg';
  qualityInput.value = 95;
  qualityValue.textContent = '95%';
  backgroundColor.value = '#ffffff';

  formatSelect.disabled = true;
  qualityInput.disabled = true;
  backgroundColor.disabled = true;

  backgroundGroup.hidden = true;

  convertBtn.disabled = true;
  downloadBtn.disabled = true;
  resetBtn.disabled = true;

  showStatus('Upload an image to begin.');
});

// Clear old output when settings change
function invalidateResult() {
  convertedBlob = null;
  downloadBtn.disabled = true;
  sizeComparison.hidden = true;

  if (originalImage) {
    convertedDimensions.textContent = 'Settings changed. Convert again.';
  }
}

// Helpers
function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '-').trim() || 'image';
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
    const session = await startScanUpload((file) => {
      return handleImage(file);
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

    await QRCode.toCanvas(scanQrCode, phoneUrl, {
      width: 220,
      margin: 2,
    });

    scanQrContainer.hidden = false;

    scanUploadStatus.textContent =
      "Scan this QR code using your phone.";

    const expiryTime = new Date(session.expiresAt);

    scanExpiry.textContent =
      `Session expires at ${expiryTime.toLocaleTimeString()}`;

  } catch (error) {
    console.error("Scan & Upload error:", error);

    scanUploadStatus.textContent =
      error.message || "Could not create upload session.";

    scanUploadBtn.disabled = false;
  }
});