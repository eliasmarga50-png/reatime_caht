
import { env } from '../config/env.js';

export function normalizeIp(ip) {
  if (!ip) {
    return 'unknown';
  }

  // Normalize IPv4-mapped IPv6 addresses.
  if (ip.startsWith('::ffff:')) {
    return ip.slice(7);
  }

  if (ip === '::1') {
    return '127.0.0.1';
  }

  return ip;
}

export function getClientIp(request) {
  // Do not trust forwarded headers by default.
  if (env.TRUST_PROXY) {
    const forwarded = request.headers['x-forwarded-for'];

    if (typeof forwarded === 'string' && forwarded.length > 0) {
      const firstIp = forwarded.split(',')[0].trim();

      if (firstIp) {
        return normalizeIp(firstIp);
      }
    }
  }

  return normalizeIp(request.socket.remoteAddress);
}
