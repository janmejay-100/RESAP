
import fs from "node:fs/promises";
import path from "node:path";

export async function initializeStorage() {
  const tempDirectory = path.resolve(
    process.cwd(),
    process.env.TEMP_UPLOAD_DIR || "server/temp"
  );

  await fs.mkdir(tempDirectory, { recursive: true });

  // Remove files left behind by an earlier server session.
  const entries = await fs.readdir(tempDirectory, {
    withFileTypes: true,
  });

  for (const entry of entries) {
    if (!entry.isFile()) continue;

    const filePath = path.join(tempDirectory, entry.name);

    try {
      await fs.unlink(filePath);
      console.log("Removed leftover temporary file:", entry.name);
    } catch (error) {
      console.error("Startup cleanup failed:", error.message);
    }
  }

  console.log("Temporary storage initialized:", tempDirectory);

  return tempDirectory;
}
