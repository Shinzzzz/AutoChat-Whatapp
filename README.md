# AutoChat

**White-label AI omnichannel sales & support platform.** AutoChat reads and replies to
customer chats with AI across WhatsApp, Instagram, email and webhooks — answering questions,
capturing leads, reading live pricing, drafting quotes, sending payment links and reporting
delivery status — behind a simple dashboard with a real-time inbox. It is multi-tenant and
unbranded by design (branding is a per-workspace setting), so it can be resold.

The first workspace is **AquaMedia** (custom-branded bottled water). The commerce layer is
pluggable, so other businesses plug in their own storefront later.

> Status: **M0–M5 built.** WhatsApp/Instagram/Email/webhook channels, the Claude agent,
> real-time inbox, CRM, pricing admin, the full quote→order→payment→invoice→shipment flow,
> screenshot import, campaigns and the voice caller are all in. Everything runs in **mock
> mode** until real credentials are added, so the whole flow is demonstrable with no external
> accounts. (Live PSTN voice audio needs a telephony account + number; the rest is live once
> its keys are set.) See **Milestones** below.

---

## Architecture

Monorepo (pnpm + Turborepo):

| Path | What it is |
|------|------------|
| `apps/web` | Next.js 15 dashboard + API routes + channel webhooks + SSE realtime |
| `apps/worker` | BullMQ consumers (AI runs, outbound sends) for production scale |
| `packages/core` | shared types, env, crypto (per-workspace secret encryption), ids |
| `packages/db` | Prisma schema + client + seed (Postgres) |
| `packages/channels` | `ChannelProvider` interface + WhatsApp Cloud API connector |
| `packages/ai` | Claude tool-using agent (pricing, quotes, payments, tracking, handoff) + mock agent |
| `packages/commerce` | `CommerceProvider` + AquaMedia impl (catalog, pricing, quote→order) |
| `packages/engine` | the pipeline (ingest → AI → send), realtime publish, queues |
| `packages/ui` | white-label theming tokens |
| `infra` | AWS CDK skeleton (RDS, ElastiCache, S3, ECS Fargate) |

**Runtime:** PostgreSQL (Prisma), Redis (BullMQ + realtime pub/sub), Claude (Anthropic SDK),
S3 for media, AWS Secrets Manager for per-workspace credentials. Realtime uses **Server-Sent
Events** bridged over Redis, so the app deploys as a standard Next server (no custom socket
server).

**Mock mode:** any integration whose credentials are absent runs in mock mode
(`packages/core/src/env.ts` → `mockFlags`). No Anthropic key → a deterministic keyword agent;
no WhatsApp creds → sends are simulated; no Razorpay/Shiprocket → payment links and tracking
are mocked.

---

## Quick start (local)

Prerequisites: Node 20+, pnpm 10+, Docker (for Postgres + Redis).

```bash
pnpm install
cp .env.example .env            # the defaults work for local dev
pnpm db:generate                # generate the Prisma client
pnpm infra:up                   # start Postgres + Redis (docker compose)
pnpm --filter @autochat/db exec prisma migrate deploy   # apply migrations
pnpm db:seed                    # seed the AquaMedia workspace + demo data
pnpm --filter @autochat/web dev # http://localhost:3000
```

Sign in with the seeded login printed by the seed: **admin@aquamedia.in / autochat123**.

Open the **Inbox** and use the “Simulate inbound (demo)” box to send a customer message —
the AI replies in real time, reads live pricing, captures the contact and (when asked)
drafts a quote and a payment link. No WhatsApp number needed.

### Running the worker (optional, for scale)

By default the web process runs the AI pipeline **inline**. To offload it to the background
worker, set `USE_QUEUE=1` for the web process and run:

```bash
pnpm --filter @autochat/worker dev
```

### Smoke test

With Postgres + Redis up and `DATABASE_URL` set, exercise the whole pipeline headlessly:

```bash
pnpm --filter @autochat/worker run smoke
```

---

## How the AI works (RAG + learning)

The agent is a Claude tool-using loop with **retrieval-augmented generation**: knowledge docs
are chunked and embedded into `KnowledgeChunk`s (Voyage AI when `VOYAGE_API_KEY` is set, a
deterministic dev embedder otherwise), and each turn retrieves the most relevant chunks
(cosine similarity, in-app; pgvector is a drop-in upgrade) and attaches them to the message —
so answers stay grounded as the corpus grows instead of stuffing the whole base into the
prompt.

It **learns, human-approved**: closing or "Learn"-ing a conversation distills durable
knowledge (Q→A, facts, objection handling) into a review queue (**AI Learning**); an operator
approves/edits, and approved items become retrievable chunks (answers from won deals ranked
higher). Closed conversations also write a per-contact memory summary that is retrieved for
returning customers. Index docs with Settings → "Reindex" or
`pnpm --filter @autochat/worker run index`.

## Going live (add real credentials)

All credentials are optional; add them in **Settings** (encrypted at rest) or via env:

- **Claude:** `ANTHROPIC_API_KEY` (model defaults to `claude-opus-5-5`; override per workspace
  in Settings → AI, or globally with `ANTHROPIC_MODEL`, e.g. `claude-sonnet-5-5` for scale).
- **WhatsApp (Meta Cloud API):** set the webhook callback to
  `<PUBLIC_BASE_URL>/api/webhooks/whatsapp` and the verify token to `WHATSAPP_VERIFY_TOKEN`,
  then add the phone number id, access token and app secret in Settings.
- **Razorpay / Shiprocket:** payments + tracking (wired fully in M2).

---

## Milestones

- **M0** — monorepo, schema + migrations, auth + workspaces, white-label theming, dashboard,
  settings, AWS infra skeleton, CI. ✅
- **M1** — WhatsApp connector, Claude agent + tools, real-time inbox, CRM, pricing admin,
  needs-human handoff. ✅
- **M2** — full commerce: Razorpay payment links, Shiprocket tracking, quotation PDF + GST
  invoice, orders admin (price/accept/advance/cancel). ✅
- **M3** — Instagram + Email + generic-webhook channels, WhatsApp media → vision,
  screenshot-import (Claude vision → confirm → AI takeover). ✅
- **M4** — campaigns (push to buy) with audience segments + per-channel send, dashboard
  analytics (7-day leads, AI-handled %). ✅
- **M5** — voice caller: Exotel/Plivo adapter, outbound-call bridge reusing the agent core,
  call webhook, Settings demo. Full structure + mock call runner; live PSTN audio needs a
  telephony account + number. ✅
- **M6** — RAG + continuous learning: embedded `KnowledgeChunk` store (Voyage AI, dev-embedder
  fallback) with cosine retrieval injected per turn; a human-approved learning loop that
  distills resolved chats into knowledge (AI Learning review queue); per-contact memory; a
  dashboard expertise tile. The AI gets sharper the more it's used. ✅

Run `pnpm --filter @autochat/worker run smoke` to exercise the whole product end-to-end
(ingest → AI → quote → price → pay → invoice → ship → track → screenshot import → campaign →
voice) against local Postgres + Redis.

See the implementation plan for the full design.

---

## Scripts

| Command | Purpose |
|---------|---------|
| `pnpm build` | build all packages/apps |
| `pnpm typecheck` | typecheck everything |
| `pnpm test` | run unit tests |
| `pnpm db:migrate` | apply migrations (`prisma migrate deploy`) |
| `pnpm db:seed` | seed demo data |
| `pnpm infra:up` / `infra:down` | start/stop local Postgres + Redis |

---

## Security notes

- Per-workspace connector credentials are encrypted with AES-256-GCM
  (`APP_ENCRYPTION_KEY`, 64 hex chars) before being stored.
- WhatsApp webhooks verify the `X-Hub-Signature-256` HMAC against the app secret.
- Sessions are signed JWTs in an httpOnly cookie (`AUTH_SECRET`).
- Every tenant table is scoped by `workspaceId`.
