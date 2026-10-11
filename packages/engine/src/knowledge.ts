import { prisma } from "@autochat/db";
import { chunkText, embed, embedOne } from "@autochat/ai";

/** (Re)index a knowledge doc into retrievable embedded chunks. */
export async function indexDoc(docId: string): Promise<number> {
  const doc = await prisma.knowledgeDoc.findUnique({ where: { id: docId } });
  if (!doc) return 0;
  const texts = chunkText(doc.content);
  const vectors = await embed(texts, "document");

  await prisma.knowledgeChunk.deleteMany({ where: { docId } });
  await prisma.$transaction(
    texts.map((text, i) =>
      prisma.knowledgeChunk.create({
        data: {
          workspaceId: doc.workspaceId,
          source: "doc",
          docId,
          title: doc.title,
          text,
          embedding: vectors[i] ?? [],
        },
      }),
    ),
  );
  return texts.length;
}

/** Reindex every knowledge doc in a workspace. */
export async function reindexWorkspace(workspaceId: string): Promise<number> {
  const docs = await prisma.knowledgeDoc.findMany({ where: { workspaceId }, select: { id: true } });
  let total = 0;
  for (const d of docs) total += await indexDoc(d.id);
  return total;
}

/** Embed + store an approved learned item as a retrievable chunk. */
export async function indexLearnedItem(itemId: string): Promise<void> {
  const item = await prisma.learnedItem.findUnique({ where: { id: itemId } });
  if (!item) return;
  const text = item.question ? `Q: ${item.question}\nA: ${item.answer}` : item.answer;
  const embedding = await embedOne(text, "document");
  await prisma.knowledgeChunk.create({
    data: {
      workspaceId: item.workspaceId,
      source: "learned",
      title: item.type,
      text,
      embedding,
      priority: item.converted ? 2 : 1,
    },
  });
}

/** Store a per-contact memory summary as a retrievable chunk. */
export async function indexContactMemory(
  workspaceId: string,
  contactId: string,
  text: string,
): Promise<void> {
  if (!text.trim()) return;
  const embedding = await embedOne(text, "document");
  await prisma.knowledgeChunk.create({
    data: { workspaceId, source: "contact_memory", contactId, title: "Past interaction", text, embedding },
  });
}
