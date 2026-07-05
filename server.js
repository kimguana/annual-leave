// 로컬 연차 관리 서버: 정적 파일 서빙 + data.json 읽기/쓰기.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const zlib = require('zlib');
const LeaveLogic = require('./public/leave-logic.js');
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

function excelCellText(cell) {
  try {
    return String(cell.text || '').trim();
  } catch (e) {
    const v = cell.value;
    if (v === null || v === undefined) {
      return '';
    }
    if (v instanceof Date) {
      return LeaveLogic.todayStr(v);
    }
    if (typeof v === 'object' && v.result !== undefined) {
      return String(v.result).trim();
    }
    return String(v).trim();
  }
}

function excelCellDate(cell) {
  const v = cell.value;
  return v instanceof Date ? LeaveLogic.todayStr(v) : null;
}

function usageDaysFromExcelCell(cell) {
  const v = cell.value;
  let n = null;
  if (typeof v === 'number') {
    n = v;
  } else if (v && typeof v === 'object' && typeof v.result === 'number') {
    n = v.result;
  } else {
    const text = excelCellText(cell);
    if (/^\d+(\.\d+)?$/.test(text)) {
      n = parseFloat(text);
    } else if (text.includes('반반차')) {
      n = 0.25;
    } else if (text.includes('반차')) {
      n = 0.5;
    } else if (text.includes('연차') || text.includes('병가')) {
      n = 1;
    }
  }
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  return Math.round(n * 100) / 100;
}

async function parseUsageWorkbook(buffer, year, asOfMonth) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const yy = String(year).slice(-2);
  const ws = wb.getWorksheet(`20 (${yy}).`);
  if (!ws) {
    throw new Error(`20 (${yy}). sheet not found`);
  }

  const dateCols = [];
  ws.getRow(5).eachCell((cell, col) => {
    const date = excelCellDate(cell);
    if (date && date.startsWith(year + '-')) {
      dateCols.push({ col, date });
    }
  });

  const records = [];
  let rowNum = 1;
  while (rowNum <= ws.rowCount) {
    const employeeName = excelCellText(ws.getRow(rowNum).getCell(5));
    const joinDate = LeaveLogic.parseImportDate(ws.getRow(rowNum + 1).getCell(5).value);
    const usageLabel = excelCellText(ws.getRow(rowNum + 2).getCell(5));
    if (!employeeName || !joinDate || usageLabel !== '사용') {
      rowNum += 1;
      continue;
    }

    dateCols.forEach(({ col, date }) => {
      const cell = ws.getRow(rowNum + 2).getCell(col);
      const days = usageDaysFromExcelCell(cell);
      if (!days) {
        return;
      }
      const noteText = excelCellText(cell);
      records.push({
        employeeName,
        date,
        days,
        note: noteText && !/^\d+(\.\d+)?$/.test(noteText) ? noteText : '',
      });
    });
    rowNum += 4;
  }
  return { records };
}

function xmlDecode(s) {
  return String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function xmlAttr(attrs, name) {
  const m = attrs.match(new RegExp('(?:^|\\s)' + name + '="([^"]*)"'));
  return m ? xmlDecode(m[1]) : '';
}

function colNameToNumber(name) {
  let n = 0;
  for (const ch of name) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

function excelSerialToDate(serial) {
  const days = Math.floor(Number(serial));
  if (!Number.isFinite(days)) {
    return null;
  }
  return LeaveLogic.todayStr(new Date(Date.UTC(1899, 11, 30) + days * 86400000));
}

function zipEntries(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error('invalid xlsx zip');
  }
  const count = buffer.readUInt16LE(eocd + 10);
  let ptr = buffer.readUInt32LE(eocd + 16);
  const entries = {};
  for (let i = 0; i < count; i += 1) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) {
      throw new Error('invalid xlsx central directory');
    }
    const method = buffer.readUInt16LE(ptr + 10);
    const compressedSize = buffer.readUInt32LE(ptr + 20);
    const nameLen = buffer.readUInt16LE(ptr + 28);
    const extraLen = buffer.readUInt16LE(ptr + 30);
    const commentLen = buffer.readUInt16LE(ptr + 32);
    const localOffset = buffer.readUInt32LE(ptr + 42);
    const name = buffer.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    entries[name] = { method, compressedSize, localOffset };
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return {
    read(name) {
      const entry = entries[name];
      if (!entry) {
        return null;
      }
      const local = entry.localOffset;
      if (buffer.readUInt32LE(local) !== 0x04034b50) {
        throw new Error('invalid xlsx local file header');
      }
      const nameLen = buffer.readUInt16LE(local + 26);
      const extraLen = buffer.readUInt16LE(local + 28);
      const start = local + 30 + nameLen + extraLen;
      const compressed = buffer.subarray(start, start + entry.compressedSize);
      if (entry.method === 0) {
        return compressed;
      }
      if (entry.method === 8) {
        return zlib.inflateRawSync(compressed);
      }
      throw new Error('unsupported xlsx compression method ' + entry.method);
    },
  };
}

function readZipText(zip, name) {
  const data = zip.read(name);
  return data ? data.toString('utf8') : '';
}

function parseSharedStrings(xml) {
  const strings = [];
  const siRegex = /<si\b[\s\S]*?<\/si>/g;
  let si;
  while ((si = siRegex.exec(xml))) {
    let text = '';
    const tRegex = /<t\b[^>]*>([\s\S]*?)<\/t>/g;
    let t;
    while ((t = tRegex.exec(si[0]))) {
      text += xmlDecode(t[1]);
    }
    strings.push(text);
  }
  return strings;
}

function findSheetPath(zip, sheetName) {
  const workbook = readZipText(zip, 'xl/workbook.xml');
  const rels = readZipText(zip, 'xl/_rels/workbook.xml.rels');
  const relMap = {};
  const relRegex = /<Relationship\b([^>]*)\/>/g;
  let rel;
  while ((rel = relRegex.exec(rels))) {
    const id = xmlAttr(rel[1], 'Id');
    let target = xmlAttr(rel[1], 'Target');
    target = target.startsWith('/') ? target.slice(1) : 'xl/' + target.replace(/^xl\//, '');
    relMap[id] = target;
  }

  const sheetRegex = /<sheet\b([^>]*)\/>/g;
  let sheet;
  while ((sheet = sheetRegex.exec(workbook))) {
    if (xmlAttr(sheet[1], 'name') === sheetName) {
      return relMap[xmlAttr(sheet[1], 'r:id')];
    }
  }
  return null;
}

function parseSheetRows(xml, sharedStrings) {
  const rows = {};
  const rowRegex = /<row\b([^>]*)>([\s\S]*?)<\/row>/g;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(xml))) {
    const rowNum = parseInt(xmlAttr(rowMatch[1], 'r'), 10);
    if (!rowNum) {
      continue;
    }
    const cells = {};
    const cellRegex = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cellMatch;
    while ((cellMatch = cellRegex.exec(rowMatch[2]))) {
      const attrs = cellMatch[1];
      const body = cellMatch[2] || '';
      const ref = xmlAttr(attrs, 'r');
      const refMatch = ref.match(/^([A-Z]+)/);
      if (!refMatch) {
        continue;
      }
      const col = colNameToNumber(refMatch[1]);
      const type = xmlAttr(attrs, 't');
      let value = '';
      if (type === 's') {
        const m = body.match(/<v>([\s\S]*?)<\/v>/);
        value = sharedStrings[parseInt(m ? m[1] : '', 10)] || '';
      } else if (type === 'inlineStr') {
        const m = body.match(/<t\b[^>]*>([\s\S]*?)<\/t>/);
        value = m ? xmlDecode(m[1]) : '';
      } else {
        const m = body.match(/<v>([\s\S]*?)<\/v>/);
        value = m ? xmlDecode(m[1]) : '';
      }
      cells[col] = String(value).trim();
    }
    rows[rowNum] = cells;
  }
  return rows;
}

function usageDaysFromText(text) {
  let n = null;
  if (/^\d+(\.\d+)?$/.test(text)) {
    n = parseFloat(text);
  } else {
    const numericLine = String(text).split(/\s+/).find((part) => /^\d+(\.\d+)?$/.test(part));
    if (numericLine) {
      n = parseFloat(numericLine);
    }
  }
  if (!Number.isFinite(n) && text.includes('반반차')) {
    n = 0.25;
  } else if (text.includes('반차')) {
    n = 0.5;
  } else if (text.includes('연차') || text.includes('병가')) {
    n = 1;
  }
  if (!Number.isFinite(n) || n <= 0) {
    return 0;
  }
  return Math.round(n * 100) / 100;
}

async function parseUsageWorkbook(buffer, year) {
  const zip = zipEntries(buffer);
  const yy = String(year).slice(-2);
  const sheetPath = findSheetPath(zip, `20 (${yy}).`);
  if (!sheetPath) {
    throw new Error(`20 (${yy}). sheet not found`);
  }
  const sharedStrings = parseSharedStrings(readZipText(zip, 'xl/sharedStrings.xml'));
  const rows = parseSheetRows(readZipText(zip, sheetPath), sharedStrings);

  const dateCols = [];
  const dateRow = rows[5] || {};
  for (const [colText, raw] of Object.entries(dateRow)) {
    const date = excelSerialToDate(raw);
    if (date && date.startsWith(year + '-')) {
      dateCols.push({ col: parseInt(colText, 10), date });
    }
  }

  const records = [];
  let rowNum = 1;
  while (rowNum <= 2000) {
    const row = rows[rowNum] || {};
    const nextRow = rows[rowNum + 1] || {};
    const usageRow = rows[rowNum + 2] || {};
    const employeeName = (row[5] || '').trim();
    const joinDate = LeaveLogic.parseImportDate(nextRow[5]) || excelSerialToDate(nextRow[5]);
    const usageLabel = (usageRow[5] || '').trim();
    if (!employeeName && !joinDate && !usageLabel && rowNum > 100) {
      break;
    }
    if (!employeeName || !joinDate || usageLabel !== '사용') {
      rowNum += 1;
      continue;
    }

    for (const { col, date } of dateCols) {
      const text = (usageRow[col] || '').trim();
      if (!text) {
        continue;
      }
      const days = usageDaysFromText(text);
      if (!days) {
        continue;
      }
      records.push({
        employeeName,
        date,
        days,
        note: /^\d+(\.\d+)?$/.test(text) ? '' : text,
      });
    }
    rowNum += 4;
  }
  return { records };
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
  if (req.url.startsWith('/api/import/usages') && req.method === 'POST') {
    const url = new URL(req.url, 'http://localhost');
    const year = parseInt(url.searchParams.get('year'), 10)
      || new Date().getFullYear();
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 30 * 1024 * 1024) {
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      parseUsageWorkbook(Buffer.concat(chunks), year).then((result) => {
        res.writeHead(200, { 'Content-Type': MIME['.json'] });
        res.end(JSON.stringify(result));
      }).catch((e) => {
        res.writeHead(400, { 'Content-Type': MIME['.json'] });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      });
    });
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
  // 일반 실행에서만 브라우저를 자동으로 열고, 개발 모드 재시작에서는 열지 않는다.
  if (!DEV) {
    exec('start "" "' + url + '"');
  }
});
