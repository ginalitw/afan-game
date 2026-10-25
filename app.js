(() => {
  'use strict';

  /**
   * Asset Mapping Config (relative to /proto/index.html, spaces and parentheses URL-encoded)
   */
  const ASSET_CONFIG = {
    backgrounds: {
      winter: 'assets/seasons/scene_9.jpg',
      autumn: 'assets/seasons/scene_10.jpg',
      summer: 'assets/seasons/scene_11.jpg',
      spring: 'assets/seasons/scene_12.jpg'
    },
    autumnLayers: {
      far: 'assets/autumn/far.png',
      mid: 'assets/autumn/mid.png',
      near: 'assets/autumn/near.png'
    },
    sprites: {
      rice: 'sprites/rice.png',
      riceGolden: 'sprites/rice_golden.png',
      leaves: [
        'sprites/maple_red.png',
        'sprites/maple_yellow.png',
        'sprites/ginkgo.png',
        'sprites/oak.png'
      ],
      onigiri: 'sprites/onigiri.png',
      onigiriGolden: 'sprites/onigiri_golden.png',
      onigiriAndEmblems: 'assets/seasons/scene_7.jpg',
      seasonalParticles: 'assets/seasons/scene_8.jpg'
    },
    afan: {
      // Known limitation: Afan never shows a face; her bracelet is on the right wrist,
      // so mirroring sprites via scaleX(-1) when moving left swaps it to the left wrist.
      walkFrames: [
        'assets/autumn/walk_1.png',
        'assets/autumn/walk_2.png',
        'assets/autumn/walk_3.png',
        'assets/autumn/walk_4.png',
        'assets/autumn/walk_5.png',
        'assets/autumn/walk_6.png'
      ],
      actWalk1: 'assets/autumn/act_1.png',
      actWalk2: 'assets/autumn/act_2.png',
      // Use act_3_masked.png (never act_3.png) so Afan never shows a face or expression
      reaching: 'assets/autumn/act_3_masked.png',
      jumping: 'assets/autumn/act_4.png'
    }
  };

  /**
   * Season Metadata (Autumn default, override via ?season=spring|summer|autumn|winter)
   */
  const SEASON_CONFIG = {
    spring: {
      key: 'spring',
      label: '春耕水鏡',
      greeting: '春風吹過水鏡棚田，帶阿飯散步找飯糰吧',
      particleType: 'petals'
    },
    summer: {
      key: 'summer',
      label: '夏綠螢光',
      greeting: '夏日青翠棚田微風徐徐，陪阿飯一起探索步道',
      particleType: 'fireflies'
    },
    autumn: {
      key: 'autumn',
      label: '秋收金穗',
      greeting: '金色稻浪隨風搖曳，左右滑動尋找作品立牌收割稻穗餵阿飯',
      particleType: 'leaves'
    },
    winter: {
      key: 'winter',
      label: '冬雪靜謐',
      greeting: '白雪覆蓋靜謐棚田，用熱呼呼的飯糰溫暖阿飯吧',
      particleType: 'snow'
    }
  };

  /**
   * 4 Exploration Signboard Points (ID only, placeholder coordinates for 150m on-device Haversine check)
   */
  const UNLOCK_RADIUS_METERS = 150;
  const STORAGE_KEY = 'afan_fed_points_v1';
  const EDGE_MARGIN_PX = 24;
  const HARVEST_DURATION_MS = 10000;
  const GOLDEN_RICE_CHANCE = 0.05; // ~5% rare golden rice ear worth +3

  const ONIGIRI_SIZE_LABELS = {
    small: '小飯糰',
    medium: '中飯糰',
    large: '大飯糰'
  };

  const POINTS_CONFIG = [
    {
      id: '01',
      title: '作品 01',
      lat: 25.2065,
      lng: 121.5242
    },
    {
      id: '02',
      title: '作品 02',
      lat: 25.2073,
      lng: 121.5256
    },
    {
      id: '03',
      title: '作品 03',
      lat: 25.2081,
      lng: 121.5271
    },
    {
      id: '04',
      title: '作品 04',
      lat: 25.2089,
      lng: 121.5285
    }
  ];

  // Scroll distance in pixels per walk frame step, and idle timeout in ms
  const WALK_SCROLL_STEP_PX = 40;
  const WALK_IDLE_DELAY_MS = 150;

  // DOM Elements
  const appShell = document.getElementById('app-shell');
  const stageViewport = document.getElementById('stage-viewport');
  const seasonBadge = document.getElementById('season-badge');
  const feedCounter = document.getElementById('feed-counter');
  const resetBtn = document.getElementById('reset-btn');
  const statusToast = document.getElementById('status-toast');
  const scrollTrack = document.getElementById('scroll-track');
  const pointsContainer = document.getElementById('points-container');
  const progressDots = document.getElementById('progress-dots');
  const parallaxFar = document.getElementById('parallax-far');
  const parallaxMid = document.getElementById('parallax-mid');
  const parallaxNear = document.getElementById('parallax-near');
  const particleCanvas = document.getElementById('particle-canvas');
  const flyingLayer = document.getElementById('flying-layer');
  const afanActor = document.getElementById('afan-actor');
  const afanSpriteImg = document.getElementById('afan-sprite');
  const afanBubble = document.getElementById('afan-bubble');
  const seasonBtns = document.querySelectorAll('[data-season-select]');

  // Harvest Minigame DOM Elements
  const harvestOverlay = document.getElementById('harvest-overlay');
  const harvestPointLabel = document.getElementById('harvest-point-label');
  const harvestTimerEl = document.getElementById('harvest-timer');
  const harvestScoreEl = document.getElementById('harvest-score');
  const harvestSkipBtn = document.getElementById('harvest-skip-btn');
  const harvestPlayfield = document.getElementById('harvest-playfield');
  const harvestItemsLayer = document.getElementById('harvest-items-layer');
  const harvestAfan = document.getElementById('harvest-afan');
  const harvestAfanSprite = document.getElementById('harvest-afan-sprite');
  const harvestResultEl = document.getElementById('harvest-result');

  // Motion preference media query
  const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  let prefersReducedMotion = reducedMotionQuery.matches;

  // App State
  let currentSeason = 'autumn';
  let unlockedRecords = []; // Array of { id, date, size, type }
  const arrivedGoldenPointIds = new Set();
  let lastScrollLeft = 0;
  let walkStopTimer = null;
  let reactionTimer = null;
  let bubbleHideTimer = null;
  let particleAnimId = null;
  let particles = [];

  // Gentle wheel scroll & soft-snap state
  let wheelAnimId = null;
  let wheelTargetScrollLeft = 0;
  let wheelSnapTimer = null;

  // Sprite state store
  const spriteStore = {
    currentState: 'idle', // 'idle' | 'walking' | 'reaching' | 'jumping'
    walkFrameIdx: 0,
    preloadedImages: [],
    leafImages: []
  };

  // Harvest Minigame State
  const harvestState = {
    active: false,
    finishing: false,
    pointId: null,
    sourceLabel: '',
    startTime: 0,
    lastFrameTime: 0,
    lastSpawnTime: 0,
    rafId: null,
    closeTimer: null,
    score: 0,
    goldenCaught: false,
    items: [],
    isDragging: false,
    pointerId: null,
    afanX: 195,
    walkDist: 0
  };

  /**
   * Preload pre-keyed Afan PNG frames, autumn background layers, and proto/sprites/ assets
   */
  function initSprites() {
    const urlsToPreload = [
      ...ASSET_CONFIG.afan.walkFrames,
      ASSET_CONFIG.afan.actWalk1,
      ASSET_CONFIG.afan.actWalk2,
      ASSET_CONFIG.afan.reaching,
      ASSET_CONFIG.afan.jumping,
      ASSET_CONFIG.autumnLayers.far,
      ASSET_CONFIG.autumnLayers.mid,
      ASSET_CONFIG.autumnLayers.near,
      ASSET_CONFIG.sprites.rice,
      ASSET_CONFIG.sprites.riceGolden,
      ASSET_CONFIG.sprites.onigiri,
      ASSET_CONFIG.sprites.onigiriGolden,
      ...ASSET_CONFIG.sprites.leaves
    ];

    spriteStore.preloadedImages = urlsToPreload.map((url) => {
      const img = new Image();
      img.src = url;
      return img;
    });

    spriteStore.leafImages = ASSET_CONFIG.sprites.leaves.map((url) => {
      const img = new Image();
      img.src = url;
      return img;
    });

    const rootStyle = document.documentElement.style;
    rootStyle.setProperty('--onigiri-whole-url', `url("${ASSET_CONFIG.sprites.onigiri}")`);
    rootStyle.setProperty('--onigiri-golden-url', `url("${ASSET_CONFIG.sprites.onigiriGolden}")`);
    rootStyle.setProperty('--onigiri-bitten-url', `url("${ASSET_CONFIG.sprites.onigiri}")`);
    rootStyle.setProperty('--rice-url', `url("${ASSET_CONFIG.sprites.rice}")`);
    rootStyle.setProperty('--rice-golden-url', `url("${ASSET_CONFIG.sprites.riceGolden}")`);

    setAfanSpriteFrame(ASSET_CONFIG.afan.walkFrames[0]);
  }

  /**
   * Set the current PNG source on #afan-sprite <img> without redundant DOM writes
   */
  function setAfanSpriteFrame(frameUrl) {
    if (!afanSpriteImg) return;
    if (afanSpriteImg.getAttribute('src') !== frameUrl) {
      afanSpriteImg.setAttribute('src', frameUrl);
    }
  }

  /**
   * Set the current PNG source on #harvest-afan-sprite <img> in the minigame overlay
   */
  function setHarvestAfanFrame(frameUrl) {
    if (!harvestAfanSprite) return;
    if (harvestAfanSprite.getAttribute('src') !== frameUrl) {
      harvestAfanSprite.setAttribute('src', frameUrl);
    }
  }

  /**
   * Apply CSS custom property URLs from ASSET_CONFIG
   */
  function applyAssetCssVariables(seasonKey) {
    const rootStyle = document.documentElement.style;
    const bgUrl = ASSET_CONFIG.backgrounds[seasonKey] || ASSET_CONFIG.backgrounds.autumn;
    rootStyle.setProperty('--season-bg', `url("${bgUrl}")`);
    rootStyle.setProperty('--autumn-far-bg', `url("${ASSET_CONFIG.autumnLayers.far}")`);
    rootStyle.setProperty('--autumn-mid-bg', `url("${ASSET_CONFIG.autumnLayers.mid}")`);
    rootStyle.setProperty('--autumn-near-bg', `url("${ASSET_CONFIG.autumnLayers.near}")`);
    rootStyle.setProperty('--items-sprite', `url("${ASSET_CONFIG.sprites.onigiriAndEmblems}")`);
    rootStyle.setProperty('--particles-sprite', `url("${ASSET_CONFIG.sprites.seasonalParticles}")`);
  }

  /**
   * Determine initial season from ?season=spring|summer|autumn|winter (default: autumn)
   */
  function resolveInitialSeason() {
    const params = new URLSearchParams(window.location.search);
    const requested = (params.get('season') || '').toLowerCase().trim();
    if (Object.prototype.hasOwnProperty.call(SEASON_CONFIG, requested)) {
      return requested;
    }
    return 'autumn';
  }

  /**
   * Set active season and refresh background + particles
   */
  function setSeason(seasonKey, updateUrl = false) {
    if (!SEASON_CONFIG[seasonKey]) {
      seasonKey = 'autumn';
    }
    currentSeason = seasonKey;
    const meta = SEASON_CONFIG[seasonKey];

    appShell.setAttribute('data-season', seasonKey);
    seasonBadge.textContent = meta.label;
    applyAssetCssVariables(seasonKey);

    seasonBtns.forEach((btn) => {
      const isMatch = btn.getAttribute('data-season-select') === seasonKey;
      btn.classList.toggle('active', isMatch);
      btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
    });

    if (updateUrl && window.history && window.history.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set('season', seasonKey);
      window.history.replaceState({}, '', url.toString());
    }

    setStatusMessage(meta.greeting);
    initParticles();
  }

  /**
   * Format current date using slashes (no dashes in UI text)
   */
  function formatTodayDate() {
    const now = new Date();
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}/${m}/${d}`;
  }

  function normalizeOnigiriSize(size) {
    if (size === 'large' || size === 'medium' || size === 'small') {
      return size;
    }
    return 'small';
  }

  function normalizeOnigiriType(type) {
    return type === 'golden' ? 'golden' : 'normal';
  }

  /**
   * Load unlocked records from localStorage (strictly point ID, date, and 飯糰 size/type only)
   */
  function loadUnlockedRecords() {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((item) => item && typeof item.id === 'string' && typeof item.date === 'string')
        .map((item) => ({
          id: String(item.id),
          date: String(item.date).replace(/[^0-9/]/g, '/'),
          size: normalizeOnigiriSize(item.size),
          type: normalizeOnigiriType(item.type)
        }));
    } catch (_err) {
      return [];
    }
  }

  /**
   * Save unlocked records to localStorage (strictly point ID, date, and 飯糰 size/type only)
   */
  function saveUnlockedRecords() {
    try {
      const cleanPayload = unlockedRecords.map((item) => ({
        id: String(item.id),
        date: String(item.date),
        size: normalizeOnigiriSize(item.size),
        type: normalizeOnigiriType(item.type)
      }));
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanPayload));
    } catch (_err) {
      // Ignore storage quota errors in private browsing
    }
  }

  function findUnlockedRecord(pointId) {
    return unlockedRecords.find((r) => r.id === pointId) || null;
  }

  function setStatusMessage(msg) {
    if (statusToast) {
      statusToast.textContent = msg;
    }
  }

  /**
   * Compute on-device Haversine distance in meters between two coordinates
   */
  function computeHaversineMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const toRad = (deg) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Format human-readable Traditional Chinese label for a 飯糰 record
   */
  function formatOnigiriLabel(size, type) {
    const sizeText = ONIGIRI_SIZE_LABELS[normalizeOnigiriSize(size)] || '小飯糰';
    return type === 'golden' ? `黃金${sizeText}` : sizeText;
  }

  /**
   * Render the 4 Signboards & Progress Dots (Signboard and ID only, no simulated artwork)
   */
  function renderSignboards() {
    pointsContainer.innerHTML = '';
    progressDots.innerHTML = '';

    POINTS_CONFIG.forEach((pt, idx) => {
      const record = findUnlockedRecord(pt.id);
      const isUnlocked = Boolean(record);
      const isGoldenRice = isUnlocked || arrivedGoldenPointIds.has(pt.id);

      const card = document.createElement('article');
      const stateClasses = [
        'point-signboard',
        isUnlocked ? 'is-unlocked' : 'is-locked',
        isGoldenRice ? 'is-golden-rice' : ''
      ]
        .filter(Boolean)
        .join(' ');
      card.className = stateClasses;
      card.id = `point-card-${pt.id}`;
      card.setAttribute('data-point-id', pt.id);

      const statusText = isUnlocked ? '已餵食' : isGoldenRice ? '稻穗金黃' : '未解鎖';
      const onigiriDesc = isUnlocked ? formatOnigiriLabel(record.size, record.type) : '';
      const plaqueLabelText = isUnlocked
        ? `阿飯已享用${onigiriDesc}`
        : isGoldenRice
        ? '金黃稻穗可收割'
        : '等待收割稻穗餵食';
      const metaText = isUnlocked
        ? `解鎖日期 ${record.date}`
        : `進入 ${UNLOCK_RADIUS_METERS} 公尺內解鎖`;

      const riceSrc = isGoldenRice
        ? ASSET_CONFIG.sprites.riceGolden
        : ASSET_CONFIG.sprites.rice;

      const onigiriClasses = ['signboard-onigiri'];
      if (isUnlocked && record) {
        onigiriClasses.push(`size-${normalizeOnigiriSize(record.size)}`);
        if (record.type === 'golden') {
          onigiriClasses.push('type-golden');
        }
      }

      card.innerHTML = `
        <div class="signboard-header">
          <div class="signboard-title-wrap">
            <span class="signboard-id">${pt.title}</span>
            <img class="signboard-rice" data-role="rice-img" src="${riceSrc}" alt="${isGoldenRice ? '黃金稻穗' : '稻穗'}" draggable="false">
          </div>
          <span class="signboard-status" data-role="status">${statusText}</span>
        </div>
        <div class="signboard-plaque">
          <div class="plaque-text-group">
            <span class="plaque-label" data-role="plaque-label">${plaqueLabelText}</span>
            <span class="plaque-meta" data-role="meta">${metaText}</span>
          </div>
          <div class="${onigiriClasses.join(' ')}" data-role="onigiri" aria-hidden="true"></div>
        </div>
        <div class="signboard-actions">
          <button type="button" class="btn-simulate" data-action="simulate" data-id="${pt.id}" ${isUnlocked ? 'disabled' : ''}>
            ${isUnlocked ? '已完成餵食' : '模擬抵達'}
          </button>
          <button type="button" class="btn-geo" data-action="geo" data-id="${pt.id}" ${isUnlocked ? 'disabled' : ''}>
            定位檢查
          </button>
        </div>
      `;

      pointsContainer.appendChild(card);

      // Progress Dot button in footer (scrolls smoothly to that point)
      const dot = document.createElement('button');
      dot.type = 'button';
      dot.className = `progress-dot ${isUnlocked ? 'unlocked' : ''}`;
      dot.setAttribute('data-target-id', pt.id);
      dot.textContent = pt.id;
      dot.title = `前往${pt.title}`;
      dot.addEventListener('click', () => {
        scrollToPoint(idx);
      });
      progressDots.appendChild(dot);
    });

    updateCounterUI();
  }

  function updateCounterUI() {
    const count = unlockedRecords.length;
    feedCounter.textContent = `已餵 ${count}/${POINTS_CONFIG.length}`;
  }

  /**
   * Compute target scrollLeft to align a signboard card comfortably in view
   */
  function getPointTargetScrollLeft(index) {
    const cards = pointsContainer.querySelectorAll('.point-signboard');
    const targetCard = cards[index];
    if (!targetCard) return scrollTrack.scrollLeft;
    const trackRect = scrollTrack.getBoundingClientRect();
    const cardRect = targetCard.getBoundingClientRect();
    const desiredScroll =
      scrollTrack.scrollLeft + (cardRect.left - trackRect.left) - trackRect.width * 0.36;
    const maxScroll = Math.max(0, scrollTrack.scrollWidth - scrollTrack.clientWidth);
    return Math.max(0, Math.min(maxScroll, desiredScroll));
  }

  function cancelSmoothWheelScroll() {
    if (wheelAnimId) {
      cancelAnimationFrame(wheelAnimId);
      wheelAnimId = null;
    }
    if (wheelSnapTimer) {
      clearTimeout(wheelSnapTimer);
      wheelSnapTimer = null;
    }
    wheelTargetScrollLeft = scrollTrack.scrollLeft;
  }

  function startSmoothScrollTo(targetLeft) {
    const maxScroll = Math.max(0, scrollTrack.scrollWidth - scrollTrack.clientWidth);
    wheelTargetScrollLeft = Math.max(0, Math.min(maxScroll, targetLeft));

    if (prefersReducedMotion) {
      cancelSmoothWheelScroll();
      scrollTrack.scrollLeft = wheelTargetScrollLeft;
      return;
    }

    if (wheelAnimId) return;

    function stepWheelScroll() {
      const current = scrollTrack.scrollLeft;
      const diff = wheelTargetScrollLeft - current;
      if (Math.abs(diff) <= 0.6) {
        scrollTrack.scrollLeft = wheelTargetScrollLeft;
        wheelAnimId = null;
        return;
      }
      scrollTrack.scrollLeft = current + diff * 0.2;
      wheelAnimId = requestAnimationFrame(stepWheelScroll);
    }

    wheelAnimId = requestAnimationFrame(stepWheelScroll);
  }

  function scrollToPoint(index) {
    const desired = getPointTargetScrollLeft(index);
    startSmoothScrollTo(desired);
  }

  /**
   * Turn a point's rice golden on the signboard immediately upon arrival
   */
  function turnPointRiceGolden(pointId) {
    arrivedGoldenPointIds.add(pointId);
    const card = document.getElementById(`point-card-${pointId}`);
    if (!card) return;
    card.classList.add('is-golden-rice');
    const riceImg = card.querySelector('[data-role="rice-img"]');
    if (riceImg) {
      riceImg.setAttribute('src', ASSET_CONFIG.sprites.riceGolden);
      riceImg.setAttribute('alt', '黃金稻穗');
    }
    const statusEl = card.querySelector('[data-role="status"]');
    if (statusEl && !card.classList.contains('is-unlocked')) {
      statusEl.textContent = '稻穗金黃';
    }
    const labelEl = card.querySelector('[data-role="plaque-label"]');
    if (labelEl && !card.classList.contains('is-unlocked')) {
      labelEl.textContent = '金黃稻穗可收割';
    }
  }

  /**
   * Step 1: When a point is arrived (模擬抵達 or passed 定位檢查),
   * turn that point's rice golden, then open the 10-second catch minigame overlay.
   */
  function handlePointArrival(pointId, sourceLabel) {
    const point = POINTS_CONFIG.find((p) => p.id === pointId);
    if (!point) return;

    cancelSmoothWheelScroll();

    const existing = findUnlockedRecord(pointId);
    if (existing) {
      setStatusMessage(`${point.title}已經餵過飯糰囉，繼續探索其他立牌吧`);
      return;
    }

    if (harvestState.active) return;

    // 1. Turn this point's rice golden
    turnPointRiceGolden(pointId);
    setStatusMessage(`${sourceLabel}，${point.title}的稻穗轉為金黃，開始收割稻穗！`);

    // 2. Open the 10-second harvest catch minigame overlay
    startHarvestMinigame(pointId, sourceLabel);
  }

  /**
   * Open and run the 10-second Harvest Catch Minigame
   */
  function startHarvestMinigame(pointId, sourceLabel) {
    const point = POINTS_CONFIG.find((p) => p.id === pointId);
    if (!point || !harvestOverlay) return;

    if (harvestState.rafId) {
      cancelAnimationFrame(harvestState.rafId);
      harvestState.rafId = null;
    }
    if (harvestState.closeTimer) {
      clearTimeout(harvestState.closeTimer);
      harvestState.closeTimer = null;
    }

    harvestState.active = true;
    harvestState.finishing = false;
    harvestState.pointId = pointId;
    harvestState.sourceLabel = sourceLabel;
    harvestState.score = 0;
    harvestState.goldenCaught = false;
    harvestState.items = [];
    harvestState.isDragging = false;
    harvestState.pointerId = null;
    harvestState.walkDist = 0;

    harvestItemsLayer.innerHTML = '';
    harvestResultEl.hidden = true;
    harvestResultEl.textContent = '';

    harvestPointLabel.textContent = point.title;
    harvestTimerEl.textContent = '剩餘 10 秒';
    harvestScoreEl.textContent = '已收 0 束';
    harvestSkipBtn.disabled = false;
    harvestSkipBtn.classList.toggle('is-prominent', prefersReducedMotion);

    harvestOverlay.hidden = false;
    harvestOverlay.classList.add('is-open');

    const playfieldRect = harvestPlayfield.getBoundingClientRect();
    const fieldW = playfieldRect.width || 390;
    harvestState.afanX = fieldW / 2;
    updateHarvestAfanPosition(harvestState.afanX, 0);
    setHarvestAfanFrame(ASSET_CONFIG.afan.walkFrames[0]);
    harvestAfanSprite.classList.remove('facing-left', 'is-walking');

    const now = performance.now();
    harvestState.startTime = now;
    harvestState.lastFrameTime = now;
    harvestState.lastSpawnTime = now - 260;

    // Spawn initial item so the playfield has falling rice immediately
    spawnHarvestItem(fieldW);

    harvestState.rafId = requestAnimationFrame(stepHarvestMinigame);
  }

  /**
   * Spawn a falling item in the harvest minigame:
   * - Rare golden rice ear (~5% chance): worth +3, gives golden 飯糰
   * - Normal rice ear (~75% chance): worth +1
   * - Occasional autumn leaf (~20% chance): maple_red, maple_yellow, ginkgo, oak (worth 0)
   */
  function spawnHarvestItem(fieldW) {
    const minX = EDGE_MARGIN_PX + 20;
    const maxX = Math.max(minX + 20, fieldW - EDGE_MARGIN_PX - 20);
    const x = minX + Math.random() * (maxX - minX);

    const roll = Math.random();
    let kind = 'rice';
    let value = 1;
    let imgSrc = ASSET_CONFIG.sprites.rice;

    if (roll < GOLDEN_RICE_CHANCE) {
      kind = 'rice_golden';
      value = 3;
      imgSrc = ASSET_CONFIG.sprites.riceGolden;
    } else if (roll >= 0.8) {
      kind = 'leaf';
      value = 0;
      const leaves = ASSET_CONFIG.sprites.leaves;
      imgSrc = leaves[Math.floor(Math.random() * leaves.length)];
    }

    const el = document.createElement('img');
    el.className = `harvest-item ${kind === 'rice_golden' ? 'is-golden-rice' : ''}`;
    el.src = imgSrc;
    el.alt = '';
    el.draggable = false;

    const baseSpeed =
      kind === 'rice_golden'
        ? 220 + Math.random() * 45
        : kind === 'rice'
        ? 185 + Math.random() * 55
        : 150 + Math.random() * 45;

    const item = {
      kind,
      value,
      x,
      y: -36,
      vy: baseSpeed, // pixels per second (scaled by 0.5 when prefersReducedMotion is true)
      swayAmp: kind === 'leaf' ? 22 : 10,
      swayPhase: Math.random() * Math.PI * 2,
      swaySpeed: 2.2 + Math.random() * 1.5,
      rot: (Math.random() - 0.5) * 24,
      vRot: (Math.random() - 0.5) * 45,
      el
    };

    el.style.transform = `translate3d(${Math.round(item.x - 20)}px, ${Math.round(item.y)}px, 0) rotate(${Math.round(item.rot)}deg)`;
    harvestItemsLayer.appendChild(el);
    harvestState.items.push(item);
  }

  /**
   * Position draggable Afan along the bottom of the harvest playfield.
   * Known limitation: Afan's bracelet is on the right wrist; mirroring sprites via scaleX(-1)
   * when moving left swaps the bracelet to the left wrist.
   */
  function updateHarvestAfanPosition(newX, deltaX) {
    const rect = harvestPlayfield.getBoundingClientRect();
    const fieldW = rect.width || 390;
    const minX = EDGE_MARGIN_PX + 24;
    const maxX = Math.max(minX, fieldW - EDGE_MARGIN_PX - 24);
    const clampedX = Math.max(minX, Math.min(maxX, newX));

    harvestState.afanX = clampedX;
    harvestAfan.style.left = `${clampedX}px`;

    // Known limitation: Bracelet is on right wrist; mirroring sprites via scaleX(-1) swaps it.
    if (Math.abs(deltaX) > 0.6) {
      harvestAfanSprite.classList.toggle('facing-left', deltaX < 0);
    }

    if (!prefersReducedMotion && Math.abs(deltaX) > 0.4) {
      harvestState.walkDist += Math.abs(deltaX);
      const frames = ASSET_CONFIG.afan.walkFrames;
      const frameIdx = Math.floor(harvestState.walkDist / 24) % frames.length;
      setHarvestAfanFrame(frames[frameIdx]);
    }
  }

  /**
   * Main requestAnimationFrame loop for the 10-second Harvest Catch Minigame
   */
  function stepHarvestMinigame(now) {
    if (!harvestState.active || harvestState.finishing) return;

    const dtMs = Math.min(64, Math.max(0, now - harvestState.lastFrameTime));
    const dtSec = dtMs / 1000;
    harvestState.lastFrameTime = now;

    const elapsedMs = now - harvestState.startTime;
    const remainingMs = Math.max(0, HARVEST_DURATION_MS - elapsedMs);
    const remainingSec = Math.ceil(remainingMs / 1000);
    harvestTimerEl.textContent = `剩餘 ${remainingSec} 秒`;

    const playfieldRect = harvestPlayfield.getBoundingClientRect();
    const fieldW = playfieldRect.width || 390;
    const fieldH = playfieldRect.height || 640;

    // With prefers-reduced-motion: items fall 2x slower
    const motionMultiplier = prefersReducedMotion ? 0.5 : 1.0;
    const spawnIntervalMs = prefersReducedMotion ? 640 : 370;

    if (now - harvestState.lastSpawnTime >= spawnIntervalMs && remainingMs > 400) {
      harvestState.lastSpawnTime = now;
      spawnHarvestItem(fieldW);
    }

    // Catch zone around Afan at the bottom of the playfield
    const catchCenterY = fieldH - 18 - fieldH * 0.13;
    const catchTopY = fieldH - 18 - fieldH * 0.25;
    const catchBottomY = fieldH - 12;
    const catchRadiusX = 52;

    for (let i = harvestState.items.length - 1; i >= 0; i--) {
      const item = harvestState.items[i];
      item.y += item.vy * motionMultiplier * dtSec;

      if (!prefersReducedMotion) {
        item.swayPhase += item.swaySpeed * dtSec;
        item.x += Math.sin(item.swayPhase) * item.swayAmp * dtSec;
        item.rot += item.vRot * dtSec;
      }

      const halfSize = item.kind === 'rice_golden' ? 23 : 20;
      item.el.style.transform = `translate3d(${Math.round(item.x - halfSize)}px, ${Math.round(item.y - halfSize)}px, 0) rotate(${Math.round(item.rot)}deg)`;

      // Check collision with Afan's catch box
      const inY = item.y >= catchTopY && item.y <= catchBottomY;
      const inX = Math.abs(item.x - harvestState.afanX) <= catchRadiusX;

      if (inY && inX && Math.abs(item.y - catchCenterY) <= fieldH * 0.14) {
        if (item.value > 0) {
          harvestState.score += item.value;
          if (item.kind === 'rice_golden') {
            harvestState.goldenCaught = true;
          }
          harvestScoreEl.textContent = harvestState.goldenCaught
            ? `已收 ${harvestState.score} 束（含金穗）`
            : `已收 ${harvestState.score} 束`;
        }
        item.el.remove();
        harvestState.items.splice(i, 1);
        continue;
      }

      // Remove items that fell past the bottom
      if (item.y > fieldH + 44) {
        item.el.remove();
        harvestState.items.splice(i, 1);
      }
    }

    if (remainingMs <= 0) {
      finishHarvestMinigame(false);
      return;
    }

    harvestState.rafId = requestAnimationFrame(stepHarvestMinigame);
  }

  /**
   * Determine 飯糰 size & type from harvest result:
   * - small (<6), medium (6-11), large (>=12)
   * - any golden caught gives special golden 飯糰 (onigiri_golden.png)
   * - skipping gives small 飯糰
   */
  function computeHarvestOutcome(score, goldenCaught, skipped) {
    if (skipped) {
      return {
        size: 'small',
        type: 'normal',
        resultLine: `收了 ${score} 束稻穗，做成小飯糰！`
      };
    }

    const size = score >= 12 ? 'large' : score >= 6 ? 'medium' : 'small';
    const type = goldenCaught ? 'golden' : 'normal';
    const label = formatOnigiriLabel(size, type);

    return {
      size,
      type,
      resultLine: `收了 ${score} 束稻穗，做成${label}！`
    };
  }

  /**
   * Complete the harvest minigame (either at 10s timer end or when 「跳過」 is clicked),
   * show the result line in Traditional Chinese, close the overlay, play the feeding
   * animation positioned at Afan's hands (lower body), and unlock the point.
   */
  function finishHarvestMinigame(skipped = false) {
    if (!harvestState.active || harvestState.finishing) return;
    harvestState.finishing = true;

    if (harvestState.rafId) {
      cancelAnimationFrame(harvestState.rafId);
      harvestState.rafId = null;
    }

    harvestState.isDragging = false;
    harvestState.pointerId = null;
    harvestSkipBtn.disabled = true;

    const pointId = harvestState.pointId;
    const outcome = computeHarvestOutcome(
      harvestState.score,
      harvestState.goldenCaught,
      skipped
    );

    // Show result line in Traditional Chinese, e.g. 「收了 12 束稻穗，做成大飯糰！」
    harvestResultEl.textContent = outcome.resultLine;
    harvestResultEl.hidden = false;
    setStatusMessage(outcome.resultLine);

    // Record per point in localStorage: point ID, date, and 飯糰 size/type only
    const point = POINTS_CONFIG.find((p) => p.id === pointId);
    if (point && !findUnlockedRecord(pointId)) {
      unlockedRecords.push({
        id: point.id,
        date: formatTodayDate(),
        size: outcome.size,
        type: outcome.type
      });
      saveUnlockedRecords();
    }

    const resultDisplayDelay = skipped ? 140 : prefersReducedMotion ? 320 : 620;

    harvestState.closeTimer = setTimeout(() => {
      harvestState.closeTimer = null;
      harvestOverlay.hidden = true;
      harvestOverlay.classList.remove('is-open');
      harvestItemsLayer.innerHTML = '';
      harvestState.items = [];
      harvestState.active = false;
      harvestState.finishing = false;

      const card = document.getElementById(`point-card-${pointId}`);
      const onigiriEl = card ? card.querySelector('[data-role="onigiri"]') : null;

      // Play existing feeding animation with the 飯糰 positioned at his hands (lower body),
      // never covering his head, then unlock the point on the signboard
      playFeedAnimation(onigiriEl, outcome, () => {
        renderSignboards();
        const total = unlockedRecords.length;
        if (total >= POINTS_CONFIG.length) {
          setStatusMessage(`${outcome.resultLine}四處作品立牌都完成解鎖，阿飯吃得飽飽的！`);
        } else {
          setStatusMessage(`${outcome.resultLine}${point ? point.title : ''}已完成餵食，目前進度 ${total}/4`);
        }
      });
    }, resultDisplayDelay);
  }

  /**
   * Real Geolocation Check (150m radius, Haversine computed on device only, never sent anywhere)
   */
  function checkPointGeolocation(pointId) {
    const point = POINTS_CONFIG.find((p) => p.id === pointId);
    if (!point) return;

    if (!('geolocation' in navigator)) {
      setStatusMessage('目前瀏覽器不支援定位功能，請點擊模擬抵達體驗收割與餵食');
      return;
    }

    setStatusMessage(`正在於手機端計算與${point.title}的距離，請稍候`);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        const distMeters = Math.round(
          computeHaversineMeters(userLat, userLng, point.lat, point.lng)
        );

        if (distMeters <= UNLOCK_RADIUS_METERS) {
          handlePointArrival(pointId, `定位抵達（距離 ${distMeters} 公尺）`);
        } else {
          setStatusMessage(
            `目前距離${point.title}約 ${distMeters} 公尺，需進入 ${UNLOCK_RADIUS_METERS} 公尺內，或點擊模擬抵達`
          );
        }
      },
      (_err) => {
        setStatusMessage(`無法取得定位權限或訊號，請直接點擊${point.title}的模擬抵達按鈕`);
      },
      {
        enableHighAccuracy: true,
        timeout: 6000,
        maximumAge: 10000
      }
    );
  }

  /**
   * Flying Rice Ball to Afan Animation + Unlock Sequence:
   * - Show act_3_masked.png (reaching) while the 飯糰 flies in
   * - Positioned at Afan's hands (lower body, ~65% down sprite and ~76% across),
   *   and starts its approach in the lower-right hand region so it NEVER covers or crosses his head
   * - Size scales by small / medium / large; golden 飯糰 uses onigiri_golden.png
   * - Then show act_4.png (jumping) with a small hop, then back to walk_1.png
   */
  function playFeedAnimation(_sourceEl, onigiriMeta, onComplete) {
    if (reactionTimer) {
      clearTimeout(reactionTimer);
      reactionTimer = null;
    }
    if (bubbleHideTimer) {
      clearTimeout(bubbleHideTimer);
      bubbleHideTimer = null;
    }
    if (walkStopTimer) {
      clearTimeout(walkStopTimer);
      walkStopTimer = null;
    }

    const sizeKey = normalizeOnigiriSize(onigiriMeta && onigiriMeta.size);
    const typeKey = normalizeOnigiriType(onigiriMeta && onigiriMeta.type);

    // 1. Enter reaching state (act_3_masked.png, facing right) while 飯糰 arrives at hands
    spriteStore.currentState = 'reaching';
    afanSpriteImg.classList.remove('is-walking', 'facing-left', 'state-idle', 'state-jumping');
    afanSpriteImg.classList.add('state-reaching');
    setAfanSpriteFrame(ASSET_CONFIG.afan.reaching);

    const stageRect = stageViewport.getBoundingClientRect();
    const spriteRect = (afanSpriteImg || afanActor).getBoundingClientRect();

    // Scale 飯糰 size by small / medium / large while keeping it strictly in the lower body
    const sizeRatioMap = {
      small: 0.17,
      medium: 0.22,
      large: 0.26
    };
    const ratio = sizeRatioMap[sizeKey] || 0.22;
    const ballSize = Math.max(22, Math.round(spriteRect.height * ratio));
    const ballHalf = ballSize / 2;

    // Final landing center at Afan's hands (lower body: ~66% down the sprite and ~78% across)
    // Top of ball is >= 53% down the sprite, strictly below the head/hat region (top 50%)
    const landingCenterX = spriteRect.left - stageRect.left + spriteRect.width * 0.78;
    const landingCenterY = spriteRect.top - stageRect.top + spriteRect.height * 0.66;
    const endX = landingCenterX - ballHalf;
    const endY = landingCenterY - ballHalf;

    // Start from the lower-right side near hand level so the trajectory never crosses Afan's head
    const startX = Math.min(stageRect.width - ballSize - 24, endX + 84);
    const startY = endY + 6;

    const flyingBall = document.createElement('div');
    flyingBall.className = `flying-onigiri size-${sizeKey} ${typeKey === 'golden' ? 'type-golden' : ''}`;
    flyingBall.style.width = `${ballSize}px`;
    flyingBall.style.height = `${ballSize}px`;
    flyingLayer.appendChild(flyingBall);

    // Reduced motion fallback: no flight arc, instant placement at hands level (lower body)
    if (prefersReducedMotion) {
      flyingBall.style.transform = `translate3d(${endX}px, ${endY}px, 0)`;
      flyingBall.classList.add('is-bitten');
      triggerAfanJumpReaction(true, onigiriMeta);
      setTimeout(() => {
        flyingBall.remove();
        if (onComplete) onComplete();
      }, 320);
      return;
    }

    // Gentle low hand-level delivery (~560ms) so the 飯糰 stays at lower body and never covers his head
    const duration = 560;
    const startTime = performance.now();

    function stepArc(now) {
      const t = Math.min(1, (now - startTime) / duration);
      const ease = 1 - Math.pow(1 - t, 2.2);

      // Tiny 10px lift kept strictly below the 50% vertical midline of Afan's sprite
      const lowLift = Math.sin(t * Math.PI) * 10;
      const curX = startX + (endX - startX) * ease;
      const curY = startY + (endY - startY) * ease - lowLift;

      flyingBall.style.transform = `translate3d(${curX}px, ${curY}px, 0)`;

      if (t < 1) {
        requestAnimationFrame(stepArc);
      } else {
        flyingBall.classList.add('is-bitten');
        flyingBall.style.transform = `translate3d(${endX}px, ${endY}px, 0)`;
        triggerAfanJumpReaction(false, onigiriMeta);
        setTimeout(() => {
          flyingBall.remove();
          if (onComplete) onComplete();
        }, 320);
      }
    }

    requestAnimationFrame(stepArc);
  }

  /**
   * Transition Afan from act_3_masked (reaching) -> act_4 (jumping with small hop) -> walk_1 (idle)
   */
  function triggerAfanJumpReaction(instant = false, onigiriMeta = null) {
    spriteStore.currentState = 'jumping';
    afanSpriteImg.classList.remove('is-walking', 'facing-left', 'state-idle', 'state-reaching');
    if (!instant && !prefersReducedMotion) {
      afanSpriteImg.classList.add('state-jumping');
    }
    setAfanSpriteFrame(ASSET_CONFIG.afan.jumping);

    const nextCount = unlockedRecords.length;
    const label = onigiriMeta
      ? formatOnigiriLabel(onigiriMeta.size, onigiriMeta.type)
      : '飯糰';
    afanBubble.textContent =
      nextCount >= POINTS_CONFIG.length
        ? `吃到${label}，四顆都吃飽了！`
        : `好香的${label}，謝謝你！`;
    afanBubble.hidden = false;

    const jumpDuration = instant ? 280 : 680;
    reactionTimer = setTimeout(() => {
      afanSpriteImg.classList.remove('state-reaching', 'state-jumping', 'is-walking');
      afanSpriteImg.classList.add('state-idle');
      spriteStore.currentState = 'idle';
      spriteStore.walkFrameIdx = 0;
      setAfanSpriteFrame(ASSET_CONFIG.afan.walkFrames[0]);
    }, jumpDuration);

    bubbleHideTimer = setTimeout(() => {
      afanBubble.hidden = true;
    }, jumpDuration + 1100);
  }

  /**
   * Update 3-layer parallax & Afan 6-frame walk cycle on horizontal scroll.
   * Known limitation: Bracelet is on right wrist; mirroring sprites via scaleX(-1)
   * when scrolling left swaps it to the left wrist.
   */
  function handleScroll() {
    const scrollLeft = scrollTrack.scrollLeft;
    const delta = scrollLeft - lastScrollLeft;

    // 1. Update 3-layer parallax when reduced motion is not active (far slowest, mid medium, near fastest)
    if (!prefersReducedMotion) {
      const farX = -scrollLeft * 0.14;
      const midX = -scrollLeft * 0.42;
      const nearX = -scrollLeft * 0.85;
      parallaxFar.style.transform = `translate3d(${farX}px, 0, 0)`;
      parallaxMid.style.transform = `translate3d(${midX}px, 0, 0)`;
      parallaxNear.style.transform = `translate3d(${nearX}px, 0, 0)`;
    } else {
      parallaxFar.style.transform = 'none';
      parallaxMid.style.transform = 'none';
      parallaxNear.style.transform = 'none';
    }

    // 2. Advance Afan walk frames by scroll distance (~40px per frame), idle on walk_1 after ~150ms
    const isReacting =
      spriteStore.currentState === 'reaching' || spriteStore.currentState === 'jumping';

    if (!isReacting) {
      if (Math.abs(delta) > 0.5) {
        // Known limitation: Bracelet is on right wrist; mirroring via scaleX(-1) swaps it
        afanSpriteImg.classList.toggle('facing-left', delta < 0);
      }

      if (prefersReducedMotion) {
        spriteStore.currentState = 'idle';
        spriteStore.walkFrameIdx = 0;
        afanSpriteImg.classList.remove('is-walking');
        afanSpriteImg.classList.add('state-idle');
        setAfanSpriteFrame(ASSET_CONFIG.afan.walkFrames[0]);
      } else if (Math.abs(delta) > 0.2) {
        const frames = ASSET_CONFIG.afan.walkFrames;
        const frameIdx = Math.abs(Math.floor(scrollLeft / WALK_SCROLL_STEP_PX)) % frames.length;
        spriteStore.currentState = 'walking';
        spriteStore.walkFrameIdx = frameIdx;
        afanSpriteImg.classList.remove('state-idle');
        afanSpriteImg.classList.add('is-walking');
        setAfanSpriteFrame(frames[frameIdx]);

        if (walkStopTimer) clearTimeout(walkStopTimer);
        walkStopTimer = setTimeout(() => {
          if (spriteStore.currentState === 'reaching' || spriteStore.currentState === 'jumping') {
            return;
          }
          spriteStore.currentState = 'idle';
          spriteStore.walkFrameIdx = 0;
          afanSpriteImg.classList.remove('is-walking');
          afanSpriteImg.classList.add('state-idle');
          setAfanSpriteFrame(ASSET_CONFIG.afan.walkFrames[0]);
        }, WALK_IDLE_DELAY_MS);
      }
    }

    lastScrollLeft = scrollLeft;
  }

  /**
   * Optional soft snapping near signboards after wheel scroll settles (not forced)
   */
  function scheduleSoftSnapCheck() {
    if (wheelSnapTimer) clearTimeout(wheelSnapTimer);
    wheelSnapTimer = setTimeout(() => {
      wheelSnapTimer = null;
      if (harvestState.active) return;
      const currentTarget = wheelAnimId ? wheelTargetScrollLeft : scrollTrack.scrollLeft;
      let closestDist = Infinity;
      let closestScroll = currentTarget;

      for (let i = 0; i < POINTS_CONFIG.length; i++) {
        const ptScroll = getPointTargetScrollLeft(i);
        const dist = Math.abs(ptScroll - currentTarget);
        if (dist < closestDist) {
          closestDist = dist;
          closestScroll = ptScroll;
        }
      }

      // Soft snap only when already very close (within 28px) to a signboard alignment spot
      if (closestDist > 1 && closestDist <= 28) {
        startSmoothScrollTo(closestScroll);
      }
    }, 220);
  }

  /**
   * Lightweight Seasonal Particle System on Canvas
   * - autumn: uses prepared leaf sprites (maple_red, maple_yellow, ginkgo, oak)
   * - spring: pink sakura petals
   * - summer: glowing fireflies
   * - winter: soft snowflakes
   */
  function resizeCanvas() {
    if (!particleCanvas) return;
    const rect = particleCanvas.getBoundingClientRect();
    particleCanvas.width = rect.width || 390;
    particleCanvas.height = rect.height || 700;
  }

  function createParticle(w, h, type, randomY = true) {
    if (type === 'fireflies') {
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.55,
        vy: (Math.random() - 0.5) * 0.45,
        size: 2.5 + Math.random() * 3,
        phase: Math.random() * Math.PI * 2,
        speedPhase: 0.03 + Math.random() * 0.04
      };
    }

    const paletteMap = {
      petals: ['#f7b6c8', '#f498b2', '#fde0e8'],
      leaves: ['#d95f25', '#e89c27', '#c43c1b', '#cca33b'],
      snow: ['#ffffff', '#eef6fc', '#dceaf7']
    };
    const colors = paletteMap[type] || paletteMap.leaves;
    const leafImgs = spriteStore.leafImages;
    const leafImg =
      type === 'leaves' && leafImgs.length > 0
        ? leafImgs[Math.floor(Math.random() * leafImgs.length)]
        : null;

    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : -18,
      vx: (Math.random() - 0.35) * 0.75,
      vy: type === 'snow' ? 0.65 + Math.random() * 0.85 : 0.8 + Math.random() * 1.0,
      size: type === 'snow' ? 3 + Math.random() * 4 : type === 'leaves' ? 14 + Math.random() * 8 : 6 + Math.random() * 5,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.035,
      swayPhase: Math.random() * Math.PI * 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      leafImg
    };
  }

  function initParticles() {
    if (particleAnimId) {
      cancelAnimationFrame(particleAnimId);
      particleAnimId = null;
    }

    if (!particleCanvas) return;
    const ctx = particleCanvas.getContext('2d');
    resizeCanvas();

    if (prefersReducedMotion) {
      if (ctx) ctx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
      return;
    }

    const meta = SEASON_CONFIG[currentSeason] || SEASON_CONFIG.autumn;
    const type = meta.particleType;
    const count = type === 'fireflies' ? 18 : 18;

    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push(createParticle(particleCanvas.width, particleCanvas.height, type, true));
    }

    function renderLoop() {
      if (prefersReducedMotion) return;
      const w = particleCanvas.width;
      const h = particleCanvas.height;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        if (type === 'fireflies') {
          p.x += p.vx;
          p.y += p.vy;
          p.phase += p.speedPhase;
          if (p.x < 0) p.x = w;
          if (p.x > w) p.x = 0;
          if (p.y < 0) p.y = h;
          if (p.y > h) p.y = 0;

          const alpha = 0.25 + ((Math.sin(p.phase) + 1) / 2) * 0.7;
          ctx.save();
          ctx.beginPath();
          const grad = ctx.createRadialGradient(p.x, p.y, 0.5, p.x, p.y, p.size * 2.6);
          grad.addColorStop(0, `rgba(238, 255, 120, ${alpha})`);
          grad.addColorStop(1, 'rgba(238, 255, 120, 0)');
          ctx.fillStyle = grad;
          ctx.arc(p.x, p.y, p.size * 2.6, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        } else {
          p.swayPhase += 0.025;
          p.x += p.vx + Math.sin(p.swayPhase) * 0.45;
          p.y += p.vy;
          p.rot += p.vRot;

          if (p.y > h + 22) {
            particles[i] = createParticle(w, h, type, false);
            continue;
          }
          if (p.x < -22) p.x = w + 14;
          if (p.x > w + 22) p.x = -14;

          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot);

          if (type === 'leaves' && p.leafImg && p.leafImg.complete && p.leafImg.naturalWidth > 0) {
            ctx.globalAlpha = 0.88;
            ctx.drawImage(p.leafImg, -p.size / 2, -p.size / 2, p.size, p.size);
          } else if (type === 'snow') {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(0, 0, p.size * 0.55, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.ellipse(0, 0, p.size * 0.7, p.size * 0.42, 0, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }

      particleAnimId = requestAnimationFrame(renderLoop);
    }

    particleAnimId = requestAnimationFrame(renderLoop);
  }

  /**
   * Execute Signboard Button Action (模擬抵達 / 定位檢查) with duplicate-activation guard
   * so pointerup during scroll settling AND standard click both work reliably without double-firing.
   */
  let lastActionTriggerTime = 0;

  function triggerSignboardButton(btn) {
    if (!btn || btn.disabled) return;
    const now = performance.now();
    if (now - lastActionTriggerTime < 280) return;
    lastActionTriggerTime = now;

    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action === 'simulate') {
      handlePointArrival(id, '模擬抵達');
    } else if (action === 'geo') {
      checkPointGeolocation(id);
    }
  }

  /**
   * Bind UI Events, Gentle Wheel Scroll, Reliable Button Clicks, Harvest Pointer Drag, & Edge Guard
   */
  function bindEvents() {
    // Scroll handler
    scrollTrack.addEventListener('scroll', handleScroll, { passive: true });

    // FIX a: Gentle mouse wheel horizontal scrolling (scale deltaY, cap per event, smooth lerp, optional soft snap)
    scrollTrack.addEventListener(
      'wheel',
      (e) => {
        if (harvestState.active) return;
        // Do not block wheel if modifier key is held (e.g., browser zoom)
        if (e.ctrlKey || e.metaKey) return;
        e.preventDefault();

        const rawDelta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
        const modeScale = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 80 : 1;
        // Scale wheel delta gently and cap at 40px per event so 3 notches move ~105-120px (never skipping 2 points)
        const scaled = rawDelta * modeScale * 0.34;
        const cappedDelta = Math.max(-40, Math.min(40, scaled));

        const baseTarget = wheelAnimId ? wheelTargetScrollLeft : scrollTrack.scrollLeft;
        startSmoothScrollTo(baseTarget + cappedDelta);
        scheduleSoftSnapCheck();
      },
      { passive: false }
    );

    // FIX b: Reliable button response even while scrolling settles
    let pendingBtnPointer = null;

    pointsContainer.addEventListener('pointerdown', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn || btn.disabled) return;
      // Stop any ongoing wheel/smooth scroll immediately so button doesn't drift under pointer
      cancelSmoothWheelScroll();
      pendingBtnPointer = {
        btn,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY
      };
    });

    pointsContainer.addEventListener('pointerup', (e) => {
      if (!pendingBtnPointer || pendingBtnPointer.pointerId !== e.pointerId) return;
      const { btn, startX, startY } = pendingBtnPointer;
      pendingBtnPointer = null;
      const moveDist = Math.hypot(e.clientX - startX, e.clientY - startY);
      if (moveDist < 16 && !btn.disabled) {
        triggerSignboardButton(btn);
      }
    });

    pointsContainer.addEventListener('pointercancel', () => {
      pendingBtnPointer = null;
    });

    pointsContainer.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn || btn.disabled) return;
      triggerSignboardButton(btn);
    });

    // Reset button (重新開始)
    resetBtn.addEventListener('click', () => {
      if (harvestState.active) {
        if (harvestState.rafId) cancelAnimationFrame(harvestState.rafId);
        if (harvestState.closeTimer) clearTimeout(harvestState.closeTimer);
        harvestState.active = false;
        harvestState.finishing = false;
        harvestOverlay.hidden = true;
        harvestOverlay.classList.remove('is-open');
      }
      unlockedRecords = [];
      arrivedGoldenPointIds.clear();
      try {
        window.localStorage.removeItem(STORAGE_KEY);
      } catch (_err) {
        // ignore
      }
      renderSignboards();
      startSmoothScrollTo(0);
      setStatusMessage('已重新開始，所有作品立牌皆已恢復為未解鎖狀態');
    });

    // Season switcher buttons
    seasonBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        const targetSeason = btn.getAttribute('data-season-select');
        setSeason(targetSeason, true);
      });
    });

    // Harvest Minigame: 「跳過」 button (skips game, gives small 飯糰)
    harvestSkipBtn.addEventListener('click', () => {
      if (!harvestState.active || harvestState.finishing) return;
      finishHarvestMinigame(true);
    });

    // Harvest Minigame: Pointer drag left/right along bottom (pointerdown/move/up, setPointerCapture)
    // Starts drag only at least 24px from screen/overlay edges and calls preventDefault
    harvestOverlay.addEventListener('pointerdown', (e) => {
      if (!harvestState.active || harvestState.finishing) return;
      if (e.target.closest('#harvest-skip-btn')) {
        // Do not preventDefault on the skip button
        return;
      }

      e.preventDefault();

      const overlayRect = harvestOverlay.getBoundingClientRect();
      const relX = e.clientX - overlayRect.left;
      const screenX = e.clientX;
      const screenW = window.innerWidth || overlayRect.width;

      // Enforce >= 24px margin from both overlay edges and viewport edges
      if (
        relX < EDGE_MARGIN_PX ||
        relX > overlayRect.width - EDGE_MARGIN_PX ||
        screenX < EDGE_MARGIN_PX ||
        screenX > screenW - EDGE_MARGIN_PX
      ) {
        return;
      }

      harvestState.isDragging = true;
      harvestState.pointerId = e.pointerId;
      try {
        harvestOverlay.setPointerCapture(e.pointerId);
      } catch (_err) {
        // Ignore if synthetic pointer event in test environment lacks active pointer
      }

      const deltaX = relX - harvestState.afanX;
      updateHarvestAfanPosition(relX, deltaX);
    });

    harvestOverlay.addEventListener('pointermove', (e) => {
      if (!harvestState.active || !harvestState.isDragging) return;
      if (harvestState.pointerId !== null && e.pointerId !== harvestState.pointerId) return;

      e.preventDefault();

      const overlayRect = harvestOverlay.getBoundingClientRect();
      const relX = e.clientX - overlayRect.left;
      const deltaX = relX - harvestState.afanX;
      updateHarvestAfanPosition(relX, deltaX);
    });

    function endHarvestDrag(e) {
      if (!harvestState.isDragging) return;
      if (harvestState.pointerId !== null && e.pointerId !== harvestState.pointerId) return;
      harvestState.isDragging = false;
      harvestState.pointerId = null;
      try {
        harvestOverlay.releasePointerCapture(e.pointerId);
      } catch (_err) {
        // Ignore
      }
      setHarvestAfanFrame(ASSET_CONFIG.afan.walkFrames[0]);
    }

    harvestOverlay.addEventListener('pointerup', endHarvestDrag);
    harvestOverlay.addEventListener('pointercancel', endHarvestDrag);

    // ~24px edge gesture guard on scrollTrack: prevent touchstart near viewport edges from scrolling map
    let blockedEdgeTouch = false;

    scrollTrack.addEventListener(
      'touchstart',
      (e) => {
        if (!e.touches || e.touches.length === 0) return;
        const touchX = e.touches[0].clientX;
        const shellRect = appShell.getBoundingClientRect();
        const relX = touchX - shellRect.left;
        blockedEdgeTouch = relX < EDGE_MARGIN_PX || relX > shellRect.width - EDGE_MARGIN_PX;
      },
      { passive: true }
    );

    scrollTrack.addEventListener(
      'touchmove',
      (e) => {
        if (blockedEdgeTouch) {
          e.stopPropagation();
        }
      },
      { passive: true }
    );

    // Desktop mouse drag-to-scroll convenience (respecting 24px edge margins & never blocking buttons)
    let isMouseDown = false;
    let startPageX = 0;
    let startScrollLeft = 0;

    scrollTrack.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      const shellRect = appShell.getBoundingClientRect();
      const relX = e.clientX - shellRect.left;
      if (relX < EDGE_MARGIN_PX || relX > shellRect.width - EDGE_MARGIN_PX) return;
      cancelSmoothWheelScroll();
      isMouseDown = true;
      startPageX = e.pageX;
      startScrollLeft = scrollTrack.scrollLeft;
    });

    window.addEventListener('mousemove', (e) => {
      if (!isMouseDown) return;
      const walk = (e.pageX - startPageX) * 0.95;
      scrollTrack.scrollLeft = startScrollLeft - walk;
    });

    window.addEventListener('mouseup', () => {
      isMouseDown = false;
    });

    // Window resize & prefers-reduced-motion listener
    window.addEventListener('resize', () => {
      resizeCanvas();
    });

    const onReducedMotionChange = (e) => {
      prefersReducedMotion = e.matches;
      if (harvestSkipBtn) {
        harvestSkipBtn.classList.toggle('is-prominent', prefersReducedMotion);
      }
      handleScroll();
      initParticles();
    };

    if (typeof reducedMotionQuery.addEventListener === 'function') {
      reducedMotionQuery.addEventListener('change', onReducedMotionChange);
    } else if (typeof reducedMotionQuery.addListener === 'function') {
      reducedMotionQuery.addListener(onReducedMotionChange);
    }
  }

  /**
   * Initialize Prototype
   */
  function init() {
    unlockedRecords = loadUnlockedRecords();
    unlockedRecords.forEach((r) => arrivedGoldenPointIds.add(r.id));
    const initialSeason = resolveInitialSeason();
    initSprites();
    renderSignboards();
    setSeason(initialSeason, false);
    bindEvents();
    handleScroll();
  }

  init();
})();
