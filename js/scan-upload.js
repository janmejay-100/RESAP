
import { io } from "socket.io-client";

// Automatically use the hostname through which RESAP is opened.
// Example: http://192.168.1.5:3001
const BACKEND_URL = `${window.location.protocol}//${window.location.hostname}:3001`;

export async function startScanUpload(onFilesReceived) {
  try {
    const response = await fetch(
      `${BACKEND_URL}/api/upload/sessions`,
      {
        method: "POST",
      }
    );

    if (!response.ok) {
      throw new Error("Unable to create upload session.");
    }

    const session = await response.json();

    const socket = io(BACKEND_URL);

    let retrievalQueue = Promise.resolve();

    async function retrieveUploadedFiles() {
      const fileResponse = await fetch(
        `${BACKEND_URL}/api/upload/sessions/${session.sessionId}/files`,
        {
          headers: {
            Authorization: `Bearer ${session.laptopToken}`,
          },
        }
      );

      if (!fileResponse.ok) {
        throw new Error("Unable to retrieve uploaded files.");
      }

      const data = await fileResponse.json();

      for (const fileInfo of data.files) {
        const downloadResponse = await fetch(
          `${BACKEND_URL}/api/upload/sessions/${session.sessionId}/files/${encodeURIComponent(fileInfo.filename)}`,
          {
            headers: {
              Authorization: `Bearer ${session.laptopToken}`,
            },
          }
        );

        if (!downloadResponse.ok) {
          throw new Error(
            `Unable to retrieve ${fileInfo.originalname}`
          );
        }

        const blob = await downloadResponse.blob();

        const file = new File(
          [blob],
          fileInfo.originalname,
          {
            type: fileInfo.mimeType,
          }
        );

        await onFilesReceived(file);
      }
    }

    function queueFileRetrieval() {
      retrievalQueue = retrievalQueue
        .then(() => retrieveUploadedFiles())
        .catch((error) => {
          console.error("File retrieval failed:", error);
        });

      return retrievalQueue;
    }

    socket.on("connect", () => {
      socket.emit("join-session", {
        sessionId: session.sessionId,
        laptopToken: session.laptopToken,
      });
    });

    socket.on("session-joined", () => {
      console.log("RESAP Scan & Upload connected.");
      queueFileRetrieval();
    });

    socket.on("files-uploaded", () => {
      console.log("New files uploaded from phone.");
      queueFileRetrieval();
    });

    socket.on("session-error", (data) => {
      console.error("Scan & Upload session error:", data.message);
    });

    socket.on("connect_error", (error) => {
      console.error("Scan & Upload connection error:", error.message);
    });

    return {
      sessionId: session.sessionId,
      socket,
      expiresAt: session.expiresAt,
    };

  } catch (error) {
    console.error("Scan & Upload error:", error);
    throw error;
  }
}
