import { verifyAccessToken } from './tokenService.js';
import { User } from '../models/User.js';

export async function requireAuth(req, res, next) {
  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Authentication required.',
      });
    }

    const token = authorization.slice(7).trim();

    const payload = verifyAccessToken(token);

    const user = await User.findById(payload.sub);

    if (!user || !user.isActive) {
      return res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Invalid or inactive account.',
      });
    }

    req.auth = {
      userId: user._id.toString(),
      sessionId: payload.sid,
      username: user.username,
    };

    req.user = user;

    next();
  } catch {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Invalid or expired access token.',
    });
  }
}