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

// Gemini API rate limits:
// - Free tier: 15 RPM (requests per minute)
// - Paid tiers: 60 RPM, 300 RPM, or higher depending on tier
// Default to 50 RPM to be safe for most paid tiers, but allow override via env var
// Set GEMINI_RATE_LIMIT_RPM to customize (e.g., 10 for free tier, 50 for paid tier)
const rateLimitRPM = parseInt(process.env.GEMINI_RATE_LIMIT_RPM) || 50;
export const geminiRateLimiter = new RateLimiter(rateLimitRPM, 60000);

export default RateLimiter;

