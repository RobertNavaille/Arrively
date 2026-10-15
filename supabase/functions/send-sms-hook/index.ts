// Supabase Auth "Send SMS" hook: delivers driver sign-in codes through TextMagic
// instead of a built-in SMS provider. Configure it in Authentication → Hooks and
// set SEND_SMS_HOOK_SECRET to the secret Supabase shows ("v1,whsec_...").

import { Webhook } from "npm:standardwebhooks@1.0.0";
import { sendSms } from "../_shared/textmagic.ts";

Deno.serve(async (req) => {
  const payload = await req.text();
  const secret = (Deno.env.get("SEND_SMS_HOOK_SECRET") ?? "").replace("v1,whsec_", "");
  try {
    const { user, sms } = new Webhook(secret).verify(
      payload,
      Object.fromEntries(req.headers),
    ) as { user: { phone: string }; sms: { otp: string } };
    await sendSms(`+${user.phone.replace(/^\+/, "")}`, `Your Arrively code is ${sms.otp}. It expires in 10 minutes.`);
    return new Response(JSON.stringify({}), { headers: { "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: { http_code: 500, message: `Could not send the code: ${e}` } }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
