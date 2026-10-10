import { PrismaClient } from "@prisma/client";

/**
 * Singleton Prisma client. Next.js hot-reload would otherwise create many
 * connections, so we stash it on globalThis in development.
 */
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["warn", "error"]
        : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export * from "@prisma/client";

/**
 * Tenant-scoped helper: every query against a tenant table must include the
 * workspaceId. This thin wrapper documents that contract and gives call sites a
 * single place to build the base `where`.
 */
export function tenantWhere<T extends Record<string, unknown>>(
  workspaceId: string,
  rest?: T,
): { workspaceId: string } & T {
  return { workspaceId, ...(rest ?? ({} as T)) };
}
