import { Queue } from "bullmq";
import { QUEUES, type AiRunJob, type OutboundSendJob } from "@autochat/core";
import { newRedis } from "./redis.js";

/**
 * When USE_QUEUE is set, inbound work is dispatched to BullMQ (the worker
 * process handles it). Otherwise the pipeline runs inline in the web process —
 * handy for local demos where only `next dev` is running.
 */
export const useQueue = (): boolean => process.env.USE_QUEUE === "1";

const g = globalThis as unknown as {
  __qAi?: Queue<AiRunJob>;
  __qOut?: Queue<OutboundSendJob>;
};

export function aiRunQueue(): Queue<AiRunJob> {
  if (!g.__qAi) {
    g.__qAi = new Queue<AiRunJob>(QUEUES.aiRun, { connection: newRedis() });
  }
  return g.__qAi;
}

export function outboundQueue(): Queue<OutboundSendJob> {
  if (!g.__qOut) {
    g.__qOut = new Queue<OutboundSendJob>(QUEUES.outbound, { connection: newRedis() });
  }
  return g.__qOut;
}
