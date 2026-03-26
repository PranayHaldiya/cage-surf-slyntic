import { Redis } from "@upstash/redis";
import { type LanguageModelMiddleware, simulateReadableStream } from "ai";
import { env } from "~/env";

const redis = new Redis({
  url: env.KV_REST_API_URL,
  token: env.KV_REST_API_TOKEN,
});

interface CachedGenerateResult {
  response?: {
    timestamp?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface CachedStreamPart {
  type: string;
  timestamp?: string;
  [key: string]: unknown;
}

export const cacheMiddleware: LanguageModelMiddleware = {
  specificationVersion: "v3",
  wrapGenerate: async ({ doGenerate, params }) => {
    const cacheKey = JSON.stringify(params);
    const cached = await redis.get<CachedGenerateResult>(cacheKey);

    if (cached !== null) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return {
        ...cached,
        response: {
          ...cached.response,
          timestamp: cached.response?.timestamp
            ? new Date(cached.response.timestamp)
            : undefined,
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } as any;
    }

    const result = await doGenerate();
    await redis.set(cacheKey, result);
    return result;
  },

  wrapStream: async ({ doStream, params }) => {
    const cacheKey = JSON.stringify(params);
    const cached = await redis.get<CachedStreamPart[]>(cacheKey);

    if (cached !== null) {
      const formattedChunks = cached.map((p) => {
        if (p.type === "response-metadata" && p.timestamp) {
          return { ...p, timestamp: new Date(p.timestamp) };
        }
        return p;
      });
      return {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        stream: simulateReadableStream({
          initialDelayInMs: 0,
          chunkDelayInMs: 10,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          chunks: formattedChunks as any[],
        }),
      };
    }

    const { stream, ...rest } = await doStream();
    const fullResponse: unknown[] = [];

    const transformStream = new TransformStream({
      transform(chunk, controller) {
        fullResponse.push(chunk);
        controller.enqueue(chunk);
      },
      flush() {
        void redis.set(cacheKey, fullResponse);
      },
    });

    return {
      stream: stream.pipeThrough(transformStream) as typeof stream,
      ...rest,
    };
  },
};
