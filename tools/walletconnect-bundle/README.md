# WalletConnect bundle (one-time local build)

The site has no build step -- every other script is loaded straight off the
CDN with an SRI hash. `@walletconnect/ethereum-provider` can't be loaded that
way: its published UMD/CDN build isn't self-contained (it externalizes `viem`,
`lit`, `valtio`, `qrcode`, `bs58`, `big.js`, ... expecting matching globals
that don't exist as clean CDN builds). So instead this folder bundles it
**once, locally**, and the output is committed straight into the site as
`js/vendor/walletconnect-ethereum-provider.js` -- a same-origin static file
the site serves like any other script. This folder itself is dev tooling only;
it is never installed or run as part of building/deploying the site.

## Rebuilding (only needed when bumping the WalletConnect SDK version)

```sh
cd tools/walletconnect-bundle
npm install
npm run build
```

This overwrites `../../js/vendor/walletconnect-ethereum-provider.js`. After
rebuilding:

1. Check the new file size (`git diff --stat`) -- a big jump is worth
   understanding before committing.
2. Re-check what hostnames the bundle talks to:
   `grep -oE '(https?|wss?)://[a-zA-Z0-9._-]+' ../../js/vendor/walletconnect-ethereum-provider.js | sort -u`
   If new hosts show up, update `vercel.json`'s CSP (`connect-src` for the
   relay/API endpoints, `img-src` for `api.web3modal.org` wallet icons).
3. Run `npm run verify` from the repo root and smoke-test the WalletConnect
   option in `/explore/wallet`.
4. Commit both the updated bundle and any CSP change together.

Pinned versions (`@walletconnect/ethereum-provider@2.23.10`, `esbuild@0.28.2`)
are intentional -- bump them deliberately, not via `npm update`.
