
import { env } from '../config/env.js';
import { createRateLimiter } from './rateLimiter.js';

export function createPayloadGuard() {
  const messageLimiter = createRateLimiter({
    limit: env.MESSAGE_RATE_LIMIT,
    windowMs: env.MESSAGE_RATE_WINDOW_MS,
  });

  const audioLimiter = createRateLimiter({
    limit: env.AUDIO_RATE_LIMIT,
    windowMs: env.AUDIO_RATE_WINDOW_MS,
  });

  const textLimiter = createRateLimiter({
    limit: env.TEXT_RATE_LIMIT,
    windowMs: env.TEXT_RATE_WINDOW_MS,
  });

  const emojiLimiter = createRateLimiter({
    limit: env.EMOJI_RATE_LIMIT,
    windowMs: env.EMOJI_RATE_WINDOW_MS,
  });

  // Byte-based buckets use burst capacity while limiting
  // sustained throughput.
  const audioByteLimiter = createRateLimiter({
    limit: env.AUDIO_MAX_BYTES_PER_SECOND,
    windowMs: 1000,
  });

  const videoByteLimiter = createRateLimiter({
    limit: env.VIDEO_MAX_BYTES_PER_SECOND,
    windowMs: 1000,
  });

  let lastVideoAt = 0;

  return {
    allowMessage() {
      return messageLimiter.consume();
    },

    allowAudio(byteLength) {
      return (
        audioLimiter.consume() &&
        audioByteLimiter.consume(byteLength)
      );
    },

    allowText() {
      return textLimiter.consume();
    },

    allowEmoji() {
      return emojiLimiter.consume();
    },

    allowVideo(byteLength) {
      const now = Date.now();
      const minimumInterval = 1000 / env.VIDEO_MAX_FPS;

      if (now - lastVideoAt < minimumInterval) {
        return false;
      }

      if (!videoByteLimiter.consume(byteLength)) {
        return false;
      }

      lastVideoAt = now;
      return true;
    },
  };
}
