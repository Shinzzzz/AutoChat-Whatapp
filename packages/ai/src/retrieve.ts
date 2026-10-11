import { prisma } from "@autochat/db";
import { embedOne, cosineSim } from "./embeddings.js";

export interface RetrievedChunk {
  id: string;
  text: string;
  source: string;
  title: string | null;
  score: number;
}

export interface RetrieveOpts {
  k?: number;
  contactId?: string;
  minScore?: number;
}

/**
 * Retrieve the most relevant knowledge chunks for a query (cosine similarity
 * with a small priority boost). In-app ranking over the workspace's chunks —
 * swap to pgvector `<=>` for large corpora without changing callers.
 */
export async function retrieve(
  workspaceId: string,
  query: string,
  opts: RetrieveOpts = {},
): Promise<RetrievedChunk[]> {
  const { k = 5, contactId, minScore = 0.12 } = opts;
  if (!query.trim()) return [];

  const qvec = await embedOne(query, "query");
  const chunks = await prisma.knowledgeChunk.findMany({
    where: {
      workspaceId,
      OR: [{ contactId: null }, ...(contactId ? [{ contactId }] : [])],
    },
    take: 2000,
  });

  const scored = chunks
    .filter((c) => c.embedding.length === qvec.length)
    .map((c) => ({
      id: c.id,
      text: c.text,
      source: c.source,
      title: c.title,
      score: cosineSim(qvec, c.embedding) + c.priority * 0.01,
    }))
    .filter((c) => c.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  return scored;
}

/** Format retrieved chunks as a context block for the agent. */
export function formatRetrieved(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return "";
  return chunks
    .map((c, i) => `[${i + 1}${c.title ? ` · ${c.title}` : ""}] ${c.text}`)
    .join("\n\n");
}
