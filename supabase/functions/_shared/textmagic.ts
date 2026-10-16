// TextMagic REST API v2 client (https://docs.textmagic.com).
// Secrets: TEXTMAGIC_USERNAME, TEXTMAGIC_API_KEY, optional TEXTMAGIC_FROM (sender number).

const API = "https://rest.textmagic.com/api/v2";

export interface SendResult {
  id: string;
}

export async function sendSms(to: string, text: string): Promise<SendResult> {
  const username = Deno.env.get("TEXTMAGIC_USERNAME");
  const key = Deno.env.get("TEXTMAGIC_API_KEY");
  if (!username || !key) throw new Error("TextMagic credentials are not set");

  const body = new URLSearchParams({
    text,
    // TextMagic takes international numbers without the leading "+".
    phones: to.replace(/^\+/, ""),
  });
  const from = Deno.env.get("TEXTMAGIC_FROM");
  if (from) body.set("from", from.replace(/^\+/, ""));

  const res = await fetch(`${API}/messages`, {
    method: "POST",
    headers: {
      "X-TM-Username": username,
      "X-TM-Key": key,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`TextMagic ${res.status}: ${json.message ?? JSON.stringify(json)}`);
  }
  // The API returns the message (or session) id; keep whichever is present.
  return { id: String(json.messageId ?? json.id ?? "") };
}
