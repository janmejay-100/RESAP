
import { fileTypeFromFile } from "file-type";

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export async function validateUploadedFile(file) {
  try {
    const detectedType = await fileTypeFromFile(file.path);

    if (!detectedType || !ALLOWED_TYPES.has(detectedType.mime)) {
      return {
        valid: false,
        message: "Unsupported or invalid file type",
      };
    }

    return {
      valid: true,
      mimeType: detectedType.mime,
    };
  } catch {
    return {
      valid: false,
      message: "Unable to validate uploaded file",
    };
  }
}
