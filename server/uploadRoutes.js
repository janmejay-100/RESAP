import path from "node:path";
import express from "express";

import { createUploadMiddleware } from "./uploadMiddleware.js";

import {
  createSession,
  getSession,
  addFileToSession,
  authorizeLaptop,
  claimFileForRetrieval,
  releaseFileRetrieval,
  removeRetrievedFile,
} from "./sessionManager.js";

import { validateUploadedFile } from "./fileValidator.js";

import {
  deleteTemporaryFile,
} from "./fileCleanup.js";

export function createUploadRouter({ tempDirectory, io }) {
  const router = express.Router();
  const upload = createUploadMiddleware(tempDirectory);

  // Create upload session
  router.post("/sessions", (req, res) => {
    const { session, laptopToken } = createSession();

    res.status(201).json({
      success: true,
      sessionId: session.id,
      laptopToken,
      expiresAt: session.expiresAt,
    });
  });

  // Upload files from phone
  router.post(
    "/sessions/:sessionId/files",

    (req, res, next) => {
      const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!uuidRegex.test(req.params.sessionId)) {
    return res.status(400).json({
        error: "Invalid session ID"
    });
}
      const session = getSession(req.params.sessionId);

      if (!session) {
        return res.status(410).json({
          success: false,
          message: "Session expired or not found",
        });
      }

      next();
    },

    (req, res) => {
      upload(req, res, async (error) => {
        if (error) {
          return res.status(400).json({
            success: false,
            message:
              error.code === "LIMIT_FILE_SIZE"
                ? "File exceeds the 50 MB limit"
                : error.message,
          });
        }

        const files = req.files || [];
        const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!uuidRegex.test(req.params.sessionId)) {
    return res.status(400).json({
        error: "Invalid session ID"
    });
}
        const session = getSession(req.params.sessionId);

        if (!session) {
          await Promise.all(
            files.map(file => deleteTemporaryFile(file.path))
          );

          return res.status(410).json({
            success: false,
            message: "Session expired",
          });
        }

        if (files.length === 0) {
          return res.status(400).json({
            success: false,
            message: "No files received",
          });
        }

        // Validate all files
        const validationResults = await Promise.all(
          files.map(file => validateUploadedFile(file))
        );

        const invalidIndex = validationResults.findIndex(
          result => !result.valid
        );

        if (invalidIndex !== -1) {
          await Promise.all(
            files.map(file => deleteTemporaryFile(file.path))
          );

          return res.status(400).json({
            success: false,
            message: validationResults[invalidIndex].message,
          });
        }

        // Check session limits
        const incomingSize = files.reduce(
          (total, file) => total + file.size,
          0
        );

        const maxFiles = Number(
          process.env.MAX_FILES_PER_SESSION || 10
        );

        const maxSessionSize = Number(
          process.env.MAX_SESSION_SIZE_BYTES || 209715200
        );

        if (
          session.files.length + files.length > maxFiles ||
          session.totalSize + incomingSize > maxSessionSize
        ) {
          await Promise.all(
            files.map(file => deleteTemporaryFile(file.path))
          );

          return res.status(400).json({
            success: false,
            message: "Session file or storage limit exceeded",
          });
        }

        // Register uploaded files
        for (let i = 0; i < files.length; i++) {
          const file = files[i];

          const result = addFileToSession(
            session.id,
            {
              filename: file.filename,
              originalname: file.originalname,
              path: file.path,
              size: file.size,
              mimeType: validationResults[i].mimeType,
            }
          );

          if (!result.success) {
            await Promise.all(
              files.map(item => deleteTemporaryFile(item.path))
            );

            return res.status(400).json(result);
          }
        }

        // Notify laptop
        io.to(session.id).emit("files-uploaded", {
          files: files.map((file, index) => ({
            filename: file.filename,
            originalname: file.originalname,
            size: file.size,
            mimeType: validationResults[index].mimeType,
          })),
        });

        return res.status(201).json({
          success: true,
          message: "Files uploaded successfully",
          fileCount: files.length,
        });
      });
    }
  );

  // Check session status
  router.get("/sessions/:sessionId", (req, res) => {
    const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

if (!uuidRegex.test(req.params.sessionId)) {
    return res.status(400).json({
        error: "Invalid session ID"
    });
}
    const session = getSession(req.params.sessionId);

    if (!session) {
      return res.status(410).json({
        success: false,
        message: "Session expired or not found",
      });
    }

    res.json({
      success: true,
      status: session.status,
      fileCount: session.files.length,
      expiresAt: session.expiresAt,
    });
  });

  // List uploaded files
  router.get("/sessions/:sessionId/files", (req, res) => {
    const { sessionId } = req.params;

    const token = req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : null;

    if (!authorizeLaptop(sessionId, token)) {
      return res.status(403).json({
        success: false,
        message: "Laptop authorization failed",
      });
    }

    const session = getSession(sessionId);

    if (!session) {
      return res.status(410).json({
        success: false,
        message: "Session expired",
      });
    }

    res.json({
      success: true,
      files: session.files.map(file => ({
        filename: file.filename,
        originalname: file.originalname,
        size: file.size,
        mimeType: file.mimeType,
      })),
    });
  });

  // Retrieve individual file
  router.get(
    "/sessions/:sessionId/files/:filename",
    (req, res) => {
      const { sessionId, filename } = req.params;

      const token = req.headers.authorization?.startsWith("Bearer ")
        ? req.headers.authorization.slice(7)
        : null;

      if (!authorizeLaptop(sessionId, token)) {
        return res.status(403).json({
          success: false,
          message: "Laptop authorization failed",
        });
      }

      const file = claimFileForRetrieval(sessionId, filename);

      if (!file) {
        return res.status(404).json({
          success: false,
          message: "File unavailable or already being retrieved",
        });
      }

      res.setHeader("Content-Type", file.mimeType);
      res.setHeader("Content-Length", file.size);
      res.setHeader("Cache-Control", "no-store");

        const baseDirectory = path.resolve(tempDirectory);
const safePath = path.resolve(
    baseDirectory,
    path.basename(file.path)
);

const relativePath = path.relative(baseDirectory, safePath);

if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return res.status(403).send("Invalid file path");
}
      res.sendFile(safePath, async (error) => {
        if (error) {
          releaseFileRetrieval(sessionId, filename);

          console.error(
            "File retrieval failed:",
            error.message
          );

          if (!res.headersSent) {
            res.status(500).end();
          }

          return;
        }

        const result = removeRetrievedFile(
          sessionId,
          filename
        );

        if (result) {
          await deleteTemporaryFile(result.file.path);

          console.log(
            "File retrieved and deleted:",
            filename
          );
        }
      });
    }
  );

  return router;
}
