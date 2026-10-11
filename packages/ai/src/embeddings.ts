import { getEnv, mockFlags } from "@autochat/core";

/** Dimension of the deterministic dev embedder (used when no Voyage key). */
export const DEV_EMBED_DIM = 256;

/**
 * Embed texts. Uses Voyage AI (`VOYAGE_MODEL`, default voyage-3.5) when
 * `VOYAGE_API_KEY` is set; otherwise a deterministic hashed bag-of-words vector
 * so retrieval still works offline (lower quality). Re-index after switching
 * providers — vectors from different embedders are not comparable.
 */
export async function embed(
  texts: string[],
  inputType: "document" | "query" = "document",
): Promise<number[][]> {
  if (texts.length === 0) return [];
  const env = getEnv();
  if (mockFlags(env).embeddings) {
    return texts.map(devEmbed);
  }
  const res = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ input: texts, model: env.VOYAGE_MODEL, input_type: inputType }),
  });
  if (!res.ok) throw new Error(`Voyage embeddings failed: ${res.status} ${await res.text()}`);
  const data = (await res.json()) as { data: { embedding: number[] }[] };
  return data.data.map((d) => d.embedding);
}

export async function embedOne(
  text: string,
  inputType: "document" | "query" = "document",
): Promise<number[]> {
  return (await embed([text], inputType))[0] ?? [];
}

/** Deterministic hashed embedding: tokens → buckets, L2-normalized. */
function devEmbed(text: string): number[] {
  const v = new Array<number>(DEV_EMBED_DIM).fill(0);
  const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  for (const t of tokens) {
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    const idx = Math.abs(h) % DEV_EMBED_DIM;
    v[idx] = (v[idx] ?? 0) + 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

export function cosineSim(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    na += a[i]! * a[i]!;
    nb += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
