
import QRCode from "qrcode";
import { startScanUpload } from "./scan-upload.js";
import {
  formatFileSize,
  sanitizeFilename
} from "./utils.js";

// DOM elements
const imageInput = document.getElementById('imageInput');
const uploadArea = document.getElementById('uploadArea');
const fileList = document.getElementById('fileList');

const widthInput = document.getElementById('widthInput');
const heightInput = document.getElementById('heightInput');
const aspectRatioCheckbox = document.getElementById('aspectRatio');

const formatSelect = document.getElementById('formatSelect');
const qualityInput = document.getElementById('qualityInput');
const qualityValue = document.getElementById('qualityValue');
const qualityGroup = document.getElementById('qualityGroup');

const resizeBtn = document.getElementById('resizeBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');

const previewPanel = document.getElementById('previewPanel');
const originalPreview = document.getElementById('originalPreview');
const resizedCanvas = document.getElementById('resizedCanvas');

const originalDimensions = document.getElementById('originalDimensions');
const resizedDimensions = document.getElementById('resizedDimensions');

const sizeComparison = document.getElementById('sizeComparison');
const originalFileSize = document.getElementById('originalFileSize');
const resizedFileSize = document.getElementById('resizedFileSize');
const sizeReduction = document.getElementById('sizeReduction');

const toolStatus = document.getElementById('toolStatus');

// State
let selectedFile = null;
let originalImage = null;
let originalWidth = 0;
let originalHeight = 0;
let originalObjectURL = null;
let resizedBlob = null;

// Store all uploaded images
let receivedImages = [];

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_DIMENSION = 10000;
const MAX_PIXELS = 40000000;

// Supported image formats
const SUPPORTED_FORMATS = [
  'image/jpeg',
  'image/png',
  'image/webp'
];

// Initialize upload
uploadArea.addEventListener('click', () => {
  imageInput.click();
});

imageInput.addEventListener('change', (event) => {
  const files = Array.from(event.target.files || []);

  files.forEach((file) => {
    handleImage(file);
  });

  // Allow selecting the same file again
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

  const files = Array.from(event.dataTransfer.files || []);

  files.forEach((file) => {
    handleImage(file);
  });
});

// Handle image
async function handleImage(file, addToList = true) {
 if (!SUPPORTED_FORMATS.includes(file.type)) {
  scanUploadStatus.textContent =
    `${file.name}: Please upload a valid image file.`;

  scanUploadStatus.style.color = '#c0392b';
  return;
}
 // Clear previous upload error
  scanUploadStatus.textContent = "Image uploaded successfully.";
  scanUploadStatus.style.color = "";

  if (file.size > MAX_FILE_SIZE) {
    showStatus(
      'File size must be less than 20 MB.',
      true
    );
    return;
  }

  if (file.size === 0) {
    showStatus('The selected file is empty.', true);
    return;
  }

  // Avoid duplicate entries
  if (addToList && receivedImages.includes(file)) {
    return;
  }

  let objectURL = null;

  try {
    showStatus('Loading image...');

    objectURL = URL.createObjectURL(file);

    const image = new Image();

    await new Promise((resolve, reject) => {

      image.onload = () => {
        // Revoke the previous selected image URL
        if (originalObjectURL) {
          URL.revokeObjectURL(originalObjectURL);
        }

        selectedFile = file;
        originalImage = image;
        originalObjectURL = objectURL;

        originalWidth = image.naturalWidth;
        originalHeight = image.naturalHeight;

        // Set dimensions
        widthInput.value = originalWidth;
        heightInput.value = originalHeight;

        // Enable controls
        widthInput.disabled = false;
        heightInput.disabled = false;
        aspectRatioCheckbox.disabled = false;
        formatSelect.disabled = false;
        resizeBtn.disabled = false;
        resetBtn.disabled = false;

        // Update preview
        originalPreview.src = originalObjectURL;

        originalDimensions.textContent =
          `${originalWidth} × ${originalHeight} px`;

        originalFileSize.textContent =
          formatFileSize(file.size);

        sizeComparison.hidden = true;

        resizedDimensions.textContent = 'Not resized yet';

        resizedBlob = null;
        downloadBtn.disabled = true;

        previewPanel.hidden = false;

        // Add image to collection
        if (addToList) {
          receivedImages.push(file);

          const item = document.createElement('div');

          item.className = 'file-list-item';
          item.setAttribute('role', 'button');
          item.setAttribute('tabindex', '0');

          const details = document.createElement('div');
          details.className = 'file-details';

          const name = document.createElement('div');
          name.className = 'file-name';
          name.textContent = file.name;

          const meta = document.createElement('div');
          meta.className = 'file-meta';
          meta.textContent = formatFileSize(file.size);

          details.append(name, meta);
          item.append(details);

          // Select image on click
          item.addEventListener('click', () => {
            handleImage(file, false);
          });

          // Keyboard selection
          item.addEventListener('keydown', (event) => {
            if (
              event.key === 'Enter' ||
              event.key === ' '
            ) {
              event.preventDefault();
              handleImage(file, false);
            }
          });

          fileList.append(item);
        }

        showStatus('Image loaded successfully.');

        updateQualityVisibility();

        resolve();
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectURL);

        reject(
          new Error(
            'Unable to read this image. Try another file.'
          )
        );
      };

      image.src = objectURL;
    });

  } catch (error) {
    console.error(error);

    showStatus(
      error.message ||
      'Something went wrong while loading the image.',
      true
    );
  }
}

// Maintain aspect ratio
widthInput.addEventListener('input', () => {
  if (!originalImage || !aspectRatioCheckbox.checked) {
    return;
  }

  const width = Number(widthInput.value);

  if (width > 0) {
    heightInput.value = Math.round(
      width * originalHeight / originalWidth
    );
  }

  invalidateResult();
});

heightInput.addEventListener('input', () => {
  if (!originalImage || !aspectRatioCheckbox.checked) {
    return;
  }

  const height = Number(heightInput.value);

  if (height > 0) {
    widthInput.value = Math.round(
      height * originalWidth / originalHeight
    );
  }

  invalidateResult();
});

aspectRatioCheckbox.addEventListener('change', () => {
  if (aspectRatioCheckbox.checked && originalImage) {
    heightInput.value = Math.round(
      Number(widthInput.value) *
      originalHeight / originalWidth
    );
  }

  invalidateResult();
});

// Output format
formatSelect.addEventListener('change', () => {
  updateQualityVisibility();
  invalidateResult();
});

function updateQualityVisibility() {
  const isJpegOrWebp =
    formatSelect.value === 'image/jpeg' ||
    formatSelect.value === 'image/webp';

  qualityGroup.hidden = !isJpegOrWebp;
}

// Quality input
qualityInput.addEventListener('input', () => {
  qualityValue.textContent =
    `${qualityInput.value}%`;

  invalidateResult();
});

// Resize image
resizeBtn.addEventListener('click', async () => {
  if (!originalImage) {
    showStatus('Upload an image first.', true);
    return;
  }

  const width = Number(widthInput.value);
  const height = Number(heightInput.value);

  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION
  ) {
    showStatus(
      'Enter valid dimensions between 1 and 10,000 pixels.',
      true
    );
    return;
  }

  if (width * height > MAX_PIXELS) {
    showStatus(
      'The output image is too large. Use fewer pixels.',
      true
    );
    return;
  }

  resizeBtn.disabled = true;
  downloadBtn.disabled = true;

  try {
    showStatus('Resizing image...');

    resizedCanvas.width = width;
    resizedCanvas.height = height;

    const context = resizedCanvas.getContext('2d');

    if (!context) {
      throw new Error(
        'Canvas is not supported by this browser.'
      );
    }

    // Prevent transparent backgrounds from turning black
    // in JPG output.
    if (formatSelect.value === 'image/jpeg') {
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, width, height);
    }

    context.drawImage(
      originalImage,
      0,
      0,
      width,
      height
    );

    const mimeType = formatSelect.value;
    const quality = Number(qualityInput.value) / 100;

    resizedBlob = await new Promise((resolve, reject) => {
      resizedCanvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(
              new Error('Could not create resized image.')
            );
          }
        },
        mimeType,
        quality
      );
    });

    // Check browser output format
    if (resizedBlob.type !== mimeType) {
      throw new Error(
        `Your browser could not export ${mimeType}.`
      );
    }

    resizedDimensions.textContent =
      `${width} × ${height} px · ${formatFileSize(resizedBlob.size)}`;

    resizedFileSize.textContent =
      formatFileSize(resizedBlob.size);

    const difference =
      selectedFile.size - resizedBlob.size;

    const percentage =
      Math.abs(difference / selectedFile.size * 100);

    if (difference > 0) {
      sizeReduction.textContent =
        `${percentage.toFixed(1)}% smaller`;
    } else if (difference < 0) {
      sizeReduction.textContent =
        `${percentage.toFixed(1)}% larger`;
    } else {
      sizeReduction.textContent = 'Same file size';
    }

    sizeComparison.hidden = false;

    downloadBtn.disabled = false;

    showStatus('Image resized successfully.');

  } catch (error) {
    console.error(error);

    resizedBlob = null;

    showStatus(
      error.message || 'Image resizing failed.',
      true
    );

  } finally {
    resizeBtn.disabled = false;
  }
});

// Download image
downloadBtn.addEventListener('click', () => {
  if (!resizedBlob || !selectedFile) {
    return;
  }

  const extensionMap = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };

  const extension = extensionMap[formatSelect.value];

  const baseName = selectedFile.name.replace(
    /\.[^.]+$/,
    ''
  );

  const filename = sanitizeFilename(
    `${baseName}-resized.${extension}`
  );

  const downloadURL = URL.createObjectURL(resizedBlob);

  const link = document.createElement('a');

  link.href = downloadURL;
  link.download = filename;

  document.body.appendChild(link);

  link.click();
  link.remove();

  setTimeout(() => {
    URL.revokeObjectURL(downloadURL);
  }, 1000);

  showStatus('Download started.');
});

// Reset
resetBtn.addEventListener('click', () => {
  if (originalObjectURL) {
    URL.revokeObjectURL(originalObjectURL);
  }

  sizeComparison.hidden = true;

  originalFileSize.textContent = '—';
  resizedFileSize.textContent = '—';
  sizeReduction.textContent = '—';

  selectedFile = null;
  originalImage = null;
  originalWidth = 0;
  originalHeight = 0;
  originalObjectURL = null;
  resizedBlob = null;

  // Clear uploaded images
  receivedImages = [];

  imageInput.value = '';

  widthInput.value = '';
  heightInput.value = '';

  widthInput.disabled = true;
  heightInput.disabled = true;

  aspectRatioCheckbox.checked = true;
  aspectRatioCheckbox.disabled = true;

  formatSelect.value = 'image/png';
  formatSelect.disabled = true;

  resizeBtn.disabled = true;
  downloadBtn.disabled = true;
  resetBtn.disabled = true;

  originalPreview.removeAttribute('src');

  originalDimensions.textContent = '—';
  resizedDimensions.textContent = '—';

  resizedCanvas.width = 0;
  resizedCanvas.height = 0;

  previewPanel.hidden = true;

  fileList.replaceChildren();

  updateQualityVisibility();

  showStatus('Upload an image to begin.');
});

// Invalidate previous resize result
function invalidateResult() {
  resizedBlob = null;

  downloadBtn.disabled = true;

  sizeComparison.hidden = true;

  if (originalImage) {
    resizedDimensions.textContent =
      'Settings changed. Resize again.';
  }
}

// Status message
function showStatus(message, isError = false) {
  toolStatus.textContent = message;

  toolStatus.style.color =
    isError ? '#c0392b' : '';
}

// Initial state
updateQualityVisibility();

// RESAP Scan & Upload
const scanUploadBtn =
  document.getElementById("scanUploadBtn");

const scanUploadStatus =
  document.getElementById("scanUploadStatus");

const scanQrContainer =
  document.getElementById("scanQrContainer");

const scanQrCode =
  document.getElementById("scanQrCode");

const scanExpiry =
  document.getElementById("scanExpiry");

scanUploadBtn.addEventListener("click", async () => {
  scanUploadBtn.disabled = true;

  scanUploadStatus.textContent = "Generating QR code...";

  try {
    // Create upload session
    const session = await startScanUpload((file) => {
      return handleImage(file);
    });

    // Detect the laptop's current network IP
    const networkResponse = await fetch(
      "http://localhost:3001/api/network-info"
    );

    if (!networkResponse.ok) {
      throw new Error("Unable to detect laptop network address.");
    }

    const networkInfo = await networkResponse.json();

    // Generate QR URL using the detected IP
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
