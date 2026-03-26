type Bucket = {
  count: number;
  windowStart: number;
};

const buckets = new Map<string, Bucket>();

export function checkRateLimit(params: {
  key: string;
  maxRequests: number;
  windowMs: number;
}) {
  const { key, maxRequests, windowMs } = params;
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart > windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1 };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0 };
  }

  existing.count += 1;
  buckets.set(key, existing);
  return { allowed: true, remaining: Math.max(0, maxRequests - existing.count) };
}

export function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() ?? "unknown";
  return req.headers.get("x-real-ip") ?? "unknown";
}
