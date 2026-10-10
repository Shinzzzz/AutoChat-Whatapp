import { getEnv, mockFlags } from "@autochat/core";
import type { CallResult, PlaceCallArgs, VoiceProvider } from "./types.js";

/**
 * Exotel / Plivo voice adapter. Mock until VOICE_ACCOUNT_SID + VOICE_API_TOKEN
 * are set (live calling needs the customer's telephony account + a provisioned,
 * DLT-compliant number). The request shapes below are the Exotel Call Connect
 * API; Plivo differs only in endpoint + field names.
 */
export class TelephonyProvider implements VoiceProvider {
  readonly key = "exotel";

  async placeCall(args: PlaceCallArgs): Promise<CallResult> {
    const env = getEnv();
    if (mockFlags(env).voice) {
      return { callId: `mock_call_${Date.now()}`, status: "queued", mock: true };
    }
    const auth = Buffer.from(`${env.VOICE_ACCOUNT_SID}:${env.VOICE_API_TOKEN}`).toString("base64");
    const res = await fetch(
      `https://api.exotel.com/v1/Accounts/${env.VOICE_ACCOUNT_SID}/Calls/connect.json`,
      {
        method: "POST",
        headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          From: args.callerId ?? env.VOICE_CALLER_ID ?? "",
          To: args.to,
          Url: args.answerUrl,
          CallerId: args.callerId ?? env.VOICE_CALLER_ID ?? "",
        }),
      },
    );
    if (!res.ok) throw new Error(`Voice placeCall failed: ${res.status}`);
    const data = (await res.json()) as { Call?: { Sid?: string; Status?: string } };
    return { callId: data.Call?.Sid ?? "", status: data.Call?.Status ?? "queued", mock: false };
  }

  async sendSms(to: string, text: string): Promise<{ mock: boolean }> {
    const env = getEnv();
    if (mockFlags(env).voice) return { mock: true };
    const auth = Buffer.from(`${env.VOICE_ACCOUNT_SID}:${env.VOICE_API_TOKEN}`).toString("base64");
    await fetch(`https://api.exotel.com/v1/Accounts/${env.VOICE_ACCOUNT_SID}/Sms/send.json`, {
      method: "POST",
      headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ From: env.VOICE_CALLER_ID ?? "", To: to, Body: text }),
    });
    return { mock: false };
  }

  async hangup(_callId: string): Promise<void> {
    // Exotel ends calls via the call-flow; no-op in the mock/skeleton.
  }
}

export const voiceProvider: VoiceProvider = new TelephonyProvider();
