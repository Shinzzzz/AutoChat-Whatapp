import { prisma } from "@autochat/db";
import { getEnv } from "@autochat/core";
import { requireWorkspace } from "../../../lib/session.js";
import {
  updateBranding,
  updateAiConfig,
  saveWhatsAppConnector,
  saveInstagramConnector,
  saveEmailConnector,
  saveWebhookConnector,
} from "./actions.js";
import { VoiceDemo } from "./VoiceDemo.js";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { workspace } = await requireWorkspace();
  const [ai, connectors] = await Promise.all([
    prisma.aiConfig.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.channelConnector.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const wa = connectors.find((c) => c.type === "whatsapp");
  const ig = connectors.find((c) => c.type === "instagram");
  const email = connectors.find((c) => c.type === "email");
  const webhook = connectors.find((c) => c.type === "webhook");
  const base = getEnv().PUBLIC_BASE_URL.replace(/\/$/, "");
  const webhookUrl = `${base}/api/webhooks/whatsapp`;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Settings</h1>
          <div className="sub muted">White-label branding, AI behaviour and channel connectors.</div>
        </div>
      </div>

      <div className="grid cols-2">
        {/* Branding */}
        <div className="card">
          <h2>Branding (white-label)</h2>
          <p className="muted small">No brand is baked into the product — these drive the whole UI.</p>
          <form action={updateBranding} style={{ marginTop: 12 }}>
            <div className="field">
              <label>Brand name</label>
              <input className="input" name="brandName" defaultValue={workspace.brandName} />
            </div>
            <div className="field">
              <label>Logo URL</label>
              <input className="input" name="logoUrl" defaultValue={workspace.logoUrl ?? ""} placeholder="https://…" />
            </div>
            <div style={{ display: "flex", gap: 12 }}>
              <div className="field" style={{ flex: 1 }}>
                <label>Primary color</label>
                <input className="input" name="primaryColor" type="color" defaultValue={workspace.primaryColor} />
              </div>
              <div className="field" style={{ flex: 1 }}>
                <label>Accent color</label>
                <input className="input" name="accentColor" type="color" defaultValue={workspace.accentColor} />
              </div>
            </div>
            <button className="btn primary" type="submit">Save branding</button>
          </form>
        </div>

        {/* AI */}
        <div className="card">
          <h2>AI assistant</h2>
          <p className="muted small">Persona and how much the AI is allowed to do on its own.</p>
          <form action={updateAiConfig} style={{ marginTop: 12 }}>
            <div className="field">
              <label>Persona &amp; tone</label>
              <textarea className="input" name="persona" defaultValue={ai?.persona ?? ""} />
            </div>
            <div className="field">
              <label>Autonomy</label>
              <select className="input" name="autonomy" defaultValue={ai?.autonomy ?? "full_auto"}>
                <option value="full_auto">Full auto — AI handles end to end</option>
                <option value="assist">Assist — AI drafts, human approves</option>
                <option value="off">Off — humans only</option>
              </select>
            </div>
            <button className="btn primary" type="submit">Save AI settings</button>
          </form>
        </div>
      </div>

      {/* Connectors */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Connectors</h2>
        <div className="grid" style={{ gap: 8, marginTop: 10 }}>
          {connectors.map((c) => (
            <div key={c.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border)", paddingTop: 8 }}>
              <div style={{ fontWeight: 600 }}>{c.label}</div>
              <span className={`pill ${c.status}`}><span className="led" />{c.status.replace("_", " ")}</span>
            </div>
          ))}
        </div>
      </div>

      {/* WhatsApp connect */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>WhatsApp Business (Meta Cloud API)</h2>
        <p className="muted small">
          In the Meta app dashboard, set the webhook callback URL to{" "}
          <code>{webhookUrl}</code> and the verify token to the value below. Credentials are
          encrypted at rest. Leave blank to run in mock mode.
        </p>
        <form action={saveWhatsAppConnector} style={{ marginTop: 12 }}>
          <div className="grid cols-2">
            <div className="field">
              <label>Phone number ID</label>
              <input className="input" name="phoneNumberId" defaultValue={(wa?.meta as Record<string, string>)?.phoneNumberId ?? ""} />
            </div>
            <div className="field">
              <label>Verify token</label>
              <input className="input" name="verifyToken" defaultValue="autochat-verify" />
            </div>
          </div>
          <div className="field">
            <label>Access token</label>
            <input className="input" name="accessToken" type="password" placeholder="EAAG… (write-only)" />
          </div>
          <div className="field">
            <label>App secret</label>
            <input className="input" name="appSecret" type="password" placeholder="for webhook signature verification" />
          </div>
          <button className="btn primary" type="submit">Save WhatsApp connector</button>
        </form>
      </div>

      {/* Instagram */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Instagram DMs (Meta)</h2>
        <p className="muted small">
          Webhook callback URL: <code>{base}/api/webhooks/instagram</code>. Needs an IG Business
          account linked to a Facebook Page.
        </p>
        <form action={saveInstagramConnector} style={{ marginTop: 12 }}>
          <div className="grid cols-2">
            <div className="field"><label>Instagram account ID</label><input className="input" name="igId" defaultValue={(ig?.meta as Record<string, string>)?.igId ?? ""} /></div>
            <div className="field"><label>Verify token</label><input className="input" name="verifyToken" defaultValue="autochat-verify" /></div>
          </div>
          <div className="field"><label>Access token</label><input className="input" name="accessToken" type="password" placeholder="IG Graph access token" /></div>
          <div className="field"><label>App secret</label><input className="input" name="appSecret" type="password" /></div>
          <button className="btn primary" type="submit">Save Instagram connector</button>
        </form>
      </div>

      {/* Email */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Email (AWS SES)</h2>
        <p className="muted small">
          Sends via SES from the address below. Point an SES→SNS inbound rule at{" "}
          <code>{base}/api/webhooks/email</code>. Leave blank to run in mock mode.
        </p>
        <form action={saveEmailConnector} style={{ marginTop: 12 }}>
          <div className="field"><label>From email address</label><input className="input" name="fromEmail" type="email" defaultValue={(email?.meta as Record<string, string>)?.fromEmail ?? ""} placeholder="hello@yourdomain.com" /></div>
          <button className="btn primary" type="submit">Save email connector</button>
        </form>
      </div>

      {/* Generic webhook */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Generic Webhook / API</h2>
        <p className="muted small">
          Inbound URL: <code>{base}/api/webhooks/generic/{webhook?.id ?? "&lt;connectorId&gt;"}</code>.
          POST <code>{`{ from, name?, text, messageId? }`}</code> signed with the shared secret in the
          <code> x-autochat-signature</code> header.
        </p>
        <form action={saveWebhookConnector} style={{ marginTop: 12 }}>
          <div className="field"><label>Shared secret (HMAC)</label><input className="input" name="secret" type="password" /></div>
          <div className="field"><label>Outbound URL (optional)</label><input className="input" name="outboundUrl" placeholder="https://your-system/incoming" defaultValue={(webhook?.meta as Record<string, string>)?.outboundUrl ?? ""} /></div>
          <button className="btn primary" type="submit">Save webhook connector</button>
        </form>
      </div>

      {/* Voice */}
      <div className="card" style={{ marginTop: 16 }}>
        <h2>Voice caller</h2>
        <p className="muted small">
          Inbound + outbound AI voice calls (Exotel/Plivo) driven by the same agent core. Live
          PSTN audio turns on once <code>VOICE_ACCOUNT_SID</code> / <code>VOICE_API_TOKEN</code> and
          a DLT-compliant number are configured. Try a simulated call below — the AI runs the same
          tools (pricing, quote, payment link) it uses in chat.
        </p>
        <VoiceDemo />
      </div>
    </>
  );
}
