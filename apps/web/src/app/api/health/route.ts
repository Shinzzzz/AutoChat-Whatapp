export const dynamic = "force-dynamic";

/** Liveness probe for the ALB / container orchestrator. */
export function GET() {
  return new Response(JSON.stringify({ ok: true, ts: Date.now() }), {
    headers: { "content-type": "application/json" },
  });
}
