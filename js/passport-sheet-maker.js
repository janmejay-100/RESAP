import QRCode from "qrcode";
import { startScanUpload } from "./scan-upload.js";
import { jsPDF } from 'jspdf';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const MAX_DIMENSION = 10000;

const el = {
  uploadArea: document.getElementById('sheetUploadArea'),
  fileInput: document.getElementById('sheetImageInput'),

  photoSize: document.getElementById('sheetPhotoSize'),
  photoWidth: document.getElementById('sheetPhotoWidth'),
  photoHeight: document.getElementById('sheetPhotoHeight'),

  paperSize: document.getElementById('sheetPaperSize'),
  orientation: document.getElementById('sheetOrientation'),
  dpi: document.getElementById('sheetDpi'),

  photoCount: document.getElementById('sheetPhotoCount'),
  spacing: document.getElementById('sheetSpacing'),
  margin: document.getElementById('sheetMargin'),
  background: document.getElementById('sheetBackground'),

  outputFormat: document.getElementById('sheetOutputFormat'),

  generateBtn: document.getElementById('generateSheetBtn'),
  resetBtn: document.getElementById('resetSheetBtn'),
  downloadBtn: document.getElementById('downloadSheetBtn'),

  originalPreview: document.getElementById('sheetOriginalPreview'),
  originalPlaceholder: document.getElementById('sheetOriginalPlaceholder'),
  originalInfo: document.getElementById('sheetOriginalInfo'),

  previewContainer: document.getElementById('sheetPreviewContainer'),
  resultCanvas: document.getElementById('sheetResultCanvas'),
  resultPlaceholder: document.getElementById('sheetResultPlaceholder'),
  resultInfo: document.getElementById('sheetResultInfo'),

  summary: document.getElementById('sheetOutputSummary'),
  outputPaper: document.getElementById('sheetOutputPaper'),
  outputCount: document.getElementById('sheetOutputCount'),
  outputDimensions: document.getElementById('sheetOutputDimensions'),

  status: document.getElementById('sheetStatus')
  
};
const scanUploadBtn = document.getElementById("scanUploadBtn");
const scanUploadStatus = document.getElementById("scanUploadStatus");
const scanQrContainer = document.getElementById("scanQrContainer");
const scanQrCode = document.getElementById("scanQrCode");
const scanExpiry = document.getElementById("scanExpiry");

const photoPresets = {
  '35x45': { width: 35, height: 45 },
  '2x2': { width: 50.8, height: 50.8 },
  '25x35': { width: 25, height: 35 }
};

const paperPresets = {
  a4: { width: 210, height: 297, name: 'A4' },
  a5: { width: 148, height: 210, name: 'A5' },
  '4x6': { width: 101.6, height: 152.4, name: '4 × 6 inches' }
};

let originalFile = null;
let originalImage = null;
let originalObjectUrl = null;

let outputBlob = null;
let outputObjectUrl = null;
let generatedLayout = null;

let isGenerating = false;

/* ==========================================
   INITIALIZATION
========================================== */

function initSheetMaker() {
  if (!el.uploadArea || !el.fileInput) {
    console.error('Passport Sheet Maker elements not found.');
    return;
  }

  el.uploadArea.addEventListener('click', () => {
    el.fileInput.click();
  });

  el.fileInput.addEventListener('change', event => {
    const file = event.target.files[0];

    if (file) {
      loadSheetImage(file);
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
      loadSheetImage(file);
    }
  });

  el.photoSize.addEventListener('change', handlePhotoSizeChange);

  [
    el.photoWidth,
    el.photoHeight,
    el.paperSize,
    el.orientation,
    el.dpi,
    el.photoCount,
    el.spacing,
    el.margin,
    el.background
  ].forEach(input => {
    input.addEventListener('change', clearOutput);
    input.addEventListener('input', clearOutput);
  });

  el.outputFormat.addEventListener('change', () => {
    if (outputBlob) {
      setStatus(
        'Output format changed. Generate the sheet again before downloading.',
        'info'
      );
    }
    el.downloadBtn.disabled = true;
    outputBlob = null;
    releaseOutputUrl();
  });

  el.generateBtn.addEventListener('click', generateSheet);
  el.resetBtn.addEventListener('click', resetSheetMaker);
  el.downloadBtn.addEventListener('click', downloadSheet);
  scanUploadBtn.addEventListener("click", async () => {
  try {
    scanUploadStatus.textContent = "Generating QR code...";

    const session = await startScanUpload((file) => {
      loadSheetImage(file);
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
      margin: 2
    });

    scanQrContainer.hidden = false;

    scanUploadStatus.textContent =
      "Scan this QR code using your phone.";

    scanExpiry.textContent =
      `Session expires at ${new Date(session.expiresAt).toLocaleTimeString()}`;

  } catch (error) {
    console.error(error);

    scanUploadStatus.textContent =
      error.message || "Unable to start phone upload.";
  }
});

  setStatus('', '');
}

/* ==========================================
   IMAGE UPLOAD
========================================== */

async function loadSheetImage(file) {
  clearOutput();
  setStatus('', '');

  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/webp'
  ];

  if (!allowedTypes.includes(file.type)) {
    setStatus('Please upload a JPG, PNG or WebP image.', 'error');
    return;
  }

  if (file.size === 0 || file.size > MAX_FILE_SIZE) {
    setStatus('Image must be larger than 0 bytes and no more than 10 MB.', 'error');
    return;
  }

  try {
    const image = await loadImage(file);

    const pixels = image.naturalWidth * image.naturalHeight;

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

    el.originalPreview.src = originalObjectUrl;
    el.originalPreview.hidden = false;
    el.originalPlaceholder.hidden = true;

    el.originalInfo.textContent =
      `${file.name} · ${formatFileSize(file.size)} · ` +
      `${image.naturalWidth} × ${image.naturalHeight} px`;

    enableControls();

    setStatus(
      'Photograph uploaded. Configure your print sheet.',
      'success'
    );

  } catch (error) {
    console.error(error);
    setStatus('Unable to load this photograph.', 'error');
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
   PHOTO SIZE PRESETS
========================================== */

function handlePhotoSizeChange() {
  const selected = photoPresets[el.photoSize.value];

  if (selected) {
    el.photoWidth.value = selected.width;
    el.photoHeight.value = selected.height;
  }

  clearOutput();
}

/* ==========================================
   ENABLE CONTROLS
========================================== */

function enableControls() {
  [
    el.photoSize,
    el.photoWidth,
    el.photoHeight,
    el.paperSize,
    el.orientation,
    el.dpi,
    el.photoCount,
    el.spacing,
    el.margin,
    el.background,
    el.outputFormat
  ].forEach(input => {
    input.disabled = false;
  });

  el.generateBtn.disabled = false;
  el.resetBtn.disabled = false;
}

/* ==========================================
   VALIDATE SETTINGS
========================================== */

function getSheetSettings() {
  const photoWidth = Number(el.photoWidth.value);
  const photoHeight = Number(el.photoHeight.value);
  const dpi = Number(el.dpi.value);
  const count = Number(el.photoCount.value);
  const spacing = Number(el.spacing.value);
  const margin = Number(el.margin.value);

  if (
    !Number.isFinite(photoWidth) ||
    !Number.isFinite(photoHeight) ||
    photoWidth < 10 ||
    photoHeight < 10 ||
    photoWidth > 100 ||
    photoHeight > 100
  ) {
    throw new Error('Photo dimensions must be between 10 and 100 mm.');
  }

  if (![150, 200, 300, 600].includes(dpi)) {
    throw new Error('Please select a valid print resolution.');
  }

  if (!Number.isInteger(count) || count < 1 || count > 100) {
    throw new Error('Number of photographs must be between 1 and 100.');
  }

  if (!Number.isFinite(spacing) || spacing < 0 || spacing > 20) {
    throw new Error('Spacing must be between 0 and 20 mm.');
  }

  if (!Number.isFinite(margin) || margin < 0 || margin > 30) {
    throw new Error('Page margin must be between 0 and 30 mm.');
  }

  const paper = paperPresets[el.paperSize.value];

  if (!paper) {
    throw new Error('Please select a valid paper size.');
  }

  const isLandscape = el.orientation.value === 'landscape';

const paperWidth = isLandscape
  ? Math.max(paper.width, paper.height)
  : Math.min(paper.width, paper.height);

const paperHeight = isLandscape
  ? Math.min(paper.width, paper.height)
  : Math.max(paper.width, paper.height);

  if (photoWidth > paperWidth - 2 * margin ||
      photoHeight > paperHeight - 2 * margin) {
    throw new Error('The selected photo is too large for the available page area.');
  }

  const availableWidth = paperWidth - 2 * margin;
  const availableHeight = paperHeight - 2 * margin;

  const columns = Math.floor(
    (availableWidth + spacing) / (photoWidth + spacing)
  );

  const rows = Math.floor(
    (availableHeight + spacing) / (photoHeight + spacing)
  );

  const capacity = columns * rows;

  if (columns < 1 || rows < 1 || capacity < count) {
    throw new Error(
      `Only ${Math.max(0, capacity)} photographs fit on this paper. ` +
      'Reduce the count, photo size, spacing or margins, or choose a larger paper.'
    );
  }

  const pixelWidth = Math.round((paperWidth / 25.4) * dpi);
  const pixelHeight = Math.round((paperHeight / 25.4) * dpi);

  if (
    pixelWidth * pixelHeight > MAX_PIXELS ||
    pixelWidth > MAX_DIMENSION ||
    pixelHeight > MAX_DIMENSION
  ) {
    throw new Error(
      'The selected paper size and DPI create an image that is too large. Try a lower DPI.'
    );
  }

  return {
    paper,
    paperWidth,
    paperHeight,
    photoWidth,
    photoHeight,
    dpi,
    count,
    spacing,
    margin,
    columns,
    rows,
    capacity,
    pixelWidth,
    pixelHeight
  };
}

/* ==========================================
   GENERATE PRINT SHEET
========================================== */

async function generateSheet() {
  if (!originalImage || isGenerating) {
    if (!originalImage) {
      setStatus('Please upload a photograph first.', 'error');
    }
    return;
  }

  isGenerating = true;
  el.generateBtn.disabled = true;
  el.downloadBtn.disabled = true;

  try {
    const settings = getSheetSettings();

    setStatus('Generating your printable photo sheet...', 'info');

    await new Promise(resolve => setTimeout(resolve, 30));

    const canvas = el.resultCanvas;

    canvas.width = settings.pixelWidth;
    canvas.height = settings.pixelHeight;

    const ctx = canvas.getContext('2d');

    if (!ctx) {
      throw new Error('Canvas is not supported by this browser.');
    }

    // Sheet background.
    ctx.fillStyle = el.background.value === 'lightgray'
      ? '#eeeeee'
      : '#ffffff';

    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const mmToPixels = settings.dpi / 25.4;

    const photoPixelWidth = settings.photoWidth * mmToPixels;
    const photoPixelHeight = settings.photoHeight * mmToPixels;

    const spacingPixels = settings.spacing * mmToPixels;
    const marginPixels = settings.margin * mmToPixels;

    const totalGridWidth =
      settings.columns * photoPixelWidth +
      (settings.columns - 1) * spacingPixels;

    const startX =
      marginPixels +
      (canvas.width - 2 * marginPixels - totalGridWidth) / 2;

    let placed = 0;

    for (let row = 0; row < settings.rows; row++) {
      for (let col = 0; col < settings.columns; col++) {
        if (placed >= settings.count) break;

        const x = startX + col * (photoPixelWidth + spacingPixels);
        const y = marginPixels + row * (photoPixelHeight + spacingPixels);

        const crop = calculateCenterCrop(
          originalImage.naturalWidth,
          originalImage.naturalHeight,
          settings.photoWidth / settings.photoHeight
        );

        ctx.drawImage(
          originalImage,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          x,
          y,
          photoPixelWidth,
          photoPixelHeight
        );

        placed++;
      }

      if (placed >= settings.count) break;
    }

    generatedLayout = settings;

    canvas.hidden = false;
    el.resultPlaceholder.hidden = true;

    el.resultInfo.textContent =
      `${settings.paper.name} · ${settings.count} photos · ${settings.dpi} DPI`;

    el.outputPaper.textContent =
      `Paper: ${settings.paper.name} (${settings.paperWidth} × ${settings.paperHeight} mm)`;

    el.outputCount.textContent =
      `Photographs: ${settings.count} · Layout: ${settings.columns} columns × ${settings.rows} rows`;

    el.outputDimensions.textContent =
      `Resolution: ${settings.pixelWidth} × ${settings.pixelHeight} px at ${settings.dpi} DPI`;

    el.summary.hidden = false;

    await prepareDownloadBlob();

    setStatus(
      `Successfully arranged ${settings.count} photographs on your print sheet.`,
      'success'
    );

  } catch (error) {
    console.error('Sheet generation error:', error);

    setStatus(
      error.message || 'Unable to generate the photo sheet.',
      'error'
    );

  } finally {
    isGenerating = false;
    el.generateBtn.disabled = false;
  }
}

/* ==========================================
   CENTER CROP
========================================== */

function calculateCenterCrop(sourceWidth, sourceHeight, targetRatio) {
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

  return { x, y, width, height };
}

/* ==========================================
   PREPARE DOWNLOAD
========================================== */

async function prepareDownloadBlob() {
  if (!generatedLayout) {
    throw new Error('Generate the print sheet first.');
  }

  releaseOutputUrl();

  const format = el.outputFormat.value;
  const canvas = el.resultCanvas;

  if (format === 'pdf') {
    const settings = generatedLayout;

    const pdf = new jsPDF({
  orientation: settings.paperWidth > settings.paperHeight
    ? 'landscape'
    : 'portrait',
  unit: 'mm',
  format: [settings.paperWidth, settings.paperHeight],
  compress: true
});

    const imageData = canvas.toDataURL('image/jpeg', 0.95);

    pdf.addImage(
      imageData,
      'JPEG',
      0,
      0,
      settings.paperWidth,
      settings.paperHeight
    );

    outputBlob = pdf.output('blob');

  } else {
    const mimeType = format === 'png'
      ? 'image/png'
      : 'image/jpeg';

    outputBlob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        blob => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Unable to export the print sheet.'));
          }
        },
        mimeType,
        0.95
      );
    });
  }

  outputObjectUrl = URL.createObjectURL(outputBlob);
  el.downloadBtn.disabled = false;
}

/* ==========================================
   DOWNLOAD
========================================== */

function downloadSheet() {
  if (!outputBlob || !outputObjectUrl) {
    setStatus('Generate a sheet before downloading.', 'error');
    return;
  }

  const extension = el.outputFormat.value === 'pdf'
    ? 'pdf'
    : el.outputFormat.value;

  const link = document.createElement('a');

  link.href = outputObjectUrl;
  link.download = `resap-passport-photo-sheet.${extension}`;

  document.body.appendChild(link);
  link.click();
  link.remove();
}

/* ==========================================
   CLEAR OUTPUT
========================================== */

function clearOutput() {
  outputBlob = null;
  generatedLayout = null;

  releaseOutputUrl();

  el.resultCanvas.hidden = true;
  el.resultPlaceholder.hidden = false;

  el.resultInfo.textContent = 'No sheet generated';

  el.summary.hidden = true;

  el.outputPaper.textContent = '';
  el.outputCount.textContent = '';
  el.outputDimensions.textContent = '';

  el.downloadBtn.disabled = true;
}

/* ==========================================
   RESET
========================================== */

function resetSheetMaker() {
  originalFile = null;
  originalImage = null;

  outputBlob = null;
  generatedLayout = null;

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

  el.originalInfo.textContent = 'No photograph uploaded';
  el.resultInfo.textContent = 'No sheet generated';

  el.photoSize.value = '35x45';
  el.photoWidth.value = 35;
  el.photoHeight.value = 45;

  el.paperSize.value = 'a4';
  el.orientation.value = 'portrait';
  el.dpi.value = '300';

  el.photoCount.value = 30;
  el.spacing.value = 3;
  el.margin.value = 3;
  el.background.value = 'white';

  el.outputFormat.value = 'pdf';

  [
    el.photoSize,
    el.photoWidth,
    el.photoHeight,
    el.paperSize,
    el.orientation,
    el.dpi,
    el.photoCount,
    el.spacing,
    el.margin,
    el.background,
    el.outputFormat
  ].forEach(input => {
    input.disabled = true;
  });

  el.generateBtn.disabled = true;
  el.resetBtn.disabled = true;
  el.downloadBtn.disabled = true;

  el.summary.hidden = true;

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
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setStatus(message, type) {
  el.status.textContent = message;
  el.status.className = 'tool-status';

  if (type) {
    el.status.classList.add(`status-${type}`);
  }
}

/* ==========================================
   START
========================================== */

initSheetMaker();
