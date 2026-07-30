(function () {
    const copyBtn = document.getElementById("caCopyBtn");
    const copyLabel = document.getElementById("caCopyLabel");

    copyBtn.addEventListener("click", async () => {
      const address = copyBtn.dataset.ca;
      try {
        await navigator.clipboard.writeText(address);
        copyLabel.textContent = "Copied!";
        setTimeout(() => (copyLabel.textContent = "Copy Address"), 1500);
      } catch (e) {
        copyLabel.textContent = "Copy failed";
      }
    });
  })();