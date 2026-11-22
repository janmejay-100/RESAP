import QRCode from "qrcode";
import { startScanUpload } from "./scan-upload.js";
const uploadArea = document.getElementById('collageUploadArea');
const imageInput = document.getElementById('collageImageInput');
// RESAP Scan & Upload
const scanUploadBtn = document.getElementById("scanUploadBtn");
const scanUploadStatus = document.getElementById("scanUploadStatus");
const scanQrContainer = document.getElementById("scanQrContainer");
const scanQrCode = document.getElementById("scanQrCode");
const scanExpiry = document.getElementById("scanExpiry");
const fileList = document.getElementById('collageFileList');
const thumbnailList = document.getElementById('photoThumbnailList');

const previewPanel = document.getElementById('collagePreviewPanel');
const canvas = document.getElementById('collageCanvas');
const ctx = canvas.getContext('2d');
const dimensionsText = document.getElementById('collageDimensions');

const layoutSelect = document.getElementById('collageLayout');
const spacingInput = document.getElementById('collageSpacing');
const radiusInput = document.getElementById('collageRadius');
const backgroundInput = document.getElementById('collageBackground');
const formatSelect = document.getElementById('collageOutputFormat');

const spacingValue = document.getElementById('spacingValue');
const radiusValue = document.getElementById('radiusValue');

const createBtn = document.getElementById('createCollageBtn');
const downloadBtn = document.getElementById('downloadCollageBtn');
const resetBtn = document.getElementById('resetCollageBtn');
const status = document.getElementById('collageStatus');

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_PIXELS = 80_000_000;
const MAX_FILES = 6;

let photos = [];
let collageCreated = false;

function showStatus(message, type = 'info') {
    status.textContent = message;
    status.dataset.type = type;
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function enableSettings(enabled) {
    layoutSelect.disabled = !enabled;
    spacingInput.disabled = !enabled;
    radiusInput.disabled = !enabled;
    backgroundInput.disabled = !enabled;
    formatSelect.disabled = !enabled;

    createBtn.disabled = !enabled;
}

function updateLabels() {
    spacingValue.textContent = `${spacingInput.value} px`;
    radiusValue.textContent = `${radiusInput.value} px`;
}

function revokePhotos() {
    photos.forEach((photo) => {
        if (photo.url) URL.revokeObjectURL(photo.url);
    });
}


function renderThumbnails() {
    thumbnailList.replaceChildren();

    let draggedIndex = null;

    photos.forEach((photo, index) => {
        const item = document.createElement('div');
        item.className = 'collage-thumbnail';
        item.draggable = true;
        item.dataset.index = index;

        const image = document.createElement('img');
        image.src = photo.url;
        image.alt = `Uploaded photo ${index + 1}`;
        image.draggable = false;

        const name = document.createElement('span');
        name.textContent = photo.file.name;
        name.title = photo.file.name;

        const removeButton = document.createElement('button');
        removeButton.type = 'button';
        removeButton.textContent = '×';
        removeButton.setAttribute(
            'aria-label',
            `Remove ${photo.file.name}`
        );

        removeButton.addEventListener('click', (event) => {
            event.stopPropagation();

            URL.revokeObjectURL(photo.url);
            photos.splice(index, 1);

            invalidateCollage();
            updateUploadInterface();
        });

        // Start dragging
        item.addEventListener('dragstart', (event) => {
            draggedIndex = index;

            event.dataTransfer.effectAllowed = 'move';
            event.dataTransfer.setData(
                'text/plain',
                String(index)
            );

            item.classList.add('dragging');
        });

        // Allow dropping
        item.addEventListener('dragover', (event) => {
            event.preventDefault();

            event.dataTransfer.dropEffect = 'move';
            item.classList.add('drag-over');
        });

        item.addEventListener('dragleave', () => {
            item.classList.remove('drag-over');
        });

        // Change actual photo sequence
        item.addEventListener('drop', (event) => {
            event.preventDefault();
            event.stopPropagation();
            item.classList.remove('drag-over');

            const fromIndex = Number(
                event.dataTransfer.getData('text/plain')
            );

            const toIndex = index;

            if (
                !Number.isInteger(fromIndex) ||
                fromIndex < 0 ||
                fromIndex >= photos.length ||
                fromIndex === toIndex
            ) {
                return;
            }

            const [movedPhoto] = photos.splice(fromIndex, 1);

            photos.splice(toIndex, 0, movedPhoto);

            draggedIndex = null;

            invalidateCollage();
            renderThumbnails();

            showStatus(
                'Photo order updated. Click Create Collage to apply it.',
                'success'
            );
        });

        // Finish dragging
        item.addEventListener('dragend', () => {
            draggedIndex = null;

            thumbnailList
                .querySelectorAll('.collage-thumbnail')
                .forEach(thumbnail => {
                    thumbnail.classList.remove(
                        'dragging',
                        'drag-over'
                    );
                });
        });

        item.append(image, name, removeButton);
        thumbnailList.appendChild(item);
    });
}

// Allow dropping a photo in the empty gallery area
// to move it to the final position.

thumbnailList.addEventListener('dragover', (event) => {
    if (event.target === thumbnailList) {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
    }
});

thumbnailList.addEventListener('drop', (event) => {
    if (event.target !== thumbnailList) return;

    event.preventDefault();

    const fromIndex = Number(
        event.dataTransfer.getData('text/plain')
    );

    if (
        !Number.isInteger(fromIndex) ||
        fromIndex < 0 ||
        fromIndex >= photos.length ||
        fromIndex === photos.length - 1
    ) {
        return;
    }

    const [movedPhoto] = photos.splice(fromIndex, 1);

    photos.push(movedPhoto);

    invalidateCollage();
    renderThumbnails();

    showStatus(
        'Photo moved to the last position.',
        'success'
    );
});


function updateUploadInterface() {
    const totalSize = photos.reduce(
        (sum, photo) => sum + photo.file.size,
        0
    );

    fileList.textContent = photos.length
        ? `${photos.length} photo(s) selected · ${formatFileSize(totalSize)}`
        : '';

    renderThumbnails();

    const ready = photos.length >= 2;

    enableSettings(ready);
    resetBtn.disabled = photos.length === 0;

    if (ready) {
        showStatus('Photos uploaded. Customize your collage settings.', 'success');
    } else {
        showStatus('Upload at least 2 photos to create a collage.', 'info');
    }
}

function invalidateCollage() {
    collageCreated = false;
    previewPanel.hidden = true;
    downloadBtn.disabled = true;
}

function loadImageFile(file) {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const image = new Image();

        image.onload = () => {
            resolve({
                file,
                image,
                url,
                width: image.naturalWidth,
                height: image.naturalHeight
            });
        };

        image.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error(`Could not load ${file.name}`));
        };

        image.src = url;
    });
}

async function addFiles(fileListObject) {
    const incomingFiles = Array.from(fileListObject);

    if (!incomingFiles.length) return;

    const remainingSlots = MAX_FILES - photos.length;

    if (remainingSlots <= 0) {
    scanUploadStatus.textContent =
        'You can upload a maximum of 6 photos.';

    scanUploadStatus.style.color = '#c0392b';
    return;
}

    const acceptedFiles = incomingFiles.slice(0, remainingSlots);
    const validPhotos = [];

    for (const file of acceptedFiles) {
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    scanUploadStatus.textContent =
        `${file.name} is not a supported image format.`;

    scanUploadStatus.style.color = '#c0392b';
    continue;
}

        if (file.size > MAX_FILE_SIZE) {
            showStatus(`${file.name} exceeds the 20 MB limit.`, 'error');
            continue;
        }

        try {
            const photo = await loadImageFile(file);

            validPhotos.push(photo);
        } catch (error) {
            showStatus(error.message, 'error');
        }
    }

    const existingPixels = photos.reduce(
        (sum, photo) => sum + photo.width * photo.height,
        0
    );

    const incomingPixels = validPhotos.reduce(
        (sum, photo) => sum + photo.width * photo.height,
        0
    );

    if (existingPixels + incomingPixels > MAX_TOTAL_PIXELS) {
        validPhotos.forEach((photo) => URL.revokeObjectURL(photo.url));

        showStatus('Combined image dimensions are too large. Try smaller photos.', 'error');
        return;
    }

    photos.push(...validPhotos);

    updateUploadInterface();
invalidateCollage();

if (incomingFiles.length > remainingSlots) {
    scanUploadStatus.textContent =
        'Maximum 6 photos allowed. Extra files were ignored.';

    scanUploadStatus.style.color = '#c0392b';
} else if (validPhotos.length > 0) {
    scanUploadStatus.textContent =
        'Scan this QR code using your phone.';

    scanUploadStatus.style.color = '';
}
}

function getLayoutSlots(count, width, height, gap) {
    const usableWidth = width - gap * 2;
    const usableHeight = height - gap * 2;

    if (count === 2) {
        const cellWidth = (usableWidth - gap) / 2;

        return [
            { x: gap, y: gap, width: cellWidth, height: usableHeight },
            { x: gap + cellWidth + gap, y: gap, width: cellWidth, height: usableHeight }
        ];
    }

    if (count === 3) {
        const leftWidth = usableWidth * 0.58;
        const rightWidth = usableWidth - leftWidth - gap;
        const cellHeight = (usableHeight - gap) / 2;

        return [
            { x: gap, y: gap, width: leftWidth, height: usableHeight },
            { x: gap + leftWidth + gap, y: gap, width: rightWidth, height: cellHeight },
            {
                x: gap + leftWidth + gap,
                y: gap + cellHeight + gap,
                width: rightWidth,
                height: cellHeight
            }
        ];
    }

    const columns = count === 4 ? 2 : 3;
    const rows = count === 4 ? 2 : 2;

    const cellWidth = (usableWidth - gap * (columns - 1)) / columns;
    const cellHeight = (usableHeight - gap * (rows - 1)) / rows;

    return Array.from({ length: count }, (_, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);

        return {
            x: gap + column * (cellWidth + gap),
            y: gap + row * (cellHeight + gap),
            width: cellWidth,
            height: cellHeight
        };
    });
}

function drawRoundedImage(image, slot, radius) {
    const { x, y, width, height } = slot;

    const safeRadius = Math.min(radius, width / 2, height / 2);

    ctx.save();

    ctx.beginPath();
    ctx.moveTo(x + safeRadius, y);
    ctx.lineTo(x + width - safeRadius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + safeRadius);
    ctx.lineTo(x + width, y + height - safeRadius);
    ctx.quadraticCurveTo(
        x + width,
        y + height,
        x + width - safeRadius,
        y + height
    );
    ctx.lineTo(x + safeRadius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - safeRadius);
    ctx.lineTo(x, y + safeRadius);
    ctx.quadraticCurveTo(x, y, x + safeRadius, y);
    ctx.closePath();

    ctx.clip();

    // Cover the slot without stretching the original image.
    const scale = Math.max(
        width / image.naturalWidth,
        height / image.naturalHeight
    );

    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;

    const drawX = x + (width - drawWidth) / 2;
    const drawY = y + (height - drawHeight) / 2;

    ctx.drawImage(image, drawX, drawY, drawWidth, drawHeight);

    ctx.restore();
}

function createCollage() {
    if (photos.length < 2) {
        showStatus('Upload at least 2 photos first.', 'error');
        return;
    }

    const layoutCount = Number(layoutSelect.value);
    const imagesToUse = photos.slice(0, layoutCount);

    if (imagesToUse.length < 2) {
        showStatus('Upload at least 2 photos.', 'error');
        return;
    }

    const width = 1200;
    const height = 800;

    const gap = Number(spacingInput.value);
    const radius = Number(radiusInput.value);
    const background = backgroundInput.value;

    canvas.width = width;
    canvas.height = height;

    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = background;
    ctx.fillRect(0, 0, width, height);

    const slots = getLayoutSlots(
        layoutCount,
        width,
        height,
        gap
    );

    imagesToUse.forEach((photo, index) => {
        drawRoundedImage(
            photo.image,
            slots[index],
            radius
        );
    });

    dimensionsText.textContent = `${width} × ${height} px · ${imagesToUse.length} photos`;

    previewPanel.hidden = false;
    downloadBtn.disabled = false;

    collageCreated = true;

    showStatus('Your collage is ready to download.', 'success');
}

function downloadCollage() {
    if (!collageCreated) {
        showStatus('Create your collage before downloading.', 'error');
        return;
    }

    const mimeType = formatSelect.value;
    const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';

    canvas.toBlob((blob) => {
        if (!blob) {
            showStatus('Could not export the collage. Try again.', 'error');
            return;
        }

        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');

        link.href = url;
        link.download = `resap-photo-collage.${extension}`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(url), 1000);

        showStatus(`Collage downloaded as ${extension.toUpperCase()}.`, 'success');
    }, mimeType, 0.95);
}

function resetCollage() {
    revokePhotos();

    photos = [];
    collageCreated = false;

    imageInput.value = '';
    fileList.textContent = '';
    thumbnailList.replaceChildren();

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    previewPanel.hidden = true;
    downloadBtn.disabled = true;
    resetBtn.disabled = true;

    layoutSelect.value = '4';
    spacingInput.value = '12';
    radiusInput.value = '8';
    backgroundInput.value = '#ffffff';
    formatSelect.value = 'image/png';

    updateLabels();
    enableSettings(false);

    showStatus('Upload your photos to get started.', 'info');
}
// RESAP Scan & Upload
scanUploadBtn.addEventListener("click", async () => {
    scanUploadBtn.disabled = true;
    scanUploadStatus.textContent = "Generating QR code...";

    try {
        const session = await startScanUpload((file) => {
            addFiles([file]);
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

// Upload events
uploadArea.addEventListener('click', () => imageInput.click());

imageInput.addEventListener('change', (event) => {
    addFiles(event.target.files);
    imageInput.value = '';
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

    addFiles(event.dataTransfer.files);
});

// Settings events
layoutSelect.addEventListener('change', invalidateCollage);

spacingInput.addEventListener('input', () => {
    updateLabels();
    invalidateCollage();
});

radiusInput.addEventListener('input', () => {
    updateLabels();
    invalidateCollage();
});

backgroundInput.addEventListener('input', invalidateCollage);
formatSelect.addEventListener('change', invalidateCollage);

// Button events
createBtn.addEventListener('click', createCollage);
downloadBtn.addEventListener('click', downloadCollage);
resetBtn.addEventListener('click', resetCollage);

// Initial state
updateLabels();
enableSettings(false);
resetBtn.disabled = true;
downloadBtn.disabled = true;
showStatus('Upload your photos to get started.', 'info');
