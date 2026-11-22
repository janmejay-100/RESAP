import QRCode from 'qrcode';
import { startScanUpload } from './scan-upload.js';
import { jsPDF } from 'jspdf';
import * as pdfjsLib from 'pdfjs-dist';

// ==========================================
// PDF.JS WORKER
// ==========================================

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString();

// ==========================================
// CONFIGURATION
// ==========================================

const MAX_FILE_SIZE = 30 * 1024 * 1024;
const MAX_PAGE_PIXELS = 12000000;
const MAX_TOTAL_PIXELS = 60000000;

const QUALITY_LEVELS = {
  balanced: [0.85, 0.75, 0.65, 0.55, 0.45, 0.35, 0.25, 0.15, 0.10, 0.06],
  strong: [0.70, 0.60, 0.50, 0.40, 0.30, 0.20, 0.12, 0.08, 0.05],
  maximum: [0.55, 0.45, 0.35, 0.25, 0.18, 0.12, 0.08, 0.05]
};

// ==========================================
// DOM ELEMENTS
// ==========================================

const el = {
  uploadArea: document.getElementById('pdfUploadArea'),
  input: document.getElementById('pdfInput'),
  fileList: document.getElementById('pdfFileList'),

  previewPanel: document.getElementById('pdfPreviewPanel'),
  pdfPreviewSection: document.getElementById('pdfPreviewSection'),
pdfPreviewFrame: document.getElementById('pdfPreviewFrame'),
  fileName: document.getElementById('pdfFileName'),
  originalInfo: document.getElementById('pdfOriginalInfo'),

  sizeComparison: document.getElementById('pdfSizeComparison'),
  originalSize: document.getElementById('pdfOriginalSize'),
  compressedSize: document.getElementById('pdfCompressedSize'),
  sizeReduction: document.getElementById('pdfSizeReduction'),

  resultDetails: document.getElementById('pdfResultDetails'),
  originalPages: document.getElementById('pdfOriginalPages'),
  outputPages: document.getElementById('pdfOutputPages'),

  compressionLevel: document.getElementById('pdfCompressionLevel'),
  targetSize: document.getElementById('pdfTargetSize'),
  outputDpi: document.getElementById('pdfOutputDpi'),

  compressBtn: document.getElementById('compressPdfBtn'),
  downloadBtn: document.getElementById('downloadPdfBtn'),
  resetBtn: document.getElementById('resetPdfBtn'),

  status: document.getElementById('pdfStatus'),
  scanUploadBtn: document.getElementById('pdfScanUploadBtn'),
scanUploadStatus: document.getElementById('pdfScanUploadStatus'),
scanQrContainer: document.getElementById('pdfScanQrContainer'),
scanQrCode: document.getElementById('pdfScanQrCode'),
scanExpiry: document.getElementById('pdfScanExpiry'),
};

const missingElements = Object.entries(el)
  .filter(([, element]) => !element)
  .map(([name]) => name);

if (missingElements.length) {
  throw new Error(
    `Missing PDF Compressor HTML elements: ${missingElements.join(', ')}`
  );
}

// ==========================================
// STATE
// ==========================================

let originalFile = null;
let compressedBlob = null;
let outputUrl = null;
let pdfDocument = null;
let isProcessing = false;

// ==========================================
// HELPERS
// ==========================================

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function setStatus(message, type = 'info') {
  el.status.textContent = message;
  el.status.dataset.type = type;
}
function setScanUploadStatus(message, type = 'info') {
    el.scanUploadStatus.textContent = message;

    el.scanUploadStatus.classList.remove(
        'status-error',
        'status-success',
        'status-info'
    );

    el.scanUploadStatus.classList.add(`status-${type}`);
}

function getOutputFilename(filename) {
  return `${filename.replace(/\.pdf$/i, '')}-compressed.pdf`;
}

function releaseOutputUrl() {
  if (outputUrl) {
    URL.revokeObjectURL(outputUrl);
    outputUrl = null;
  }
}

function clearCompressionResult() {
  compressedBlob = null;
  releaseOutputUrl();

  el.downloadBtn.disabled = true;
  el.sizeComparison.hidden = true;
  el.resultDetails.hidden = true;

  el.compressedSize.textContent = '—';
  el.sizeReduction.textContent = '—';
  el.outputPages.textContent = '—';

  el.pdfPreviewSection.hidden = true;
  el.pdfPreviewFrame.removeAttribute('src');
}

function setProcessingState(processing) {
  isProcessing = processing;

  el.input.disabled = processing;
  el.compressionLevel.disabled = processing || !originalFile;
  el.targetSize.disabled = processing || !originalFile;
  el.outputDpi.disabled = processing || !originalFile;

  el.compressBtn.disabled = processing || !originalFile;
  el.resetBtn.disabled = processing || !originalFile;
  el.downloadBtn.disabled = processing || !compressedBlob;
}

function getTargetSizeBytes() {
  const value = el.targetSize.value.trim();

  if (!value) return null;

  const sizeKB = Number(value);

  if (
    !Number.isFinite(sizeKB) ||
    sizeKB < 10 ||
    sizeKB > 30000
  ) {
    throw new Error(
      'Enter a target between 10 KB and 30000 KB.'
    );
  }

  return Math.round(sizeKB * 1024);
}

function waitForBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ==========================================
// GENERATE DPI LEVELS
// ==========================================

function getDpiLevels(startDpi) {
  const availableDpis = [
    300, 240, 200, 150, 120, 96, 72, 50, 36
  ];

  return availableDpis.filter(dpi => dpi <= startDpi);
}

// ==========================================
// PDF UPLOAD
// ==========================================

async function handleFile(file) {
  if (!file || isProcessing) return;

  const isPdf =
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf');

  if (!isPdf) {
    setStatus('Please select a valid PDF file.', 'error');
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    setStatus('Maximum supported PDF size is 30 MB.', 'error');
    return;
  }

  if (file.size === 0) {
    setStatus('The selected PDF is empty.', 'error');
    return;
  }

  clearCompressionResult();

  originalFile = null;
  pdfDocument = null;

  el.compressBtn.disabled = true;
  el.resetBtn.disabled = true;

  setStatus('Reading PDF document...');

  try {
    const arrayBuffer = await file.arrayBuffer();

    const loadingTask = pdfjsLib.getDocument({
      data: new Uint8Array(arrayBuffer)
    });

    pdfDocument = await loadingTask.promise;
    originalFile = file;

    el.fileName.textContent = file.name;

    el.originalInfo.textContent =
      `${formatFileSize(file.size)} • ${pdfDocument.numPages} pages`;

    el.originalSize.textContent = formatFileSize(file.size);
    el.originalPages.textContent = pdfDocument.numPages;

    el.previewPanel.hidden = false;

    el.fileList.textContent =
      `${file.name} (${formatFileSize(file.size)})`;

    el.compressionLevel.disabled = false;
    el.targetSize.disabled = false;
    el.outputDpi.disabled = false;

    el.compressBtn.disabled = false;
    el.resetBtn.disabled = false;

    setStatus(
      `PDF loaded successfully. ${pdfDocument.numPages} pages detected.`,
      'success'
    );

  } catch (error) {
    console.error('PDF loading error:', error);

    originalFile = null;
    pdfDocument = null;

    el.previewPanel.hidden = true;
    el.fileList.textContent = '';

    el.compressBtn.disabled = true;
    el.resetBtn.disabled = true;

    setStatus(
      error.name === 'PasswordException'
        ? 'This PDF is password-protected. Upload an unlocked PDF.'
        : 'Unable to read this PDF. It may be damaged or unsupported.',
      'error'
    );
  }
}

// ==========================================
// RENDER PDF PAGES AT SELECTED DPI
// ==========================================

async function renderAllPages(dpi) {
  const pages = [];
  let totalPixels = 0;

  try {
    for (
      let pageNumber = 1;
      pageNumber <= pdfDocument.numPages;
      pageNumber++
    ) {
      setStatus(
        `Rendering at ${dpi} DPI: page ${pageNumber} of ${pdfDocument.numPages}...`
      );

      await waitForBrowser();

      const page = await pdfDocument.getPage(pageNumber);

      const baseViewport = page.getViewport({ scale: 1 });

      let scale = dpi / 72;

      const estimatedPixels =
        baseViewport.width *
        baseViewport.height *
        scale *
        scale;

      if (estimatedPixels > MAX_PAGE_PIXELS) {
        scale *= Math.sqrt(MAX_PAGE_PIXELS / estimatedPixels);
      }

      const viewport = page.getViewport({ scale });

      const canvas = document.createElement('canvas');

      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));

      totalPixels += canvas.width * canvas.height;

      if (totalPixels > MAX_TOTAL_PIXELS) {
        canvas.width = 0;
        canvas.height = 0;

        throw new Error(
          'PDF is too large to process at this resolution.'
        );
      }

      const context = canvas.getContext('2d', {
        alpha: false
      });

      if (!context) {
        throw new Error('Unable to create canvas context.');
      }

      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: context,
        viewport,
        background: '#ffffff'
      }).promise;

      pages.push({
        canvas,
        widthMm: baseViewport.width * 25.4 / 72,
        heightMm: baseViewport.height * 25.4 / 72
      });

      page.cleanup();
    }

    return pages;

  } catch (error) {
    releaseCanvases(pages);
    throw error;
  }
}

function releaseCanvases(pages) {
  pages.forEach(page => {
    page.canvas.width = 0;
    page.canvas.height = 0;
  });
}

// ==========================================
// BUILD PDF
// ==========================================

function buildPdf(pages, quality) {
  let outputPdf = null;

  for (const page of pages) {
    const imageData = page.canvas.toDataURL(
      'image/jpeg',
      quality
    );

    const orientation =
      page.widthMm > page.heightMm
        ? 'landscape'
        : 'portrait';

    if (!outputPdf) {
      outputPdf = new jsPDF({
        orientation,
        unit: 'mm',
        format: [page.widthMm, page.heightMm],
        compress: true
      });
    } else {
      outputPdf.addPage(
        [page.widthMm, page.heightMm],
        orientation
      );
    }

    outputPdf.addImage(
      imageData,
      'JPEG',
      0,
      0,
      page.widthMm,
      page.heightMm,
      undefined,
      'FAST'
    );
  }

  return outputPdf.output('blob');
}

// ==========================================
// AUTOMATIC TARGET SIZE COMPRESSION
// ==========================================

async function findBestCompression(targetBytes, startDpi) {
  const qualityLevels =
    QUALITY_LEVELS[el.compressionLevel.value];

  const dpiLevels = targetBytes
    ? getDpiLevels(startDpi)
    : [startDpi];

  let bestResult = null;

  for (const dpi of dpiLevels) {
    let pages = [];

    try {
      pages = await renderAllPages(dpi);

      for (
        let index = 0;
        index < qualityLevels.length;
        index++
      ) {
        const quality = qualityLevels[index];

        setStatus(
          targetBytes
            ? `Trying ${dpi} DPI at ${Math.round(quality * 100)}% quality...`
            : `Compressing at ${dpi} DPI...`
        );

        await waitForBrowser();

        const blob = buildPdf(pages, quality);

        const result = {
          blob,
          dpi,
          quality
        };

        // No custom target: use the highest quality
        // at the selected resolution.
        if (!targetBytes) {
          return result;
        }

        // Keep the smallest output seen so far.
        if (
          !bestResult ||
          blob.size < bestResult.blob.size
        ) {
          bestResult = result;
        }

        // Target achieved: stop immediately.
        // This preserves the highest available DPI
        // and highest tested quality that fits.
        if (blob.size <= targetBytes) {
          return {
            ...result,
            reachedTarget: true
          };
        }
      }

    } catch (error) {
      console.warn(
        `Could not process PDF at ${dpi} DPI:`,
        error
      );

      // Continue with a lower DPI when possible.
      if (!targetBytes) {
        throw error;
      }

    } finally {
      releaseCanvases(pages);
    }
  }

  if (!bestResult) {
    throw new Error(
      'Unable to compress this PDF. Try another document.'
    );
  }

  return {
    ...bestResult,
    reachedTarget: false
  };
}

// ==========================================
// COMPRESS PDF
// ==========================================

async function compressPdf() {
  if (!originalFile || !pdfDocument || isProcessing) {
    return;
  }

  clearCompressionResult();
  setProcessingState(true);

  try {
    const targetBytes = getTargetSizeBytes();
    const startDpi = Number(el.outputDpi.value);

    setStatus('Starting PDF compression...');

    const result = await findBestCompression(
      targetBytes,
      startDpi
    );

    compressedBlob = result.blob;

    if (!compressedBlob || compressedBlob.size === 0) {
      throw new Error('Unable to generate compressed PDF.');
    }

    outputUrl = URL.createObjectURL(compressedBlob);
    // Display compressed PDF inside RESAP
el.pdfPreviewFrame.src = outputUrl;
el.pdfPreviewSection.hidden = false;

    const originalSize = originalFile.size;
    const compressedSize = compressedBlob.size;

    const difference = originalSize - compressedSize;

    const percentage =
      Math.abs(difference / originalSize) * 100;

    el.compressedSize.textContent =
      formatFileSize(compressedSize);

    el.sizeReduction.textContent =
      difference >= 0
        ? `${percentage.toFixed(1)}% smaller`
        : `${percentage.toFixed(1)}% larger`;

    el.outputPages.textContent = pdfDocument.numPages;

    el.sizeComparison.hidden = false;
    el.resultDetails.hidden = false;

    el.downloadBtn.disabled = false;

    if (targetBytes && result.reachedTarget) {
      setStatus(
        `Target achieved! Output: ${formatFileSize(compressedSize)} at ${result.dpi} DPI.`,
        'success'
      );

    } else if (targetBytes) {
      setStatus(
        `Target not achievable with tested settings. Smallest result: ${formatFileSize(compressedSize)} at ${result.dpi} DPI. Try a larger target.`,
        'warning'
      );

    } else if (difference > 0) {
      setStatus(
        `Compression complete. Reduced by ${percentage.toFixed(1)}%.`,
        'success'
      );

    } else {
      setStatus(
        'The compressed PDF is larger than the original. Try a lower DPI.',
        'warning'
      );
    }

  } catch (error) {
    console.error('PDF compression error:', error);

    clearCompressionResult();

    setStatus(
      error.message || 'PDF compression failed.',
      'error'
    );

  } finally {
    setProcessingState(false);
  }
}

// ==========================================
// DOWNLOAD
// ==========================================

function downloadPdf() {
  if (!compressedBlob || !outputUrl || !originalFile) {
    return;
  }

  const link = document.createElement('a');

  link.href = outputUrl;
  link.download = getOutputFilename(originalFile.name);

  document.body.appendChild(link);
  link.click();
  link.remove();

  setStatus('Compressed PDF downloaded successfully.', 'success');
}

// ==========================================
// RESET
// ==========================================

function resetTool() {
  if (isProcessing) return;

  clearCompressionResult();

  originalFile = null;
  pdfDocument = null;

  el.input.value = '';
  el.fileList.textContent = '';

  el.previewPanel.hidden = true;

  el.fileName.textContent = 'document.pdf';
  el.originalInfo.textContent = '—';

  el.originalSize.textContent = '—';
  el.originalPages.textContent = '—';

  el.compressionLevel.value = 'balanced';
  el.targetSize.value = '100';
  el.outputDpi.value = '200';

  el.compressionLevel.disabled = true;
  el.targetSize.disabled = true;
  el.outputDpi.disabled = true;

  el.compressBtn.disabled = true;
  el.downloadBtn.disabled = true;
  el.resetBtn.disabled = true;

  setStatus('Upload a PDF to begin.');
}
// ==========================================
// SCAN & UPLOAD FROM PHONE
// ==========================================

async function handleScanUpload() {
    el.scanUploadBtn.disabled = true;
    el.scanQrContainer.hidden = true;

   setScanUploadStatus('Generating QR code...', 'info');

    try {
       const session = await startScanUpload(async (file) => {
    if (
        file.type !== 'application/pdf' &&
        !file.name.toLowerCase().endsWith('.pdf')
    ) {
        setScanUploadStatus('Please upload a PDF file only.', 'error');
        throw new Error('Only PDF files are allowed.');
    }

    await handleFile(file);

    if (originalFile && pdfDocument) {
        setScanUploadStatus('PDF uploaded successfully!', 'success');
    } else {
        setScanUploadStatus(
            'Unable to read this PDF. It may be damaged or unsupported.',
            'error'
        );
    }
});

        const networkResponse = await fetch(
            'http://localhost:3001/api/network-info'
        );

        if (!networkResponse.ok) {
            throw new Error('Unable to detect laptop network address.');
        }

        const networkInfo = await networkResponse.json();

        const phoneUrl =
            `http://${networkInfo.address}:3000/scan-upload.html?session=${encodeURIComponent(session.sessionId)}`;

        await QRCode.toCanvas(
            el.scanQrCode,
            phoneUrl,
            {
                width: 220,
                margin: 2
            }
        );

        el.scanQrContainer.hidden = false;

       setScanUploadStatus(
    'Scan this QR code using your phone.',
    'info'
);

        el.scanExpiry.textContent =
            `Session expires at ${new Date(session.expiresAt).toLocaleTimeString()}`;

    } catch (error) {
        console.error('PDF Scan Upload Error:', error);

        setScanUploadStatus(
    error.message || 'Could not create upload session.',
    'error'
);

        el.scanQrContainer.hidden = true;

        el.scanUploadBtn.disabled = false;
    }
}
// ==========================================
// EVENT LISTENERS
// ==========================================

el.uploadArea.addEventListener('click', () => {
  if (!isProcessing) {
    el.input.click();
  }
});

el.input.addEventListener('change', event => {
  const file = event.target.files[0];

  if (file) {
    handleFile(file);
  }
});

el.uploadArea.addEventListener('dragover', event => {
  event.preventDefault();

  if (!isProcessing) {
    el.uploadArea.classList.add('drag-over');
  }
});

el.uploadArea.addEventListener('dragleave', () => {
  el.uploadArea.classList.remove('drag-over');
});

el.uploadArea.addEventListener('drop', event => {
  event.preventDefault();

  el.uploadArea.classList.remove('drag-over');

  if (isProcessing) return;

  const file = event.dataTransfer.files[0];

  if (file) {
    el.input.value = '';
    handleFile(file);
  }
});

el.compressBtn.addEventListener('click', compressPdf);
el.downloadBtn.addEventListener('click', downloadPdf);
el.resetBtn.addEventListener('click', resetTool);

function handleSettingsChange() {
  if (!originalFile) return;

  clearCompressionResult();
  setStatus('Settings changed. Compress the PDF again.');
}

el.compressionLevel.addEventListener('change', handleSettingsChange);
el.outputDpi.addEventListener('change', handleSettingsChange);
el.targetSize.addEventListener('input', handleSettingsChange);
el.scanUploadBtn.addEventListener('click', handleScanUpload);

// ==========================================
// INITIAL STATE
// ==========================================

el.compressBtn.disabled = true;
el.downloadBtn.disabled = true;
el.resetBtn.disabled = true;

el.compressionLevel.disabled = true;
el.targetSize.disabled = true;
el.outputDpi.disabled = true;
el.targetSize.value = '100';
