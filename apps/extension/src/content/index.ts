const chip = document.createElement('button');
chip.type = 'button';
chip.textContent = 'Start Akarna';
chip.setAttribute('aria-label', 'Start Akarna form assistant');
Object.assign(chip.style, {
  position: 'fixed',
  right: '16px',
  bottom: '16px',
  zIndex: '2147483647',
  padding: '8px 12px',
  border: '1px solid #1f2937',
  borderRadius: '999px',
  background: '#111827',
  color: '#fff',
  font: '600 13px system-ui, sans-serif',
  cursor: 'pointer',
});

chip.addEventListener('click', () => {
  void chrome.runtime.sendMessage({ type: 'start-akarna' });
});

document.documentElement.append(chip);
