
export class TokenBucket {
  constructor({
    capacity,
    refillRate,
  }) {
    this.capacity = capacity;
    this.refillRate = refillRate;

    this.tokens = capacity;
    this.lastRefill = Date.now();
  }

  refill() {
    const now = Date.now();
    const elapsedSeconds =
      (now - this.lastRefill) / 1000;

    const replenished = elapsedSeconds * this.refillRate;

    this.tokens = Math.min(
      this.capacity,
      this.tokens + replenished
    );

    this.lastRefill = now;
  }

  consume(amount = 1) {
    this.refill();

    if (this.tokens < amount) {
      return false;
    }

    this.tokens -= amount;
    return true;
  }
}

export function createRateLimiter({
  limit,
  windowMs,
}) {
  const refillRate = limit / (windowMs / 1000);

  return new TokenBucket({
    capacity: limit,
    refillRate,
  });
}
