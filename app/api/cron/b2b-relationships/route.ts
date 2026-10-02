import { NextResponse } from "next/server";
import { avaliarAuthCron } from "@/lib/auth/cron-auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request: Request) {
  const auth = avaliarAuthCron(
    process.env.CRON_SECRET,
    request.headers.get("authorization"),
  );
  if (!auth.autorizado)
    return NextResponse.json(
      { ok: false, error: auth.error },
      { status: auth.status },
    );
  const { data, error } = await createAdminClient().rpc("b2b_review_portfolio");
  if (error)
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 },
    );
  return NextResponse.json({ ok: true, ...data });
}
