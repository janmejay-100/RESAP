import QRCode from 'qrcode';
import { startScanUpload } from './scan-upload.js';
import { jsPDF } from 'jspdf';

// ==========================================
// CONFIGURATION
// ==========================================

const MAX_FILES = 50;
const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_PIXELS = 80000000;
const MAX_IMAGE_DIMENSION = 12000;

const PAGE_PRESETS = {
  a4: [210, 297],
  a5: [148, 210],
  letter: [215.9, 279.4],
  legal: [215.9, 355.6]
};

// ==========================================
// DOM ELEMENTS
// ==========================================

const el = {
  uploadArea: document.getElementById('imagePdfUploadArea'),
  input: document.getElementById('imagePdfInput'),

  fileInfo: document.getElementById('imagePdfFileInfo'),
  fileCount: document.getElementById('imagePdfFileCount'),
  addMoreBtn: document.getElementById('addMoreImagesBtn'),

  listPanel: document.getElementById('imagePdfListPanel'),
  imageList: document.getElementById('imagePdfList'),
  clearImagesBtn: document.getElementById('clearImagesBtn'),

  previewPanel: document.getElementById('imagePdfPreviewPanel'),
  previewFrame: document.getElementById('imagePdfPreviewFrame'),
  outputName: document.getElementById('imagePdfOutputName'),
  outputSize: document.getElementById('imagePdfOutputSize'),

  pageSize: document.getElementById('imagePdfPageSize'),
  orientation: document.getElementById('imagePdfOrientation'),
  fit: document.getElementById('imagePdfFit'),
  margin: document.getElementById('imagePdfMargin'),
  marginValue: document.getElementById('imagePdfMarginValue'),
  quality: document.getElementById('imagePdfQuality'),
  qualityValue: document.getElementById('imagePdfQualityValue'),
  fileName: document.getElementById('imagePdfFileName'),

  generateBtn: document.getElementById('generateImagePdfBtn'),
  downloadBtn: document.getElementById('downloadImagePdfBtn'),
  resetBtn: document.getElementById('resetImagePdfBtn'),

  status: document.getElementById('imagePdfStatus'),
  scanUploadBtn: document.getElementById('imagePdfScanUploadBtn'),
scanUploadStatus: document.getElementById('imagePdfScanUploadStatus'),
scanQrContainer: document.getElementById('imagePdfScanQrContainer'),
scanQrCode: document.getElementById('imagePdfScanQrCode'),
scanExpiry: document.getElementById('imagePdfScanExpiry'),
};

// ==========================================
// VALIDATE HTML ELEMENTS
// ==========================================

const missingElements = Object.entries(el)
  .filter(([, element]) => !element)
  .map(([name]) => name);

if (missingElements.length) {
  throw new Error(
    `Image to PDF HTML is missing: ${missingElements.join(', ')}`
  );
}

// ==========================================
// STATE
// ==========================================

let images = [];
let generatedPdfBlob = null;
let pdfObjectUrl = null;
let isGenerating = false;

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

function sanitizeFilename(name) {
  return name
    .trim()
    .replace(/\.pdf$/i, '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 80) || 'RESAP-document';
}

function releasePdfUrl() {
  if (pdfObjectUrl) {
    URL.revokeObjectURL(pdfObjectUrl);
    pdfObjectUrl = null;
  }
}

function clearGeneratedPdf() {
  generatedPdfBlob = null;
  releasePdfUrl();

  el.previewFrame.removeAttribute('src');
  el.previewPanel.hidden = true;

  el.downloadBtn.disabled = true;

  el.outputName.textContent = 'document.pdf';
  el.outputSize.textContent = '—';
}

function waitForBrowser() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ==========================================
// IMAGE LOADING
// ==========================================

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      if (
        image.naturalWidth > MAX_IMAGE_DIMENSION ||
        image.naturalHeight > MAX_IMAGE_DIMENSION
      ) {
        URL.revokeObjectURL(url);
        reject(new Error('Image dimensions exceed the supported limit.'));
        return;
      }

      resolve({
        id: crypto.randomUUID(),
        file,
        image,
        previewUrl: url,
        name: file.name,
        width: image.naturalWidth,
        height: image.naturalHeight
      });
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Unable to read ${file.name}.`));
    };

    image.src = url;
  });
}

// ==========================================
// IMAGE UPLOAD
// ==========================================

async function handleFiles(fileList) {
  if (isGenerating) return;

  const selectedFiles = Array.from(fileList);

  if (!selectedFiles.length) return;

  const remainingSlots = MAX_FILES - images.length;

  if (remainingSlots <= 0) {
    setStatus(`Maximum ${MAX_FILES} images allowed.`, 'error');
    return;
  }

  const acceptedFiles = selectedFiles.slice(0, remainingSlots);

  if (selectedFiles.length > remainingSlots) {
    setStatus(
      `Only ${remainingSlots} more images can be added.`
    );
  }

  let addedCount = 0;
  let rejectedCount = 0;

  for (const file of acceptedFiles) {
    if (
      file.type !== 'image/jpeg' &&
      file.type !== 'image/png' &&
      file.type !== 'image/webp'
    ) {
      rejectedCount++;
      continue;
    }

    if (file.size > MAX_FILE_SIZE || file.size === 0) {
      rejectedCount++;
      continue;
    }

    try {
      const totalPixels = images.reduce(
        (total, item) => total + item.width * item.height,
        0
      );

      const image = await loadImage(file);

      if (
        totalPixels + image.width * image.height >
        MAX_TOTAL_PIXELS
      ) {
        URL.revokeObjectURL(image.previewUrl);
        rejectedCount++;
        continue;
      }

      images.push(image);
      addedCount++;

    } catch (error) {
      console.error(error);
      rejectedCount++;
    }
  }

  el.input.value = '';

  clearGeneratedPdf();
  renderImageList();
  updateControls();

  if (rejectedCount > 0) {
    setStatus(
      `${addedCount} image(s) added. ${rejectedCount} file(s) rejected.`,
      'warning'
    );
  } else if (addedCount > 0) {
    setStatus(
      `${addedCount} image(s) added successfully.`,
      'success'
    );
  } else {
    setStatus('No valid images were added.', 'error');
  }
}

// ==========================================
// RENDER IMAGE LIST
// ==========================================


function renderImageList() {
  el.imageList.replaceChildren();

  images.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'image-pdf-item';
    card.draggable = true;
    card.dataset.index = index;

    // Image thumbnail
    const thumbnail = document.createElement('img');
    thumbnail.className = 'image-pdf-thumbnail';
    thumbnail.src = item.previewUrl;
    thumbnail.alt = item.name;
    thumbnail.loading = 'lazy';

    // Filename strip
    const filename = document.createElement('div');
    filename.className = 'image-pdf-filename';
    filename.textContent = item.name;
    filename.title = item.name;

    // Remove button
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'image-pdf-remove';
    removeBtn.textContent = '×';
    removeBtn.title = `Remove ${item.name}`;
    removeBtn.setAttribute('aria-label', `Remove ${item.name}`);

    removeBtn.addEventListener('click', event => {
      event.stopPropagation();
      removeImage(index);
    });

    card.append(thumbnail, filename, removeBtn);

    // Drag-and-drop reordering
    card.addEventListener('dragstart', event => {
      event.dataTransfer.setData('text/plain', String(index));
      event.dataTransfer.effectAllowed = 'move';
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');

      el.imageList.querySelectorAll('.image-pdf-item').forEach(item => {
        item.classList.remove('drag-over');
      });
    });

    card.addEventListener('dragover', event => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      card.classList.add('drag-over');
    });

    card.addEventListener('dragleave', () => {
      card.classList.remove('drag-over');
    });

    card.addEventListener('drop', event => {
      event.preventDefault();
      card.classList.remove('drag-over');

      const fromIndex = Number(
        event.dataTransfer.getData('text/plain')
      );

      const toIndex = index;

      if (
        Number.isNaN(fromIndex) ||
        fromIndex === toIndex ||
        fromIndex < 0 ||
        fromIndex >= images.length
      ) {
        return;
      }

      const [movedImage] = images.splice(fromIndex, 1);
      images.splice(toIndex, 0, movedImage);

      clearGeneratedPdf();
      renderImageList();

      setStatus('Image order updated. Generate the PDF again.');
    });

    el.imageList.appendChild(card);
  });
}


// ==========================================
// REORDER IMAGES
// ==========================================

function moveImage(index, direction) {
  if (isGenerating) return;

  const newIndex = index + direction;

  if (newIndex < 0 || newIndex >= images.length) return;

  [images[index], images[newIndex]] = [
    images[newIndex],
    images[index]
  ];

  clearGeneratedPdf();
  renderImageList();

  setStatus('Image order updated.');
}

// ==========================================
// REMOVE IMAGE
// ==========================================

function removeImage(index) {
  if (isGenerating) return;

  const removed = images[index];

  URL.revokeObjectURL(removed.previewUrl);

  images.splice(index, 1);

  clearGeneratedPdf();
  renderImageList();
  updateControls();

  setStatus('Image removed.');
}

// ==========================================
// CLEAR ALL IMAGES
// ==========================================

function clearAllImages() {
  if (isGenerating) return;

  images.forEach(item => {
    URL.revokeObjectURL(item.previewUrl);
  });

  images = [];

  clearGeneratedPdf();
  renderImageList();
  updateControls();

  setStatus('All images cleared.');
}

// ==========================================
// UPDATE CONTROLS
// ==========================================

function updateControls() {
  const hasImages = images.length > 0;

  el.fileInfo.hidden = !hasImages;
  el.listPanel.hidden = !hasImages;

  el.fileCount.textContent =
    `${images.length} of ${MAX_FILES} images selected`;

  el.pageSize.disabled = !hasImages || isGenerating;
  el.orientation.disabled = !hasImages || isGenerating;
  el.fit.disabled = !hasImages || isGenerating;
  el.margin.disabled = !hasImages || isGenerating;
  el.quality.disabled = !hasImages || isGenerating;
  el.fileName.disabled = !hasImages || isGenerating;

  el.generateBtn.disabled = !hasImages || isGenerating;
  el.resetBtn.disabled = !hasImages || isGenerating;

  el.clearImagesBtn.disabled = !hasImages || isGenerating;
  el.addMoreBtn.disabled =
    isGenerating || images.length >= MAX_FILES;

  el.uploadArea.style.display =
    images.length >= MAX_FILES ? 'none' : '';
}

function setProcessingState(processing) {
  isGenerating = processing;

  el.input.disabled = processing;
  el.pageSize.disabled = processing || !images.length;
  el.orientation.disabled = processing || !images.length;
  el.fit.disabled = processing || !images.length;
  el.margin.disabled = processing || !images.length;
  el.quality.disabled = processing || !images.length;
  el.fileName.disabled = processing || !images.length;

  el.generateBtn.disabled = processing || !images.length;
  el.resetBtn.disabled = processing || !images.length;

  el.clearImagesBtn.disabled = processing || !images.length;
  el.addMoreBtn.disabled =
    processing || images.length >= MAX_FILES;
}

// ==========================================
// SETTINGS VALUES
// ==========================================

function getPageDimensions(image) {
  const pageSize = el.pageSize.value;
  const orientation = el.orientation.value;

  if (pageSize === 'fit') {
    const width = image.width * 25.4 / 96;
    const height = image.height * 25.4 / 96;

    return [width, height];
  }

  let [width, height] = PAGE_PRESETS[pageSize];

  if (orientation === 'auto') {
    if (image.width > image.height) {
      [width, height] = [height, width];
    }
  } else if (orientation === 'landscape') {
    if (height > width) {
      [width, height] = [height, width];
    }
  } else if (orientation === 'portrait') {
    if (width > height) {
      [width, height] = [height, width];
    }
  }

  return [width, height];
}

// ==========================================
// CREATE IMAGE CANVAS
// ==========================================

function createImageCanvas(item, availableWidth, availableHeight) {
  const canvas = document.createElement('canvas');

  const fitMode = el.fit.value;
  const quality = Number(el.quality.value) / 100;

  let outputWidth = item.width;
  let outputHeight = item.height;

  if (fitMode === 'cover') {
    const sourceRatio = item.width / item.height;
    const targetRatio = availableWidth / availableHeight;

    if (sourceRatio > targetRatio) {
      outputWidth = Math.round(item.height * targetRatio);
      outputHeight = item.height;
    } else {
      outputWidth = item.width;
      outputHeight = Math.round(item.width / targetRatio);
    }
  }

  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext('2d', {
    alpha: false
  });

  if (!context) {
    throw new Error('Unable to create image canvas.');
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputWidth, outputHeight);

  if (fitMode === 'cover') {
    const sourceX = (item.width - outputWidth) / 2;
    const sourceY = (item.height - outputHeight) / 2;

    context.drawImage(
      item.image,
      sourceX,
      sourceY,
      outputWidth,
      outputHeight,
      0,
      0,
      outputWidth,
      outputHeight
    );
  } else {
    context.drawImage(
      item.image,
      0,
      0,
      item.width,
      item.height
    );
  }

  return canvas.toDataURL('image/jpeg', quality);
}

// ==========================================
// GENERATE PDF
// ==========================================

async function generatePdf() {
  if (!images.length || isGenerating) return;

  clearGeneratedPdf();
  setProcessingState(true);

  try {
    const margin = Number(el.margin.value);
    const quality = Number(el.quality.value);

    let pdf = null;

    for (let index = 0; index < images.length; index++) {
      setStatus(
        `Creating PDF page ${index + 1} of ${images.length}...`
      );

      await waitForBrowser();

      const item = images[index];

      const [pageWidth, pageHeight] =
        getPageDimensions(item);

      if (
        pageWidth <= margin * 2 ||
        pageHeight <= margin * 2
      ) {
        throw new Error(
          'Margin is too large for the selected page size.'
        );
      }

      const availableWidth = pageWidth - margin * 2;
      const availableHeight = pageHeight - margin * 2;

      const imageData = createImageCanvas(
        item,
        availableWidth,
        availableHeight
      );

      const orientation =
        pageWidth > pageHeight ? 'landscape' : 'portrait';

      if (!pdf) {
        pdf = new jsPDF({
          orientation,
          unit: 'mm',
          format: [pageWidth, pageHeight],
          compress: true
        });
      } else {
        pdf.addPage(
          [pageWidth, pageHeight],
          orientation
        );
      }

      let x = margin;
      let y = margin;
      let width = availableWidth;
      let height = availableHeight;

      if (el.fit.value === 'contain') {
        const ratio = Math.min(
          availableWidth / item.width,
          availableHeight / item.height
        );

        width = item.width * ratio;
        height = item.height * ratio;

        x = margin + (availableWidth - width) / 2;
        y = margin + (availableHeight - height) / 2;
      }

      pdf.addImage(
        imageData,
        'JPEG',
        x,
        y,
        width,
        height,
        undefined,
        'FAST'
      );
    }

    if (!pdf) {
      throw new Error('Unable to create PDF.');
    }

    generatedPdfBlob = pdf.output('blob');

    if (!generatedPdfBlob || generatedPdfBlob.size === 0) {
      throw new Error('Generated PDF is empty.');
    }

    pdfObjectUrl = URL.createObjectURL(generatedPdfBlob);

    el.previewFrame.src = pdfObjectUrl;
    el.previewPanel.hidden = false;

    const filename = sanitizeFilename(el.fileName.value);

    el.outputName.textContent = `${filename}.pdf`;
    el.outputSize.textContent =
      formatFileSize(generatedPdfBlob.size);

    el.downloadBtn.disabled = false;

    setStatus(
      `PDF created successfully with ${images.length} pages. Quality: ${quality}%.`,
      'success'
    );

  } catch (error) {
    console.error('PDF generation error:', error);

    clearGeneratedPdf();

    setStatus(
      error.message || 'Unable to generate PDF.',
      'error'
    );

  } finally {
    setProcessingState(false);
  }
}

// ==========================================
// DOWNLOAD PDF
// ==========================================

function downloadPdf() {
  if (!generatedPdfBlob || !pdfObjectUrl) return;

  const filename =
    sanitizeFilename(el.fileName.value);

  const link = document.createElement('a');

  link.href = pdfObjectUrl;
  link.download = `${filename}.pdf`;

  document.body.appendChild(link);
  link.click();
  link.remove();

  setStatus('PDF downloaded successfully.', 'success');
}

// ==========================================
// RESET
// ==========================================

function resetTool() {
  if (isGenerating) return;

  images.forEach(item => {
    URL.revokeObjectURL(item.previewUrl);
  });

  images = [];

  clearGeneratedPdf();

  el.input.value = '';
  el.fileName.value = 'RESAP-document';

  el.pageSize.value = 'a4';
  el.orientation.value = 'portrait';
  el.fit.value = 'contain';
  el.margin.value = '10';
  el.marginValue.textContent = '10 mm';

  el.quality.value = '90';
  el.qualityValue.textContent = '90%';

  renderImageList();
  updateControls();

  setStatus('Upload images to begin.');
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
            const previousCount = images.length;

            await handleFiles([file]);

            if (images.length > previousCount) {
                setScanUploadStatus(
                    'Image uploaded successfully!',
                    'success'
                );
            } else {
                setScanUploadStatus(
                    'Please upload a valid image file.',
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
        console.error('Image to PDF Scan Upload Error:', error);

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
  if (!isGenerating) {
    el.input.click();
  }
});

el.addMoreBtn.addEventListener('click', () => {
  if (!isGenerating && images.length < MAX_FILES) {
    el.input.click();
  }
});

el.input.addEventListener('change', event => {
  handleFiles(event.target.files);
});

el.uploadArea.addEventListener('dragover', event => {
  event.preventDefault();

  if (!isGenerating) {
    el.uploadArea.classList.add('drag-over');
  }
});

el.uploadArea.addEventListener('dragleave', () => {
  el.uploadArea.classList.remove('drag-over');
});

el.uploadArea.addEventListener('drop', event => {
  event.preventDefault();

  el.uploadArea.classList.remove('drag-over');

  if (!isGenerating) {
    handleFiles(event.dataTransfer.files);
  }
});

el.clearImagesBtn.addEventListener('click', clearAllImages);

el.generateBtn.addEventListener('click', generatePdf);
el.downloadBtn.addEventListener('click', downloadPdf);
el.resetBtn.addEventListener('click', resetTool);
el.scanUploadBtn.addEventListener('click', handleScanUpload);

// ==========================================
// SETTINGS LISTENERS
// ==========================================

el.pageSize.addEventListener('change', () => {
  clearGeneratedPdf();
  setStatus('Page size changed. Generate the PDF again.');
});

el.orientation.addEventListener('change', () => {
  clearGeneratedPdf();
  setStatus('Orientation changed. Generate the PDF again.');
});

el.fit.addEventListener('change', () => {
  clearGeneratedPdf();
  setStatus('Image placement changed. Generate the PDF again.');
});

el.margin.addEventListener('input', () => {
  el.marginValue.textContent = `${el.margin.value} mm`;
  clearGeneratedPdf();
});

el.quality.addEventListener('input', () => {
  el.qualityValue.textContent = `${el.quality.value}%`;
  clearGeneratedPdf();
});

el.fileName.addEventListener('input', () => {
  clearGeneratedPdf();
});

// ==========================================
// INITIAL STATE
// ==========================================

el.pageSize.value = 'a4';
el.orientation.value = 'portrait';
el.fit.value = 'contain';

el.marginValue.textContent = '10 mm';
el.qualityValue.textContent = '90%';

el.downloadBtn.disabled = true;

updateControls();
