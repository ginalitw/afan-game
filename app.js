(() => {
  'use strict';
  // 第五版：六段章節卷軸首尾相連，四季切換，每段一個大互動
  const SW = 4128, IMG_H = 1024; // 每段章節原圖座標
  const GOLD = '#D9A03C';
  const STORE_KEY = 'afanV5Records';
  const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const SEASON_NAME = { spring: '春', summer: '夏', autumn: '秋', winter: '冬' };

  // 路徑與立牌座標都是百分比（x 為章節寬，y 為高），oy 是整段上下位移，讓接縫處路面高度相同
  const CHAPTERS = [
    { id: 'rice', name: '棚田', short: '棚田', far: 'far', near: 'near', oy: -7, big: 'harvest', lights: ['hat', 'shoo', 'kaki'],
      path: [[0, 64], [8, 63], [15, 62], [22, 61], [28, 62], [34, 62], [39, 64], [43, 70], [48, 73], [55, 74], [62, 75], [70, 76], [78, 74], [85, 71], [92, 69], [100, 68]],
      signs: [[14, 67], [19, 55], [49.5, 72], [70, 68], [97, 61, 'boss']] },
    { id: 'school', name: '廢校與山村', short: '廢校', far: 'far', near: 'near', oy: -3, big: 'bell', lights: ['chalk', 'desk'],
      path: [[0, 64], [15, 64], [30, 65], [45, 66], [60, 66], [75, 65], [90, 64], [100, 64]],
      signs: [[7.5, 60], [24, 60], [43, 67], [59, 71, 'boss'], [93.5, 64]] },
    { id: 'gorge', name: '清津峽', short: '清津峽', far: 'gorge_far', near: 'gorge_near', oy: 7, big: 'bridge', lights: ['leaf', 'stone'],
      path: [[0, 54], [8, 54], [14, 55], [16, 59], [19, 62.5], [22, 60], [24, 58], [32, 58], [40, 58], [48, 58], [56, 57], [62, 57], [66, 63], [70.5, 72], [76, 73.6], [83, 74.6], [90, 73.4], [95.5, 71], [97.5, 63], [100, 60]],
      signs: [[1.5, 50], [9.5, 50], [34, 54], [47, 54], [54, 47], [97, 52, 'boss']] },
    { id: 'river', name: '信濃川・河岸段丘', short: '信濃川', far: 'far', near: 'near', oy: 6, big: 'fish', lights: ['heron', 'boat'],
      path: [[0, 61], [10, 62], [20, 66], [30, 70], [40, 72], [50, 70], [60, 68], [70, 66], [80, 65], [88, 64], [93, 60], [100, 59]],
      signs: [[3, 58], [29, 69], [44, 74, 'boss'], [76.5, 64], [94.5, 57]] },
    { id: 'naeba', name: '苗場', short: '苗場', far: 'naeba_far', near: 'near', oy: -6, big: 'gondola', lights: ['butterfly', 'bloom'],
      path: [[0, 71], [10, 70], [20, 70], [30, 71], [36, 76], [41, 78], [46, 76], [50, 72], [60, 69], [70, 68], [80, 68], [90, 69], [100, 68]],
      signs: [[3, 62], [20, 64], [31, 69], [49, 71], [70, 62, 'boss'], [91.5, 66]] },
    { id: 'snow', name: '松之山', short: '松之山', far: 'snow_far', near: 'snow_near', oy: -2, big: 'snowman', lights: ['icicle', 'sled'],
      path: [[0, 64], [5, 66], [10, 68], [20, 70], [30, 71], [40, 71], [55, 70], [63, 69], [72, 67], [80, 68], [90, 66], [100, 63]],
      signs: [[1.5, 57], [26.5, 72, 'boss'], [51, 67], [73, 63], [97.5, 56]] }
  ];
  const NCH = CHAPTERS.length, WORLD_W = SW * NCH;
  CHAPTERS.forEach((c, i) => { c.i = i; c.x0 = i * SW; c.dy = c.oy / 100 * IMG_H; });
  const cx = (c, px) => c.x0 + px / 100 * SW, cy = (c, py) => py / 100 * IMG_H + c.dy;
  const chapterAt = wx => CHAPTERS[Math.max(0, Math.min(NCH - 1, Math.floor(wx / SW)))];

  // 立牌（只放立牌與作品編號，不畫作品）
  const POINTS = [];
  CHAPTERS.forEach(c => c.signs.forEach(s => POINTS.push({ id: String(POINTS.length + 1).padStart(2, '0'), stage: c.i, sx: cx(c, s[0]), sy: cy(c, s[1]), boss: s[2] === 'boss' })));
  CHAPTERS.forEach(c => { let j = 0; POINTS.filter(p => p.stage === c.i && !p.boss).forEach(p => { p.mini = c.lights[j++ % c.lights.length]; }); });
  const STAGES = CHAPTERS.map(c => ({ name: c.short, gateX: cx(c, 98.6), pts: POINTS.filter(p => p.stage === c.i).map(p => p.id) }));

  // 清津峽兩座吊橋（長橋在 x83% y72-75%，短橋在 x19% y62-64% 縮小）
  const G = CHAPTERS[2];
  const BRIDGES = [
    { id: 'short', img: 'gorge_bridge_short', x0: cx(G, 15.2), x1: cx(G, 22.8), deck: 0.62 },
    { id: 'long', img: 'gorge_bridge_long', x0: cx(G, 69.5), x1: cx(G, 96.5), deck: 0.6 }
  ];

  const $ = id => document.getElementById(id);
  const canvas = $('scene'), ctx = canvas.getContext('2d');
  const stageEl = $('stage'), toastEl = $('toast');

  // ---------- 存檔 ----------
  function loadSave() {
    try {
      const r = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {};
      const recs = Array.isArray(r.records) ? r.records.filter(x => x && POINTS.some(p => p.id === x.id)).map(x => ({ id: x.id, date: String(x.date), size: x.size, type: x.type })) : [];
      const bon = Array.isArray(r.bonus) ? r.bonus.filter(x => x && typeof x.p === 'string').map(x => ({ p: x.p, d: String(x.d), n: Math.max(1, x.n | 0) })) : [];
      return { records: recs, bonus: bon, season: SEASONS.includes(r.season) ? r.season : null };
    } catch (e) { return { records: [], bonus: [], season: null }; }
  }
  const saved = loadSave();
  let records = saved.records, bonus = saved.bonus, seasonPick = saved.season;
  function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify({ v: 5, records, bonus, season: seasonPick })); } catch (e) { /* 無痕模式略過 */ } }
  function realSeason() { const m = new Date().getMonth() + 1; return m >= 3 && m <= 5 ? 'spring' : m <= 8 && m >= 6 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter'; }
  let season = seasonPick || realSeason();

  // ---------- 圖片 ----------
  const IMGS = {};
  function loadImg(key, src) {
    if (IMGS[key] || IMGS[key] === null) return Promise.resolve(IMGS[key]);
    IMGS[key] = null;
    return new Promise(res => { const im = new Image(); im.decoding = 'async'; im.onload = () => { IMGS[key] = im; res(im); }; im.onerror = () => { delete IMGS[key]; res(null); }; im.src = src; });
  }
  const A = {
    walkR: n => `v5/afan/afan_walk/walk_${String(n).padStart(2, '0')}.webp`,
    walkL: n => `v5/afan/afan_walk_left/walk_left_${String(n).padStart(2, '0')}.webp`,
    crouch: n => `v5/afan/afan_crouch/crouch_${String(n).padStart(2, '0')}.webp`,
    get: n => `v5/afan/afan_get_onigiri/get_onigiri_${String(n).padStart(2, '0')}.webp`
  };
  // 原始影格基線（圖檔縮成 2/3）
  const SPR = { walkR: { n: 10, base: 303, fps: 12 }, walkL: { n: 11, base: 316, fps: 12 }, crouch: { n: 19, base: 288, fps: 12 }, get: { n: 33, base: 302, fps: 12 } };
  const ITEM_NAMES = ['school_bell', 'school_chalkboard', 'school_desk', 'gorge_crab', 'gorge_leaf', 'gorge_stone', 'gorge_bridge_long', 'gorge_bridge_short', 'river_float', 'river_heron', 'river_rowboat', 'naeba_gondola', 'naeba_flower', 'naeba_butterfly', 'snow_snowman', 'snow_sled', 'snow_icicle', 'rice_ears'];
  const layerKey = (s, n) => s + '/' + n;
  function seasonLayers(s, c) { return [[layerKey(s, c.id + '_mid'), `v5/${s}/${c.id}_mid.webp`], [layerKey(s, c.far), `v5/${s}/${c.far}.webp`], [layerKey(s, c.near), `v5/${s}/${c.near}.webp`]]; }
  function loadSeason(s, first) {
    // 先載入目前章節附近，再依距離載入其他章節
    const ci = first == null ? 0 : first;
    const order = CHAPTERS.slice().sort((a, b) => Math.abs(a.i - ci) - Math.abs(b.i - ci));
    return order.reduce((p, c) => p.then(() => Promise.all(seasonLayers(s, c).map(([k, u]) => loadImg(k, u)))), Promise.resolve());
  }
  function loadCore() {
    const L = [];
    for (const [k, d] of Object.entries(SPR)) for (let i = 1; i <= d.n; i++) L.push(loadImg(k + i, A[k](i)));
    ITEM_NAMES.forEach(n => L.push(loadImg(n, `v5/items/${n}.webp`)));
    [['onigiri', 'sprites/onigiri.png'], ['onigiriGold', 'sprites/onigiri_golden.png'], ['onigiriBite', 'sprites/onigiri_bite.png'], ['sparrow1', 'items/sparrow_1.webp'], ['sparrow2', 'items/sparrow_2.webp'], ['sparrow4', 'items/sparrow_4.webp'], ['cat1', 'items/cat_1.webp'], ['cat3', 'items/cat_3.webp'], ['dragonfly1', 'items/dragonfly_1.webp'], ['dragonfly2', 'items/dragonfly_2.webp'], ['dragonfly3', 'items/dragonfly_3.webp'], ['dragonfly4', 'items/dragonfly_4.webp']].forEach(([k, u]) => L.push(loadImg(k, u)));
    return Promise.all(L);
  }

  // ---------- 世界小物（點一下動一動，每天第一次送小飯糰） ----------
  const PROPS = [
    { id: 'r_fly', ch: 0, kind: 'fly', x: 30, y: 45, h: 46, r: 80 },
    { id: 'r_sparrow', ch: 0, kind: 'sparrow', x: 58, y: 62, h: 42 },
    { id: 's_cat', ch: 1, kind: 'cat', x: 52, y: 64, h: 60 },
    { id: 'g_crab', ch: 2, kind: 'item', img: 'gorge_crab', x: 40, y: 64, h: 50 },
    { id: 'v_heron', ch: 3, kind: 'item', img: 'river_heron', x: 64, y: 72, h: 120 },
    { id: 'v_boat', ch: 3, kind: 'boat', img: 'river_rowboat', x: 46, y: 46, h: 40 },
    { id: 'n_bfly', ch: 4, kind: 'bfly', img: 'naeba_butterfly', x: 24, y: 60, h: 40, r: 70 },
    { id: 'n_flower', ch: 4, kind: 'item', img: 'naeba_flower', x: 56, y: 72, h: 90 },
    { id: 'w_snowman', ch: 5, kind: 'item', img: 'snow_snowman', x: 34, y: 74, h: 130 },
    { id: 'w_sled', ch: 5, kind: 'item', img: 'snow_sled', x: 83, y: 74, h: 44 }
  ];
  PROPS.forEach((p, i) => { const c = CHAPTERS[p.ch]; p.wx = cx(c, p.x); p.wy = cy(c, p.y); p.t0 = -1e9; p.seed = i * 1.37; });
  const PROP_NAMES = { r_fly: '紅蜻蜓', r_sparrow: '麻雀', s_cat: '貓咪', g_crab: '小螃蟹', v_heron: '白鷺', v_boat: '小船', n_bfly: '蝴蝶', n_flower: '高山小花', w_snowman: '雪人', w_sled: '雪橇' };
  const fx = [];
  const bonusTotal = () => bonus.reduce((a, b) => a + b.n, 0);
  function renderBonus() { $('bonus').textContent = `小飯糰 ${bonusTotal()}`; }
  function claimBonus(id, wx, wy) {
    const d = today(), r = bonus.find(b => b.p === id);
    if (r && r.d === d) return false;
    if (r) { r.d = d; r.n += 1; } else bonus.push({ p: id, d, n: 1 });
    persist(); renderBonus();
    fx.push({ type: 'plus', x: wx, y: wy, life: 1.4, t0: performance.now() });
    return true;
  }
  function propPose(p, now) {
    const t = (now - p.t0) / 1000, tt = now / 1000 + p.seed, rm = reduceMotion;
    let key = p.img, dx = 0, dy = 0, rot = 0, flip = false, alpha = 1;
    switch (p.kind) {
      case 'fly': case 'bfly': {
        key = p.kind === 'fly' ? 'dragonfly' + (rm ? 1 : 1 + Math.floor(now / 60) % 4) : p.img;
        if (!rm) {
          const a = tt * 0.35; dx = Math.cos(a) * p.r * 1.6 + Math.sin(a * 2.3) * 20; dy = Math.sin(a * 1.7) * p.r * 0.5;
          flip = -Math.sin(a) < 0;
          if (t < 1.2) { const u = t / 1.2 * Math.PI * 2; dx += Math.sin(u) * 70; dy += -(1 - Math.cos(u)) * 55; }
          if (p.kind === 'bfly') rot = Math.sin(now / 90) * 0.15;
        }
        break;
      }
      case 'sparrow':
        key = 'sparrow' + (Math.floor(tt * 0.7) % 3 === 0 ? 1 : 2);
        if (t < 3.5) { if (t < 1.4 && !rm) { key = 'sparrow4'; dx = t * 260; dy = -t * 180; alpha = 1 - t / 1.4; } else if (t < 2.2) key = null; else if (!rm) { key = 'sparrow4'; const u = 1 - (t - 2.2) / 1.3; dx = -u * 240; dy = -u * 160; alpha = 1 - u; } }
        break;
      case 'cat': key = t < 2.5 ? 'cat3' : 'cat1'; break;
      case 'boat': if (!rm) { dx = Math.sin(tt * 0.4) * 40 + (t < 3 ? Math.sin(t / 3 * Math.PI) * 160 : 0); dy = Math.sin(tt * 1.3) * 3; rot = Math.sin(tt * 1.1) * 0.03; } break;
      default: if (t < 1 && !rm) { rot = Math.sin(t * 18) * 0.12 * (1 - t); dy = -Math.abs(Math.sin(t * 9)) * 14 * (1 - t); }
    }
    return { key, dx, dy, rot, flip, alpha };
  }
  function drawProps(k, now, x0, x1) {
    PROPS.forEach(p => {
      if (p.wx < x0 - 400 || p.wx > x1 + 400) { p.rect = null; return; }
      const pose = propPose(p, now), im = pose.key && IMGS[pose.key]; if (!im) { p.rect = null; return; }
      const h = p.h, w = h * im.width / im.height, x = p.wx + pose.dx, y = p.wy + pose.dy;
      p.rect = { x: x - w / 2, y: y - h, w, h };
      ctx.save(); ctx.globalAlpha = pose.alpha; ctx.translate(x * k, y * k); ctx.rotate(pose.rot); if (pose.flip) ctx.scale(-1, 1);
      ctx.drawImage(im, -w * k / 2, -h * k, w * k, h * k); ctx.restore();
    });
  }
  function drawFx(k, now) {
    for (let i = fx.length - 1; i >= 0; i--) if ((now - fx[i].t0) / 1000 > fx[i].life) fx.splice(i, 1);
    fx.forEach(f => {
      const t = (now - f.t0) / 1000;
      if (t < 0) return;
      if (f.type === 'plus') {
        const rise = reduceMotion ? 0 : t * 34, a = t < 0.15 ? t / 0.15 : Math.max(0, 1 - (t - 0.8) / 0.5);
        const x = f.x * k, y = f.y * k - 10 - rise;
        ctx.save(); ctx.globalAlpha = a;
        if (IMGS.onigiri) ctx.drawImage(IMGS.onigiri, x - 22, y - 9, 16, 16);
        ctx.font = 'bold 14px "Noto Sans TC",sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.lineWidth = 3; ctx.strokeStyle = '#fffaf0'; ctx.strokeText('+1', x - 4, y); ctx.fillStyle = '#a8741f'; ctx.fillText('+1', x - 4, y);
        ctx.restore();
      } else if (f.type === 'spark') {
        const x = (f.x + f.vx * t) * k, y = (f.y + f.vy * t + 60 * t * t) * k, a = Math.max(0, 1 - t / f.life);
        star(x, y, 6, a, t * 3);
      }
    });
  }
  function star(x, y, s, a, rot) {
    ctx.save(); ctx.globalAlpha = a; ctx.fillStyle = '#fff3b0'; ctx.translate(x, y); ctx.rotate(rot);
    ctx.beginPath(); for (let j = 0; j < 8; j++) { const rr = j % 2 ? s * 0.4 : s * 1.6, an = j * Math.PI / 4; ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
    ctx.closePath(); ctx.lineWidth = 1.2; ctx.strokeStyle = '#b5761a'; ctx.stroke(); ctx.fill(); ctx.restore();
  }
  function tapProp(wx, wy) {
    const now = performance.now(), pad = 22 / st.k;
    const p = PROPS.find(p => p.rect && p.wx < st.fogX - 40 && wx > p.rect.x - pad && wx < p.rect.x + p.rect.w + pad && wy > p.rect.y - pad && wy < p.rect.y + p.rect.h + pad);
    if (!p) return false;
    if ((now - p.t0) / 1000 > (p.kind === 'sparrow' ? 3.5 : 1.2)) p.t0 = now;
    for (let j = 0; j < (reduceMotion ? 3 : 7); j++) fx.push({ type: 'spark', x: p.wx + (Math.random() - 0.5) * 40, y: p.wy - p.h * Math.random(), vx: reduceMotion ? 0 : (Math.random() - 0.5) * 140, vy: reduceMotion ? 0 : -60 - Math.random() * 80, life: 1, t0: now });
    if (claimBonus(p.id, p.wx, p.wy - p.h)) toast(`${PROP_NAMES[p.id]}送你一顆小飯糰，今天每樣小物都能拿一次`, 2200);
    return true;
  }

  // ---------- 路徑 ----------
  const path = [];
  (function buildPath() {
    const P = [];
    CHAPTERS.forEach(c => c.path.forEach(([x, y], j) => { if (c.i > 0 && j === 0) return; P.push([cx(c, x), cy(c, y)]); }));
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)], p1 = P[i], p2 = P[i + 1], p3 = P[Math.min(P.length - 1, i + 2)];
      for (let j = 0; j < 10; j++) {
        const t = j / 10, t2 = t * t, t3 = t2 * t;
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
    let lo = 0, hi = path.length - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (path[m].x <= x) lo = m; else hi = m; }
    const a = path[lo], b = path[hi], t = Math.max(0, Math.min(1, (x - a.x) / Math.max(1e-6, b.x - a.x)));
    return a.s + (b.s - a.s) * t;
  }
  POINTS.forEach(p => { p.s = sAtX(p.sx); });
  STAGES.forEach(g => { g.s = sAtX(g.gateX); g.open = false; g.openT = 0; });

  // ---------- 狀態 ----------
  const st = {
    vw: 390, H: 700, k: 0.68, dpr: 1, camX: 0, follow: true,
    afanS: sAtX(140), targetS: null, targetPoint: null, maxS: 0, dir: 1,
    walkT: 0, fogX: 0, flash: 0, birds: [], busy: false,
    act: null, fly: null, bubble: 0, speed: 170,
    sway: 0, crouch: false, hold: false, wobbles: 0, onBridge: null, bridgeDone: false, ride: null
  };
  st.maxS = st.afanS;
  function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
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
  const worldW = () => WORLD_W * st.k;
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
    st.targetS = s; st.targetPoint = point || null; st.follow = true; st.hold = false;
    if (point) toast(`往作品編號 ${point.id} 的立牌走過去`, 2000);
  }
  function arrive() {
    const p = st.targetPoint; st.targetS = null; st.targetPoint = null;
    if (!p) return;
    if (isDone(p.id)) { toast(`作品編號 ${p.id} 已經餵過了，阿飯吃得很飽`); return; }
    if (!p.boss) return startMini(p);
    const big = CHAPTERS[p.stage].big;
    if (big === 'harvest') startHarvest(p);
    else if (big === 'bridge') bridgeResult(p);
    else if (big === 'gondola') startRide(p);
    else startBig(p, big);
  }
  const bridgeAt = x => BRIDGES.find(b => x > b.x0 + 10 && x < b.x1 - 10);

  // ---------- 主迴圈 ----------
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    update(dt, now); draw(now);
    requestAnimationFrame(loop);
  }
  function update(dt, now) {
    const k = st.k;
    const a0 = atS(st.afanS), br = bridgeAt(a0.x);
    if (br !== st.onBridge) {
      if (br && br.id === 'long' && !st.bridgeDone) { st.wobbles = 0; toast('吊橋會晃！晃太大阿飯會蹲下來，點一下可以停一停讓橋靜下來', 3600); }
      if (!br && st.onBridge && st.onBridge.id === 'long' && st.dir > 0) { st.bridgeDone = true; toast(st.wobbles ? `過橋了，晃到蹲下 ${st.wobbles} 次` : '穩穩過橋，一次都沒蹲下！', 2600); }
      st.onBridge = br;
    }
    const walking = st.targetS != null && !st.busy && !st.crouch && !st.hold;
    if (br) {
      if (walking) st.sway += 15 * dt; else st.sway = Math.max(0, st.sway - (st.crouch ? 14 : 22) * dt);
      if (st.sway > 46 && !st.crouch) { st.crouch = true; st.crouchT0 = now; if (br.id === 'long') st.wobbles++; toast('橋晃得好厲害，阿飯先蹲一下', 1800); }
    } else st.sway = Math.max(0, st.sway - 30 * dt);
    if (st.crouch && st.sway < 10) st.crouch = false;
    if (walking) {
      const d = st.targetS - st.afanS, step = st.speed / k * dt * (br ? 0.75 : 1);
      if (Math.abs(d) <= step) { st.afanS = st.targetS; arrive(); }
      else { st.afanS += Math.sign(d) * step; st.dir = Math.sign(d); st.walkT += dt; }
      st.maxS = Math.max(st.maxS, st.afanS);
    }
    const a = atS(st.afanS);
    if (st.follow && (st.targetS != null || st.ride)) {
      const want = a.x * k - st.vw * (st.dir > 0 ? 0.4 : 0.6);
      st.camX += (want - st.camX) * Math.min(1, dt * 3.5); clampCam();
    }
    const fc = firstClosed();
    let fogT = atS(st.maxS).x + (st.vw * 0.75) / k;
    if (fc >= 0) fogT = Math.min(fogT, STAGES[fc].gateX + 110); else fogT = WORLD_W + 600;
    if (!st.fogX) st.fogX = fogT;
    st.fogX += (fogT - st.fogX) * Math.min(1, dt * (fogT > st.fogX ? 0.9 : 3));
    STAGES.forEach(g => { if (g.open && g.openT < 1) g.openT = Math.min(1, g.openT + dt / 1.2); });
    st.flash = Math.max(0, st.flash - dt * 0.8);
    st.bubble = Math.max(0, st.bubble - dt);
    st.birds.forEach(b => { b.t += dt; b.x += b.vx * dt; b.y += b.vy * dt; b.vy -= 8 * dt; });
    st.birds = st.birds.filter(b => b.t < 4);
    if (st.ride) updateRide(now);
    // 換季時先載入附近章節
    const ci = chapterAt(a.x / 1).i;
    if (ci !== st.lastCi) { st.lastCi = ci; loadSeason(season, ci); }
  }

  function layer(name) { return IMGS[layerKey(season, name)] || SEASONS.map(s => IMGS[layerKey(s, name)]).find(Boolean); }
  function draw(now) {
    const { vw, H, dpr } = st;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    const SKY = { spring: ['#f7eef0', '#efe6d6'], summer: ['#eaf3f2', '#e6ecd6'], autumn: ['#f6efe2', '#efe3c8'], winter: ['#eef1f4', '#e4e8ec'] }[season];
    sky.addColorStop(0, SKY[0]); sky.addColorStop(1, SKY[1]);
    ctx.fillStyle = sky; ctx.fillRect(0, 0, vw, H);
    let z = 1, ry = 0;
    if (st.ride) { z = st.ride.z; ry = st.ride.ry; ctx.translate(vw / 2, H * 0.62); ctx.scale(z, z); ctx.translate(-vw / 2, -H * 0.62 + ry); }
    const k = st.k, camX = st.camX;
    const vx0 = vw / 2 - (vw / 2) / z, vx1 = vw / 2 + (vw / 2) / z; // 縮放時畫面實際範圍
    CHAPTERS.forEach(c => {
      const sx0 = c.x0 * k - camX, sw = SW * k;
      if (sx0 > vx1 || sx0 + sw < vx0) return;
      ctx.save(); ctx.beginPath(); ctx.rect(sx0 - 0.5, -H, sw + 1, H * 3); ctx.clip();
      const far = layer(c.far);
      if (far) { const Wf = sw * 0.45 + vw * 0.55 + 40; ctx.drawImage(far, sx0 * 0.45 - 20 + (vx0 < 0 ? vx0 : 0), -H * 0.04 + c.dy * k * 0.5, Wf - 2 * (vx0 < 0 ? vx0 : 0), H); }
      const mid = layer(c.id + '_mid');
      if (mid) {
        const y = c.dy * k, sc = mid.height / IMG_H;
        ctx.drawImage(mid, sx0, y, sw, H);
        if (y < 0) ctx.drawImage(mid, 0, mid.height - 3, mid.width, 2, sx0, y + H - 1, sw, -y + H * 0.6); // 下方空隙用最底列延伸
        else if (y > 0) { const g = ctx.createLinearGradient(0, y, 0, y + H * 0.12); g.addColorStop(0, SKY[0]); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = SKY[0]; ctx.fillRect(sx0, -H, sw, y + H); ctx.fillStyle = g; ctx.fillRect(sx0, y, sw, H * 0.12); } // 上方空隙接天空
        void sc;
      }
      ctx.restore();
    });
    // 接縫的薄霧
    CHAPTERS.forEach(c => { if (!c.i) return; const x = c.x0 * k - camX; if (x < vx0 - 120 || x > vx1 + 120) return;
      const g = ctx.createLinearGradient(x - 110, 0, x + 110, 0); g.addColorStop(0, 'rgba(250,246,238,0)'); g.addColorStop(0.5, 'rgba(250,246,238,0.6)'); g.addColorStop(1, 'rgba(250,246,238,0)');
      ctx.fillStyle = g; ctx.fillRect(x - 110, -H, 220, H * 3); });
    ctx.save(); ctx.translate(-camX, 0);
    const wx0 = (camX + vx0) / k, wx1 = (camX + vx1) / k;
    drawBridges(k, now, wx0, wx1);
    drawPath(k); drawGates(k); drawSigns(k); drawProps(k, now, wx0, wx1); drawAfan(k, now); drawFx(k, now);
    ctx.restore();
    drawNear(k, vx0, vx1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawFog(k, now);
    drawBirds(k);
    if (st.ride) drawRideUI(now);
    if (st.flash > 0) { ctx.fillStyle = `rgba(255,214,120,${st.flash * 0.28})`; ctx.fillRect(0, 0, vw, H); }
  }
  function drawBridges(k, now, wx0, wx1) {
    BRIDGES.forEach(b => {
      if (b.x1 < wx0 || b.x0 > wx1) return;
      const im = IMGS[b.img]; if (!im) return;
      const w = (b.x1 - b.x0), h = w * im.height / im.width, sy0 = atS(sAtX(b.x0 + 8)).y, sy1 = atS(sAtX(b.x1 - 8)).y;
      const N = 18, live = st.onBridge === b ? st.sway : 0, t = now / 1000;
      for (let i = 0; i < N; i++) {
        const u = (i + 0.5) / N, deckY = sy0 + (sy1 - sy0) * u + Math.sin(u * Math.PI) * 6;
        const off = Math.sin(u * Math.PI) * (live * 0.35 * Math.sin(t * 5.5) + (reduceMotion ? 0 : Math.sin(t * 1.3 + u) * 1.5));
        const sx = im.width * i / N, swd = im.width / N + 1;
        ctx.drawImage(im, sx, 0, swd, im.height, (b.x0 + w * i / N) * k, (deckY - h * b.deck + off) * k, (w / N + 1) * k, h * k);
      }
    });
  }
  function bridgeOffset(x) {
    const b = st.onBridge; if (!b) return 0;
    const u = (x - b.x0) / (b.x1 - b.x0);
    return Math.sin(u * Math.PI) * (st.sway * 0.35 * Math.sin(performance.now() / 1000 * 5.5) + 6);
  }
  function tracePath(k, s0, s1) {
    ctx.beginPath(); let started = false;
    for (const p of path) {
      if (p.s < s0 || p.s > s1) continue;
      if (bridgeAt(p.x)) { started = false; continue; } // 橋面不畫虛線
      if (!started) { ctx.moveTo(p.x * k, p.y * k); started = true; } else ctx.lineTo(p.x * k, p.y * k);
    }
  }
  function drawPath(k) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.setLineDash([7, 9]); ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(110,78,40,0.5)';
    tracePath(k, st.maxS, PATH_LEN); ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,248,225,0.5)'; tracePath(k, 0, st.maxS); ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = GOLD; tracePath(k, 0, st.maxS); ctx.stroke();
  }
  function drawGates(k) {
    STAGES.forEach((g, i) => {
      const p = atS(g.s), x = p.x * k, y = p.y * k, h = Math.max(46, 70 * k), w = Math.max(34, 52 * k), t = g.openT;
      ctx.fillStyle = '#7a5330'; ctx.strokeStyle = '#4a311a'; ctx.lineWidth = 1.5;
      [x - w / 2, x + w / 2].forEach(px => { ctx.fillRect(px - 3, y - h, 6, h + 4); ctx.strokeRect(px - 3, y - h, 6, h + 4); });
      ctx.strokeStyle = '#c89b5a'; ctx.lineWidth = 3; ctx.beginPath();
      if (t < 1) { const sag = 8 + t * h * 0.9; ctx.moveTo(x - w / 2, y - h * 0.62); ctx.quadraticCurveTo(x, y - h * 0.62 + sag, x + w / 2 - t * w, y - h * 0.62 + t * h * 0.55); }
      else { ctx.moveTo(x + w / 2, y - h * 0.62); ctx.quadraticCurveTo(x + w / 2 + 5, y - h * 0.3, x + w / 2 + 2, y - 2); }
      ctx.stroke();
      const bw = Math.max(62, 92 * k), bh = 26, bx = x - bw / 2, by = y - h - bh - 2;
      ctx.save(); ctx.translate(x, by); ctx.rotate(t < 1 ? Math.sin(t * 9) * 0.12 * t : -0.05); ctx.translate(-x, -by);
      ctx.fillStyle = g.open ? '#f2cf7c' : '#d8b47a'; ctx.strokeStyle = '#4a311a';
      roundRect(bx, by, bw, bh, 5); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a2f14'; ctx.font = 'bold 12px "Noto Sans TC",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(i === STAGES.length - 1 ? (g.open ? '散步完成' : '終點柵欄') : (g.open ? '通行' : g.name + '柵欄'), x, by + bh / 2 + 1);
      ctx.restore();
      if (!g.open) { ctx.font = '11px "Noto Sans TC",sans-serif'; ctx.fillStyle = '#4a2f14'; ctx.textAlign = 'center'; ctx.fillText(`${stageCount(i)}／${g.pts.length}`, x, y + 14); }
    });
  }
  function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  // 立牌：木樁＋板子＋作品編號（不畫作品）
  function drawSigns(k) {
    const fc = firstClosed();
    POINTS.forEach(p => {
      const x = p.sx * k, y = p.sy * k, done = isDone(p.id), locked = fc >= 0 && p.stage > fc;
      const ph = Math.max(34, 56 * k), bw = Math.max(54, 78 * k), bh = Math.max(30, 42 * k);
      ctx.fillStyle = '#7a5330'; ctx.fillRect(x - 2.5, y - ph, 5, ph);
      ctx.fillStyle = 'rgba(40,25,10,0.18)'; ctx.beginPath(); ctx.ellipse(x, y, 10, 3, 0, 0, Math.PI * 2); ctx.fill();
      const bx = x - bw / 2, by = y - ph - bh;
      ctx.fillStyle = done ? '#f2cf7c' : locked ? '#d6cbb4' : p.boss ? '#f6e3b4' : '#efe2c4'; ctx.strokeStyle = '#5a3b1c'; ctx.lineWidth = p.boss ? 2.2 : 1.4;
      roundRect(bx, by, bw, bh, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#4a2f14'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.font = `${Math.max(9, 11 * Math.min(1, k * 1.3))}px "Noto Sans TC",sans-serif`; ctx.fillText('作品編號', x, by + bh * 0.3);
      ctx.font = `bold ${Math.max(13, 18 * Math.min(1, k * 1.3))}px "Noto Sans TC",sans-serif`; ctx.fillText(p.id, x, by + bh * 0.7);
      if (p.boss && !done) star(bx + bw - 2, by + 2, 4, 1, 0);
      if (done && IMGS.onigiri) ctx.drawImage(IMGS.onigiri, bx - 9, by - 9, 20, 20);
    });
  }
  function afanFrame(now) {
    if (st.act) { const f = Math.min(SPR.get.n, 1 + Math.floor((now - st.act.t0) / 1000 * SPR.get.fps)); return ['get', f]; }
    if (st.crouch) return ['crouch', Math.min(SPR.crouch.n, 1 + Math.floor((now - st.crouchT0) / 1000 * SPR.crouch.fps))];
    const set = st.dir < 0 ? 'walkL' : 'walkR', moving = st.targetS != null && !st.busy && !st.hold;
    return [set, moving ? 1 + Math.floor(st.walkT * SPR[set].fps) % SPR[set].n : 1];
  }
  function drawAfan(k, now) {
    const a = atS(st.afanS), x = a.x * k, y = (a.y + bridgeOffset(a.x)) * k + 4, h = Math.max(96, 0.17 * st.H);
    const [set, f] = afanFrame(now), im = IMGS[set + f]; st.afanSet = set;
    if (im) {
      const sc = h / 200, base = SPR[set].base * 2 / 3, w = im.width * sc;
      ctx.fillStyle = 'rgba(40,25,10,0.22)'; ctx.beginPath(); ctx.ellipse(x, y, w * 0.3, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.save(); ctx.translate(x, y); if (set.startsWith('walk')) ctx.rotate(Math.max(-0.15, Math.min(0.15, a.ang * 0.35)));
      ctx.drawImage(im, -w / 2, -base * sc, w, im.height * sc); ctx.restore();
    }
    if (st.fly) {
      const t = Math.min(1, (now - st.fly.t0) / 700), hx = x, hy = y - h * 0.42;
      const fx = st.fly.x0 + st.camX + (hx - st.fly.x0 - st.camX) * t, fy = st.fly.y0 + (hy - st.fly.y0) * t - Math.sin(t * Math.PI) * 60;
      const oi = IMGS[st.fly.golden ? 'onigiriGold' : 'onigiri'];
      if (oi && !st.fly.eat) ctx.drawImage(oi, fx - 15, fy - 15, 30, 30);
    }
    if (st.bubble > 0) {
      const bx = Math.max(st.camX + 70, Math.min(st.camX + st.vw - 70, x));
      ctx.globalAlpha = Math.min(1, st.bubble); ctx.fillStyle = '#fffaf0'; ctx.strokeStyle = '#6b4a24';
      roundRect(bx - 66, y - h - 36, 132, 26, 13); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#5a3b1c'; ctx.font = '13px "Noto Sans TC",sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('好香的飯糰，謝謝你！', bx, y - h - 23); ctx.globalAlpha = 1;
    }
    if (st.onBridge && st.sway > 3) {
      const r = Math.min(1, st.sway / 46); ctx.fillStyle = 'rgba(255,250,236,0.9)'; ctx.strokeStyle = '#6b4a24'; ctx.lineWidth = 1;
      roundRect(x - 30, y + 10, 60, 8, 4); ctx.fill(); ctx.stroke();
      ctx.fillStyle = r > 0.75 ? '#c0583a' : GOLD; roundRect(x - 29, y + 11, 58 * r, 6, 3); ctx.fill();
    }
  }
  function drawNear(k, vx0, vx1) {
    CHAPTERS.forEach(c => {
      const im = layer(c.near); if (!im) return;
      const sx0 = c.x0 * k - st.camX, sw = SW * k, nx0 = c.x0 * k * 1.2 - st.camX * 1.2;
      if (sx0 > vx1 || sx0 + sw < vx0) return;
      ctx.save(); ctx.beginPath(); ctx.rect(sx0, -st.H, sw, st.H * 3); ctx.clip();
      const nh = st.H * 0.15 * im.height / 345, tw = im.width * (st.H * 0.15) / 345, y = st.H - nh;
      let i = Math.floor((vx0 - nx0) / tw) - 1;
      for (let x = nx0 + i * tw; x < vx1; x += tw, i++) {
        if (i % 2) { ctx.save(); ctx.translate(x + tw, y); ctx.scale(-1, 1); ctx.drawImage(im, 0, 0, tw, nh); ctx.restore(); }
        else ctx.drawImage(im, x, y, tw, nh);
      }
      ctx.restore();
    });
  }
  function drawFog(k, now) {
    const ex = st.fogX * k - st.camX; if (ex > st.vw + 260) return;
    const fa = st.ride ? 0.35 : 1;
    ctx.save(); ctx.globalAlpha = fa;
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
    if (ex < st.vw - 40 && !st.ride) { ctx.fillStyle = 'rgba(120,100,70,0.75)'; ctx.font = '13px "Noto Sans TC",sans-serif'; ctx.textAlign = 'center'; ctx.fillText('霧裡還沒探索', Math.min(st.vw - 60, ex + 110), st.H * 0.4); }
    ctx.restore();
  }
  function drawBirds(k) {
    st.birds.forEach(b => {
      const x = b.x * k - st.camX, y = b.y * k, f = Math.sin(b.t * 18) * 6;
      ctx.fillStyle = '#7b5232'; ctx.beginPath(); ctx.ellipse(x, y, 8, 5, -0.2, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#5a3b22'; ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x - 10, y - 6 - f); ctx.lineTo(x + 4, y - 3); ctx.fill();
      ctx.fillStyle = '#efe0c8'; ctx.beginPath(); ctx.arc(x + 7, y - 2, 3.5, 0, Math.PI * 2); ctx.fill();
    });
  }

  // ---------- 關卡開放與散步卡 ----------
  function openStage(i) {
    const g = STAGES[i]; g.open = true; g.openT = 0; st.flash = 1;
    for (let n = 0; n < 4; n++) st.birds.push({ x: g.gateX - 20 + n * 15, y: atS(g.s).y - 90 - n * 12, vx: 120 + n * 30, vy: -40 - n * 10, t: -n * 0.15 });
    renderStages();
    if (i < STAGES.length - 1) toast(`${STAGES[i + 1].name}開放了！霧散開了，繼續往前走吧`, 4200);
    else { toast('六段小路都走完了，阿飯拿到散步卡！', 4200); setTimeout(showCard, 1600); }
  }
  function showCard() {
    $('card-list').innerHTML = POINTS.map(p => { const r = records.find(x => x.id === p.id); return `<li>${STAGES[p.stage].name}，作品編號 ${p.id}，${r ? sizeLabel(r.size, r.type) : '未收'}</li>`; }).join('');
    const d = new Date(); $('card-date').textContent = `散步日 ${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    $('card').hidden = false;
  }
  $('card-close').addEventListener('click', () => { $('card').hidden = true; });

  // 餵飯糰：飛過來，播拿飯糰動畫，記錄
  function feed(p, size, type) {
    st.busy = true;
    st.fly = { t0: performance.now(), x0: st.vw / 2, y0: 40, golden: type === 'golden' };
    setTimeout(() => {
      st.act = { t0: performance.now() }; if (st.fly) st.fly.eat = true;
      setTimeout(() => {
        st.act = null; st.fly = null; st.bubble = 2.2; st.busy = false;
        records = records.filter(r => r.id !== p.id).concat({ id: p.id, date: today(), size, type }); persist();
        renderStages();
        toast(`阿飯收下${sizeLabel(size, type)}，${STAGES[p.stage].name} ${stageCount(p.stage)}／${STAGES[p.stage].pts.length}`);
        const g = STAGES[p.stage];
        if (!g.open && stageCount(p.stage) >= g.pts.length) setTimeout(() => openStage(p.stage), 700);
      }, SPR.get.n / SPR.get.fps * 1000);
    }, 720);
  }

  // ---------- 棚田：接稻穗 ----------
  const H = { on: false };
  const HD = { spawn: 520, leaf: 0.25, vMin: 150, vRange: 90, sparrow: 2600 };
  function startHarvest(p) {
    st.busy = true;
    Object.assign(H, { on: true, p, D: HD, score: 0, golden: false, items: [], birds: [], t0: performance.now(), lastSpawn: 0, lastBird: performance.now() - HD.sparrow * 0.6, x: 0.5, ended: false, moveT: 0, hitT: 0, dir: 1 });
    $('h-label').textContent = `棚田關主，作品編號 ${p.id}`; $('h-hint').textContent = '左右拖曳阿飯接住稻穗，小心麻雀，金色稻穗能做成黃金飯糰';
    $('h-birds').innerHTML = ''; $('h-score').textContent = '已收 0 束'; $('h-timer').textContent = '剩餘 10 秒';
    $('h-items').innerHTML = ''; $('h-result').hidden = true; $('harvest').hidden = false;
    $('h-afan-img').src = A.walkR(1);
    placeHarvestAfan(); requestAnimationFrame(stepHarvest);
  }
  function placeHarvestAfan() { const f = $('h-field'), a = $('h-afan'); a.style.left = (H.x * f.clientWidth) + 'px'; }
  function stepHarvest(now) {
    if (!H.on || H.ended) return;
    const field = $('h-field'), fw = field.clientWidth, fh = field.clientHeight, el = now - H.t0;
    const left = Math.max(0, 10 - el / 1000);
    $('h-timer').textContent = `剩餘 ${Math.ceil(left)} 秒`;
    const D = H.D, slow = reduceMotion ? 0.5 : 1;
    if (now - H.lastSpawn > D.spawn) {
      H.lastSpawn = now; const r = Math.random();
      const kind = r < 0.05 ? 'golden' : r < 1 - D.leaf ? 'rice' : 'leaf';
      const img = document.createElement('img');
      img.src = kind === 'golden' ? 'sprites/rice_golden.png' : kind === 'rice' ? 'v5/items/rice_ears.webp' : 'sprites/' + ['maple_red', 'maple_yellow', 'ginkgo', 'oak'][Math.floor(Math.random() * 4)] + '.png';
      img.alt = ''; $('h-items').appendChild(img);
      H.items.push({ el: img, kind, x: 20 + Math.random() * (fw - 60), y: -50, v: (D.vMin + Math.random() * D.vRange) * slow, last: now });
    }
    const ax = H.x * fw, ay = fh - 8 - 70;
    if (now - H.lastBird > D.sparrow) {
      H.lastBird = now; const dir = Math.random() < 0.5 ? 1 : -1, img = document.createElement('img');
      img.src = 'items/sparrow_4.webp'; img.alt = ''; $('h-birds').appendChild(img);
      H.birds.push({ el: img, dir, x: dir > 0 ? -60 : fw + 10, y: ay - 80 + Math.random() * 70, v: (170 + Math.random() * 70) * slow, last: now, hit: false });
    }
    H.birds = H.birds.filter(b => {
      const dt = Math.min(0.05, (now - b.last) / 1000); b.last = now; b.x += b.dir * b.v * dt;
      const by = b.y + Math.sin(now / 90 + b.v) * 4;
      b.el.style.transform = `translate(${b.x}px,${by}px) scaleX(${b.dir > 0 ? 1 : -1})`;
      const cx = b.x + 27, cy = by + 20;
      H.items = H.items.filter(it => { if (it.kind !== 'leaf' && Math.abs(it.x + 21 - cx) < 30 && Math.abs(it.y + 25 - cy) < 30) { it.el.remove(); return false; } return true; });
      if (!b.hit && Math.abs(cx - ax) < 44 && cy > ay - 10 && cy < ay + 60) { b.hit = true; H.score = Math.max(0, H.score - 2); H.hitT = now; $('h-score').textContent = `已收 ${H.score} 束，被叼走兩束`; $('h-afan').classList.add('hit'); }
      if (b.x < -80 || b.x > fw + 80) { b.el.remove(); return false; }
      return true;
    });
    if (H.hitT && now - H.hitT > 500) { H.hitT = 0; $('h-afan').classList.remove('hit'); }
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
    if (H.moveT && now - H.moveT < 150) $('h-afan-img').src = H.dir < 0 ? A.walkL(1 + Math.floor(now / 83) % SPR.walkL.n) : A.walkR(1 + Math.floor(now / 83) % SPR.walkR.n);
    if (left <= 0) return finishHarvest(false);
    requestAnimationFrame(stepHarvest);
  }
  function finishHarvest(skipped) {
    if (H.ended) return; H.ended = true; $('h-afan').classList.remove('hit');
    let size = 'small', type = 'normal';
    if (!skipped) { size = H.score >= 12 ? 'large' : H.score >= 6 ? 'medium' : 'small'; type = H.golden ? 'golden' : 'normal'; }
    const res = $('h-result'); res.textContent = `收了 ${H.score} 束稻穗，做成${sizeLabel(size, type)}！`; res.hidden = false;
    setTimeout(() => { $('harvest').hidden = true; H.on = false; feed(H.p, size, type); }, skipped ? 700 : 1400);
  }
  $('h-skip').addEventListener('click', () => finishHarvest(true));
  (function bindHarvestDrag() {
    const a = $('h-afan'); let drag = false;
    a.addEventListener('pointerdown', e => { drag = true; a.setPointerCapture(e.pointerId); e.preventDefault(); });
    a.addEventListener('pointermove', e => {
      if (!drag) return; const r = $('h-field').getBoundingClientRect();
      const nx = Math.max(0.06, Math.min(0.94, (e.clientX - r.left) / r.width)); if (Math.abs(nx - H.x) > 0.002) H.dir = nx > H.x ? 1 : -1;
      H.x = nx; H.moveT = performance.now(); placeHarvestAfan();
    });
    const end = () => { drag = false; }; a.addEventListener('pointerup', end); a.addEventListener('pointercancel', end);
  })();

  // ---------- 清津峽：過吊橋 ----------
  function bridgeResult(p) {
    if (!st.bridgeDone) { toast('先走過長吊橋，再回來找這塊立牌', 2600); return; }
    const w = st.wobbles, size = w === 0 ? 'large' : w <= 2 ? 'medium' : 'small', type = w === 0 ? 'golden' : 'normal';
    toast(w === 0 ? '一次都沒蹲下，吊橋關主送你黃金大飯糰' : `過橋時蹲下 ${w} 次，送你${sizeLabel(size, type)}`, 3000);
    feed(p, size, type);
  }

  // ---------- 苗場：纜車 ----------
  function startRide(p) {
    st.busy = true;
    const a = atS(st.afanS), sp = [0, 1, 2].map(i => ({ t: 2 + i * 2.2, x: 0.25 + i * 0.25, y: 0.22 + (i % 2) * 0.12, got: false }));
    st.ride = { p, t0: performance.now(), z: 1, ry: 0, sp, got: 0, ax: a.x };
    toast('坐上纜車看看遠方，點一點閃亮的星星', 3000);
  }
  function updateRide(now) {
    const R = st.ride, t = (now - R.t0) / 1000, D = 9, u = Math.min(1, t / D);
    const e = u < 0.2 ? u / 0.2 : u > 0.8 ? (1 - u) / 0.2 : 1, ease = e * e * (3 - 2 * e);
    R.z = 1 - 0.45 * ease; R.ry = st.H * 0.35 * ease;
    if (t >= D) {
      st.ride = null; const n = R.sp.filter(s => s.got).length;
      const size = n >= 3 ? 'large' : n === 2 ? 'medium' : 'small';
      toast(`纜車回到山腳，收集了 ${n} 顆星星`, 2600); feed(R.p, size, n >= 3 ? 'golden' : 'normal');
    }
  }
  function drawRideUI(now) {
    const R = st.ride, t = (now - R.t0) / 1000, vw = st.vw, H = st.H;
    const u = Math.min(1, t / 9), gx = vw * 0.5 + Math.sin(u * Math.PI) * 30, gy = H * (0.5 - 0.25 * Math.sin(u * Math.PI)) + Math.sin(t * 2) * 3;
    ctx.strokeStyle = 'rgba(60,50,40,0.7)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-20, gy - 60 + 80); ctx.lineTo(vw + 20, gy - 60 - 80); ctx.stroke();
    const im = IMGS.naeba_gondola; if (im) { const h = Math.min(170, H * 0.24), w = h * im.width / im.height; ctx.drawImage(im, gx - w / 2, gy - 60, w, h); }
    R.sp.forEach(s => {
      if (s.got || t < s.t || t > s.t + 3) { s.rect = null; return; }
      const x = vw * s.x, y = H * s.y + Math.sin(t * 3 + s.x * 9) * 6, a = Math.min(1, (t - s.t) * 3, (s.t + 3 - t) * 3);
      s.rect = { x, y }; star(x, y, 12, a, t * 2);
    });
    ctx.fillStyle = 'rgba(60,40,20,0.8)'; ctx.font = '13px "Noto Sans TC",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`纜車散步，星星 ${R.sp.filter(s => s.got).length}／3`, vw / 2, 22);
  }
  function tapRide(x, y) {
    const R = st.ride; const s = R.sp.find(s => s.rect && Math.hypot(s.rect.x - x, s.rect.y - y) < 36);
    if (s) { s.got = true; fx.push({ type: 'plus', x: (st.camX + x) / st.k, y: y / st.k, life: 1.2, t0: performance.now() }); }
  }

  // ---------- 輕互動（幾秒鐘，可跳過，給小飯糰） ----------
  const MINI = {
    hat: ['幫稻草人戴斗笠', '把斗笠拖到稻草人頭上'],
    shoo: ['趕走麻雀', '點一點三隻麻雀，讓牠們飛走'],
    kaki: ['摘柿子', '點一點樹上的柿子，讓它掉進籃子'],
    chalk: ['擦黑板', '用手指在黑板上擦一擦，看看底下畫了什麼'],
    desk: ['打開課桌', '點一下課桌的桌蓋'],
    leaf: ['接落葉', '點住飄下來的三片葉子'],
    stone: ['翻石頭', '點一下石頭，看看底下有誰'],
    heron: ['白鷺', '輕輕點一下白鷺'],
    boat: ['推小船', '點三下，把小船推到岸邊'],
    butterfly: ['蝴蝶停花', '把蝴蝶拖到花上'],
    bloom: ['開花', '點三下花苞，讓它開花'],
    icicle: ['冰柱', '點三下屋簷，讓冰柱掉下來'],
    sled: ['滑雪橇', '點一下雪橇，讓它滑下坡']
  };
  const IT = n => `v5/items/${n}.webp`;
  const M = { on: false };
  function startMini(p) {
    st.busy = true;
    Object.assign(M, { on: true, p, type: p.mini, done: false, n: 0 });
    $('m-label').textContent = `作品編號 ${p.id}`; $('m-title').textContent = MINI[p.mini][0];
    $('m-hint').textContent = MINI[p.mini][1]; $('m-result').hidden = true;
    const box = $('m-play'); box.className = 'm-play m-' + p.mini;
    const sign = `<span class="sign">作品編號 ${p.id}</span>`;
    const O = '<img class="oni" src="sprites/onigiri.png" alt="飯糰">';
    const html = {
      hat: `<div class="scare"><img src="items/scarecrow_nohat.webp" alt="稻草人" draggable="false">${sign}</div><img id="m-hat" class="hat" src="items/straw_hat.webp" alt="斗笠" draggable="false">`,
      shoo: `${sign}<div class="field">${[0, 1, 2].map(i => `<button type="button" class="sp tap1" style="left:${15 + i * 28}%;top:${30 + (i % 2) * 22}%" aria-label="麻雀"><img src="items/sparrow_${i % 2 ? 2 : 1}.webp" alt=""></button>`).join('')}</div>`,
      kaki: `${sign}<div class="branch">${[0, 1, 2].map(i => `<button type="button" class="fruit tap1" style="left:${20 + i * 25}%;top:${18 + (i % 2) * 14}%" aria-label="柿子"><img src="items/persimmon_fruit.webp" alt=""></button>`).join('')}<div class="basket">${O}</div></div>`,
      chalk: `${sign}<div class="board"><img src="${IT('school_chalkboard')}" alt="黑板" draggable="false"><canvas id="m-chalk"></canvas></div>`,
      desk: `${sign}<button type="button" class="desk tapN" data-n="1" aria-label="課桌"><img src="${IT('school_desk')}" alt="">${O}</button>`,
      leaf: `${sign}<div class="sky">${[0, 1, 2].map(i => `<button type="button" class="leaf tap1" style="left:${12 + i * 30}%;animation-delay:${i * 0.6}s" aria-label="葉子"><img src="${IT('gorge_leaf')}" alt=""></button>`).join('')}</div>`,
      stone: `${sign}<div class="bank"><img class="crab" src="${IT('gorge_crab')}" alt="螃蟹"><button type="button" class="stone tapN" data-n="1" aria-label="石頭"><img src="${IT('gorge_stone')}" alt=""></button></div>`,
      heron: `${sign}<div class="bank">${O}<button type="button" class="heron tapN" data-n="1" aria-label="白鷺"><img src="${IT('river_heron')}" alt=""></button></div>`,
      boat: `${sign}<div class="river"><div class="shore">${O}</div><button type="button" class="boat tapN" data-n="3" aria-label="小船"><img src="${IT('river_rowboat')}" alt=""></button></div>`,
      butterfly: `${sign}<div class="meadow"><img class="flower" src="${IT('naeba_flower')}" alt="花" draggable="false"><img id="m-bfly" class="bfly" src="${IT('naeba_butterfly')}" alt="蝴蝶" draggable="false"></div>`,
      bloom: `${sign}<div class="meadow"><button type="button" class="bud tapN" data-n="3" aria-label="花苞"><img src="${IT('naeba_flower')}" alt=""></button></div>`,
      icicle: `${sign}<div class="eave">${[0, 1, 2].map(i => `<img class="ice" style="left:${25 + i * 22}%" src="${IT('snow_icicle')}" alt="">`).join('')}<button type="button" class="roof tapN" data-n="3" aria-label="屋簷"></button></div>`,
      sled: `${sign}<div class="slope"><button type="button" class="sled tapN" data-n="1" aria-label="雪橇"><img src="${IT('snow_sled')}" alt=""></button>${O}</div>`
    }[p.mini];
    box.innerHTML = html;
    // 點一次就消失的目標（全部點完算完成）
    const ones = box.querySelectorAll('.tap1');
    ones.forEach(b => b.addEventListener('click', () => { if (M.done || b.classList.contains('gone')) return; b.classList.add('gone'); if (box.querySelectorAll('.tap1:not(.gone)').length === 0) { box.classList.add('win'); miniDone(1200); } }));
    // 點 N 下的目標
    box.querySelectorAll('.tapN').forEach(b => b.addEventListener('click', () => {
      if (M.done) return; M.n++; b.dataset.k = M.n; b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake');
      if (M.n >= +b.dataset.n) { box.classList.add('win'); miniDone(1300); }
    }));
    if (p.mini === 'hat') bindHat();
    if (p.mini === 'butterfly') bindDrag($('m-bfly'), box.querySelector('.flower'), () => { box.classList.add('win'); miniDone(1200); });
    $('mini').hidden = false;
    if (p.mini === 'chalk') setupChalk();
  }
  function setupChalk() {
    const cv = $('m-chalk'), r = cv.getBoundingClientRect(); cv.width = r.width; cv.height = r.height;
    const c = cv.getContext('2d');
    // 底下畫好的飯糰圖案（只用圖，不寫字）
    const draw0 = () => { c.globalCompositeOperation = 'source-over'; c.fillStyle = '#3e5a46'; c.fillRect(0, 0, cv.width, cv.height); c.strokeStyle = 'rgba(255,255,255,0.35)'; c.lineWidth = 2; for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(Math.random() * cv.width, Math.random() * cv.height); c.lineTo(Math.random() * cv.width, Math.random() * cv.height); c.stroke(); } };
    draw0(); c.globalCompositeOperation = 'destination-out';
    let down = false;
    const wipe = e => { const b = cv.getBoundingClientRect(); c.beginPath(); c.arc(e.clientX - b.left, e.clientY - b.top, 22, 0, Math.PI * 2); c.fill(); };
    cv.addEventListener('pointerdown', e => { down = true; cv.setPointerCapture(e.pointerId); wipe(e); });
    cv.addEventListener('pointermove', e => { if (down) wipe(e); });
    cv.addEventListener('pointerup', () => {
      down = false; if (M.done) return;
      const d = c.getImageData(0, 0, cv.width, cv.height).data; let clear = 0; for (let i = 3; i < d.length; i += 32) if (d[i] < 20) clear++;
      if (clear / (d.length / 32) > 0.4) { cv.classList.add('gone'); miniDone(1200); }
    });
  }
  function bindDrag(el, target, ok) {
    let d = null;
    el.addEventListener('pointerdown', e => { if (M.done) return; d = { x: e.clientX, y: e.clientY, l: el.offsetLeft, t: el.offsetTop }; el.setPointerCapture(e.pointerId); e.preventDefault(); });
    el.addEventListener('pointermove', e => { if (!d) return; el.style.left = (d.l + e.clientX - d.x) + 'px'; el.style.top = (d.t + e.clientY - d.y) + 'px'; });
    const up = () => { if (!d) return; d = null; const a = el.getBoundingClientRect(), b = target.getBoundingClientRect();
      if (Math.abs(a.left + a.width / 2 - (b.left + b.width / 2)) < b.width * 0.6 && Math.abs(a.top + a.height / 2 - (b.top + b.height * 0.25)) < b.height * 0.35) { el.classList.add('land'); ok(); } };
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  }
  function bindHat() {
    const hat = $('m-hat'), scare = () => $('m-play').querySelector('.scare img');
    let d = null;
    hat.addEventListener('pointerdown', e => { if (M.done) return; d = { x: e.clientX, y: e.clientY, l: hat.offsetLeft, t: hat.offsetTop }; hat.setPointerCapture(e.pointerId); e.preventDefault(); });
    hat.addEventListener('pointermove', e => { if (!d) return; hat.style.left = (d.l + e.clientX - d.x) + 'px'; hat.style.top = (d.t + e.clientY - d.y) + 'px'; });
    const up = () => {
      if (!d) return; d = null;
      const h = hat.getBoundingClientRect(), s = scare().getBoundingClientRect(), b = $('m-play').getBoundingClientRect();
      if (Math.abs(h.left + h.width / 2 - (s.left + s.width * 0.5)) < s.width * 0.3 && Math.abs(h.top + h.height * 0.6 - (s.top + s.height * 0.22)) < s.height * 0.16) {
        hat.style.width = s.width * 0.554 + 'px'; hat.style.left = (s.left - b.left + s.width * 0.228) + 'px'; hat.style.top = (s.top - b.top + s.height * 0.091) + 'px';
        hat.classList.add('on'); miniDone(1300);
      }
    };
    hat.addEventListener('pointerup', up); hat.addEventListener('pointercancel', up);
  }
  function miniDone(ms) {
    if (M.done) return; M.done = true;
    setTimeout(() => { $('m-result').textContent = '拿到小飯糰！'; $('m-result').hidden = false; }, Math.max(0, ms - 700));
    setTimeout(closeMini, ms + 500);
  }
  function closeMini() { if (!M.on) return; M.on = false; M.done = true; $('mini').hidden = true; $('m-play').innerHTML = ''; feed(M.p, 'small', 'normal'); }
  $('m-skip').addEventListener('click', closeMini);

  // ---------- 大互動：敲鐘、釣魚、堆雪人 ----------
  const BIG = {
    bell: ['敲校鐘', '8 秒內一直點校鐘，鐘聲會把山村的動物叫出來'],
    fish: ['信濃川釣魚', '浮標沉下去的瞬間點一下，共三回'],
    snowman: ['堆雪人', '在雪地上拖著雪球滾來滾去讓它變大，滾兩顆疊成雪人']
  };
  const B = { on: false };
  function startBig(p, kind) {
    st.busy = true;
    Object.assign(B, { on: true, p, kind, done: false, score: 0, timers: [] });
    $('b-label').textContent = `${STAGES[p.stage].name}關主，作品編號 ${p.id}`; $('b-title').textContent = BIG[kind][0]; $('b-hint').textContent = BIG[kind][1];
    $('b-result').hidden = true; $('b-result').textContent = ''; const box = $('b-play'); box.className = 'b-play b-' + kind;
    if (kind === 'bell') {
      box.innerHTML = `<div class="belltime"><span id="b-time">剩餘 8 秒</span><span id="b-count">0 聲</span></div><button type="button" id="b-bell" class="bell" aria-label="校鐘"><img src="${IT('school_bell')}" alt=""></button><div id="b-zoo" class="zoo"></div>`;
      const zoo = ['items/cat_1.webp', 'items/sparrow_1.webp', 'items/dragonfly_1.webp', 'items/sparrow_2.webp', 'items/cat_3.webp'];
      const t0 = performance.now();
      $('b-bell').addEventListener('click', () => {
        if (B.done) return; B.score++; $('b-count').textContent = `${B.score} 聲`;
        const b = $('b-bell'); b.classList.remove('ring'); void b.offsetWidth; b.classList.add('ring');
        if (B.score % 4 === 0) { const im = document.createElement('img'); im.src = zoo[(B.score / 4 - 1) % zoo.length]; im.alt = ''; im.style.left = (8 + Math.random() * 80) + '%'; $('b-zoo').appendChild(im); }
      });
      const tick = () => { if (!B.on || B.done) return; const left = 8 - (performance.now() - t0) / 1000; $('b-time').textContent = `剩餘 ${Math.max(0, Math.ceil(left))} 秒`; if (left <= 0) { const s = B.score; endBig(s >= 30 ? 'large' : s >= 15 ? 'medium' : 'small', s >= 40 ? 'golden' : 'normal', `敲了 ${s} 聲`); } else requestAnimationFrame(tick); };
      requestAnimationFrame(tick);
    } else if (kind === 'fish') {
      box.innerHTML = `<div class="water"><button type="button" id="b-float" class="float" aria-label="浮標"><img src="${IT('river_float')}" alt=""></button><div class="ripple"></div><div id="b-fish" class="fish"></div><span id="b-round" class="round">第 1 回</span></div>`;
      B.round = 0; B.sink = 0; fishRound();
      $('b-float').addEventListener('click', () => {
        if (B.done || B.waiting) return;
        const ok = B.sink && performance.now() - B.sink < 900;
        B.waiting = true; B.timers.forEach(clearTimeout);
        $('b-float').classList.remove('sink'); if (ok) { B.score++; $('b-fish').classList.add('show'); }
        $('b-hint').textContent = ok ? '釣到了！' : B.sink ? '慢了一點，魚跑掉了' : '太早了，魚嚇跑了';
        B.timers.push(setTimeout(fishRound, 1100));
      });
    } else {
      box.innerHTML = `<div class="snowfield"><div id="b-body" class="body"></div><div id="b-ball" class="ball"></div><span id="b-stage" class="round">第一顆雪球</span><img id="b-man" class="man" src="${IT('snow_snowman')}" alt="雪人" hidden></div>`;
      B.stage = 0; B.r = 22; B.t0 = performance.now(); bindSnow();
    }
    $('big').hidden = false;
  }
  function fishRound() {
    if (!B.on || B.done) return;
    B.round++; B.sink = 0; B.waiting = false; $('b-fish').classList.remove('show');
    if (B.round > 3) { const s = B.score; return endBig(s >= 3 ? 'large' : s === 2 ? 'medium' : 'small', s >= 3 ? 'golden' : 'normal', `釣到 ${s} 條魚`); }
    $('b-round').textContent = `第 ${B.round} 回`; $('b-hint').textContent = BIG.fish[1];
    const wait = 1200 + Math.random() * 2200;
    B.timers.push(setTimeout(() => { if (!B.on) return; B.sink = performance.now(); $('b-float').classList.add('sink'); }, wait));
    B.timers.push(setTimeout(() => { if (!B.on || B.waiting) return; $('b-float').classList.remove('sink'); B.waiting = true; $('b-hint').textContent = '魚跑掉了'; B.timers.push(setTimeout(fishRound, 900)); }, wait + 1300));
  }
  function bindSnow() {
    const ball = $('b-ball'), f = ball.parentElement; let d = null, lastX = 0, lastY = 0;
    const place = () => { ball.style.width = ball.style.height = B.r * 2 + 'px'; };
    place();
    ball.addEventListener('pointerdown', e => { if (B.done) return; d = true; lastX = e.clientX; lastY = e.clientY; ball.setPointerCapture(e.pointerId); e.preventDefault(); });
    ball.addEventListener('pointermove', e => {
      if (!d) return; const r = f.getBoundingClientRect();
      const dist = Math.hypot(e.clientX - lastX, e.clientY - lastY); lastX = e.clientX; lastY = e.clientY;
      ball.style.left = Math.max(0, Math.min(r.width - B.r * 2, e.clientX - r.left - B.r)) + 'px';
      ball.style.top = Math.max(0, Math.min(r.height - B.r * 2, e.clientY - r.top - B.r)) + 'px';
      B.r = Math.min(B.stage ? 46 : 64, B.r + dist * 0.035); place();
      if (B.r >= (B.stage ? 46 : 64)) { d = false; snowNext(); }
    });
    ball.addEventListener('pointerup', () => { d = false; });
  }
  function snowNext() {
    if (B.stage === 0) {
      B.stage = 1; const body = $('b-body'); body.style.width = body.style.height = '128px'; body.classList.add('on');
      B.r = 20; const ball = $('b-ball'); ball.style.left = '10px'; ball.style.top = '10px'; ball.style.width = ball.style.height = '40px';
      $('b-stage').textContent = '第二顆雪球，滾小一點';
    } else {
      $('b-ball').hidden = true; $('b-body').hidden = true; $('b-man').hidden = false; $('b-man').classList.add('on');
      const sec = (performance.now() - B.t0) / 1000; endBig('large', sec < 10 ? 'golden' : 'normal', `花了 ${Math.round(sec)} 秒堆好雪人`);
    }
  }
  function endBig(size, type, msg) {
    if (B.done) return; B.done = true; B.timers.forEach(clearTimeout);
    $('b-result').textContent = `${msg}，做成${sizeLabel(size, type)}！`; $('b-result').hidden = false;
    setTimeout(() => { $('big').hidden = true; $('b-play').innerHTML = ''; B.on = false; feed(B.p, size, type); }, 1500);
  }
  $('b-skip').addEventListener('click', () => { if (!B.on) return; B.done = true; B.timers.forEach(clearTimeout); $('big').hidden = true; $('b-play').innerHTML = ''; B.on = false; feed(B.p, 'small', 'normal'); });

  // ---------- 操作 ----------
  let ptr = null;
  canvas.addEventListener('pointerdown', e => { ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, cam: st.camX, drag: false }; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (!ptr || ptr.id !== e.pointerId || st.ride) return;
    const dx = e.clientX - ptr.x;
    if (!ptr.drag && Math.abs(dx) > 8) { ptr.drag = true; canvas.classList.add('dragging'); }
    if (ptr.drag) { st.follow = false; st.camX = ptr.cam - dx; clampCam(); }
  });
  canvas.addEventListener('pointerup', e => {
    if (!ptr) return; const wasDrag = ptr.drag; ptr = null; canvas.classList.remove('dragging');
    const r = canvas.getBoundingClientRect();
    if (st.ride) return tapRide(e.clientX - r.left, e.clientY - r.top);
    if (wasDrag || st.busy) return;
    tapAt((e.clientX - r.left + st.camX) / st.k, (e.clientY - r.top) / st.k);
  });
  canvas.addEventListener('pointercancel', () => { ptr = null; canvas.classList.remove('dragging'); });
  canvas.addEventListener('wheel', e => { e.preventDefault(); if (st.ride) return; st.follow = false; st.camX += Math.max(-60, Math.min(60, (Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY))); clampCam(); }, { passive: false });
  function tapAt(wx, wy) {
    // 在吊橋上：點一下停住讓橋靜下來，再點一下繼續走
    if (st.onBridge && (st.targetS != null)) { st.hold = !st.hold; toast(st.hold ? '停一下，等橋靜下來' : '繼續走', 1200); return; }
    if (tapProp(wx, wy)) return;
    const tagPad = 90 / st.k;
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

  // ---------- 四季 ----------
  const sel = $('season');
  sel.value = season;
  sel.addEventListener('change', () => {
    season = sel.value; seasonPick = season; persist();
    loadSeason(season, chapterAt(atS(st.afanS).x).i);
    toast(`換成${SEASON_NAME[season]}天的風景`, 1800);
  });

  $('reset').addEventListener('click', () => {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* 略過 */ }
    records = []; bonus = []; seasonPick = null; season = realSeason(); sel.value = season;
    syncGatesFromRecords(); renderBonus(); PROPS.forEach(p => { p.t0 = -1e9; });
    Object.assign(st, { afanS: sAtX(140), targetS: null, targetPoint: null, camX: 0, dir: 1, fogX: 0, busy: false, act: null, fly: null, sway: 0, crouch: false, hold: false, wobbles: 0, onBridge: null, bridgeDone: false, ride: null });
    st.maxS = st.afanS; renderStages(); toast('重新開始，阿飯回到棚田入口了');
  });
  window.addEventListener('resize', resize);

  /*TEST_HOOK*/

  renderStages(); renderBonus(); resize();
  Promise.all([loadCore(), loadSeason(season, 0).then(() => null)]).then(() => requestAnimationFrame(loop));
})();
