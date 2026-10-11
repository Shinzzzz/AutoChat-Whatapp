import { prisma } from "@autochat/db";
import { reindexWorkspace } from "@autochat/engine";

/** One-shot: embed/index every workspace's knowledge docs for RAG. */
async function main() {
  const workspaces = await prisma.workspace.findMany({ select: { id: true, name: true } });
  for (const ws of workspaces) {
    const n = await reindexWorkspace(ws.id);
    console.log(`Indexed ${n} chunks for ${ws.name}`);
  }
  await prisma.$disconnect();
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
