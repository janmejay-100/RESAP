
import { PDFDocument } from 'pdf-lib';
import QRCode from 'qrcode';
import { startScanUpload } from './scan-upload.js';

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const el = {
  uploadArea: document.getElementById('pdfSplitUploadArea'),
  fileInput: document.getElementById('pdfSplitInput'),

  fileInfo: document.getElementById('pdfSplitFileInfo'),
  fileName: document.getElementById('pdfSplitFileName'),
  fileDetails: document.getElementById('pdfSplitFileDetails'),
  removeFileBtn: document.getElementById('removePdfSplitFileBtn'),

  previewPanel: document.getElementById('pdfSplitPreviewPanel'),
  previewFrame: document.getElementById('pdfSplitPreviewFrame'),

  resultsPanel: document.getElementById('pdfSplitResultsPanel'),
  results: document.getElementById('pdfSplitResults'),

  splitMode: document.getElementById('pdfSplitMode'),
  rangesGroup: document.getElementById('pdfSplitRangesGroup'),
  ranges: document.getElementById('pdfSplitRanges'),

  chunksGroup: document.getElementById('pdfSplitChunksGroup'),
  pagesPerFile: document.getElementById('pdfSplitPagesPerFile'),

  outputName: document.getElementById('pdfSplitOutputName'),

  splitBtn: document.getElementById('splitPdfBtn'),
  resetBtn: document.getElementById('resetPdfSplitBtn'),
  status: document.getElementById('pdfSplitStatus'),
  scanUploadPanel: document.getElementById('pdfSplitScanUploadPanel'),
scanUploadBtn: document.getElementById('pdfSplitScanUploadBtn'),
scanUploadStatus: document.getElementById('pdfSplitScanUploadStatus'),
scanQrContainer: document.getElementById('pdfSplitScanQrContainer'),
scanQrCode: document.getElementById('pdfSplitScanQrCode'),
scanExpiry: document.getElementById('pdfSplitScanExpiry'),
};

let selectedFile = null;
let sourcePdfBytes = null;
let totalPages = 0;
let previewUrl = null;
let generatedFiles = [];
let isProcessing = false;

function formatFileSize(bytes) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function showStatus(message, type = 'info') {
  if (!el.status) return;

  el.status.textContent = message;
  el.status.className = `tool-status ${type}`;
  el.status.hidden = false;
}
function showScanUploadStatus(message, type = 'info') {
  if (!el.scanUploadStatus) return;

  el.scanUploadStatus.textContent = message;
  el.scanUploadStatus.className = `scan-upload-status ${type}`;
  el.scanUploadStatus.hidden = false;
}

function clearStatus() {
  if (!el.status) return;

  el.status.textContent = '';
  el.status.hidden = true;
}

function setProcessingState(processing) {
  isProcessing = processing;

  el.splitBtn.disabled = processing || !selectedFile;
  el.resetBtn.disabled = processing || !selectedFile;

  el.fileInput.disabled = processing;
  el.removeFileBtn.disabled = processing;

  el.splitMode.disabled = processing || !selectedFile;
  el.ranges.disabled = processing || !selectedFile;
  el.pagesPerFile.disabled = processing || !selectedFile;
  el.outputName.disabled = processing || !selectedFile;

  el.splitBtn.innerHTML = processing
    ? 'Processing PDF...'
    : '<i data-lucide="scissors"></i> Split PDF';

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function revokePreview() {
  if (previewUrl) {
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  if (el.previewFrame) {
    el.previewFrame.removeAttribute('src');
  }

  if (el.previewPanel) {
    el.previewPanel.hidden = true;
  }
}

function clearGeneratedFiles() {
  generatedFiles.forEach(item => {
    URL.revokeObjectURL(item.url);
  });

  generatedFiles = [];

  el.results.innerHTML = '';
  el.resultsPanel.hidden = true;
}

function clearPreviousResults() {
  clearGeneratedFiles();
}

function sanitizeFilename(name) {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim() || 'RESAP-split-document';
}

function updateModeInterface() {
  const mode = el.splitMode.value;

  el.rangesGroup.hidden = mode !== 'ranges';
  el.chunksGroup.hidden = mode !== 'chunks';
}


function updateFileInterface() {
  const hasFile = Boolean(selectedFile);

  // Show upload area only when no PDF is selected
  el.uploadArea.hidden = hasFile;

  // Show file information only when a PDF is selected
  el.fileInfo.hidden = !hasFile;

  el.previewPanel.hidden = !hasFile;

  el.splitBtn.disabled = !hasFile || isProcessing;
  el.resetBtn.disabled = !hasFile || isProcessing;

  el.splitMode.disabled = !hasFile || isProcessing;
  el.ranges.disabled = !hasFile || isProcessing;
  el.pagesPerFile.disabled = !hasFile || isProcessing;
  el.outputName.disabled = !hasFile || isProcessing;

  el.removeFileBtn.disabled = !hasFile || isProcessing;
}


async function loadPdf(file, fromPhone = false) {
  if (isProcessing) return;
  const reportStatus = (message, type = 'info') => {
  if (fromPhone) {
    showScanUploadStatus(message, type);
  } else {
    showStatus(message, type);
  }
};

  clearStatus();

  if (!file) return;

  if (
    file.type !== 'application/pdf' &&
    !file.name.toLowerCase().endsWith('.pdf')
  ) {
    reportStatus('Please select a valid PDF file.', 'error');
    return;
  }

  if (file.size > MAX_FILE_SIZE) {
    reportStatus('The PDF exceeds the 50 MB file size limit.', 'error');
    return;
  }

  reportStatus('Loading your PDF document...', 'info');
  try {
    const bytes = await file.arrayBuffer();

    const pdf = await PDFDocument.load(bytes);

    selectedFile = file;
    sourcePdfBytes = bytes;
    totalPages = pdf.getPageCount();

    if (totalPages < 1) {
      throw new Error('This PDF does not contain any pages.');
    }

    clearPreviousResults();
    revokePreview();

    previewUrl = URL.createObjectURL(file);

    el.previewFrame.src = previewUrl;

    el.fileName.textContent = file.name;
    el.fileDetails.textContent =
      `${formatFileSize(file.size)} · ${totalPages} pages`;

    el.outputName.value = sanitizeFilename(file.name);

    el.fileInput.value = '';

    updateFileInterface();
    updateModeInterface();

    reportStatus(
  `PDF loaded successfully. ${totalPages} pages detected.`,
  'success'
);

  } catch (error) {
    console.error('PDF loading error:', error);

    selectedFile = null;
    sourcePdfBytes = null;
    totalPages = 0;

    updateFileInterface();

    reportStatus(
  'Unable to open this PDF. It may be damaged, password-protected, or invalid.',
  'error'
);
  }
}

function parsePageRanges(input) {
  if (!input.trim()) {
    throw new Error('Enter the page numbers you want to extract.');
  }

  const parts = input.split(',');
  const pages = [];
  const usedPages = new Set();

  for (const part of parts) {
    const value = part.trim();

    if (!value) {
      throw new Error('Please check your page range format.');
    }

    let start;
    let end;

    if (/^\d+$/.test(value)) {
      start = Number(value);
      end = start;
    } else if (/^\d+\s*-\s*\d+$/.test(value)) {
      const numbers = value.split('-').map(number => Number(number.trim()));

      start = numbers[0];
      end = numbers[1];
    } else {
      throw new Error(
        'Invalid page format. Example: 1-3, 5, 8-10'
      );
    }

    if (
      start < 1 ||
      end < 1 ||
      start > totalPages ||
      end > totalPages
    ) {
      throw new Error(
        `Page numbers must be between 1 and ${totalPages}.`
      );
    }

    if (start > end) {
      throw new Error(
        'The starting page cannot be greater than the ending page.'
      );
    }

    for (let page = start; page <= end; page++) {
      if (usedPages.has(page)) {
        throw new Error(`Page ${page} is included more than once.`);
      }

      usedPages.add(page);
      pages.push(page - 1);
    }
  }

  return pages;
}

function getOutputFilename() {
  return sanitizeFilename(el.outputName.value);
}

async function createPdfFromPages(pageIndexes) {
  const sourcePdf = await PDFDocument.load(sourcePdfBytes);
  const outputPdf = await PDFDocument.create();

  const copiedPages = await outputPdf.copyPages(
    sourcePdf,
    pageIndexes
  );

  copiedPages.forEach(page => {
    outputPdf.addPage(page);
  });

  const bytes = await outputPdf.save();

  return new Blob([bytes], {
    type: 'application/pdf'
  });
}

function createPageGroups() {
  const pagesPerFile = Number(el.pagesPerFile.value);

  if (
    !Number.isInteger(pagesPerFile) ||
    pagesPerFile < 1 ||
    pagesPerFile > 100
  ) {
    throw new Error('Pages per file must be between 1 and 100.');
  }

  const groups = [];

  for (let start = 0; start < totalPages; start += pagesPerFile) {
    const end = Math.min(start + pagesPerFile, totalPages);

    const indexes = [];

    for (let page = start; page < end; page++) {
      indexes.push(page);
    }

    groups.push(indexes);
  }

  return groups;
}

function createSinglePageGroups() {
  const groups = [];

  for (let page = 0; page < totalPages; page++) {
    groups.push([page]);
  }

  return groups;
}

function createResultCard(item, index) {
  const card = document.createElement('div');
  card.className = 'pdf-split-result-item';

  const details = document.createElement('div');
  details.className = 'pdf-split-result-details';

  const icon = document.createElement('div');
  icon.className = 'pdf-split-result-icon';
 icon.innerHTML = '<i data-lucide="file-text"></i>';

  const text = document.createElement('div');

  const title = document.createElement('strong');
  title.textContent = item.name;

  const subtitle = document.createElement('span');
  subtitle.textContent =
    `${item.pages} page${item.pages === 1 ? '' : 's'} · ${formatFileSize(item.blob.size)}`;

  text.append(title, subtitle);
  details.append(icon, text);

  const downloadBtn = document.createElement('button');
  downloadBtn.type = 'button';
  downloadBtn.className = 'btn btn-secondary pdf-split-download-btn';
  downloadBtn.innerHTML =
    '<i data-lucide="download"></i> Download';

  downloadBtn.addEventListener('click', () => {
    downloadFile(item);
  });

  card.append(details, downloadBtn);

  return card;
}

function renderResults() {
  el.results.innerHTML = '';

  generatedFiles.forEach((item, index) => {
    const card = createResultCard(item, index);
    el.results.appendChild(card);
  });

  el.resultsPanel.hidden = generatedFiles.length === 0;

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function downloadFile(item) {
  const link = document.createElement('a');

  link.href = item.url;
  link.download = item.name;

  document.body.appendChild(link);
  link.click();
  link.remove();
}

async function splitPdf() {
  if (!selectedFile || isProcessing) return;

  clearPreviousResults();

  let groups = [];

  try {
    const mode = el.splitMode.value;

    if (mode === 'ranges') {
      const pages = parsePageRanges(el.ranges.value);

      groups = [pages];
    } else if (mode === 'each') {
      groups = createSinglePageGroups();
    } else if (mode === 'chunks') {
      groups = createPageGroups();
    } else {
      throw new Error('Select a valid splitting method.');
    }

    if (groups.length === 0) {
      throw new Error('No pages selected for splitting.');
    }

    setProcessingState(true);

    showStatus(
      `Splitting your PDF into ${groups.length} file(s)...`,
      'info'
    );

    const baseName = getOutputFilename();

    for (let i = 0; i < groups.length; i++) {
      showStatus(
        `Creating PDF ${i + 1} of ${groups.length}...`,
        'info'
      );

      const indexes = groups[i];
      const blob = await createPdfFromPages(indexes);

      const firstPage = indexes[0] + 1;
      const lastPage = indexes[indexes.length - 1] + 1;

      let filename;

      if (mode === 'ranges') {
        filename = `${baseName}-extracted.pdf`;
      } else if (mode === 'each') {
        filename = `${baseName}-page-${firstPage}.pdf`;
      } else {
        filename = `${baseName}-pages-${firstPage}-${lastPage}.pdf`;
      }

      const url = URL.createObjectURL(blob);

      generatedFiles.push({
        name: filename,
        blob,
        url,
        pages: indexes.length
      });
    }

    renderResults();

    showStatus(
      `Successfully created ${generatedFiles.length} PDF file(s). Download them below.`,
      'success'
    );

  } catch (error) {
    console.error('PDF splitting error:', error);

    clearGeneratedFiles();

    showStatus(error.message || 'Unable to split this PDF.', 'error');

  } finally {
    setProcessingState(false);
    updateFileInterface();
  }
}

function resetTool() {
  if (isProcessing) return;

  selectedFile = null;
  sourcePdfBytes = null;
  totalPages = 0;

  el.fileInput.value = '';
  el.ranges.value = '';
  el.pagesPerFile.value = '5';
  el.splitMode.value = 'ranges';
  el.outputName.value = 'RESAP-split-document';

  clearPreviousResults();
  revokePreview();
  clearStatus();

  updateModeInterface();
  updateFileInterface();

  showStatus('Upload a PDF file to begin.', 'info');
}

function setupDragAndDrop() {
  if (!el.uploadArea) return;

  el.uploadArea.addEventListener('click', event => {
    if (event.target.closest('button')) return;

    if (!isProcessing) {
      el.fileInput.click();
    }
  });

  el.uploadArea.addEventListener('dragover', event => {
    event.preventDefault();
    el.uploadArea.classList.add('drag-over');
  });

  el.uploadArea.addEventListener('dragleave', event => {
    if (!el.uploadArea.contains(event.relatedTarget)) {
      el.uploadArea.classList.remove('drag-over');
    }
  });

  el.uploadArea.addEventListener('drop', event => {
    event.preventDefault();
    el.uploadArea.classList.remove('drag-over');

    if (event.dataTransfer.files.length) {
      loadPdf(event.dataTransfer.files[0]);
    }
  });
}
async function setupScanUpload() {
  if (!el.scanUploadBtn) return;

  el.scanUploadBtn.addEventListener('click', async () => {
    el.scanUploadBtn.disabled = true;

    el.scanUploadStatus.textContent = 'Generating QR code...';
    el.scanUploadStatus.className = 'scan-upload-status';

    el.scanQrContainer.hidden = true;

    try {
      const session = await startScanUpload((file) => {
        return loadPdf(file, true);
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

      await QRCode.toCanvas(el.scanQrCode, phoneUrl, {
        width: 220,
        margin: 2
      });

      el.scanQrContainer.hidden = false;

      el.scanUploadStatus.textContent =
        'Scan this QR code using your phone.';

      el.scanExpiry.textContent =
        `Session expires at ${new Date(session.expiresAt).toLocaleTimeString()}`;

    } catch (error) {
      console.error('Scan upload error:', error);

      el.scanUploadStatus.textContent =
        error.message || 'Unable to generate QR code. Please try again.';

      el.scanUploadStatus.className = 'scan-upload-status error';

      el.scanQrContainer.hidden = true;

    } finally {
      el.scanUploadBtn.disabled = false;
    }
  });
}
function initPdfSplitter() {
  if (!el.fileInput || !el.splitBtn) return;

  el.fileInput.addEventListener('change', event => {
    loadPdf(event.target.files[0]);
  });

  el.removeFileBtn.addEventListener('click', resetTool);
  el.resetBtn.addEventListener('click', resetTool);
  el.splitBtn.addEventListener('click', splitPdf);

  el.splitMode.addEventListener('change', () => {
    updateModeInterface();
    clearPreviousResults();
    clearStatus();
  });

  el.ranges.addEventListener('input', clearPreviousResults);
  el.pagesPerFile.addEventListener('input', clearPreviousResults);
  el.outputName.addEventListener('input', clearPreviousResults);

  setupDragAndDrop();
  setupScanUpload();

  updateModeInterface();
  updateFileInterface();
}

initPdfSplitter();
