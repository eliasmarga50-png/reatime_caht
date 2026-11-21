import 'dotenv/config';

function numberFromEnv(name, fallback, { min = 0 } = {}) {
  const raw = process.env[name];

  if (raw === undefined || raw === '') {
    return fallback;
  }

  const value = Number(raw);

  if (!Number.isFinite(value) || value < min) {
    throw new Error(`Invalid environment variable: ${name}`);
  }

  return value;
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function listFromEnv(name, fallback = []) {
  const raw = process.env[name];

  if (!raw) return fallback;

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export const env = Object.freeze({
  GEMINI_API_KEY: requiredEnv('GEMINI_API_KEY'),

  GEMINI_LIVE_MODEL:
    process.env.GEMINI_LIVE_MODEL || 'gemini-3.8-live',

  PORT: numberFromEnv('PORT', 4000, { min: 1 }),

  HOST: process.env.HOST || '0.0.0.0',

  MONGODB_URI: requiredEnv('MONGODB_URI'),

  JWT_SECRET: requiredEnv('JWT_SECRET'),

  JWT_ISSUER:
    process.env.JWT_ISSUER || 'gemini-live-relay',

  JWT_AUDIENCE:
    process.env.JWT_AUDIENCE || 'gemini-live-mobile',

  ACCESS_TOKEN_TTL:
    process.env.ACCESS_TOKEN_TTL || '15m',

  REFRESH_TOKEN_TTL_DAYS:
    numberFromEnv('REFRESH_TOKEN_TTL_DAYS', 30, {
      min: 1,
    }),

  WS_TICKET_TTL_SECONDS:
    numberFromEnv('WS_TICKET_TTL_SECONDS', 30, {
      min: 1,
    }),

  ALLOWED_ORIGINS: listFromEnv('ALLOWED_ORIGINS'),

  TRUST_PROXY: process.env.TRUST_PROXY === 'true',

  VIDEO_MAX_FPS:
    numberFromEnv('VIDEO_MAX_FPS', 1, { min: 1 }),

  MAX_AUDIO_CHUNK_BYTES:
    numberFromEnv('MAX_AUDIO_CHUNK_BYTES', 262144, { min: 1 }),

  MAX_VIDEO_FRAME_BYTES:
    numberFromEnv('MAX_VIDEO_FRAME_BYTES', 1048576, { min: 1 }),

  MAX_WS_MESSAGE_BYTES:
    numberFromEnv('MAX_WS_MESSAGE_BYTES', 2097152, { min: 1 }),

  MAX_CONNECTIONS:
    numberFromEnv('MAX_CONNECTIONS', 100, { min: 1 }),

  MAX_CONNECTIONS_PER_IP:
    numberFromEnv('MAX_CONNECTIONS_PER_IP', 3, { min: 1 }),

  MAX_GEMINI_SESSIONS:
    numberFromEnv('MAX_GEMINI_SESSIONS', 25, { min: 1 }),

  SESSION_IDLE_TIMEOUT_MS:
    numberFromEnv('SESSION_IDLE_TIMEOUT_MS', 120000, { min: 1000 }),

  SESSION_CREATION_TIMEOUT_MS:
    numberFromEnv('SESSION_CREATION_TIMEOUT_MS', 20000, { min: 1000 }),

  MESSAGE_RATE_LIMIT:
    numberFromEnv('MESSAGE_RATE_LIMIT', 60, { min: 1 }),

  MESSAGE_RATE_WINDOW_MS:
    numberFromEnv('MESSAGE_RATE_WINDOW_MS', 10000, { min: 1 }),

  TEXT_RATE_LIMIT:
    numberFromEnv('TEXT_RATE_LIMIT', 10, { min: 1 }),

  TEXT_RATE_WINDOW_MS:
    numberFromEnv('TEXT_RATE_WINDOW_MS', 60000, { min: 1 }),

  EMOJI_RATE_LIMIT:
    numberFromEnv('EMOJI_RATE_LIMIT', 20, { min: 1 }),

  EMOJI_RATE_WINDOW_MS:
    numberFromEnv('EMOJI_RATE_WINDOW_MS', 60000, { min: 1 }),

  AUDIO_RATE_LIMIT:
    numberFromEnv('AUDIO_RATE_LIMIT', 30, { min: 1 }),

  AUDIO_RATE_WINDOW_MS:
    numberFromEnv('AUDIO_RATE_WINDOW_MS', 1000, { min: 1 }),

  VIDEO_MAX_BYTES_PER_SECOND:
    numberFromEnv('VIDEO_MAX_BYTES_PER_SECOND', 2097152, { min: 1 }),

  AUDIO_MAX_BYTES_PER_SECOND:
    numberFromEnv('AUDIO_MAX_BYTES_PER_SECOND', 524288, { min: 1 }),

  MAX_WS_BUFFERED_BYTES:
    numberFromEnv('MAX_WS_BUFFERED_BYTES', 1048576, { min: 1 }),
});