
import { randomUUID, randomBytes, createHash } from "node:crypto";

const sessions = new Map();

const SESSION_TTL = Number(process.env.SESSION_TTL_SECONDS || 300);
const MAX_FILES = Number(process.env.MAX_FILES_PER_SESSION || 10);
const MAX_SESSION_SIZE = Number(
  process.env.MAX_SESSION_SIZE_BYTES || 209715200
);

function hashToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

export function createSession() {
  const sessionId = randomUUID();
  const laptopToken = randomBytes(32).toString("hex");

  const session = {
    id: sessionId,
    laptopTokenHash: hashToken(laptopToken),
    createdAt: Date.now(),
    expiresAt: Date.now() + SESSION_TTL * 1000,
    files: [],
    totalSize: 0,
    status: "waiting",
    retrieved: false,
  };

  sessions.set(sessionId, session);

  return {
    session,
    laptopToken,
  };
}

export function getSession(sessionId) {
  const session = sessions.get(sessionId);

  if (!session) return null;

  if (Date.now() >= session.expiresAt) {
    return null;
  }

  return session;
}

export function authorizeLaptop(sessionId, token) {
  const session = getSession(sessionId);

  if (!session || !token) {
    return false;
  }

  const suppliedHash = hashToken(token);

  return suppliedHash === session.laptopTokenHash;
}

export function addFileToSession(sessionId, file) {
  const session = getSession(sessionId);

  if (!session) {
    return {
      success: false,
      message: "Session expired or not found",
    };
  }

  if (session.files.length >= MAX_FILES) {
    return {
      success: false,
      message: "Maximum file limit reached",
    };
  }

  if (session.totalSize + file.size > MAX_SESSION_SIZE) {
    return {
      success: false,
      message: "Session storage limit exceeded",
    };
  }

  session.files.push({
    ...file,
    retrievalStatus: "available",
  });

  session.totalSize += file.size;
  session.status = "uploaded";

  return {
    success: true,
    session,
  };
}

export function claimFileForRetrieval(sessionId, filename) {
  const session = getSession(sessionId);

  if (!session) return null;

  const file = session.files.find(
    item => item.filename === filename
  );

  if (!file || file.retrievalStatus === "sending") {
    return null;
  }

  file.retrievalStatus = "sending";

  return file;
}

export function releaseFileRetrieval(sessionId, filename) {
  const session = getSession(sessionId);

  if (!session) return;

  const file = session.files.find(
    item => item.filename === filename
  );

  if (file && file.retrievalStatus === "sending") {
    file.retrievalStatus = "available";
  }
}

export function removeRetrievedFile(sessionId, filename) {
  const session = getSession(sessionId);

  if (!session) return null;

  const fileIndex = session.files.findIndex(
    file =>
      file.filename === filename &&
      file.retrievalStatus === "sending"
  );

  if (fileIndex === -1) return null;

  const [removedFile] = session.files.splice(fileIndex, 1);

  session.totalSize -= removedFile.size;

  // Keep the session active after retrieving a batch.
  if (session.files.length === 0) {
    session.status = "waiting";
    session.retrieved = false;
  } else {
    session.status = "uploaded";
  }

  return {
    file: removedFile,
    batchDrained: session.files.length === 0,
  };
}

export function deleteSession(sessionId) {
  return sessions.delete(sessionId);
}

export function cleanupExpiredSessions() {
  const now = Date.now();
  const expiredSessions = [];

  for (const [sessionId, session] of sessions.entries()) {
    if (now >= session.expiresAt) {
      expiredSessions.push(session);
      sessions.delete(sessionId);
    }
  }

  return expiredSessions;
}
