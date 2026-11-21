import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';

import { env } from '../config/env.js';
import { RefreshSession } from '../models/RefreshSession.js';

const REFRESH_TOKEN_BYTES = 64;

export function hashToken(token) {
  return crypto
    .createHash('sha256')
    .update(token)
    .digest('hex');
}

export function createRefreshToken() {
  return crypto
    .randomBytes(REFRESH_TOKEN_BYTES)
    .toString('hex');
}

export function createAccessToken(user, sessionId) {
  return jwt.sign(
    {
      username: user.username,
      sid: sessionId,
    },
    env.JWT_SECRET,
    {
      subject: user._id.toString(),
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn: env.ACCESS_TOKEN_TTL,
      algorithm: 'HS256',
    }
  );
}

export function verifyAccessToken(token) {
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    algorithms: ['HS256'],
  });
}

export async function createRefreshSession(userId) {
  const familyId = crypto.randomUUID();
  const refreshToken = createRefreshToken();

  const expiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000
  );

  await RefreshSession.create({
    userId,
    familyId,
    tokenHash: hashToken(refreshToken),
    expiresAt,
  });

  return {
    refreshToken,
    familyId,
    expiresAt,
  };
}

export async function rotateRefreshToken(rawToken) {
  if (
    typeof rawToken !== 'string' ||
    rawToken.length !== REFRESH_TOKEN_BYTES * 2
  ) {
    return { status: 'invalid' };
  }

  const tokenHash = hashToken(rawToken);

  const existing = await RefreshSession.findOne({
    tokenHash,
  });

  if (!existing) {
    return { status: 'invalid' };
  }

  if (existing.revokedAt) {
    return { status: 'revoked' };
  }

  if (existing.expiresAt <= new Date()) {
    return { status: 'expired' };
  }

  // Reuse detection.
  if (existing.usedAt) {
    await RefreshSession.updateMany(
      {
        familyId: existing.familyId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: new Date(),
        },
      }
    );

    return {
      status: 'reuse',
      familyId: existing.familyId,
      userId: existing.userId,
    };
  }

  // Atomically consume this refresh token.
  const consumed = await RefreshSession.findOneAndUpdate(
    {
      _id: existing._id,
      usedAt: null,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    },
    {
      $set: {
        usedAt: new Date(),
      },
    },
    {
      new: true,
    }
  );

  if (!consumed) {
    // Another request may have consumed the token concurrently.
    await RefreshSession.updateMany(
      {
        familyId: existing.familyId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: new Date(),
        },
      }
    );

    return {
      status: 'reuse',
      familyId: existing.familyId,
      userId: existing.userId,
    };
  }

  const nextRefreshToken = createRefreshToken();

  const nextExpiresAt = new Date(
    Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86400000
  );

  await RefreshSession.create({
    userId: consumed.userId,
    familyId: consumed.familyId,
    tokenHash: hashToken(nextRefreshToken),
    expiresAt: nextExpiresAt,
  });

  return {
    status: 'success',
    userId: consumed.userId,
    familyId: consumed.familyId,
    refreshToken: nextRefreshToken,
    expiresAt: nextExpiresAt,
  };
}

export async function revokeRefreshFamily(familyId) {
  if (!familyId) return;

  await RefreshSession.updateMany(
    {
      familyId,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
      },
    }
  );
}

export async function revokeAllUserRefreshSessions(userId) {
  await RefreshSession.updateMany(
    {
      userId,
      revokedAt: null,
    },
    {
      $set: {
        revokedAt: new Date(),
      },
    }
  );
}