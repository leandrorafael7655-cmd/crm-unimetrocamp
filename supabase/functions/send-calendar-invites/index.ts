import "jsr:@supabase/functions-js/edge-runtime.d.ts";
// Retired at the production cutover. Gmail SMTP is processed only by Vercel.
// Keeping a second consumer would bypass the new queue leases and retry rules.
Deno.serve(() => Response.json({ ok: false, configured: false, message: "O processamento de convites foi transferido para o servidor do CRM." }, { status: 410 }));
