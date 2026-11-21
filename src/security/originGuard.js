
import { env } from '../config/env.js';

export function isAllowedOrigin(origin) {
  // Non-browser clients may not send Origin.
  // Connection limits still apply.
  if (!origin) {
    return true;
  }

  // Fail closed for browser origins when no allowlist exists.
  if (env.ALLOWED_ORIGINS.length === 0) {
    return false;
  }

  return env.ALLOWED_ORIGINS.includes(origin);
}
