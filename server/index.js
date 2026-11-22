import os from "node:os";
import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { execFile } from "node:child_process";

import { initializeStorage } from "./storage.js";
import { createUploadRouter } from "./uploadRoutes.js";
import {
  cleanupExpiredSessions,
  authorizeLaptop,
} from "./sessionManager.js";
import { deleteSessionFiles } from "./fileCleanup.js";

dotenv.config();

const app = express();
const httpServer = createServer(app);

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "0.0.0.0";

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:3000";

// Allow localhost and private LAN IP addresses.
// This supports different Wi-Fi networks without hardcoding an IP.
function isAllowedOrigin(origin, callback) {
  // Requests without an Origin header are allowed.
  if (!origin) {
    return callback(null, true);
  }

  try {
    const hostname = new URL(origin).hostname;

    const isLocalhost =
      hostname === "localhost" ||
      hostname === "127.0.0.1";

    const isPrivateIPv4 =
      /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(hostname);

    const isAllowed =
      origin === FRONTEND_ORIGIN ||
      isLocalhost ||
      isPrivateIPv4;

    if (isAllowed) {
      return callback(null, true);
    }

    console.warn("CORS blocked origin:", origin);

    return callback(new Error("Origin not allowed by CORS"));

  } catch (error) {
    return callback(new Error("Invalid origin"));
  }
}

// Express CORS configuration
app.use(
  cors({
    origin: isAllowedOrigin,
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
  })
);

app.use(express.json());

// Socket.IO configuration
const io = new Server(httpServer, {
  cors: {
    origin: isAllowedOrigin,
    methods: ["GET", "POST"],
  },
});

io.on("connection", (socket) => {
  console.log("Client connected:", socket.id);

  socket.on("join-session", ({ sessionId, laptopToken } = {}) => {
    const authorized = authorizeLaptop(sessionId, laptopToken);

    if (!authorized) {
      socket.emit("session-error", {
        message: "Invalid laptop authorization or expired session",
      });
      return;
    }

    socket.join(sessionId);

    socket.emit("session-joined", {
      success: true,
      sessionId,
    });

    console.log("Laptop joined upload session:", sessionId);
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// Initialize temporary file storage
const tempDirectory = await initializeStorage();

let isCleaning = false;

// Automatically clean expired sessions and their files every 10 seconds.
setInterval(async () => {
    if (isCleaning) return;

    isCleaning = true;

    try {
        const expiredSessions = cleanupExpiredSessions();

        for (const session of expiredSessions) {
            await deleteSessionFiles(session);
        }
    } catch (error) {
        console.error("Session cleanup failed:", error);
    } finally {
        isCleaning = false;
    }
}, 10000);

// Health check
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "RESAP backend is running",
  });
});
// Detect the laptop's current LAN IPv4 addresses
app.get("/api/network-info", (req, res) => {
  const interfaces = os.networkInterfaces();
  let address = null;

  for (const interfaceName in interfaces) {
    const ifaces = interfaces[interfaceName];
    for (const iface of ifaces) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === "IPv4" && !iface.internal) {
        address = iface.address;
        break;
      }
    }
    if (address) break;
  }

  if (!address) {
    return res.status(404).json({
      success: false,
      message: "No active network IP found",
    });
  }

  res.json({
    success: true,
    address: address,
  });
});
// Upload routes
app.use(
  "/api/upload",
  createUploadRouter({
    tempDirectory,
    io,
  })
);

// Start backend server
httpServer.listen(PORT, HOST, () => {
  console.log(`RESAP backend running on port ${PORT}`);
  console.log(`Local backend: http://localhost:${PORT}`);
  console.log(`Temporary storage ready: ${tempDirectory}`);
});
