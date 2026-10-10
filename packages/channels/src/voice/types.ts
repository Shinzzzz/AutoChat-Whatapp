/**
 * Voice telephony provider (Exotel / Plivo). The VoiceProvider owns the PSTN
 * side only — placing/answering calls and sending links by SMS. The AI
 * conversation itself (STT → agent → TTS) is driven by the engine's voice
 * bridge, so the same agent core, CRM and tools power voice as power chat.
 */

export interface PlaceCallArgs {
  to: string;
  /** URL the telephony provider will fetch for call control (TwiML/XML/App). */
  answerUrl: string;
  callerId?: string;
}

export interface CallResult {
  callId: string;
  status: string;
  mock: boolean;
}

export interface VoiceProvider {
  readonly key: string;
  /** Start an outbound call to a lead. */
  placeCall(args: PlaceCallArgs): Promise<CallResult>;
  /** Send a link (payment/catalog) by SMS mid-call or as follow-up. */
  sendSms(to: string, text: string): Promise<{ mock: boolean }>;
  /** End a call. */
  hangup(callId: string): Promise<void>;
}

/** A single speech turn within a voice session (what the bridge consumes). */
export interface VoiceTurn {
  /** Transcribed caller speech (from the provider/STT integration). */
  transcript: string;
}

export interface VoiceReply {
  /** Text to be spoken back to the caller (handed to TTS). */
  speak: string;
  /** Whether the agent escalated / wants to hand off to a human. */
  handoff: boolean;
}
