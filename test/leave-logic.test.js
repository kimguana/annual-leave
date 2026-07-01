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

// ── Task 5: 연 시작/연말 잔액 테스트 ──────────────────────────────────────────

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

// ── Task 6: 특정 시점 잔액 테스트 ──────────────────────────────────────────

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

// ── Task 7: 보고서 매트릭스 테스트 ──────────────────────────────────────────

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

test('buildReportMatrix: 말일 입사자(29일) tenureLabel 정확성 - 말일 기준 asOfDate 사용', () => {
  // joinDate 2011-08-29, fiscalYear 2026, asOfMonth 6
  // asOfDate = 2026-06-30 (말일)
  // months = (2026-2011)*12 + (6-8) = 178, 30 >= 29 이므로 감산 없음 -> 14년 10개월
  const employees = [
    { id: 'e_late', name: '말일입사자', joinDate: '2011-08-29', initialBalance: 0 },
  ];
  const m = L.buildReportMatrix(employees, [], 2026, 6);
  assert.strictEqual(m.columns[0].tenureLabel, '14년 10개월');
});

// ── Task 8: 입사일 기준 퇴사 정산 테스트 ──────────────────────────────────────

test('settlementByJoinDate: 입사 1년 미만은 월적립', () => {
  // 2026-02-02 입사, 2026-12-31 기준 -> 적립 10, 사용 0
  const emp = { id: 'e1', name: 'A', joinDate: '2026-02-02', initialBalance: 0 };
  const r = L.settlementByJoinDate(emp, [], '2026-12-31');
  assert.strictEqual(r.granted, 10);
  assert.strictEqual(r.used, 0);
  assert.strictEqual(r.balance, 10);
});

// ── KST 타임존 헬퍼 테스트 ──────────────────────────────────────────────────

test('monthKey: 로컬 날짜 기준 YYYY-MM 반환', () => {
  // new Date(year, month, day) 는 로컬 타임존 기준이므로 timezone-deterministic.
  assert.strictEqual(L.monthKey(new Date(2026, 0, 15)), '2026-01');
  assert.strictEqual(L.monthKey(new Date(2026, 11, 1)), '2026-12');
});

test('todayStr: 로컬 날짜 기준 YYYY-MM-DD 반환', () => {
  assert.strictEqual(L.todayStr(new Date(2026, 6, 1)), '2026-07-01');
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

test('parseImportDate: 다양한 입사일 형식을 YYYY-MM-DD로 변환', () => {
  // Date 객체 -> 로컬 파트 기준
  assert.strictEqual(L.parseImportDate(new Date(2011, 7, 29)), '2011-08-29');
  // 2자리 연도 -> 20YY, 구분자 - / .
  assert.strictEqual(L.parseImportDate('11-08-29'), '2011-08-29');
  assert.strictEqual(L.parseImportDate('13/04/15'), '2013-04-15');
  assert.strictEqual(L.parseImportDate('26.02.02'), '2026-02-02');
  // 4자리 연도
  assert.strictEqual(L.parseImportDate('2014-05-26'), '2014-05-26');
  // 파싱 불가/빈 값 -> null
  assert.strictEqual(L.parseImportDate(''), null);
  assert.strictEqual(L.parseImportDate('이름'), null);
  assert.strictEqual(L.parseImportDate(null), null);
  // 잘못된 월/일 -> null
  assert.strictEqual(L.parseImportDate('26-13-01'), null);
});
