// Prepends a "generated file, do not hand-edit" banner to the freshly built
// bundle. Run automatically as the second half of `npm run build` -- see
// package.json.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const wcVersion = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "node_modules/@walletconnect/ethereum-provider/package.json"), "utf8")
).version;

const outPath = join(dirname(fileURLToPath(import.meta.url)), "../../js/vendor/walletconnect-ethereum-provider.js");
const banner = `// GENERATED FILE -- do not hand-edit.
// Self-contained ESM bundle of @walletconnect/ethereum-provider@${wcVersion}
// (plus its full dependency tree: @walletconnect/sign-client, universal-provider,
// utils, viem, valtio, lit, qrcode, bs58, big.js, etc.), built with esbuild so
// this build-step-free static site can still ship WalletConnect support as a
// single same-origin <script type="module"> file -- no bundler needed to serve
// or deploy the site itself.
//
// To rebuild after bumping the WalletConnect SDK version, from repo root:
//   cd tools/walletconnect-bundle && npm install && npm run build
// Then review the diff (size + any new hostnames -- grep for "https://" and
// "wss://") and update vercel.json's CSP connect-src/img-src if endpoints changed.
`;

const body = readFileSync(outPath, "utf8");
writeFileSync(outPath, banner + body);
console.log(`Prepended header (WalletConnect SDK v${wcVersion}) to ${outPath}`);
