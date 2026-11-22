/**
 * RESAP — Utility Functions
 */

/**
 * Format file size to human readable string
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)) + ' ' + sizes[i];
}

/**
 * Sanitize filename for download
 */
export function sanitizeFilename(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 200);
}

/**
 * Get file extension
 */
export function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

/**
 * Validate file is an image
 */
export function isImageFile(file) {
  const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'];
  return validTypes.includes(file.type);
}

/**
 * Validate file is a PDF
 */
export function isPDFFile(file) {
  return file.type === 'application/pdf';
}

/**
 * Create download link and trigger download
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = sanitizeFilename(filename);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Revoke after a delay to ensure download starts
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Load an image from a file and return an HTMLImageElement
 */

export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}


/**
 * Read file as ArrayBuffer
 */
export function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Read file as DataURL
 */
export function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

/**
 * Canvas to Blob
 */
export function canvasToBlob(canvas, type = 'image/jpeg', quality = 0.92) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error('Failed to create blob')),
      type,
      quality
    );
  });
}

/**
 * Get MIME type from format string
 */
export function getMimeType(format) {
  const map = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'webp': 'image/webp',
    'gif': 'image/gif',
    'bmp': 'image/bmp'
  };
  return map[format.toLowerCase()] || 'image/jpeg';
}

/**
 * Get format from MIME type
 */
export function getFormatFromMime(mime) {
  const map = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/bmp': 'bmp'
  };
  return map[mime] || 'jpg';
}

/**
 * Debounce utility
 */
export function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(null, args), ms);
  };
}

/**
 * Generate unique ID
 */
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}
