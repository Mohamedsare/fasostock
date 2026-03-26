import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    deepseekConfigured: Boolean(process.env.DEEPSEEK_API_KEY?.trim()),
  });
}
