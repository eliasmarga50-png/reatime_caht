
import http from 'node:http';
import crypto from 'node:crypto';

import { WebSocketServer, WebSocket } from 'ws';

import { env } from './config/env.js';
import { CLIENT_EVENTS, SERVER_EVENTS } from './constants/events.js';
import { createGeminiSession } from './geminiSession.js';
import { logger } from './utils/logger.js';

import {
  validateMessage,
  validateAudio,
  validateVideo,
  validateText,
  validateEmoji,
} from './utils/validation.js';

import { getClientIp } from './security/ipUtils.js';
import { isAllowedOrigin } from './security/originGuard.js';
import {
  canAcceptConnection,
  registerConnection,
  releaseConnection,
  getConnectionStats,
} from './security/connectionLimiter.js';
import { createPayloadGuard } from './security/payloadGuard.js';

/* =========================================
   1. GLOBAL STATE
========================================= */

const clients = new Map();

let shuttingDown = false;

/* =========================================
   2. HTTP SERVER
========================================= */

const httpServer = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    const stats = getConnectionStats();

    const healthy = !shuttingDown;

    res.writeHead(healthy ? 200 : 503, {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    });

    res.end(
      JSON.stringify({
        status: healthy ? 'ok' : 'shutting_down',
        service: 'gemini-live-relay',
        activeConnections: clients.size,
        activeGeminiSessions: countGeminiSessions(),
        connectionStats: stats,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
      })
    );

    return;
  }

  res.writeHead(404, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
  });

  res.end(
    JSON.stringify({
      error: 'Not found',
    })
  );
});

/* =========================================
   3. WEBSOCKET SERVER
========================================= */

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: env.MAX_WS_MESSAGE_BYTES,
  perMessageDeflate: false,
});

/* =========================================
   4. GENERAL HELPERS
========================================= */

function countGeminiSessions() {
  let count = 0;

  for (const client of clients.values()) {
    if (client.gemini && client.ready && !client.stopped) {
      count += 1;
    }
  }

  return count;
}

function send(ws, type, payload = {}) {
  if (ws.readyState !== WebSocket.OPEN) {
    return false;
  }

  // Prevent the server from buffering unlimited data for a slow client.
  if (ws.bufferedAmount > env.MAX_WS_BUFFERED_BYTES) {
    logger.warn('WebSocket backpressure limit exceeded');

    try {
      ws.close(1013, 'Client too slow');
    } catch {
      ws.terminate();
    }

    return false;
  }

  try {
    ws.send(
      JSON.stringify({
        type,
        ...payload,
        timestamp: Date.now(),
      }),
      (error) => {
        if (error) {
          logger.warn('WebSocket send callback error:', error.message);
        }
      }
    );

    return true;
  } catch (error) {
    logger.warn('WebSocket send failed:', error.message);
    return false;
  }
}

function sendError(ws, code, message) {
  send(ws, SERVER_EVENTS.ERROR, {
    code,
    message,
  });
}

function createClientId() {
  return crypto.randomUUID();
}

function resetIdleTimer(client) {
  if (client.idleTimer) {
    clearTimeout(client.idleTimer);
  }

  client.idleTimer = setTimeout(() => {
    logger.info(`Idle timeout reached for ${client.id}`);

    if (client.ws.readyState === WebSocket.OPEN) {
      sendError(
        client.ws,
        'IDLE_TIMEOUT',
        'Connection closed due to inactivity.'
      );

      client.ws.close(1000, 'Idle timeout');
    } else {
      cleanup(client, 'idle_timeout');
    }
  }, env.SESSION_IDLE_TIMEOUT_MS);

  client.idleTimer.unref?.();
}

/* =========================================
   5. CLIENT CLEANUP
========================================= */

function cleanup(client, reason) {
  if (client.stopped) {
    return;
  }

  client.stopped = true;
  client.ready = false;

  if (client.idleTimer) {
    clearTimeout(client.idleTimer);
    client.idleTimer = null;
  }

  if (client.sessionTimer) {
    clearTimeout(client.sessionTimer);
    client.sessionTimer = null;
  }

  try {
    client.gemini?.close();
  } catch (error) {
    logger.warn(`Gemini cleanup failed for ${client.id}:`, error.message);
  }

  client.gemini = null;

  clients.delete(client.id);

  if (!client.connectionReleased) {
    client.connectionReleased = true;
    releaseConnection(client.ip);
  }

  logger.info(
    `Client cleaned up: ${client.id} | reason=${reason} | active=${clients.size}`
  );
}

/* =========================================
   6. GEMINI SESSION CREATION WITH TIMEOUT
========================================= */

async function createSessionWithTimeout(client) {
  const creationPromise = createGeminiSession(client.ws);

  let timeoutId;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error('Gemini session creation timed out'));
    }, env.SESSION_CREATION_TIMEOUT_MS);

    timeoutId.unref?.();
  });

  try {
    const gemini = await Promise.race([
      creationPromise,
      timeoutPromise,
    ]);

    if (client.stopped || client.ws.readyState !== WebSocket.OPEN) {
      gemini.close();
      return null;
    }

    return gemini;
  } catch (error) {
    // If creation resolves after the timeout, immediately close it.
    creationPromise
      .then((lateSession) => {
        lateSession?.close();
      })
      .catch(() => {});

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

/* =========================================
   7. CONNECTION HANDLER
========================================= */

wss.on('connection', async (ws, request) => {
  const origin = request.headers.origin;

  if (!isAllowedOrigin(origin)) {
    logger.warn('Rejected origin:', origin ?? 'missing');

    ws.close(1008, 'Origin not allowed');
    return;
  }

  if (shuttingDown) {
    ws.close(1012, 'Server shutting down');
    return;
  }

  const ip = getClientIp(request);

  const capacity = canAcceptConnection(ip);

  if (!capacity.allowed) {
    logger.warn(`Connection rejected from ${ip}: ${capacity.reason}`);

    ws.close(1013, 'Connection capacity reached');
    return;
  }

  // Reserve a connection slot before attempting Gemini.
  if (!registerConnection(ip)) {
    ws.close(1013, 'Connection capacity reached');
    return;
  }

  // Map size includes clients currently waiting for Gemini,
  // preventing concurrent session-creation oversubscription.
  if (clients.size >= env.MAX_GEMINI_SESSIONS) {
    releaseConnection(ip);

    ws.close(1013, 'AI session capacity reached');
    return;
  }

  const clientId = createClientId();

  const client = {
    id: clientId,
    ip,
    ws,

    gemini: null,
    ready: false,
    stopped: false,

    connectionReleased: false,

    payloadGuard: createPayloadGuard(),

    violations: 0,
    messageCount: 0,

    idleTimer: null,
    sessionTimer: null,

    connectedAt: Date.now(),
  };

  clients.set(clientId, client);

  resetIdleTimer(client);

  logger.info(
    `Client connected: ${clientId} | IP=${ip} | Active=${clients.size}`
  );

  send(ws, SERVER_EVENTS.CONNECTED, {
    clientId,
  });

  /* -----------------------------------------
     7.1 SESSION CREATION
  ----------------------------------------- */

  try {
    client.gemini = await createSessionWithTimeout(client);

    if (!client.gemini || client.stopped) {
      cleanup(client, 'session_cancelled');
      return;
    }

    client.ready = true;

    send(ws, SERVER_EVENTS.SESSION_STARTED, {
      clientId,
    });

    logger.info(`Gemini session ready: ${clientId}`);
  } catch (error) {
    logger.error(`Gemini initialization failed for ${clientId}:`, error.message);

    sendError(
      ws,
      'SESSION_CREATE_FAILED',
      'Unable to start AI session.'
    );

    cleanup(client, 'gemini_session_creation_failed');

    if (ws.readyState === WebSocket.OPEN) {
      ws.close(1011, 'AI session failed');
    }

    return;
  }

  /* -----------------------------------------
     7.2 MESSAGE HANDLER
  ----------------------------------------- */

  ws.on('message', async (rawData, isBinary) => {
    if (client.stopped || shuttingDown) {
      return;
    }

    resetIdleTimer(client);

    if (isBinary) {
      handleViolation(
        client,
        'INVALID_MESSAGE_FORMAT',
        'Only JSON text messages are accepted.'
      );
      return;
    }

    if (!client.payloadGuard.allowMessage()) {
      handleViolation(
        client,
        'RATE_LIMITED',
        'Message rate limit exceeded.'
      );
      return;
    }

    client.messageCount += 1;

    let message;

    try {
      message = JSON.parse(rawData.toString());
    } catch {
      handleViolation(
        client,
        'INVALID_JSON',
        'Message must contain valid JSON.'
      );
      return;
    }

    const messageValidation = validateMessage(message);

    if (!messageValidation.valid) {
      handleViolation(
        client,
        'INVALID_MESSAGE',
        messageValidation.error
      );
      return;
    }

    if (!client.ready || !client.gemini) {
      sendError(
        ws,
        'SESSION_NOT_READY',
        'AI session is not ready.'
      );
      return;
    }

    try {
      await handleClientMessage(client, message);
    } catch (error) {
      logger.error(`Message processing failed for ${clientId}:`, error);

      sendError(
        ws,
        'MESSAGE_PROCESSING_FAILED',
        'Unable to process message.'
      );
    }
  });

  /* -----------------------------------------
     7.3 DISCONNECT
  ----------------------------------------- */

  ws.on('close', (code, reason) => {
    logger.info(
      `Client disconnected: ${clientId} | code=${code} | reason=${reason.toString()}`
    );

    cleanup(client, 'frontend_disconnected');
  });

  ws.on('error', (error) => {
    logger.warn(`WebSocket error ${clientId}:`, error.message);

    cleanup(client, 'websocket_error');
  });
});

/* =========================================
   8. VIOLATION HANDLER
========================================= */

function handleViolation(client, code, message) {
  client.violations += 1;

  sendError(client.ws, code, message);

  // Disconnect clients repeatedly violating the protocol.
  if (client.violations >= 10) {
    logger.warn(`Closing abusive connection: ${client.id}`);

    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.close(1008, 'Too many protocol violations');
    }
  }
}

/* =========================================
   9. MESSAGE ROUTER
========================================= */

async function handleClientMessage(client, message) {
  const { ws, gemini, payloadGuard } = client;

  switch (message.type) {
    /* -------------------------------------
       AUDIO
    ------------------------------------- */

    case CLIENT_EVENTS.AUDIO: {
      const validation = validateAudio(message);

      if (!validation.valid) {
        handleViolation(client, 'INVALID_AUDIO', validation.error);
        return;
      }

      if (!payloadGuard.allowAudio(validation.byteLength)) {
        handleViolation(
          client,
          'AUDIO_RATE_LIMITED',
          'Audio throughput limit exceeded.'
        );
        return;
      }

      gemini.sendAudio(message.data);
      return;
    }

    /* -------------------------------------
       VIDEO
    ------------------------------------- */

    case CLIENT_EVENTS.VIDEO: {
      const validation = validateVideo(message);

      if (!validation.valid) {
        handleViolation(client, 'INVALID_VIDEO', validation.error);
        return;
      }

      if (!payloadGuard.allowVideo(validation.byteLength)) {
        // Drop excessive video frames silently.
        return;
      }

      gemini.sendVideo(message.data);
      return;
    }

    /* -------------------------------------
       TEXT
    ------------------------------------- */

    case CLIENT_EVENTS.USER_TEXT: {
      const validation = validateText(message);

      if (!validation.valid) {
        handleViolation(client, 'INVALID_TEXT', validation.error);
        return;
      }

      if (!payloadGuard.allowText()) {
        handleViolation(
          client,
          'TEXT_RATE_LIMITED',
          'Text rate limit exceeded.'
        );
        return;
      }

      gemini.sendText(message.text.trim());
      return;
    }

    /* -------------------------------------
       EMOJI
    ------------------------------------- */

    case CLIENT_EVENTS.USER_EMOJI: {
      const validation = validateEmoji(message);

      if (!validation.valid) {
        handleViolation(client, 'INVALID_EMOJI', validation.error);
        return;
      }

      if (!payloadGuard.allowEmoji()) {
        handleViolation(
          client,
          'EMOJI_RATE_LIMITED',
          'Emoji rate limit exceeded.'
        );
        return;
      }

      gemini.sendEmoji(message.emoji.trim());
      return;
    }

    /* -------------------------------------
       SESSION START
    ------------------------------------- */

    case CLIENT_EVENTS.SESSION_START: {
      // Session is created during WebSocket connection.
      send(ws, SERVER_EVENTS.SESSION_READY, {
        clientId: client.id,
      });
      return;
    }

    /* -------------------------------------
       SESSION STOP
    ------------------------------------- */

    case CLIENT_EVENTS.SESSION_STOP: {
      stopClientSession(client, 'client_requested_stop');
      return;
    }

    /* -------------------------------------
       PING
    ------------------------------------- */

    case CLIENT_EVENTS.PING: {
      send(ws, SERVER_EVENTS.PONG, {
        clientTimestamp: message.timestamp ?? null,
      });
      return;
    }

    /* -------------------------------------
       UNKNOWN EVENT
    ------------------------------------- */

    default: {
      handleViolation(
        client,
        'UNKNOWN_EVENT',
        `Unsupported event type: ${message.type}`
      );
    }
  }
}

/* =========================================
   10. STOP SESSION
========================================= */

function stopClientSession(client, reason) {
  if (client.stopped) {
    return;
  }

  send(client.ws, SERVER_EVENTS.SESSION_ENDED, {
    clientId: client.id,
    reason,
  });

  cleanup(client, reason);

  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.close(1000, 'Session stopped');
  }
}

/* =========================================
   11. SERVER START
========================================= */

httpServer.listen(env.PORT, env.HOST, () => {
  logger.info(`HTTP server listening on http://${env.HOST}:${env.PORT}`);
  logger.info(`WebSocket server listening on ws://${env.HOST}:${env.PORT}`);
  logger.info(`Health endpoint: http://${env.HOST}:${env.PORT}/health`);
  logger.info(`Gemini model: ${env.GEMINI_LIVE_MODEL}`);
});

/* =========================================
   12. SERVER ERROR HANDLING
========================================= */

httpServer.on('error', (error) => {
  logger.error('HTTP server error:', error);

  if (error.code === 'EADDRINUSE') {
    logger.error(`Port ${env.PORT} is already in use`);
  }
});

wss.on('error', (error) => {
  logger.error('WebSocket server error:', error);
});

/* =========================================
   13. GRACEFUL SHUTDOWN
========================================= */

function shutdown(signal) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  logger.warn(`${signal} received. Closing server...`);

  for (const client of clients.values()) {
    send(client.ws, SERVER_EVENTS.SESSION_ENDED, {
      clientId: client.id,
      reason: 'server_shutdown',
    });

    cleanup(client, 'server_shutdown');

    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.close(1001, 'Server shutting down');
    }
  }

  // Terminate remaining WebSocket connections after the graceful attempt.
  wss.close(() => {
    httpServer.close(() => {
      logger.info('Shutdown completed');
      process.exit(0);
    });
  });

  const forceShutdown = setTimeout(() => {
    logger.error('Forced shutdown after timeout');

    for (const ws of wss.clients) {
      ws.terminate();
    }

    process.exit(1);
  }, 10000);

  forceShutdown.unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
