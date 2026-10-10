import { prisma } from "@autochat/db";
import { getEnv } from "@autochat/core";
import { requireWorkspace } from "../../../lib/session.js";
import { updateBranding, updateAiConfig, saveWhatsAppConnector } from "./actions.js";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { workspace } = await requireWorkspace();
  const [ai, connectors] = await Promise.all([
    prisma.aiConfig.findUnique({ where: { workspaceId: workspace.id } }),
    prisma.channelConnector.findMany({ where: { workspaceId: workspace.id }, orderBy: { createdAt: "asc" } }),
  ]);
  const wa = connectors.find((c) => c.type === "whatsapp");
  const webhookUrl = `${getEnv().PUBLIC_BASE_URL}/api/webhooks/whatsapp`;

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

      <div className="card" style={{ marginTop: 16 }}>
        <h2>Instagram · Email · Voice</h2>
        <p className="muted">
          Instagram DMs and Email land in M3, the Voice caller in M5. Each plugs into the same
          connector model and AI core — the dashboard already tracks their status.
        </p>
      </div>
    </>
  );
}
