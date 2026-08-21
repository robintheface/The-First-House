// View-switcher for the Hood Status page (explore/wallet/index.html): tabs
// swap between Home / Ranks / Dashboard / FAQ, plus the FAQ accordion.
// Plain show/hide -- no router, no history entries, this is one page with
// four panels, not four pages.

const tabs = document.querySelectorAll('.hood-tab');
const views = document.querySelectorAll('.hood-view');

function showView(name){
  views.forEach((v) => { v.classList.toggle('active', v.dataset.view === name); });
  tabs.forEach((t) => {
    const active = t.dataset.target === name;
    t.classList.toggle('active', active);
    t.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

tabs.forEach((t) => t.addEventListener('click', () => showView(t.dataset.target)));

// Anything marked data-goto (the Home hero's "See the ladder" link, etc.)
// jumps to another view without needing to be a tab itself.
document.querySelectorAll('[data-goto]').forEach((el) => {
  el.addEventListener('click', () => showView(el.dataset.goto));
});

// Exposed so wallet-connect.js can jump to the Dashboard the moment a
// connect succeeds, without the two modules importing each other.
window.hoodShowView = showView;

// FAQ accordion -- one open item at a time reads calmer than a wall of
// open text, but nothing stops more than one being open if a user wants it.
document.querySelectorAll('.hood-faq-q').forEach((btn) => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.hood-faq-item');
    item.classList.toggle('open');
    btn.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');
  });
});
