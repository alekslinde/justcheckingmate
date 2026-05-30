import { describe, it, expect, vi, beforeEach } from "vitest";

// Mutable hooks so individual tests can make sharp / the OCR worker succeed
// or throw without re-declaring the (hoisted) module mocks.
const h = vi.hoisted(() => ({
  toBufferImpl: async (): Promise<Buffer> => Buffer.from("fake-jpeg"),
  recognizeImpl: async (): Promise<{ data: { text: string } }> => ({
    data: { text: "extracted text" },
  }),
}));

// sharp is a chainable builder: sharp(buf).rotate().resize().flatten().jpeg().toBuffer()
vi.mock("sharp", () => {
  const chain = {
    rotate: () => chain,
    resize: () => chain,
    flatten: () => chain,
    jpeg: () => chain,
    toBuffer: () => h.toBufferImpl(),
  };
  return { default: () => chain };
});

// tesseract.js: createWorker(...) resolves to a worker with .recognize()/.terminate()
vi.mock("tesseract.js", () => ({
  createWorker: async () => ({
    recognize: () => h.recognizeImpl(),
    terminate: async () => {},
  }),
}));

import { POST } from "@/app/api/ocr/route";
import { NextRequest } from "next/server";

function multipartRequest(file?: Blob): NextRequest {
  const form = new FormData();
  if (file) form.append("image", file, "shot.png");
  // Passing a FormData body makes the runtime set a multipart content-type.
  return new NextRequest("http://localhost/api/ocr", { method: "POST", body: form });
}

const pngBlob = (bytes = 8) => new Blob([new Uint8Array(bytes)], { type: "image/png" });

beforeEach(() => {
  // Reset the cached singleton worker and default the mocks to success.
  (globalThis as { _ocrWorker?: unknown })._ocrWorker = undefined;
  h.toBufferImpl = async () => Buffer.from("fake-jpeg");
  h.recognizeImpl = async () => ({ data: { text: "extracted text" } });
});

describe("POST /api/ocr — request guards", () => {
  it("rejects a non-multipart content type with 400", async () => {
    const req = new NextRequest("http://localhost/api/ocr", {
      method: "POST",
      body: "plain text",
      headers: { "content-type": "text/plain" },
    });
    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Expected multipart/form-data" });
  });

  it("rejects an upload with no image field with 400", async () => {
    const res = await POST(multipartRequest());
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "No image field in upload" });
  });

  it("rejects an image over 20 MB with 413", async () => {
    const tooBig = new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: "image/png" });
    const res = await POST(multipartRequest(tooBig));
    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: "Image too large — max 20 MB" });
  });
});

describe("POST /api/ocr — image processing", () => {
  it("returns 422 when sharp cannot decode the image", async () => {
    h.toBufferImpl = async () => {
      throw new Error("unsupported image format");
    };
    const res = await POST(multipartRequest(pngBlob()));
    expect(res.status).toBe(422);
    expect((await res.json()).error).toMatch(/couldn't read that image/i);
  });

  it("returns the extracted text on success", async () => {
    h.recognizeImpl = async () => ({ data: { text: "  pay your invoice now  " } });
    const res = await POST(multipartRequest(pngBlob()));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ text: "pay your invoice now" });
  });

  it("collapses runs of blank lines in the OCR output", async () => {
    h.recognizeImpl = async () => ({ data: { text: "line one\n\n\n\nline two\n" } });
    const res = await POST(multipartRequest(pngBlob()));
    expect(await res.json()).toEqual({ text: "line one\n\nline two" });
  });
});

describe("POST /api/ocr — worker failure", () => {
  it("returns 500 and clears the cached worker so the next request retries fresh", async () => {
    h.recognizeImpl = async () => {
      throw new Error("worker crashed");
    };
    const res = await POST(multipartRequest(pngBlob()));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/text extraction failed/i);
    // A bad singleton must be discarded so it doesn't poison later requests.
    expect((globalThis as { _ocrWorker?: unknown })._ocrWorker).toBeUndefined();
  });
});
