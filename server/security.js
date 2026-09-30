import { createHash, randomBytes, randomInt } from "node:crypto";

const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const makeRoomCode = () => Array.from({ length: 5 }, () => alphabet[randomInt(alphabet.length)]).join("");
export const makeSessionToken = () => randomBytes(32).toString("hex");
export const tokenHash = value => typeof value === "string" && /^[a-f0-9]{64}$/.test(value)
  ? createHash("sha256").update(value).digest("hex") : null;
export function readLimit(value, fallback) {
  if (value === undefined) return fallback;
  const result = Number(value);
  if (!Number.isSafeInteger(result) || result < 1 || result > 10000) throw new TypeError("Invalid security limit");
  return result;
}
export class RateLimiter {
  constructor(now = Date.now) { this.now = now; this.buckets = new Map(); }
  consume(key, limit, windowMs = 60000) {
    const time = this.now();
    let bucket = this.buckets.get(key);
    if (!bucket || time >= bucket.until) {
      this.sweep();
      if (!bucket && this.buckets.size >= 10000) return false;
      bucket = { count: 0, until: time + windowMs };
      this.buckets.set(key, bucket);
    }
    return ++bucket.count <= limit;
  }
  sweep() {
    const time = this.now();
    for (const [key, bucket] of this.buckets) if (time >= bucket.until) this.buckets.delete(key);
  }
}
export function allowedOrigin(req, publicUrl) {
  const origin = req.headers.origin;
  if (req.headers["sec-fetch-site"] === "cross-site") return false;
  if (!origin) return true; // Native clients still require a secret room session.
  try { return origin === new URL(publicUrl || "http://" + req.headers.host).origin; }
  catch { return false; }
}
export function securityHeaders(publicUrl) {
  let websocket = "";
  if (publicUrl) {
    const url = new URL(publicUrl);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new TypeError("Invalid PUBLIC_URL");
    websocket = url.origin.replace(/^http/, "ws");
  }
  return {
    "Content-Security-Policy": "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'" + (websocket ? " " + websocket : "") + "; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()"
  };
}
