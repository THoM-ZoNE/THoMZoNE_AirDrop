(function () {
    const address = "PASTE_CA_ADDRESS_HERE"; // type your contract address here
    const textEl = document.getElementById("caText");
    const stampEl = document.getElementById("caStamp");

    const TYPE_SPEED = 32;
    const HOLD_AFTER_TYPE = 900;   // waiting after typing the address before showing the stamp
    const HOLD_WITH_STAMP = 6600;  // how long the stamp+address will remain visible
    const ERASE_SPEED = 14;
    const PAUSE_BEFORE_RETYPE = 500;

    function typeText(cb) {
      let i = 0;
      textEl.textContent = "";
      (function step() {
        if (i <= address.length) {
          textEl.textContent = address.slice(0, i);
          i++;
          setTimeout(step, TYPE_SPEED);
        } else {
          cb();
        }
      })();
    }

    function eraseText(cb) {
      let i = address.length;
      (function step() {
        if (i >= 0) {
          textEl.textContent = address.slice(0, i);
          i--;
          setTimeout(step, ERASE_SPEED);
        } else {
          cb();
        }
      })();
    }

    function showStamp(cb) {
      stampEl.classList.remove("hide");
      stampEl.classList.add("show");
      setTimeout(cb, HOLD_WITH_STAMP);
    }

    function hideStamp(cb) {
      stampEl.classList.remove("show");
      stampEl.classList.add("hide");
      setTimeout(cb, 300);
    }

    function loop() {
      typeText(() => {
        setTimeout(() => {
          showStamp(() => {
            hideStamp(() => {
              eraseText(() => {
                setTimeout(loop, PAUSE_BEFORE_RETYPE);
              });
            });
          });
        }, HOLD_AFTER_TYPE);
      });
    }

    loop();
  })();
