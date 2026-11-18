(function () {
  function svgUri(svg) {
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg.trim());
  }

  function pxGrid(rects, w = 24, h = 24) {
    const body = rects
      .map(([x, y, rw, rh, fill]) => `<rect x="${x}" y="${y}" width="${rw}" height="${rh}" fill="${fill}"/>`)
      .join('');
    return svgUri(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges">${body}</svg>`);
  }

  const SPRITES = {
    // 24x24 Shaded Blue Bubble Cluster (Plankton)
    plankton: pxGrid([
      // Main top-left translucent ocean bubble
      [6, 3, 6, 1, '#5897c4'], [4, 4, 2, 1, '#5897c4'], [12, 4, 1, 2, '#5897c4'],
      [3, 5, 1, 5, '#3b739c'], [13, 6, 1, 4, '#5897c4'],
      [4, 10, 2, 2, '#2a5678'], [11, 10, 2, 2, '#3b739c'], [6, 12, 5, 1, '#2a5678'],
      [5, 4, 7, 7, '#214866'], [4, 5, 9, 5, '#2b5d82'],
      [6, 5, 4, 2, '#9ce0ff'], [5, 6, 2, 2, '#d8f4ff'], [6, 6, 1, 1, '#ffffff'],
      [10, 9, 2, 2, '#62b3de'],
      // Mid-right smaller bubble
      [15, 13, 4, 1, '#6ec4eb'], [14, 14, 1, 3, '#3b739c'], [19, 14, 1, 3, '#5897c4'],
      [15, 14, 4, 3, '#255073'], [15, 17, 4, 1, '#2a5678'],
      [16, 15, 1, 1, '#d8f4ff'], [18, 16, 1, 1, '#62b3de'],
      // Bottom center-left bubble
      [9, 17, 4, 1, '#6ec4eb'], [8, 18, 1, 2, '#3b739c'], [13, 18, 1, 2, '#5897c4'],
      [9, 18, 4, 2, '#214866'], [9, 20, 4, 1, '#2a5678'],
      [10, 18, 1, 1, '#d8f4ff']
    ]),
    // 24x24 Worm coiled on Brass Fishhook (Too Clever)
    tooclever: pxGrid([
      // Brass hook shaft & curve
      [11, 1, 2, 1, '#ffd166'], [10, 2, 1, 2, '#d97706'], [13, 2, 1, 2, '#ffd166'],
      [11, 4, 2, 1, '#d97706'],
      [11, 5, 2, 11, '#f59e0b'], [12, 5, 1, 10, '#ffd166'],
      [9, 16, 3, 2, '#d97706'], [7, 15, 3, 2, '#f59e0b'], [6, 12, 2, 4, '#ffd166'],
      [5, 10, 2, 2, '#ffd166'], [7, 11, 1, 1, '#d97706'],
      // Orange segmented bait worm
      [10, 8, 5, 2, '#ff8c24'], [11, 9, 4, 2, '#ff6b1a'], [14, 10, 3, 4, '#ff8c24'],
      [15, 11, 2, 3, '#e04e0b'], [13, 13, 3, 3, '#ff6b1a'], [10, 14, 4, 2, '#b83200'],
      [8, 14, 3, 2, '#ff8c24'], [13, 17, 2, 3, '#ff6b1a'], [10, 19, 4, 2, '#ff8c24'],
      [9, 18, 2, 2, '#e04e0b'],
      // Worm shine pixels
      [11, 8, 2, 1, '#ffb86b'], [15, 10, 1, 2, '#ffb86b'], [11, 19, 2, 1, '#ffb86b']
    ]),
    // 24x24 Shaded Neon Cyan Pixel Fish (Schooler)
    schooler: pxGrid([
      // Dorsal & ventral fins
      [10, 4, 4, 2, '#149bb8'], [11, 5, 3, 1, '#4de3ff'],
      [11, 17, 3, 2, '#0c7894'], [10, 16, 3, 1, '#149bb8'],
      // Main fusiform fish body
      [7, 6, 9, 2, '#1cbcd6'], [5, 8, 12, 2, '#4de3ff'],
      [3, 10, 15, 3, '#72eeff'], [4, 13, 13, 2, '#4de3ff'],
      [7, 15, 8, 2, '#149bb8'],
      // Belly & crest highlights
      [8, 8, 6, 2, '#aaf7ff'], [7, 13, 6, 1, '#25c9e0'],
      // Gill & tail peduncle
      [16, 10, 2, 3, '#149bb8'], [18, 9, 2, 5, '#0f8aa8'],
      [20, 7, 2, 3, '#1cbcd6'], [21, 6, 2, 2, '#4de3ff'],
      [20, 13, 2, 3, '#1cbcd6'], [21, 15, 2, 2, '#0c7894'],
      // Crisp bright eye & pupil
      [5, 9, 2, 2, '#e8f1ff'], [5, 10, 1, 1, '#050a14'],
      [10, 10, 1, 2, '#149bb8']
    ]),
    // 24x24 Shaded Scarlet Giant Squid (Rare)
    rare: pxGrid([
      // Fins + mantle arrow top
      [11, 2, 2, 2, '#ff7688'], [10, 4, 4, 2, '#ff384c'],
      [8, 6, 8, 2, '#e01e37'], [9, 8, 6, 6, '#ff384c'],
      [10, 6, 3, 7, '#ff6b7d'], [14, 8, 2, 5, '#9e0b22'],
      // Head & side eyes
      [9, 14, 6, 2, '#b80f28'], [8, 14, 2, 2, '#ffd166'], [14, 14, 2, 2, '#ffd166'],
      [9, 14, 1, 1, '#050a14'], [14, 14, 1, 1, '#050a14'],
      // Tentacles streaming down
      [7, 16, 2, 4, '#ff384c'], [6, 19, 2, 3, '#b80f28'],
      [10, 16, 1, 6, '#ff6b7d'], [11, 16, 1, 7, '#e01e37'],
      [13, 16, 1, 6, '#ff384c'], [15, 16, 2, 4, '#ff384c'],
      [16, 19, 2, 3, '#9e0b22']
    ]),
    // 24x24 Abyssal Anglerfish with Glowing Esca Lure (Deep Cut)
    deepcut: pxGrid([
      // Fishing rod stalk & glowing white/cyan lure
      [10, 3, 5, 1, '#4f6d99'], [8, 4, 2, 1, '#6889b8'], [6, 5, 2, 2, '#8faee0'],
      [14, 4, 2, 3, '#3c567d'],
      [4, 7, 3, 3, '#a8e6ff'], [5, 8, 2, 2, '#ffffff'],
      // Armored dark slate body
      [9, 7, 8, 3, '#263d5e'], [7, 10, 12, 6, '#1a2d47'], [9, 16, 8, 3, '#101d33'],
      [10, 8, 5, 2, '#3b5882'], [13, 5, 3, 2, '#3c567d'],
      // Pectoral & tail fins
      [19, 10, 3, 5, '#263d5e'], [21, 9, 2, 2, '#4f6d99'], [21, 14, 2, 2, '#16263d'],
      [14, 14, 3, 2, '#4f6d99'],
      // Piercing eye & toothy gaping maw
      [10, 10, 2, 2, '#7ceeff'], [10, 10, 1, 1, '#ffffff'],
      [7, 12, 5, 4, '#050a14'],
      [7, 12, 1, 2, '#e2e8f0'], [9, 12, 1, 2, '#e2e8f0'], [11, 12, 1, 1, '#e2e8f0'],
      [8, 15, 1, 2, '#e2e8f0'], [10, 15, 1, 2, '#e2e8f0']
    ]),
    // 24x24 Neon Coral-Pink Krill Shrimp (Krillion)
    krillion: pxGrid([
      // Long sweeping antennae
      [6, 3, 5, 1, '#ff7aa2'], [11, 2, 5, 1, '#ff5d8f'], [16, 3, 3, 1, '#ff9ebb'],
      [6, 5, 6, 1, '#ff4d82'], [12, 4, 5, 1, '#ff85ab'],
      // Head & arched segmented carapace
      [6, 7, 6, 3, '#ff4077'], [5, 9, 4, 3, '#ff2663'], [3, 10, 2, 1, '#ff85ab'],
      [11, 7, 5, 3, '#ff6b98'], [14, 9, 4, 4, '#ff4077'], [16, 12, 3, 4, '#d91c53'],
      [14, 15, 4, 3, '#ff5d8f'], [10, 17, 5, 2, '#ff4077'], [8, 17, 3, 2, '#ff85ab'],
      // Tail fan & spine highlights
      [12, 8, 3, 2, '#ffb3c9'], [15, 10, 2, 2, '#ff85ab'],
      [6, 16, 3, 2, '#ff85ab'], [5, 18, 3, 1, '#ffc2d4'],
      // Glowing eye & delicate pleopods
      [6, 8, 2, 2, '#fff0f5'], [6, 8, 1, 1, '#050a14'],
      [8, 12, 1, 2, '#ff85ab'], [10, 12, 1, 2, '#ff85ab'], [12, 12, 1, 2, '#ff85ab']
    ]),
    miss: pxGrid([
      [6, 6, 3, 3, '#5d739c'], [15, 6, 3, 3, '#5d739c'],
      [9, 9, 6, 6, '#3d4f6e'],
      [6, 15, 3, 3, '#5d739c'], [15, 15, 3, 3, '#5d739c']
    ]),
    // Albino / Red-Eyed Krill Buddy (Evil Krill)
    evilKrill: pxGrid([
      [6, 3, 5, 1, '#e2e8f0'], [11, 2, 6, 1, '#f8fafc'],
      [6, 5, 6, 1, '#cbd5e1'], [12, 4, 5, 1, '#e2e8f0'],
      [6, 7, 6, 3, '#f1f5f9'], [5, 9, 4, 3, '#cbd5e1'], [3, 10, 2, 1, '#ffffff'],
      [11, 7, 5, 3, '#f8fafc'], [14, 9, 4, 4, '#cbd5e1'], [16, 12, 3, 4, '#94a3b8'],
      [14, 15, 4, 3, '#e2e8f0'], [10, 17, 5, 2, '#cbd5e1'], [8, 17, 3, 2, '#f1f5f9'],
      [6, 16, 3, 2, '#f8fafc'], [5, 18, 3, 1, '#ffffff'],
      [6, 8, 2, 2, '#ff2644'], [6, 8, 1, 1, '#ff8093'],
      [8, 12, 1, 2, '#94a3b8'], [10, 12, 1, 2, '#94a3b8'], [12, 12, 1, 2, '#94a3b8']
    ]),
    // Iridescent Violet Pearl Crystal Krill (Hackmanite)
    hackmanite: pxGrid([
      [6, 3, 5, 1, '#d8b4fe'], [11, 2, 6, 1, '#f3e8ff'],
      [6, 5, 6, 1, '#c084fc'], [12, 4, 5, 1, '#e9d5ff'],
      [6, 7, 6, 3, '#c084fc'], [5, 9, 4, 3, '#9333ea'],
      [11, 7, 5, 3, '#e9d5ff'], [14, 9, 4, 4, '#a855f7'], [16, 12, 3, 4, '#7e22ce'],
      [14, 15, 4, 3, '#c084fc'], [10, 17, 5, 2, '#9333ea'], [8, 17, 3, 2, '#d8b4fe'],
      [6, 16, 3, 2, '#e9d5ff'], [6, 8, 2, 2, '#ffffff'], [6, 8, 1, 1, '#050a14'],
      [8, 12, 1, 2, '#d8b4fe'], [10, 12, 1, 2, '#d8b4fe'], [12, 12, 1, 2, '#d8b4fe']
    ]),
    // Skeletal Bone Fossil Krill (Fossil Krill)
    fossilKrill: pxGrid([
      [6, 3, 5, 1, '#d6ccb2'], [11, 2, 6, 1, '#e8e0cc'],
      [6, 5, 6, 1, '#b8ab8e'],
      [6, 7, 6, 3, '#e3dac3'], [5, 9, 4, 3, '#c4b697'],
      [11, 7, 4, 3, '#e8e0cc'], [15, 8, 1, 2, '#5c513e'], [16, 9, 2, 3, '#d6ccb2'],
      [17, 13, 2, 2, '#c4b697'], [14, 15, 3, 2, '#e3dac3'], [10, 17, 4, 2, '#c4b697'],
      [6, 16, 3, 2, '#e8e0cc'], [6, 8, 2, 2, '#1f1a14'],
      [8, 12, 1, 2, '#b8ab8e'], [10, 12, 1, 2, '#b8ab8e'], [12, 12, 1, 2, '#b8ab8e']
    ]),
    // Striped Tiger Mantis Shrimp
    mantis: pxGrid([
      [6, 3, 5, 1, '#ff7b3b'], [11, 2, 6, 1, '#ff9f43'],
      [6, 7, 5, 3, '#ff5f2e'], [11, 7, 3, 4, '#242b38'], [14, 8, 3, 4, '#ff7b3b'],
      [16, 11, 3, 3, '#242b38'], [15, 14, 3, 3, '#ff5f2e'], [11, 16, 4, 2, '#ff9f43'],
      [7, 11, 4, 4, '#14b8a6'], [8, 12, 3, 3, '#2dd4bf'],
      [6, 5, 2, 2, '#050a14'], [9, 5, 2, 2, '#050a14'],
      [6, 5, 1, 1, '#fef08a'], [9, 5, 1, 1, '#fef08a'],
      [6, 16, 3, 2, '#fef08a'], [9, 13, 1, 2, '#ff7b3b']
    ]),
    // Spiked Deep-Teal Leviathan Krill (Leviathan)
    leviathan: pxGrid([
      [6, 3, 5, 1, '#4dd0c8'], [11, 2, 6, 1, '#80e5de'],
      [6, 5, 6, 1, '#2a9d8f'], [13, 6, 1, 1, '#e8f1ff'], [16, 8, 1, 1, '#e8f1ff'],
      [6, 7, 6, 3, '#218380'], [5, 9, 4, 3, '#13575c'],
      [11, 7, 5, 3, '#2a9d8f'], [14, 9, 4, 4, '#218380'], [16, 12, 3, 4, '#0f444c'],
      [14, 15, 4, 3, '#2a9d8f'], [10, 17, 5, 2, '#218380'], [8, 17, 3, 2, '#4dd0c8'],
      [6, 16, 3, 2, '#80e5de'], [6, 8, 2, 2, '#ffd166'], [6, 8, 1, 1, '#050a14'],
      [8, 12, 1, 2, '#4dd0c8'], [10, 12, 1, 2, '#4dd0c8'], [12, 12, 1, 2, '#4dd0c8']
    ])
  };

  const TIERS = {
    plankton: {
      id: 'plankton',
      name: 'ПЛАНКТОН',
      short: 'Планктон',
      pts: 10,
      depth: 100,
      color: 'var(--tier-plankton)',
      hex: '#8fa3c4',
      emoji: '⬜',
      sprite: SPRITES.plankton,
      desc: 'Ответ, который первым приходит в голову каждому.'
    },
    tooclever: {
      id: 'tooclever',
      name: 'СЛИШКОМ УМНО',
      short: 'Слишком умно',
      pts: 15,
      depth: 150,
      color: 'var(--tier-tooclever)',
      hex: '#ff9f43',
      emoji: '🟧',
      sprite: SPRITES.tooclever,
      desc: 'Классический «редкий» вариант, который выбирают все хитрецы.'
    },
    schooler: {
      id: 'schooler',
      name: 'КОСЯК',
      short: 'Косяк',
      pts: 30,
      depth: 300,
      color: 'var(--tier-schooler)',
      hex: '#4de3ff',
      emoji: '🟦',
      sprite: SPRITES.schooler,
      desc: 'Уверенно — плывёте вместе со стаей.'
    },
    rare: {
      id: 'rare',
      name: 'РЕДКИЙ',
      short: 'Редкий',
      pts: 60,
      depth: 600,
      color: 'var(--tier-rare)',
      hex: '#ff5252',
      emoji: '🟥',
      sprite: SPRITES.rare,
      desc: 'Ниже термоклина. Отличная находка.'
    },
    deepcut: {
      id: 'deepcut',
      name: 'ГЛУБОКОВОДНЫЙ',
      short: 'Глубоководный',
      pts: 85,
      depth: 850,
      color: 'var(--tier-deepcut)',
      hex: '#9d7bff',
      emoji: '🟪',
      sprite: SPRITES.deepcut,
      desc: 'Серьёзная глубина. Сюда ныряют немногие.'
    },
    krillion: {
      id: 'krillion',
      name: 'ОДИН НА КРИЛЛИОН',
      short: 'Криллион',
      pts: 100,
      depth: 1000,
      color: 'var(--tier-krillion)',
      hex: '#ffd166',
      emoji: '🟨',
      sprite: SPRITES.krillion,
      desc: 'Жемчужина бездны. Попасть в такое — чудо.'
    },
    miss: {
      id: 'miss',
      name: 'ПРОМАХ',
      short: 'Промах',
      pts: 0,
      depth: 0,
      color: 'var(--tier-miss)',
      hex: '#3d4f6e',
      emoji: '⬛',
      sprite: SPRITES.miss,
      desc: 'Время вышло — глубина не изменилась.'
    }
  };

  const TIER_ORDER = ['krillion', 'deepcut', 'rare', 'schooler', 'tooclever', 'plankton'];

  const BUDDIES = [
    { id: 'krillion', name: 'Крилль', streak: 0, sprite: SPRITES.krillion, color: '#ff5d8f', gold: true },
    { id: 'schooler', name: 'Косяк', streak: 5, sprite: SPRITES.schooler, color: '#4de3ff' },
    { id: 'rare', name: 'Редкий кальмар', streak: 14, sprite: SPRITES.rare, color: '#ff5252' },
    { id: 'deepcut', name: 'Удильщик', streak: 30, sprite: SPRITES.deepcut, color: '#9d7bff' },
    { id: 'evil-krill', name: 'Злой крилль', streak: 45, sprite: SPRITES.evilKrill, color: '#ff5252' },
    { id: 'hackmanite', name: 'Хакманит', streak: 60, sprite: SPRITES.hackmanite, color: '#c77dff' },
    { id: 'fossil-krill', name: 'Ископаемый крилль', streak: 75, sprite: SPRITES.fossilKrill, color: '#dfd3a8' },
    { id: 'tiger-mantis', name: 'Рак-богомол', streak: 100, sprite: SPRITES.mantis, color: '#38d399' },
    { id: 'leviathan', name: 'Левиафан', streak: 150, sprite: SPRITES.leviathan, color: '#4dd0c8', gold: true }
  ];

  const AMBIENT_MARKERS = [
    { top: 111, side: 'L', text: 'свет начинает угасать' },
    { top: 391, side: 'R', text: 'сюда почти не доходит солнце' },
    { top: 655, side: 'R', text: 'рекорд погружения с аквалангом — 332 м' },
    { top: 761, side: 'L', text: 'ниже охотятся кашалоты' },
    { top: 1061, side: 'R', text: 'досюда ныряют императорские пингвины' },
    { top: 1311, side: 'L', text: 'давление: в 67 раз выше поверхностного' },
    { top: 1591, side: 'R', text: 'зона дрейфа сифонофор' },
    { top: 2071, side: 'L', major: true, text: 'ПОЛУНОЧНАЯ ЗОНА' },
    { top: 2471, side: 'R', text: 'территория глубоководных удильщиков' },
    { top: 3091, side: 'L', text: 'здесь кашалоты сражаются с гигантскими кальмарами' },
    { top: 3691, side: 'R', text: 'владения гигантского кальмара' },
    { top: 4291, side: 'L', text: 'глаза колоссального кальмара — с футбольный мяч' },
    { top: 4991, side: 'R', text: 'вода +2°C и кромешная тьма' },
    { top: 5991, side: 'L', major: true, text: 'АБИССАЛЬНАЯ ЗОНА' },
    { top: 7591, side: 'R', text: 'здесь покоится «Титаник» — 3 800 м' },
    { top: 8791, side: 'L', text: 'ошибни патрулируют равнину' },
    { top: 9791, side: 'R', text: 'простирается абиссальная равнина' },
    { top: 10991, side: 'L', text: 'глубже, чем выдерживают подлодки' },
    { top: 11991, side: 'R', major: true, text: 'ХАДАЛЬНАЯ ЗОНА (ЖЕЛОБ)' },
    { top: 12991, side: 'L', text: 'названа в честь Аида. заслуженно.' },
    { top: 13991, side: 'R', major: true, text: 'дно впадины — здесь заканчивается идеальное погружение' }
  ];

  const TIER_CODES = {
    p: 'plankton',
    t: 'tooclever',
    s: 'schooler',
    r: 'rare',
    d: 'deepcut',
    k: 'krillion'
  };

  function buildAnswers(raw) {
    return raw.map((item) => {
      const [name, tierCode, players, aliases, note] = item;
      return {
        name,
        tier: TIER_CODES[tierCode] || tierCode,
        players,
        aliases: aliases || [],
        note: note || ''
      };
    });
  }

  const PROMPTS = [
  {
    "id": "talking-animal-movie",
    "text": "Назови фильм или мультфильм, где главный герой — говорящее животное",
    "count": 206,
    "strictShape": false
  },
  {
    "id": "food-ends-o",
    "text": "Назови еду или напиток из одного слова, заканчивающееся на букву О",
    "count": 233,
    "strictShape": true
  },
  {
    "id": "animal-8plus",
    "text": "Назови животное из одного слова, в названии которого 8 или более букв",
    "count": 737,
    "strictShape": true
  },
  {
    "id": "cities-suffix",
    "text": "Назови город мира, заканчивающийся на -бург (-берг), -виль (-вилл), -дорф или -штадт",
    "count": 316,
    "strictShape": true
  },
  {
    "id": "white-inside",
    "text": "Назови фрукт или овощ, который белый внутри",
    "count": 124,
    "strictShape": false
  },
  {
    "id": "europe-country",
    "text": "Назови страну Европы",
    "count": 62,
    "strictShape": false
  },
  {
    "id": "chemical-element",
    "text": "Назови химический элемент таблицы Менделеева",
    "count": 118,
    "strictShape": false
  },
  {
    "id": "open-world-game",
    "text": "Назови видеоигру с открытым миром",
    "count": 547,
    "strictShape": false
  },
  {
    "id": "musical-instrument",
    "text": "Назови музыкальный инструмент",
    "count": 474,
    "strictShape": false
  },
  {
    "id": "space-object",
    "text": "Назови космический объект (планету, спутник, звезду или созвездие)",
    "count": 451,
    "strictShape": false
  },
  {
    "id": "cheese-type",
    "text": "Назови сорт или вид сыра",
    "count": 313,
    "strictShape": false
  },
  {
    "id": "russian-literature",
    "text": "Назови произведение русской классической литературы",
    "count": 712,
    "strictShape": false
  },
  {
    "id": "kitchen-item",
    "text": "Назови предмет на кухне из одного слова",
    "count": 325,
    "strictShape": false
  },
  {
    "id": "dog-breed",
    "text": "Назови породу собаки",
    "count": 435,
    "strictShape": false
  },
  {
    "id": "sea-or-ocean",
    "text": "Назови море или океан",
    "count": 162,
    "strictShape": false
  },
  {
    "id": "programming-lang",
    "text": "Назови язык программирования",
    "count": 507,
    "strictShape": false
  },
  {
    "id": "board-game",
    "text": "Назови настольную или карточную игру",
    "count": 277,
    "strictShape": false
  },
  {
    "id": "car-brand",
    "text": "Назови марку автомобиля",
    "count": 502,
    "strictShape": false
  },
  {
    "id": "bird-name",
    "text": "Назови птицу",
    "count": 348,
    "strictShape": false
  },
  {
    "id": "tree-shrub",
    "text": "Назови дерево или кустарник",
    "count": 466,
    "strictShape": false
  },
  {
    "id": "gemstone",
    "text": "Назови драгоценный или поделочный камень",
    "count": 493,
    "strictShape": false
  },
  {
    "id": "pasta-shape",
    "text": "Назови вид пасты (макаронных изделий)",
    "count": 169,
    "strictShape": false
  },
  {
    "id": "mythology-greek-norse",
    "text": "Назови древнегреческого или скандинавского бога / мифическое существо",
    "count": 370,
    "strictShape": false
  },
  {
    "id": "profession-oneword",
    "text": "Назови профессию из одного слова",
    "count": 1101,
    "strictShape": false
  },
  {
    "id": "color-shade",
    "text": "Назови цвет или оттенок",
    "count": 251,
    "strictShape": false
  },
  {
    "id": "comic-hero-villain",
    "text": "Назови супергероя или суперзлодея из комиксов",
    "count": 583,
    "strictShape": false
  },
  {
    "id": "moba-hero-shooter",
    "text": "Назови персонажа игры Dota 2, League of Legends, Valorant или Overwatch",
    "count": 433,
    "strictShape": false
  },
  {
    "id": "vowel-country",
    "text": "Назови страну, название которой начинается на гласную букву",
    "count": 59,
    "strictShape": true
  },
  {
    "id": "russia-city-million",
    "text": "Назови крупный город России (кроме Москвы и Санкт-Петербурга)",
    "count": 202,
    "strictShape": false
  },
  {
    "id": "world-capital",
    "text": "Назови столицу любого государства мира",
    "count": 209,
    "strictShape": false
  },
  {
    "id": "island-world",
    "text": "Назови остров или архипелаг в любой точке мира",
    "count": 686,
    "strictShape": false
  },
  {
    "id": "world-river",
    "text": "Назови реку в России или мире",
    "count": 656,
    "strictShape": false
  },
  {
    "id": "mountain-range",
    "text": "Назови гору, вулкан или горный хребет",
    "count": 867,
    "strictShape": false
  },
  {
    "id": "moscow-spb-metro",
    "text": "Назови станцию метро Москвы или Санкт-Петербурга",
    "count": 286,
    "strictShape": false
  },
  {
    "id": "berry-fruit",
    "text": "Назови ягоду (настоящую или ту, что все считают ягодой)",
    "count": 203,
    "strictShape": false
  },
  {
    "id": "mushroom-name",
    "text": "Назови съедобный или ядовитый гриб",
    "count": 518,
    "strictShape": false
  },
  {
    "id": "flower-plant",
    "text": "Назови цветок (садовый, полевой или комнатный)",
    "count": 465,
    "strictShape": false
  },
  {
    "id": "sea-creature",
    "text": "Назови морского обитателя (кроме кита и акулы)",
    "count": 708,
    "strictShape": false
  },
  {
    "id": "dinosaur-prehistoric",
    "text": "Назови динозавра или доисторическое животное",
    "count": 780,
    "strictShape": false
  },
  {
    "id": "spice-herb",
    "text": "Назови специю, пряность или приправу",
    "count": 392,
    "strictShape": false
  },
  {
    "id": "soup-dish",
    "text": "Назови суп или первое блюдо любой кухни мира",
    "count": 261,
    "strictShape": false
  },
  {
    "id": "dessert-sweet",
    "text": "Назови десерт или сладость",
    "count": 343,
    "strictShape": false
  },
  {
    "id": "sauce-condiment",
    "text": "Назови соус или заправку к блюду",
    "count": 227,
    "strictShape": false
  },
  {
    "id": "cocktail-drink",
    "text": "Назови коктейль или популярный напиток из кофейни / бара",
    "count": 383,
    "strictShape": false
  },
  {
    "id": "cat-breed",
    "text": "Назови породу кошки",
    "count": 140,
    "strictShape": false
  },
  {
    "id": "insect-bug",
    "text": "Назови насекомое или паукообразное",
    "count": 561,
    "strictShape": false
  },
  {
    "id": "scientist-inventor",
    "text": "Назови известного учёного или изобретателя",
    "count": 489,
    "strictShape": false
  },
  {
    "id": "historical-ruler",
    "text": "Назови исторического правителя, царя или полководца",
    "count": 1145,
    "strictShape": false
  },
  {
    "id": "currency-world",
    "text": "Назови валюту любой страны мира (современную или историческую)",
    "count": 124,
    "strictShape": false
  },
  {
    "id": "physical-unit",
    "text": "Назови физическую величину или единицу измерения",
    "count": 639,
    "strictShape": false
  },
  {
    "id": "body-organ-bone",
    "text": "Назови орган, кость или мышцу человека",
    "count": 621,
    "strictShape": false
  },
  {
    "id": "weather-phenomenon",
    "text": "Назови погодное или атмосферное явление",
    "count": 272,
    "strictShape": false
  },
  {
    "id": "building-landmark",
    "text": "Назови известное здание, памятник или чудо света",
    "count": 857,
    "strictShape": false
  },
  {
    "id": "fabric-material",
    "text": "Назови ткань или материал для одежды",
    "count": 292,
    "strictShape": false
  },
  {
    "id": "dance-style",
    "text": "Назови танец или танцевальное направление",
    "count": 290,
    "strictShape": false
  },
  {
    "id": "sport-no-ball",
    "text": "Назови вид спорта, в котором НЕ используется мяч или шайба",
    "count": 866,
    "strictShape": false
  },
  {
    "id": "martial-art",
    "text": "Назови боевое искусство или вид единоборств",
    "count": 280,
    "strictShape": false
  },
  {
    "id": "greek-letter-symbol",
    "text": "Назови букву греческого алфавита или математический термин",
    "count": 699,
    "strictShape": false
  },
  {
    "id": "snake-reptile",
    "text": "Назови змею, ящерицу, черепаху или амфибию",
    "count": 573,
    "strictShape": false
  },
  {
    "id": "anime-title",
    "text": "Назови аниме-сериал или полнометражное аниме",
    "count": 1664,
    "strictShape": false
  },
  {
    "id": "anime-character",
    "text": "Назови персонажа из аниме",
    "count": 2251,
    "strictShape": false
  },
  {
    "id": "pixar-disney-char",
    "text": "Назови персонажа мультфильма Disney, Pixar или DreamWorks",
    "count": 156,
    "strictShape": false
  },
  {
    "id": "harry-potter",
    "text": "Назови персонажа, заклинание или место из «Гарри Поттера»",
    "count": 598,
    "strictShape": false
  },
  {
    "id": "lord-of-rings",
    "text": "Назови персонажа, место или расу из «Властелина колец» и «Хоббита»",
    "count": 285,
    "strictShape": false
  },
  {
    "id": "star-wars",
    "text": "Назови персонажа, планету или корабль из «Звёздных войн»",
    "count": 238,
    "strictShape": false
  },
  {
    "id": "sci-fi-fantasy-movie",
    "text": "Назови культовый фантастический или киберпанк-фильм",
    "count": 773,
    "strictShape": false
  },
  {
    "id": "horror-movie",
    "text": "Назови фильм ужасов или мистический триллер",
    "count": 609,
    "strictShape": false
  },
  {
    "id": "tv-series-hit",
    "text": "Назови популярный сериал (зарубежный или российский)",
    "count": 536,
    "strictShape": false
  },
  {
    "id": "indie-game",
    "text": "Назови инди-игру или пиксельный/рогалик-хит",
    "count": 1308,
    "strictShape": false
  },
  {
    "id": "retro-console-game",
    "text": "Назови культовую игру до 2010 года (Dendy, Sega, PS1/PS2 или старый ПК)",
    "count": 1164,
    "strictShape": false
  },
  {
    "id": "minecraft-mob-item",
    "text": "Назови моба, биом, блок или предмет из Minecraft",
    "count": 1841,
    "strictShape": false
  },
  {
    "id": "pokemon-creature",
    "text": "Назови покемона",
    "count": 1075,
    "strictShape": false
  },
  {
    "id": "music-genre",
    "text": "Назови музыкальный жанр или поджанр",
    "count": 724,
    "strictShape": false
  },
  {
    "id": "rock-pop-band",
    "text": "Назови музыкальную группу или культового исполнителя",
    "count": 1107,
    "strictShape": false
  },
  {
    "id": "soviet-cartoon",
    "text": "Назови советский или российский мультфильм",
    "count": 717,
    "strictShape": false
  },
  {
    "id": "soviet-comedy",
    "text": "Назови культовый советский или российский фильм",
    "count": 584,
    "strictShape": false
  },
  {
    "id": "fairy-tale-folk",
    "text": "Назови сказку или фольклорного персонажа",
    "count": 500,
    "strictShape": false
  },
  {
    "id": "tech-brand",
    "text": "Назови бренд электроники, смартфонов, ПК-железа или техники",
    "count": 311,
    "strictShape": false
  },
  {
    "id": "social-app-site",
    "text": "Назови известный сайт, соцсеть, мессенджер или приложение",
    "count": 508,
    "strictShape": false
  },
  {
    "id": "clothing-item",
    "text": "Назови предмет одежды, обуви или головной убор из одного слова",
    "count": 876,
    "strictShape": false
  },
  {
    "id": "school-subject",
    "text": "Назови школьный предмет или университетскую дисциплину",
    "count": 538,
    "strictShape": false
  },
  {
    "id": "phobia-fear",
    "text": "Назови человеческий страх или фобию",
    "count": 197,
    "strictShape": false
  },
  {
    "id": "holiday-tradition",
    "text": "Назови праздник в России или мире",
    "count": 275,
    "strictShape": false
  },
  {
    "id": "tool-hardware",
    "text": "Назови строительный или слесарный инструмент из одного слова",
    "count": 637,
    "strictShape": false
  },
  {
    "id": "rare-letter-start",
    "text": "Назови существительное, начинающееся на букву Й, Ф, Щ, Э или Ю",
    "count": 2326,
    "strictShape": true
  },
  {
    "id": "word-double-letter",
    "text": "Назови слово с удвоенной согласной внутри (например: класс, ванна, теннис)",
    "count": 1900,
    "strictShape": true
  },
  {
    "id": "word-4-letters",
    "text": "Назови существительное ровно из 4 букв",
    "count": 1141,
    "strictShape": true
  },
  {
    "id": "one-syllable-noun",
    "text": "Назови существительное из одного слога (только одна гласная буква)",
    "count": 1113,
    "strictShape": true
  },
  {
    "id": "hotel-forgotten",
    "text": "Назови вещь, которую люди чаще всего забывают в отеле, поезде или самолёте",
    "count": 114,
    "strictShape": false
  },
  {
    "id": "childhood-toy-game",
    "text": "Назови детскую игрушку или дворовую игру",
    "count": 96,
    "strictShape": false
  }
].map((p) => Object.assign(p, { answers: null }));

  const pendingLoads = Object.create(null);

  async function loadPromptAnswers(promptId) {
    const prompt = PROMPTS.find((p) => p.id === promptId);
    if (!prompt) return [];
    if (Array.isArray(prompt.answers)) return prompt.answers;
    if (pendingLoads[promptId]) return pendingLoads[promptId];

    pendingLoads[promptId] = fetch(`./db/${encodeURIComponent(promptId)}.json?v=20261118i`)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status} for ${promptId}`);
        return res.json();
      })
      .then((raw) => {
        const built = buildAnswers(raw);
        prompt.answers = built;
        prompt.count = built.length;
        delete prompt._index;
        delete pendingLoads[promptId];
        return built;
      })
      .catch((err) => {
        console.error('[krillion] Failed loading chunk:', promptId, err);
        delete pendingLoads[promptId];
        prompt.answers = prompt.answers || [];
        return prompt.answers;
      });
    return pendingLoads[promptId];
  }

  function preloadPrompts(promptList) {
    if (!Array.isArray(promptList)) return;
    promptList.forEach((item) => {
      const id = typeof item === 'string' ? item : (item && item.id);
      if (id) loadPromptAnswers(id);
    });
  }

  const EPOCH_UTC = Date.UTC(2026, 6, 16);

  function getTodayDiveNumber() {
    const now = new Date();
    const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((todayUtc - EPOCH_UTC) / 86400000);
    return Math.max(1, diffDays + 1);
  }

  function getDiveDateLabel(diveNumber) {
    const d = new Date(2026, 6, 16 + (diveNumber - 1));
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function seededRandom(seed) {
    let s = (seed * 1664525 + 1013904223) >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  function shuffleWithSeed(arr, seed) {
    const rng = seededRandom(seed);
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }

  function getDailyPrompts(diveNumber) {
    // Non-repeating deck per epoch cycle of floor(PROMPTS.length / 7) days
    const deckSize = Math.floor(PROMPTS.length / 7);
    const epoch = Math.floor((diveNumber - 1) / deckSize);
    const dayInEpoch = (diveNumber - 1) % deckSize;
    const shuffledDeck = shuffleWithSeed(PROMPTS, epoch * 7919 + 424242);
    return shuffledDeck.slice(dayInEpoch * 7, dayInEpoch * 7 + 7);
  }

  window.KRILLION_DATA = {
    TIERS,
    TIER_ORDER,
    BUDDIES,
    AMBIENT_MARKERS,
    PROMPTS,
    loadPromptAnswers,
    preloadPrompts,
    getTodayDiveNumber,
    getDiveDateLabel,
    getDailyPrompts
  };
})();
