import QRCode from 'qrcode';
import { startScanUpload } from './scan-upload.js';
import { PDFDocument } from 'pdf-lib';

const MAX_FILES = 50;
const MAX_FILE_SIZE = 50 * 1024 * 1024; // 20 MB per PDF

const el = {
  uploadArea: document.getElementById('pdfMergeUploadArea'),
  fileInput: document.getElementById('pdfMergeInput'),
  fileInfo: document.getElementById('pdfMergeFileInfo'),
  fileCount: document.getElementById('pdfMergeFileCount'),
  addMoreBtn: document.getElementById('addMorePdfsBtn'),

  listPanel: document.getElementById('pdfMergeListPanel'),
  fileList: document.getElementById('pdfMergeList'),
  clearBtn: document.getElementById('clearPdfsBtn'),

  previewPanel: document.getElementById('pdfMergePreviewPanel'),
  previewFrame: document.getElementById('pdfMergePreviewFrame'),
  outputName: document.getElementById('pdfMergeOutputName'),
  outputSize: document.getElementById('pdfMergeOutputSize'),
  outputPages: document.getElementById('pdfMergeOutputPages'),

  fileName: document.getElementById('pdfMergeFileName'),
  pageNumber: document.getElementById('pdfMergePageNumber'),

  mergeBtn: document.getElementById('mergePdfBtn'),
  downloadBtn: document.getElementById('downloadMergedPdfBtn'),
  resetBtn: document.getElementById('resetPdfMergeBtn'),
  status: document.getElementById('pdfMergeStatus'),
  scanUploadPanel: document.getElementById('pdfMergeScanUploadPanel'),
scanUploadBtn: document.getElementById('pdfMergeScanUploadBtn'),
scanUploadStatus: document.getElementById('pdfMergeScanUploadStatus'),
scanQrContainer: document.getElementById('pdfMergeScanQrContainer'),
scanQrCode: document.getElementById('pdfMergeScanQrCode'),
scanExpiry: document.getElementById('pdfMergeScanExpiry'),
};

let selectedFiles = [];
let mergedPdfBlob = null;
let previewUrl = null;
let isProcessing = false;

function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
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

  el.mergeBtn.disabled = processing || selectedFiles.length < 2;
  el.resetBtn.disabled = processing;

  if (el.addMoreBtn) {
    el.addMoreBtn.disabled = processing || selectedFiles.length >= MAX_FILES;
  }

  el.mergeBtn.textContent = processing ? 'Merging PDFs...' : 'Merge PDFs';
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

function clearMergeResult() {
  mergedPdfBlob = null;
  revokePreview();

  el.downloadBtn.disabled = true;

  if (el.outputName) el.outputName.textContent = '—';
  if (el.outputSize) el.outputSize.textContent = '—';
  if (el.outputPages) el.outputPages.textContent = '—';
}

function updateFileInfo() {
  const count = selectedFiles.length;

  if (el.fileCount) {
    el.fileCount.textContent = `${count} PDF${count === 1 ? '' : 's'} selected`;
  }

  if (el.fileInfo) {
    el.fileInfo.hidden = count === 0;
  }

  if (el.listPanel) {
    el.listPanel.hidden = count === 0;
  }

  if (el.mergeBtn) {
    el.mergeBtn.disabled = count < 2 || isProcessing;
  }

  if (el.addMoreBtn) {
    el.addMoreBtn.disabled = count >= MAX_FILES || isProcessing;
  }

  if (el.clearBtn) {
    el.clearBtn.disabled = count === 0 || isProcessing;
  }
}

async function readPdfInfo(file) {
  const bytes = await file.arrayBuffer();
  const pdf = await PDFDocument.load(bytes);

  return {
    pageCount: pdf.getPageCount()
  };
}

function createFileId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

async function addFiles(fileList, fromPhone = false) {
  if (isProcessing) return;

  const incomingFiles = Array.from(fileList || []);

  if (incomingFiles.length === 0) {
    showStatus('Please select PDF files.', 'error');
    return;
  }

  clearStatus();

  let addedCount = 0;
  if (fromPhone) {
  el.scanUploadStatus.textContent = '';
  el.scanUploadStatus.className = 'scan-upload-status';
}
  const reportStatus = (message, type = 'error') => {
  if (fromPhone) {
    showScanUploadStatus(message, type);
  } else {
    showStatus(message, type);
  }
};

  for (const file of incomingFiles) {

    // Validate PDF file type
    const isPdf =
      file.type === 'application/pdf' ||
      file.name.toLowerCase().endsWith('.pdf');

    if (!isPdf) {
      reportStatus(`${file.name}: Please select a valid PDF file.`, 'error');
      continue;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      reportStatus(`${file.name} exceeds the maximum supported file size.`, 'error');
      continue;
    }

    // Validate empty file
    if (file.size === 0) {
      reportStatus(`${file.name} is empty.`, 'error');
      continue;
    }

    // Maximum file limit
    if (selectedFiles.length >= MAX_FILES) {
      reportStatus(`You can select a maximum of ${MAX_FILES} PDF files.`, 'error');
      break;
    }

    // Check duplicates
    if (selectedFiles.some(item =>
      item.file.name === file.name &&
      item.file.size === file.size &&
      item.file.lastModified === file.lastModified
    )) {
      reportStatus(`${file.name} is already added.`, 'error');
      continue;
    }

    try {
      // Read and validate PDF
      const info = await readPdfInfo(file);

      selectedFiles.push({
        id: createFileId(),
        file,
        pageCount: info.pageCount
      });

      addedCount++;

    } catch (error) {
      console.error('PDF validation failed:', file.name, error);
      reportStatus(
  `${file.name} cannot be opened. It may be damaged, password-protected, or invalid.`,
  'error'
);

      showStatus(
        `${file.name} cannot be opened. It may be damaged, password-protected, or invalid.`,
        'error'
      );
    }
  }

  renderFileList();
  updateFileInfo();

  if (addedCount > 0) {
  clearMergeResult();

  const message =
    ` PDF file${addedCount === 1 ? '' : 's'} added successfully.`;

  if (fromPhone) {
    showScanUploadStatus(message, 'success');
  } else {
    showStatus(message, 'success');
  }
}

  el.fileInput.value = '';
}

function renderFileList() {
  if (!el.fileList) return;

  el.fileList.innerHTML = '';

  selectedFiles.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'pdf-merge-file-item';
    card.draggable = !isProcessing;
    card.dataset.id = item.id;

    card.innerHTML = `
      <div class="pdf-merge-file-order">${index + 1}</div>
      <div class="pdf-merge-file-icon">
        <i data-lucide="file-text"></i>
      </div>
      <div class="pdf-merge-file-details">
        <strong class="pdf-merge-file-name"></strong>
        <span>${formatFileSize(item.file.size)} · ${item.pageCount} page${item.pageCount === 1 ? '' : 's'}</span>
      </div>
      <button type="button" class="pdf-merge-remove-btn" aria-label="Remove PDF">
        <i data-lucide="x"></i>
      </button>
      <div class="pdf-merge-drag-handle">
        <i data-lucide="grip-vertical"></i>
      </div>
    `;

    card.querySelector('.pdf-merge-file-name').textContent = item.file.name;

    card.querySelector('.pdf-merge-remove-btn').addEventListener('click', () => {
      removeFile(item.id);
    });

    card.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', item.id);
      event.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      el.fileList.querySelectorAll('.drag-over').forEach(node => {
        node.classList.remove('drag-over');
      });
    });

    card.addEventListener('dragover', event => {
      event.preventDefault();
      if (card.dataset.id !== item.id) {
        card.classList.add('drag-over');
      }
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', event => {
      event.preventDefault();
      card.classList.remove('drag-over');

      const draggedId = event.dataTransfer.getData('text/plain');
      if (!draggedId || draggedId === item.id) return;

      moveFile(draggedId, item.id);
    });

    el.fileList.appendChild(card);
  });

  if (window.lucide) {
    window.lucide.createIcons();
  }
}

function moveFile(draggedId, targetId) {
  const fromIndex = selectedFiles.findIndex(item => item.id === draggedId);
  const toIndex = selectedFiles.findIndex(item => item.id === targetId);

  if (fromIndex === -1 || toIndex === -1) return;

  const [movedItem] = selectedFiles.splice(fromIndex, 1);
  selectedFiles.splice(toIndex, 0, movedItem);

  clearMergeResult();
  renderFileList();
  updateFileInfo();
  showStatus('PDF order updated.', 'success');
}

function removeFile(id) {
  if (isProcessing) return;

  selectedFiles = selectedFiles.filter(item => item.id !== id);

  clearMergeResult();
  renderFileList();
  updateFileInfo();

  if (selectedFiles.length === 0) {
    clearStatus();
  } else {
    showStatus('PDF removed from the list.', 'success');
  }
}

function clearFiles() {
  if (isProcessing) return;

  selectedFiles = [];

  clearMergeResult();
  renderFileList();
  updateFileInfo();
  clearStatus();
}

function getOutputFilename() {
  let name = el.fileName.value.trim() || 'merged-document';

  name = name
    .replace(/\.pdf$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .trim();

  if (!name) name = 'merged-document';

  return `${name}.pdf`;
}

async function mergePdfs() {
  if (isProcessing) return;

  if (selectedFiles.length < 2) {
    showStatus('Select at least two PDF files to merge.', 'error');
    return;
  }

  clearMergeResult();
  setProcessingState(true);
  showStatus('Merging your PDF files. Please wait...', 'info');

  try {
    const mergedPdf = await PDFDocument.create();

    for (let i = 0; i < selectedFiles.length; i++) {
      const item = selectedFiles[i];

      showStatus(
        `Processing PDF ${i + 1} of ${selectedFiles.length}: ${item.file.name}`,
        'info'
      );

      const bytes = await item.file.arrayBuffer();
      const sourcePdf = await PDFDocument.load(bytes);
      const copiedPages = await mergedPdf.copyPages(
        sourcePdf,
        sourcePdf.getPageIndices()
      );

      copiedPages.forEach(page => mergedPdf.addPage(page));
    }

    const mergedBytes = await mergedPdf.save();

    mergedPdfBlob = new Blob([mergedBytes], {
      type: 'application/pdf'
    });

    previewUrl = URL.createObjectURL(mergedPdfBlob);

    const totalPages = mergedPdf.getPageCount();
    const filename = getOutputFilename();

    el.previewFrame.src = previewUrl;
    el.previewPanel.hidden = false;

    el.outputName.textContent = filename;
    el.outputSize.textContent = formatFileSize(mergedPdfBlob.size);
    el.outputPages.textContent = `${totalPages} page${totalPages === 1 ? '' : 's'}`;

    el.downloadBtn.disabled = false;

    showStatus('PDF files merged successfully. Review the preview and download your file.', 'success');
  } catch (error) {
    console.error('PDF merge error:', error);

    showStatus(
      'Unable to merge these PDFs. Check that they are valid and not password-protected.',
      'error'
    );
  } finally {
    setProcessingState(false);
    updateFileInfo();
  }
}

function downloadMergedPdf() {
  if (!mergedPdfBlob) {
    showStatus('Merge your PDF files before downloading.', 'error');
    return;
  }

  const url = URL.createObjectURL(mergedPdfBlob);
  const link = document.createElement('a');

  link.href = url;
  link.download = getOutputFilename();

  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);

  showStatus('Your merged PDF download has started.', 'success');
}

function resetTool() {
  if (isProcessing) return;

  selectedFiles = [];

  clearMergeResult();
  clearStatus();

  el.fileInput.value = '';
  el.fileName.value = 'merged-document';

  if (el.pageNumber) {
    el.pageNumber.value = 'none';
  }

  renderFileList();
  updateFileInfo();
}


function setupDragAndDrop() {
  if (!el.uploadArea || !el.fileInput) return;

  // Open file browser when upload area is clicked.
  el.uploadArea.addEventListener('click', event => {
    if (event.target === el.fileInput) return;
    if (event.target.closest('button')) return;

    el.fileInput.click();
  });

  // Drag over upload area.
  el.uploadArea.addEventListener('dragover', event => {
    event.preventDefault();
    el.uploadArea.classList.add('drag-over');
  });

  // Remove drag highlight.
  el.uploadArea.addEventListener('dragleave', event => {
    if (!el.uploadArea.contains(event.relatedTarget)) {
      el.uploadArea.classList.remove('drag-over');
    }
  });

  // Accept dropped PDF files.
  el.uploadArea.addEventListener('drop', event => {
    event.preventDefault();
    el.uploadArea.classList.remove('drag-over');
    addFiles(event.dataTransfer.files);
  });
}

async function setupScanUpload() {
  if (!el.scanUploadBtn) return;

  el.scanUploadBtn.addEventListener('click', async () => {
    el.scanUploadBtn.disabled = true;
    el.scanUploadStatus.textContent = 'Generating QR code...';
    el.scanQrContainer.hidden = true;

    try {
      const session = await startScanUpload((file) => {
  return addFiles([file], true);
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

      el.scanQrContainer.hidden = true;

    } finally {
      el.scanUploadBtn.disabled = false;
    }
  });
}
function initPdfMerger() {
  if (!el.fileInput || !el.mergeBtn) return;

  el.fileInput.addEventListener('change', event => {
    addFiles(event.target.files);
  });

  el.addMoreBtn?.addEventListener('click', () => {
    el.fileInput.click();
  });

  el.clearBtn?.addEventListener('click', clearFiles);
  el.mergeBtn.addEventListener('click', mergePdfs);
  el.downloadBtn?.addEventListener('click', downloadMergedPdf);
  el.resetBtn?.addEventListener('click', resetTool);

  setupDragAndDrop();
  setupScanUpload();
  renderFileList();
  updateFileInfo();
  clearMergeResult();
}

initPdfMerger();
