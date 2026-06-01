import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { seedGroupStageFixtures } from "@/lib/fixtures";

export async function POST(request: NextRequest) {
  await requireAdmin();
  const result = await seedGroupStageFixtures();
  return NextResponse.redirect(new URL(`/admin?seeded=${result.created}&updated=${result.updated}`, request.url));
}
