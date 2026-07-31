document.addEventListener('DOMContentLoaded', () => {
  const chips = document.querySelectorAll('.contract-chip');

  chips.forEach((btn) => {
    btn.addEventListener('click', async () => {
      const value = btn.dataset.copy?.trim();
      const label = btn.querySelector('.contract-label');
      const original = btn.dataset.label || label?.textContent || 'CA';

      if (!value) {
        console.error('Missing data-copy value on contract chip:', btn);
        if (label) {
          label.textContent = 'MISSING CA';
          setTimeout(() => {
            label.textContent = original;
          }, 1400);
        }
        return;
      }

      try {
        await navigator.clipboard.writeText(value);

        if (label) {
          label.textContent = 'COPIED';
          setTimeout(() => {
            label.textContent = original;
          }, 1200);
        }
      } catch (err) {
        console.error('Clipboard copy failed:', err);

        try {
          const temp = document.createElement('textarea');
          temp.value = value;
          temp.setAttribute('readonly', '');
          temp.style.position = 'absolute';
          temp.style.left = '-9999px';
          document.body.appendChild(temp);
          temp.select();
          document.execCommand('copy');
          document.body.removeChild(temp);

          if (label) {
            label.textContent = 'COPIED';
            setTimeout(() => {
              label.textContent = original;
            }, 1200);
          }
        } catch (fallbackErr) {
          console.error('Fallback copy failed:', fallbackErr);

          if (label) {
            label.textContent = 'COPY FAILED';
            setTimeout(() => {
              label.textContent = original;
            }, 1400);
          }
        }
      }
    });
  });
});