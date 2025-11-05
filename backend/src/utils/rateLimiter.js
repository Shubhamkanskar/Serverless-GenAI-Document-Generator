/**
 * Simple Rate Limiter
 * Prevents hitting API rate limits by queuing requests
 */

class RateLimiter {
  constructor(maxRequests = 10, timeWindow = 60000) {
    this.maxRequests = maxRequests;
    this.timeWindow = timeWindow; // milliseconds
    this.requests = [];
  }

  async waitForSlot() {
    const now = Date.now();
    
    // Remove old requests outside the time window
    this.requests = this.requests.filter(
      time => now - time < this.timeWindow
    );

    // If at limit, wait
    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0];
      const waitTime = this.timeWindow - (now - oldestRequest);
      
      console.log(`Rate limit reached. Waiting ${Math.ceil(waitTime / 1000)}s...`);
      await new Promise(resolve => setTimeout(resolve, waitTime + 100));
      
      return this.waitForSlot(); // Recursive check
    }

    // Add current request
    this.requests.push(now);
  }

  async execute(fn) {
    await this.waitForSlot();
    return await fn();
  }
}

// Gemini free tier: 15 RPM, so we limit to 10 RPM to be safe
export const geminiRateLimiter = new RateLimiter(10, 60000);

export default RateLimiter;

