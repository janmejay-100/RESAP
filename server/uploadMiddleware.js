
import multer from "multer";
import { randomUUID } from "node:crypto";

export function createUploadMiddleware(tempDirectory) {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, tempDirectory);
    },

    filename: (req, file, cb) => {
      cb(null, randomUUID());
    },
  });

  return multer({
    storage,

    limits: {
      fileSize: Number(
        process.env.MAX_FILE_SIZE_BYTES || 52428800
      ),
      files: Number(
        process.env.MAX_FILES_PER_SESSION || 10
      ),
    },
  }).array("files", 10);
}
