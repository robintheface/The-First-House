// FAQ accordion for the Ladder + FAQ page (explore/wallet/faq/index.html).
// One open item at a time reads calmer than a wall of open text, but
// nothing stops more than one being open if a user wants it.

document.querySelectorAll('.hood-faq-q').forEach((btn) => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.hood-faq-item');
    item.classList.toggle('open');
    btn.setAttribute('aria-expanded', item.classList.contains('open') ? 'true' : 'false');
  });
});
