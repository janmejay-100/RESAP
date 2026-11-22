import QRCode from "qrcode";
import { startScanUpload } from "./scan-upload.js";
const uploadArea = document.getElementById('uploadArea');
const imageInput = document.getElementById('imageInput');
const fileList = document.getElementById('fileList');

const editorPanel = document.getElementById('editorPanel');
const cropCanvas = document.getElementById('cropCanvas');
const cropDimensions = document.getElementById('cropDimensions');

const previewPanel = document.getElementById('previewPanel');
const resultCanvas = document.getElementById('resultCanvas');
const resultDimensions = document.getElementById('resultDimensions');

const aspectRatioSelect = document.getElementById('aspectRatioSelect');
const outputFormat = document.getElementById('outputFormat');

const clearCropBtn = document.getElementById('clearCropBtn');
const resetCropBtn = document.getElementById('resetCropBtn');
const cropBtn = document.getElementById('cropBtn');
const downloadBtn = document.getElementById('downloadBtn');
const resetBtn = document.getElementById('resetBtn');
const toolStatus = document.getElementById('toolStatus');
// RESAP Scan & Upload
const scanUploadBtn = document.getElementById("scanUploadBtn");
const scanUploadStatus = document.getElementById("scanUploadStatus");
const scanQrContainer = document.getElementById("scanQrContainer");
const scanQrCode = document.getElementById("scanQrCode");
const scanExpiry = document.getElementById("scanExpiry");
const ctx = cropCanvas.getContext('2d');
const resultCtx = resultCanvas.getContext('2d');

let originalImage = null;
let originalFile = null;
let selection = null;

let interaction = null;
let activeHandle = null;

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const HANDLE_SIZE = 12;
const MIN_CROP_SIZE = 10;

const HANDLE_NAMES = [
    'nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'
];

function showStatus(message, type = 'info') {
    if (!toolStatus) return;

    toolStatus.textContent = message;
    toolStatus.dataset.type = type;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

// Supports values such as "1:1", "4:3", "free", and "16:9".
function getAspectRatio() {
    const value = String(aspectRatioSelect.value).trim().toLowerCase();

    if (!value || value === 'free' || value === 'original') {
        return null;
    }

    const match = value.match(/^(\d+(?:\.\d+)?):(\d+(?:\.\d+)?)$/);

    if (match) {
        const width = Number(match[1]);
        const height = Number(match[2]);

        if (width > 0 && height > 0) {
            return width / height;
        }
    }

    return null;
}

function getPointerPosition(event) {
    const rect = cropCanvas.getBoundingClientRect();

    return {
        x: (event.clientX - rect.left) * cropCanvas.width / rect.width,
        y: (event.clientY - rect.top) * cropCanvas.height / rect.height
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function getHandles(rect) {
    const { x, y, width, height } = rect;
    const right = x + width;
    const bottom = y + height;
    const middleX = x + width / 2;
    const middleY = y + height / 2;

    return {
        nw: { x, y },
        n: { x: middleX, y },
        ne: { x: right, y },
        e: { x: right, y: middleY },
        se: { x: right, y: bottom },
        s: { x: middleX, y: bottom },
        sw: { x, y: bottom },
        w: { x, y: middleY }
    };
}

function drawEditor() {
    if (!originalImage) return;

    ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);

    ctx.drawImage(
        originalImage,
        0,
        0,
        cropCanvas.width,
        cropCanvas.height
    );

    if (!selection) {
        cropDimensions.textContent = 'Drag on the image to select an area';
        return;
    }

    const { x, y, width, height } = selection;

    // Darken everything outside the crop area.
    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, cropCanvas.width, cropCanvas.height);

    ctx.clearRect(x, y, width, height);

    ctx.drawImage(
        originalImage,
        x, y, width, height,
        x, y, width, height
    );

    // Crop boundary.
    ctx.strokeStyle = '#DCEAAE';
    ctx.lineWidth = Math.max(2, cropCanvas.width / 500);
    ctx.setLineDash([]);
    ctx.strokeRect(x, y, width, height);

    // Draw eight resize handles.
    const handles = getHandles(selection);
    const handleRadius = Math.max(
        5,
        Math.min(cropCanvas.width, cropCanvas.height) * 0.008
    );

    Object.values(handles).forEach((point) => {
        ctx.beginPath();
        ctx.arc(point.x, point.y, handleRadius, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = 2;
        ctx.strokeStyle = '#174D43';
        ctx.stroke();
    });

    ctx.restore();

    cropDimensions.textContent =
        `Crop area: ${Math.round(width)} × ${Math.round(height)} px`;
}

function findHandle(point) {
    if (!selection) return null;

    const handles = getHandles(selection);
    const tolerance = HANDLE_SIZE * (
        cropCanvas.width / cropCanvas.getBoundingClientRect().width
    );

    for (const name of HANDLE_NAMES) {
        const handle = handles[name];

        if (
            Math.abs(point.x - handle.x) <= tolerance &&
            Math.abs(point.y - handle.y) <= tolerance
        ) {
            return name;
        }
    }

    return null;
}

function isInsideSelection(point) {
    if (!selection) return false;

    return (
        point.x >= selection.x &&
        point.x <= selection.x + selection.width &&
        point.y >= selection.y &&
        point.y <= selection.y + selection.height
    );
}


function createInitialSelection(start, current) {
    const ratio = getAspectRatio();

    const dx = current.x - start.x;
    const dy = current.y - start.y;

    const directionX = dx < 0 ? -1 : 1;
    const directionY = dy < 0 ? -1 : 1;

    let width = Math.abs(dx);
    let height = Math.abs(dy);

    if (ratio) {
        // Available space in the drag direction.
        const maxWidth = directionX > 0
            ? cropCanvas.width - start.x
            : start.x;

        const maxHeight = directionY > 0
            ? cropCanvas.height - start.y
            : start.y;

        // Fit the selection inside the pointer's drag rectangle
        // while preserving the selected aspect ratio.
        width = Math.min(
            width,
            height * ratio,
            maxWidth,
            maxHeight * ratio
        );

        height = width / ratio;
    } else {
        // Free crop: independently limit both dimensions.
        width = Math.min(
            width,
            directionX > 0 ? cropCanvas.width - start.x : start.x
        );

        height = Math.min(
            height,
            directionY > 0 ? cropCanvas.height - start.y : start.y
        );
    }

    const x = directionX > 0 ? start.x : start.x - width;
    const y = directionY > 0 ? start.y : start.y - height;

    return {
        x,
        y,
        width,
        height
    };
}


function moveSelection(point) {
    const dx = point.x - interaction.start.x;
    const dy = point.y - interaction.start.y;

    selection.x = clamp(
        interaction.original.x + dx,
        0,
        cropCanvas.width - selection.width
    );

    selection.y = clamp(
        interaction.original.y + dy,
        0,
        cropCanvas.height - selection.height
    );
}

function resizeSelection(point) {
    const original = interaction.original;
    const handle = interaction.handle;
    const ratio = getAspectRatio();

    let left = original.x;
    let top = original.y;
    let right = original.x + original.width;
    let bottom = original.y + original.height;

    // Move the selected edges.
    if (handle.includes('w')) left = clamp(point.x, 0, right - MIN_CROP_SIZE);
    if (handle.includes('e')) right = clamp(point.x, left + MIN_CROP_SIZE, cropCanvas.width);
    if (handle.includes('n')) top = clamp(point.y, 0, bottom - MIN_CROP_SIZE);
    if (handle.includes('s')) bottom = clamp(point.y, top + MIN_CROP_SIZE, cropCanvas.height);

    let width = right - left;
    let height = bottom - top;

    // Keep the selected aspect ratio when resizing.
    if (ratio) {
        const horizontalChange = handle.includes('e') || handle.includes('w');
        const verticalChange = handle.includes('n') || handle.includes('s');

        if (horizontalChange && verticalChange) {
            if (width / Math.max(height, 0.001) > ratio) {
                height = width / ratio;
            } else {
                width = height * ratio;
            }
        } else if (horizontalChange) {
            height = width / ratio;
        } else if (verticalChange) {
            width = height * ratio;
        }

        // Keep the opposite corner or edge fixed.
        if (handle.includes('w')) left = right - width;
        if (handle.includes('e')) right = left + width;
        if (handle.includes('n')) top = bottom - height;
        if (handle.includes('s')) bottom = top + height;

        // Prevent the selection from exceeding the image.
        if (left < 0) {
            left = 0;
            width = right - left;
            height = width / ratio;
            if (handle.includes('n')) top = bottom - height;
            else bottom = top + height;
        }

        if (top < 0) {
            top = 0;
            height = bottom - top;
            width = height * ratio;
            if (handle.includes('w')) left = right - width;
            else right = left + width;
        }

        if (right > cropCanvas.width) {
            right = cropCanvas.width;
            width = right - left;
            height = width / ratio;
            if (handle.includes('n')) top = bottom - height;
            else bottom = top + height;
        }

        if (bottom > cropCanvas.height) {
            bottom = cropCanvas.height;
            height = bottom - top;
            width = height * ratio;
            if (handle.includes('w')) left = right - width;
            else right = left + width;
        }
    }

    left = clamp(left, 0, cropCanvas.width);
    top = clamp(top, 0, cropCanvas.height);
    right = clamp(right, left, cropCanvas.width);
    bottom = clamp(bottom, top, cropCanvas.height);

    selection = {
        x: left,
        y: top,
        width: right - left,
        height: bottom - top
    };
}

function handlePointerDown(event) {
    if (!originalImage) return;

    event.preventDefault();

    const point = getPointerPosition(event);
    const handle = findHandle(point);

    if (handle) {
        activeHandle = handle;
        interaction = {
            type: 'resize',
            handle,
            start: point,
            original: { ...selection }
        };
    } else if (isInsideSelection(point)) {
        activeHandle = 'move';
        interaction = {
            type: 'move',
            start: point,
            original: { ...selection }
        };
    } else {
        activeHandle = null;
        interaction = {
            type: 'draw',
            start: point
        };

        selection = {
            x: point.x,
            y: point.y,
            width: 0,
            height: 0
        };
    }

    cropCanvas.setPointerCapture(event.pointerId);
    previewPanel.hidden = true;
    downloadBtn.disabled = true;
    drawEditor();
}

function handlePointerMove(event) {
    if (!interaction) return;

    const point = getPointerPosition(event);

    if (interaction.type === 'draw') {
        selection = createInitialSelection(interaction.start, point);
    } else if (interaction.type === 'move') {
        moveSelection(point);
    } else if (interaction.type === 'resize') {
        resizeSelection(point);
    }

    drawEditor();
}

function handlePointerUp() {
    if (!interaction) return;

    interaction = null;
    activeHandle = null;

    if (
        !selection ||
        selection.width < MIN_CROP_SIZE ||
        selection.height < MIN_CROP_SIZE
    ) {
        selection = null;
        drawEditor();
        showStatus('Select a larger crop area.', 'error');
        return;
    }

    showStatus(
        'Crop area selected. Drag inside to move it or drag a handle to resize it.',
        'success'
    );
}

function loadSelectedImage(file) {
    if (!file) return;

    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    scanUploadStatus.textContent =
        `${file.name}: Please upload a valid image file.`;

    scanUploadStatus.style.color = '#c0392b';
    return;
}

// Clear previous upload error
scanUploadStatus.textContent = "Image uploaded successfully";
scanUploadStatus.style.color = "";
    if (file.size > MAX_FILE_SIZE) {
        showStatus('File size must be 20 MB or less.', 'error');
        return;
    }

    const imageUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
        URL.revokeObjectURL(imageUrl);

        if (image.naturalWidth * image.naturalHeight > MAX_PIXELS) {
            showStatus('Image dimensions are too large to process safely.', 'error');
            return;
        }

        originalImage = image;
        originalFile = file;
        selection = null;
        interaction = null;

        cropCanvas.width = image.naturalWidth;
        cropCanvas.height = image.naturalHeight;

        fileList.textContent =
            `${file.name} · ${image.naturalWidth} × ${image.naturalHeight} px · ${formatFileSize(file.size)}`;

        editorPanel.hidden = false;
previewPanel.hidden = true;

cropBtn.disabled = false;
downloadBtn.disabled = true;

aspectRatioSelect.disabled = false;
outputFormat.disabled = false;
resetBtn.disabled = false;

clearCropBtn.disabled = false;
resetCropBtn.disabled = false;

        drawEditor();
        showStatus('Drag on the image to select a crop area.', 'success');
    };

    image.onerror = () => {
        URL.revokeObjectURL(imageUrl);
        showStatus('Unable to load this image. Try another file.', 'error');
    };

    image.src = imageUrl;
}

function cropImage() {
    if (!originalImage || !selection) {
        showStatus('Please select a crop area first.', 'error');
        return;
    }

    const x = Math.round(selection.x);
    const y = Math.round(selection.y);
    const width = Math.round(selection.width);
    const height = Math.round(selection.height);

    if (width < MIN_CROP_SIZE || height < MIN_CROP_SIZE) {
        showStatus('Please select a larger crop area.', 'error');
        return;
    }

    resultCanvas.width = width;
    resultCanvas.height = height;

    resultCtx.clearRect(0, 0, width, height);

    resultCtx.drawImage(
        originalImage,
        x, y, width, height,
        0, 0, width, height
    );

    resultDimensions.textContent = `${width} × ${height} px`;

    previewPanel.hidden = false;
    downloadBtn.disabled = false;

    showStatus('Image cropped. Choose your format and download it.', 'success');
}

function getSelectedFormat() {
    const value = outputFormat.value.toLowerCase();

    if (value === 'image/png' || value === 'png') return 'png';
    if (value === 'image/webp' || value === 'webp') return 'webp';

    return 'jpg';
}

function downloadCroppedImage() {
    if (!resultCanvas.width || !resultCanvas.height) {
        showStatus('Crop an image before downloading.', 'error');
        return;
    }

    const format = getSelectedFormat();

    const mimeTypes = {
        png: 'image/png',
        jpg: 'image/jpeg',
        webp: 'image/webp'
    };

    const mimeType = mimeTypes[format];

    const exportCanvas = document.createElement('canvas');
    exportCanvas.width = resultCanvas.width;
    exportCanvas.height = resultCanvas.height;

    const exportCtx = exportCanvas.getContext('2d');

    // JPG does not support transparency.
    if (format === 'jpg') {
        exportCtx.fillStyle = '#ffffff';
        exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    }

    exportCtx.drawImage(resultCanvas, 0, 0);

    exportCanvas.toBlob((blob) => {
        if (!blob) {
            showStatus('Could not create the image. Try again.', 'error');
            return;
        }

        const baseName = originalFile.name.replace(/\.[^/.]+$/, '');
        const fileName = `${baseName}-cropped.${format}`;

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showStatus(`Downloaded ${fileName}`, 'success');
    }, mimeType, 0.95);
}

function clearCrop() {
    selection = null;
    interaction = null;

    previewPanel.hidden = true;
    downloadBtn.disabled = true;

    drawEditor();
    showStatus('Crop selection cleared. Select a new area.', 'info');
}

function resetCropper() {
    originalImage = null;
    originalFile = null;
    selection = null;
    interaction = null;

    imageInput.value = '';
    fileList.textContent = '';

    ctx.clearRect(0, 0, cropCanvas.width, cropCanvas.height);
    resultCtx.clearRect(0, 0, resultCanvas.width, resultCanvas.height);

    editorPanel.hidden = true;
    previewPanel.hidden = true;

    cropBtn.disabled = true;
    downloadBtn.disabled = true;

    showStatus('Upload an image to get started.', 'info');
}

// Upload events
uploadArea.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (event) => {
    loadSelectedImage(event.target.files[0]);
});

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
    loadSelectedImage(event.dataTransfer.files[0]);
});

// Crop selection events
cropCanvas.addEventListener('pointerdown', handlePointerDown);
cropCanvas.addEventListener('pointermove', handlePointerMove);
cropCanvas.addEventListener('pointerup', handlePointerUp);
cropCanvas.addEventListener('pointercancel', handlePointerUp);

// Buttons
cropBtn.addEventListener('click', cropImage);
downloadBtn.addEventListener('click', downloadCroppedImage);
clearCropBtn.addEventListener('click', clearCrop);
resetCropBtn.addEventListener('click', clearCrop);
resetBtn.addEventListener('click', resetCropper);

// Changing aspect ratio clears the old selection.
aspectRatioSelect.addEventListener('change', () => {
    selection = null;
    interaction = null;
    previewPanel.hidden = true;
    downloadBtn.disabled = true;

    drawEditor();
    showStatus('Aspect ratio changed. Select a new crop area.', 'info');
});

// Changing output format updates the next download.
outputFormat.addEventListener('change', () => {
    if (resultCanvas.width && resultCanvas.height) {
        showStatus(
            `Output format set to ${getSelectedFormat().toUpperCase()}. Download when ready.`,
            'success'
        );
    }
});

// Initial state
cropBtn.disabled = true;
downloadBtn.disabled = true;
showStatus('Upload an image to get started.', 'info');

// RESAP Scan & Upload
scanUploadBtn.addEventListener("click", async () => {
  scanUploadBtn.disabled = true;
  scanUploadStatus.textContent = "Generating QR code...";

  try {
   const session = await startScanUpload((file) => {
    loadSelectedImage(file);
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
