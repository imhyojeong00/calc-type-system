(() => {
const D = window.CALC_DATA, ADJ = window.SIZE_ADJUST || {};
const C = {}; D.calcs.forEach((c) => (C[c.n] = c));
const PAIR = {}; D.pairs.forEach((p) => (PAIR[p.letter] = p));

const OVERLAP = 0.24;
const DONATE = 0.42;
const SHED = { tape: 3, keys: Infinity, body: 9 };
const MAT = { mech: { lift: 34, dip: 10, ms: 640 }, nixie: { lift: 24, dip: 5, ms: 430 }, crt: { lift: 18, dip: 4, ms: 380 }, hand: { lift: 12, dip: 2, ms: 260 } };

const $ = (id) => document.getElementById(id);
const lineEl = $("line"), world = $("world"), view = $("main-view");
const typedEl = $("typed-display"), capture = $("key-capture");
const info1 = $("info-1"), info2 = $("info-2"), info3 = $("info-3");

let typed = "", comps = [], zoom = 1, panX = 0, panY = 0, xray = false, soundOn = true, receiptOn = true;
let LANG = (() => { try { return localStorage.getItem("calc-lang") === "ko" ? "ko" : "en"; } catch (e) { return "en"; } })();
const ko = (en, k) => (LANG === "ko" ? k : en);
const shedLogged = new Set();

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
    const hits = clamp(Math.round(nKeys / 3.2), 7, 20); let t = t0 + 0.14;
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

function keyEl(c, i, cls, cx, cy, boxW, boxH) {
  const k = c.keys[i], S0 = bodyW(c) / c.bw;
  const f = Math.min(boxW / (k[6] * S0), boxH / (k[7] * S0)) * 0.97;
  const S = S0 * f, w = k[6] * S, h = k[7] * S;
  const el = document.createElement("div"); el.className = "key " + cls; el.dataset.n = c.n;
  el.style.width = w + "px"; el.style.height = h + "px";
  el.style.backgroundImage = `url(${keySrc(c.n)})`;
  el.style.backgroundSize = `${c.at[0] * S}px ${c.at[1] * S}px`;
  el.style.backgroundPosition = `${-k[4] * S}px ${-k[5] * S}px`;
  el.style.left = cx - w / 2 + "px"; el.style.top = cy - h / 2 + "px";
  el._i = i; el._cx = cx; el._cy = cy;
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

function geometry(comp) {
  const b = C[comp.bodyN];
  comp.W = bodyW(b); comp.H = bodyH(b);
  comp.A = { x: b.cx * comp.W, y: b.cy * comp.H };
}

function panelZoom() {
  let mw = 1, mh = 1;
  new Set(D.pairs.map((p) => p.body)).forEach((n) => { const b = C[n]; mw = Math.max(mw, bodyW(b)); mh = Math.max(mh, bodyH(b)); });
  return Math.min(1, (innerWidth * 0.82) / mw, (viewH() * 0.80) / mh);
}
function place(c, prev) {
  if (xray) {
    c.cx = prev ? prev.cx + ((prev.W + c.W) / 2) * (1 - OVERLAP) : 0;
    c.left = c.cx - c.W / 2; c.top = -c.H;
  } else {
    const z = panelZoom(), PW = innerWidth / z, PH = viewH() / z;
    const ang = c.idx * 2.399963, rad = (1 - Math.exp(-c.idx / 6)) * PW * 0.07;
    let left = Math.cos(ang) * rad - c.A.x, top = Math.sin(ang) * rad * 0.75 - c.A.y;
    left = clamp(left, -PW / 2 + PW * 0.04, PW / 2 - PW * 0.04 - c.W);
    top = clamp(top, -PH / 2 + PH * 0.05, PH / 2 - PH * 0.07 - c.H);
    c.left = left; c.top = top; c.cx = left + c.W / 2;
  }
  c.line = 0; c.anchor = { x: c.left + c.A.x, y: c.top + c.A.y };
}
function relayoutAll(glide) {
  comps.forEach((c, i) => {
    place(c, comps[i - 1]);
    if (c.el) { c.el.style.transition = glide ? "left .7s cubic-bezier(.2,.8,.2,1), top .7s cubic-bezier(.2,.8,.2,1)" : "none"; c.el.style.left = c.left + "px"; c.el.style.top = c.top + "px"; }
  });
}

function buildSlot(comp) {
  const b = C[comp.bodyN], k = C[comp.keysN];
  const el = document.createElement("div"); el.className = "slot";
  Object.assign(el.style, { left: comp.left + "px", top: comp.top + "px", width: comp.W + "px", height: comp.H + "px" });
  const bw = document.createElement("div"); bw.className = "body-wrap";
  const bi = new Image(); bi.className = "body"; bi.draggable = false; bi.dataset.n = b.n; bi.src = bodySrc(b.n); bw.appendChild(bi); el.appendChild(bw);

  const bk = b.keys || [], W = comp.W, H = comp.H;
  comp.slots = bk.map((q) => ({ cx: (q[0] + q[2] / 2) * W, cy: (q[1] + q[3] / 2) * H, w: q[2] * W, h: q[3] * H }));
  comp.slotEl = new Array(comp.slots.length).fill(null);
  comp.native = [];
  const kk = k.keys || [];
  const pairs = matchKeys(kk.map((_, i) => relPos(k, i)), bk.map((_, j) => relPos(b, j)));
  pairs.sort((p, q) => comp.slots[p[1]].cy - comp.slots[q[1]].cy || comp.slots[p[1]].cx - comp.slots[q[1]].cx);
  pairs.forEach(([i, j], rank) => {
    const sl = comp.slots[j], e = keyEl(k, i, "native", sl.cx, sl.cy, sl.w, sl.h);
    e._rank = rank; e._donor = i; e._slot = j; comp.native[i] = e; comp.slotEl[j] = e; el.appendChild(e);
  });

  let paper = null;
  if (b.print || k.print) {
    paper = document.createElement("div"); paper.className = "paper";
    const pw = clamp(comp.W * 0.2, 46, 130), ph = comp.H * 0.34;
    Object.assign(paper.style, { width: pw + "px", height: ph + "px", left: comp.W / 2 - pw / 2 + "px", top: -ph + 8 + "px" });
    el.appendChild(paper);
  }
  Object.assign(comp, { el, bodyImg: bi, paper, visitors: [] });
  lineEl.appendChild(el);
}

function transfer(prev, comp, animate) {
  const pk = C[prev.keysN], b = C[comp.bodyN];
  const alive = prev.native.map((e, i) => (e && !prev.gone.has(i) ? i : -1)).filter((i) => i >= 0);
  const r = rng(hash(prev.letter + comp.letter + comps.length));
  const pool = alive.slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const count = clamp(Math.round(alive.length * DONATE), Math.min(2, alive.length), Math.max(1, alive.length - 1));
  const take = pool.slice(0, alive.length > 1 ? count : 0);
  comp.takenFrom = prev.letter; comp.takenN = prev.keysN; comp.takenCount = 0;
  if (!take.length || !comp.slots.length) return;
  const pairs = matchKeys(take.map((i) => relPos(pk, i)), comp.slots.map((_, j) => relPos(b, j)));
  pairs.sort((p, q) => comp.slots[p[1]].cy - comp.slots[q[1]].cy || comp.slots[p[1]].cx - comp.slots[q[1]].cx);
  pairs.forEach(([ti, j], rank) => {
    const i = take[ti], sl = comp.slots[j], e = keyEl(pk, i, "visitor", sl.cx, sl.cy, sl.w, sl.h), old = comp.slotEl[j];
    comp.slotEl[j] = e; comp.visitors.push(e); comp.takenCount++; comp.el.appendChild(e);
    if (old) comp.gone.add(old._donor);
    if (animate) {
      const d = 140 + rank * (24 + Math.random() * 10) + Math.random() * 50;
      e.animate([{ transform: "translateY(-36px) scale(1.15)", opacity: 0, filter: "blur(4px)" }, { transform: "translateY(2px) scale(1)", opacity: 1, filter: "blur(0)", offset: 0.72 }, { transform: "none", opacity: 1, filter: "blur(0)" }],
        { duration: 340, delay: d, easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" });
      if (old) { old.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, delay: d + 110, fill: "forwards" }); setTimeout(() => (old.style.display = "none"), d + 260); }
    } else if (old) old.style.display = "none";
  });
}

function addComposite(L, animate) {
  const pair = PAIR[L], prev = comps[comps.length - 1] || null;
  const comp = { letter: L, pair, bodyN: pair.body, keysN: pair.keys, gone: new Set(), prevLetter: prev ? prev.letter : null };
  comp.totalBefore = prev ? prevTotal(prev) : C[pair.keys].nk;
  comp.idx = comps.length; geometry(comp); place(comp, prev); comps.push(comp); buildSlot(comp);
  if (!prev) comp.totalBefore = total(comp);
  if (prev) transfer(prev, comp, animate);
  comp.total = total(comp);
  if (animate) animateIn(comp, prev);
  return comp;
}
const total = (c) => c.native.filter((e, i) => e && !c.gone.has(i)).length + c.visitors.length;
const prevTotal = (p) => total(p);

function animateIn(comp) {
  const m = MAT[C[comp.bodyN].mat] || MAT.nixie;
  comp.bodyImg.animate([{ transform: `translateY(${-m.lift}px)`, opacity: 0 }, { transform: `translateY(${m.dip}px)`, opacity: 1, offset: 0.62 }, { transform: "translateY(0)", opacity: 1 }], { duration: m.ms, easing: "cubic-bezier(.2,.8,.2,1)" });
  const nk = comp.native.filter(Boolean).length;
  comp.native.forEach((e) => { if (!e) return; e.animate([{ transform: "translateY(-16px)", opacity: 0, filter: "blur(3px)" }, { transform: "translateY(2px)", opacity: 1, filter: "blur(0)", offset: 0.72 }, { transform: "none", opacity: 1, filter: "blur(0)" }], { duration: 300, delay: m.ms * 0.45 + Math.min(520, e._rank * (520 / Math.max(nk, 1))), easing: "cubic-bezier(.2,.9,.3,1)", fill: "backwards" }); });
  if (comp.paper) comp.paper.animate([{ clipPath: "inset(100% 0 0 0)" }, { clipPath: "inset(0 0 0 0)" }], { duration: 760, delay: m.ms * 0.6, easing: "steps(9,end)", fill: "backwards" });
  try { Snd.type(C[comp.bodyN].mat, nk + comp.visitors.length, !!comp.paper, { receipt: receiptOn, len: typed.length }); }
  catch (err) { console.warn(err); }
}

let shedNote = "";
function refreshAges(logShed) {
  const n = comps.length, notes = [];
  comps.forEach((c, i) => {
    const age = n - 1 - i, sTape = age >= SHED.tape, sKeys = age >= SHED.keys, sBody = xray && age >= SHED.body;
    c.el.style.display = !xray && age >= 90 ? "none" : "";
    c.el.classList.toggle("shed-tape", sTape); c.el.classList.toggle("shed-keys", sKeys); c.el.classList.toggle("shed-body", sBody);
    c.native.forEach((e, ix) => { if (e && !c.gone.has(ix)) e.style.transitionDelay = sKeys ? (ix % 17) * 40 + "ms" : "0ms"; });
    if (logShed) [["tape", sTape && c.paper, ko("receipt", "영수증")], ["keys", sKeys, ko("keys left on the body", "몸통에 남은 버튼")], ["body", sBody, ko("body (only the grafted keys remain)", "몸통(삽수 버튼만 남음)")]].forEach(([key, cond, name]) => {
      const id = `${i}:${key}:${c.letter}`; if (cond && !shedLogged.has(id)) { shedLogged.add(id); notes.push(ko(`${c.letter} generation ${age}: ${name} shed`, `${c.letter} ${age}세대 ${name} 탈락`)); }
    });
  });
  shedNote = notes.join(" · ");
}

function camera(instant) {
  const last = comps[comps.length - 1]; world.classList.toggle("no-ease", !!instant);
  if (!xray) {
    const z = panelZoom() * zoom;
    world.style.transform = `translate(${innerWidth * 0.5 + panX}px, ${viewH() * 0.48 + panY}px) scale(${z})`;
    return;
  }

  const ax = last ? last.left + last.W * 0.5 : 0;
  const ay = last ? last.top + last.H * 0.5 : -viewH() * 0.2;
  const cxScreen = innerWidth * 0.5;
  const fit = last ? Math.min(1, (viewH() * 0.76) / Math.max(last.H, 1), (innerWidth * 0.92) / Math.max(last.W, 1)) : 1;
  const z = Math.min(zoom, fit);
  world.style.transform = `translate(${cxScreen - z * ax + panX}px, ${viewH() * 0.5 - z * ay + panY}px) scale(${z})`;
}

function updateUI() {
  typedEl.textContent = typed; capture.value = typed; capture.setSelectionRange(typed.length, typed.length);
  const c = comps[comps.length - 1];
  if (!c) { info1.textContent = ko("TYPE A–Z · + =", "A–Z · + = 입력"); info2.textContent = ko("56 calculators · 1949 → 1980", "계산기 56대 · 1949 → 1980"); info3.textContent = ""; return; }
  const b = C[c.bodyN], k = C[c.keysN], prev = comps[comps.length - 2];
  info1.textContent = `${b.name} × ${k.name}` + (c.visitors.length ? ` + ${C[c.takenN].name}` : "");
  info2.textContent = `${ko("Combined objects", "접목된 사물")} · ${b.year} · ${k.year}` + (prev ? ` · ${ko(`${c.visitors.length} grafted keys`, `접목된 버튼 ${c.visitors.length}개`)}` : "");
  info3.textContent = "";
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
function rebuildAll(keepTape) {
  lineEl.innerHTML = ""; comps = []; shedLogged.clear();
  const s = typed; typed = ""; for (const ch of s) { typed += ch; try { addComposite(ch, false); } catch (err) { console.error(err); typed = typed.slice(0, -1); } }
  refreshAges(false); shedNote = ""; camera(true); updateUI();
}
function backspace() { if (!typed) return; typed = typed.slice(0, -1); rebuildAll(false); }
function clearAll() { typed = ""; panX = panY = 0; rebuildAll(false); }

capture.addEventListener("keydown", (e) => {
  if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
  if (e.key === "Backspace") { e.preventDefault(); backspace(); return; }
  if (e.key.length === 1 && PAIR[e.key.toUpperCase()]) { e.preventDefault(); typeChar(e.key); }
});
capture.addEventListener("input", () => { capture.value = typed; });
document.body.addEventListener("click", () => capture.focus());

let drag = null;
const fingers = new Set();
view.addEventListener("pointerdown", (e) => { fingers.add(e.pointerId); if (fingers.size > 1) { drag = null; return; } if (!xray) { capture.focus(); return; } drag = { x: e.clientX, y: e.clientY, px: panX, py: panY }; view.classList.add("dragging"); view.setPointerCapture(e.pointerId); capture.focus(); });
view.addEventListener("pointermove", (e) => { if (!drag) return; panX = drag.px + e.clientX - drag.x; panY = drag.py + e.clientY - drag.y; camera(true); });
const endDrag = (e) => { if (e && e.pointerId !== undefined) fingers.delete(e.pointerId); drag = null; view.classList.remove("dragging"); };
view.addEventListener("pointerup", endDrag); view.addEventListener("pointercancel", endDrag);
let pinch = null;
const spread = (t) => Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY) || 1;
view.addEventListener("touchstart", (e) => { if (xray && e.touches.length === 2) pinch = { d: spread(e.touches), z: zoom }; }, { passive: true });
view.addEventListener("touchmove", (e) => { if (pinch && e.touches.length === 2) { zoom = clamp(pinch.z * (spread(e.touches) / pinch.d), 0.3, 2.6); camera(true); } }, { passive: true });
view.addEventListener("touchend", (e) => { if (e.touches.length < 2) pinch = null; });
view.addEventListener("wheel", (e) => { e.preventDefault(); if (!xray) return; zoom = clamp(zoom * Math.exp(-e.deltaY * 0.0012), 0.3, 2.6); camera(true); }, { passive: false });

function setXray(on) {
  xray = on; document.body.classList.toggle("xray", on); $("xray-btn").setAttribute("aria-pressed", on);
  document.querySelectorAll("img.body").forEach((im) => (im.src = bodySrc(im.dataset.n)));
  document.querySelectorAll(".key").forEach((k) => (k.style.backgroundImage = `url(${keySrc(k.dataset.n)})`));
  panX = panY = 0; zoom = 1; view.style.cursor = on ? "" : "default";
  relayoutAll(true); refreshAges(false); camera(false);
  try { Snd.xray(on); } catch (err) { console.warn(err); }
}
$("xray-btn").addEventListener("click", (e) => { e.stopPropagation(); setXray(!xray); capture.focus(); });
$("receipt-btn").addEventListener("click", (e) => {
  e.stopPropagation(); receiptOn = !receiptOn;
  document.body.classList.toggle("receipt-off", !receiptOn);
  e.currentTarget.setAttribute("aria-pressed", receiptOn);
  capture.focus();
});
$("sources-btn").addEventListener("click", (e) => { e.stopPropagation(); const on = !document.body.classList.contains("sources"); document.body.classList.toggle("sources", on); e.currentTarget.setAttribute("aria-pressed", on); setTimeout(() => rebuildAll(true), 30); capture.focus(); });
$("sound-btn").addEventListener("click", (e) => { e.stopPropagation(); soundOn = !soundOn; e.currentTarget.setAttribute("aria-pressed", soundOn); try { Snd.setOn(soundOn); } catch (err) { console.warn(err); } capture.focus(); });
$("clear-btn").addEventListener("click", (e) => { e.stopPropagation(); clearAll(); capture.focus(); });
addEventListener("resize", () => rebuildAll(true));

function applyLang() {
  document.documentElement.lang = LANG;
  document.querySelectorAll("[data-ko]").forEach((el) => {
    if (el.dataset.en === undefined) el.dataset.en = el.textContent;
    el.textContent = LANG === "ko" ? el.dataset.ko : el.dataset.en;
  });
  const lb = $("lang-btn");
  lb.textContent = LANG === "ko" ? "EN" : "KR";
  lb.setAttribute("aria-label", LANG === "ko" ? "English" : "한국어");
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

D.calcs.forEach((c, i) => setTimeout(() => { new Image().src = bodySrc(c.n); new Image().src = `keys/${pad(c.n)}.webp`; }, i * 40));
setTimeout(() => D.calcs.forEach((c, i) => setTimeout(() => { new Image().src = `xray/${pad(c.n)}.webp`; new Image().src = `keys_xray/${pad(c.n)}.webp`; }, i * 70)), 3000);
view.style.cursor = "default"; camera(true); applyLang();
requestAnimationFrame(() => setTimeout(() => { $("intro-veil").classList.add("hide"); setTimeout(() => $("intro-veil").remove(), 1400); }, 200));
capture.focus();
})();