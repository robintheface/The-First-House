// Wallet connect + $HOODFACE holder-check logic for explore/wallet/index.html.
// Kept as an external module (not an inline <script>) so the site can run
// under a Content-Security-Policy without 'unsafe-inline' script-src — this
// is the one page that actually talks to a wallet, so it's the one most
// worth protecting from XSS-injected inline scripts that could otherwise
// hook window.ethereum and tamper with a transaction before the user signs.
import { tierFor, shortAddr, nextTierInfo, splitTierLabel, tierColorVar, tierBlurb, tierIconImage, tierHeroImage, DEFAULT_HERO_IMAGE } from "./wallet-utils.js";

const HOODFACE_ADDRESS = "0x4390B64Db4d9AC2F2D6AA880AAf23de24008C274";
const ROBINHOOD_CHAIN_ID_HEX = "0x1237"; // 4663 in hex
const ROBINHOOD_CHAIN_PARAMS = {
  chainId: ROBINHOOD_CHAIN_ID_HEX,
  chainName: "Robinhood Chain",
  nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"]
};
const ERC20_ABI = [
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)"
];
const RESTING_LABEL = 'See your rank';
// WalletConnect Project IDs are public client identifiers (they scope relay
// usage/quota, not a secret) -- WalletConnect's own docs have it living in
// front-end code same as this. Get one at https://dashboard.reown.com.
const WALLETCONNECT_PROJECT_ID = '788bd500d3787a7879aa1e9bb5901533';

// ---------- multi-wallet discovery (EIP-6963) ----------
// A page with only "window.ethereum" can't reliably tell MetaMask and OKX
// Wallet apart when both are installed -- whichever extension injected last
// "wins" that global, so a user picking "MetaMask" in the list could
// silently end up connected through OKX instead. EIP-6963 has every wallet
// announce itself with its own untouched provider object instead of fighting
// over one global, so the picker can target the exact wallet the user
// clicked rather than guessing. Falls back to the legacy globals only for
// wallets that don't support 6963 yet.
const discovered = new Map(); // key: 'metamask' | 'okx' -> EIP-1193 provider
window.addEventListener('eip6963:announceProvider', (event) => {
  const { info, provider } = event.detail || {};
  if (!info || !provider) return;
  const name = (info.name || '').toLowerCase();
  const rdns = (info.rdns || '').toLowerCase();
  if (name.includes('metamask') || rdns.includes('metamask')) discovered.set('metamask', provider);
  if (name.includes('okx') || name.includes('okex') || rdns.includes('okx') || rdns.includes('okex')) discovered.set('okx', provider);
});
window.dispatchEvent(new Event('eip6963:requestProvider'));

function providerFor(walletKey){
  if (discovered.has(walletKey)) return discovered.get(walletKey);
  // Legacy fallback for wallets that haven't adopted EIP-6963 yet.
  if (walletKey === 'metamask' && typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask) {
    return window.ethereum;
  }
  if (walletKey === 'okx' && typeof window.okxwallet !== 'undefined') {
    return window.okxwallet;
  }
  return null;
}

// ---------- DOM refs ----------
const connectBtns = document.querySelectorAll('.btn-connect-trigger');
const modal = document.getElementById('walletModal');
const stepPick = document.getElementById('modalStepPick');
const stepLoading = document.getElementById('modalStepLoading');
const loadingLine = document.getElementById('modalLoadingLine');
const resultBox = document.getElementById('holderResult');
const errorBox = document.getElementById('holderError');
const addrEl = document.getElementById('holderAddr');
const balanceEl = document.getElementById('holderBalance');
const tierEl = document.getElementById('holderTier');
const tierIconEl = document.getElementById('holderTierIcon');
const heroArtImg = document.getElementById('heroArtImg');
const nextTierProgress = document.getElementById('nextTierProgress');
const nextTierMaxed = document.getElementById('nextTierMaxed');
const nextTierName = document.getElementById('nextTierName');
const nextTierFill = document.getElementById('nextTierBarFill');
const nextTierRemaining = document.getElementById('nextTierRemaining');
const spinnerGlyph = document.getElementById('modalSpinnerGlyph');
const explorerLink = document.getElementById('holderExplorerLink');
const tierBlurbEl = document.getElementById('holderTierBlurb');
const copyBtn = document.getElementById('holderCopyBtn');
const switchBtn = document.getElementById('holderSwitchBtn');
const walletOptionBtns = modal ? modal.querySelectorAll('.wallet-option[data-wallet]') : [];
// Mirrors the glyphs in the picker list, so the spinner shows what you
// actually picked instead of a blank ring.
const WALLET_GLYPHS = { metamask: '🦊', okx: '⬡', walletconnect: '🔗' };

let activeProvider = null; // the specific EIP-1193 provider actually connected
let activeAddress = null;

// ---------- WalletConnect (lazy-loaded) ----------
// @walletconnect/ethereum-provider has no self-contained CDN build (its UMD
// bundle externalizes viem/lit/valtio/qrcode/etc, none of which have matching
// CDN builds), so it's bundled locally ahead of time into a same-origin
// static file (see tools/walletconnect-bundle/) instead of loaded from a CDN.
// Loaded via dynamic import only when the user actually picks WalletConnect,
// since the bundle is ~2MB and most visitors will connect via MetaMask/OKX.
let wcProviderPromise = null;
async function getWalletConnectProvider(){
  if (!wcProviderPromise) {
    wcProviderPromise = import('./vendor/walletconnect-ethereum-provider.js').then(({ EthereumProvider }) =>
      EthereumProvider.init({
        projectId: WALLETCONNECT_PROJECT_ID,
        chains: [4663],
        rpcMap: { 4663: 'https://rpc.mainnet.chain.robinhood.com' },
        showQrModal: true,
        metadata: {
          name: 'Robin The Face',
          description: 'Hood Status — check your $HOODFACE rank',
          url: window.location.origin,
          icons: [window.location.origin + '/favicon.png']
        }
      })
    ).catch((err) => {
      wcProviderPromise = null; // allow retry on next click instead of caching a failed load
      throw err;
    });
  }
  return wcProviderPromise;
}

function setConnectLabel(text, disabled){
  connectBtns.forEach((btn) => { btn.textContent = text; btn.disabled = disabled; });
}

function showStep(step){
  [stepPick, stepLoading, resultBox].forEach((el) => { if (el) el.hidden = (el !== step); });
}

function showError(msg){
  errorBox.textContent = msg;
  errorBox.classList.add('show');
}

function clearError(){
  errorBox.classList.remove('show');
  errorBox.textContent = '';
}

function openModal(){
  if (!modal) return;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  // Ask again for announcements in case an extension finished loading
  // after the page's initial request -- it's cheap and keeps the
  // Detected/Not installed labels accurate right when it matters.
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  refreshWalletOptionMeta();
  // Already connected once this session -- skip straight back to the
  // result instead of making the user pick a wallet again.
  if (activeProvider && activeAddress) {
    clearError();
    loadBalance(activeAddress, activeProvider).catch((err) => {
      console.error(err);
      showError('Couldn\'t load your balance. Try again.');
    });
  } else {
    clearError();
    showStep(stepPick);
  }
}

function closeModal(){
  if (!modal) return;
  modal.hidden = true;
  document.body.style.overflow = '';
}

function refreshWalletOptionMeta(){
  walletOptionBtns.forEach((btn) => {
    const key = btn.dataset.wallet;
    const meta = btn.querySelector('.wallet-option-meta');
    // Disabled for now -- locked behind a "Soon" pill like the rest of the
    // site's not-yet-live features, regardless of what's installed. The
    // connect logic below (getWalletConnectProvider(), connectWith()) is
    // left in place, just unreachable, so flipping this back on later is a
    // one-line change.
    if (key === 'walletconnect') {
      btn.disabled = true;
      btn.classList.add('is-locked');
      if (meta) meta.textContent = 'Soon';
      return;
    }
    const available = !!providerFor(key);
    btn.disabled = !available;
    btn.classList.toggle('is-unavailable', !available);
    if (meta) meta.textContent = available ? 'Detected' : 'Not installed';
  });
}

async function ensureRobinhoodChain(provider, ethersProvider){
  const network = await ethersProvider.getNetwork();
  if (network.chainId === 4663n) return;
  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ROBINHOOD_CHAIN_ID_HEX }]
    });
  } catch (switchErr) {
    if (switchErr.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [ROBINHOOD_CHAIN_PARAMS]
      });
    } else {
      throw switchErr;
    }
  }
}

async function loadBalance(address, provider){
  const ethersProvider = new ethers.BrowserProvider(provider);
  await ensureRobinhoodChain(provider, ethersProvider);
  const contract = new ethers.Contract(HOODFACE_ADDRESS, ERC20_ABI, ethersProvider);
  const [rawBalance, decimals] = await Promise.all([
    contract.balanceOf(address),
    contract.decimals()
  ]);
  const formatted = ethers.formatUnits(rawBalance, decimals);
  const balanceNum = parseFloat(formatted);
  addrEl.textContent = shortAddr(address);
  addrEl.title = address; // full address on hover -- shortAddr() is display-only
  balanceEl.textContent = balanceNum.toLocaleString(undefined, {maximumFractionDigits: 0});
  const { name } = splitTierLabel(tierFor(balanceNum));
  tierEl.textContent = name;
  if (tierIconEl) {
    tierIconEl.src = tierIconImage(balanceNum);
    tierIconEl.alt = name;
  }
  // The right-side hero art follows the same tier -- falls back to the
  // default character art rather than a broken-image icon if a tier's file
  // is ever missing/renamed.
  if (heroArtImg) {
    heroArtImg.onerror = () => { heroArtImg.onerror = null; heroArtImg.src = DEFAULT_HERO_IMAGE; };
    heroArtImg.src = tierHeroImage(balanceNum);
  }
  // Recolors the icon ring, the title and the "live" dot to match this
  // tier -- everything below reads it off this one custom property, set on
  // the whole result panel rather than each element individually.
  if (resultBox) resultBox.style.setProperty('--tier-color', tierColorVar(balanceNum));
  if (explorerLink) explorerLink.href = ROBINHOOD_CHAIN_PARAMS.blockExplorerUrls[0] + '/address/' + address;
  if (tierBlurbEl) tierBlurbEl.textContent = tierBlurb(balanceNum);
  resetCopyBtn();
  renderNextTier(balanceNum);
  clearError();
  showStep(resultBox);
  // Left enabled on purpose: openModal() already knows to skip straight back
  // to this result when a session is active (see its activeProvider check
  // above), which is exactly what clicking this button again should do.
  // Disabling it here would strand a closed modal with no way back in short
  // of a page reload -- the trigger is the only door once it's shut.
  setConnectLabel('Connected ✓', false);
}

// Back to plain "copy" -- a fresh wallet result shouldn't open on a leftover
// "Copied ✓" from whatever was connected before.
function resetCopyBtn(){
  if (!copyBtn) return;
  copyBtn.classList.remove('is-copied');
  copyBtn.setAttribute('aria-label', 'Copy address');
  const glyph = copyBtn.querySelector('.rank-copy-icon');
  if (glyph) glyph.textContent = '⧉';
}

function renderNextTier(balanceNum){
  if (!nextTierProgress || !nextTierMaxed) return;
  const next = nextTierInfo(balanceNum);
  if (!next) {
    nextTierProgress.style.display = 'none';
    nextTierMaxed.style.display = 'block';
    return;
  }
  nextTierProgress.style.display = 'block';
  nextTierMaxed.style.display = 'none';
  nextTierName.textContent = next.name;
  nextTierFill.style.width = (next.progress * 100).toFixed(1) + '%';
  nextTierRemaining.textContent = next.remaining.toLocaleString(undefined, {maximumFractionDigits: 0}) + ' more $HOODFACE to go';
}

async function connectWith(walletKey){
  if (spinnerGlyph) spinnerGlyph.textContent = WALLET_GLYPHS[walletKey] || '';
  let provider;
  if (walletKey === 'walletconnect') {
    clearError();
    showStep(stepLoading);
    if (loadingLine) loadingLine.textContent = 'Opening WalletConnect…';
    setConnectLabel('Connecting…', true);
    try {
      provider = await getWalletConnectProvider();
    } catch (err) {
      console.error(err);
      showError('Couldn\'t open WalletConnect. Try again.');
      showStep(stepPick);
      setConnectLabel(RESTING_LABEL, false);
      return;
    }
    // From here the SDK's own QR modal takes over the screen; it closes
    // itself once a wallet pairs (or the user cancels it).
    if (loadingLine) loadingLine.textContent = 'Scan the QR with your wallet…';
  } else {
    provider = providerFor(walletKey);
    if (!provider) {
      showError('Wallet not found. Install the extension and try again.');
      return;
    }
    clearError();
    showStep(stepLoading);
    if (loadingLine) loadingLine.textContent = 'Pinging Robinhood Chain…';
    setConnectLabel('Connecting…', true);
  }
  try {
    const [address] = await provider.request({ method: 'eth_requestAccounts' });
    activeProvider = provider;
    activeAddress = address;
    if (loadingLine) loadingLine.textContent = 'Counting the bag…';
    await loadBalance(address, provider);
    attachProviderListeners(provider);
  } catch (err) {
    console.error(err);
    showError('Connection failed or was rejected. Try again.');
    showStep(stepPick);
    setConnectLabel(RESTING_LABEL, false);
  }
}

// Attached only to the provider actually in use, not blindly to
// window.ethereum -- with multiple wallets installed those are not
// guaranteed to be the same object.
let listenersAttachedTo = null;
function attachProviderListeners(provider){
  if (listenersAttachedTo === provider || typeof provider.on !== 'function') return;
  listenersAttachedTo = provider;
  provider.on('accountsChanged', (accounts) => {
    if (!accounts || accounts.length === 0) {
      activeProvider = null;
      activeAddress = null;
      setConnectLabel(RESTING_LABEL, false);
      resetHeroArt();
      closeModal();
      return;
    }
    activeAddress = accounts[0];
    setConnectLabel(RESTING_LABEL, false);
    loadBalance(activeAddress, provider).catch((err) => console.error(err));
  });
  provider.on('chainChanged', () => { window.location.reload(); });
  // Injected wallets signal a disconnect via an empty accountsChanged, but
  // WalletConnect sessions (ended from the wallet app, or expired) fire
  // their own 'disconnect' event instead. Deliberately NOT clearing
  // listenersAttachedTo here: the WalletConnect provider instance is reused
  // across reconnects (see getWalletConnectProvider's cache), so the
  // listeners bound above stay correct for the next session too -- clearing
  // the guard would just re-attach a duplicate set on every reconnect.
  provider.on('disconnect', () => {
    activeProvider = null;
    activeAddress = null;
    setConnectLabel(RESTING_LABEL, false);
    resetHeroArt();
    closeModal();
  });
}

// Back to the default character art -- called whenever a session ends, so a
// still-open page doesn't keep showing a tier that's no longer connected.
function resetHeroArt(){
  if (!heroArtImg) return;
  heroArtImg.onerror = null;
  heroArtImg.src = DEFAULT_HERO_IMAGE;
}

connectBtns.forEach((btn) => btn.addEventListener('click', openModal));
walletOptionBtns.forEach((btn) => {
  btn.addEventListener('click', () => connectWith(btn.dataset.wallet));
});

if (modal) {
  modal.querySelectorAll('[data-modal-close]').forEach((el) => {
    el.addEventListener('click', closeModal);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.hidden) closeModal();
  });
}

// ---------- copy address ----------
async function copyToClipboard(text){
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (err) { /* fall through to the legacy path below */ }
  // Legacy fallback for a browser (or a non-HTTPS context) without the
  // async Clipboard API -- an off-screen textarea + the old execCommand.
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (err) {
    return false;
  }
}

let copyResetTimer = null;
if (copyBtn) {
  copyBtn.addEventListener('click', async () => {
    if (!activeAddress) return;
    // A failed copy leaves the button exactly as it was -- the full address
    // is still one tap away via the explorer link, so there's nothing worse
    // to show than just staying at rest.
    if (!(await copyToClipboard(activeAddress))) return;
    copyBtn.classList.add('is-copied');
    copyBtn.setAttribute('aria-label', 'Copied');
    const glyph = copyBtn.querySelector('.rank-copy-icon');
    if (glyph) glyph.textContent = '✓';
    clearTimeout(copyResetTimer);
    copyResetTimer = setTimeout(resetCopyBtn, 1600);
  });
}

// ---------- switch wallet ----------
if (switchBtn) {
  switchBtn.addEventListener('click', () => {
    // Best-effort: only a WalletConnect session can actually be told to end
    // (it has its own .disconnect()). An injected wallet like MetaMask has
    // no programmatic disconnect at all -- this just forgets the local
    // session and brings the picker back, which is what actually matters
    // when more than one wallet extension is installed.
    if (activeProvider && typeof activeProvider.disconnect === 'function') {
      Promise.resolve(activeProvider.disconnect()).catch(() => {});
    }
    activeProvider = null;
    activeAddress = null;
    setConnectLabel(RESTING_LABEL, false);
    resetHeroArt();
    clearError();
    showStep(stepPick);
    refreshWalletOptionMeta();
  });
}

