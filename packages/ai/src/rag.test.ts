import { describe, it, expect } from "vitest";
import { embed, cosineSim, DEV_EMBED_DIM } from "./embeddings.js";
import { chunkText } from "./chunk.js";

describe("dev embeddings", () => {
  it("produces fixed-dim normalized vectors", async () => {
    const [v] = await embed(["branded glass water bottles for restaurants"]);
    expect(v!.length).toBe(DEV_EMBED_DIM);
    const norm = Math.sqrt(v!.reduce((s, x) => s + x * x, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  it("ranks a related query above an unrelated one", async () => {
    const [doc] = await embed(["1 litre glass bottles come in round, square, peace, zen and pyramid shapes"]);
    const [related] = await embed(["what glass bottle shapes do you offer?"], "query");
    const [unrelated] = await embed(["how do I reset my email password?"], "query");
    expect(cosineSim(doc!, related!)).toBeGreaterThan(cosineSim(doc!, unrelated!));
  });

  it("cosine of identical vectors is 1 and empty is 0", async () => {
    const [v] = await embed(["hello"]);
    expect(cosineSim(v!, v!)).toBeCloseTo(1, 5);
    expect(cosineSim([], [])).toBe(0);
  });
});

describe("chunkText", () => {
  it("splits on headings and keeps the heading as context", () => {
    const md = "# Pricing\nIndicative only.\n\n# Shapes\nRound, square, peace.";
    const chunks = chunkText(md, 200);
    expect(chunks.length).toBeGreaterThanOrEqual(2);
    expect(chunks.some((c) => c.startsWith("Pricing"))).toBe(true);
    expect(chunks.some((c) => c.includes("Round, square"))).toBe(true);
  });
});
