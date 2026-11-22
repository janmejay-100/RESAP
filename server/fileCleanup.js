
import fs from "node:fs/promises";

export async function deleteSessionFiles(session) {
  if (!session || !Array.isArray(session.files)) {
    return;
  }

  for (const file of session.files) {
    if (!file.path) continue;

    try {
      await fs.unlink(file.path);
      console.log("Temporary file deleted:", file.filename);
    } catch (error) {
      if (error.code !== "ENOENT") {
        console.error("File cleanup failed:", error.message);
      }
    }
  }
}

export async function deleteTemporaryFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== "ENOENT") {
      console.error("Temporary file deletion failed:", error.message);
    }
  }
}
