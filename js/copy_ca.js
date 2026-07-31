document.querySelectorAll('.contract-chip').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const value = btn.dataset.copy;
    try {
      await navigator.clipboard.writeText(value);
      const label = btn.querySelector('.contract-label');
      const original = label.textContent;
      label.textContent = 'COPIED';
      setTimeout(() => (label.textContent = original), 1200);
    } catch (_) {}
  });
});