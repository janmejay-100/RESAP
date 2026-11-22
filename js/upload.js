/**
 * RESAP — File Upload Handler
 * Reusable upload logic for all tool pages.
 */
import { formatFileSize, isImageFile, isPDFFile } from './utils.js';

/**
 * Initialize upload area
 * @param {Object} config
 * @param {string} config.areaId - ID of the upload area element
 * @param {string} config.inputId - ID of the file input element
 * @param {string} config.accept - Accepted file types (e.g., 'image/*')
 * @param {boolean} config.multiple - Allow multiple files
 * @param {number} config.maxSize - Max file size in bytes
 * @param {Function} config.onFiles - Callback with selected files
 * @param {Function} config.validate - Optional validation function
 */
export function initUploadArea(config) {
  const area = document.getElementById(config.areaId);
  const input = document.getElementById(config.inputId);
  if (!area || !input) return;

  // Click to browse
  area.addEventListener('click', () => input.click());

  // Drag and drop
  area.addEventListener('dragover', (e) => {
    e.preventDefault();
    area.classList.add('drag-over');
  });

  area.addEventListener('dragleave', () => {
    area.classList.remove('drag-over');
  });

  area.addEventListener('drop', (e) => {
    e.preventDefault();
    area.classList.remove('drag-over');
    handleFiles(e.dataTransfer.files, config);
  });

  // File input change
  input.addEventListener('change', (e) => {
    handleFiles(e.target.files, config);
    input.value = ''; // Reset so same file can be re-selected
  });
}

function handleFiles(fileList, config) {
  if (!fileList || fileList.length === 0) return;

  const files = Array.from(fileList);
  const validFiles = [];
  const errors = [];

  for (const file of files) {
    // Size check
    if (config.maxSize && file.size > config.maxSize) {
      errors.push(`${file.name}: File too large (max ${formatFileSize(config.maxSize)})`);
      continue;
    }

    // Size check — empty files
    if (file.size === 0) {
      errors.push(`${file.name}: File is empty`);
      continue;
    }

    // Custom validation
    if (config.validate) {
      const error = config.validate(file);
      if (error) {
        errors.push(`${file.name}: ${error}`);
        continue;
      }
    }

    validFiles.push(file);

    // Stop if not multiple
    if (!config.multiple && validFiles.length >= 1) break;
  }

  if (errors.length > 0) {
    showUploadError(errors.join('\n'));
  }

  if (validFiles.length > 0 && config.onFiles) {
    config.onFiles(config.multiple ? validFiles : [validFiles[0]]);
  }
}

function showUploadError(message) {
  // Create a temporary toast
  const toast = document.createElement('div');
  toast.className = 'alert alert-error';
  toast.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:999;max-width:400px;box-shadow:var(--shadow-lg);';
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}
