// Generic open/close behavior shared by the mobile nav dropdown and the
// desktop "Explore" menu: toggle on trigger click, close on outside click,
// close when a link inside is picked, close on Escape, keep aria-expanded
// in sync. One implementation so a fix here fixes both dropdowns.
export function setupDropdown({ trigger, panel, onToggle, closeOnLinkClick = true } = {}) {
  if (!trigger || !panel) return null;

  function isOpen() { return panel.classList.contains("open"); }

  function setOpen(next) {
    panel.classList.toggle("open", next);
    trigger.setAttribute("aria-expanded", String(next));
    if (onToggle) onToggle(next);
  }

  trigger.addEventListener("click", function () { setOpen(!isOpen()); });

  if (closeOnLinkClick) {
    panel.addEventListener("click", function (e) {
      if (e.target.tagName === "A") setOpen(false);
    });
  }

  document.addEventListener("click", function (e) {
    if (!isOpen()) return;
    if (panel.contains(e.target) || trigger.contains(e.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && isOpen()) setOpen(false);
  });

  return { open: () => setOpen(true), close: () => setOpen(false), isOpen };
}
