import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt =
  "Veriguard — Check before you act. A free, open-source scam checker for links, texts, emails and phone numbers.";

// Plain text + CSS shapes only: Satori's bundled font has no emoji or dingbat
// glyphs, so anything fancier renders as tofu.
export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          backgroundColor: "#030712",
          backgroundImage: "linear-gradient(180deg, #111827 0%, #030712 100%)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "20px",
            marginBottom: "32px",
          }}
        >
          <div style={{ width: "64px", height: "10px", backgroundColor: "#34d399", borderRadius: "5px" }} />
          <div style={{ color: "#34d399", fontSize: "30px", fontWeight: 700, letterSpacing: "4px" }}>
            VERIGUARD
          </div>
        </div>
        <div style={{ color: "#f9fafb", fontSize: "92px", fontWeight: 800, lineHeight: 1.05 }}>
          Check before you act
        </div>
        <div style={{ color: "#9ca3af", fontSize: "38px", marginTop: "28px", lineHeight: 1.35 }}>
          Scam checker for links, texts, emails and phone numbers.
        </div>
        <div style={{ color: "#6b7280", fontSize: "28px", marginTop: "44px" }}>
          Free · Open source · Nothing you paste is stored
        </div>
      </div>
    ),
    size,
  );
}
