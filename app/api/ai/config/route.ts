import { requireAuthUser } from "@/lib/server/api-auth";
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET() {
  const supabase = await createClient();
  const auth = await requireAuthUser(supabase);
  if (!auth.ok) return auth.response;

  return NextResponse.json({
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
  });
}
