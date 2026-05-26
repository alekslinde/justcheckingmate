import { NextResponse } from "next/server";
import { generatePoisonProfile } from "@/lib/poisonGenerator";

export async function GET() {
  const profile = generatePoisonProfile();
  return NextResponse.json(profile);
}
