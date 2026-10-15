// Sends queued customer texts (public.notifications rows with status 'pending').
//
// Called two ways:
//  - a Database Webhook on INSERT into public.notifications (payload.record), and
//  - a cron call with no body, which sweeps anything still pending (retries).
// Secret NOTIFY_SECRET must match the "x-arrively-secret" header on both.

import { admin, json } from "../_shared/admin.ts";
import { sendSms } from "../_shared/textmagic.ts";

interface Row {
  id: number;
  to_phone: string;
  body: string;
  status: string;
}

async function deliver(row: Row) {
  // Claim the row so a webhook and a sweep can't both send it.
  const { data: claimed } = await admin
    .from("notifications")
    .update({ status: "sent", sent_at: new Date().toISOString() })
    .eq("id", row.id)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (!claimed) return "skipped";

  // Honor opt-outs recorded after the text was queued.
  const { data: optOut } = await admin
    .from("sms_opt_outs").select("phone").eq("phone", row.to_phone).maybeSingle();
  if (optOut) {
    await admin.from("notifications").update({ status: "suppressed" }).eq("id", row.id);
    return "suppressed";
  }

  try {
    const { id } = await sendSms(row.to_phone, row.body);
    await admin.from("notifications").update({ provider_id: id }).eq("id", row.id);
    return "sent";
  } catch (e) {
    await admin.from("notifications")
      .update({ status: "failed", error: String(e).slice(0, 500) })
      .eq("id", row.id);
    return "failed";
  }
}

Deno.serve(async (req) => {
  if (req.headers.get("x-arrively-secret") !== Deno.env.get("NOTIFY_SECRET")) {
    return json({ error: "unauthorized" }, 401);
  }
  const payload = await req.json().catch(() => null);
  let rows: Row[] = [];
  if (payload?.record) {
    rows = [payload.record as Row];
  } else {
    const { data } = await admin
      .from("notifications").select("id,to_phone,body,status")
      .eq("status", "pending").order("created_at").limit(50);
    rows = data ?? [];
  }
  const results = [];
  for (const row of rows) {
    if (row.status !== "pending") continue;
    results.push({ id: row.id, result: await deliver(row) });
  }
  return json({ results });
});
