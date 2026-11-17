(function () {
  const DATA = window.KRILLION_DATA;
  const PX_PER_METER = 2; // 700 pts * 10m = 7000m = 14000px
  const ROUND_SECONDS = 25;
  const STORAGE_KEY = 'krillion_ru_state_v1';

  const DEFAULT_STATE = {
    settings: {
      muted: false,
      lowPower: false,
      colorblind: false,
      answerCorrections: true,
      clearRejected: false,
      shareLink: true,
      unlockAllBuddies: false
    },
    buddyId: 'krillion',
    stats: {
      played: 0,
      streak: 0,
      bestStreak: 0,
      lastDiveDay: null,
      totalScore: 0,
      bestScore: 0
    },
    completedDives: {}, // diveNumber -> { score, depth, results: [...] }
    seenEndlessIds: [], // prompt IDs already seen in Endless shuffle bag
    suggestions: [],
    ratings: {}
  };

  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return structuredClone(DEFAULT_STATE);
      const parsed = JSON.parse(raw);
      return {
        settings: { ...DEFAULT_STATE.settings, ...(parsed.settings || {}) },
        buddyId: parsed.buddyId || 'krillion',
        stats: { ...DEFAULT_STATE.stats, ...(parsed.stats || {}) },
        completedDives: parsed.completedDives || {},
        seenEndlessIds: Array.isArray(parsed.seenEndlessIds) ? parsed.seenEndlessIds : [],
        suggestions: parsed.suggestions || [],
        ratings: parsed.ratings || {}
      };
    } catch {
      return structuredClone(DEFAULT_STATE);
    }
  }

  let appState = loadState();
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch {
      // ignore storage quota issues
    }
  }

  // ---------------- Web Audio Synth ----------------
  class SoundFX {
    constructor() {
      this.ctx = null;
    }

    ensureCtx() {
      if (appState.settings.muted) return null;
      if (!this.ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return null;
        this.ctx = new AudioCtx();
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      return this.ctx;
    }

    tone(freq, dur, type = 'sine', gainVal = 0.08, delay = 0, freqEnd = null) {
      const ctx = this.ensureCtx();
      if (!ctx) return;
      const now = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, now);
      if (freqEnd) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), now + dur);
      }
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(gainVal, now + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + dur + 0.02);
    }

    click() {
      this.tone(520, 0.06, 'triangle', 0.05, 0, 660);
    }

    countdownTick(final = false) {
      this.tone(final ? 880 : 620, 0.09, 'sine', 0.06);
    }

    urgentTick() {
      this.tone(940, 0.07, 'square', 0.035);
    }

    reject() {
      this.tone(170, 0.11, 'sawtooth', 0.05, 0, 120);
      this.tone(140, 0.12, 'sawtooth', 0.04, 0.08, 100);
    }

    suggest() {
      this.tone(440, 0.08, 'triangle', 0.05, 0);
      this.tone(587, 0.1, 'triangle', 0.05, 0.06);
    }

    diveStart() {
      this.tone(420, 0.35, 'sine', 0.07, 0, 140);
    }

    crossTier(idx) {
      const notes = [330, 392, 494, 587, 740, 988];
      this.tone(notes[idx] || 440, 0.14, 'triangle', 0.06, 0);
    }

    land(tierId) {
      this.tone(110, 0.25, 'triangle', 0.1, 0, 48);
      if (tierId === 'miss') {
        this.tone(180, 0.3, 'sawtooth', 0.04, 0.04, 110);
      } else if (tierId === 'krillion') {
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          this.tone(f, 0.35, 'triangle', 0.07, 0.05 + i * 0.07);
        });
      } else if (tierId === 'deepcut' || tierId === 'rare') {
        this.tone(440, 0.25, 'triangle', 0.06, 0.04);
        this.tone(659.25, 0.32, 'triangle', 0.06, 0.12);
      } else {
        this.tone(392, 0.22, 'sine', 0.06, 0.04);
      }
    }

    mascot() {
      this.tone(620, 0.08, 'sine', 0.06, 0, 960);
      this.tone(860, 0.11, 'triangle', 0.05, 0.07, 1180);
    }
  }

  const sfx = new SoundFX();

  // ---------------- Text Matching & Phonetic Transliteration ----------------
  function normalizeInput(str) {
    return (str || '')
      .toLowerCase()
      .replace(/ё/g, 'е')
      .replace(/[’'`]/g, '')
      .replace(/[^a-zа-я0-9+#* ]/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function compactStr(str) {
    return normalizeInput(str).replace(/ /g, '');
  }

  function skeletonStr(str) {
    return compactStr(str)
      .replace(/[ъь]/g, '')
      .replace(/щ/g, 'ш')
      .replace(/э/g, 'е')
      .replace(/й/g, 'и')
      .replace(/(.)\1+/g, '$1');
  }

  const GENERIC_WORDS = new Set([
    'море', 'океан', 'сыр', 'город', 'цвет', 'оттенок', 'дерево', 'куст',
    'кустарник', 'птица', 'животное', 'камень', 'минерал', 'игра', 'фильм',
    'мультфильм', 'мультик', 'книга', 'роман', 'повесть', 'инструмент',
    'страна', 'республика', 'паста', 'макароны', 'герой', 'персонаж', 'бог',
    'профессия', 'порода', 'собака', 'машина', 'автомобиль', 'марка', 'язык',
    'the', 'a', 'an', 'of'
  ]);

  function stripGeneric(normStr) {
    const words = normStr.split(' ').filter((w) => w && !GENERIC_WORDS.has(w));
    return words.join(' ').trim();
  }

  function enToRuPhonetic(str) {
    let s = normalizeInput(str);
    s = s
      .replace(/sch/g, 'ш')
      .replace(/sh/g, 'ш')
      .replace(/ch/g, 'ч')
      .replace(/zh/g, 'ж')
      .replace(/kh/g, 'х')
      .replace(/ph/g, 'ф')
      .replace(/th/g, 'т')
      .replace(/ts/g, 'ц')
      .replace(/qu/g, 'кв')
      .replace(/ck/g, 'к')
      .replace(/ya/g, 'я')
      .replace(/yu/g, 'ю')
      .replace(/yo/g, 'е')
      .replace(/ye/g, 'е')
      .replace(/oo/g, 'у')
      .replace(/ee/g, 'и')
      .replace(/ea/g, 'и')
      .replace(/ai/g, 'аи')
      .replace(/ei/g, 'еи')
      .replace(/au/g, 'ау')
      .replace(/ou/g, 'ау')
      .replace(/ow/g, 'оу')
      .replace(/c([eiy])/g, 'с$1')
      .replace(/g([eiy])/g, 'дж$1')
      .replace(/j/g, 'дж')
      .replace(/x/g, 'кс')
      .replace(/w/g, 'в')
      .replace(/q/g, 'к')
      .replace(/c/g, 'к');
    const map = {
      a: 'а', b: 'б', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и',
      k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', r: 'р', s: 'с',
      t: 'т', u: 'у', v: 'в', y: 'и', z: 'з'
    };
    return s.replace(/[a-z]/g, (ch) => map[ch] || ch);
  }

  function ruToEnPhonetic(str) {
    const map = {
      а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z',
      и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p',
      р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch',
      ш: 'sh', щ: 'sh', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya'
    };
    return normalizeInput(str).replace(/[а-я]/g, (ch) => map[ch] ?? ch);
  }

  function levenshtein(a, b) {
    if (a === b) return 0;
    const m = a.length;
    const n = b.length;
    if (!m) return n;
    if (!n) return m;
    const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) dp[i][0] = i;
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[m][n];
  }

  function getPromptIndex(prompt) {
    if (prompt._index) return prompt._index;
    const entries = [];
    for (const ans of prompt.answers) {
      const variants = [ans.name, ...(ans.aliases || [])];
      for (const v of variants) {
        const vn = normalizeInput(v);
        if (!vn) continue;
        const vc = compactStr(vn);
        const vsk = skeletonStr(vn);
        const vruSk = skeletonStr(enToRuPhonetic(vn));
        const venSk = skeletonStr(ruToEnPhonetic(vn));
        const vstrip = compactStr(stripGeneric(vn));
        entries.push({ ans, vn, vc, vsk, vruSk, venSk, vstrip });
      }
    }
    prompt._index = entries;
    return entries;
  }

  function matchAnswer(rawInput, prompt) {
    const norm = normalizeInput(rawInput);
    const comp = compactStr(norm);
    if (!norm) return { status: 'empty' };

    const sk = skeletonStr(norm);
    const ruSk = skeletonStr(enToRuPhonetic(norm));
    const enSk = skeletonStr(ruToEnPhonetic(norm));
    const stripped = compactStr(stripGeneric(norm));
    const entries = getPromptIndex(prompt);

    // 1. Exact, skeleton (double letters / е-э / й-и), generic-stripped, and cross-script phonetic match
    for (const e of entries) {
      if (e.vn === norm || (comp.length >= 2 && e.vc === comp)) {
        return { status: 'exact', answer: e.ans };
      }
      if (sk.length >= 3 && (e.vsk === sk || e.vruSk === ruSk || e.venSk === enSk || e.vsk === ruSk || e.vruSk === sk)) {
        return { status: 'exact', answer: e.ans };
      }
      if (stripped.length >= 3 && e.vstrip.length >= 3 && e.vstrip === stripped) {
        return { status: 'exact', answer: e.ans };
      }
    }

    // 2. Fuzzy typo / prefix check (across native & transliterated forms)
    let bestAns = null;
    let bestDist = 99;
    const formsToCheck = [norm];
    const ruNorm = normalizeInput(enToRuPhonetic(norm));
    const enNorm = normalizeInput(ruToEnPhonetic(norm));
    if (ruNorm && ruNorm !== norm) formsToCheck.push(ruNorm);
    if (enNorm && enNorm !== norm) formsToCheck.push(enNorm);

    for (const e of entries) {
      if (e.vn.length < 4) continue;
      for (const f of formsToCheck) {
        if (f.length < 3) continue;

        if (f.length >= 5 && e.vn.startsWith(f)) {
          return { status: 'fuzzy', answer: e.ans };
        }

        const maxDist = e.vn.length >= 7 ? 2 : 1;
        if (Math.abs(e.vn.length - f.length) <= maxDist) {
          const d = levenshtein(f, e.vn);
          if (d <= maxDist && d < bestDist) {
            bestDist = d;
            bestAns = e.ans;
          }
        }
      }
    }

    if (bestAns) {
      return { status: 'fuzzy', answer: bestAns };
    }

    return { status: 'none' };
  }

  // ---------------- Ocean Dual-Canvas Engine ----------------
  class OceanStage {
    constructor(seaCanvas, foreCanvas, worldEl) {
      this.sea = seaCanvas;
      this.fore = foreCanvas;
      this.seaCtx = seaCanvas.getContext('2d');
      this.foreCtx = foreCanvas.getContext('2d');
      this.worldEl = worldEl;

      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);

      this.cameraY = 0;
      this.worldOffset = this.height * 0.54;

      this.particles = [];
      this.fish = [];
      this.bubbles = [];
      this.sparks = [];
      this.inkPuffs = [];
      this.clouds = [];
      this.kelp = [];
      this.orbitEffect = null; // { kind: 'schooler'|'krillion'|'rare', x, y, hex }

      this.initEntities();
      this.resize();
    }

    initEntities() {
      this.particles = Array.from({ length: 120 }, () => ({
        x: Math.random(),
        y: Math.random(),
        r: 1.2 + Math.random() * 1.6,
        speed: 0.16 + Math.random() * 0.45,
        alpha: 0.12 + Math.random() * 0.35,
        parallax: 0.16 + Math.random() * 0.42
      }));

      this.fish = Array.from({ length: 18 }, (_, i) => ({
        x: Math.random(),
        depthPx: 140 + i * 320 + Math.random() * 200,
        size: 10 + Math.random() * 14,
        speed: (Math.random() > 0.5 ? 1 : -1) * (0.00014 + Math.random() * 0.0002),
        alpha: 0.25 + Math.random() * 0.25
      }));

      this.bubbles = Array.from({ length: 26 }, () => ({
        x: Math.random() * this.width,
        y: Math.random() * this.height,
        r: 1.5 + Math.random() * 3.2,
        vy: 0.45 + Math.random() * 1.1,
        wobble: Math.random() * Math.PI * 2
      }));

      this.clouds = [
        { x: 0.06, y: 0.28, scale: 1.0, speed: 0.004 },
        { x: 0.32, y: 0.21, scale: 1.25, speed: 0.003 },
        { x: 0.52, y: 0.42, scale: 0.9, speed: 0.0045 },
        { x: 0.86, y: 0.36, scale: 1.05, speed: 0.0035 }
      ];

      this.kelp = [
        { side: 'L', offset: 22, depthPx: 620, height: 220, phase: 0.2 },
        { side: 'L', offset: 54, depthPx: 710, height: 170, phase: 1.3 },
        { side: 'R', offset: 56, depthPx: 660, height: 210, phase: 2.1 },
        { side: 'L', offset: 36, depthPx: 1220, height: 190, phase: 0.9 },
        { side: 'R', offset: 48, depthPx: 1280, height: 165, phase: 3.1 }
      ];
    }

    resize() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = appState.settings.lowPower ? 1 : Math.min(window.devicePixelRatio || 1, 2);

      [this.sea, this.fore].forEach((c) => {
        c.width = Math.floor(this.width * this.dpr);
        c.height = Math.floor(this.height * this.dpr);
        c.style.width = this.width + 'px';
        c.style.height = this.height + 'px';
      });
    }

    setCameraDepthPx(depthPx, ratio = 0.38) {
      this.cameraY = depthPx;
      this.worldOffset = this.height * ratio - depthPx;
      this.worldEl.style.transform = `translate3d(0px, ${this.worldOffset.toFixed(2)}px, 0px)`;
    }

    spawnChipBubbles(screenX, screenY, color = '#4de3ff') {
      const count = appState.settings.lowPower ? 1 : 3;
      for (let i = 0; i < count; i++) {
        this.bubbles.push({
          x: screenX + (Math.random() - 0.5) * 60,
          y: screenY + (Math.random() - 0.5) * 14,
          r: 2 + Math.random() * 3.5,
          vy: 1.1 + Math.random() * 1.7,
          wobble: Math.random() * Math.PI * 2,
          color,
          ephemeral: true,
          life: 1.0
        });
      }
      if (this.bubbles.length > 95) {
        this.bubbles.splice(0, this.bubbles.length - 95);
      }
    }

    spawnBurst(screenX, screenY, color = '#4de3ff', count = 14) {
      if (appState.settings.lowPower) count = Math.min(count, 4);
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
        const spd = 1.4 + Math.random() * 3.6;
        this.sparks.push({
          x: screenX,
          y: screenY,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          size: 3 + Math.floor(Math.random() * 3),
          color,
          life: 1.0
        });
      }
      if (this.sparks.length > 160) this.sparks.splice(0, this.sparks.length - 160);
    }

    spawnInkPuff(screenX, screenY) {
      if (appState.settings.lowPower) return;
      for (let i = 0; i < 4; i++) {
        this.inkPuffs.push({
          x: screenX + (Math.random() - 0.5) * 32,
          y: screenY + (Math.random() - 0.5) * 18,
          r: 8 + Math.random() * 14,
          vx: (Math.random() - 0.5) * 0.7,
          vy: -0.4 - Math.random() * 0.6,
          life: 1.0
        });
      }
      if (this.inkPuffs.length > 50) this.inkPuffs.splice(0, this.inkPuffs.length - 50);
    }

    drawPixelCloud(ctx, x, y, s) {
      const p = Math.round(8 * s);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.88)';
      ctx.fillRect(x + p * 3, y, p * 5, p);
      ctx.fillRect(x + p * 2, y + p, p * 8, p);
      ctx.fillRect(x + p, y + p * 2, p * 11, p);
      ctx.fillRect(x, y + p * 3, p * 13, p);
      ctx.fillStyle = 'rgba(214, 238, 249, 0.75)';
      ctx.fillRect(x + p, y + p * 4, p * 10, Math.max(2, p * 0.6));
    }

    drawPixelBoat(ctx, cx, cy, tiltRad) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(tiltRad);
      const u = 4;
      // Dark silhouetted trawler hull & cabin
      ctx.fillStyle = '#0c1c30';
      // Hull lower
      ctx.fillRect(-10 * u, -2 * u, 21 * u, 2.5 * u);
      // Bow prow + stern step
      ctx.fillRect(-12 * u, -4 * u, 26 * u, 2 * u);
      ctx.fillRect(11 * u, -5 * u, 4 * u, 1.5 * u);
      // Wheelhouse cabin
      ctx.fillRect(-4 * u, -9 * u, 8 * u, 5 * u);
      ctx.fillRect(-2 * u, -11 * u, 5 * u, 2 * u);
      // Little cyan cabin windows
      ctx.fillStyle = '#4de3ff';
      ctx.fillRect(-2 * u, -8 * u, 2 * u, 2 * u);
      ctx.fillRect(1 * u, -8 * u, 2 * u, 2 * u);
      // Tall mast
      ctx.fillStyle = '#0c1c30';
      ctx.fillRect(0, -18 * u, u, 8 * u);
      // Bright Krillion Pink Triangular Pennant Flag
      ctx.fillStyle = '#ff5d8f';
      ctx.fillRect(-6 * u, -17 * u, 6 * u, 3 * u);
      ctx.fillRect(-8 * u, -16 * u, 2 * u, u);
      ctx.restore();
    }

    drawDepthRuler(fctx, waterlineScreenY) {
      const phase = appEl.dataset.phase;
      const showRuler = phase === 'preview' || phase === 'answering' || phase === 'feedback' || phase === 'intro';
      if (!showRuler) return;

      const x = this.width - 10;
      const topBound = Math.max(waterlineScreenY, 56);
      if (topBound >= this.height) return;

      fctx.save();
      fctx.strokeStyle = 'rgba(125, 147, 184, 0.38)';
      fctx.lineWidth = 1;
      fctx.beginPath();
      fctx.moveTo(x, Math.max(0, waterlineScreenY));
      fctx.lineTo(x, this.height);
      fctx.stroke();

      fctx.font = '11px "JetBrains Mono", monospace';
      fctx.textAlign = 'right';
      fctx.textBaseline = 'middle';

      const showYou = phase !== 'intro' && session.totalDepthM > 0;
      const youY = showYou ? Math.round(this.worldOffset + session.totalDepthM * PX_PER_METER) : -9999;

      const startM = Math.max(0, Math.floor((0 - this.worldOffset) / PX_PER_METER / 10) * 10);
      const endM = Math.min(7000, Math.ceil((this.height - this.worldOffset) / PX_PER_METER / 10) * 10);

      for (let m = startM; m <= endM; m += 10) {
        const sy = Math.round(this.worldOffset + m * PX_PER_METER) + 0.5;
        if (sy < waterlineScreenY - 2 || sy > this.height - 8) continue;
        const is100 = m % 100 === 0;
        const is50 = m % 50 === 0;
        const tickLen = is100 ? 11 : is50 ? 7 : 4;

        fctx.strokeStyle = is100 ? 'rgba(164, 192, 232, 0.72)' : 'rgba(125, 147, 184, 0.35)';
        fctx.beginPath();
        fctx.moveTo(x - tickLen, sy);
        fctx.lineTo(x, sy);
        fctx.stroke();

        // Skip 100m text label if "ВЫ" indicator occupies that vertical band
        if (is100 && (!showYou || Math.abs(sy - youY) > 15)) {
          fctx.fillStyle = m === 0 ? 'rgba(200, 226, 255, 0.86)' : 'rgba(148, 173, 214, 0.85)';
          const label = m === 0 ? '0м' : `-${m}м`;
          fctx.fillText(label, x - 14, sy);
        }
      }

      // Pink "ВЫ" depth indicator marker during active dive
      if (showYou) {
        if (youY >= 40 && youY <= this.height - 20) {
          fctx.strokeStyle = '#ff5d8f';
          fctx.lineWidth = 2;
          fctx.beginPath();
          fctx.moveTo(x - 16, youY);
          fctx.lineTo(x, youY);
          fctx.stroke();

          fctx.fillStyle = '#ff5d8f';
          fctx.beginPath();
          fctx.moveTo(x, youY);
          fctx.lineTo(x + 7, youY - 4);
          fctx.lineTo(x + 7, youY + 4);
          fctx.closePath();
          fctx.fill();

          fctx.font = 'bold 11px "JetBrains Mono", monospace';
          fctx.fillStyle = 'rgba(5, 10, 20, 0.88)';
          fctx.fillRect(x - 42, youY - 8, 24, 16);
          fctx.fillStyle = '#ff5d8f';
          fctx.fillText('ВЫ', x - 20, youY);
        }
      }

      fctx.restore();
    }

    render(ts) {
      const t = ts * 0.001;
      const ctx = this.seaCtx;
      const fctx = this.foreCtx;
      ctx.save();
      ctx.scale(this.dpr, this.dpr);
      fctx.save();
      fctx.scale(this.dpr, this.dpr);

      ctx.clearRect(0, 0, this.width, this.height);
      fctx.clearRect(0, 0, this.width, this.height);

      const depthFrac = Math.max(0, Math.min(1, this.cameraY / 14000));
      const waterlineScreenY = this.worldOffset;

      // 1. Bright Daylight Cyan Pixel Sky when waterline is on screen (krillion.io parity)
      if (waterlineScreenY > -10) {
        const skyH = Math.min(this.height, waterlineScreenY + 24);
        const skyGrad = ctx.createLinearGradient(0, 0, 0, skyH);
        skyGrad.addColorStop(0, '#62b3db');
        skyGrad.addColorStop(0.55, '#8fd2ed');
        skyGrad.addColorStop(1, '#c3e9f8');
        ctx.fillStyle = skyGrad;
        ctx.fillRect(0, 0, this.width, skyH);

        // Glowing Pixel Sun (upper right)
        const sunX = this.width * 0.84;
        const sunY = Math.max(46, waterlineScreenY * 0.34);
        const sunGrad = ctx.createRadialGradient(sunX, sunY, 18, sunX, sunY, 96);
        sunGrad.addColorStop(0, 'rgba(255, 232, 130, 0.72)');
        sunGrad.addColorStop(0.55, 'rgba(255, 224, 110, 0.22)');
        sunGrad.addColorStop(1, 'rgba(255, 224, 110, 0)');
        ctx.fillStyle = sunGrad;
        ctx.beginPath();
        ctx.arc(sunX, sunY, 96, 0, Math.PI * 2);
        ctx.fill();

        // Stepped Pixel Sun Core
        ctx.fillStyle = '#ffe585';
        ctx.fillRect(Math.round(sunX - 24), Math.round(sunY - 32), 48, 64);
        ctx.fillRect(Math.round(sunX - 32), Math.round(sunY - 24), 64, 48);

        // Pixel Clouds drifting gently
        if (!appState.settings.lowPower) {
          for (const cl of this.clouds) {
            const cx = (((cl.x + t * cl.speed) % 1.25) - 0.12) * this.width;
            const cy = Math.max(24, waterlineScreenY * cl.y);
            if (cy < waterlineScreenY - 12) {
              this.drawPixelCloud(ctx, Math.round(cx), Math.round(cy), cl.scale);
            }
          }
        }
      }

      // 2. Ocean Body (exact krillion.io multi-stop depth progression)
      const oceanStart = Math.max(0, waterlineScreenY);
      if (oceanStart < this.height) {
        const stops = [
          [0.00, '#1d5580', '#123a5e'],
          [0.08, '#123a5e', '#0b1e38'],
          [0.22, '#0b1526', '#081020'],
          [0.50, '#081020', '#050a14'],
          [0.78, '#050a14', '#03070f'],
          [1.00, '#03070f', '#02050b']
        ];
        let sA = stops[0], sB = stops[stops.length - 1];
        for (let i = 0; i < stops.length - 1; i++) {
          if (depthFrac >= stops[i][0] && depthFrac <= stops[i + 1][0]) {
            sA = stops[i];
            sB = stops[i + 1];
            break;
          }
        }
        const span = Math.max(0.0001, sB[0] - sA[0]);
        const localT = (depthFrac - sA[0]) / span;
        const topColor = lerpHex(sA[1], sB[1], localT);
        const botColor = lerpHex(sA[2], sB[2], localT);

        const seaGrad = ctx.createLinearGradient(0, oceanStart, 0, this.height);
        seaGrad.addColorStop(0, topColor);
        seaGrad.addColorStop(1, botColor);
        ctx.fillStyle = seaGrad;
        ctx.fillRect(0, oceanStart, this.width, this.height - oceanStart);

        // Soft Sun Caustic Light Shafts near surface
        if (depthFrac < 0.14 && !appState.settings.lowPower) {
          const rayAlpha = (1 - depthFrac / 0.14) * 0.055;
          for (let i = 0; i < 6; i++) {
            const rx = this.width * (0.08 + i * 0.17) + Math.sin(t * 0.35 + i * 1.1) * 24;
            const rGrad = ctx.createLinearGradient(0, oceanStart, 0, this.height * 0.9);
            rGrad.addColorStop(0, `rgba(110, 224, 255, ${(rayAlpha * 1.4).toFixed(3)})`);
            rGrad.addColorStop(1, 'rgba(77, 227, 255, 0)');
            ctx.fillStyle = rGrad;
            ctx.beginPath();
            ctx.moveTo(rx - 18, oceanStart);
            ctx.lineTo(rx + 26, oceanStart);
            ctx.lineTo(rx + 125, this.height);
            ctx.lineTo(rx - 85, this.height);
            ctx.closePath();
            ctx.fill();
          }
        }
      }

      // 3. Undulating Surface Wave Crest + Pixel Trawler Boat
      if (waterlineScreenY > -55 && waterlineScreenY < this.height + 40) {
        ctx.beginPath();
        ctx.moveTo(0, waterlineScreenY);
        for (let x = 0; x <= this.width; x += 16) {
          const wy = waterlineScreenY + Math.sin(x * 0.014 + t * 1.9) * 5 + Math.cos(x * 0.028 - t * 1.2) * 2.5;
          ctx.lineTo(x, wy);
        }
        ctx.lineTo(this.width, Math.min(this.height, waterlineScreenY + 34));
        ctx.lineTo(0, Math.min(this.height, waterlineScreenY + 34));
        ctx.closePath();
        ctx.fillStyle = '#184b73';
        ctx.fill();

        ctx.beginPath();
        for (let x = 0; x <= this.width; x += 16) {
          const wy = waterlineScreenY + Math.sin(x * 0.014 + t * 1.9) * 5 + Math.cos(x * 0.028 - t * 1.2) * 2.5;
          if (x === 0) ctx.moveTo(x, wy);
          else ctx.lineTo(x, wy);
        }
        ctx.strokeStyle = 'rgba(205, 243, 255, 0.55)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Bobbing black pixel trawler boat
        const boatX = Math.round(this.width * 0.29);
        const boatWaveY = waterlineScreenY + Math.sin(boatX * 0.014 + t * 1.9) * 5 + Math.cos(boatX * 0.028 - t * 1.2) * 2.5;
        const slope = Math.cos(boatX * 0.014 + t * 1.9) * 0.065;
        this.drawPixelBoat(ctx, boatX, boatWaveY + 2, slope);
      }

      // 4. Pixel Kelp Silhouettes (200m - 700m depth band)
      for (const k of this.kelp) {
        const ky = this.worldOffset + k.depthPx;
        if (ky < waterlineScreenY + 40 || ky - k.height > this.height) continue;
        const kx = k.side === 'L' ? k.offset : this.width - k.offset;
        ctx.fillStyle = 'rgba(8, 22, 42, 0.85)';
        const segH = 12;
        const steps = Math.floor(k.height / segH);
        for (let s = 0; s < steps; s++) {
          const sy = ky - s * segH;
          const sway = Math.sin(t * 1.2 + k.phase + s * 0.32) * (s * 0.75);
          const w = 10 - (s / steps) * 4;
          ctx.fillRect(Math.round(kx + sway), Math.round(sy), Math.round(w), segH + 1);
          if (s % 2 === 0 && s > 1) {
            const leafDir = s % 4 === 0 ? 1 : -1;
            ctx.fillRect(Math.round(kx + sway + leafDir * w), Math.round(sy + 2), Math.round(w * 1.4), 7);
          }
        }
      }

      // 5. Rocky Trench Walls + Glowing Cyan/Pink Crystals (deep > 1800px / 900m)
      if (this.cameraY > 1400 || this.worldOffset < -1000) {
        const wallAlpha = Math.min(0.9, Math.max(0, (this.cameraY - 1200) / 2200));
        if (wallAlpha > 0.04) {
          const blockH = 72;
          const topIdx = Math.max(18, Math.floor((0 - this.worldOffset) / blockH) - 1);
          const botIdx = Math.min(205, Math.ceil((this.height - this.worldOffset) / blockH) + 1);
          for (let i = topIdx; i <= botIdx; i++) {
            const sy = this.worldOffset + i * blockH;
            const lw = 18 + ((i * 37) % 28);
            const rw = 18 + ((i * 53) % 28);
            ctx.fillStyle = `rgba(11, 20, 36, ${wallAlpha.toFixed(2)})`;
            ctx.fillRect(0, sy, lw, blockH + 2);
            ctx.fillRect(this.width - rw, sy, rw, blockH + 2);
            ctx.fillStyle = `rgba(22, 38, 66, ${(wallAlpha * 0.65).toFixed(2)})`;
            ctx.fillRect(lw - 4, sy + 6, 4, blockH - 12);
            ctx.fillRect(this.width - rw, sy + 8, 4, blockH - 16);

            // Bioluminescent crystal sparkles in trench rocks
            if (i % 3 === 0) {
              const pulse = 0.35 + 0.55 * Math.sin(t * 2.1 + i);
              ctx.fillStyle = i % 6 === 0
                ? `rgba(255, 93, 143, ${(wallAlpha * pulse).toFixed(2)})`
                : `rgba(77, 227, 255, ${(wallAlpha * pulse).toFixed(2)})`;
              ctx.fillRect(Math.max(4, lw - 10), sy + 18, 3, 3);
              ctx.fillRect(Math.min(this.width - 8, this.width - rw + 6), sy + 38, 3, 3);
            }
          }
        }
      }

      // 6. Sunken Titanic Hull Silhouette at -3,800m (7600px)
      const titanicY = this.worldOffset + 7620;
      if (titanicY > -120 && titanicY < this.height + 120) {
        const tx = this.width * 0.38;
        ctx.fillStyle = 'rgba(13, 25, 45, 0.72)';
        ctx.fillRect(tx - 110, titanicY - 22, 220, 34);
        ctx.fillRect(tx - 80, titanicY - 40, 150, 18);
        ctx.fillRect(tx - 55, titanicY - 58, 14, 18);
        ctx.fillRect(tx - 20, titanicY - 58, 14, 18);
        ctx.fillRect(tx + 15, titanicY - 58, 14, 18);
      }

      // 7. Marine Snow & Bioluminescent Particles
      const pLimit = appState.settings.lowPower ? 36 : this.particles.length;
      for (let i = 0; i < pLimit; i++) {
        const p = this.particles[i];
        const px = ((p.x * this.width + Math.sin(t * p.speed + i) * 14) % this.width + this.width) % this.width;
        const rawY = p.y * this.height + this.worldOffset * p.parallax + t * p.speed * 18;
        const py = ((rawY % this.height) + this.height) % this.height;
        if (py <= waterlineScreenY + 4) continue;
        if (depthFrac > 0.55) {
          ctx.fillStyle = i % 3 === 0
            ? `rgba(255, 93, 143, ${p.alpha * 0.75})`
            : `rgba(77, 227, 255, ${p.alpha * 0.75})`;
        } else {
          ctx.fillStyle = `rgba(198, 236, 255, ${p.alpha * 0.85})`;
        }
        ctx.fillRect(Math.round(px), Math.round(py), p.r, p.r);
      }

      // 8. Pixel Fish Silhouettes
      if (!appState.settings.lowPower) {
        for (const f of this.fish) {
          f.x = (f.x + f.speed + 1) % 1;
          const fy = this.worldOffset + f.depthPx;
          if (fy < Math.max(waterlineScreenY + 18, -40) || fy > this.height + 40) continue;
          const fx = f.x * (this.width + 80) - 40;
          const dir = f.speed > 0 ? 1 : -1;
          ctx.save();
          ctx.translate(fx, fy);
          ctx.scale(dir, 1);
          ctx.fillStyle = `rgba(6, 15, 28, ${Math.min(0.65, f.alpha * 1.8)})`;
          ctx.fillRect(-f.size * 0.45, -f.size * 0.2, f.size, f.size * 0.4);
          ctx.fillRect(-f.size * 0.8, -f.size * 0.3, f.size * 0.35, f.size * 0.6);
          ctx.restore();
        }
      }

      // 9. Orbiting effects around sinking chip (schooler fish, krillion swarm, ink puffs)
      if (this.orbitEffect && !appState.settings.lowPower) {
        const oe = this.orbitEffect;
        const count = oe.kind === 'krillion' ? 14 : oe.kind === 'schooler' ? 6 : 0;
        for (let i = 0; i < count; i++) {
          const ang = t * (oe.kind === 'krillion' ? 2.8 : 1.9) + (i * Math.PI * 2) / count;
          const rad = (oe.kind === 'krillion' ? 76 : 64) + Math.sin(t * 2 + i) * 14;
          const ox = oe.x + Math.cos(ang) * rad;
          const oy = oe.y + Math.sin(ang) * rad * 0.55;
          fctx.fillStyle = oe.kind === 'krillion' ? '#ff5d8f' : '#4de3ff';
          fctx.fillRect(Math.round(ox - 4), Math.round(oy - 2), 8, 4);
          fctx.fillRect(Math.round(ox - 7), Math.round(oy - 3), 3, 6);
        }
      }

      // 10. Ink puffs (squid rare tier)
      for (let i = this.inkPuffs.length - 1; i >= 0; i--) {
        const p = this.inkPuffs[i];
        p.x += p.vx;
        p.y += p.vy;
        p.r += 0.35;
        p.life -= 0.018;
        if (p.life <= 0) {
          this.inkPuffs.splice(i, 1);
          continue;
        }
        fctx.fillStyle = `rgba(110, 14, 34, ${(p.life * 0.45).toFixed(3)})`;
        fctx.beginPath();
        fctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        fctx.fill();
      }

      // 11. Pixel spark bursts
      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const sp = this.sparks[i];
        sp.x += sp.vx;
        sp.y += sp.vy;
        sp.vy += 0.06;
        sp.life -= 0.032;
        if (sp.life <= 0) {
          this.sparks.splice(i, 1);
          continue;
        }
        fctx.globalAlpha = Math.max(0, sp.life);
        fctx.fillStyle = sp.color;
        fctx.fillRect(Math.round(sp.x), Math.round(sp.y), sp.size, sp.size);
      }
      fctx.globalAlpha = 1;

      // 12. Foreground rising bubbles
      for (let i = this.bubbles.length - 1; i >= 0; i--) {
        const b = this.bubbles[i];
        b.y -= b.vy;
        b.x += Math.sin(t * 2 + b.wobble) * 0.35;
        if (b.ephemeral) {
          b.life -= 0.016;
          if (b.life <= 0) {
            this.bubbles.splice(i, 1);
            continue;
          }
        } else if (b.y < Math.max(0, waterlineScreenY)) {
          b.y = this.height + 10;
          b.x = Math.random() * this.width;
        }
        if (b.y <= waterlineScreenY + 4) continue;
        fctx.strokeStyle = b.color || 'rgba(195, 240, 255, 0.38)';
        fctx.globalAlpha = b.ephemeral ? Math.max(0, b.life * 0.72) : 0.36;
        fctx.lineWidth = 1.5;
        fctx.beginPath();
        fctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        fctx.stroke();
      }
      fctx.globalAlpha = 1;

      // 13. Right-Edge Canvas Depth Ruler (exact krillion.io style)
      this.drawDepthRuler(fctx, waterlineScreenY);

      ctx.restore();
      fctx.restore();
    }
  }

  function lerpHex(a, b, t) {
    const ah = parseInt(a.slice(1), 16);
    const bh = parseInt(b.slice(1), 16);
    const ar = (ah >> 16) & 255, ag = (ah >> 8) & 255, ab = ah & 255;
    const br = (bh >> 16) & 255, bg = (bh >> 8) & 255, bb = bh & 255;
    const rr = Math.round(ar + (br - ar) * t);
    const rg = Math.round(ag + (bg - ag) * t);
    const rb = Math.round(ab + (bb - ab) * t);
    return `rgb(${rr}, ${rg}, ${rb})`;
  }

  // ---------------- Mascot Controller ----------------
  class MascotController {
    constructor(el, imgEl) {
      this.el = el;
      this.img = imgEl;
      this.x = 40;
      this.y = 200;
      this.applyBuddy();
      this.el.addEventListener('click', () => this.poke());
      this.el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.poke();
        }
      });
    }

    applyBuddy() {
      const buddy = DATA.BUDDIES.find((b) => b.id === appState.buddyId) || DATA.BUDDIES[0];
      this.img.src = buddy.sprite;
      this.img.alt = buddy.name;
      this.el.style.setProperty('--dsm-color', buddy.color);
      this.el.style.setProperty('--dsm-glow', buddy.color);
      this.el.style.setProperty('--dsm-shadow', buddy.color + '73');
      this.el.classList.toggle('gold', !!buddy.gold);
    }

    poke() {
      sfx.mascot();
      this.img.classList.remove('jet', 'chomp');
      void this.img.offsetWidth;
      this.img.classList.add(Math.random() > 0.45 ? 'jet' : 'chomp');
      const buddy = DATA.BUDDIES.find((b) => b.id === appState.buddyId) || DATA.BUDDIES[0];
      ocean.spawnBurst(this.x + 32, this.y + 32, buddy.color, 10);
    }

    update(ts, phase) {
      const w = window.innerWidth;
      const h = window.innerHeight;
      if (phase === 'done') {
        // Done screen covers stage behind semi-transparent glass; tuck buddy neatly upper-right
        this.x = Math.max(w - 110, w * 0.78);
        this.y = 115 + Math.sin(ts * 0.002) * 8;
        this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0) rotate(-6deg)`;
        return;
      }
      if (appState.settings.lowPower) {
        this.x = phase === 'intro' ? Math.round(w - 108) : 28;
        this.y = phase === 'intro' ? Math.round(h * 0.62) : Math.round(h - 178);
        this.el.style.transform = `translate3d(${this.x}px, ${this.y}px, 0) rotate(-4deg)`;
        return;
      }
      const t = ts * 0.0008;
      if (phase === 'intro') {
        const cx = w * 0.72;
        const cy = h * 0.62;
        const rx = Math.min(w * 0.14, 110);
        const ry = Math.min(h * 0.06, 42);
        this.x = Math.max(16, Math.min(w - 88, cx + Math.cos(t) * rx));
        this.y = Math.max(76, Math.min(h - 165, cy + Math.sin(t * 1.6) * ry));
        const rot = Math.sin(t * 2.1) * 11;
        this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg)`;
        return;
      }
      // During preview/answering/feedback, stay safely at bottom-left near kelp so prompt cards never collide
      this.x = Math.max(18, Math.min(82, 40 + Math.cos(t * 1.2) * 14));
      this.y = Math.max(h * 0.56, Math.min(h - 172, h - 188 + Math.sin(t * 1.7) * 18));
      const rot = Math.sin(t * 2.1) * 10;
      this.el.style.transform = `translate3d(${this.x.toFixed(1)}px, ${this.y.toFixed(1)}px, 0) rotate(${rot.toFixed(1)}deg)`;
    }
  }

  // ---------------- DOM References ----------------
  const appEl = document.getElementById('app');
  const stageEl = document.getElementById('stage');
  const worldEl = document.getElementById('world');
  const worldMarkersEl = document.getElementById('world-markers');
  const roundLayerEl = document.getElementById('round-layer');
  const floorEl = document.getElementById('floor');
  const seaCanvas = document.getElementById('sea-canvas');
  const foreCanvas = document.getElementById('fore-canvas');
  const dimEl = document.getElementById('dim-overlay');
  const vignetteEl = document.getElementById('vignette');
  const crtEl = document.getElementById('crt');

  const heroTitleEl = document.getElementById('hero-title');
  const heroTaglineEl = document.getElementById('hero-tagline');
  const heroSublineEl = document.getElementById('hero-subline');
  const surfaceNoteEl = document.getElementById('surface-note');
  const introDiveNumEl = document.getElementById('intro-dive-num');
  const beginBtn = document.getElementById('begin-btn');
  const metaDailyBtn = document.getElementById('meta-daily-btn');
  const metaEndlessBtn = document.getElementById('meta-endless-btn');

  const hudDepthEl = document.getElementById('hud-depth');
  const hudScoreEl = document.getElementById('hud-score');
  const scorePodEl = document.getElementById('score-pod');
  const hudDotsEl = document.getElementById('hud-dots');
  const hudCountEl = document.getElementById('hud-count');
  const endlessSurfaceBtn = document.getElementById('endless-surface-btn');

  const promptCardEl = document.getElementById('prompt-card');
  const cardRoundEl = document.getElementById('card-round');
  const cardPromptEl = document.getElementById('card-prompt');

  const previewSecEl = document.getElementById('preview-sec');
  const answerForm = document.getElementById('answer-form');
  const answerInput = document.getElementById('answer-input');
  const diveBtn = document.getElementById('dive-btn');
  const timerDigitsEl = document.getElementById('timer-digits');
  const fuseFillEl = document.getElementById('fuse-fill');
  const correctionBoxEl = document.getElementById('correction-box');
  const rejectBoxEl = document.getElementById('reject-box');

  const nextWrapEl = document.getElementById('next-wrap');
  const nextBtn = document.getElementById('next-btn');
  const nextSurfaceBtn = document.getElementById('next-surface-btn');

  const doneInnerEl = document.getElementById('done-inner');

  const menuBtn = document.getElementById('menu-btn');
  const muteBtn = document.getElementById('mute-btn');
  const muteIconOn = document.getElementById('mute-icon-on');
  const muteIconOff = document.getElementById('mute-icon-off');
  const settingsBtn = document.getElementById('settings-btn');
  const wardrobeBtn = document.getElementById('wardrobe-btn');

  const ocean = new OceanStage(seaCanvas, foreCanvas, worldEl);
  const mascot = new MascotController(document.getElementById('mascot'), document.getElementById('mascot-img'));

  // ---------------- Static World Elements ----------------
  function initStaticDecor() {
    // Staggered bobbing hero letters
    const titleWord = 'КРИЛЛИОН';
    heroTitleEl.innerHTML = titleWord
      .split('')
      .map((ch, i) => `<span style="animation-delay: ${(i * 0.18).toFixed(2)}s;">${ch}</span>`)
      .join('');

    // Ambient markers
    worldMarkersEl.innerHTML = DATA.AMBIENT_MARKERS.map((m) => {
      const inner = m.side === 'L'
        ? `<span class="dash">──</span> ${m.text}`
        : `${m.text} <span class="dash">──</span>`;
      return `<div class="ds-amb ${m.side}${m.major ? ' major' : ''}" style="top: ${m.top}px;">${inner}</div>`;
    }).join('');

    // Trench floor rocky sill + hydrothermal vent glow
    floorEl.innerHTML = `
      <svg viewBox="0 0 800 320" preserveAspectRatio="none" shape-rendering="crispEdges" style="width:100%;height:100%;display:block;">
        <rect width="800" height="320" fill="#02050b"/>
        <path d="M0 140h60v-20h80v30h90v-40h110v25h70v-15h100v35h80v-25h110v15h100v175H0z" fill="#060f1e"/>
        <path d="M0 190h90v-15h120v20h80v-25h130v30h90v-20h120v15h170v125H0z" fill="#09162b"/>
        <rect x="110" y="130" width="24" height="60" fill="#101d33"/>
        <rect x="116" y="124" width="12" height="6" fill="#ff5d8f"/>
        <rect x="520" y="140" width="32" height="55" fill="#101d33"/>
        <rect x="528" y="134" width="16" height="6" fill="#4de3ff"/>
        <rect x="330" y="185" width="40" height="12" fill="#ffd166" opacity="0.25"/>
        <rect x="0" y="240" width="800" height="80" fill="#050a14"/>
      </svg>
    `;
  }

  // ---------------- Game Session State ----------------
  let session = {
    mode: 'daily', // 'daily' | 'archive' | 'endless'
    diveNumber: DATA.getTodayDiveNumber(),
    phase: 'intro',
    prompts: [],
    roundIndex: 0,
    totalScore: 0,
    totalDepthM: 0,
    results: [],
    pendingSuggestion: null, // { typed, answer }
    previewTimer: null,
    answerTimerRaf: null,
    feedbackAnimRaf: null,
    answerDeadline: 0,
    lastShownSecond: ROUND_SECONDS
  };

  function setPhase(phase) {
    session.phase = phase;
    appEl.dataset.phase = phase;
    crtEl.classList.remove('zap');
    void crtEl.offsetWidth;
    crtEl.classList.add('zap');
  }

  function applySettingsToDom() {
    document.documentElement.classList.toggle('colorblind', !!appState.settings.colorblind);
    const muted = !!appState.settings.muted;
    muteIconOn.hidden = muted;
    muteIconOff.hidden = !muted;
    muteBtn.setAttribute('aria-pressed', String(muted));
    muteBtn.setAttribute('aria-label', muted ? 'Включить звук' : 'Выключить звук');

    document.getElementById('opt-lowpower').checked = !!appState.settings.lowPower;
    document.getElementById('opt-colorblind').checked = !!appState.settings.colorblind;
    document.getElementById('opt-corrections').checked = !!appState.settings.answerCorrections;
    document.getElementById('opt-clear-rejected').checked = !!appState.settings.clearRejected;
    document.getElementById('opt-share-link').checked = !!appState.settings.shareLink;
    document.getElementById('opt-unlock-buddies').checked = !!appState.settings.unlockAllBuddies;

    ocean.resize();
    mascot.applyBuddy();
  }

  function clearTimers() {
    if (session.previewTimer) {
      clearInterval(session.previewTimer);
      session.previewTimer = null;
    }
    if (session.answerTimerRaf) {
      cancelAnimationFrame(session.answerTimerRaf);
      session.answerTimerRaf = null;
    }
    if (session.feedbackAnimRaf) {
      cancelAnimationFrame(session.feedbackAnimRaf);
      session.feedbackAnimRaf = null;
    }
  }

  // ---------------- Mode Setup ----------------
  function buildEndlessDeck() {
    const seenSet = new Set(appState.seenEndlessIds || []);
    let unseen = DATA.PROMPTS.filter((p) => !seenSet.has(p.id));
    if (unseen.length === 0) {
      appState.seenEndlessIds = [];
      saveState();
      unseen = DATA.PROMPTS.slice();
    }
    const rest = DATA.PROMPTS.filter((p) => seenSet.has(p.id));
    return shufflePrompts(unseen).concat(shufflePrompts(rest));
  }

  function openMode(mode, diveNumber = DATA.getTodayDiveNumber()) {
    clearTimers();
    session.mode = mode;
    session.diveNumber = diveNumber;
    session.roundIndex = 0;
    session.totalScore = 0;
    session.totalDepthM = 0;
    session.results = [];
    session.pendingSuggestion = null;
    ocean.orbitEffect = null;

    roundLayerEl.innerHTML = '';
    worldEl.classList.remove('ds-reveal');
    dimEl.classList.remove('on');
    nextWrapEl.classList.remove('visible');
    promptCardEl.hidden = true;
    correctionBoxEl.hidden = true;
    correctionBoxEl.innerHTML = '';
    rejectBoxEl.hidden = true;
    rejectBoxEl.textContent = '';
    appEl.style.setProperty('--ds-urgency', '0');
    appEl.classList.remove('hot');
    answerForm.classList.remove('hot');
    floorEl.style.display = mode === 'endless' ? 'none' : 'block';

    if (mode === 'daily') {
      session.prompts = DATA.getDailyPrompts(diveNumber);
      heroTaglineEl.textContent = 'ЕЖЕДНЕВНОЕ ПОГРУЖЕНИЕ';
      heroSublineEl.textContent = '7 вопросов · 25 секунд на каждый · редкие ответы погружают глубже';
      surfaceNoteEl.hidden = true;
      introDiveNumEl.textContent = `ПОГРУЖЕНИЕ #${diveNumber}`;
      metaDailyBtn.hidden = true;
      metaEndlessBtn.hidden = false;

      const saved = appState.completedDives[String(diveNumber)];
      if (saved) {
        beginBtn.textContent = '▼ ПОСМОТРЕТЬ РЕЗУЛЬТАТЫ ▼';
        beginBtn.classList.add('secondary');
      } else {
        beginBtn.textContent = '▼ НАЧАТЬ ПОГРУЖЕНИЕ ▼';
        beginBtn.classList.remove('secondary');
      }
    } else if (mode === 'archive') {
      session.prompts = DATA.getDailyPrompts(diveNumber);
      heroTaglineEl.textContent = `АРХИВ · ПОГРУЖЕНИЕ #${diveNumber}`;
      heroSublineEl.textContent = `7 вопросов от ${DATA.getDiveDateLabel(diveNumber)} · бесплатный доступ`;
      surfaceNoteEl.hidden = true;
      introDiveNumEl.textContent = `АРХИВ #${diveNumber}`;
      metaDailyBtn.hidden = false;
      metaEndlessBtn.hidden = false;
      beginBtn.textContent = '▼ НАЧАТЬ ПОГРУЖЕНИЕ ▼';
      beginBtn.classList.remove('secondary');
    } else {
      session.prompts = buildEndlessDeck();
      const seenCount = new Set(appState.seenEndlessIds || []).size;
      const freshLeft = Math.max(1, DATA.PROMPTS.length - seenCount);
      heroTaglineEl.textContent = 'БЕСКОНЕЧНОЕ ПОГРУЖЕНИЕ';
      heroSublineEl.textContent = '90+ тем без повторов · без ограничений · всплывайте в любой момент';
      surfaceNoteEl.hidden = true;
      introDiveNumEl.textContent = `БЕСКОНЕЧНЫЙ · ${freshLeft} НОВЫХ ТЕМ`;
      metaDailyBtn.hidden = false;
      metaEndlessBtn.hidden = true;
      beginBtn.textContent = '▼ НАЧАТЬ ПОГРУЖЕНИЕ ▼';
      beginBtn.classList.remove('secondary');
    }

    ocean.setCameraDepthPx(0, 0.54);
    vignetteEl.style.opacity = '0.25';
    setPhase('intro');
    updateMenuCurrent();
  }

  function shufflePrompts(list) {
    const arr = list.slice();
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function updateMenuCurrent() {
    document.querySelectorAll('[data-nav]').forEach((el) => {
      const target = el.dataset.nav;
      el.setAttribute('aria-current', target === session.mode ? 'page' : 'false');
    });
  }

  // ---------------- Gameplay Loop ----------------
  function startDiveOrShowResults() {
    sfx.click();
    if (session.mode === 'daily') {
      const saved = appState.completedDives[String(session.diveNumber)];
      if (saved) {
        session.results = saved.results;
        session.totalScore = saved.score;
        session.totalDepthM = saved.depth;
        showDoneScreen();
        return;
      }
    }
    startNextRound();
  }

  function getCurrentPrompt() {
    if (session.mode === 'endless') {
      if (session.roundIndex >= session.prompts.length) {
        appState.seenEndlessIds = [];
        saveState();
        session.prompts = session.prompts.concat(shufflePrompts(DATA.PROMPTS));
      }
    }
    return session.prompts[session.roundIndex];
  }

  function updateHud() {
    hudDepthEl.textContent = `${session.totalDepthM.toLocaleString('ru-RU')}м`;
    hudScoreEl.textContent = String(session.totalScore);
    endlessSurfaceBtn.hidden = session.mode !== 'endless' || session.results.length === 0;

    if (session.mode === 'endless') {
      hudCountEl.textContent = `ВОПРОС ${session.roundIndex + 1} · БЕСКОНЕЧНЫЙ`;
      const recent = session.results.slice(-7);
      hudDotsEl.innerHTML = recent
        .map((r) => `<i class="done" style="--tc:${DATA.TIERS[r.tier].color};"></i>`)
        .join('') + '<i class="cur"></i>';
    } else {
      hudCountEl.textContent = `ВОПРОС ${session.roundIndex + 1} ИЗ 7`;
      hudDotsEl.innerHTML = Array.from({ length: 7 }, (_, i) => {
        if (i < session.results.length) {
          const t = DATA.TIERS[session.results[i].tier];
          return `<i class="done" style="--tc:${t.color};"></i>`;
        }
        if (i === session.roundIndex) return '<i class="cur"></i>';
        return '<i></i>';
      }).join('');
    }
  }

  function startNextRound() {
    clearTimers();
    const prompt = getCurrentPrompt();
    const startPx = session.totalDepthM * PX_PER_METER;
    ocean.setCameraDepthPx(startPx, 0.38);

    worldEl.classList.remove('ds-reveal');
    dimEl.classList.remove('on');
    roundLayerEl.innerHTML = '';
    nextWrapEl.classList.remove('visible');
    correctionBoxEl.hidden = true;
    correctionBoxEl.innerHTML = '';
    rejectBoxEl.hidden = true;
    rejectBoxEl.textContent = '';
    session.pendingSuggestion = null;
    appEl.style.setProperty('--ds-urgency', '0');
    appEl.classList.remove('hot');
    answerForm.classList.remove('hot');

    updateHud();

    cardRoundEl.textContent = session.mode === 'endless'
      ? `ВОПРОС ${session.roundIndex + 1} · БЕСКОНЕЧНЫЙ`
      : `ВОПРОС ${session.roundIndex + 1} ИЗ 7`;
    cardPromptEl.textContent = prompt.text;
    promptCardEl.classList.remove('gone');
    promptCardEl.hidden = false;

    setPhase('preview');

    let left = 3;
    previewSecEl.textContent = String(left);
    sfx.countdownTick(false);

    session.previewTimer = setInterval(() => {
      left -= 1;
      if (left > 0) {
        previewSecEl.textContent = String(left);
        sfx.countdownTick(false);
      } else {
        clearInterval(session.previewTimer);
        session.previewTimer = null;
        sfx.countdownTick(true);
        beginAnsweringPhase();
      }
    }, 820);
  }

  function beginAnsweringPhase() {
    setPhase('answering');
    answerInput.value = '';
    answerInput.disabled = false;
    diveBtn.disabled = false;
    timerDigitsEl.textContent = String(ROUND_SECONDS);
    timerDigitsEl.classList.remove('hot');
    fuseFillEl.style.transform = 'scaleX(1)';

    setTimeout(() => {
      answerInput.focus();
    }, 60);

    const durationMs = ROUND_SECONDS * 1000;
    session.answerDeadline = performance.now() + durationMs;
    session.lastShownSecond = ROUND_SECONDS;

    const step = (now) => {
      if (session.phase !== 'answering') return;
      const remMs = Math.max(0, session.answerDeadline - now);
      const frac = remMs / durationMs;
      const sec = Math.ceil(remMs / 1000);

      fuseFillEl.style.transform = `scaleX(${frac.toFixed(4)})`;

      if (sec !== session.lastShownSecond) {
        session.lastShownSecond = sec;
        timerDigitsEl.textContent = String(sec);
        if (sec <= 5 && sec > 0) {
          sfx.urgentTick();
        }
      }

      if (remMs <= 5000) {
        answerForm.classList.add('hot');
        appEl.classList.add('hot');
        timerDigitsEl.classList.add('hot');
        const urg = ((5000 - remMs) / 5000).toFixed(3);
        appEl.style.setProperty('--ds-urgency', urg);
      }

      if (remMs <= 0) {
        handleTimeout();
        return;
      }

      session.answerTimerRaf = requestAnimationFrame(step);
    };

    session.answerTimerRaf = requestAnimationFrame(step);
  }

  function handleTimeout() {
    clearTimers();
    appEl.style.setProperty('--ds-urgency', '0');
    appEl.classList.remove('hot');
    answerForm.classList.remove('hot');

    // If an autocorrect suggestion is waiting, auto-accept it!
    if (session.pendingSuggestion) {
      acceptAnswer(session.pendingSuggestion.answer);
      return;
    }

    // Check if whatever is currently typed happens to be valid
    const prompt = getCurrentPrompt();
    if (answerInput.value.trim()) {
      const m = matchAnswer(answerInput.value, prompt);
      if (m.status === 'exact' || m.status === 'fuzzy') {
        acceptAnswer(m.answer);
        return;
      }
    }

    // Miss
    acceptAnswer(null);
  }

  function showReject(typed) {
    sfx.reject();
    rejectBoxEl.textContent = `«${typed}»: нет эха. попробуйте ещё`;
    rejectBoxEl.hidden = false;
    rejectBoxEl.classList.remove('ds-reject-shake');
    void rejectBoxEl.offsetWidth;
    rejectBoxEl.classList.add('ds-reject-shake');

    if (appState.settings.clearRejected) {
      answerInput.value = '';
    }
  }

  function showCorrection(typed, canonical) {
    sfx.suggest();
    rejectBoxEl.hidden = true;
    correctionBoxEl.innerHTML = `
      <div class="ds-correction-panel ds-px-sm">
        <span>«${escapeHtml(typed)}»</span>
        <span class="ds-correction-arrow">→</span>
        <span>«${escapeHtml(canonical)}»</span>
        <span class="ds-correction-hint">отправьте ещё раз для подтверждения · или исправьте</span>
      </div>
    `;
    correctionBoxEl.hidden = false;
  }

  answerInput.addEventListener('input', () => {
    rejectBoxEl.hidden = true;
    rejectBoxEl.textContent = '';
    if (session.pendingSuggestion && normalizeInput(answerInput.value) !== normalizeInput(session.pendingSuggestion.typed)) {
      session.pendingSuggestion = null;
      correctionBoxEl.hidden = true;
      correctionBoxEl.innerHTML = '';
    }
  });

  answerForm.addEventListener('submit', (e) => {
    e.preventDefault();
    if (session.phase !== 'answering') return;

    const raw = answerInput.value.trim();
    if (!raw) return;

    const prompt = getCurrentPrompt();

    // Confirming pending suggestion
    if (session.pendingSuggestion && normalizeInput(raw) === normalizeInput(session.pendingSuggestion.typed)) {
      acceptAnswer(session.pendingSuggestion.answer);
      return;
    }

    const res = matchAnswer(raw, prompt);
    if (res.status === 'exact') {
      acceptAnswer(res.answer);
    } else if (res.status === 'fuzzy') {
      if (appState.settings.answerCorrections) {
        session.pendingSuggestion = { typed: raw, answer: res.answer };
        showCorrection(raw, res.answer.name);
      } else {
        acceptAnswer(res.answer);
      }
    } else {
      session.pendingSuggestion = null;
      correctionBoxEl.hidden = true;
      correctionBoxEl.innerHTML = '';
      showReject(raw);
    }
  });

  function acceptAnswer(answerObj) {
    clearTimers();
    answerInput.disabled = true;
    diveBtn.disabled = true;
    correctionBoxEl.hidden = true;
    correctionBoxEl.innerHTML = '';
    rejectBoxEl.hidden = true;
    rejectBoxEl.textContent = '';
    session.pendingSuggestion = null;
    appEl.style.setProperty('--ds-urgency', '0');
    appEl.classList.remove('hot');
    answerForm.classList.remove('hot');

    promptCardEl.classList.add('gone');
    setTimeout(() => {
      if (session.phase === 'feedback') promptCardEl.hidden = true;
    }, 520);

    const tierId = answerObj ? answerObj.tier : 'miss';
    const tier = DATA.TIERS[tierId];
    const prompt = getCurrentPrompt();

    const startDepthM = session.totalDepthM;
    const endDepthM = startDepthM + tier.depth;
    const startScore = session.totalScore;
    const endScore = startScore + tier.pts;

    const resultRecord = {
      promptId: prompt.id,
      promptText: prompt.text,
      answer: answerObj ? answerObj.name : null,
      players: answerObj ? answerObj.players : 0,
      tier: tierId,
      pts: tier.pts,
      depth: tier.depth
    };
    session.results.push(resultRecord);
    session.totalDepthM = endDepthM;
    session.totalScore = endScore;

    if (session.mode === 'endless') {
      if (!appState.seenEndlessIds) appState.seenEndlessIds = [];
      if (!appState.seenEndlessIds.includes(prompt.id)) {
        appState.seenEndlessIds.push(prompt.id);
        saveState();
      }
    }

    setPhase('feedback');
    sfx.diveStart();
    worldEl.classList.add('ds-reveal');

    // Render 6 tier threshold lines & sinking chip inside #round-layer
    const basePx = startDepthM * PX_PER_METER;
    const targetPx = endDepthM * PX_PER_METER;
    const tierList = ['plankton', 'tooclever', 'schooler', 'rare', 'deepcut', 'krillion'];

    let html = tierList.map((tid, idx) => {
      const t = DATA.TIERS[tid];
      const top = basePx + t.depth * PX_PER_METER;
      return `
        <div class="ds-tierline" data-tier-idx="${idx}" data-top="${top}" style="top: ${top}px; --tc: ${t.color}; opacity: 1; transition: opacity 0.5s ease-out ${idx * 80}ms;">
          <div class="tag">
            <img src="${t.sprite}" alt="">
            <span>${t.name} · ${t.pts}</span>
          </div>
        </div>
      `;
    }).join('');

    const chipLabel = answerObj ? `«${escapeHtml(answerObj.name)}»` : 'ВРЕМЯ ВЫШЛО';
    html += `<div id="sinking-chip" class="ds-chip ds-px${tierId === 'krillion' ? ' gold' : ''}" style="--cc: ${tier.color}; transform: translate3d(-50%, ${basePx + 40}px, 0);">${chipLabel}</div>`;
    roundLayerEl.innerHTML = html;

    const chipEl = document.getElementById('sinking-chip');
    const lineEls = Array.from(roundLayerEl.querySelectorAll('.ds-tierline'));
    const crossed = new Set();

    const descentDuration = tierId === 'miss' ? 950 : Math.min(2700, 1250 + tier.depth * 1.45);
    const t0 = performance.now();

    const animateDescent = (now) => {
      const p = Math.min(1, (now - t0) / descentDuration);
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;

      const curPx = basePx + (targetPx - basePx) * ease;
      const chipY = (basePx + 40) + (targetPx - (basePx + 40)) * ease;
      const swayX = Math.sin(p * Math.PI * 3) * (tierId === 'miss' ? 2 : 11) * (1 - p);
      const tilt = Math.sin(p * Math.PI * 3) * 4 * (1 - p);

      ocean.setCameraDepthPx(curPx, 0.38);
      chipEl.style.transform = `translate3d(calc(-50% + ${swayX.toFixed(1)}px), ${chipY.toFixed(1)}px, 0) rotate(${tilt.toFixed(1)}deg)`;

      const screenY = ocean.worldOffset + chipY;
      const screenX = ocean.width * 0.5 + swayX;
      if (tierId === 'schooler' || tierId === 'krillion') {
        ocean.orbitEffect = { kind: tierId, x: screenX, y: screenY, hex: tier.hex };
      } else {
        ocean.orbitEffect = null;
      }

      if (tierId !== 'miss' && p < 0.96) {
        ocean.spawnChipBubbles(screenX, screenY, tier.hex);
        if (tierId === 'rare' && Math.random() < 0.25) {
          ocean.spawnInkPuff(screenX, screenY);
        }
      }

      lineEls.forEach((le) => {
        const idx = Number(le.dataset.tierIdx);
        const lTop = Number(le.dataset.top);
        if (chipY >= lTop && !crossed.has(idx)) {
          crossed.add(idx);
          le.classList.add('passed');
          sfx.crossTier(idx);
          ocean.spawnBurst(screenX, ocean.worldOffset + lTop, tierList[idx] ? DATA.TIERS[tierList[idx]].hex : tier.hex, 10);
        }
      });

      const curMeters = Math.round(startDepthM + tier.depth * ease);
      const curPts = Math.round(startScore + tier.pts * ease);
      hudDepthEl.textContent = `${curMeters.toLocaleString('ru-RU')}м`;
      hudScoreEl.textContent = String(curPts);
      vignetteEl.style.opacity = (0.25 + Math.min(0.65, curMeters / 9500)).toFixed(3);

      if (p < 1) {
        session.feedbackAnimRaf = requestAnimationFrame(animateDescent);
      } else {
        onChipLanded(resultRecord, targetPx, tier);
      }
    };

    session.feedbackAnimRaf = requestAnimationFrame(animateDescent);
  }

  function onChipLanded(record, targetPx, tier) {
    sfx.land(tier.id);
    ocean.orbitEffect = null;
    updateHud();

    if (tier.pts > 0) {
      scorePodEl.classList.remove('slam');
      void scorePodEl.offsetWidth;
      scorePodEl.classList.add('slam');
      ocean.spawnBurst(ocean.width * 0.5, ocean.worldOffset + targetPx, tier.hex, 22);
    }

    stageEl.classList.remove('ds-shake');
    void stageEl.offsetWidth;
    stageEl.classList.add('ds-shake');
    dimEl.classList.add('on');

    const chip = document.getElementById('sinking-chip');
    if (chip) chip.remove();
    roundLayerEl.querySelectorAll('.ds-tierline').forEach((el) => {
      el.style.opacity = '0.35';
    });

    const ansText = record.answer ? `«${escapeHtml(record.answer)}»` : 'Ответ не дан';
    const banner = document.createElement('div');
    banner.className = 'ds-landed';
    banner.style.top = `${targetPx}px`;
    banner.style.setProperty('--tc', tier.color);
    banner.innerHTML = `
      <img class="icon" src="${tier.sprite}" alt="">
      <div class="tname">${tier.name}</div>
      <div class="tans">${ansText}</div>
      <div class="tpts"><b>+${tier.pts} ОЧК</b> · погружение на ${tier.depth} м</div>
      <div class="tsub">${tier.desc}</div>
    `;
    roundLayerEl.appendChild(banner);

    const isLastDaily = session.mode !== 'endless' && session.roundIndex === 6;
    nextBtn.textContent = isLastDaily ? 'ВСПЛЫТЬ ▲' : `К ВОПРОСУ ${session.roundIndex + 2} →`;
    nextSurfaceBtn.hidden = session.mode !== 'endless';
    nextWrapEl.classList.add('visible');
  }

  nextBtn.addEventListener('click', () => {
    sfx.click();
    nextWrapEl.classList.remove('visible');
    if (session.mode !== 'endless' && session.roundIndex >= 6) {
      finishDive();
    } else {
      session.roundIndex += 1;
      startNextRound();
    }
  });

  function triggerSurfaceFromEndless() {
    sfx.click();
    clearTimers();
    nextWrapEl.classList.remove('visible');
    promptCardEl.hidden = true;
    finishDive();
  }

  nextSurfaceBtn.addEventListener('click', triggerSurfaceFromEndless);
  endlessSurfaceBtn.addEventListener('click', triggerSurfaceFromEndless);

  // ---------------- Finish Dive & Done Dashboard ----------------
  function finishDive() {
    if (session.mode === 'daily') {
      const key = String(session.diveNumber);
      if (!appState.completedDives[key]) {
        appState.stats.played += 1;
        appState.stats.totalScore += session.totalScore;
        if (session.totalScore > appState.stats.bestScore) {
          appState.stats.bestScore = session.totalScore;
        }
        if (appState.stats.lastDiveDay === session.diveNumber - 1) {
          appState.stats.streak += 1;
        } else if (appState.stats.lastDiveDay !== session.diveNumber) {
          appState.stats.streak = 1;
        }
        if (appState.stats.streak > appState.stats.bestStreak) {
          appState.stats.bestStreak = appState.stats.streak;
        }
        appState.stats.lastDiveDay = session.diveNumber;
      }
      appState.completedDives[key] = {
        score: session.totalScore,
        depth: session.totalDepthM,
        results: session.results
      };
      saveState();
    } else if (session.mode === 'archive') {
      const key = String(session.diveNumber);
      const prev = appState.completedDives[key];
      if (!prev || session.totalScore >= prev.score) {
        appState.completedDives[key] = {
          score: session.totalScore,
          depth: session.totalDepthM,
          results: session.results
        };
        saveState();
      }
    }

    showDoneScreen();
  }

  function computePercentile(score, maxScore = 700) {
    const ratio = Math.max(0, Math.min(1, score / Math.max(100, maxScore)));
    // Smooth S-curve roughly matching krillion distribution (335/700 -> ~73%)
    const pct = Math.round(100 / (1 + Math.exp(-(ratio - 0.36) * 8.4)));
    return Math.max(1, Math.min(99, pct));
  }

  function getBearingBrackets(isEndless) {
    if (isEndless) {
      return [
        { tierId: 'plankton', min: 0, max: 21, range: '0–21', color: 'var(--tier-plankton)', text: 'Планктон. В океане ещё много неизведанного.' },
        { tierId: 'schooler', min: 22, max: 35, range: '22–35', color: 'var(--tier-schooler)', text: 'Косяк. Плывёте вместе со стаей.' },
        { tierId: 'rare', min: 36, max: 50, range: '36–50', color: 'var(--tier-rare)', text: 'Редкий. Ниже термоклина. Отлично.' },
        { tierId: 'deepcut', min: 51, max: 64, range: '51–64', color: 'var(--tier-deepcut)', text: 'Глубоководный. Серьёзное погружение.' },
        { tierId: 'krillion', min: 65, max: 99999, range: '65+', color: 'var(--tier-krillion)', text: 'Один на криллион. Обитатель впадины.' }
      ];
    }
    return [
      { tierId: 'plankton', min: 0, max: 150, range: '0–150', color: 'var(--tier-plankton)', text: 'Планктон. В океане ещё много неизведанного.' },
      { tierId: 'schooler', min: 151, max: 250, range: '151–250', color: 'var(--tier-schooler)', text: 'Косяк. Плывёте вместе со стаей.' },
      { tierId: 'rare', min: 251, max: 350, range: '251–350', color: 'var(--tier-rare)', text: 'Редкий. Ниже термоклина. Отлично.' },
      { tierId: 'deepcut', min: 351, max: 449, range: '351–449', color: 'var(--tier-deepcut)', text: 'Глубоководный. Серьёзное погружение.' },
      { tierId: 'krillion', min: 450, max: 99999, range: '450+', color: 'var(--tier-krillion)', text: 'Один на криллион. Обитатель впадины.' }
    ];
  }

  function pluralRu(n, one, few, many) {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
    return many;
  }

  function buildBellCurveSvg(score, maxPossible) {
    const xStart = 12;
    const width = 316;
    const baseY = 78;
    const amp = 66;
    const meanU = 0.39;
    const sigma = 0.148;

    const pts = [];
    const steps = 64;
    for (let i = 0; i <= steps; i++) {
      const u = i / steps;
      const x = xStart + u * width;
      const g = Math.exp(-0.5 * Math.pow((u - meanU) / sigma, 2));
      const y = baseY - amp * g;
      pts.push([x.toFixed(1), y.toFixed(1)]);
    }

    const linePath = 'M ' + pts.map((p) => p.join(',')).join(' L ');
    const areaPath = `${linePath} L ${(xStart + width).toFixed(1)},${baseY} L ${xStart},${baseY} Z`;

    const uScore = Math.max(0.01, Math.min(0.99, score / Math.max(100, maxPossible)));
    const curX = (xStart + uScore * width).toFixed(1);
    const curG = Math.exp(-0.5 * Math.pow((uScore - meanU) / sigma, 2));
    const curY = (baseY - amp * curG).toFixed(1);

    const axisLabels = [0, 100, 200, 300, 400, 500, 600, 700].map((val) => {
      const ratio = val / 700;
      const tx = (xStart + ratio * width).toFixed(1);
      const disp = maxPossible !== 700 ? Math.round((val / 700) * maxPossible) : val;
      return `
        <line x1="${tx}" y1="${baseY}" x2="${tx}" y2="${baseY + 4}" stroke="rgba(125,147,184,0.45)" stroke-width="1"></line>
        <text x="${tx}" y="${baseY + 14}" fill="rgba(125,147,184,0.72)" font-size="9" text-anchor="middle" font-family="monospace">${disp}</text>
      `;
    }).join('');

    return `
      <svg viewBox="0 0 340 108" style="width:100%;height:auto;display:block;" role="img" aria-label="Распределение очков игроков">
        <defs>
          <linearGradient id="pc-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="var(--color-lumen-cyan)" stop-opacity="0.52"></stop>
            <stop offset="100%" stop-color="var(--color-lumen-cyan)" stop-opacity="0.04"></stop>
          </linearGradient>
          <clipPath id="pc-beaten">
            <rect x="0" y="0" width="${curX}" height="96"></rect>
          </clipPath>
        </defs>
        <path d="${areaPath}" fill="url(#pc-fill)" opacity="0.2"></path>
        <path clip-path="url(#pc-beaten)" d="${areaPath}" fill="url(#pc-fill)" opacity="0.92"></path>
        <path d="${linePath}" fill="none" stroke="var(--color-lumen-cyan)" stroke-width="1.8"></path>
        ${axisLabels}
        <line x1="${curX}" y1="${curY}" x2="${curX}" y2="${baseY}" stroke="var(--color-lumen-pink)" stroke-width="2"></line>
        <circle cx="${curX}" cy="${curY}" r="3.5" fill="var(--color-lumen-pink)" stroke="#ffffff" stroke-width="0.8"></circle>
        <text x="${curX}" y="${baseY + 25}" fill="var(--color-lumen-pink)" font-size="9.5" font-weight="700" text-anchor="middle" font-family="monospace">ВЫ</text>
      </svg>
    `;
  }

  function buildDiveLogSvg(results) {
    const n = Math.max(1, results.length);
    const leftPad = 36;
    const rightPad = 14;
    const w = Math.max(360, n * 38 + leftPad + rightPad);
    const chartW = w - leftPad - rightPad;
    const topY = 14;
    const spanY = 112; // 0m .. -100m (100 pts)

    const gridLevels = [
      { pts: 0, label: '0м' },
      { pts: 25, label: '-25' },
      { pts: 50, label: '-50' },
      { pts: 75, label: '-75' },
      { pts: 100, label: '-100' }
    ];

    const gridHtml = gridLevels.map((g) => {
      const y = (topY + (g.pts / 100) * spanY).toFixed(1);
      return `
        <text x="${leftPad - 8}" y="${y}" fill="rgba(125,147,184,0.7)" font-size="9" text-anchor="end" dominant-baseline="middle" font-family="monospace">${g.label}</text>
        <line x1="${leftPad}" y1="${y}" x2="${w - rightPad}" y2="${y}" stroke="rgba(125,147,184,0.2)" stroke-width="1" stroke-dasharray="2 3"></line>
      `;
    }).join('');

    const colHtml = results.map((r, idx) => {
      const t = DATA.TIERS[r.tier];
      const cx = (leftPad + ((idx + 0.5) / n) * chartW).toFixed(1);
      const tipY = (topY + (r.pts / 100) * spanY).toFixed(1);
      const lineLen = r.pts > 0 ? tipY : topY + 6;
      return `
        <line x1="${cx}" y1="${topY}" x2="${cx}" y2="${lineLen}" stroke="${t.hex}" stroke-width="1.5" stroke-opacity="0.72"></line>
        <circle cx="${cx}" cy="${tipY}" r="9" fill="${t.hex}" fill-opacity="0.16"></circle>
        <image href="${t.sprite}" x="${(Number(cx) - 10).toFixed(1)}" y="${(Number(tipY) - 10).toFixed(1)}" width="20" height="20" style="image-rendering:pixelated;"></image>
        <text x="${cx}" y="${topY + spanY + 20}" fill="rgba(125,147,184,0.8)" font-size="9.5" text-anchor="middle" font-family="monospace">${idx + 1}</text>
      `;
    }).join('');

    return `
      <div class="ds-divelog-wrap" style="overflow-x:auto;">
        <svg class="ds-divelog-svg" viewBox="0 0 ${w} 154" style="min-width:${Math.min(w, 320)}px;" role="img" aria-label="Журнал глубины по вопросам">
          ${gridHtml}
          ${colHtml}
        </svg>
      </div>
    `;
  }

  function showDoneScreen() {
    roundLayerEl.innerHTML = '';
    ocean.orbitEffect = null;
    dimEl.classList.remove('on');
    endlessSurfaceBtn.hidden = true;
    ocean.setCameraDepthPx(0, 0.42);
    vignetteEl.style.opacity = '0.25';
    setPhase('done');

    const roundCount = session.results.length;
    const isEndless = session.mode === 'endless';
    const maxPossible = Math.max(100, roundCount * 100);
    const pct = computePercentile(session.totalScore, maxPossible);
    const avgPerRound = roundCount > 0 ? Math.round(session.totalScore / roundCount) : 0;

    const badgeText = session.mode === 'daily'
      ? `ПОГРУЖЕНИЕ #${session.diveNumber} ЗАВЕРШЕНО`
      : session.mode === 'archive'
        ? `АРХИВ #${session.diveNumber} ЗАВЕРШЁН`
        : `БЕСКОНЕЧНОЕ · ${roundCount} ${pluralRu(roundCount, 'ВОПРОС', 'ВОПРОСА', 'ВОПРОСОВ')}`;

    const avg = appState.stats.played > 0
      ? Math.round(appState.stats.totalScore / appState.stats.played)
      : session.totalScore;

    const brackets = getBearingBrackets(isEndless);
    const bearingValue = isEndless ? avgPerRound : session.totalScore;

    const bearingHtml = brackets.map((b) => {
      const active = bearingValue >= b.min && bearingValue <= b.max;
      const tierIcon = DATA.TIERS[b.tierId].sprite;
      return `
        <div class="ds-bearing-row${active ? ' active' : ''}" style="--tc: ${b.color};">
          <img class="ds-bearing-icon" src="${tierIcon}" alt="">
          <span class="ds-bearing-range">${b.range}</span>
          <span>${b.text}</span>
        </div>
      `;
    }).join('');

    const catchHtml = session.results.map((r, idx) => renderCatchRow(r, idx)).join('');
    const existingRating = appState.ratings[String(session.diveNumber)] || 0;
    const pctCaption = isEndless
      ? `ТЕМП ${avgPerRound} ОЧК/ВОПРОС · ЛУЧШЕ, ЧЕМ У ${pct}% НЫРЯЛЬЩИКОВ`
      : `ЛУЧШЕ, ЧЕМ У ${pct}% СЕГОДНЯШНИХ НЫРЯЛЬЩИКОВ`;

    doneInnerEl.innerHTML = `
      <div>
        <div class="ds-done-header">
          <span class="ds-done-krill">КРИЛЛИОН</span>
          <span class="ds-done-badge">${badgeText}</span>
        </div>

        <div class="ds-done-score-row">
          <span class="ds-done-bigscore tabular-nums">${session.totalScore}</span>
          <span class="ds-done-depth tabular-nums">-${session.totalDepthM.toLocaleString('ru-RU')}м</span>
        </div>

        <div class="ds-percentile-wrap">
          ${buildBellCurveSvg(session.totalScore, maxPossible)}
          <p class="ds-percentile-text">${pctCaption}</p>
        </div>
      </div>

      <div>
        <div class="ds-fathom-rule">
          <span>ЖУРНАЛ ПОГРУЖЕНИЯ</span>
          <span class="ds-fathom-sub">ГЛУБЖЕ = РЕЖЕ</span>
        </div>
        <div class="ds-divelog">
          ${buildDiveLogSvg(session.results)}
        </div>
      </div>

      <div>
        <div class="ds-fathom-rule">
          <span>ОРИЕНТИР</span>
          ${isEndless ? '<span class="ds-fathom-sub">В СРЕДНЕМ ЗА ВОПРОС</span>' : ''}
        </div>
        <div class="ds-bearing">${bearingHtml}</div>
      </div>

      <div class="ds-actions-stack">
        <button id="copy-result-btn" type="button" class="ds-action-btn btn-descend">СКОПИРОВАТЬ РЕЗУЛЬТАТ</button>
        <div class="ds-actions-sub">
          <button id="done-endless-btn" type="button" class="ds-action-btn">НЫРЯТЬ ДАЛЬШЕ ∞</button>
          <button id="done-archive-btn" type="button" class="ds-action-btn">АРХИВ ⟲</button>
        </div>
        ${session.mode !== 'daily' ? '<button id="done-replay-btn" type="button" class="ds-action-btn">СЫГРАТЬ ЗАНОВО</button>' : ''}
      </div>

      <div>
        <div class="ds-fathom-rule">
          <span>УЛОВ</span>
          <span class="ds-fathom-sub">НАЖМИТЕ ДЛЯ ВСЕХ ОТВЕТОВ</span>
        </div>
        <div id="catch-list" class="ds-catch-list">${catchHtml}</div>
      </div>

      <div class="ds-logbook">
        <div class="ds-logbook-stats">
          бортовой журнал · серия <b>${appState.stats.streak}</b> · игр <b>${appState.stats.played}</b> · среднее <b>${avg}</b> · рекорд <b>${Math.max(appState.stats.bestScore, session.totalScore)}</b> · следующее погружение через <b id="next-dive-countdown">--:--:--</b>
        </div>

        <div class="ds-rating-row">
          <span>как прошло погружение? (1 = так себе · 5 = огонь):</span>
          <div class="ds-rate-btns" role="radiogroup" aria-label="Оценка погружения">
            ${[1, 2, 3, 4, 5].map((n) => `
              <button type="button" class="ds-rate-btn" data-rate="${n}" aria-checked="${existingRating === n ? 'true' : 'false'}">${n}</button>
            `).join('')}
          </div>
        </div>

        <form id="suggest-form" class="ds-suggest-row">
          <input id="suggest-input" class="ds-suggest-input" type="text" placeholder="есть идея для вопроса? предложите…" maxlength="140">
          <button type="submit" class="ds-suggest-btn">отправить</button>
        </form>

        <div class="ds-footer-links">
          <button type="button" id="done-daily-link">ежедневное</button>
          <button type="button" id="done-settings-link">настройки</button>
          <button type="button" id="done-faq-link">частые вопросы</button>
          <a href="../">на главную сайта</a>
        </div>
      </div>
    `;

    wireDoneHandlers();
    startMidnightCountdown();
  }

  function renderCatchRow(result, idx) {
    const tier = DATA.TIERS[result.tier];
    const ansLabel = result.answer ? escapeHtml(result.answer) : 'Время вышло';
    const playerWord = pluralRu(result.players, 'игрок выбрал', 'игрока выбрали', 'игроков выбрали');
    const popLine = result.answer
      ? `<span>${result.players.toLocaleString('ru-RU')}</span> ${playerWord} это`
      : 'Ответ не был засчитан';

    return `
      <div class="ds-catch-item" data-round-idx="${idx}">
        <button type="button" class="ds-catch-btn" aria-expanded="false">
          <span class="ds-catch-idx">${idx + 1}</span>
          <img class="ds-catch-icon" src="${tier.sprite}" alt="">
          <div class="ds-catch-meta">
            <div class="ds-catch-prompt">${escapeHtml(result.promptText)}</div>
            <div class="ds-catch-ans">${ansLabel}</div>
            <div class="ds-catch-pop">${popLine}</div>
          </div>
          <span class="ds-catch-pts" style="color: ${tier.color};">${result.pts}</span>
          <span class="ds-catch-plus">+</span>
        </button>
        <div class="ds-catch-drawer" hidden></div>
      </div>
    `;
  }

  function renderCatchDrawerContent(drawerEl, promptId, userAnswer) {
    const prompt = DATA.PROMPTS.find((p) => p.id === promptId);
    if (!prompt) return;

    const sorted = prompt.answers.slice().sort((a, b) => DATA.TIERS[b.tier].pts - DATA.TIERS[a.tier].pts || a.players - b.players);
    const counts = { all: sorted.length };
    DATA.TIER_ORDER.forEach((t) => { counts[t] = 0; });
    sorted.forEach((a) => { counts[a.tier] = (counts[a.tier] || 0) + 1; });

    let activeFilter = 'all';
    let searchQuery = '';

    const filtersHtml = [
      `<button type="button" class="ds-filter-pill" data-filter="all" aria-pressed="true" style="color: var(--color-foam);">Все <span style="opacity:.7">${counts.all}</span></button>`,
      ...DATA.TIER_ORDER.map((tid) => {
        const t = DATA.TIERS[tid];
        return `<button type="button" class="ds-filter-pill" data-filter="${tid}" aria-pressed="false" style="color: ${t.color};">${t.short} <span style="opacity:.7">${counts[tid] || 0}</span></button>`;
      })
    ].join('');

    drawerEl.innerHTML = `
      <div class="ds-tier-filters" role="group" aria-label="Фильтр по редкости">${filtersHtml}</div>
      <input type="search" class="ds-catch-search" placeholder="Поиск по всем ответам…" aria-label="Поиск ответов">
      <ul class="ds-answer-ul"></ul>
    `;

    const ul = drawerEl.querySelector('.ds-answer-ul');
    const searchInput = drawerEl.querySelector('.ds-catch-search');
    const filterBtns = drawerEl.querySelectorAll('.ds-filter-pill');

    function redrawList() {
      const q = normalizeInput(searchQuery);
      const filtered = sorted.filter((a) => {
        if (activeFilter !== 'all' && a.tier !== activeFilter) return false;
        if (!q) return true;
        return normalizeInput(a.name).includes(q) || (a.aliases || []).some((al) => normalizeInput(al).includes(q));
      });

      if (!filtered.length) {
        ul.innerHTML = '<li class="ds-answer-li" style="color:var(--color-drift);">Ничего не найдено</li>';
        return;
      }

      ul.innerHTML = filtered.map((a) => {
        const t = DATA.TIERS[a.tier];
        const isMine = userAnswer && a.name === userAnswer;
        return `
          <li class="ds-answer-li${isMine ? ' mine' : ''}">
            <img src="${t.sprite}" alt="">
            <div class="ds-answer-main">
              <span>${escapeHtml(a.name)}</span>
              ${a.note ? `<span class="ds-answer-note">${escapeHtml(a.note)} · ${a.players.toLocaleString('ru-RU')} игр.</span>` : ''}
            </div>
            <span class="ds-answer-pts" style="color: ${t.color};">+${t.pts}</span>
          </li>
        `;
      }).join('');
    }

    filterBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.click();
        activeFilter = btn.dataset.filter;
        filterBtns.forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
        redrawList();
      });
    });

    searchInput.addEventListener('input', () => {
      searchQuery = searchInput.value;
      redrawList();
    });

    redrawList();
  }

  function wireDoneHandlers() {
    const copyBtn = document.getElementById('copy-result-btn');
    copyBtn.addEventListener('click', () => {
      sfx.click();
      const blocks = session.results.map((r) => DATA.TIERS[r.tier].emoji).join('');
      const header = session.mode === 'daily'
        ? `КРИЛЛИОН #${session.diveNumber}`
        : session.mode === 'archive'
          ? `КРИЛЛИОН (Архив #${session.diveNumber})`
          : `КРИЛЛИОН (Бесконечный · ${session.results.length} раунд.)`;
      let text = `${header}\n${session.totalScore} очков · -${session.totalDepthM.toLocaleString('ru-RU')}м\n${blocks}`;
      if (appState.settings.shareLink) {
        text += `\n${window.location.href.split('#')[0]}`;
      }
      navigator.clipboard?.writeText(text).catch(() => {});
      copyBtn.textContent = 'СКОПИРОВАНО ✓';
      copyBtn.classList.add('copied');
      setTimeout(() => {
        copyBtn.textContent = 'СКОПИРОВАТЬ РЕЗУЛЬТАТ';
        copyBtn.classList.remove('copied');
      }, 2200);
    });

    document.getElementById('done-endless-btn').addEventListener('click', () => {
      sfx.click();
      openMode('endless');
    });

    document.getElementById('done-archive-btn').addEventListener('click', () => {
      sfx.click();
      openModal('archive-backdrop');
    });

    const replayBtn = document.getElementById('done-replay-btn');
    if (replayBtn) {
      replayBtn.addEventListener('click', () => {
        sfx.click();
        openMode(session.mode, session.diveNumber);
        startNextRound();
      });
    }

    document.querySelectorAll('.ds-catch-item').forEach((item) => {
      const btn = item.querySelector('.ds-catch-btn');
      const drawer = item.querySelector('.ds-catch-drawer');
      const plus = item.querySelector('.ds-catch-plus');
      const idx = Number(item.dataset.roundIdx);
      const res = session.results[idx];

      btn.addEventListener('click', () => {
        sfx.click();
        const expanded = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!expanded));
        drawer.hidden = expanded;
        plus.textContent = expanded ? '+' : '−';
        if (!expanded && !drawer.dataset.populated) {
          drawer.dataset.populated = '1';
          renderCatchDrawerContent(drawer, res.promptId, res.answer);
        }
      });
    });

    document.querySelectorAll('.ds-rate-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.click();
        const val = Number(btn.dataset.rate);
        appState.ratings[String(session.diveNumber)] = val;
        saveState();
        document.querySelectorAll('.ds-rate-btn').forEach((b) => {
          b.setAttribute('aria-checked', String(Number(b.dataset.rate) === val));
        });
      });
    });

    const suggestForm = document.getElementById('suggest-form');
    const suggestInput = document.getElementById('suggest-input');
    suggestForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const val = suggestInput.value.trim();
      if (!val) return;
      sfx.suggest();
      appState.suggestions.push({ text: val, at: new Date().toISOString() });
      saveState();
      suggestInput.value = '';
      suggestInput.placeholder = 'спасибо! идея сохранена ✓';
    });

    document.getElementById('done-daily-link').addEventListener('click', () => {
      sfx.click();
      openMode('daily');
    });
    document.getElementById('done-settings-link').addEventListener('click', () => {
      sfx.click();
      openModal('settings-backdrop');
    });
    document.getElementById('done-faq-link').addEventListener('click', () => {
      sfx.click();
      openModal('faq-backdrop');
    });
  }

  let countdownInterval = null;
  function startMidnightCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    const update = () => {
      const el = document.getElementById('next-dive-countdown');
      if (!el) {
        clearInterval(countdownInterval);
        return;
      }
      const now = new Date();
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0);
      const sec = Math.max(0, Math.floor((next - now) / 1000));
      const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
      const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
      const ss = String(sec % 60).padStart(2, '0');
      el.textContent = `${hh}:${mm}:${ss}`;
    };
    update();
    countdownInterval = setInterval(update, 1000);
  }

  // ---------------- Modals (Menu, Settings, Wardrobe, Archive, FAQ) ----------------
  function openModal(id) {
    closeAllModals();
    if (id === 'wardrobe-backdrop') renderWardrobe();
    if (id === 'archive-backdrop') renderArchive();
    const el = document.getElementById(id);
    if (el) {
      el.hidden = false;
      el.classList.add('open');
    }
  }

  function closeAllModals() {
    document.querySelectorAll('.ds-modal-backdrop').forEach((el) => {
      el.classList.remove('open');
      el.hidden = true;
    });
  }

  function renderWardrobe() {
    const grid = document.getElementById('wardrobe-grid');
    const streak = appState.stats.bestStreak || 0;
    const unlockedAll = !!appState.settings.unlockAllBuddies;

    grid.innerHTML = DATA.BUDDIES.map((b) => {
      const unlocked = unlockedAll || streak >= b.streak;
      const active = appState.buddyId === b.id;
      const reqText = b.streak === 0 ? 'Открыт' : unlocked ? `Открыт (${b.streak} дн.)` : `Серия ${b.streak} дн.`;
      return `
        <button
          type="button"
          class="ds-buddy-card ds-px-sm${unlocked ? '' : ' locked'}"
          data-buddy="${b.id}"
          aria-pressed="${active ? 'true' : 'false'}"
          ${unlocked ? '' : 'disabled'}
        >
          <img src="${b.sprite}" alt="">
          <span class="ds-buddy-name">${b.name}</span>
          <span class="ds-buddy-req">${reqText}</span>
        </button>
      `;
    }).join('');

    grid.querySelectorAll('[data-buddy]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.mascot();
        appState.buddyId = btn.dataset.buddy;
        saveState();
        mascot.applyBuddy();
        renderWardrobe();
      });
    });
  }

  function renderArchive() {
    const grid = document.getElementById('archive-grid');
    const todayNum = DATA.getTodayDiveNumber();
    const minNum = Math.max(1, todayNum - 41);
    const items = [];
    for (let n = todayNum; n >= minNum; n--) {
      const saved = appState.completedDives[String(n)];
      const dateStr = DATA.getDiveDateLabel(n);
      items.push(`
        <button type="button" class="ds-archive-item${saved ? ' completed' : ''}" data-dive-num="${n}">
          <span class="ds-archive-num">#${n}${n === todayNum ? ' · сегодня' : ''}</span>
          <span class="ds-archive-date">${dateStr}</span>
          ${saved ? `<span class="ds-archive-score">${saved.score} очк · -${saved.depth}м</span>` : '<span class="ds-archive-date" style="color:var(--color-foam);">сыграть →</span>'}
        </button>
      `);
    }
    grid.innerHTML = items.join('');

    grid.querySelectorAll('[data-dive-num]').forEach((btn) => {
      btn.addEventListener('click', () => {
        sfx.click();
        const num = Number(btn.dataset.diveNum);
        closeAllModals();
        if (num === todayNum) {
          openMode('daily', num);
        } else {
          openMode('archive', num);
        }
      });
    });
  }

  // ---------------- Global Event Wiring ----------------
  beginBtn.addEventListener('click', startDiveOrShowResults);

  document.getElementById('intro-meta').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    sfx.click();
    const act = btn.dataset.action;
    if (act === 'archive') openModal('archive-backdrop');
    else if (act === 'endless') openMode('endless');
    else if (act === 'daily') openMode('daily');
  });

  menuBtn.addEventListener('click', () => {
    sfx.click();
    openModal('menu-backdrop');
  });

  settingsBtn.addEventListener('click', () => {
    sfx.click();
    openModal('settings-backdrop');
  });

  wardrobeBtn.addEventListener('click', () => {
    sfx.click();
    openModal('wardrobe-backdrop');
  });

  muteBtn.addEventListener('click', () => {
    appState.settings.muted = !appState.settings.muted;
    saveState();
    applySettingsToDom();
    if (!appState.settings.muted) sfx.click();
  });

  document.querySelectorAll('[data-close-modal]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sfx.click();
      closeAllModals();
    });
  });

  document.querySelectorAll('.ds-modal-backdrop').forEach((bd) => {
    bd.addEventListener('click', (e) => {
      if (e.target === bd) {
        closeAllModals();
      }
    });
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      sfx.click();
      const target = btn.dataset.nav;
      closeAllModals();
      if (target === 'daily') openMode('daily');
      else if (target === 'endless') openMode('endless');
      else if (target === 'menu') openModal('menu-backdrop');
      else if (target === 'archive') openModal('archive-backdrop');
      else if (target === 'wardrobe') openModal('wardrobe-backdrop');
      else if (target === 'settings') openModal('settings-backdrop');
      else if (target === 'faq') openModal('faq-backdrop');
    });
  });

  const settingBindings = [
    ['opt-lowpower', 'lowPower'],
    ['opt-colorblind', 'colorblind'],
    ['opt-corrections', 'answerCorrections'],
    ['opt-clear-rejected', 'clearRejected'],
    ['opt-share-link', 'shareLink'],
    ['opt-unlock-buddies', 'unlockAllBuddies']
  ];

  settingBindings.forEach(([id, key]) => {
    document.getElementById(id).addEventListener('change', (e) => {
      sfx.click();
      appState.settings[key] = e.target.checked;
      saveState();
      applySettingsToDom();
      if (key === 'unlockAllBuddies') renderWardrobe();
    });
  });

  window.addEventListener('resize', () => {
    ocean.resize();
    if (session.phase === 'intro') {
      ocean.setCameraDepthPx(0, 0.54);
    } else if (session.phase === 'done') {
      ocean.setCameraDepthPx(0, 0.42);
    } else {
      ocean.setCameraDepthPx(session.totalDepthM * PX_PER_METER, 0.38);
    }
  });

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ---------------- Boot ----------------
  initStaticDecor();
  applySettingsToDom();
  openMode('daily');

  function loop(ts) {
    ocean.render(ts);
    mascot.update(ts, session.phase);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
