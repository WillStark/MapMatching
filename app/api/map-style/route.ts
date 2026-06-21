import { NextResponse } from "next/server";

import { resolveMapStyleConfig } from "@/lib/map/style";

export function GET() {
  return NextResponse.json(resolveMapStyleConfig(process.env));
}
