// Generates the PWA/home-screen icon set from app/icon.svg.
//
// librsvg (sharp's SVG rasteriser) renders the kangaroo emoji as a black
// silhouette with a clean alpha channel, so we use that alpha as a mask and
// tint it the brand emerald on the dark page background:
//   public/icon-192.png           — manifest icon (any)
//   public/icon-512.png           — manifest icon (any)
//   public/icon-maskable-512.png  — manifest icon (maskable, 80% safe zone)
//   app/apple-icon.png            — iOS home screen (Next.js file convention)
//
// Run: npm run icons
import sharp from "sharp";
import { readFileSync } from "fs";

const SVG = readFileSync(new URL("../app/icon.svg", import.meta.url));
const BG = { r: 3, g: 7, b: 18, alpha: 1 };      // gray-950 #030712
const FG = { r: 52, g: 211, b: 153, alpha: 1 };  // emerald-400 #34d399

// Render the glyph at `glyphSize`, tint it FG, centre it on a BG square of `size`.
async function makeIcon(size, glyphRatio, out) {
  const glyphSize = Math.round(size * glyphRatio);
  const alpha = await sharp(SVG)
    .resize(glyphSize, glyphSize)
    .ensureAlpha()
    .extractChannel("alpha")
    .toBuffer();

  const tinted = await sharp({
    create: { width: glyphSize, height: glyphSize, channels: 3, background: FG },
  })
    .joinChannel(alpha)
    .png()
    .toBuffer();

  await sharp({
    create: { width: size, height: size, channels: 4, background: BG },
  })
    .composite([{ input: tinted, gravity: "centre" }])
    .png()
    .toFile(new URL(`../${out}`, import.meta.url).pathname);

  console.log(`✓ ${out} (${size}px)`);
}

await makeIcon(192, 0.78, "public/icon-192.png");
await makeIcon(512, 0.78, "public/icon-512.png");
// Maskable: keep the glyph inside the 80% safe zone so circular masks don't clip it.
await makeIcon(512, 0.6, "public/icon-maskable-512.png");
await makeIcon(180, 0.72, "app/apple-icon.png");
