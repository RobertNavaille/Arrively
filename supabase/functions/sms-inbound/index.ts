// TextMagic webhooks:
//  - inbound messages: STOP / START / HELP keywords and replies (NTF-8, NTF-11)
//  - delivery receipts: marks notifications delivered or failed
// Point both TextMagic callback URLs at this function with ?secret=<SMS_WEBHOOK_SECRET>.
// TextMagic posts form-encoded or JSON bodies; both are accepted.

import { admin, json } from "../_shared/admin.ts";
import { sendSms } from "../_shared/textmagic.ts";

const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START = new Set(["START", "UNSTOP", "YES"]);

async function readBody(req: Request): Promise<Record<string, string>> {
  const type = req.headers.get("content-type") ?? "";
  if (type.includes("application/json")) return await req.json();
  const form = await req.formData();
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

function e164(n: string) {
  const digits = n.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.get("secret") !== Deno.env.get("SMS_WEBHOOK_SECRET")) {
    return json({ error: "unauthorized" }, 401);
  }
  const b = await readBody(req);

  // Delivery receipt: has a message id and a status, no text.
  if (b.status && !b.text) {
    const delivered = ["d", "delivered"].includes(String(b.status).toLowerCase());
    const failed = ["f", "e", "j", "u", "failed", "rejected"].includes(String(b.status).toLowerCase());
    if (delivered || failed) {
      await admin.from("notifications")
        .update({ status: delivered ? "delivered" : "failed", error: failed ? `provider status ${b.status}` : null })
        .eq("provider_id", String(b.id ?? b.messageId));
    }
    return json({ ok: true });
  }

  const from = e164(String(b.sender ?? b.from ?? ""));
  const text = String(b.text ?? "").trim();
  const word = text.toUpperCase().replace(/[^A-Z]/g, "");

  if (STOP.has(word)) {
    await admin.from("sms_opt_outs").upsert({ phone: from });
    return json({ ok: true, action: "opted_out" });
  }
  if (START.has(word)) {
    await admin.from("sms_opt_outs").delete().eq("phone", from);
    await sendSms(from, "Arrively: you're subscribed to visit updates again. Reply STOP to opt out.");
    return json({ ok: true, action: "opted_in" });
  }
  if (word === "HELP") {
    await sendSms(from, "Arrively visit updates. Reply STOP to opt out. Msg & data rates may apply.");
    return json({ ok: true, action: "help" });
  }

  // A reply: post it into the chat of the customer's most recent active stop,
  // and point them to the chat (NTF-11).
  const { data: stop } = await admin
    .from("stops").select("id,tracking_token,org_id")
    .eq("customer_phone", from)
    .in("status", ["scheduled", "queued", "en_route", "arrived"])
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (stop) {
    await admin.from("messages").insert({ stop_id: stop.id, sender: "customer", body: `(by text) ${text}`.slice(0, 1000) });
    const base = Deno.env.get("TRACKING_BASE_URL") ?? "https://arrively.app/t/";
    await sendSms(from, `Thanks, your driver will see this. You can also chat here: ${base}${stop.tracking_token}`);
  }
  return json({ ok: true, action: stop ? "forwarded" : "ignored" });
});
