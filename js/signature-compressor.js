
/**
 * RESAP — Signature Compressor
 * Compress signature images directly in the browser.
 */
import QRCode from "qrcode";
import { startScanUpload } from "./scan-upload.js";
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_DIMENSION = 10_000;

const elements = {
  uploadArea: document.getElementById('signatureCompressUploadArea'),
  fileInput: document.getElementById('signatureCompressInput'),

  targetSize: document.getElementById('signatureTargetSize'),
  quality: document.getElementById('signatureCompressQuality'),
  qualityValue: document.getElementById('signatureQualityValue'),
  format: document.getElementById('signatureCompressFormat'),

  compressBtn: document.getElementById('compressSignatureBtn'),
  resetBtn: document.getElementById('resetSignatureCompressBtn'),
  downloadBtn: document.getElementById('downloadCompressedSignatureBtn'),

  originalPreview: document.getElementById(
    'signatureCompressOriginalPreview'
  ),
  originalPlaceholder: document.getElementById(
    'signatureCompressOriginalPlaceholder'
  ),
  originalInfo: document.getElementById(
    'signatureCompressOriginalInfo'
  ),

  resultPreview: document.getElementById(
    'signatureCompressResultPreview'
  ),
  resultPlaceholder: document.getElementById(
    'signatureCompressResultPlaceholder'
  ),
  resultInfo: document.getElementById(
    'signatureCompressResultInfo'
  ),

  summary: document.getElementById('signatureCompressSummary'),
  savings: document.getElementById('signatureCompressSavings'),

  status: document.getElementById('signatureCompressStatus'),
  scanUploadBtn: document.getElementById(
    'signatureCompressScanUploadBtn'
),

scanUploadContent: document.getElementById(
    'signatureCompressScanQrContainer'
),

scanQrCode: document.getElementById(
    'signatureCompressScanQrCode'
),

scanUploadStatus: document.getElementById(
    'signatureCompressStatus'
),

scanExpiry: document.getElementById(
    'signatureCompressScanExpiry'
),
};

let originalFile = null;
let originalImage = null;
let originalObjectUrl = null;
let resultObjectUrl = null;
let compressedBlob = null;


// ------------------------------------------
// INITIALIZATION
// ------------------------------------------

function initSignatureCompressor() {
  if (!elements.uploadArea || !elements.fileInput) {
    console.error('Signature Compressor HTML elements were not found.');
    return;
  }

  elements.uploadArea.addEventListener('click', () => {
    elements.fileInput.click();
  });

  elements.fileInput.addEventListener('change', handleFileSelect);

  elements.uploadArea.addEventListener('dragover', (event) => {
    event.preventDefault();
    elements.uploadArea.classList.add('drag-over');
  });

  elements.uploadArea.addEventListener('dragleave', () => {
    elements.uploadArea.classList.remove('drag-over');
  });

  elements.uploadArea.addEventListener('drop', (event) => {
    event.preventDefault();
    elements.uploadArea.classList.remove('drag-over');

    const file = event.dataTransfer.files[0];

    if (file) {
      loadSignature(file);
    }
  });

  elements.quality.addEventListener('input', () => {
    elements.qualityValue.textContent =
      `${elements.quality.value}%`;
  });

  elements.compressBtn.addEventListener(
    'click',
    compressSignature
  );

  elements.resetBtn.addEventListener('click', resetSignature);

  elements.downloadBtn.addEventListener(
    'click',
    downloadSignature
  );

  elements.format.addEventListener('change', () => {
    clearResult();
    setStatus(
      'Output format changed. Compress again to generate the new format.',
      'info'
    );
  });

  elements.targetSize.addEventListener('input', () => {
    clearResult();
  });

  elements.quality.addEventListener('change', () => {
    clearResult();
  });
  elements.scanUploadBtn.addEventListener(
    'click',
    handleScanUpload
);

  setStatus('', '');
}


// ------------------------------------------
// FILE SELECTION
// ------------------------------------------

function handleFileSelect(event) {
  const file = event.target.files[0];

  if (file) {
    loadSignature(file);
  }

  // Allows selecting the same file again.
  event.target.value = '';
}


async function loadSignature(file) {
  clearResult();
  setStatus('', '');

  if (!file.type.startsWith('image/')) {
    setStatus('Please upload a valid image file.', 'error');
    return;
  }

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

  if (!allowedTypes.includes(file.type)) {
    setStatus('Only JPG, PNG and WebP files are supported.', 'error');
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    setStatus('File size exceeds the 10 MB limit.', 'error');
    return;
  }

  if (file.size === 0) {
    setStatus('The selected file is empty.', 'error');
    return;
  }

  try {
    const image = await loadImage(file);

    const pixels = image.naturalWidth * image.naturalHeight;

    if (
      image.naturalWidth > MAX_IMAGE_DIMENSION ||
      image.naturalHeight > MAX_IMAGE_DIMENSION ||
      pixels > MAX_IMAGE_PIXELS
    ) {
      setStatus(
        'Image dimensions are too large. Maximum allowed: 10,000 px per side and 40 megapixels.',
        'error'
      );
      return;
    }

    releaseOriginalUrl();

    originalFile = file;
    originalImage = image;

    originalObjectUrl = URL.createObjectURL(file);

    elements.originalPreview.src = originalObjectUrl;
    elements.originalPreview.hidden = false;
    elements.originalPlaceholder.hidden = true;

    elements.originalInfo.textContent =
      `${file.name} · ${formatFileSize(file.size)} · ` +
      `${image.naturalWidth} × ${image.naturalHeight} px`;

    enableControls();

    setStatus(
      'Signature uploaded successfully. Adjust the settings and compress.',
      'success'
    );

  } catch (error) {
    console.error(error);
    setStatus('Unable to load this image. Please try another file.', 'error');
  }
}


// ------------------------------------------
// IMAGE LOADING
// ------------------------------------------

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


// ------------------------------------------
// ENABLE / DISABLE CONTROLS
// ------------------------------------------

function enableControls() {
  elements.targetSize.disabled = false;
  elements.quality.disabled = false;
  elements.format.disabled = false;

  elements.compressBtn.disabled = false;
  elements.resetBtn.disabled = false;
}


// ------------------------------------------
// COMPRESSION
// ------------------------------------------

async function compressSignature() {
  if (!originalImage || !originalFile) {
    setStatus('Please upload a signature first.', 'error');
    return;
  }

  const targetKB = Number(elements.targetSize.value);
  const quality = Number(elements.quality.value) / 100;
  const outputFormat = elements.format.value;

  if (
    !Number.isFinite(targetKB) ||
    targetKB < 1 ||
    targetKB > 2048
  ) {
    setStatus('Enter a target file size between 1 and 2048 KB.', 'error');
    return;
  }

  if (quality < 0.1 || quality > 1) {
    setStatus('Invalid image quality.', 'error');
    return;
  }

  const targetBytes = targetKB * 1024;

  elements.compressBtn.disabled = true;
  elements.downloadBtn.disabled = true;

  setStatus('Compressing your signature...', 'info');

  try {
    await new Promise(resolve => setTimeout(resolve, 50));

    const canvas = document.createElement('canvas');

    canvas.width = originalImage.naturalWidth;
    canvas.height = originalImage.naturalHeight;

    const context = canvas.getContext('2d');

    if (!context) {
      throw new Error('Canvas is not supported by this browser.');
    }

    // JPG does not support transparency, so use a white background.
    if (outputFormat === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
    }

    context.drawImage(
      originalImage,
      0,
      0,
      canvas.width,
      canvas.height
    );

    let result;

    if (outputFormat === 'image/png') {
      // PNG is lossless. The quality setting does not apply.
      result = await canvasToBlob(canvas, outputFormat);
    } else {
      result = await findBestQuality(
        canvas,
        outputFormat,
        targetBytes,
        quality
      );
    }

    compressedBlob = result.blob;

    releaseResultUrl();

    resultObjectUrl = URL.createObjectURL(compressedBlob);

    elements.resultPreview.src = resultObjectUrl;
    elements.resultPreview.hidden = false;
    elements.resultPlaceholder.hidden = true;

    elements.resultInfo.textContent =
      `${getFormatName(outputFormat)} · ` +
      `${formatFileSize(compressedBlob.size)} · ` +
      `${canvas.width} × ${canvas.height} px`;

    showCompressionSummary(
      originalFile.size,
      compressedBlob.size
    );

    elements.downloadBtn.disabled = false;

    if (compressedBlob.size <= targetBytes) {
      setStatus(
        'Compression completed. Your signature meets the target file size.',
        'success'
      );
    } else {
      setStatus(
        'Compression completed, but the target size could not be reached without further quality reduction. Try a larger target size or another format.',
        'warning'
      );
    }

  } catch (error) {
    console.error(error);
    setStatus(
      error.message || 'Compression failed. Please try again.',
      'error'
    );
  } finally {
    elements.compressBtn.disabled = false;
  }
}


// ------------------------------------------
// FIND BEST QUALITY FOR TARGET SIZE
// ------------------------------------------

async function findBestQuality(
  canvas,
  format,
  targetBytes,
  selectedQuality
) {
  let low = 0.05;
  let high = selectedQuality;

  let bestBlob = await canvasToBlob(
    canvas,
    format,
    low
  );

  if (bestBlob.size > targetBytes) {
    return { blob: bestBlob };
  }

  for (let i = 0; i < 12; i++) {
    const middle = (low + high) / 2;

    const blob = await canvasToBlob(
      canvas,
      format,
      middle
    );

    if (blob.size <= targetBytes) {
      low = middle;
      bestBlob = blob;
    } else {
      high = middle;
    }
  }

  return { blob: bestBlob };
}


// ------------------------------------------
// CANVAS TO BLOB
// ------------------------------------------

function canvasToBlob(canvas, format, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error('Image compression failed.'));
          return;
        }

        resolve(blob);
      },
      format,
      quality
    );
  });
}


// ------------------------------------------
// COMPRESSION SUMMARY
// ------------------------------------------

function showCompressionSummary(originalSize, compressedSize) {
  elements.summary.hidden = false;

  const difference = originalSize - compressedSize;
  const percentage = (difference / originalSize) * 100;

  if (difference > 0) {
    elements.savings.textContent =
      `Reduced by ${formatFileSize(difference)} ` +
      `(${percentage.toFixed(1)}%).`;
  } else if (difference < 0) {
    elements.savings.textContent =
      `Output is ${formatFileSize(Math.abs(difference))} larger ` +
      `than the original (${Math.abs(percentage).toFixed(1)}% increase).`;
  } else {
    elements.savings.textContent =
      'The output file has the same size as the original.';
  }
}


// ------------------------------------------
// DOWNLOAD
// ------------------------------------------

function downloadSignature() {
  if (!compressedBlob) {
    setStatus('Please compress your signature first.', 'error');
    return;
  }

  const format = elements.format.value;
  const extension = getExtension(format);

  const originalName = originalFile.name.replace(/\.[^.]+$/, '');
  const filename = `${originalName}-compressed.${extension}`;

  const link = document.createElement('a');

  link.href = resultObjectUrl;
  link.download = filename;

  document.body.appendChild(link);
  link.click();
  link.remove();
}


// ------------------------------------------
// RESET
// ------------------------------------------

function resetSignature() {
  originalFile = null;
  originalImage = null;
  compressedBlob = null;

  releaseOriginalUrl();
  releaseResultUrl();

  elements.fileInput.value = '';

  elements.originalPreview.removeAttribute('src');
  elements.originalPreview.hidden = true;
  elements.originalPlaceholder.hidden = false;

  elements.resultPreview.removeAttribute('src');
  elements.resultPreview.hidden = true;
  elements.resultPlaceholder.hidden = false;

  elements.originalInfo.textContent = 'No image uploaded';
  elements.resultInfo.textContent = 'No output generated';

  elements.summary.hidden = true;
  elements.savings.textContent = '';

  elements.targetSize.value = 50;
  elements.quality.value = 80;
  elements.qualityValue.textContent = '80%';
  elements.format.value = 'image/jpeg';

  elements.targetSize.disabled = true;
  elements.quality.disabled = true;
  elements.format.disabled = true;

  elements.compressBtn.disabled = true;
  elements.resetBtn.disabled = true;
  elements.downloadBtn.disabled = true;

  setStatus('', '');
}


// ------------------------------------------
// CLEAR PREVIOUS RESULT
// ------------------------------------------

function clearResult() {
  compressedBlob = null;

  releaseResultUrl();

  elements.resultPreview.removeAttribute('src');
  elements.resultPreview.hidden = true;
  elements.resultPlaceholder.hidden = false;

  elements.resultInfo.textContent = 'No output generated';

  elements.summary.hidden = true;
  elements.savings.textContent = '';

  elements.downloadBtn.disabled = true;
}


// ------------------------------------------
// OBJECT URL CLEANUP
// ------------------------------------------

function releaseOriginalUrl() {
  if (originalObjectUrl) {
    URL.revokeObjectURL(originalObjectUrl);
    originalObjectUrl = null;
  }
}

function releaseResultUrl() {
  if (resultObjectUrl) {
    URL.revokeObjectURL(resultObjectUrl);
    resultObjectUrl = null;
  }
}


// ------------------------------------------
// HELPERS
// ------------------------------------------

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
  const formats = {
    'image/jpeg': 'JPG',
    'image/png': 'PNG',
    'image/webp': 'WebP'
  };

  return formats[format] || 'Image';
}


function getExtension(format) {
  const extensions = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };

  return extensions[format] || 'png';
}


function setStatus(message, type) {
  elements.status.textContent = message;
  elements.status.className = 'tool-status';

  if (type) {
    elements.status.classList.add(`status-${type}`);
  }
}


// ------------------------------------------
// START TOOL
// ------------------------------------------

initSignatureCompressor();
// ------------------------------------------
// SCAN & UPLOAD FROM PHONE
// ------------------------------------------

async function handleScanUpload() {

    elements.scanUploadBtn.disabled = true;

    setStatus('Generating QR code...', 'info');

    elements.scanUploadContent.hidden = true;

    try {

        const session = await startScanUpload((file) => {
            return loadSignature(file);
        });

        const networkResponse = await fetch(
            "http://localhost:3001/api/network-info"
        );

        if (!networkResponse.ok) {
            throw new Error(
                "Unable to detect laptop network address."
            );
        }

        const networkInfo = await networkResponse.json();

        const phoneUrl =
            `http://${networkInfo.address}:3000/scan-upload.html?session=${encodeURIComponent(session.sessionId)}`;

        await QRCode.toCanvas(
            elements.scanQrCode,
            phoneUrl,
            {
                width: 220,
                margin: 2
            }
        );

        elements.scanUploadContent.hidden = false;

        setStatus(
            "Scan this QR code using your phone.",
            "info"
        );

        const expiryTime = new Date(session.expiresAt);

        elements.scanExpiry.textContent =
            `Session expires at ${expiryTime.toLocaleTimeString()}`;

    } catch (error) {

        console.error("Scan & Upload error:", error);

        elements.scanUploadContent.hidden = true;

        setStatus(
            error.message || "Could not create upload session.",
            "error"
        );

        elements.scanUploadBtn.disabled = false;
    }
}