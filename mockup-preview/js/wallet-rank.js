/* Wallet & Rank — mocked client-side. No signature, no real RPC call yet;
   swap MOCK_ACCOUNT for a real balanceOf() read via js/wallet-connect.js
   when the chain read is wired up. */
(function () {
  "use strict";

  var MOCK_ACCOUNT = {
    address: "0x8f2a…41Ee",
    balance: 2940118,
    balanceLabel: "2,940,118",
    shareOfSupply: "0.29%",
    tier: "Hood Archer",
    tierImg: "/mockup-preview/icons/badge_gem.webp",
    nextTier: "Hood Baron",
    nextTierTarget: 5000000,
    nextTierLabel: "5M"
  };

  document.addEventListener("DOMContentLoaded", function () {
    var root = document.querySelector("[data-wallet-rank]");
    if (!root) return;

    var toggleBtn = root.querySelector("[data-connect-toggle]");
    var connectedPanel = root.querySelector("[data-connected-view]");
    var emptyPanel = root.querySelector("[data-empty-view]");
    var connected = false;

    function render() {
      toggleBtn.textContent = connected ? "Disconnect" : "Connect wallet";
      connectedPanel.hidden = !connected;
      emptyPanel.hidden = connected;
    }

    toggleBtn.addEventListener("click", function () {
      connected = !connected;
      render();
    });

    render();
  });
})();
