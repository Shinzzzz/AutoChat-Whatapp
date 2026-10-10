import { Worker } from "bullmq";
import {
  QUEUES,
  type AiRunJob,
  type OutboundSendJob,
} from "@autochat/core";
import { newRedis, runAiForConversation, sendOutboundMessage } from "@autochat/engine";

/**
 * AutoChat background worker. Consumes AI-run and outbound-send jobs so the web
 * process stays responsive. Run with USE_QUEUE=1 on the web side to route work
 * here; without it the web process handles jobs inline (handy for local demos).
 */
console.log("[worker] starting…");

const aiWorker = new Worker<AiRunJob>(
  QUEUES.aiRun,
  async (job) => {
    console.log(`[worker] ai-run ${job.data.conversationId}`);
    await runAiForConversation(job.data.conversationId);
  },
  { connection: newRedis(), concurrency: 5 },
);

const outboundWorker = new Worker<OutboundSendJob>(
  QUEUES.outbound,
  async (job) => {
    console.log(`[worker] outbound ${job.data.messageId}`);
    await sendOutboundMessage(job.data.messageId);
  },
  { connection: newRedis(), concurrency: 10 },
);

for (const [name, w] of [
  ["ai", aiWorker],
  ["outbound", outboundWorker],
] as const) {
  w.on("failed", (job, err) =>
    console.error(`[worker:${name}] job ${job?.id} failed:`, err.message),
  );
}

async function shutdown() {
  console.log("[worker] shutting down…");
  await Promise.all([aiWorker.close(), outboundWorker.close()]);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
