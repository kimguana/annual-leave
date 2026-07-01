// 로컬 연차 관리 서버: 정적 파일 서빙 + data.json 읽기/쓰기.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const Holidays = require('./public/holidays.js'); // 오프라인 폴백용 내장 공휴일 표

const PORT = 4173;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data.json');
const HOLIDAY_CACHE_FILE = path.join(ROOT, 'holiday-cache.json');

// 개발 모드 여부(`npm run dev` = `node --watch server.js --dev`).
// 개발 모드에서만 index.html에 라이브 리로드 스크립트를 주입한다.
const DEV = process.argv.includes('--dev');

const DEFAULT_DATA = { employees: [], usages: [], settings: { baseFiscalYear: 2026 } };

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

// data.json을 읽어 반환(없으면 기본 구조).
function readData() {
  try {
    return fs.readFileSync(DATA_FILE, 'utf-8');
  } catch (e) {
    return JSON.stringify(DEFAULT_DATA, null, 2);
  }
}

// 정적 파일 응답(경로 이탈 차단).
function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') {
    urlPath = '/index.html';
  }
  const filePath = path.join(PUBLIC_DIR, urlPath);
  // 경로 이탈 차단: public 디렉터리 내부(또는 public 자신)만 허용.
  // 형제 디렉터리(예: public_extra) 우회를 막기 위해 구분자까지 포함해 비교한다.
  if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    res.end('forbidden');
    return;
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    const ext = path.extname(filePath);
    // 개발 모드에서 index.html에 라이브 리로드 스크립트를 동적 주입한다.
    if (DEV && ext === '.html') {
      const html = content.toString('utf-8').replace(
        '</body>',
        '  <script src="/livereload.js"></script>\n</body>'
      );
      res.writeHead(200, { 'Content-Type': MIME['.html'] });
      res.end(html);
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

// 개발자 라이브 리로드용: public/ 내 파일들의 최신 수정시각(ms)을 반환한다.
function publicVersion() {
  let latest = 0;
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else {
        latest = Math.max(latest, st.mtimeMs);
      }
    }
  };
  try {
    walk(PUBLIC_DIR);
  } catch (e) {
    // 디렉터리 접근 실패는 무시(0 반환)
  }
  return latest;
}

// 공휴일 캐시(연도별). 서버 시작 시 파일에서 로드.
let holidayCache = {};
try {
  holidayCache = JSON.parse(fs.readFileSync(HOLIDAY_CACHE_FILE, 'utf-8'));
} catch (e) {
  holidayCache = {};
}

// Nager.Date 공개 API에서 한국 공휴일을 가져온다(키 불필요).
async function fetchHolidays(year) {
  const url = 'https://date.nager.at/api/v3/PublicHolidays/' + year + '/KR';
  const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) {
    throw new Error('status ' + res.status);
  }
  const arr = await res.json();
  const map = {};
  for (const h of arr) {
    map[h.date] = h.localName || h.name;
  }
  return map;
}

// 해당 연도 공휴일 반환: 캐시 → 공개 API(내장 표와 병합) → 실패 시 내장 표.
async function getHolidays(year) {
  if (holidayCache[year]) {
    return holidayCache[year];
  }
  try {
    const api = await fetchHolidays(year);
    // 내장 표를 기본으로 두고 공개 API 값으로 덮어씀(대체공휴일 등 상호 보완).
    const map = Object.assign({}, Holidays.get(year), api);
    // Nager는 대체일을 원 공휴일명(예: '3·1절')으로 주므로 다시 '대체공휴일'로 통일.
    Holidays.relabelSubstitutes(map, year);
    holidayCache[year] = map;
    try {
      fs.writeFileSync(HOLIDAY_CACHE_FILE, JSON.stringify(holidayCache, null, 2), 'utf-8');
    } catch (e) {
      // 캐시 저장 실패는 무시
    }
    return map;
  } catch (e) {
    return Holidays.get(year); // 오프라인/실패 시 내장 표로 폴백
  }
}

const server = http.createServer((req, res) => {
  if (req.url === '/api/version' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': MIME['.json'] });
    res.end(JSON.stringify({ v: publicVersion() }));
    return;
  }
  if (req.url.startsWith('/api/holidays') && req.method === 'GET') {
    const year = parseInt(new URL(req.url, 'http://localhost').searchParams.get('year'), 10)
      || new Date().getFullYear();
    getHolidays(year).then((map) => {
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      res.end(JSON.stringify(map));
    }).catch(() => {
      res.writeHead(200, { 'Content-Type': MIME['.json'] });
      res.end(JSON.stringify(Holidays.get(year)));
    });
    return;
  }
  if (req.url === '/api/data' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': MIME['.json'] });
    res.end(readData());
    return;
  }
  if (req.url === '/api/data' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body); // 유효성 확인
        fs.writeFileSync(DATA_FILE, JSON.stringify(parsed, null, 2), 'utf-8');
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        res.end('{"ok":true}');
      } catch (e) {
        res.writeHead(400);
        res.end('{"ok":false,"error":"invalid json"}');
      }
    });
    return;
  }
  serveStatic(req, res);
});

server.listen(PORT, () => {
  const url = 'http://localhost:' + PORT;
  console.log('연차 관리 서버 실행 중: ' + url);
  // 윈도우 기본 브라우저 자동 오픈
  exec('start "" "' + url + '"');
});
