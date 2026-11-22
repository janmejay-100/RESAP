
// Automatically detect the backend address from the QR code URL.
// Example: http://192.168.1.5:3000/scan-upload.html
// Backend becomes: http://192.168.1.5:3001

const BACKEND_URL = `${window.location.protocol}//${window.location.hostname}:3001`;

const fileInput = document.getElementById("phoneFileInput");
const uploadButton = document.getElementById("uploadFilesBtn");
const uploadStatus = document.getElementById("uploadStatus");

const params = new URLSearchParams(window.location.search);
const sessionId = params.get("session");

const MAX_FILE_SIZE = 50 * 1024 * 1024;
const MAX_FILES = 10;

if (!sessionId) {
  uploadButton.disabled = true;
  uploadStatus.textContent =
    "Invalid upload link. Scan the QR code again.";
}

uploadButton.addEventListener("click", async () => {
  const files = Array.from(fileInput.files || []);

  if (!sessionId) {
    uploadStatus.textContent = "Invalid upload session.";
    return;
  }

  if (files.length === 0) {
    uploadStatus.textContent = "Please select at least one file.";
    return;
  }

  if (files.length > MAX_FILES) {
    uploadStatus.textContent =
      `You can upload a maximum of ${MAX_FILES} files at once.`;
    return;
  }

  const oversizedFile = files.find(
    file => file.size > MAX_FILE_SIZE
  );

  if (oversizedFile) {
    uploadStatus.textContent =
      `${oversizedFile.name} exceeds the 50 MB limit.`;
    return;
  }

  const formData = new FormData();

  files.forEach(file => {
    formData.append("files", file);
  });

  uploadButton.disabled = true;
  uploadStatus.textContent = "Uploading files...";

  try {
    const response = await fetch(
      `${BACKEND_URL}/api/upload/sessions/${encodeURIComponent(sessionId)}/files`,
      {
        method: "POST",
        body: formData
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      throw new Error(
        result.message || "Upload failed."
      );
    }

    uploadStatus.textContent =
      "Files uploaded successfully. Check your laptop.";

    fileInput.value = "";

  } catch (error) {
    console.error("RESAP upload error:", error);

    uploadStatus.textContent =
      error.message || "Upload failed. Try again.";

  } finally {
    uploadButton.disabled = false;
  }
});
