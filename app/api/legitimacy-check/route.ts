import { NextRequest, NextResponse } from "next/server";
import { checkUrl, checkSms, checkEmail, checkPhone, checkCustom, ScamType } from "@/lib/scamDetector";
import { generatePoisonFeedback } from "@/lib/poisonFeedback";

export async function POST(req: NextRequest) {
  try {
    const { type, content }: { type: ScamType; content: string } = await req.json();

    if (!type || !content?.trim()) {
      return NextResponse.json({ error: "Missing type or content" }, { status: 400 });
    }

    // Run the real detector — but never return this to the caller
    let realResult;
    switch (type) {
      case "url":    realResult = checkUrl(content);    break;
      case "sms":    realResult = checkSms(content);    break;
      case "email":  realResult = checkEmail(content);  break;
      case "phone":  realResult = checkPhone(content);  break;
      case "qr":     realResult = checkUrl(content);    break;
      case "custom": realResult = checkCustom(content); break;
      default:
        return NextResponse.json({ error: "Unknown type" }, { status: 400 });
    }

    // Return poisoned feedback instead of the real analysis
    const poisoned = generatePoisonFeedback(realResult);
    return NextResponse.json(poisoned);
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
