// Switch between real app captures; never simulate messaging or focus state.
const capture = document.querySelector('[data-refresh-screen]');
document.querySelectorAll('[data-refresh-image]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-refresh-image]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    capture.src = `assets/guide/${button.dataset.refreshImage}`;
    capture.alt = `PageMe Refresh ${button.textContent.trim()} screen, captured from the running app with fictional data`;
  });
});
