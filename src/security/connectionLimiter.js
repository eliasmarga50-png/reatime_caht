
import { env } from '../config/env.js';

const connectionsByIp = new Map();

let totalConnections = 0;

export function canAcceptConnection(ip) {
  const currentForIp = connectionsByIp.get(ip) ?? 0;

  if (totalConnections >= env.MAX_CONNECTIONS) {
    return {
      allowed: false,
      reason: 'Server connection capacity reached.',
    };
  }

  if (currentForIp >= env.MAX_CONNECTIONS_PER_IP) {
    return {
      allowed: false,
      reason: 'Connection limit reached for this IP.',
    };
  }

  return {
    allowed: true,
  };
}

export function registerConnection(ip) {
  const check = canAcceptConnection(ip);

  if (!check.allowed) {
    return false;
  }

  totalConnections += 1;

  connectionsByIp.set(
    ip,
    (connectionsByIp.get(ip) ?? 0) + 1
  );

  return true;
}

export function releaseConnection(ip) {
  const currentForIp = connectionsByIp.get(ip);

  if (!currentForIp || currentForIp <= 0) {
    return;
  }

  totalConnections = Math.max(0, totalConnections - 1);

  if (currentForIp === 1) {
    connectionsByIp.delete(ip);
  } else {
    connectionsByIp.set(ip, currentForIp - 1);
  }
}

export function getConnectionStats() {
  return {
    totalConnections,
    uniqueIps: connectionsByIp.size,
  };
}
