// Wallet connect + $HOODFACE holder-check logic for functions/wallet.html.
// Kept as an external module (not an inline <script>) so the site can run
// under a Content-Security-Policy without 'unsafe-inline' script-src — this
// is the one page that actually talks to a wallet, so it's the one most
// worth protecting from XSS-injected inline scripts that could otherwise
// hook window.ethereum and tamper with a transaction before the user signs.
import { tierFor, shortAddr } from "./wallet-utils.js";

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

const connectBtn = document.getElementById('connectBtn');
const resultBox = document.getElementById('holderResult');
const errorBox = document.getElementById('holderError');
const addrEl = document.getElementById('holderAddr');
const balanceEl = document.getElementById('holderBalance');
const tierEl = document.getElementById('holderTier');

function showError(msg){
  errorBox.textContent = msg;
  errorBox.classList.add('show');
  resultBox.classList.remove('show');
}

async function ensureRobinhoodChain(provider){
  const network = await provider.getNetwork();
  if (network.chainId === 4663n) return;
  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: ROBINHOOD_CHAIN_ID_HEX }]
    });
  } catch (switchErr) {
    if (switchErr.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [ROBINHOOD_CHAIN_PARAMS]
      });
    } else {
      throw switchErr;
    }
  }
}

async function loadBalance(address, provider){
  const contract = new ethers.Contract(HOODFACE_ADDRESS, ERC20_ABI, provider);
  const [rawBalance, decimals] = await Promise.all([
    contract.balanceOf(address),
    contract.decimals()
  ]);
  const formatted = ethers.formatUnits(rawBalance, decimals);
  const balanceNum = parseFloat(formatted);
  addrEl.textContent = shortAddr(address);
  balanceEl.textContent = balanceNum.toLocaleString(undefined, {maximumFractionDigits: 0});
  tierEl.textContent = tierFor(balanceNum);
  errorBox.classList.remove('show');
  resultBox.classList.add('show');
}

async function connectWallet(){
  if (typeof window.ethereum === 'undefined') {
    showError('Không tìm thấy ví. Cài MetaMask hoặc ví tương thích EVM để tiếp tục.');
    return;
  }
  connectBtn.textContent = 'Connecting…';
  connectBtn.disabled = true;
  try {
    const provider = new ethers.BrowserProvider(window.ethereum);
    await provider.send('eth_requestAccounts', []);
    await ensureRobinhoodChain(provider);
    const signer = await provider.getSigner();
    const address = await signer.getAddress();
    await loadBalance(address, provider);
    connectBtn.textContent = 'Connected ✓';
  } catch (err) {
    console.error(err);
    showError('Kết nối thất bại hoặc bị từ chối. Thử lại nhé.');
    connectBtn.textContent = 'Connect Wallet';
    connectBtn.disabled = false;
  }
}

connectBtn.addEventListener('click', connectWallet);

if (typeof window.ethereum !== 'undefined') {
  window.ethereum.on('accountsChanged', () => { connectBtn.textContent = 'Connect Wallet'; connectBtn.disabled = false; connectWallet(); });
  window.ethereum.on('chainChanged', () => { window.location.reload(); });
}
