import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Tesseract browser runtime copied from node_modules by
    // scripts/copy-ocr-assets.mjs — vendor minified output, not our source.
    "public/tesseract/**",
  ]),
  // ── Privacy invariant: no low-level network access in the detector ─────────
  //
  // The app's core promise is that submitting a suspicious link does not visit
  // it. Fetching a scam URL tells the scammer their link is live and under
  // investigation, which can cost a victim their one chance at a takedown.
  //
  // __tests__/privacyInvariant.test.ts enforces this behaviourally, but it can
  // only intercept global fetch: module mocking cannot reach a dynamic import
  // inside already-loaded production code, so a leak through node:dns or
  // node:net would pass every test in that file. The route contract in
  // app/api/check/route.ts explicitly names "an outbound HTTP request, DNS
  // lookup, or socket connection" — this rule closes the two the test cannot.
  //
  // Scoped to the code that handles submitted content. Scripts and workers are
  // deliberately excluded: they do legitimate network work and never analyse a
  // user's submission. Non-network builtins (crypto, path, fs) stay allowed —
  // this bans reaching the network, not using Node.
  //
  // If a future change genuinely needs one of these, that is a deliberate
  // decision about the privacy contract and should be argued in review, not
  // silenced with an inline disable.
  {
    files: ["lib/**/*.ts", "app/**/*.ts", "app/**/*.tsx", "components/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            "dns", "node:dns", "dns/promises", "node:dns/promises",
            "net", "node:net",
            "tls", "node:tls",
            "http", "node:http",
            "https", "node:https",
            "http2", "node:http2",
            "dgram", "node:dgram",
          ].map((name) => ({
            name,
            message:
              "Network access from the detector would break the never-visit-a-submitted-URL invariant. " +
              "Outbound calls go through the injected transport (see lib/urlExpander.ts) or an explicit " +
              "fetch to a fixed endpoint we chose. See __tests__/privacyInvariant.test.ts.",
          })),
        },
      ],
    },
  },
  // Treat a leading underscore as "deliberately unused". Needed for the
  // omit-a-key destructure idiom (`const { dropMe: _, ...rest } = obj`) and
  // for signature-mandated parameters that go unread.
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
