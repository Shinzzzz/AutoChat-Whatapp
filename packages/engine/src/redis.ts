import { Redis } from "ioredis";
import { getEnv } from "@autochat/core";

const g = globalThis as unknown as { __redisPub?: Redis };

/** Shared publisher/command connection. Subscribers must use their own. */
export function getRedis(): Redis {
  if (!g.__redisPub) {
    g.__redisPub = new Redis(getEnv().REDIS_URL, {
      maxRetriesPerRequest: null,
      lazyConnect: false,
    });
    g.__redisPub.on("error", (e) => console.error("[redis]", e.message));
  }
  return g.__redisPub;
}

/** A fresh connection, e.g. for a BullMQ Worker or an SSE subscriber. */
export function newRedis(): Redis {
  return new Redis(getEnv().REDIS_URL, { maxRetriesPerRequest: null });
}
