import { getObject } from "@autochat/core/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Serve a stored object (quotation/invoice PDF, uploaded media) by key. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ key: string[] }> },
) {
  const { key } = await params;
  const obj = await getObject(key.join("/"));
  if (!obj) return new Response("not found", { status: 404 });
  return new Response(new Uint8Array(obj.body), {
    headers: {
      "content-type": obj.contentType,
      "cache-control": "private, max-age=3600",
    },
  });
}
