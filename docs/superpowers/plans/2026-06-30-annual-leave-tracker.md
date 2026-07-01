# 사내 연차 관리 도구 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 회계연도 기준으로 직원 연차를 자동 계산·기록하고, 달력과 반기별 엑셀 보고서를 제공하는 로컬 Node 앱을 만든다.

**Architecture:** Node 내장 모듈만 쓰는 로컬 HTTP 서버(`server.js`)가 정적 프론트엔드를 서빙하고 `data.json`을 자동 저장한다. 연차 계산 로직은 브라우저/Node 양쪽에서 동작하는 순수 함수 모듈(`public/leave-logic.js`)로 분리해 Node 테스트로 검증한다. 엑셀은 ExcelJS 브라우저 빌드로 클라이언트에서 생성한다.

**Tech Stack:** Node.js(내장 `http`/`fs`/`child_process`), 바닐라 JS/HTML/CSS, ExcelJS(브라우저 빌드, vendor), Node 내장 `node:test`.

## Global Constraints

- 런타임은 Node.js. **서버는 외부 npm 의존성 없이 내장 모듈만** 사용한다.
- 모든 주석·커밋 메시지·UI 문구는 한국어. 식별자는 영어.
- 모든 제어문에 중괄호 `{}` 필수(한 줄이라도).
- 외부 네트워크 요청 금지(CDN 미사용). ExcelJS는 로컬 vendor 파일로 포함.
- 운영 첫해 `BASE_FISCAL_YEAR = 2026`. 기본 부여 `BASE_GRANT = 15`, 상한 `MAX_GRANT = 25`.
- 연차 단위는 1 / 0.5 / 0.25만 허용.
- 데이터는 서버가 HTML과 같은 폴더의 `data.json`에 저장.
- 테스트는 `node --test`로 실행. 각 작업은 테스트 통과 후 커밋.

## 파일 구조

- `package.json` — 프로젝트 메타, `test`/`start` 스크립트
- `server.js` — HTTP 서버: 정적 서빙 + `GET/POST /api/data` + 브라우저 자동 오픈
- `시작.bat` — `node server.js` 실행
- `data.json` — 데이터 저장 파일(런타임 생성, git 무시)
- `public/index.html` — UI 셸(탭 네비)
- `public/styles.css` — 스타일
- `public/leave-logic.js` — 순수 계산 함수(브라우저 전역 + Node export)
- `public/app.js` — 프론트엔드 상태/렌더/저장 글루
- `public/vendor/exceljs.min.js` — ExcelJS 브라우저 빌드
- `test/leave-logic.test.js` — 계산 로직 테스트
- `.gitignore` — `node_modules`, `data.json`
- `README.md` — 실행 방법

---

### Task 0: 프로젝트 스캐폴드

**Files:**
- Create: `package.json`, `.gitignore`, `README.md`
- Create dirs: `public/`, `public/vendor/`, `test/`

- [ ] **Step 1: git 저장소 초기화**

Run:
```bash
cd "d:/workspace/claude/annual_leave"
git init
```
Expected: `Initialized empty Git repository ...`

- [ ] **Step 2: `package.json` 작성**

```json
{
  "name": "annual-leave-tracker",
  "version": "0.1.0",
  "description": "사내 연차 관리 도구",
  "type": "commonjs",
  "scripts": {
    "start": "node server.js",
    "test": "node --test"
  },
  "private": true
}
```

- [ ] **Step 3: `.gitignore` 작성**

```
node_modules/
data.json
```

- [ ] **Step 4: `README.md` 작성**

```markdown
# 사내 연차 관리 도구

## 실행
`시작.bat`을 더블클릭하면 서버가 켜지고 브라우저가 자동으로 열립니다.
(또는 터미널에서 `npm start`)

## 데이터
`data.json` 파일에 자동 저장됩니다. 이 파일을 복사하면 백업이 됩니다.

## 테스트
`npm test`
```

- [ ] **Step 5: 디렉토리 생성 확인**

Run:
```bash
mkdir -p public/vendor test && ls -d public public/vendor test
```
Expected: 세 경로 출력.

- [ ] **Step 6: 커밋**

```bash
git add -A
git commit -m "chore: 프로젝트 스캐폴드 및 메타 파일 추가"
```

---

### Task 1: leave-logic 기초 — 상수와 근속연수

**Files:**
- Create: `public/leave-logic.js`
- Test: `test/leave-logic.test.js`

**Interfaces:**
- Produces:
  - `BASE_GRANT = 15`, `MAX_GRANT = 25`, `BASE_FISCAL_YEAR = 2026` (number 상수)
  - `tenureYears(joinDate: string, asOfDate: string): number` — 입사일부터 기준일까지 만(滿) 연수(정수)
  - 모듈은 브라우저에서는 `window.LeaveLogic`, Node에서는 `module.exports`로 노출

- [ ] **Step 1: 실패 테스트 작성**

`test/leave-logic.test.js`:
```javascript
const test = require('node:test');
const assert = require('node:assert');
const L = require('../public/leave-logic.js');

test('tenureYears: 입사 기념일이 지나면 만 연수 증가', () => {
  // 2020-03-15 입사, 2026-01-01 기준 -> 아직 3/15 안 지남 -> 5년
  assert.strictEqual(L.tenureYears('2020-03-15', '2026-01-01'), 5);
  // 2020-03-15 입사, 2026-03-15 기준 -> 6년
  assert.strictEqual(L.tenureYears('2020-03-15', '2026-03-15'), 6);
  // 같은 날 -> 0년
  assert.strictEqual(L.tenureYears('2026-01-01', '2026-01-01'), 0);
});

test('상수값 확인', () => {
  assert.strictEqual(L.BASE_GRANT, 15);
  assert.strictEqual(L.MAX_GRANT, 25);
  assert.strictEqual(L.BASE_FISCAL_YEAR, 2026);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/leave-logic.test.js`
Expected: FAIL — `Cannot find module '../public/leave-logic.js'`

- [ ] **Step 3: 최소 구현 작성**

`public/leave-logic.js`:
```javascript
// 연차 계산 순수 함수 모듈. 브라우저(window.LeaveLogic)와 Node(module.exports) 양쪽에서 사용.
(function (root) {
  'use strict';

  const BASE_GRANT = 15;        // 1년 이상 기본 부여일수
  const MAX_GRANT = 25;         // 부여 상한
  const BASE_FISCAL_YEAR = 2026; // 운영 시작 회계연도

  // 입사일부터 기준일까지의 만(滿) 연수를 정수로 반환한다.
  function tenureYears(joinDate, asOfDate) {
    const j = new Date(joinDate);
    const a = new Date(asOfDate);
    let years = a.getFullYear() - j.getFullYear();
    // 올해 입사 기념일이 아직 안 지났으면 1년 차감
    const anniv = new Date(a.getFullYear(), j.getMonth(), j.getDate());
    if (a < anniv) {
      years -= 1;
    }
    return years;
  }

  const api = { BASE_GRANT, MAX_GRANT, BASE_FISCAL_YEAR, tenureYears };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LeaveLogic = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/leave-logic.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add public/leave-logic.js test/leave-logic.test.js
git commit -m "feat: 연차 로직 모듈 기초 및 근속연수 계산 추가"
```

---

### Task 2: 연간 부여량 계산 (annualGrant)

**Files:**
- Modify: `public/leave-logic.js`
- Test: `test/leave-logic.test.js`

**Interfaces:**
- Consumes: `tenureYears`, 상수
- Produces:
  - `annualGrant(joinDate: string, fiscalYear: number): number` — 해당 회계연도 1/1에
    부여되는 일수. `15 + floor((근속−1)/2)`, 하한 15, 상한 25. 근속은 1/1 기준.

- [ ] **Step 1: 실패 테스트 작성** (`test/leave-logic.test.js`에 추가)

```javascript
test('annualGrant: 근속 구간별 부여량', () => {
  // 1/1 기준 근속 계산. 2024-06-01 입사 -> 2026-01-01 근속 1년 -> 15
  assert.strictEqual(L.annualGrant('2024-06-01', 2026), 15);
  // 2023-01-01 입사 -> 2026-01-01 근속 3년 -> 16
  assert.strictEqual(L.annualGrant('2023-01-01', 2026), 16);
  // 2021-01-01 입사 -> 2026-01-01 근속 5년 -> 17
  assert.strictEqual(L.annualGrant('2021-01-01', 2026), 17);
  // 2000-01-01 입사 -> 근속 26년 -> 상한 25
  assert.strictEqual(L.annualGrant('2000-01-01', 2026), 25);
  // 전년 입사로 1/1 기준 근속 0년이어도 첫 정규 부여는 15
  assert.strictEqual(L.annualGrant('2025-06-01', 2026), 15);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/leave-logic.test.js`
Expected: FAIL — `L.annualGrant is not a function`

- [ ] **Step 3: 구현 추가** (`tenureYears` 아래에 추가, `api`에 등록)

```javascript
  // 해당 회계연도 1/1에 부여되는 연차 일수(정규직, 입사 다음 해부터).
  function annualGrant(joinDate, fiscalYear) {
    const tenure = tenureYears(joinDate, fiscalYear + '-01-01');
    let grant = BASE_GRANT + Math.floor((tenure - 1) / 2);
    if (grant < BASE_GRANT) {
      grant = BASE_GRANT; // 근속 0~1년이어도 정규 첫 부여는 15
    }
    if (grant > MAX_GRANT) {
      grant = MAX_GRANT;
    }
    return grant;
  }
```
`const api = { ... , annualGrant };` 에 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/leave-logic.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add public/leave-logic.js test/leave-logic.test.js
git commit -m "feat: 회계연도 연간 부여량 계산 추가"
```

---

### Task 3: 입사 첫해 월적립 (monthlyAccrual) 및 입사연도 판별

**Files:**
- Modify: `public/leave-logic.js`
- Test: `test/leave-logic.test.js`

**Interfaces:**
- Produces:
  - `monthlyAccrual(joinDate: string, asOfDate: string): number` — 입사한 해의 월
    단위 적립. 입사한 달은 0개월로 보고 캘린더 월이 바뀔 때마다 1일 적립(일자 무시),
    0~11로 제한.
  - `isJoiningYear(joinDate: string, fiscalYear: number): boolean` — 해당 회계연도가
    입사한 해인지(입사 연도 === fiscalYear).

- [ ] **Step 1: 실패 테스트 작성**

```javascript
test('monthlyAccrual: 캘린더 월 기준 적립(일자 무시), 최대 11', () => {
  // 2026-02-02 입사 -> 3/1 기준 1, 4/1 기준 2, 12/31 기준 10
  assert.strictEqual(L.monthlyAccrual('2026-02-02', '2026-03-01'), 1);
  assert.strictEqual(L.monthlyAccrual('2026-02-02', '2026-04-01'), 2);
  assert.strictEqual(L.monthlyAccrual('2026-02-02', '2026-12-31'), 10);
  // 입사한 달은 0
  assert.strictEqual(L.monthlyAccrual('2026-04-27', '2026-04-30'), 0);
  assert.strictEqual(L.monthlyAccrual('2026-04-27', '2026-05-01'), 1);
  // 11 상한
  assert.strictEqual(L.monthlyAccrual('2025-01-01', '2026-06-01'), 11);
  // 입사 전이면 0
  assert.strictEqual(L.monthlyAccrual('2026-05-01', '2026-04-01'), 0);
});

test('isJoiningYear: 입사 연도 판별', () => {
  assert.strictEqual(L.isJoiningYear('2026-02-02', 2026), true);
  assert.strictEqual(L.isJoiningYear('2025-02-02', 2026), false);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/leave-logic.test.js`
Expected: FAIL — `L.monthlyAccrual is not a function`

- [ ] **Step 3: 구현 추가**

```javascript
  // 입사한 해의 월 단위 적립. 입사 달=0, 캘린더 월이 넘어갈 때마다 +1(일자 무시), 0~11.
  function monthlyAccrual(joinDate, asOfDate) {
    const j = new Date(joinDate);
    const a = new Date(asOfDate);
    let months = (a.getFullYear() - j.getFullYear()) * 12 + (a.getMonth() - j.getMonth());
    if (months < 0) {
      months = 0;
    }
    if (months > 11) {
      months = 11;
    }
    return months;
  }

  // 해당 회계연도가 입사한 해인지 판별한다.
  function isJoiningYear(joinDate, fiscalYear) {
    return new Date(joinDate).getFullYear() === fiscalYear;
  }
```
`api`에 `monthlyAccrual, isJoiningYear` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/leave-logic.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add public/leave-logic.js test/leave-logic.test.js
git commit -m "feat: 입사 첫해 월적립 및 입사연도 판별 추가"
```

---

### Task 4: 기간 내 사용분 합계 (usageInRange)

**Files:**
- Modify: `public/leave-logic.js`
- Test: `test/leave-logic.test.js`

**Interfaces:**
- Produces:
  - `usageInRange(usages: Array<{employeeId,date,days}>, employeeId: string, startInclusive: string, endExclusive: string): number`
    — `[start, end)` 구간의 해당 직원 사용분 합계.

- [ ] **Step 1: 실패 테스트 작성**

```javascript
const SAMPLE_USAGES = [
  { id: 'u1', employeeId: 'e1', date: '2026-01-10', days: 1 },
  { id: 'u2', employeeId: 'e1', date: '2026-02-05', days: 0.5 },
  { id: 'u3', employeeId: 'e1', date: '2026-03-01', days: 0.25 },
  { id: 'u4', employeeId: 'e2', date: '2026-01-10', days: 1 },
];

test('usageInRange: [start, end) 구간 합계, 직원별 분리', () => {
  // e1의 1~2월(3/1 미포함): 1 + 0.5 = 1.5
  assert.strictEqual(L.usageInRange(SAMPLE_USAGES, 'e1', '2026-01-01', '2026-03-01'), 1.5);
  // 3/1 포함 시 0.25 추가
  assert.strictEqual(L.usageInRange(SAMPLE_USAGES, 'e1', '2026-01-01', '2026-04-01'), 1.75);
  // 다른 직원은 제외
  assert.strictEqual(L.usageInRange(SAMPLE_USAGES, 'e2', '2026-01-01', '2026-04-01'), 1);
  // 빈 구간
  assert.strictEqual(L.usageInRange(SAMPLE_USAGES, 'e1', '2026-06-01', '2026-07-01'), 0);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/leave-logic.test.js`
Expected: FAIL — `L.usageInRange is not a function`

- [ ] **Step 3: 구현 추가**

```javascript
  // [startInclusive, endExclusive) 구간에서 특정 직원의 사용분 합계.
  function usageInRange(usages, employeeId, startInclusive, endExclusive) {
    let sum = 0;
    for (const u of usages) {
      if (u.employeeId !== employeeId) {
        continue;
      }
      if (u.date >= startInclusive && u.date < endExclusive) {
        sum += u.days;
      }
    }
    // 부동소수점 누적 오차 방지: 0.25 단위 반올림
    return Math.round(sum * 100) / 100;
  }
```
`api`에 `usageInRange` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/leave-logic.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add public/leave-logic.js test/leave-logic.test.js
git commit -m "feat: 기간 내 사용분 합계 함수 추가"
```

---

### Task 5: 연 시작/연말 잔액 (이월·당겨쓰기 규칙)

**Files:**
- Modify: `public/leave-logic.js`
- Test: `test/leave-logic.test.js`

**Interfaces:**
- Consumes: `annualGrant`, `monthlyAccrual`, `isJoiningYear`, `usageInRange`, 상수
- Produces:
  - `Employee` 형태: `{ id, name, joinDate, initialBalance }`
  - `yearStartBalance(emp, usages, fiscalYear): number` — 해당 연도 1/1 시작 잔액.
    base년·기존재직자=initialBalance, 입사한 해=0, 그 외=`annualGrant + min(전년말,0)`(음수 부채만 이월). 재귀.
  - `yearEndBalance(emp, usages, fiscalYear): number` — 12/31 잔액 =
    `시작잔액 + (입사해면 12/31까지 월적립) − 그 해 총사용분`.

- [ ] **Step 1: 실패 테스트 작성**

```javascript
test('yearStartBalance: base년 기존 재직자는 초기잔액', () => {
  const emp = { id: 'e1', name: 'A', joinDate: '2014-05-26', initialBalance: 19.25 };
  assert.strictEqual(L.yearStartBalance(emp, [], 2026), 19.25);
});

test('yearStartBalance: 입사한 해는 0', () => {
  const emp = { id: 'e2', name: 'B', joinDate: '2026-02-02', initialBalance: 0 };
  assert.strictEqual(L.yearStartBalance(emp, [], 2026), 0);
});

test('yearEndBalance: 입사한 해는 월적립 누적', () => {
  // 2026-02-02 입사, 사용 없음 -> 12/31 적립 10
  const emp = { id: 'e2', name: 'B', joinDate: '2026-02-02', initialBalance: 0 };
  assert.strictEqual(L.yearEndBalance(emp, [], 2026), 10);
});

test('당겨쓰기 음수 부채가 다음 해로 이월, 미사용 양수는 소멸', () => {
  // 2020-01-01 입사(근속 충분). 2026 초기잔액 5, 2026에 7 사용 -> 연말 -2
  const emp = { id: 'e3', name: 'C', joinDate: '2020-01-01', initialBalance: 5 };
  const usages = [{ id: 'u', employeeId: 'e3', date: '2026-06-01', days: 7 }];
  assert.strictEqual(L.yearEndBalance(emp, usages, 2026), -2);
  // 2027 부여 = annualGrant(2020,2027)= 근속7 ->18. 음수 부채 -2 이월 -> 16
  assert.strictEqual(L.yearStartBalance(emp, usages, 2027), 16);
  // 미사용 양수는 소멸: 2027에 사용 없으면 2028 시작 = annualGrant만(부채 없음)
  assert.strictEqual(L.yearStartBalance(emp, usages, 2028), L.annualGrant('2020-01-01', 2028));
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/leave-logic.test.js`
Expected: FAIL — `L.yearStartBalance is not a function`

- [ ] **Step 3: 구현 추가**

```javascript
  // 해당 회계연도 1/1 시작 잔액.
  function yearStartBalance(emp, usages, fiscalYear) {
    if (fiscalYear < BASE_FISCAL_YEAR) {
      return 0; // 운영 이전
    }
    if (isJoiningYear(emp.joinDate, fiscalYear)) {
      return 0; // 입사한 해는 월적립이 더해지므로 시작 0
    }
    if (fiscalYear === BASE_FISCAL_YEAR) {
      return emp.initialBalance || 0; // 운영 첫해 기존 재직자: 수동 초기잔액
    }
    // 그 외: 정규 부여 + 전년도 음수 부채만 이월(양수 미사용분은 소멸)
    const prevEnd = yearEndBalance(emp, usages, fiscalYear - 1);
    const carryDebt = Math.min(prevEnd, 0);
    return Math.round((annualGrant(emp.joinDate, fiscalYear) + carryDebt) * 100) / 100;
  }

  // 해당 회계연도 12/31 잔액.
  function yearEndBalance(emp, usages, fiscalYear) {
    const start = yearStartBalance(emp, usages, fiscalYear);
    const accrual = isJoiningYear(emp.joinDate, fiscalYear)
      ? monthlyAccrual(emp.joinDate, fiscalYear + '-12-31')
      : 0;
    const used = usageInRange(usages, emp.id, fiscalYear + '-01-01', (fiscalYear + 1) + '-01-01');
    return Math.round((start + accrual - used) * 100) / 100;
  }
```
`api`에 `yearStartBalance, yearEndBalance` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/leave-logic.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add public/leave-logic.js test/leave-logic.test.js
git commit -m "feat: 연 시작/연말 잔액과 이월·당겨쓰기 규칙 추가"
```

---

### Task 6: 특정 시점 잔액 (balanceAtDate)

**Files:**
- Modify: `public/leave-logic.js`
- Test: `test/leave-logic.test.js`

**Interfaces:**
- Consumes: `yearStartBalance`, `isJoiningYear`, `monthlyAccrual`, `usageInRange`
- Produces:
  - `balanceAtDate(emp, usages, dateStr): number` — `dateStr` **시작 시점** 잔액
    (그날 사용분 미포함). `시작잔액 + (입사해면 그날까지 월적립) − [1/1, dateStr) 사용분`.

- [ ] **Step 1: 실패 테스트 작성**

```javascript
test('balanceAtDate: 월초 잔액 = 전월잔액 - 전월사용분', () => {
  const emp = { id: 'e1', name: 'A', joinDate: '2014-05-26', initialBalance: 19.25 };
  const usages = [
    { id: 'u1', employeeId: 'e1', date: '2026-01-15', days: 1 },
    { id: 'u2', employeeId: 'e1', date: '2026-02-10', days: 1 },
  ];
  assert.strictEqual(L.balanceAtDate(emp, usages, '2026-01-01'), 19.25); // 연초
  assert.strictEqual(L.balanceAtDate(emp, usages, '2026-02-01'), 18.25); // 1월 1 사용 후
  assert.strictEqual(L.balanceAtDate(emp, usages, '2026-03-01'), 17.25); // 2월 1 사용 후
});

test('balanceAtDate: 입사한 해 월적립 반영', () => {
  const emp = { id: 'e2', name: 'B', joinDate: '2026-02-02', initialBalance: 0 };
  const usages = [{ id: 'u', employeeId: 'e2', date: '2026-03-10', days: 0.5 }];
  assert.strictEqual(L.balanceAtDate(emp, usages, '2026-03-01'), 1);   // 적립 1
  assert.strictEqual(L.balanceAtDate(emp, usages, '2026-04-01'), 1.5); // 적립 2 - 0.5
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/leave-logic.test.js`
Expected: FAIL — `L.balanceAtDate is not a function`

- [ ] **Step 3: 구현 추가**

```javascript
  // dateStr 시작 시점(그날 사용분 미포함)의 잔여 연차.
  function balanceAtDate(emp, usages, dateStr) {
    const fiscalYear = new Date(dateStr).getFullYear();
    const start = yearStartBalance(emp, usages, fiscalYear);
    const accrual = isJoiningYear(emp.joinDate, fiscalYear)
      ? monthlyAccrual(emp.joinDate, dateStr)
      : 0;
    const used = usageInRange(usages, emp.id, fiscalYear + '-01-01', dateStr);
    return Math.round((start + accrual - used) * 100) / 100;
  }
```
`api`에 `balanceAtDate` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/leave-logic.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add public/leave-logic.js test/leave-logic.test.js
git commit -m "feat: 특정 시점 잔액 계산 추가"
```

---

### Task 7: 보고서 매트릭스 (buildReportMatrix)

**Files:**
- Modify: `public/leave-logic.js`
- Test: `test/leave-logic.test.js`

**Interfaces:**
- Consumes: `balanceAtDate`, `usageInRange`, `tenureYears`, `yearEndBalance`
- Produces:
  - `buildReportMatrix(employees, usages, fiscalYear, asOfMonth): ReportMatrix`
  - `ReportMatrix` 형태:
    ```
    {
      fiscalYear, asOfMonth,
      columns: [{ id, name, joinDate, tenureLabel }],   // 직원별 헤더
      monthRows: [ { month: 1..12,
                     balances: number[],   // 각 직원 월초 잔액
                     usages: number[] } ], // 각 직원 그 달 사용분
      yearEnd: number[]                    // 각 직원 12/31 잔액
    }
    ```
  - `tenureLabel`은 기준일(`fiscalYear-asOfMonth-말일`)의 "N년 M개월" 문자열.
  - `asOfMonth` 이후의 사용분은 0으로 처리(기준 월 스냅샷).

- [ ] **Step 1: 실패 테스트 작성**

```javascript
test('buildReportMatrix: 구조와 월별 잔액/사용분', () => {
  const employees = [
    { id: 'e1', name: '정인석', joinDate: '2011-08-29', initialBalance: 21.5 },
  ];
  const usages = [
    { id: 'u1', employeeId: 'e1', date: '2026-01-20', days: 1 },
    { id: 'u2', employeeId: 'e1', date: '2026-07-05', days: 2 }, // 6월 기준이면 제외
  ];
  const m = L.buildReportMatrix(employees, usages, 2026, 6);
  assert.strictEqual(m.columns.length, 1);
  assert.strictEqual(m.columns[0].name, '정인석');
  assert.strictEqual(m.monthRows.length, 12);
  // 1월초 21.5
  assert.strictEqual(m.monthRows[0].balances[0], 21.5);
  // 1월 사용분 1
  assert.strictEqual(m.monthRows[0].usages[0], 1);
  // 2월초 20.5
  assert.strictEqual(m.monthRows[1].balances[0], 20.5);
  // 7월 사용분은 asOfMonth=6 이후라 제외되어 0
  assert.strictEqual(m.monthRows[6].usages[0], 0);
  // 연말잔액(6월 기준 스냅샷): 21.5 - 1 = 20.5
  assert.strictEqual(m.yearEnd[0], 20.5);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/leave-logic.test.js`
Expected: FAIL — `L.buildReportMatrix is not a function`

- [ ] **Step 3: 구현 추가**

```javascript
  // "N년 M개월" 형태 근속 라벨.
  function tenureLabel(joinDate, asOfDate) {
    const j = new Date(joinDate);
    const a = new Date(asOfDate);
    let months = (a.getFullYear() - j.getFullYear()) * 12 + (a.getMonth() - j.getMonth());
    if (a.getDate() < j.getDate()) {
      months -= 1;
    }
    if (months < 0) {
      months = 0;
    }
    const y = Math.floor(months / 12);
    const mo = months % 12;
    return y + '년 ' + mo + '개월';
  }

  // asOfMonth 이후 사용분을 제외한 사용기록 복사본.
  function clampUsages(usages, fiscalYear, asOfMonth) {
    const cutoff = fiscalYear + '-' + String(asOfMonth + 1).padStart(2, '0') + '-01';
    // asOfMonth가 12면 다음해 1/1
    const limit = asOfMonth >= 12 ? (fiscalYear + 1) + '-01-01' : cutoff;
    return usages.filter((u) => {
      if (u.date < fiscalYear + '-01-01') {
        return true; // 이전 연도는 그대로(이월 계산용)
      }
      return u.date < limit;
    });
  }

  // 보고서 매트릭스 생성.
  function buildReportMatrix(employees, usages, fiscalYear, asOfMonth) {
    const asOfDate = fiscalYear + '-' + String(asOfMonth).padStart(2, '0') + '-28';
    const clamped = clampUsages(usages, fiscalYear, asOfMonth);
    const columns = employees.map((e) => ({
      id: e.id,
      name: e.name,
      joinDate: e.joinDate,
      tenureLabel: tenureLabel(e.joinDate, asOfDate),
    }));
    const monthRows = [];
    for (let month = 1; month <= 12; month++) {
      const monthStart = fiscalYear + '-' + String(month).padStart(2, '0') + '-01';
      const nextStart = month >= 12
        ? (fiscalYear + 1) + '-01-01'
        : fiscalYear + '-' + String(month + 1).padStart(2, '0') + '-01';
      const balances = employees.map((e) => balanceAtDate(e, clamped, monthStart));
      const monthUsages = employees.map((e) => usageInRange(clamped, e.id, monthStart, nextStart));
      monthRows.push({ month, balances, usages: monthUsages });
    }
    const yearEnd = employees.map((e) => yearEndBalance(e, clamped, fiscalYear));
    return { fiscalYear, asOfMonth, columns, monthRows, yearEnd };
  }
```
`api`에 `tenureLabel, buildReportMatrix` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/leave-logic.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add public/leave-logic.js test/leave-logic.test.js
git commit -m "feat: 보고서 매트릭스 생성 함수 추가"
```

---

### Task 8: 입사일 기준 퇴사 정산 (settlementByJoinDate)

**Files:**
- Modify: `public/leave-logic.js`
- Test: `test/leave-logic.test.js`

**Interfaces:**
- Consumes: `monthlyAccrual`, `annualGrant`, `usageInRange`, `tenureYears`
- Produces:
  - `settlementByJoinDate(emp, usages, asOfDate): { granted, used, balance }`
    — 입사일 기준 누적 부여(첫 1년 월적립 최대 11 + 이후 입사기념일마다 정규 부여),
    총 사용분, 잔액.

- [ ] **Step 1: 실패 테스트 작성**

```javascript
test('settlementByJoinDate: 입사 1년 미만은 월적립', () => {
  // 2026-02-02 입사, 2026-12-31 기준 -> 적립 10, 사용 0
  const emp = { id: 'e1', name: 'A', joinDate: '2026-02-02', initialBalance: 0 };
  const r = L.settlementByJoinDate(emp, [], '2026-12-31');
  assert.strictEqual(r.granted, 10);
  assert.strictEqual(r.used, 0);
  assert.strictEqual(r.balance, 10);
});

test('settlementByJoinDate: 1년 경과 후 정규 부여 누적', () => {
  // 2024-01-01 입사, 2026-06-30 기준
  // 첫 1년(2024) 월적립 11 + 1주년(2025-01-01) 15 + 2주년(2026-01-01) 15 = 41
  const emp = { id: 'e2', name: 'B', joinDate: '2024-01-01', initialBalance: 0 };
  const usages = [{ id: 'u', employeeId: 'e2', date: '2025-05-01', days: 5 }];
  const r = L.settlementByJoinDate(emp, usages, '2026-06-30');
  assert.strictEqual(r.granted, 41);
  assert.strictEqual(r.used, 5);
  assert.strictEqual(r.balance, 36);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test test/leave-logic.test.js`
Expected: FAIL — `L.settlementByJoinDate is not a function`

- [ ] **Step 3: 구현 추가**

```javascript
  // 입사일 기준 누적 정산(법정 비교용).
  function settlementByJoinDate(emp, usages, asOfDate) {
    const join = new Date(emp.joinDate);
    let granted = 0;
    // 입사 1년 미만 구간: 월적립(최대 11)
    granted += monthlyAccrual(emp.joinDate, asOfDate);
    // 입사 기념일마다 정규 부여(1주년부터)
    const a = new Date(asOfDate);
    for (let n = 1; ; n++) {
      const anniv = new Date(join.getFullYear() + n, join.getMonth(), join.getDate());
      if (anniv > a) {
        break;
      }
      // n주년 시점 근속 n년 기준 부여량
      const fy = anniv.getFullYear();
      granted += annualGrant(emp.joinDate, fy);
    }
    const used = usageInRange(usages, emp.id, emp.joinDate, addDay(asOfDate));
    const balance = Math.round((granted - used) * 100) / 100;
    return { granted, used, balance };
  }

  // YYYY-MM-DD 다음 날 문자열(끝 포함 처리용).
  function addDay(dateStr) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }
```
`api`에 `settlementByJoinDate` 추가.

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test test/leave-logic.test.js`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add public/leave-logic.js test/leave-logic.test.js
git commit -m "feat: 입사일 기준 퇴사 정산 계산 추가"
```

---

### Task 9: 로컬 서버와 실행 스크립트

**Files:**
- Create: `server.js`, `시작.bat`
- Test: 수동 검증(아래 명령)

**Interfaces:**
- Produces: HTTP 서버. `GET /api/data` → `data.json` 내용(없으면 기본 구조),
  `POST /api/data` → 본문 JSON을 `data.json`에 저장. 그 외 경로는 `public/` 정적 서빙.
  기본 포트 `4173`. 시작 시 기본 브라우저 자동 오픈.
- 기본 데이터 구조: `{ "employees": [], "usages": [], "settings": { "baseFiscalYear": 2026 } }`

- [ ] **Step 1: `server.js` 작성**

```javascript
// 로컬 연차 관리 서버: 정적 파일 서빙 + data.json 읽기/쓰기.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = 4173;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATA_FILE = path.join(ROOT, 'data.json');

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
  if (!filePath.startsWith(PUBLIC_DIR)) {
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
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer((req, res) => {
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
```

- [ ] **Step 2: `시작.bat` 작성**

```bat
@echo off
chcp 65001 > nul
cd /d "%~dp0"
node server.js
pause
```

- [ ] **Step 3: 임시 index.html로 서버 동작 확인**

`public/index.html`에 임시로 `<h1>연차 관리</h1>` 작성 후:
```bash
node server.js &
sleep 1
curl -s http://localhost:4173/ | head -1
curl -s http://localhost:4173/api/data
```
Expected: HTML 첫 줄 출력, `data.json` 기본 구조(JSON) 출력.

- [ ] **Step 4: 저장 동작 확인**

```bash
curl -s -X POST http://localhost:4173/api/data -d '{"employees":[],"usages":[],"settings":{"baseFiscalYear":2026}}'
cat data.json
```
Expected: `{"ok":true}` 와 `data.json` 파일 생성. 이후 서버 종료(`kill %1`).

- [ ] **Step 5: 커밋**

```bash
git add server.js 시작.bat public/index.html
git commit -m "feat: 로컬 서버, 실행 스크립트, data.json 자동 저장 추가"
```

---

### Task 10: ExcelJS vendor 포함, UI 셸과 스타일

**Files:**
- Create: `public/vendor/exceljs.min.js`, `public/styles.css`
- Modify: `public/index.html`

**Interfaces:**
- Produces: 탭 6개(대시보드/사용입력/달력/보고서/직원관리/퇴사정산)를 가진 SPA 셸.
  전역 `ExcelJS` 사용 가능. 각 탭 컨테이너 id: `view-dashboard`, `view-usage`,
  `view-calendar`, `view-report`, `view-employees`, `view-settlement`.

- [ ] **Step 1: ExcelJS 브라우저 빌드 다운로드(오프라인 vendor)**

Run:
```bash
curl -L -o public/vendor/exceljs.min.js https://cdn.jsdelivr.net/npm/exceljs@4.4.0/dist/exceljs.min.js
node -e "const s=require('fs').statSync('public/vendor/exceljs.min.js'); if(s.size<100000){throw new Error('too small');} console.log('ok', s.size)"
```
Expected: `ok <bytes>` (수백 KB). 인터넷이 없으면 동일 버전 파일을 수동 배치.
설치 후에는 런타임에 외부 요청이 없다(로컬 서빙).

- [ ] **Step 2: `public/index.html` 작성**

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>사내 연차 관리</title>
  <link rel="stylesheet" href="/styles.css" />
</head>
<body>
  <header class="topbar">
    <h1>사내 연차 관리</h1>
    <span id="save-status" class="save-status">저장됨</span>
  </header>
  <nav class="tabs">
    <button data-view="dashboard" class="tab active">대시보드</button>
    <button data-view="usage" class="tab">연차 사용</button>
    <button data-view="calendar" class="tab">달력</button>
    <button data-view="report" class="tab">보고서</button>
    <button data-view="employees" class="tab">직원 관리</button>
    <button data-view="settlement" class="tab">퇴사 정산</button>
  </nav>
  <main>
    <section id="view-dashboard" class="view active"></section>
    <section id="view-usage" class="view"></section>
    <section id="view-calendar" class="view"></section>
    <section id="view-report" class="view"></section>
    <section id="view-employees" class="view"></section>
    <section id="view-settlement" class="view"></section>
  </main>
  <script src="/vendor/exceljs.min.js"></script>
  <script src="/leave-logic.js"></script>
  <script src="/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: `public/styles.css` 작성**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: "맑은 고딕", "Malgun Gothic", sans-serif; color: #222; background: #f5f6f8; }
.topbar { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: #2f3b52; color: #fff; }
.topbar h1 { font-size: 18px; margin: 0; }
.save-status { font-size: 12px; opacity: 0.85; }
.tabs { display: flex; gap: 4px; padding: 8px 16px 0; background: #2f3b52; }
.tab { border: none; padding: 10px 16px; background: #44506b; color: #cfd6e4; cursor: pointer; border-radius: 6px 6px 0 0; font-size: 14px; }
.tab.active { background: #f5f6f8; color: #222; font-weight: 600; }
main { padding: 20px; }
.view { display: none; }
.view.active { display: block; }
.card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.emp-card { background: #fff; border-radius: 8px; padding: 14px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.emp-card h3 { margin: 0 0 8px; font-size: 15px; }
.emp-card .num { font-size: 22px; font-weight: 700; }
.emp-card .neg { color: #c0392b; }
table { border-collapse: collapse; background: #fff; width: 100%; }
th, td { border: 1px solid #d0d4da; padding: 6px 8px; font-size: 13px; text-align: center; }
th { background: #eef1f6; }
.report-table td.bal { font-weight: 600; }
.report-table td.use { color: #2c6cbf; }
input, select, button.action { font-size: 14px; padding: 6px 8px; }
button.action { background: #3a6ea5; color: #fff; border: none; border-radius: 6px; cursor: pointer; }
button.danger { background: #c0392b; }
.row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 10px; }
.cal-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 2px; }
.cal-cell { background: #fff; min-height: 80px; padding: 4px; border: 1px solid #e1e4e8; font-size: 12px; }
.cal-cell .d { font-weight: 600; color: #888; }
.cal-use { display: block; border-radius: 4px; padding: 1px 4px; margin-top: 2px; color: #fff; font-size: 11px; }
```

- [ ] **Step 4: 셸 확인**

Run:
```bash
node server.js &
sleep 1
curl -s http://localhost:4173/styles.css | head -1
curl -s http://localhost:4173/vendor/exceljs.min.js | head -c 40
kill %1
```
Expected: CSS 첫 줄과 exceljs 코드 일부 출력.

- [ ] **Step 5: 커밋**

```bash
git add public/index.html public/styles.css public/vendor/exceljs.min.js
git commit -m "feat: UI 셸, 스타일, ExcelJS vendor 추가"
```

---

### Task 11: 프론트엔드 상태/저장 계층

**Files:**
- Create: `public/app.js`

**Interfaces:**
- Consumes: `window.LeaveLogic`, `GET/POST /api/data`
- Produces (전역 `App` 객체):
  - `App.state` = `{ employees, usages, settings }`
  - `App.load(): Promise<void>` — 서버에서 데이터 로드
  - `App.save(): Promise<void>` — 서버에 저장(디바운스), `#save-status` 갱신
  - `App.uid(): string` — 고유 id 생성
  - `App.renderAll(): void` — 현재 활성 뷰 렌더(각 뷰의 `render` 함수 호출)
  - `App.views = {}` — 뷰별 렌더 함수 등록 객체(이후 태스크가 채움)
  - 탭 전환 이벤트 바인딩, 최초 `load → renderAll`

- [ ] **Step 1: `public/app.js` 작성**

```javascript
// 프론트엔드 상태 관리 및 서버 저장 글루.
(function () {
  'use strict';
  const L = window.LeaveLogic;

  const App = {
    state: { employees: [], usages: [], settings: { baseFiscalYear: 2026 } },
    views: {},
    activeView: 'dashboard',
    _saveTimer: null,
  };

  // 고유 id 생성.
  App.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  // 서버에서 데이터 로드.
  App.load = async function () {
    const res = await fetch('/api/data');
    App.state = await res.json();
    if (!App.state.settings) {
      App.state.settings = { baseFiscalYear: 2026 };
    }
  };

  // 서버에 저장(300ms 디바운스).
  App.save = function () {
    const status = document.getElementById('save-status');
    status.textContent = '저장 중...';
    clearTimeout(App._saveTimer);
    App._saveTimer = setTimeout(async () => {
      try {
        await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(App.state),
        });
        status.textContent = '저장됨';
      } catch (e) {
        status.textContent = '저장 실패!';
      }
    }, 300);
  };

  // 활성 뷰 렌더.
  App.renderAll = function () {
    const fn = App.views[App.activeView];
    if (fn) {
      fn(document.getElementById('view-' + App.activeView));
    }
  };

  // 탭 전환.
  function bindTabs() {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
        document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
        btn.classList.add('active');
        App.activeView = btn.dataset.view;
        document.getElementById('view-' + App.activeView).classList.add('active');
        App.renderAll();
      });
    });
  }

  window.App = App;

  window.addEventListener('DOMContentLoaded', async () => {
    bindTabs();
    await App.load();
    App.renderAll();
  });
})();
```

- [ ] **Step 2: 동작 확인(수동)**

서버 실행 후 브라우저에서 `http://localhost:4173` 접속 → 탭 클릭 시 뷰 전환,
콘솔 에러 없음 확인. (뷰 내용은 이후 태스크에서 채워짐.)

- [ ] **Step 3: 커밋**

```bash
git add public/app.js
git commit -m "feat: 프론트엔드 상태 관리 및 자동 저장 계층 추가"
```

---

### Task 12: 직원 관리 화면

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `App.state`, `App.save`, `App.uid`, `App.renderAll`
- Produces: `App.views.employees(container)` — 직원 목록 표 + 추가/수정/삭제/퇴사.
  추가 입력: 이름, 입사일, 초기잔액(운영 첫해 기존 재직자만). 삭제 확인.

- [ ] **Step 1: `App.views.employees` 구현 추가** (`window.App = App;` 직전에 삽입)

```javascript
  // 직원 관리 화면.
  App.views.employees = function (el) {
    const base = App.state.settings.baseFiscalYear;
    const rows = App.state.employees.map((e) => `
      <tr>
        <td>${escapeHtml(e.name)}</td>
        <td>${e.joinDate}</td>
        <td>${e.initialBalance ?? 0}</td>
        <td>${e.active === false ? '퇴사(' + (e.resignDate || '') + ')' : '재직'}</td>
        <td>
          <button class="action" data-edit="${e.id}">수정</button>
          <button class="action danger" data-del="${e.id}">삭제</button>
        </td>
      </tr>`).join('');

    el.innerHTML = `
      <h2>직원 관리</h2>
      <div class="row">
        <input id="emp-name" placeholder="이름" />
        <input id="emp-join" type="date" />
        <input id="emp-init" type="number" step="0.25" placeholder="초기잔액(${base}년 기존재직자)" style="width:200px" />
        <button class="action" id="emp-add">추가</button>
      </div>
      <table>
        <thead><tr><th>이름</th><th>입사일</th><th>초기잔액</th><th>상태</th><th>관리</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5">등록된 직원이 없습니다.</td></tr>'}</tbody>
      </table>`;

    el.querySelector('#emp-add').addEventListener('click', () => {
      const name = el.querySelector('#emp-name').value.trim();
      const joinDate = el.querySelector('#emp-join').value;
      const initRaw = el.querySelector('#emp-init').value;
      if (!name || !joinDate) {
        alert('이름과 입사일을 입력하세요.');
        return;
      }
      // 입사연도가 운영 첫해 이후면 초기잔액은 자동(0)
      const joinYear = new Date(joinDate).getFullYear();
      const initialBalance = (joinYear < base) ? (parseFloat(initRaw) || 0) : 0;
      App.state.employees.push({
        id: App.uid(), name, joinDate, initialBalance, active: true,
      });
      App.save();
      App.renderAll();
    });

    el.querySelectorAll('[data-del]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = b.dataset.del;
        const emp = App.state.employees.find((x) => x.id === id);
        if (!confirm((emp ? emp.name : '직원') + ' 및 사용기록을 삭제할까요?')) {
          return;
        }
        App.state.employees = App.state.employees.filter((x) => x.id !== id);
        App.state.usages = App.state.usages.filter((u) => u.employeeId !== id);
        App.save();
        App.renderAll();
      });
    });

    el.querySelectorAll('[data-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        const emp = App.state.employees.find((x) => x.id === b.dataset.edit);
        const name = prompt('이름', emp.name);
        if (name === null) { return; }
        const joinDate = prompt('입사일(YYYY-MM-DD)', emp.joinDate);
        if (joinDate === null) { return; }
        const resign = prompt('퇴사일(없으면 빈칸)', emp.resignDate || '');
        emp.name = name.trim() || emp.name;
        emp.joinDate = joinDate;
        emp.active = !resign;
        emp.resignDate = resign || undefined;
        App.save();
        App.renderAll();
      });
    });
  };

  // HTML 이스케이프.
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }
```

- [ ] **Step 2: 동작 확인(수동)**

직원 추가 → 표에 나타나고 `data.json`에 반영(서버 콘솔/파일 확인). 삭제 시 확인창.

- [ ] **Step 3: 커밋**

```bash
git add public/app.js
git commit -m "feat: 직원 관리 화면 추가"
```

---

### Task 13: 연차 사용 입력 화면

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `App.state`, `App.save`, `App.uid`, `L.balanceAtDate`
- Produces: `App.views.usage(container)` — 직원 선택 + 날짜 + 일수 버튼(1/0.5/0.25)
  + 메모 → 기록 추가. 최근 사용기록 목록(삭제 가능)과 선택 직원 현재 잔여 표시.

- [ ] **Step 1: `App.views.usage` 구현 추가**

```javascript
  // 연차 사용 입력 화면.
  App.views.usage = function (el) {
    const emps = App.state.employees.filter((e) => e.active !== false);
    const options = emps.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
    const today = new Date().toISOString().slice(0, 10);
    const recent = App.state.usages.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 20);
    const recentRows = recent.map((u) => {
      const emp = App.state.employees.find((e) => e.id === u.employeeId);
      return `<tr><td>${emp ? escapeHtml(emp.name) : '?'}</td><td>${u.date}</td>
        <td>${u.days}</td><td>${escapeHtml(u.note || '')}</td>
        <td><button class="action danger" data-delu="${u.id}">삭제</button></td></tr>`;
    }).join('');

    el.innerHTML = `
      <h2>연차 사용 입력</h2>
      <div class="row">
        <select id="u-emp">${options || '<option>직원 없음</option>'}</select>
        <input id="u-date" type="date" value="${today}" />
        <span>일수:</span>
        <button class="action" data-days="1">1일</button>
        <button class="action" data-days="0.5">0.5일</button>
        <button class="action" data-days="0.25">0.25일</button>
        <input id="u-note" placeholder="메모(선택)" />
      </div>
      <p id="u-balance"></p>
      <h3>최근 사용 기록</h3>
      <table><thead><tr><th>이름</th><th>날짜</th><th>일수</th><th>메모</th><th></th></tr></thead>
      <tbody>${recentRows || '<tr><td colspan="5">기록 없음</td></tr>'}</tbody></table>`;

    function showBalance() {
      const id = el.querySelector('#u-emp').value;
      const emp = App.state.employees.find((e) => e.id === id);
      const p = el.querySelector('#u-balance');
      if (!emp) { p.textContent = ''; return; }
      const date = el.querySelector('#u-date').value;
      const bal = L.balanceAtDate(emp, App.state.usages, date);
      p.textContent = `${emp.name}님의 ${date} 시점 잔여 연차: ${bal}일`;
    }
    el.querySelector('#u-emp').addEventListener('change', showBalance);
    el.querySelector('#u-date').addEventListener('change', showBalance);
    showBalance();

    el.querySelectorAll('[data-days]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = el.querySelector('#u-emp').value;
        const emp = App.state.employees.find((e) => e.id === id);
        if (!emp) { alert('직원을 먼저 등록/선택하세요.'); return; }
        const date = el.querySelector('#u-date').value;
        const days = parseFloat(b.dataset.days);
        const note = el.querySelector('#u-note').value.trim();
        App.state.usages.push({ id: App.uid(), employeeId: id, date, days, note });
        App.save();
        App.renderAll();
      });
    });

    el.querySelectorAll('[data-delu]').forEach((b) => {
      b.addEventListener('click', () => {
        App.state.usages = App.state.usages.filter((u) => u.id !== b.dataset.delu);
        App.save();
        App.renderAll();
      });
    });
  };
```

- [ ] **Step 2: 동작 확인(수동)**

직원 선택 시 잔여 표시, 일수 버튼으로 기록 추가, 최근 기록에 즉시 반영·삭제.

- [ ] **Step 3: 커밋**

```bash
git add public/app.js
git commit -m "feat: 연차 사용 입력 화면 추가"
```

---

### Task 14: 대시보드 화면

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `App.state`, `L.balanceAtDate`, `L.usageInRange`, `L.yearStartBalance`,
  `L.isJoiningYear`, `L.monthlyAccrual`
- Produces: `App.views.dashboard(container)` — 재직 직원 카드. 올해 부여/사용/잔여.
  음수 잔여 강조. 기준 연도 = 올해(없으면 baseFiscalYear).

- [ ] **Step 1: `App.views.dashboard` 구현 추가**

```javascript
  // 대시보드 화면.
  App.views.dashboard = function (el) {
    const year = new Date().getFullYear();
    const emps = App.state.employees.filter((e) => e.active !== false);
    const today = new Date().toISOString().slice(0, 10);

    const cards = emps.map((e) => {
      // 올해 부여량 = 연시작잔액 + (입사해면 연말까지 적립)
      const start = L.yearStartBalance(e, App.state.usages, year);
      const accrual = L.isJoiningYear(e.joinDate, year)
        ? L.monthlyAccrual(e.joinDate, year + '-12-31') : 0;
      const granted = Math.round((start + accrual) * 100) / 100;
      const used = L.usageInRange(App.state.usages, e.id, year + '-01-01', (year + 1) + '-01-01');
      const bal = L.balanceAtDate(e, App.state.usages, today);
      const negClass = bal < 0 ? 'neg' : '';
      return `<div class="emp-card">
        <h3>${escapeHtml(e.name)}</h3>
        <div class="num ${negClass}">${bal}</div>
        <div>올해 부여 ${granted} · 사용 ${used}</div>
        <small>입사 ${e.joinDate}</small>
      </div>`;
    }).join('');

    el.innerHTML = `<h2>${year}년 대시보드</h2>
      <div class="card-grid">${cards || '직원을 등록하세요.'}</div>`;
  };
```

- [ ] **Step 2: 동작 확인(수동)**

직원/사용 입력 후 대시보드에서 부여·사용·잔여가 맞는지, 음수는 빨간색인지 확인.

- [ ] **Step 3: 커밋**

```bash
git add public/app.js
git commit -m "feat: 대시보드 화면 추가"
```

---

### Task 15: 달력 화면

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `App.state`
- Produces: `App.views.calendar(container)` — 월간 달력. 날짜 칸에 그날 사용자
  표시(직원별 색상). 이전/다음 달 이동. 상태 `App._calMonth`(YYYY-MM) 유지.

- [ ] **Step 1: `App.views.calendar` 구현 추가**

```javascript
  // 직원 id로 안정적인 색상 생성.
  function colorFor(id) {
    let h = 0;
    for (let i = 0; i < id.length; i++) {
      h = (h * 31 + id.charCodeAt(i)) % 360;
    }
    return `hsl(${h}, 55%, 45%)`;
  }

  // 달력 화면.
  App.views.calendar = function (el) {
    if (!App._calMonth) {
      App._calMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    }
    const [y, m] = App._calMonth.split('-').map(Number);
    const first = new Date(y, m - 1, 1);
    const startDow = first.getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const empById = {};
    App.state.employees.forEach((e) => { empById[e.id] = e; });

    let cells = '';
    for (let i = 0; i < startDow; i++) {
      cells += '<div class="cal-cell"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const uses = App.state.usages.filter((u) => u.date === dateStr);
      const tags = uses.map((u) => {
        const e = empById[u.employeeId];
        const nm = e ? e.name : '?';
        return `<span class="cal-use" style="background:${colorFor(u.employeeId)}">${escapeHtml(nm)} ${u.days}</span>`;
      }).join('');
      cells += `<div class="cal-cell"><span class="d">${d}</span>${tags}</div>`;
    }

    el.innerHTML = `
      <h2>달력</h2>
      <div class="row">
        <button class="action" id="cal-prev">◀ 이전</button>
        <strong>${y}년 ${m}월</strong>
        <button class="action" id="cal-next">다음 ▶</button>
      </div>
      <div class="cal-grid">
        <div class="cal-cell d">일</div><div class="cal-cell d">월</div><div class="cal-cell d">화</div>
        <div class="cal-cell d">수</div><div class="cal-cell d">목</div><div class="cal-cell d">금</div><div class="cal-cell d">토</div>
        ${cells}
      </div>`;

    el.querySelector('#cal-prev').addEventListener('click', () => {
      const dt = new Date(y, m - 2, 1);
      App._calMonth = dt.toISOString().slice(0, 7);
      App.renderAll();
    });
    el.querySelector('#cal-next').addEventListener('click', () => {
      const dt = new Date(y, m, 1);
      App._calMonth = dt.toISOString().slice(0, 7);
      App.renderAll();
    });
  };
```

- [ ] **Step 2: 동작 확인(수동)**

사용 기록이 해당 날짜 칸에 직원별 색상 태그로 표시, 월 이동 동작 확인.

- [ ] **Step 3: 커밋**

```bash
git add public/app.js
git commit -m "feat: 달력 화면 추가"
```

---

### Task 16: 보고서 화면 (매트릭스 렌더)

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `L.buildReportMatrix`
- Produces: `App.views.report(container)` — 연도/반기 선택 → 매트릭스 미리보기.
  반기: 상반기=asOfMonth 6, 하반기=asOfMonth 12. 엑셀 버튼은 Task 17에서 연결.
  상태 `App._reportYear`, `App._reportHalf` 유지. 매트릭스 빌더 결과를
  `App.buildCurrentMatrix()`로 노출(Task 17이 재사용).

- [ ] **Step 1: `App.views.report` 및 헬퍼 구현 추가**

```javascript
  // 현재 선택된 연도/반기로 매트릭스 생성.
  App.buildCurrentMatrix = function () {
    const year = App._reportYear || new Date().getFullYear();
    const half = App._reportHalf || (new Date().getMonth() < 6 ? 1 : 2);
    const asOfMonth = half === 1 ? 6 : 12;
    const emps = App.state.employees;
    return { matrix: L.buildReportMatrix(emps, App.state.usages, year, asOfMonth), year, half, asOfMonth };
  };

  // 보고서 화면.
  App.views.report = function (el) {
    App._reportYear = App._reportYear || new Date().getFullYear();
    App._reportHalf = App._reportHalf || (new Date().getMonth() < 6 ? 1 : 2);
    const { matrix, year, half, asOfMonth } = App.buildCurrentMatrix();
    const cols = matrix.columns;

    // 헤더 3행: 입사일 / 이름 / 근속
    const headJoin = cols.map((c) => `<th>${c.joinDate}</th>`).join('');
    const headName = cols.map((c) => `<th>${escapeHtml(c.name)}</th>`).join('');
    const headTenure = cols.map((c) => `<th>${c.tenureLabel}</th>`).join('');

    // 월별 두 줄(잔여/사용분), asOfMonth까지만 사용분 의미 있음
    let bodyRows = '';
    for (let i = 0; i < 12; i++) {
      const r = matrix.monthRows[i];
      const balTds = r.balances.map((v) => `<td class="bal">${v}</td>`).join('');
      const useTds = r.usages.map((v) => `<td class="use">${v ? v : ''}</td>`).join('');
      bodyRows += `<tr><th>${year % 100}년${r.month}월</th>${balTds}</tr>`;
      bodyRows += `<tr><th>${year % 100}.${String(r.month).padStart(2, '0')}월 사용분</th>${useTds}</tr>`;
    }
    const endTds = matrix.yearEnd.map((v) => `<td class="bal">${v}</td>`).join('');
    bodyRows += `<tr><th>${year % 100}년12월31일</th>${endTds}</tr>`;

    el.innerHTML = `
      <h2>${year}년 ${asOfMonth}월말 기준 연/월차 내역</h2>
      <div class="row">
        <label>연도 <input id="rp-year" type="number" value="${year}" style="width:90px"></label>
        <label>반기
          <select id="rp-half">
            <option value="1" ${half === 1 ? 'selected' : ''}>상반기(6월말)</option>
            <option value="2" ${half === 2 ? 'selected' : ''}>하반기(12월말)</option>
          </select>
        </label>
        <button class="action" id="rp-excel">엑셀 내보내기</button>
        <span>작성일: ${new Date().toISOString().slice(0, 10)}</span>
      </div>
      <div style="overflow:auto">
        <table class="report-table">
          <thead>
            <tr><th>입사일</th>${headJoin}</tr>
            <tr><th>이름</th>${headName}</tr>
            <tr><th>${asOfMonth}/말 기준</th>${headTenure}</tr>
          </thead>
          <tbody>${bodyRows}</tbody>
        </table>
      </div>`;

    el.querySelector('#rp-year').addEventListener('change', (ev) => {
      App._reportYear = parseInt(ev.target.value, 10) || year;
      App.renderAll();
    });
    el.querySelector('#rp-half').addEventListener('change', (ev) => {
      App._reportHalf = parseInt(ev.target.value, 10);
      App.renderAll();
    });
    el.querySelector('#rp-excel').addEventListener('click', () => {
      App.exportReportExcel(); // Task 17에서 정의
    });
  };
```

- [ ] **Step 2: 동작 확인(수동)**

연도/반기 변경 시 매트릭스 갱신, 잔여=전월잔여−전월사용분 규칙이 화면에서 맞는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add public/app.js
git commit -m "feat: 보고서 매트릭스 화면 추가"
```

---

### Task 17: 엑셀 내보내기 (ExcelJS, 캡쳐 양식)

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `ExcelJS`(전역), `App.buildCurrentMatrix`
- Produces: `App.exportReportExcel(): void` — 캡쳐 양식대로 제목/작성일, 입사일·이름·
  근속 헤더, 월별 잔여/사용분 교차 행, 12/31 행을 색상·테두리·병합 포함해 `.xlsx`로
  다운로드.

- [ ] **Step 1: `App.exportReportExcel` 구현 추가**

```javascript
  // 보고서를 ExcelJS로 .xlsx 생성·다운로드.
  App.exportReportExcel = async function () {
    const { matrix, year, asOfMonth } = App.buildCurrentMatrix();
    const cols = matrix.columns;
    const nCols = cols.length;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('연월차내역');

    const thin = { style: 'thin', color: { argb: 'FFAAAAAA' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1F6' } };
    const center = { horizontal: 'center', vertical: 'middle' };

    // 1행: 제목(병합)
    const titleRow = ws.addRow([`${year}년 ${asOfMonth}월말 기준 연/월차 내역`]);
    ws.mergeCells(1, 1, 1, nCols + 1);
    titleRow.getCell(1).font = { bold: true, size: 14 };
    titleRow.getCell(1).alignment = center;

    // 2행: 작성일(오른쪽)
    const dateRow = ws.addRow(['작성일: ' + new Date().toISOString().slice(0, 10)]);
    ws.mergeCells(2, 1, 2, nCols + 1);
    dateRow.getCell(1).alignment = { horizontal: 'right' };

    // 헤더 3행: 입사일 / 이름 / 근속
    const r3 = ws.addRow(['입사일', ...cols.map((c) => c.joinDate)]);
    const r4 = ws.addRow(['이름', ...cols.map((c) => c.name)]);
    const r5 = ws.addRow([`${asOfMonth}/말 기준`, ...cols.map((c) => c.tenureLabel)]);
    [r3, r4, r5].forEach((row) => {
      row.eachCell((cell) => {
        cell.border = border;
        cell.fill = headFill;
        cell.alignment = center;
        cell.font = { bold: true };
      });
    });

    // 본문: 월별 잔여/사용분
    for (let i = 0; i < 12; i++) {
      const mr = matrix.monthRows[i];
      const balRow = ws.addRow([`${year % 100}년${mr.month}월`, ...mr.balances]);
      const useRow = ws.addRow([`${year % 100}.${String(mr.month).padStart(2, '0')}월 사용분`,
        ...mr.usages.map((v) => (v ? v : null))]);
      balRow.eachCell((cell) => { cell.border = border; cell.alignment = center; cell.font = { bold: true }; });
      useRow.eachCell((cell) => {
        cell.border = border; cell.alignment = center;
        cell.font = { color: { argb: 'FF2C6CBF' }, underline: true };
      });
    }

    // 마지막: 12/31 행
    const endRow = ws.addRow([`${year % 100}년12월31일`, ...matrix.yearEnd]);
    endRow.eachCell((cell) => {
      cell.border = border; cell.alignment = center;
      cell.font = { bold: true, underline: true };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
    });

    // 열 너비
    ws.getColumn(1).width = 16;
    for (let c = 2; c <= nCols + 1; c++) {
      ws.getColumn(c).width = 9;
    }

    // 다운로드
    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `연월차내역_${year}_${asOfMonth}월말.xlsx`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
```

- [ ] **Step 2: 동작 확인(수동)**

보고서 화면에서 "엑셀 내보내기" → `.xlsx` 다운로드, 엑셀로 열어 제목/색상/테두리/
값이 화면 표와 일치하는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add public/app.js
git commit -m "feat: 보고서 엑셀 내보내기 추가"
```

---

### Task 18: 퇴사 정산 화면

**Files:**
- Modify: `public/app.js`

**Interfaces:**
- Consumes: `L.settlementByJoinDate`, `L.balanceAtDate`, `L.yearStartBalance`,
  `L.usageInRange`
- Produces: `App.views.settlement(container)` — 직원 선택 + 정산 기준일 → 입사일 기준
  vs 회계연도 기준 비교 표.

- [ ] **Step 1: `App.views.settlement` 구현 추가**

```javascript
  // 퇴사 정산 화면.
  App.views.settlement = function (el) {
    const options = App.state.employees
      .map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
    const today = new Date().toISOString().slice(0, 10);
    el.innerHTML = `
      <h2>퇴사 정산 (입사일 기준 vs 회계연도 기준)</h2>
      <div class="row">
        <select id="st-emp">${options || '<option>직원 없음</option>'}</select>
        <input id="st-date" type="date" value="${today}" />
        <button class="action" id="st-calc">정산 계산</button>
      </div>
      <div id="st-result"></div>`;

    el.querySelector('#st-calc').addEventListener('click', () => {
      const emp = App.state.employees.find((e) => e.id === el.querySelector('#st-emp').value);
      if (!emp) { return; }
      const asOf = el.querySelector('#st-date').value;
      const byJoin = L.settlementByJoinDate(emp, App.state.usages, asOf);
      // 회계연도 기준: 해당일 시점 잔액(이월 규칙 반영)
      const fyBalance = L.balanceAtDate(emp, App.state.usages, addDay(asOf));
      el.querySelector('#st-result').innerHTML = `
        <table>
          <tr><th></th><th>입사일 기준</th><th>회계연도 기준</th></tr>
          <tr><td>잔여 연차</td><td>${byJoin.balance}</td><td>${fyBalance}</td></tr>
          <tr><td>누적 부여</td><td>${byJoin.granted}</td><td>-</td></tr>
          <tr><td>누적 사용</td><td>${byJoin.used}</td><td>-</td></tr>
        </table>
        <p>※ 퇴사 정산은 입사일 기준이 더 유리하면 그 차이를 정산합니다(참고용).</p>`;
    });

    // 화면 내부 전용 날짜+1 헬퍼
    function addDay(dateStr) {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + 1);
      return d.toISOString().slice(0, 10);
    }
  };
```

- [ ] **Step 2: 동작 확인(수동)**

직원·기준일 선택 후 정산 계산 → 입사일 기준/회계연도 기준 값이 표시되는지 확인.

- [ ] **Step 3: 커밋**

```bash
git add public/app.js
git commit -m "feat: 퇴사 정산 화면 추가"
```

---

### Task 19: 통합 점검 및 샘플 데이터 검증

**Files:**
- Create: `test/integration.test.js`

**Interfaces:**
- Consumes: `public/leave-logic.js`
- Produces: 캡쳐 시나리오 기반 통합 테스트(정인석·심보현 등 일부 컬럼 재현).

- [ ] **Step 1: 통합 테스트 작성**

```javascript
const test = require('node:test');
const assert = require('node:assert');
const L = require('../public/leave-logic.js');

test('통합: 정인석 1~6월 사용 후 잔액 흐름', () => {
  const emp = { id: 'e1', name: '정인석', joinDate: '2011-08-29', initialBalance: 21.5 };
  const usages = [
    { id: '1', employeeId: 'e1', date: '2026-01-10', days: 1 },
    { id: '2', employeeId: 'e1', date: '2026-02-10', days: 1 },
    { id: '3', employeeId: 'e1', date: '2026-03-10', days: 1 },
    { id: '4', employeeId: 'e1', date: '2026-04-10', days: 2 },
    { id: '5', employeeId: 'e1', date: '2026-05-10', days: 1 },
    { id: '6', employeeId: 'e1', date: '2026-06-10', days: 2 },
  ];
  const m = L.buildReportMatrix([emp], usages, 2026, 6);
  assert.strictEqual(m.monthRows[0].balances[0], 21.5);  // 1월
  assert.strictEqual(m.monthRows[6].balances[0], 13.5);  // 7월초 = 연말 13.5
  assert.strictEqual(m.yearEnd[0], 13.5);
});

test('통합: 당겨쓰기 음수 잔액', () => {
  const emp = { id: 'e2', name: '심보현', joinDate: '2024-10-07', initialBalance: 7.25 };
  const usages = [
    { id: '1', employeeId: 'e2', date: '2026-02-15', days: 0.5 },
    { id: '2', employeeId: 'e2', date: '2026-03-15', days: 2 },
    { id: '3', employeeId: 'e2', date: '2026-04-15', days: 3 },
    { id: '4', employeeId: 'e2', date: '2026-05-15', days: 2 },
    { id: '5', employeeId: 'e2', date: '2026-06-15', days: 1 },
  ];
  const m = L.buildReportMatrix([emp], usages, 2026, 6);
  assert.strictEqual(m.yearEnd[0], -1.25); // 7.25 - 8.5
});
```

- [ ] **Step 2: 전체 테스트 통과 확인**

Run: `node --test`
Expected: 모든 테스트 PASS.

- [ ] **Step 3: 수동 종단 점검**

`시작.bat` 더블클릭 → 브라우저 자동 오픈 → 직원 추가 → 사용 입력 → 대시보드/달력/
보고서 확인 → 엑셀 내보내기 → `data.json` 자동 저장 확인.

- [ ] **Step 4: 커밋**

```bash
git add test/integration.test.js
git commit -m "test: 캡쳐 시나리오 통합 테스트 추가"
```

---

## 자체 검토 결과

- **스펙 커버리지:** 직원 등록(Task 12), 1/0.5/0.25 사용(Task 13), 자동 카운팅·
  잔여 표시(Task 13·14), 달력(Task 15), 반기 보고서·엑셀(Task 16·17), 부여/이월/
  당겨쓰기 규칙(Task 2·3·5), 첫해 수동 초기잔액(Task 12), 입사일 정산(Task 8·18),
  자동 저장(Task 9) — 모두 매핑됨.
- **플레이스홀더:** 없음(모든 단계에 실제 코드/명령 포함).
- **타입 일관성:** `buildReportMatrix`의 `monthRows[].balances/usages`, `yearEnd`,
  `columns[].tenureLabel` 명칭이 Task 7 정의와 Task 16·17 사용처에서 일치.
  `addDay`는 Task 8(모듈 내부)과 Task 18(화면 내부)에 각각 정의되어 충돌 없음.