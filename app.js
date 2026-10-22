(() => {
  "use strict";

  const TOUCH = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
  const root = document.documentElement;
  root.classList.add(TOUCH ? "touch-ui" : "desk-ui");
  if (!TOUCH) return;

  const bar = document.getElementById("ui-bar");
  const input = document.getElementById("key-capture");

  input.readOnly = true;
  input.setAttribute("inputmode", "none");
  input.removeAttribute("autofocus");
  input.tabIndex = -1;

  const ROWS = [
    ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
    ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
    ["Z", "X", "C", "V", "B", "N", "M", "Backspace"],
    ["+", "="],
  ];

  const toggle = document.createElement("button");
  toggle.id = "kbd-toggle";
  toggle.type = "button";
  toggle.setAttribute("aria-label", "Hide keyboard");
  toggle.textContent = "▾";
  bar.appendChild(toggle);

  const kbd = document.createElement("div");
  kbd.id = "kbd";
  kbd.setAttribute("role", "group");
  kbd.setAttribute("aria-label", "Calculator keyboard");
  ROWS.forEach((row, ri) => {
    const r = document.createElement("div");
    r.className = "kbd-row" + (ri === 3 ? " kbd-nav" : "");
    row.forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "key-btn" + (k === "Backspace" ? " fn wide" : "") + (ri === 3 ? " fn" : "");
      b.dataset.key = k;
      b.textContent = k === "Backspace" ? "⌫" : k;
      if (k === "Backspace") b.setAttribute("aria-label", "Delete last letter");
      r.appendChild(b);
    });
    kbd.appendChild(r);
  });
  bar.appendChild(kbd);

  const send = (key) => input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));

  let holdTimer = null;
  let holdRepeat = null;
  const stopHold = () => {
    clearTimeout(holdTimer);
    clearInterval(holdRepeat);
    holdTimer = holdRepeat = null;
  };

  kbd.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".key-btn");
    if (!b) return;
    e.preventDefault();
    e.stopPropagation();
    b.classList.add("pressed");
    const k = b.dataset.key;
    send(k);
    if (k === "Backspace") holdTimer = setTimeout(() => { holdRepeat = setInterval(() => send(k), 120); }, 450);
  });
  const release = () => {
    stopHold();
    kbd.querySelectorAll(".key-btn.pressed").forEach((b) => b.classList.remove("pressed"));
  };
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => kbd.addEventListener(ev, release));
  kbd.addEventListener("contextmenu", (e) => e.preventDefault());

  function measure() {
    const dock = Math.max(0, Math.round(window.innerHeight - bar.getBoundingClientRect().top));
    root.style.setProperty("--dock-h", `${dock}px`);
  }

  toggle.addEventListener("click", (e) => {
    e.stopPropagation();
    const hidden = document.body.classList.toggle("kbd-collapsed");
    toggle.textContent = hidden ? "▴" : "▾";
    toggle.setAttribute("aria-label", hidden ? "Show keyboard" : "Hide keyboard");
    requestAnimationFrame(() => {
      measure();
      window.dispatchEvent(new Event("resize"));
    });
  });

  measure();
  window.addEventListener("resize", measure);
})();
