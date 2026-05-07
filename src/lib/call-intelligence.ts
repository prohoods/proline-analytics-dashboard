// AssemblyAI transcription + OpenAI classification for CallRail calls.
// Used by the CallRail post-call webhook (kicks off transcription) and
// the AssemblyAI webhook (receives finished transcript, runs OpenAI).

const ASSEMBLYAI_API_KEY = process.env.ASSEMBLYAI_API_KEY ?? "";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY ?? "";

export interface CallClassification {
  category: "sales" | "support" | "other";
  summary: string;
  sentiment: "positive" | "neutral" | "negative";
  key_points: string[];
  follow_up_needed: boolean;
}

export async function submitTranscription(args: {
  audioUrl: string;
  webhookUrl: string;
}): Promise<string> {
  if (!ASSEMBLYAI_API_KEY) throw new Error("ASSEMBLYAI_API_KEY not set");
  const res = await fetch("https://api.assemblyai.com/v2/transcript", {
    method: "POST",
    headers: {
      authorization: ASSEMBLYAI_API_KEY,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audio_url: args.audioUrl,
      webhook_url: args.webhookUrl,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`AssemblyAI submit ${res.status}: ${text}`);
  const data = JSON.parse(text);
  if (!data.id) throw new Error("AssemblyAI returned no id");
  return data.id as string;
}

export async function fetchTranscript(transcriptId: string): Promise<{
  status: string;
  text?: string;
  error?: string;
  audio_duration?: number;
}> {
  if (!ASSEMBLYAI_API_KEY) throw new Error("ASSEMBLYAI_API_KEY not set");
  const res = await fetch(
    `https://api.assemblyai.com/v2/transcript/${transcriptId}`,
    { headers: { authorization: ASSEMBLYAI_API_KEY } }
  );
  const text = await res.text();
  if (!res.ok) throw new Error(`AssemblyAI fetch ${res.status}: ${text}`);
  return JSON.parse(text);
}

export async function classifyCall(args: {
  transcript: string;
  customerPhone: string;
  durationSeconds: number | null;
}): Promise<CallClassification> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY not set");

  const prompt = `You analyze customer phone calls for Proline Range Hoods, a DTC ecommerce company that sells premium kitchen range hoods.

Call metadata:
- Customer phone: ${args.customerPhone}
- Duration: ${args.durationSeconds ?? "unknown"} seconds

Transcript:
"""
${args.transcript}
"""

Classify the call and produce a structured analysis. Categories:
- "sales": pre-purchase questions, product fit, sizing, pricing, availability, placing an order, dealer/wholesale inquiries
- "support": post-purchase issues — installation help, defects, missing parts, returns, warranty, shipping problems, order status
- "other": wrong number, voicemail with no clear intent, partner/supplier/vendor, internal, unintelligible

Respond ONLY with a JSON object in this exact shape:
{
  "category": "sales" | "support" | "other",
  "summary": "1-3 plain-English sentences covering what the customer wanted and how it ended",
  "sentiment": "positive" | "neutral" | "negative",
  "key_points": ["short bullet", "..."],
  "follow_up_needed": true | false
}`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${OPENAI_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a precise classifier. Always respond with valid JSON only — no markdown, no commentary.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${text}`);
  const data = JSON.parse(text);
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenAI returned no content");

  const parsed = JSON.parse(content) as CallClassification;
  if (!["sales", "support", "other"].includes(parsed.category)) {
    parsed.category = "other";
  }
  if (!["positive", "neutral", "negative"].includes(parsed.sentiment)) {
    parsed.sentiment = "neutral";
  }
  if (!Array.isArray(parsed.key_points)) parsed.key_points = [];
  parsed.follow_up_needed = Boolean(parsed.follow_up_needed);
  return parsed;
}

// Pull a recording URL out of a CallRail post_call payload. CallRail sometimes
// sends "recording", "recording_player", or nested under custom fields — read
// defensively.
export function extractRecordingUrl(
  payload: Record<string, unknown>
): string | null {
  const candidates = [
    payload.recording,
    payload.recording_url,
    (payload as { call?: { recording?: string } }).call?.recording,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
  }
  return null;
}

export function appBaseUrl(reqHost: string | null): string {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  }
  if (reqHost) return `https://${reqHost}`;
  return "http://localhost:3000";
}
