import QRCode from "qrcode";
import { startScanUpload } from "./scan-upload.js";

// =========================================
// DOM ELEMENTS
// =========================================

const uploadArea = document.getElementById('signatureUploadArea');
const fileInput = document.getElementById('signatureInput');

const widthInput = document.getElementById('signatureWidth');
const heightInput = document.getElementById('signatureHeight');
const aspectRatioCheckbox = document.getElementById('signatureAspectRatio');
const maxSizeInput = document.getElementById('signatureMaxSize');
const formatSelect = document.getElementById('signatureFormat');

const resizeBtn = document.getElementById('resizeSignatureBtn');
const resetBtn = document.getElementById('resetSignatureBtn');
const downloadBtn = document.getElementById('downloadSignatureBtn');

const originalPreview = document.getElementById('signatureOriginalPreview');
const originalPlaceholder = document.getElementById('signatureOriginalPlaceholder');
const originalInfo = document.getElementById('signatureOriginalInfo');

const resultCanvas = document.getElementById('signatureResultCanvas');
const resultPlaceholder = document.getElementById('signatureResultPlaceholder');
const resultInfo = document.getElementById('signatureResultInfo');

const statusMessage = document.getElementById('signatureStatus');

// Scan & Upload elements
const scanUploadBtn = document.getElementById("signatureScanUploadBtn");
const scanQrContainer = document.getElementById("signatureScanUploadContent");
const scanQrCode = document.getElementById("signatureScanQrCode");
const scanUploadStatus = document.getElementById("signatureScanUploadStatus");
const scanExpiry = document.getElementById("signatureScanExpiry");


// =========================================
// VARIABLES
// =========================================

let originalImage = null;
let originalFile = null;
let originalUrl = null;
let resizedBlob = null;
let aspectRatio = 3;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DIMENSION = 5000;
const MAX_PIXELS = 40000000;

// =========================================
// UTILITY FUNCTIONS
// =========================================

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;

    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(2)} KB`;
    }

    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

let statusTimer;

function setStatus(message, type = '') {
    clearTimeout(statusTimer);

    statusMessage.textContent = message;
    statusMessage.className = `tool-status ${type}`;

    if (message && (type === 'error' || type === 'success')) {
        statusTimer = setTimeout(() => {
            statusMessage.textContent = '';
            statusMessage.className = 'tool-status';
        }, 4000);
    }
}

function enableControls(enabled) {
    widthInput.disabled = !enabled;
    heightInput.disabled = !enabled;
    aspectRatioCheckbox.disabled = !enabled;
    maxSizeInput.disabled = !enabled;
    formatSelect.disabled = !enabled;
    resizeBtn.disabled = !enabled;
    resetBtn.disabled = !enabled;
}

function clearResult() {
    resizedBlob = null;

    resultCanvas.width = 0;
    resultCanvas.height = 0;

    resultPlaceholder.hidden = false;
    resultInfo.textContent = 'No output generated';

    downloadBtn.disabled = true;
}

// =========================================
// LOAD SIGNATURE
// =========================================

function loadSignature(file) {
    if (!file) return;

    setStatus('');

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (!allowedTypes.includes(file.type)) {
        setStatus('Please upload a JPG, PNG or WebP image.', 'error');
        return;
    }

    if (file.size > MAX_FILE_SIZE) {
        setStatus('File size must be 10 MB or less.', 'error');
        return;
    }

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
        if (image.width * image.height > MAX_PIXELS) {
            URL.revokeObjectURL(imageUrl);
            setStatus('This image has too many pixels to process safely.', 'error');
            return;
        }

        if (originalUrl) {
            URL.revokeObjectURL(originalUrl);
        }

        originalUrl = imageUrl;
        originalImage = image;
        originalFile = file;
        aspectRatio = image.width / image.height;

        widthInput.value = image.width;
        heightInput.value = image.height;

        originalPreview.src = imageUrl;
        originalPreview.hidden = false;
        originalPlaceholder.hidden = true;

        originalInfo.textContent =
            `${image.width} × ${image.height} px · ${formatFileSize(file.size)}`;

        enableControls(true);
        clearResult();

        setStatus('Signature uploaded successfully.', 'success');
    };

    image.onerror = () => {
        URL.revokeObjectURL(imageUrl);
        setStatus('Could not load this image. Try another file.', 'error');
    };

    image.src = imageUrl;
}

// =========================================
// UPDATE DIMENSIONS
// =========================================

function updateDimensions(changedField) {
    if (!originalImage || !aspectRatioCheckbox.checked) return;

    if (changedField === 'width') {
        const width = Number(widthInput.value);

        if (width > 0) {
            heightInput.value = Math.max(
                1,
                Math.round(width / aspectRatio)
            );
        }
    } else {
        const height = Number(heightInput.value);

        if (height > 0) {
            widthInput.value = Math.max(
                1,
                Math.round(height * aspectRatio)
            );
        }
    }

    clearResult();
}

// =========================================
// CANVAS TO BLOB
// =========================================

function canvasToBlob(canvas, mimeType, quality) {
    return new Promise((resolve) => {
        canvas.toBlob(resolve, mimeType, quality);
    });
}

// =========================================
// CREATE OUTPUT BLOB
// =========================================

async function createOutputBlob(canvas, mimeType, maxBytes) {
    if (mimeType === 'image/png') {
        const blob = await canvasToBlob(canvas, mimeType);

        if (!blob) {
            throw new Error('PNG export failed.');
        }

        if (blob.size > maxBytes) {
            throw new Error(
                `PNG output is ${formatFileSize(blob.size)}. Increase the file-size limit or choose JPG/WebP.`
            );
        }

        return blob;
    }

    let low = 0.05;
    let high = 1;
    let bestBlob = null;

    for (let i = 0; i < 12; i++) {
        const quality = (low + high) / 2;
        const blob = await canvasToBlob(canvas, mimeType, quality);

        if (!blob) {
            throw new Error('Image export failed.');
        }

        if (blob.size <= maxBytes) {
            bestBlob = blob;
            low = quality;
        } else {
            high = quality;
        }
    }

    if (!bestBlob) {
        const smallestBlob = await canvasToBlob(
            canvas,
            mimeType,
            0.05
        );

        if (!smallestBlob || smallestBlob.size > maxBytes) {
            throw new Error(
                'Could not reach the requested file size. Try smaller dimensions or a larger size limit.'
            );
        }

        return smallestBlob;
    }

    return bestBlob;
}

// =========================================
// RESIZE SIGNATURE
// =========================================

async function resizeSignature() {
    if (!originalImage) return;

    const width = Number(widthInput.value);
    const height = Number(heightInput.value);
    const maxKB = Number(maxSizeInput.value);
    const mimeType = formatSelect.value;

    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1 ||
        width > MAX_DIMENSION ||
        height > MAX_DIMENSION
    ) {
        setStatus('Enter valid dimensions between 1 and 5000 pixels.', 'error');
        return;
    }

    if (width * height > MAX_PIXELS) {
        setStatus('The requested dimensions are too large to process safely.', 'error');
        return;
    }

    if (!Number.isFinite(maxKB) || maxKB < 1 || maxKB > 2048) {
        setStatus('Enter a file-size limit between 1 and 2048 KB.', 'error');
        return;
    }

    const maxBytes = maxKB * 1024;

    resizeBtn.disabled = true;
    resizeBtn.textContent = 'Resizing...';

    setStatus('Processing your signature...');

    try {
        const canvas = document.createElement('canvas');

        canvas.width = width;
        canvas.height = height;

        const context = canvas.getContext('2d');

        if (!context) {
            throw new Error('Canvas is not supported by your browser.');
        }

        if (mimeType === 'image/jpeg') {
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

        const blob = await createOutputBlob(
            canvas,
            mimeType,
            maxBytes
        );

        resizedBlob = blob;

        resultCanvas.width = width;
        resultCanvas.height = height;

        const resultContext = resultCanvas.getContext('2d');

        if (!resultContext) {
            throw new Error('Unable to display the resized image.');
        }

        resultContext.clearRect(0, 0, width, height);
        resultContext.drawImage(canvas, 0, 0);

        resultCanvas.hidden = false;
        resultPlaceholder.hidden = true;

        resultInfo.textContent =
            `${width} × ${height} px · ${formatFileSize(blob.size)}`;

        downloadBtn.disabled = false;

        setStatus('Signature resized successfully.', 'success');

    } catch (error) {
        clearResult();

        setStatus(
            error.message || 'Something went wrong while resizing.',
            'error'
        );

    } finally {
        resizeBtn.disabled = false;
        resizeBtn.textContent = 'Resize Signature';
    }
}
// =========================================
// DOWNLOAD SIGNATURE
// =========================================

function downloadSignature() {
    if (!resizedBlob) return;

    const extension = {
        'image/jpeg': 'jpg',
        'image/png': 'png',
        'image/webp': 'webp'
    }[resizedBlob.type] || 'png';

    const link = document.createElement('a');
    const url = URL.createObjectURL(resizedBlob);

    const originalName = originalFile?.name
        .replace(/\.[^/.]+$/, '')
        .replace(/[^a-zA-Z0-9_-]/g, '_') || 'signature';

    link.href = url;
    link.download = `${originalName}-resized.${extension}`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// =========================================
// RESET SIGNATURE
// =========================================

function resetSignature() {
    if (originalUrl) {
        URL.revokeObjectURL(originalUrl);
    }

    originalImage = null;
    originalFile = null;
    originalUrl = null;
    aspectRatio = 3;

    fileInput.value = '';

    originalPreview.removeAttribute('src');
    originalPreview.hidden = true;

    originalPlaceholder.hidden = false;
    originalInfo.textContent = 'No image uploaded';

    widthInput.value = 300;
    heightInput.value = 100;

    aspectRatioCheckbox.checked = true;
    maxSizeInput.value = 50;
    formatSelect.value = 'image/jpeg';

    clearResult();
    enableControls(false);

    setStatus('');
}

// =========================================
// FILE UPLOAD EVENTS
// =========================================

uploadArea.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (event) => {
    loadSignature(event.target.files[0]);
});

// =========================================
// DRAG & DROP
// =========================================

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

    const file = event.dataTransfer.files[0];
    loadSignature(file);
});

// =========================================
// INPUT EVENTS
// =========================================

widthInput.addEventListener('input', () => {
    updateDimensions('width');
});

heightInput.addEventListener('input', () => {
    updateDimensions('height');
});

[maxSizeInput, formatSelect].forEach((element) => {
    element.addEventListener('change', clearResult);
});

// =========================================
// BUTTON EVENTS
// =========================================

resizeBtn.addEventListener('click', resizeSignature);
downloadBtn.addEventListener('click', downloadSignature);
resetBtn.addEventListener('click', resetSignature);

// =========================================
// INITIALIZE
// =========================================

enableControls(false);
clearResult();

// =========================================
// SCAN & UPLOAD FROM PHONE
// =========================================

scanUploadBtn.addEventListener("click", async () => {
    scanUploadBtn.disabled = true;

    scanUploadStatus.textContent = "Generating QR code...";
scanQrContainer.hidden = false;
    try {
        const session = await startScanUpload((file) => {
            loadSignature(file);
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