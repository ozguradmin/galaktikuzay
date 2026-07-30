// Configuration constants
export const CONFIG = {
  // Schedule phases (posts per day)
  PHASES: [
    { week: 1, postsPerDay: 1, times: ['10:23'] },
    { week: 2, postsPerDay: 1, times: ['11:07'] },
    { week: 3, postsPerDay: 2, times: ['09:47', '15:38'] },
    { week: 4, postsPerDay: 2, times: ['10:12', '16:28'] },
    // Month 2+ 
    { week: 5, postsPerDay: 3, times: ['09:33', '13:41', '17:53'] },
  ],
  
  // Random time offset in minutes (±)
  TIME_JITTER_MINUTES: 30,

  // News search settings
  NEWS_SOURCES: [
    'space.com', 'spacenews.com', 'nasa.gov', 'esa.int',
    'universetoday.com', 'phys.org', 'sciencedaily.com'
  ],
  NEWS_SEARCH_DAYS: 2, // last 48 hours
  NEWS_QUERIES: [
    'space exploration NASA SpaceX discovery 2026',
    'astronomy new discovery planet star galaxy',
    'space mission satellite rocket launch',
    'ISS International Space Station astronaut',
    'Mars Moon lunar Artemis mission'
  ],

  // WordPress settings
  WP_CATEGORIES: {
    'Uzay': 128245,
    'Astronomi': 128243,
    'Teknoloji': 128350,
    'Keşifler': 128264,
  } as Record<string, number>,

  // Telegram commands
  TELEGRAM_COMMANDS: [
    { command: 'status', description: 'Sistem durumu' },
    { command: 'next', description: 'Sonraki yayın zamanı' },
    { command: 'pause', description: 'Otomasyonu duraklat' },
    { command: 'resume', description: 'Otomasyonu devam ettir' },
    { command: 'force', description: 'Hemen bir post yayınla' },
    { command: 'logs', description: 'Son 10 log kaydı' },
    { command: 'stats', description: 'İstatistikler' },
    { command: 'help', description: 'Komut listesi' },
  ],

  // Log retention
  LOG_RETENTION_DAYS: 7,
} as const;

// Category mapping keywords for auto-categorization
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'Astronomi': ['nebula', 'yıldız', 'galaksi', 'kara delik', 'güneş', 'meteor', 'kuyruklu', 'gezegen', 'bulutsu', 'teleskop', 'gözlem'],
  'Teknoloji': ['spacex', 'roket', 'uydu', 'fırlatma', 'motor', 'yakıt', 'starlink', 'teknoloji', 'mühendislik'],
  'Keşifler': ['keşif', 'discovery', 'bulunan', 'tespit', 'ilk kez', 'yeni', 'webb', 'hubble', 'yaşam'],
  'Uzay': ['nasa', 'esa', 'astronot', 'uzay istasyonu', 'iss', 'ay', 'mars', 'artemis', 'görev', 'mission'],
};
