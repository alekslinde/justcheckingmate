import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { createWorker } from "tesseract.js";
import path from "path";
import os from "os";

// Language data is downloaded once to this dir and reused across requests.
// Using os.tmpdir() keeps it out of the project tree and survives hot-reloads.
const LANG_PATH = path.join(os.tmpdir(), "tessdata");

// Singleton worker — created on first request, reused after that.
// Using global so Next.js hot-reload doesn't create duplicate workers in dev.
declare global {
  // eslint-disable-next-line no-var
  var _ocrWorker: ReturnType<typeof createWorker> | undefined;
}

function getWorker() {
  if (!global._ocrWorker) {
    global._ocrWorker = createWorker("eng", 1, {
      langPath: LANG_PATH,
      // Suppress tesseract's internal progress/debug logging
      logger: () => {},
      errorHandler: () => {},
    });
  }
  return global._ocrWorker;
}

export async function POST(req: NextRequest) {
  // Guard: only accept multipart uploads — direct API callers without a
  // proper Content-Type won't have a valid image and can be dropped early.
  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Could not parse upload" }, { status: 400 });
  }

  const file = formData.get("image");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No image field in upload" }, { status: 400 });
  }

  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "Image too large — max 20 MB" }, { status: 413 });
  }

  const rawBuffer = Buffer.from(await file.arrayBuffer());

  // ── Format normalisation with sharp ───────────────────────────────────────
  // sharp handles HEIC, HEIF, JPEG, PNG, WebP, TIFF, AVIF, and more.
  // We convert everything to JPEG before passing to Tesseract so the OCR
  // engine always gets a known format regardless of what the client sent.
  // The rotate() call corrects EXIF orientation (common in phone photos).
  let jpegBuffer: Buffer;
  try {
    jpegBuffer = await sharp(rawBuffer)
      .rotate()                                            // fix EXIF rotation
      .resize({ width: 1800, withoutEnlargement: true })  // cap for OCR speed
      .flatten({ background: "#ffffff" })                 // merge alpha onto white
      .jpeg({ quality: 90 })
      .toBuffer();
  } catch {
    return NextResponse.json(
      { error: "Couldn't read that image. Any photo or screenshot format should work — try a different file." },
      { status: 422 },
    );
  }

  // ── OCR ───────────────────────────────────────────────────────────────────
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(jpegBuffer);

    // Clean up common OCR noise: multiple blank lines, leading/trailing space
    const text = data.text
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return NextResponse.json({ text });
  } catch (err) {
    // If the singleton worker is in a bad state, clear it so the next
    // request gets a fresh one.
    global._ocrWorker = undefined;
    const msg = err instanceof Error ? err.message : String(err);
    console.error("OCR error:", msg);
    return NextResponse.json(
      { error: "Text extraction failed. Please paste the text manually." },
      { status: 500 },
    );
  }
}
