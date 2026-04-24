const fs = require('fs');
const path = require('path');

const COUNTRY = 'OM';
const TZ_OFFSET = '+04:00';
const DATA_PATH = path.join(__dirname, '..', 'data', 'holidays.json');

const MONTHS_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
];

const NAME_MAP = [
  { match: /new year/i, ar: 'رأس السنة الميلادية', noteAr: 'إجازة رسمية حسب مصدر البيانات.', noteEn: 'Official holiday according to the data source.', status: 'confirmed' },
  { match: /national/i, ar: 'إجازة اليوم الوطني', noteAr: 'إجازة وطنية.', noteEn: 'National holiday.', status: 'confirmed' },
  { match: /eid.*adha|adha/i, ar: 'إجازة عيد الأضحى', noteAr: 'قابلة للتأكيد حسب الرؤية والإعلان الرسمي.', noteEn: 'Subject to official confirmation and moon sighting.', status: 'tentative' },
  { match: /eid.*fitr|fitr/i, ar: 'إجازة عيد الفطر', noteAr: 'قابلة للتأكيد حسب الرؤية والإعلان الرسمي.', noteEn: 'Subject to official confirmation and moon sighting.', status: 'tentative' },
  { match: /islamic.*new|hijri|muharram/i, ar: 'رأس السنة الهجرية', noteAr: 'قد تخضع للتأكيد الرسمي.', noteEn: 'May be subject to official confirmation.', status: 'tentative' },
  { match: /prophet|mawlid|moulid|birthday/i, ar: 'المولد النبوي الشريف', noteAr: 'قد تخضع للتأكيد الرسمي.', noteEn: 'May be subject to official confirmation.', status: 'tentative' }
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function getYearsToFetch() {
  const now = new Date();
  const year = now.getUTCFullYear();
  return [year, year + 1];
}

function formatArabicDate(dateString) {
  const d = new Date(`${dateString}T00:00:00${TZ_OFFSET}`);
  return `${d.getDate()} ${MONTHS_AR[d.getMonth()]} ${d.getFullYear()}`;
}

function formatEnglishDate(dateString) {
  const d = new Date(`${dateString}T00:00:00${TZ_OFFSET}`);
  return new Intl.DateTimeFormat('en-OM', {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Muscat'
  }).format(d);
}

function translateHoliday(name) {
  const found = NAME_MAP.find(item => item.match.test(name));
  return found || {
    ar: name,
    noteAr: 'إجازة واردة من مصدر البيانات الآلي. يرجى مراجعة الإعلان الرسمي عند الحاجة.',
    noteEn: 'Holiday from the automatic data source. Please verify against official announcements when needed.',
    status: 'confirmed'
  };
}

function normalizeHoliday(item) {
  const translated = translateHoliday(`${item.name} ${item.localName || ''}`);
  return {
    start: `${item.date}T00:00:00${TZ_OFFSET}`,
    end: `${item.date}T23:59:59${TZ_OFFSET}`,
    status: translated.status,
    ar: {
      name: translated.ar,
      date: formatArabicDate(item.date),
      note: translated.noteAr
    },
    en: {
      name: item.name || item.localName,
      date: formatEnglishDate(item.date),
      note: translated.noteEn
    }
  };
}

async function fetchYear(year) {
  const url = `https://date.nager.at/api/v3/PublicHolidays/${year}/${COUNTRY}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function main() {
  const years = getYearsToFetch();
  const all = [];

  for (const year of years) {
    try {
      const data = await fetchYear(year);
      all.push(...data.map(normalizeHoliday));
    } catch (error) {
      console.warn(error.message);
    }
  }

  if (!all.length) {
    throw new Error('No holidays were fetched. Existing data was not changed.');
  }

  const unique = Array.from(new Map(all.map(h => [`${h.start}-${h.en.name}`, h])).values())
    .sort((a, b) => new Date(a.start) - new Date(b.start));

  const payload = {
    country: COUNTRY,
    timezone: 'Asia/Muscat',
    lastUpdated: todayIso(),
    source: 'https://date.nager.at/api/v3/PublicHolidays/{year}/OM',
    note: 'Islamic holidays may be missing or tentative until officially announced, because moon-sighting holidays cannot always be calculated reliably in advance.',
    holidays: unique
  };

  fs.mkdirSync(path.dirname(DATA_PATH), { recursive: true });
  fs.writeFileSync(DATA_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  console.log(`Updated ${DATA_PATH} with ${unique.length} holidays for ${years.join(', ')}.`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
