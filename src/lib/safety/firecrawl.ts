import { env } from "~/env";
import { fetchWithTimeout, sleep } from "./http";
import type { EvidenceItem } from "./types";

interface FirecrawlSearchItem {
  title?: string;
  url?: string;
  description?: string;
}

interface FirecrawlSearchResponse {
  success?: boolean;
  data?: FirecrawlSearchItem[] | { web?: FirecrawlSearchItem[] };
}

const RETRIABLE_STATUS = new Set([429, 500, 502, 503, 504]);

async function runSearchOnce(query: string): Promise<EvidenceItem[]> {
  const res = await fetchWithTimeout(
    "https://api.firecrawl.dev/v1/search",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.FIRECRAWL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query,
        limit: 3,
        scrapeOptions: { formats: ["markdown"] },
      }),
      cache: "no-store",
    },
    9000,
  );

  if (!res.ok) {
    const err = new Error(`Firecrawl request failed: ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }

  const json = (await res.json()) as FirecrawlSearchResponse;
  const web = Array.isArray(json.data) ? json.data : (json?.data?.web ?? []);

  return web
    .filter((x) => x.url)
    .map((x) => ({
      title: x.title ?? "Untitled",
      url: x.url!,
      snippet: x.description,
    }));
}

export async function fetchEvidence(query: string): Promise<EvidenceItem[]> {
  if (!env.FIRECRAWL_API_KEY) return [];

  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await runSearchOnce(query);
    } catch (error) {
      const status = (error as Error & { status?: number }).status;
      const canRetry = status ? RETRIABLE_STATUS.has(status) : true;
      if (!canRetry || attempt === maxAttempts) return [];
      await sleep(250 * attempt * attempt);
    }
  }

  return [];
}
