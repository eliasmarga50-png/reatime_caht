
import { env } from '../config/env.js';

const BASE64_PATTERN =
  /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

const MAX_TEXT_LENGTH = 8000;
const MAX_EMOJI_LENGTH = 32;

export function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value)
  );
}

export function validateMessage(message) {
  if (!isPlainObject(message)) {
    return {
      valid: false,
      error: 'Message must be a JSON object.',
    };
  }

  if (typeof message.type !== 'string') {
    return {
      valid: false,
      error: 'Message type must be a string.',
    };
  }

  return { valid: true };
}

export function validateBase64Payload(data, maxBytes) {
  if (typeof data !== 'string' || data.length === 0) {
    return {
      valid: false,
      error: 'Payload must be a non-empty base64 string.',
    };
  }

  if (
    data.length % 4 !== 0 ||
    !BASE64_PATTERN.test(data)
  ) {
    return {
      valid: false,
      error: 'Payload is not valid base64.',
    };
  }

  const estimatedBytes = Math.floor((data.length * 3) / 4);

  const padding = data.endsWith('==')
    ? 2
    : data.endsWith('=')
      ? 1
      : 0;

  const actualBytes = estimatedBytes - padding;

  if (actualBytes <= 0 || actualBytes > maxBytes) {
    return {
      valid: false,
      error: 'Payload exceeds allowed size.',
    };
  }

  return {
    valid: true,
    byteLength: actualBytes,
  };
}

export function validateAudio(message) {
  return validateBase64Payload(
    message.data,
    env.MAX_AUDIO_CHUNK_BYTES
  );
}

export function validateVideo(message) {
  return validateBase64Payload(
    message.data,
    env.MAX_VIDEO_FRAME_BYTES
  );
}

export function validateText(message) {
  if (
    typeof message.text !== 'string' ||
    message.text.trim().length === 0
  ) {
    return {
      valid: false,
      error: 'Text must be a non-empty string.',
    };
  }

  if (message.text.length > MAX_TEXT_LENGTH) {
    return {
      valid: false,
      error: `Text exceeds ${MAX_TEXT_LENGTH} characters.`,
    };
  }

  return { valid: true };
}

export function validateEmoji(message) {
  if (
    typeof message.emoji !== 'string' ||
    message.emoji.trim().length === 0
  ) {
    return {
      valid: false,
      error: 'Emoji must be a non-empty string.',
    };
  }

  if (message.emoji.length > MAX_EMOJI_LENGTH) {
    return {
      valid: false,
      error: 'Emoji payload is too long.',
    };
  }

  return { valid: true };
}
