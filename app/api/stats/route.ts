import { NextResponse } from "next/server";
import { getStats } from "@/lib/reportStore";

export async function GET() {
  return NextResponse.json(await getStats());
}
