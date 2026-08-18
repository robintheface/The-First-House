// Prevent the "page jumps to the bottom after a couple of pull-to-refreshes"
// bug on mobile Safari. See the commit that introduced this file for the
// full root-cause writeup. Kept as an external file (not inline) so the
// site's Content-Security-Policy can run with a strict script-src and no
// 'unsafe-inline' — inline <script> blocks are exactly what an XSS payload
// would use to hook window.ethereum and rewrite a transaction before the
// user signs it, so keeping all script in named, CSP-checkable files is a
// real defense, not just tidiness.
if ('scrollRestoration' in history) { history.scrollRestoration = 'manual'; }

// Safari's own pull-to-refresh / reload-button scroll restoration doesn't
// reliably respect scrollRestoration, so force it back to top on reload
// too — unless the URL has a #section hash, which should still jump there.
window.addEventListener('pageshow', function () {
  if (!location.hash) window.scrollTo(0, 0);
});
