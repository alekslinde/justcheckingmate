import { NextRequest, NextResponse } from "next/server";
import { checkUrl, checkSms, checkEmail, checkPhone, checkCustom, ScamType } from "@/lib/scamDetector";

export async function POST(req: NextRequest) {
  try {
    const { type, content }: { type: ScamType; content: string } = await req.json();

    if (!type || !content?.trim()) {
      return NextResponse.json({ error: "Missing type or content" }, { status: 400 });
    }

    let result;
    switch (type) {
      case "url":    result = checkUrl(content);    break;
      case "sms":    result = checkSms(content);    break;
      case "email":  result = checkEmail(content);  break;
      case "phone":  result = checkPhone(content);  break;
      case "qr":     result = checkUrl(content);    break; // QR codes resolve to URLs
      case "custom": result = checkCustom(content); break;
      default:
        return NextResponse.json({ error: "Unknown scam type" }, { status: 400 });
    }

    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Something went sideways on our end" }, { status: 500 });
  }
}
