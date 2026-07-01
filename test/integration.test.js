// 캡쳐 시나리오 기반 통합 테스트: 정인석·심보현 잔액 흐름 검증
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
