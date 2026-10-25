(() => {
  'use strict';
  const IMG_W = 4128, IMG_H = 1024;
  const GOLD = '#D9A03C';
  const STORE_KEY = 'afanV4Records';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 手動描出 s2 中央泥土小路（原圖座標 4128x1024）
  const PATH_PTS = [
    [0, 805], [250, 795], [500, 782], [720, 772], [900, 790], [1100, 815], [1250, 834], [1600, 838],
    [1900, 835], [2040, 830], [2120, 790], [2190, 718], [2278, 666], [2366, 640], [2480, 608],
    [2593, 584], [2668, 562], [2770, 574], [2870, 600], [2971, 627], [3096, 682], [3297, 752],
    [3512, 804], [3700, 840], [3902, 853], [4128, 856]
  ];
  const STAGES = [
    { name: '入村', gateX: 1300 },
    { name: '棚田', gateX: 2930 },
    { name: '遠山', gateX: 3960 }
  ];
  // 作品點位放在 s2 的空白立牌上（只顯示立牌和作品編號）
  const POINTS = [
    { id: '01', stage: 0, sx: 848, sy: 660 },
    { id: '02', stage: 0, sx: 1143, sy: 550 },
    { id: '03', stage: 1, sx: 1392, sy: 700 },
    { id: '04', stage: 1, sx: 2656, sy: 468 },
    { id: '05', stage: 2, sx: 3590, sy: 728 }
  ];
  POINTS.forEach(p => { STAGES[p.stage].pts = (STAGES[p.stage].pts || []).concat(p.id); });

  const $ = id => document.getElementById(id);
  const canvas = $('scene'), ctx = canvas.getContext('2d');
  const stageEl = $('stage'), toastEl = $('toast');

  // ---------- 圖片 ----------
  const IMGS = {};
  const srcs = { far: 'scroll/far.webp', mid: 'scroll/mid.webp', near: 'scroll/near.webp', onigiri: 'sprites/onigiri.png', onigiriGold: 'sprites/onigiri_golden.png' };
  for (let i = 1; i <= 6; i++) srcs['walk' + i] = 'scroll/afan/walk_' + i + '.png';
  for (let i = 1; i <= 4; i++) srcs['act' + i] = 'scroll/afan/act_' + i + '.png';
  function loadAll() {
    return Promise.all(Object.entries(srcs).map(([k, s]) => new Promise(res => {
      const im = new Image(); im.onload = () => { IMGS[k] = im; res(); }; im.onerror = () => res(); im.src = s;
    })));
  }
  // 走路第 2、5 格比其他格矮約 6%，量出頂端透明列，畫的時候裁掉並放大，底部對齊
  const frameTop = {};
  function measureTops() {
    const c = document.createElement('canvas'), g = c.getContext('2d', { willReadFrequently: true });
    for (let i = 1; i <= 6; i++) {
      const im = IMGS['walk' + i]; if (!im) continue;
      c.width = im.width; c.height = im.height; g.clearRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data; let top = 0;
      outer: for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) if (d[(y * c.width + x) * 4 + 3] > 20) { top = y; break outer; }
      frameTop['walk' + i] = top;
    }
  }

  // ---------- 路徑 ----------
  const path = [];
  (function buildPath() {
    const P = PATH_PTS;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let t = 0; t < 1; t += 0.05) {
        const t2 = t * t, t3 = t2 * t;
        const f = (a, b, c, d) => 0.5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
        path.push({ x: f(p0[0], p1[0], p2[0], p3[0]), y: f(p0[1], p1[1], p2[1], p3[1]) });
      }
    }
    path.push({ x: P[P.length - 1][0], y: P[P.length - 1][1] });
    let s = 0; path[0].s = 0;
    for (let i = 1; i < path.length; i++) { s += Math.hypot(path[i].x - path[i - 1].x, path[i].y - path[i - 1].y); path[i].s = s; }
  })();
  const PATH_LEN = path[path.length - 1].s;
  function atS(s) {
    s = Math.max(0, Math.min(PATH_LEN, s));
    let lo = 0, hi = path.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path[m].s <= s) lo = m; else hi = m; }
    const a = path[lo], b = path[hi], t = (s - a.s) / Math.max(1e-6, b.s - a.s);
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, ang: Math.atan2(b.y - a.y, b.x - a.x) };
  }
  function sAtX(x) {
    let best = 0, bd = Infinity;
    for (const p of path) { const d = Math.abs(p.x - x); if (d < bd) { bd = d; best = p.s; } }
    return best;
  }
  POINTS.forEach(p => { p.s = sAtX(p.sx); });
  STAGES.forEach(g => { g.s = sAtX(g.gateX); g.open = false; g.openT = 0; });

  // ---------- 狀態 ----------
  let records = loadRecords();
  const st = {
    vw: 390, H: 700, k: 0.68, dpr: 1, camX: 0, follow: true,
    afanS: sAtX(140), targetS: null, targetPoint: null, maxS: 0, dir: 1,
    walkT: 0, frame: 1, fogX: 0, flash: 0, birds: [], busy: false,
    act: null, fly: null, bubble: 0, speed: 170
  };
  st.maxS = st.afanS;

  function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function loadRecords() {
    try { const r = JSON.parse(localStorage.getItem(STORE_KEY) || '[]'); return Array.isArray(r) ? r.filter(x => x && POINTS.some(p => p.id === x.id)).map(x => ({ id: x.id, date: x.date, size: x.size, type: x.type })) : []; } catch (e) { return []; }
  }
  function saveRecords() { try { localStorage.setItem(STORE_KEY, JSON.stringify(records)); } catch (e) { /* 無痕模式略過 */ } }
  const isDone = id => records.some(r => r.id === id);
  const stageCount = i => STAGES[i].pts.filter(isDone).length;
  const firstClosed = () => STAGES.findIndex(g => !g.open);
  function syncGatesFromRecords() { STAGES.forEach((g, i) => { g.open = stageCount(i) >= g.pts.length; g.openT = g.open ? 1 : 0; }); }
  syncGatesFromRecords();
  STAGES.forEach(g => { if (g.open) st.maxS = Math.max(st.maxS, g.s + 40); });

  let toastTimer = null;
  function toast(msg, ms = 3200) {
    toastEl.textContent = msg; toastEl.style.opacity = 1;
    clearTimeout(toastTimer); if (ms) toastTimer = setTimeout(() => { toastEl.style.opacity = 0; }, ms);
  }
  const sizeLabel = (size, type) => (type === 'golden' ? '黃金' : '') + ({ small: '小', medium: '中', large: '大' }[size] || '小') + '飯糰';

  function renderStages() {
    const fc = firstClosed();
    $('stages').innerHTML = STAGES.map((g, i) => {
      const n = stageCount(i), N = g.pts.length;
      const cls = g.open ? 'done' : i === fc ? 'current' : 'locked';
      return `<div class="st ${cls}"><div class="row"><span>${g.name}</span><span>${n}／${N}</span></div><div class="bar" style="width:${n / N * 100}%"></div></div>`;
    }).join('');
  }

  // ---------- 版面 ----------
  function resize() {
    const r = stageEl.getBoundingClientRect();
    st.vw = r.width; st.H = r.height; st.k = st.H / IMG_H; st.dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(st.vw * st.dpr); canvas.height = Math.round(st.H * st.dpr);
    clampCam();
  }
  const worldW = () => IMG_W * st.k;
  function clampCam() { st.camX = Math.max(0, Math.min(worldW() - st.vw, st.camX)); }

  // ---------- 行走 ----------
  function walkTo(s, point) {
    if (st.busy) return;
    const fc = firstClosed();
    let limit = PATH_LEN - 20;
    if (fc >= 0) limit = STAGES[fc].s - 30;
    if (s > limit) {
      s = limit; point = null;
      const left = STAGES[fc].pts.length - stageCount(fc);
      toast(`${STAGES[fc].name}的柵欄還關著，再收集 ${left} 顆飯糰就能通過`);
    }
    st.targetS = s; st.targetPoint = point || null; st.follow = true;
    if (point) toast(`往作品編號 ${point.id} 的立牌走過去`, 2000);
  }
  function arrive() {
    const p = st.targetPoint; st.targetS = null; st.targetPoint = null; st.frame = 1;
    if (!p) return;
    if (isDone(p.id)) { toast(`作品編號 ${p.id} 已經餵過了，阿飯吃得很飽`); return; }
    startHarvest(p);
  }

  // ---------- 主迴圈 ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt, now); draw(now);
    requestAnimationFrame(loop);
  }
  function update(dt, now) {
    const k = st.k;
    if (st.targetS != null && !st.busy) {
      const d = st.targetS - st.afanS, step = st.speed / k * dt;
      if (Math.abs(d) <= step) { st.afanS = st.targetS; arrive(); }
      else { st.afanS += Math.sign(d) * step; st.dir = Math.sign(d); st.walkT += dt; st.frame = 1 + Math.floor(st.walkT * 9) % 6; }
      st.maxS = Math.max(st.maxS, st.afanS);
    }
    const a = atS(st.afanS);
    if (st.follow && st.targetS != null) {
      const want = a.x * k - st.vw * (st.dir > 0 ? 0.4 : 0.6);
      st.camX += (want - st.camX) * Math.min(1, dt * 3.5); clampCam();
    }
    // 霧：跟著走到最遠的位置散開，但停在未開的柵欄後面
    const fc = firstClosed();
    let fogT = atS(st.maxS).x + (st.vw * 0.75) / k;
    if (fc >= 0) fogT = Math.min(fogT, STAGES[fc].gateX + 110);
    else fogT = IMG_W + 600;
    if (!st.fogX) st.fogX = fogT;
    st.fogX += (fogT - st.fogX) * Math.min(1, dt * (fogT > st.fogX ? 0.9 : 3));
    STAGES.forEach(g => { if (g.open && g.openT < 1) g.openT = Math.min(1, g.openT + dt / 1.2); });
    st.flash = Math.max(0, st.flash - dt * 0.8);
    st.bubble = Math.max(0, st.bubble - dt);
    st.birds.forEach(b => { b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy -= 8 * dt; });
    st.birds = st.birds.filter(b => b.t < 4);
  }

  function draw(now) {
    const { k, vw, H, camX, dpr } = st;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H); sky.addColorStop(0, '#f6efe2'); sky.addColorStop(1, '#efe3c8');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, vw, H);
    if (IMGS.far) ctx.drawImage(IMGS.far, -camX * 0.45, 0, IMG_W * k, H);
    if (IMGS.mid) ctx.drawImage(IMGS.mid, -camX, 0, IMG_W * k, H);
    ctx.save(); ctx.translate(-camX, 0);
    drawPath(k); drawGates(k, now); drawSigns(k); drawAfan(k, now);
    ctx.restore();
    drawNear(k);
    drawFog(k, now);
    drawBirds(k);
    if (st.flash > 0) { ctx.fillStyle = `rgba(255,214,120,${st.flash * 0.28})`; ctx.fillRect(0, 0, vw, H); }
  }
  function tracePath(k, s0, s1) {
    ctx.beginPath(); let started = false;
    for (const p of path) {
      if (p.s < s0 || p.s > s1) continue;
      if (!started) { ctx.moveTo(p.x * k, p.y * k); started = true; } else ctx.lineTo(p.x * k, p.y * k);
    }
    const e = atS(s1); ctx.lineTo(e.x * k, e.y * k);
  }
  function drawPath(k) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([7, 9]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(110,78,40,0.55)';
    tracePath(k, st.maxS, PATH_LEN); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,248,225,0.55)'; tracePath(k, 0, st.maxS); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = GOLD; tracePath(k, 0, st.maxS); ctx.stroke();
  }
  function drawGates(k) {
    STAGES.forEach((g, i) => {
      const p = atS(g.s), x = p.x * k, y = p.y * k, h = Math.max(46, 70 * k), w = Math.max(34, 52 * k);
      const t = g.openT;
      ctx.fillStyle = '#7a5330'; ctx.strokeStyle = '#4a311a'; ctx.lineWidth = 1.5;
      [x - w / 2, x + w / 2].forEach(px => { ctx.fillRect(px - 3, y - h, 6, h + 4); ctx.strokeRect(px - 3, y - h, 6, h + 4); });
      // 繩子：關著時橫在路上，打開時落下並收到旁邊
      ctx.strokeStyle = '#c89b5a'; ctx.lineWidth = 3; ctx.beginPath();
      if (t < 1) {
        const sag = 8 + t * h * 0.9;
        ctx.moveTo(x - w / 2, y - h * 0.62); ctx.quadraticCurveTo(x, y - h * 0.62 + sag, x + w / 2 - t * w, y - h * 0.62 + t * h * 0.55);
      } else { ctx.moveTo(x + w / 2, y - h * 0.62); ctx.quadraticCurveTo(x + w / 2 + 5, y - h * 0.3, x + w / 2 + 2, y - 2); }
      ctx.stroke();
      // 木牌
      const bw = Math.max(62, 92 * k), bh = 26, bx = x - bw / 2, by = y - h - bh - 2;
      ctx.save(); ctx.translate(x, by); ctx.rotate(t < 1 ? Math.sin(t * 9) * 0.12 * t : -0.05); ctx.translate(-x, -by);
      ctx.fillStyle = g.open ? '#f2cf7c' : '#d8b47a'; ctx.strokeStyle = '#4a311a';
      roundRect(bx, by, bw, bh, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a2f14'; ctx.font = 'bold 12px "Noto Sans TC",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = i === STAGES.length - 1 ? (g.open ? '收稻完成' : '終點柵欄') : (g.open ? '通行' : g.name + '柵欄');
      ctx.fillText(label, x, by + bh / 2 + 1);
      ctx.restore();
      if (!g.open) { ctx.font = '11px "Noto Sans TC",sans-serif'; ctx.fillStyle = '#4a2f14'; ctx.textAlign = 'center'; ctx.fillText(`${stageCount(i)}／${g.pts.length}`, x, y + 14); }
    });
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function drawSigns(k) {
    const fc = firstClosed();
    POINTS.forEach(p => {
      const x = p.sx * k, y = p.sy * k, done = isDone(p.id), locked = fc >= 0 && p.stage > fc;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(70,45,20,0.85)'; ctx.font = `bold ${Math.max(11, 20 * k)}px "Noto Sans TC",sans-serif`;
      ctx.fillText(p.id, x, y);
      const tw = done ? 104 : 86, th = 22, tx = x - tw / 2, ty = y - Math.max(34, 56 * k) - th;
      ctx.fillStyle = done ? GOLD : locked ? 'rgba(200,190,170,0.9)' : 'rgba(255,250,236,0.95)';
      ctx.strokeStyle = '#6b4a24'; ctx.lineWidth = 1.2; roundRect(tx, ty, tw, th, 11); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x - 5, ty + th); ctx.lineTo(x, ty + th + 6); ctx.lineTo(x + 5, ty + th); ctx.fill();
      ctx.fillStyle = done ? '#fff' : '#4a2f14'; ctx.font = '12px "Noto Sans TC",sans-serif';
      ctx.fillText(`作品編號 ${p.id}`, x + (done ? 9 : 0), ty + th / 2 + 1);
      if (done && IMGS.onigiri) ctx.drawImage(IMGS.onigiri, tx + 3, ty + 2, 18, 18);
    });
  }
  function drawAfan(k, now) {
    const a = atS(st.afanS), x = a.x * k, y = a.y * k + 4, h = Math.max(96, 0.17 * st.H);
    let key = 'walk' + st.frame;
    if (st.act) { const f = Math.min(3, Math.floor((now - st.act.t0) / st.act.per)); key = 'act' + (f + 1); }
    const im = IMGS[key]; if (!im) return;
    const top = st.act ? 0 : (frameTop[key] || 0);
    const sh = im.height - top, w = h * im.width / sh;
    let tilt = st.act ? 0 : Math.max(-0.2, Math.min(0.2, a.ang * 0.45));
    ctx.fillStyle = 'rgba(40,25,10,0.22)'; ctx.beginPath(); ctx.ellipse(x, y, w * 0.32, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.translate(x, y); ctx.rotate(tilt); if (st.dir < 0 && !st.act) ctx.scale(-1, 1);
    ctx.drawImage(im, 0, top, im.width, sh, -w / 2, -h, w, h);
    ctx.restore();
    st.afanScreen = { x: x - st.camX, y, h };
    if (st.fly) {
      const t = Math.min(1, (now - st.fly.t0) / 700), hx = x, hy = y - h * 0.42;
      const fx = st.fly.x0 + st.camX + (hx - st.fly.x0 - st.camX) * t, fy = st.fly.y0 + (hy - st.fly.y0) * t - Math.sin(t * Math.PI) * 60;
      const oi = IMGS[st.fly.golden ? 'onigiriGold' : 'onigiri'], s = 30 * (st.fly.eat ? Math.max(0, 1 - (now - st.fly.eat) / 900) : 1);
      if (oi && s > 1) ctx.drawImage(oi, fx - s / 2, fy - s / 2, s, s);
    }
    if (st.bubble > 0) {
      const bx = Math.max(st.camX + 70, Math.min(st.camX + st.vw - 70, x));
      ctx.globalAlpha = Math.min(1, st.bubble); ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#6b4a24';
      roundRect(bx - 66, y - h - 36, 132, 26, 13); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a3b1c'; ctx.font = '13px "Noto Sans TC",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('好香的飯糰，謝謝你！', bx, y - h - 23); ctx.globalAlpha = 1;
    }
  }
  function drawNear(k) {
    const im = IMGS.near; if (!im) return;
    const nh = st.H * 0.15, tw = im.width * nh / im.height, y = st.H - nh, x0 = -st.camX * 1.2;
    let i = Math.floor(-x0 / tw);
    for (let x = x0 + i * tw; x < st.vw; x += tw, i++) {
      if (i % 2) { ctx.save(); ctx.translate(x + tw, y); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, tw, nh); ctx.restore(); }
      else ctx.drawImage(im, x, y, tw, nh);
    }
  }
  function drawFog(k, now) {
    const ex = st.fogX * k - st.camX; if (ex > st.vw + 260) return;
    const g = ctx.createLinearGradient(ex - 240, 0, ex + 60, 0);
    g.addColorStop(0, 'rgba(246,242,234,0)'); g.addColorStop(0.6, 'rgba(246,242,234,0.7)'); g.addColorStop(1, 'rgba(246,242,234,0.94)');
    ctx.fillStyle = g; ctx.fillRect(ex - 240, 0, 300, st.H);
    ctx.fillStyle = 'rgba(246,242,234,0.94)'; ctx.fillRect(ex + 60, 0, Math.max(0, st.vw - ex - 60), st.H);
    const t = now / 1000;
    for (let i = 0; i < 7; i++) {
      const cx = ex - 120 + Math.sin(t * 0.3 + i * 1.7) * 40 + (i % 3) * 30, cy = st.H * (0.12 + i * 0.13), r = 70 + (i % 3) * 25;
      const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      rg.addColorStop(0, 'rgba(250,247,240,0.55)'); rg.addColorStop(1, 'rgba(250,247,240,0)');
      ctx.fillStyle = rg; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
    if (ex < st.vw - 40) {
      ctx.fillStyle = 'rgba(120,100,70,0.75)'; ctx.font = '13px "Noto Sans TC",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('霧裡還沒探索', Math.min(st.vw - 60, ex + 110), st.H * 0.4);
    }
  }
  function drawBirds(k) {
    st.birds.forEach(b => {
      const x = b.x * k - st.camX, y = b.y * k, f = Math.sin(b.t * 18) * 6;
      ctx.fillStyle = '#7b5232'; ctx.beginPath(); ctx.ellipse(x, y, 8, 5, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3b22'; ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x - 10, y - 6 - f); ctx.lineTo(x + 4, y - 3); ctx.fill();
      ctx.fillStyle = '#efe0c8'; ctx.beginPath(); ctx.arc(x + 7, y - 2, 3.5, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d9a03c'; ctx.beginPath(); ctx.moveTo(x + 10, y - 2); ctx.lineTo(x + 14, y - 1); ctx.lineTo(x + 10, y); ctx.fill();
    });
  }

  // ---------- 關卡開放 ----------
  function openStage(i) {
    const g = STAGES[i]; g.open = true; g.openT = 0; st.flash = 1;
    for (let n = 0; n < 4; n++) st.birds.push({ x: g.gateX - 20 + n * 15, y: atS(g.s).y - 90 - n * 12, vx: 120 + n * 30, vy: -40 - n * 10, t: -n * 0.15 });
    renderStages();
    if (i < STAGES.length - 1) toast(`${STAGES[i + 1].name}開放了！霧散開了，繼續往前走吧`, 4200);
    else { toast('三段小路都走完了，阿飯拿到收稻卡！', 4200); setTimeout(showCard, 1600); }
  }
  function showCard() {
    $('card-list').innerHTML = POINTS.map(p => { const r = records.find(x => x.id === p.id); return `<li>${STAGES[p.stage].name}，作品編號 ${p.id}，${r ? sizeLabel(r.size, r.type) : '未收'}</li>`; }).join('');
    const d = new Date(); $('card-date').textContent = `收稻日 ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    $('card').hidden = false;
  }
  $('card-close').addEventListener('click', () => { $('card').hidden = true; });

  // ---------- 接稻穗小遊戲（沿用第三版規則） ----------
  const H = { on: false };
  function startHarvest(p) {
    st.busy = true;
    Object.assign(H, { on: true, p, score: 0, golden: false, items: [], t0: performance.now(), lastSpawn: 0, x: 0.5, ended: false, moveT: 0 });
    $('h-label').textContent = `作品編號 ${p.id}`; $('h-score').textContent = '已收 0 束'; $('h-timer').textContent = '剩餘 10 秒';
    $('h-items').innerHTML = ''; $('h-result').hidden = true; $('harvest').hidden = false;
    placeHarvestAfan(); requestAnimationFrame(stepHarvest);
  }
  function placeHarvestAfan() { const f = $('h-field'), a = $('h-afan'); a.style.left = (H.x * f.clientWidth) + 'px'; }
  function stepHarvest(now) {
    if (!H.on || H.ended) return;
    const field = $('h-field'), fw = field.clientWidth, fh = field.clientHeight, el = now - H.t0;
    const left = Math.max(0, 10 - el / 1000);
    $('h-timer').textContent = `剩餘 ${Math.ceil(left)} 秒`;
    if (now - H.lastSpawn > 380) {
      H.lastSpawn = now; const r = Math.random();
      const kind = r < 0.05 ? 'golden' : r < 0.75 ? 'rice' : 'leaf';
      const img = document.createElement('img');
      img.src = kind === 'golden' ? 'sprites/rice_golden.png' : kind === 'rice' ? 'sprites/rice.png' : 'sprites/' + ['maple_red', 'maple_yellow', 'ginkgo', 'oak'][Math.floor(Math.random() * 4)] + '.png';
      img.alt = ''; $('h-items').appendChild(img);
      H.items.push({ el: img, kind, x: 20 + Math.random() * (fw - 60), y: -50, v: (140 + Math.random() * 80) * (reduceMotion ? 0.5 : 1), last: now });
    }
    const ax = H.x * fw, ay = fh - 8 - 70;
    H.items = H.items.filter(it => {
      const dt = Math.min(0.05, (now - it.last) / 1000); it.last = now; it.y += it.v * dt;
      it.el.style.transform = `translate(${it.x}px,${it.y}px)`;
      if (it.kind !== 'leaf' && it.y + 30 > ay && it.y < ay + 40 && Math.abs(it.x + 21 - ax) < 46) {
        H.score += it.kind === 'golden' ? 3 : 1; if (it.kind === 'golden') H.golden = true;
        $('h-score').textContent = `已收 ${H.score} 束`; it.el.remove(); return false;
      }
      if (it.y > fh) { it.el.remove(); return false; }
      return true;
    });
    if (H.moveT && now - H.moveT < 150) $('h-afan-img').src = `scroll/afan/walk_${1 + Math.floor(now / 110) % 6}.png`;
    if (left <= 0) return finishHarvest(false);
    requestAnimationFrame(stepHarvest);
  }
  function finishHarvest(skipped) {
    if (H.ended) return; H.ended = true;
    let size = 'small', type = 'normal';
    if (!skipped) { size = H.score >= 12 ? 'large' : H.score >= 6 ? 'medium' : 'small'; type = H.golden ? 'golden' : 'normal'; }
    const res = $('h-result'); res.textContent = `收了 ${H.score} 束稻穗，做成${sizeLabel(size, type)}！`; res.hidden = false;
    setTimeout(() => { $('harvest').hidden = true; H.on = false; feed(H.p, size, type); }, skipped ? 700 : 1400);
  }
  $('h-skip').addEventListener('click', () => finishHarvest(true));
  (function bindHarvestDrag() {
    const a = $('h-afan'); let drag = false;
    a.addEventListener('pointerdown', e => { if (e.clientX < 24 || e.clientX > window.innerWidth - 24) return; drag = true; a.setPointerCapture(e.pointerId); e.preventDefault(); });
    a.addEventListener('pointermove', e => {
      if (!drag) return; const r = $('h-field').getBoundingClientRect();
      H.x = Math.max(0.06, Math.min(0.94, (e.clientX - r.left) / r.width)); H.moveT = performance.now(); placeHarvestAfan();
    });
    const end = () => { drag = false; }; a.addEventListener('pointerup', end); a.addEventListener('pointercancel', end);
  })();

  function feed(p, size, type) {
    const now = performance.now();
    st.fly = { t0: now, x0: st.vw / 2, y0: 40, golden: type === 'golden' };
    setTimeout(() => {
      st.act = { t0: performance.now(), per: 320 }; st.fly.eat = performance.now();
      setTimeout(() => {
        st.act = null; st.fly = null; st.bubble = 2.2; st.busy = false;
        records = records.filter(r => r.id !== p.id).concat({ id: p.id, date: today(), size, type }); saveRecords();
        renderStages();
        toast(`阿飯吃了${sizeLabel(size, type)}，${STAGES[p.stage].name} ${stageCount(p.stage)}／${STAGES[p.stage].pts.length}`);
        const g = STAGES[p.stage];
        if (!g.open && stageCount(p.stage) >= g.pts.length) setTimeout(() => openStage(p.stage), 700);
      }, 1300);
    }, 720);
  }

  // ---------- 操作：點一下走過去，拖曳捲動 ----------
  let ptr = null;
  canvas.addEventListener('pointerdown', e => { ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, cam: st.camX, drag: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!ptr || ptr.id !== e.pointerId) return;
    const dx = e.clientX - ptr.x;
    if (!ptr.drag && Math.abs(dx) > 8) { ptr.drag = true; canvas.classList.add('dragging'); }
    if (ptr.drag) { st.follow = false; st.camX = ptr.cam - dx; clampCam(); }
  });
  canvas.addEventListener('pointerup', e => {
    if (!ptr) return; const wasDrag = ptr.drag; ptr = null; canvas.classList.remove('dragging');
    if (wasDrag || st.busy) return;
    const r = canvas.getBoundingClientRect();
    tapAt((e.clientX - r.left + st.camX) / st.k, (e.clientY - r.top) / st.k);
  });
  canvas.addEventListener('pointercancel', () => { ptr = null; canvas.classList.remove('dragging'); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); st.follow = false; st.camX += Math.max(-60, Math.min(60, (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY))); clampCam(); }, { passive: false });
  function tapAt(wx, wy) {
    const tagPad = 70 / st.k;
    const p = POINTS.find(p => Math.abs(wx - p.sx) < 60 / st.k * 0.9 && wy > p.sy - tagPad - 40 && wy < p.sy + 60);
    if (p && p.sx < st.fogX - 40) return walkTo(p.s, p);
    const s = sAtX(wx), py = atS(s).y;
    if (Math.abs(wy - py) < 150) return walkTo(s, null);
    toast('點一下小路，阿飯就會走過去', 1800);
  }
  window.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight') walkTo(st.afanS + 200, null);
    if (e.key === 'ArrowLeft') walkTo(st.afanS - 200, null);
  });
  $('reset').addEventListener('click', () => {
    records = []; saveRecords(); syncGatesFromRecords();
    Object.assign(st, { afanS: sAtX(140), targetS: null, targetPoint: null, camX: 0, dir: 1, fogX: 0, busy: false, act: null, fly: null });
    st.maxS = st.afanS; renderStages(); toast('重新開始，阿飯回到村口了');
  });
  window.addEventListener('resize', resize);

  // 測試用掛勾（Playwright 驗證）
  window.__afan = { st, POINTS, STAGES, walkTo, sAtX, atS, tapAt, get records() { return records; } };

  renderStages(); resize();
  loadAll().then(() => { measureTops(); requestAnimationFrame(loop); });
})();
