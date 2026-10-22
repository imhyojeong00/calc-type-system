(() => {
const D = window.CALC_DATA, ADJ = window.SIZE_ADJUST || {};
const C = {}; D.calcs.forEach((c) => (C[c.n] = c));
const PAIR = {}; D.pairs.forEach((p) => (PAIR[p.letter] = p));

/* ─────────────────────────────────────────────────────────────
   TYPING SYSTEM (final)
   1. Body   : letter j  → calculator j+1      (oldest bodies, 1949 →)
   2. Keys   : letter j  → calculator 56−j     (newest keys, ← 1980)
   3. Dose   : English letter frequency decides how many keys a body gets.
               Frequent letters are worn bare, rare letters pile keys up.
               keys = sockets × dose
   4. Graft  : 42% of the keys are pulled out of the previous composite
               (its sockets go empty). "=" never grafts.
   5. Overflow: keys beyond the socket count continue the keypad grid —
               gaps inside the keypad first, then ring by ring over the body,
               past the body's edge only when the body is full.
   6. Line   : the genealogy line breaks — VOID letters leave a gap,
               EXCESS letters climb onto the previous body and lift the line.
   7. Error  : a letter typed twice in a row is copied wrong — the machine
               imagines a calculator that never existed (left half of the body,
               right half of the key donor) and captions it like a real one.
   8. Tape   : printing calculators print the running sum of keys; "=" totals it.
   9. Shed   : receipt tape drops after 3 letters, the body after 9 —
               only the keys remain.
   Uncertain dates are written with "?" (c1961 → 1961?, early 1950s → 195?).
   Original and X-ray share the same layout; only the images change.
   ───────────────────────────────────────────────────────────── */
const FREQ = "ETAOINSHRDLCUMWFGYPBVKJXQZ";
const TIERS = [
  { en: "VOID",    ko: "공백", dose: 0 },
  { en: "SPARSE",  ko: "결핍", dose: 0.2 },
  { en: "EXACT",   ko: "정량", dose: 1 },
  { en: "SURPLUS", ko: "잉여", dose: 1.8 },
  { en: "EXCESS",  ko: "과잉", dose: 3.4 },
];
const TIER_OF = {};
[...FREQ].forEach((L, i) => (TIER_OF[L] = i < 5 ? 0 : i < 10 ? 1 : i < 16 ? 2 : i < 21 ? 3 : 4));
TIER_OF["+"] = 4; TIER_OF["="] = 2;
const NO_GRAFT = new Set(["="]);
const DONATE = 0.42;
const MAX_KEYS = 220;
const OVERLAP = 0.24;
const SHED = { tape: 3, body: 9 };
const HIDE_AFTER = 60;

const $ = (id) => document.getElementById(id);
const lineEl = $("line"), world = $("world"), view = $("main-view");
const typedEl = $("typed-display"), capture = $("key-capture");
const info1 = $("info-1"), info2 = $("info-2"), info3 = $("info-3");

let typed = "", comps = [], zoom = 1, panX = 0, panY = 0, xray = false, soundOn = true;
let LANG = (() => { try { return localStorage.getItem("calc-lang") === "ko" ? "ko" : "en"; } catch (e) { return "en"; } })();
const ko = (en, k) => (LANG === "ko" ? k : en);
const shedLogged = new Set();
let shedNote = "";

const viewH = () => view.clientHeight || innerHeight;
const pxPerCm = () => Math.min(innerWidth * 0.02, viewH() * 0.0245);
const bodyW = (c) => c.cm * (ADJ[c.n] ?? 1) * pxPerCm();
const bodyH = (c) => (bodyW(c) * c.bh) / c.bw;
const pad = (n) => String(n).padStart(2, "0");
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const bodySrc = (n) => `${xray ? "xray" : "images"}/${pad(n)}.webp`;
const keySrc = (n) => `${xray ? "keys_xray" : "keys"}/${pad(n)}.webp`;

function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const hash = (str) => { let h = 2166136261; for (const ch of str) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; };
const shuffle = (arr, r) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };

const Snd = {
  ctx: null, nb: null, bn: null, bus: null, master: null, mf: null,
  mix: { type: 1.0, receipt: 0.85, bed: 0.30 },
  prod: 0.3, prodTarget: 0.3, nextBeat: 0, step: 0, lastTypeAt: -99, started: false, bed: null, scan: null,

  init(ctx) {
    if (this.ctx) return;
    try {
      const c = (this.ctx = ctx || new (window.AudioContext || window.webkitAudioContext)()), n = c.sampleRate;
      let b = c.createBuffer(1, n, n), d = b.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1; this.nb = b;
      b = c.createBuffer(1, n * 4, n); d = b.getChannelData(0); let last = 0; for (let i = 0; i < d.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; } this.bn = b;
      const comp = c.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 12; comp.ratio.value = 5; comp.attack.value = 0.002; comp.release.value = 0.14;
      const master = c.createGain(); master.gain.value = 1.15; comp.connect(master); master.connect(c.destination); this.master = master;
      const mf = c.createBiquadFilter(); mf.type = "lowpass"; mf.frequency.value = 20000; mf.Q.value = 0.7; mf.connect(comp); this.mf = mf;
      this.bus = {}; for (const k of ["type", "receipt", "bed"]) { const g = c.createGain(); g.gain.value = this.mix[k]; g.connect(mf); this.bus[k] = g; }
    } catch (e) { this.ctx = null; }
  },
  ready() {
    if (!soundOn) return false; this.init(); if (!this.ctx) return false;
    if (this.ctx.state !== "running" && this.ctx.state !== "closed") this.ctx.resume();
    this.startLayers(); return true;
  },

  noise(t, dur, type, f, q, g0, dest) { const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = this.nb; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(fl); fl.connect(g); g.connect(dest || this.bus.type); s.start(t, Math.random() * 0.5, dur + 0.02); },
  tone(t, dur, f0, f1, g0, type, dest) { const c = this.ctx, o = c.createOscillator(), g = c.createGain(); o.type = type || "sine"; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur); g.gain.setValueAtTime(g0, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(dest || this.bus.type); o.start(t); o.stop(t + dur + 0.02); },
  loopNoise(buf, type, f, q, gain, dest) { const c = this.ctx, s = c.createBufferSource(), fl = c.createBiquadFilter(), g = c.createGain(); s.buffer = buf; s.loop = true; fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = gain; s.connect(fl); fl.connect(g); g.connect(dest); s.start(); return { g, fl }; },

  startLayers() {
    if (this.started || !this.ctx) return; this.started = true; const c = this.ctx;

    const bg = c.createGain(); bg.gain.value = 0; bg.connect(this.bus.bed); this.bed = { g: bg };
    this.loopNoise(this.bn, "lowpass", 170, 0.7, 1.15, bg);
    [[50, "sawtooth", 0.15], [100.4, "triangle", 0.12], [151, "sine", 0.05]].forEach(([f, ty, v]) => {
      const o = c.createOscillator(), lp = c.createBiquadFilter(), og = c.createGain(); o.type = ty; o.frequency.value = f; lp.type = "lowpass"; lp.frequency.value = 420; og.gain.value = v; o.connect(lp); lp.connect(og); og.connect(bg); o.start(); });
    const whir = this.loopNoise(this.nb, "bandpass", 960, 5, 0.05, bg);
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.23; lg.gain.value = 0.035; lfo.connect(lg); lg.connect(whir.g.gain); lfo.start();
    const lfo2 = c.createOscillator(), lg2 = c.createGain(); lfo2.frequency.value = 0.11; lg2.gain.value = 260; lfo2.connect(lg2); lg2.connect(whir.fl.frequency); lfo2.start();

    const sg = c.createGain(); sg.gain.value = 0; sg.connect(this.bus.bed); this.scan = { g: sg };
    const so = c.createOscillator(), sf = c.createBiquadFilter(); so.type = "sawtooth"; so.frequency.value = 118; sf.type = "bandpass"; sf.frequency.value = 720; sf.Q.value = 2.2; so.connect(sf); sf.connect(sg); so.start();
    const so2 = c.createOscillator(), og2 = c.createGain(); so2.type = "sine"; so2.frequency.value = 2950; og2.gain.value = 0.03; so2.connect(og2); og2.connect(sg); so2.start();
    this.nextBeat = c.currentTime + 0.4; this.bedLevel(true);
    if (!this.timer && typeof setInterval === "function" && !(window.OfflineAudioContext && c instanceof window.OfflineAudioContext)) this.timer = setInterval(() => this.tick(), 120);
  },
  setProduction(v) { this.prodTarget = clamp(v, 0.28, 1); },
  bedLevel(now) { if (!this.bed) return; const c = this.ctx; this.bed.g.gain.setTargetAtTime(soundOn ? 0.2 + 0.6 * this.prod : 0, c.currentTime, now ? 0.01 : 0.45); },
  tick() {
    if (!this.ctx || !soundOn) return; const c = this.ctx;
    try {
      if (c.currentTime - this.lastTypeAt > 7) this.prodTarget = Math.max(0.28, this.prodTarget - 0.02);
      this.prod += (this.prodTarget - this.prod) * 0.06; this.bedLevel(); this.scheduleUntil(c.currentTime + 0.3);
    } catch (err) { console.warn("[calc-type] noise layer stopped:", err); clearInterval(this.timer); this.timer = null; }
  },
  scheduleUntil(T) {
    if (this.nextBeat < this.ctx.currentTime) this.nextBeat = this.ctx.currentTime + 0.05;
    while (this.nextBeat < T) { this.beat(this.nextBeat); this.nextBeat += (0.98 - 0.52 * this.prod) * (0.92 + Math.random() * 0.16) * (this.step % 2 ? 0.82 : 1.14); }
  },
  beat(t) {
    const B = this.bus.bed, p = 0.5 + 0.5 * this.prod; this.step++;
    this.tone(t, 0.13, 80, 38, 0.46 * p, "sine", B); this.noise(t, 0.06, "lowpass", 520, 0.7, 0.3 * p, B);
    if (this.step % 2 === 0) { [[820, 0.12], [1370, 0.09], [2210, 0.06]].forEach(([f, dd]) => this.tone(t + 0.012, dd, f * (0.97 + Math.random() * 0.06), f * 0.96, 0.05 * p, "sine", B)); this.noise(t + 0.01, 0.05, "bandpass", 1900, 1.4, 0.12 * p, B); }
    if (this.step % 5 === 0) this.noise(t + 0.05, 0.3, "highpass", 5200, 0.5, 0.085 * p, B);
    if (Math.random() < 0.55) { const n = 3 + Math.floor(Math.random() * 4); for (let i = 0; i < n; i++) this.noise(t + 0.09 + i * 0.058, 0.012, "bandpass", 2600 + Math.random() * 900, 2, 0.06 * p, B); }
  },

  strike(t, vel, mat) {
    const r = () => 0.86 + Math.random() * 0.28;
    const f0 = (mat === "mech" ? 120 : mat === "hand" ? 250 : mat === "crt" ? 165 : 150) * r();
    this.tone(t, 0.075, f0 * 1.7, f0 * 0.5, 0.62 * vel, "sine");
    this.noise(t, 0.032, "bandpass", (mat === "hand" ? 2600 : 1700) * r(), 1.1, 0.5 * vel);
    this.noise(t, 0.007, "highpass", 4200, 0.7, 0.42 * vel);
    if (mat === "mech") this.tone(t + 0.004, 0.05, 2300 * r(), 2100, 0.05 * vel, "triangle");
    this.noise(t + 0.062 + Math.random() * 0.02, 0.012, "highpass", 3400, 0.8, 0.14 * vel);
  },

  receipt(t, full) {
    const R = this.bus.receipt, lines = full ? 4 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 2), g = full ? 1 : 0.6;
    for (let i = 0; i < lines; i++) {
      const x = t + i * 0.12; for (let j = 0; j < 4; j++) this.noise(x + j * 0.02, 0.014, "bandpass", 2700 + Math.random() * 600, 2.2, 0.2 * g, R);
      this.tone(x, 0.05, 170, 90, 0.12 * g, "sine", R);
    }
    const f = t + lines * 0.12 + 0.03; for (let i = 0; i < 6; i++) this.noise(f + i * 0.04, 0.02, "bandpass", 3300, 3, 0.1 * g, R);
    if (full) { this.tone(f + 0.3, 0.5, 2650, 2600, 0.04, "sine", R); this.noise(f + 0.55, 0.12, "highpass", 4200, 0.8, 0.09, R); }
  },

  type(mat, nKeys, hasPaper, ex) { if (!this.ready()) return; this.typeAt(this.ctx.currentTime + 0.005, mat, nKeys, hasPaper, ex); },
  typeAt(t0, mat, nKeys, hasPaper, ex) {
    ex = ex || {}; this.lastTypeAt = t0; this.setProduction(0.3 + (ex.len || 1) * 0.045);
    this.tone(t0, 0.16, 85, 38, 0.55, "sine"); this.noise(t0, 0.05, "lowpass", 600, 0.7, 0.35);
    const hits = nKeys ? clamp(Math.round(nKeys / 3.2), 4, 26) : 0; let t = t0 + 0.14;
    for (let i = 0; i < hits; i++) { this.strike(t, 0.55 + Math.random() * 0.6, mat); t += (0.62 / hits) * (0.45 + Math.random() * 1.1) * (Math.random() < 0.28 ? 0.4 : 1); }
    if (ex.receipt) this.receipt(t0 + 0.34, !!hasPaper);
  },

  setOn(on) { if (!this.ctx) return; this.master.gain.setTargetAtTime(on ? 1.15 : 0, this.ctx.currentTime, 0.08); if (on && this.ctx.state === "suspended") this.ctx.resume(); this.bedLevel(); },
  xray(on) {
    if (!this.ready()) return; const c = this.ctx, t = c.currentTime;
    this.mf.frequency.setTargetAtTime(on ? 2600 : 20000, t, 0.12);
    this.scan.g.gain.setTargetAtTime(on ? 0.05 : 0, t, 0.25);
    const o = c.createOscillator(), g = c.createGain(); o.type = "sawtooth"; o.frequency.setValueAtTime(on ? 180 : 2400, t); o.frequency.exponentialRampToValueAtTime(on ? 2400 : 180, t + 0.5);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.05, t + 0.1); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55); o.connect(g); g.connect(this.bus.bed); o.start(t); o.stop(t + 0.6);
    this.tone(t + 0.5, 0.07, 1850, 1850, 0.05, "square", this.bus.bed);
  }
};

/* ── key element: one key cut from a donor atlas, fitted into a box ── */
function keyEl(c, i, cx, cy, boxW, boxH, rot) {
  const k = c.keys[i], S0 = bodyW(c) / c.bw;
  const f = Math.min(boxW / (k[6] * S0), boxH / (k[7] * S0)) * 0.97;
  const S = S0 * f, w = k[6] * S, h = k[7] * S;
  const el = document.createElement("div"); el.className = "key"; el.dataset.n = c.n;
  el.style.width = w + "px"; el.style.height = h + "px";
  el.style.backgroundImage = `url(${keySrc(c.n)})`;
  el.style.backgroundSize = `${c.at[0] * S}px ${c.at[1] * S}px`;
  el.style.backgroundPosition = `${-k[4] * S}px ${-k[5] * S}px`;
  el.style.left = cx - w / 2 + "px"; el.style.top = cy - h / 2 + "px";
  if (rot) el.style.rotate = rot + "deg";
  return el;
}

const relPos = (c, i) => { const k = c.keys[i]; return [(k[0] + k[2] / 2 - (c.cx - c.cw / 2)) / (c.cw || 1), (k[1] + k[3] / 2 - (c.cy - c.ch / 2)) / (c.ch || 1)]; };

function matchKeys(A, B) {
  const all = [];
  for (let a = 0; a < A.length; a++) for (let b = 0; b < B.length; b++) { const dx = A[a][0] - B[b][0], dy = A[a][1] - B[b][1]; all.push([dx * dx + dy * dy, a, b]); }
  all.sort((p, q) => p[0] - q[0]);
  const ua = new Set(), ub = new Set(), out = [], lim = Math.min(A.length, B.length);
  for (const [, a, b] of all) { if (ua.has(a) || ub.has(b)) continue; ua.add(a); ub.add(b); out.push([a, b]); if (out.length >= lim) break; }
  return out;
}

/* ── uncertain years: every date the archive is not sure about reads with "?" ── */
function yearOf(y) {
  y = String(y || "");
  let m = y.match(/^c\s?(\d{4})$/i); if (m) return m[1] + "?";
  m = y.match(/(\d{3})\ds/); if (m) return m[1] + "?";
  if (/^\d{4}$/.test(y)) return y;
  if (/\d{3}\?/.test(y)) return y;
  return "?";
}
const brandOf = (name) => name.split(" ")[0];
const modelOf = (name) => name.split(" ").slice(1).pop() || name;

/* ── layout: the genealogy line, and where it breaks ──
   VOID letters leave a gap in the line.
   EXCESS letters climb onto the previous body and lift the line.
   Everything else sits back on the baseline.                      */
function geometry(comp) {
  const b = C[comp.bodyN];
  comp.W = bodyW(b); comp.H = bodyH(b);
  if (comp.fake) {
    const k = C[comp.keysN], WB = comp.H * k.bw / k.bh;
    comp.cutA = 0.5 * comp.W; comp.cutB = 0.5 * WB; comp.WB = WB;
    comp.W = comp.cutA + (WB - comp.cutB);
  }
}
function place(c, prev) {
  const t = TIER_OF[c.letter];
  if (!prev) { c.cx = 0; c.top = -c.H; }
  else if (t === 0) { c.cx = prev.cx + (prev.W + c.W) / 2 + c.W * 0.22; c.top = -c.H; }
  else if (t === 4) { c.cx = prev.cx + ((prev.W + c.W) / 2) * 0.5; c.top = prev.top + prev.H * 0.38 - c.H; }
  else { c.cx = prev.cx + ((prev.W + c.W) / 2) * (1 - OVERLAP); c.top = -c.H; }
  c.left = c.cx - c.W / 2;
}

function bodyImage(n) { const im = new Image(); im.className = "body"; im.draggable = false; im.dataset.n = n; im.src = bodySrc(n); return im; }

function buildBody(comp) {
  const b = C[comp.bodyN], k = C[comp.keysN];
  const el = document.createElement("div"); el.className = "slot" + (comp.fake ? " fake" : "");
  Object.assign(el.style, { left: comp.left + "px", top: comp.top + "px", width: comp.W + "px", height: comp.H + "px" });
  const bw = document.createElement("div"); bw.className = "body-wrap"; el.appendChild(bw);
  const W = comp.W, H = comp.H;
  const toSlot = (q, w, h, dx) => ({ cx: (q[0] + q[2] / 2) * w + dx, cy: (q[1] + q[3] / 2) * h, w: q[2] * w, h: q[3] * h });

  if (!comp.fake) {
    const bi = bodyImage(b.n); bi.style.width = "100%"; bi.style.height = "100%"; bw.appendChild(bi);
    comp.slots = (b.keys || []).map((q) => toSlot(q, W, H, 0));
  } else {
    /* a calculator that never existed: left half of the body, right half of the key donor */
    const WA = bodyW(b), dxB = comp.cutA - comp.cutB;
    const a = bodyImage(b.n); Object.assign(a.style, { position: "absolute", left: 0, top: 0, width: WA + "px", height: H + "px", clipPath: `inset(0 ${WA - comp.cutA}px 0 0)` });
    const z = bodyImage(k.n); Object.assign(z.style, { position: "absolute", left: dxB + "px", top: 0, width: comp.WB + "px", height: H + "px", clipPath: `inset(0 0 0 ${comp.cutB}px)` });
    bw.append(a, z);
    comp.slots = [
      ...(b.keys || []).map((q) => toSlot(q, WA, H, 0)).filter((s) => s.cx < comp.cutA),
      ...(k.keys || []).map((q) => toSlot(q, comp.WB, H, dxB)).filter((s) => s.cx >= comp.cutA),
    ];
  }

  let paper = null;
  if (b.print || k.print) {
    paper = document.createElement("div"); paper.className = "paper";
    const pw = clamp(W * 0.2, 46, 130), ph = H * 0.34;
    Object.assign(paper.style, { width: pw + "px", height: ph + "px", left: W / 2 - pw / 2 + "px", top: -ph + 8 + "px", fontSize: clamp(pw * 0.11, 6, 11) + "px" });
    el.appendChild(paper);
  }
  Object.assign(comp, { el, bodyWrap: bw, paper });
  lineEl.appendChild(el);
}

/* receipt tape: prints the running calculation of everything typed so far */
function printTape(comp) {
  if (!comp.paper) return;
  const rows = []; let sum = 0;
  comps.forEach((c) => {
    if (c.letter === "=") rows.push(["=", String(sum)]);
    else { sum += c.items.length; rows.push([c.letter, "+" + c.items.length]); }
  });
  comp.paper.innerHTML = "";
  const body = document.createElement("div"); body.className = "tape";
  rows.slice(-14).forEach(([a, v]) => { const r = document.createElement("div"); r.className = "row" + (a === "=" ? " total" : ""); r.innerHTML = `<span></span><span></span>`; r.children[0].textContent = a; r.children[1].textContent = v; body.appendChild(r); });
  comp.paper.appendChild(body);
}

/* the most recent composite that still holds keys (VOID letters pass the lineage through) */
function lineageDonor() {
  for (let i = comps.length - 1; i >= 0; i--) if (comps[i].items.some((it) => !it.gone)) return comps[i];
  return null;
}

function addComposite(L, animate) {
  const pair = PAIR[L], tier = TIERS[TIER_OF[L]];
  const prevInLine = comps[comps.length - 1] || null;
  const donor = lineageDonor();
  /* a letter typed twice in a row is copied wrong: the machine imagines a calculator that never existed */
  const fake = !!prevInLine && prevInLine.letter === L && !prevInLine.fake;
  const comp = { letter: L, pair, tier, fake, bodyN: pair.body, keysN: pair.keys, idx: comps.length, items: [], grafted: 0, graftFrom: null };
  if (fake) { const b = C[pair.body], k = C[pair.keys]; comp.fakeName = `${brandOf(b.name)} ${modelOf(k.name)}`; comp.fakeYear = yearOf(b.year).slice(0, 3) + "?"; }
  geometry(comp); place(comp, prevInLine); buildBody(comp); comps.push(comp);

  const r = rng(hash(typed + "|" + comp.idx));
  const S = comp.slots.length, own = C[pair.keys];
  const N = tier.dose === 0 || !S ? 0 : Math.min(MAX_KEYS, Math.max(1, Math.round(S * tier.dose)));

  /* sources: grafted keys from the lineage + the letter's own donor keys (cycled when exhausted) */
  const src = [], taken = [];
  if (N && donor && !NO_GRAFT.has(L)) {
    const alive = shuffle(donor.items.filter((it) => !it.gone), r);
    const g = Math.min(alive.length, Math.round(N * DONATE));
    for (const it of alive.slice(0, g)) { src.push({ n: it.n, i: it.i, grafted: true }); taken.push(it); }
    comp.grafted = g; comp.graftFrom = g ? donor.letter : null;
  }
  const ownIdx = own.keys.map((_, i) => i);
  while (src.length < N && ownIdx.length) for (const i of shuffle(ownIdx.slice(), r)) { if (src.length >= N) break; src.push({ n: own.n, i, grafted: false }); }
  shuffle(src, r);

  /* layer 0: into the sockets, each key goes to the socket nearest its original position */
  const first = src.slice(0, Math.min(S, src.length));
  const xs = comp.slots.map((s) => s.cx), ys = comp.slots.map((s) => s.cy);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const slotRel = comp.slots.map((s) => [(s.cx - x0) / (x1 - x0 || 1), (s.cy - y0) / (y1 - y0 || 1)]);
  const pairs = matchKeys(first.map((s) => relPos(C[s.n], s.i)), slotRel);
  const placed = [];
  pairs.forEach(([a, j]) => { const s = first[a], sl = comp.slots[j]; placed.push({ s, cx: sl.cx, cy: sl.cy, w: sl.w, h: sl.h, layer: 0, rot: 0 }); });

  /* overflow: the keypad grid keeps growing.
     Keys beyond the socket count go onto the same grid pitch as the keypad —
     first into the gaps inside the keypad, then ring by ring outward over the body,
     and only when the body is full do they grow past its edge. No tilting, no scatter. */
  const rest = src.slice(first.length);
  if (rest.length && S) {
    const med = (a) => { const b = a.slice().sort((x, y) => x - y); return b[Math.floor(b.length / 2)] || 0; };
    const sw = med(comp.slots.map((s) => s.w)), sh = med(comp.slots.map((s) => s.h));
    const nn = (axis) => med(comp.slots.map((a) => {
      let best = Infinity;
      for (const b of comp.slots) {
        if (a === b) continue;
        const d = axis === "x" ? b.cx - a.cx : b.cy - a.cy, off = axis === "x" ? Math.abs(b.cy - a.cy) : Math.abs(b.cx - a.cx);
        if (d > 0 && off < (axis === "x" ? a.h : a.w) * 0.5) best = Math.min(best, d);
      }
      return best;
    }).filter(isFinite));
    const px = clamp(nn("x") || sw * 1.2, sw * 1.02, sw * 2.2), py = clamp(nn("y") || sh * 1.2, sh * 1.02, sh * 2.2);
    const bw = Math.min(sw, px * 0.94), bh = Math.min(sh, py * 0.94);
    const nx = Math.round((x1 - x0) / px), ny = Math.round((y1 - y0) / py);
    const occupied = (x, y) => comp.slots.some((s) => Math.abs(s.cx - x) < (px + s.w) * 0.42 && Math.abs(s.cy - y) < (py + s.h) * 0.42);
    const inside = (x, y) => x - bw / 2 >= 0 && x + bw / 2 <= comp.W && y - bh / 2 >= 0 && y + bh / 2 <= comp.H;
    const cells = [], seen = new Set();
    const ccx = (x0 + x1) / 2, ccy = (y0 + y1) / 2;
    const maxRing = 40;
    for (let ring = 0; ring <= maxRing && cells.length < rest.length * 3; ring++) {
      for (let j = -ring; j <= ny + ring; j++) for (let i = -ring; i <= nx + ring; i++) {
        const onRing = ring === 0 || i === -ring || i === nx + ring || j === -ring || j === ny + ring;
        const id = i + ":" + j; if (!onRing || seen.has(id)) continue; seen.add(id);
        const x = x0 + i * px, y = y0 + j * py;
        if (occupied(x, y)) continue;
        cells.push({ x, y, ring, inBody: inside(x, y), d: Math.hypot((x - ccx) / px, (y - ccy) / py) });
      }
    }
    /* inside the body first, nearest to the keypad first; outside the body only afterwards */
    cells.sort((a, b) => (b.inBody - a.inBody) || a.ring - b.ring || a.d - b.d);
    rest.forEach((s, m) => {
      const c = cells[m]; if (!c) return;
      placed.push({ s, cx: c.x, cy: c.y, w: bw, h: bh, layer: 1, rot: 0 });
    });
  }
  placed.sort((p, q) => p.layer - q.layer || p.cy - q.cy || p.cx - q.cx);
  placed.forEach((p, rank) => {
    const e = keyEl(C[p.s.n], p.s.i, p.cx, p.cy, p.w, p.h, p.rot);
    e.style.zIndex = 3 + p.layer; if (p.s.grafted) e.classList.add("grafted");
    comp.el.appendChild(e);
    comp.items.push({ n: p.s.n, i: p.s.i, el: e, gone: false, layer: p.layer, rank });
  });

  /* grafted keys leave their old sockets */
  taken.forEach((it, x) => {
    it.gone = true;
    if (animate) setTimeout(() => { if (it.gone) it.el.style.display = "none"; }, 120 + x * 18); else it.el.style.display = "none";
  });

  printTape(comp);
  if (animate) animateIn(comp);
  return comp;
}

/* mechanical motion: stepped drop, keys appear one by one — no fades, no blur, no bounce */
function animateIn(comp) {
  const n = comp.items.length;
  comp.bodyWrap.animate([{ transform: "translateY(-28px)" }, { transform: "translateY(0)" }], { duration: 220, easing: "steps(4, end)" });
  const span = Math.min(1100, 260 + n * 9);
  comp.items.forEach((it) => {
    it.el.animate([{ visibility: "hidden" }, { visibility: "hidden" }], { duration: 1, delay: 180 + (it.rank / Math.max(n, 1)) * span, fill: "backwards" });
  });
  if (comp.paper) comp.paper.animate([{ clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 760, delay: 300, easing: "steps(9,end)", fill: "backwards" });
  try { Snd.type(C[comp.bodyN].mat, n, !!comp.paper, { receipt: !!comp.paper, len: typed.length }); }
  catch (err) { console.warn(err); }
}

function refreshAges(logShed) {
  const n = comps.length, notes = [];
  comps.forEach((c, i) => {
    const age = n - 1 - i, sTape = age >= SHED.tape, sBody = age >= SHED.body;
    c.el.style.display = age >= HIDE_AFTER ? "none" : "";
    c.el.classList.toggle("shed-tape", sTape); c.el.classList.toggle("shed-body", sBody);
    if (logShed) [["tape", sTape && c.paper, ko("receipt", "영수증")], ["body", sBody, ko("body", "몸체")]].forEach(([key, cond, name]) => {
      const id = `${i}:${key}:${c.letter}`;
      if (cond && !shedLogged.has(id)) { shedLogged.add(id); notes.push(ko(`${c.letter} lost its ${name}`, `${c.letter} ${name} 탈락`)); }
    });
  });
  if (logShed) shedNote = notes.join(" · ");
}

function camera(instant) {
  const last = comps[comps.length - 1]; world.classList.toggle("no-ease", !!instant);
  const ax = last ? last.left + last.W * 0.5 : 0;
  const ay = last ? last.top + last.H * 0.5 : -viewH() * 0.2;
  const fit = last ? Math.min(1, (viewH() * 0.7) / Math.max(last.H, 1), (innerWidth * 0.9) / Math.max(last.W, 1)) : 1;
  const z = Math.min(zoom, fit);
  world.style.transform = `translate(${innerWidth * 0.5 - z * ax + panX}px, ${viewH() * 0.52 - z * ay + panY}px) scale(${z})`;
}

function updateUI() {
  typedEl.textContent = typed; capture.value = typed; capture.setSelectionRange(typed.length, typed.length);
  const c = comps[comps.length - 1];
  if (!c) {
    info1.textContent = ko("TYPE A–Z · + =", "A–Z · + = 를 입력하세요");
    info2.textContent = ko("56 calculators, some of them unconfirmed · 194? → 1980", "계산기 56대, 일부는 확인되지 않음 · 194? → 1980");
    info3.textContent = ko("Frequent letters wear their keys off. Rare letters pile them up.", "자주 쓰는 글자는 버튼이 닳아 없어지고, 드문 글자는 버튼이 쌓입니다.");
    return;
  }
  const b = C[c.bodyN], k = C[c.keysN], t = c.tier, n = c.items.length, s = c.slots.length;
  info1.textContent = `${c.letter} — ${ko(t.en, t.ko)} ×${t.dose}`;
  /* the imagined calculator is captioned exactly like the real ones */
  info2.textContent = c.fake
    ? ko(`${c.fakeName} (${c.fakeYear})`, `${c.fakeName} (${c.fakeYear})`)
    : ko(`body ${b.name} (${yearOf(b.year)}) × keys ${k.name} (${yearOf(k.year)})`, `몸체 ${b.name} (${yearOf(b.year)}) × 버튼 ${k.name} (${yearOf(k.year)})`);
  let line = ko(`${n} keys / ${s} sockets`, `버튼 ${n}개 / 소켓 ${s}개`);
  if (c.grafted) line += " · " + ko(`${c.grafted} grafted from ${c.graftFrom}`, `${c.graftFrom}에서 접목 ${c.grafted}개`);
  if (shedNote) line += " · " + shedNote;
  info3.textContent = line;
}

function typeChar(ch) {
  const L = ch.toUpperCase(); if (!PAIR[L]) return;
  const before = comps.length; typed += L; panX = panY = 0;
  try { addComposite(L, true); refreshAges(true); camera(false); updateUI(); }
  catch (err) {
    console.error(err);
    while (comps.length > before) { const c = comps.pop(); if (c.el) c.el.remove(); }
    typed = typed.slice(0, -1); try { updateUI(); } catch (e2) {}
  }
}
function rebuildAll() {
  lineEl.innerHTML = ""; comps = []; shedLogged.clear(); shedNote = "";
  const s = typed; typed = "";
  for (const ch of s) { typed += ch; try { addComposite(ch, false); } catch (err) { console.error(err); typed = typed.slice(0, -1); } }
  refreshAges(false); camera(true); updateUI();
}
function backspace() { if (!typed) return; typed = typed.slice(0, -1); rebuildAll(); }
function clearAll() { typed = ""; panX = panY = 0; zoom = 1; rebuildAll(); }

capture.addEventListener("keydown", (e) => {
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Backspace") { e.preventDefault(); backspace(); return; }
  if (e.key.length === 1 && PAIR[e.key.toUpperCase()]) { e.preventDefault(); typeChar(e.key); }
});
capture.addEventListener("input", () => { capture.value = typed; });
document.body.addEventListener("click", () => capture.focus());

/* pan & zoom — both modes */
let drag = null;
const fingers = new Set();
view.addEventListener("pointerdown", (e) => { fingers.add(e.pointerId); if (fingers.size > 1) { drag = null; return; } drag = { x: e.clientX, y: e.clientY, px: panX, py: panY }; view.classList.add("dragging"); view.setPointerCapture(e.pointerId); capture.focus(); });
view.addEventListener("pointermove", (e) => { if (!drag) return; panX = drag.px + e.clientX - drag.x; panY = drag.py + e.clientY - drag.y; camera(true); });
const endDrag = (e) => { if (e && e.pointerId !== undefined) fingers.delete(e.pointerId); drag = null; view.classList.remove("dragging"); };
view.addEventListener("pointerup", endDrag); view.addEventListener("pointercancel", endDrag);
let pinch = null;
const spread = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
view.addEventListener("touchstart", (e) => { if (e.touches.length === 2) pinch = { d: spread(e.touches), z: zoom }; }, { passive: true });
view.addEventListener("touchmove", (e) => { if (pinch && e.touches.length === 2) { zoom = clamp(pinch.z * (spread(e.touches) / pinch.d), 0.3, 2.6); camera(true); } }, { passive: true });
view.addEventListener("touchend", (e) => { if (e.touches.length < 2) pinch = null; });
view.addEventListener("wheel", (e) => { e.preventDefault(); zoom = clamp(zoom * Math.exp(-e.deltaY * 0.0012), 0.3, 2.6); camera(true); }, { passive: false });

/* X-ray: same layout, same keys — only the images are swapped */
function setXray(on) {
  xray = on; document.body.classList.toggle("xray", on); $("xray-btn").setAttribute("aria-pressed", on);
  document.querySelectorAll("img.body").forEach((im) => (im.src = bodySrc(im.dataset.n)));
  document.querySelectorAll(".key").forEach((k) => (k.style.backgroundImage = `url(${keySrc(k.dataset.n)})`));
  try { Snd.xray(on); } catch (err) { console.warn(err); }
}
$("xray-btn").addEventListener("click", (e) => { e.stopPropagation(); setXray(!xray); capture.focus(); });
$("sound-btn").addEventListener("click", (e) => { e.stopPropagation(); soundOn = !soundOn; e.currentTarget.setAttribute("aria-pressed", soundOn); try { Snd.setOn(soundOn); } catch (err) { console.warn(err); } capture.focus(); });
$("clear-btn").addEventListener("click", (e) => { e.stopPropagation(); clearAll(); capture.focus(); });
addEventListener("resize", () => rebuildAll());

/* EN / KR */
function applyLang() {
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-ko]").forEach((el) => {
    if (el.dataset.en === undefined) el.dataset.en = el.textContent;
    el.textContent = LANG === "ko" ? el.dataset.ko : el.dataset.en;
  });
  document.querySelectorAll("[data-ko-label]").forEach((el) => {
    if (el.dataset.enLabel === undefined) el.dataset.enLabel = el.getAttribute("aria-label") || "";
    el.setAttribute("aria-label", LANG === "ko" ? el.dataset.koLabel : el.dataset.enLabel);
  });
  const lb = $("lang-btn");
  lb.textContent = LANG === "ko" ? "EN" : "KR";
  lb.setAttribute("aria-label", LANG === "ko" ? "Switch to English" : "한국어로 보기");
  updateUI();
}
$("lang-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  LANG = LANG === "ko" ? "en" : "ko";
  try { localStorage.setItem("calc-lang", LANG); } catch (err) {}
  applyLang();
  capture.focus();
});

["touchend", "click", "keydown"].forEach((ev) => addEventListener(ev, () => {
  try { if (navigator.audioSession && navigator.audioSession.type !== "playback") navigator.audioSession.type = "playback"; } catch (e) {}
  if (soundOn && Snd.ctx && Snd.ctx.state !== "running" && Snd.ctx.state !== "closed") Snd.ctx.resume();
}, { passive: true, capture: true }));
document.addEventListener("keydown", (e) => { if (e.key === "Tab") { e.preventDefault(); setXray(!xray); } });

D.calcs.forEach((c, i) => setTimeout(() => { new Image().src = `images/${pad(c.n)}.webp`; new Image().src = `keys/${pad(c.n)}.webp`; }, i * 40));
setTimeout(() => D.calcs.forEach((c, i) => setTimeout(() => { new Image().src = `xray/${pad(c.n)}.webp`; new Image().src = `keys_xray/${pad(c.n)}.webp`; }, i * 70)), 3000);
camera(true); applyLang();
requestAnimationFrame(() => setTimeout(() => { $("intro-veil").classList.add("hide"); setTimeout(() => $("intro-veil").remove(), 1400); }, 200));
capture.focus();
})();