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

  // 해당 회계연도 1/1 시작 잔액.
  function yearStartBalance(emp, usages, fiscalYear) {
    if (fiscalYear < BASE_FISCAL_YEAR) {
      return 0; // 운영 이전 연도는 0으로 처리
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

  // dateStr 시작 시점(그날 사용분 미포함)의 잔여 연차.
  // 공식: 연초잔액 + (입사해면 그날까지 월적립) - [1/1, dateStr) 사용분
  function balanceAtDate(emp, usages, dateStr) {
    const fiscalYear = new Date(dateStr).getFullYear();
    const start = yearStartBalance(emp, usages, fiscalYear);
    const accrual = isJoiningYear(emp.joinDate, fiscalYear)
      ? monthlyAccrual(emp.joinDate, dateStr)
      : 0;
    const used = usageInRange(usages, emp.id, fiscalYear + '-01-01', dateStr);
    return Math.round((start + accrual - used) * 100) / 100;
  }

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

  // 보고서 "기준" 행 근속 라벨. 입사 달을 1개월째로 세는 포함 계산.
  // 12개월 미만이면 "M월", 이상이면 "N년 M월"(개월수 0이면 "N년").
  function tenureLabelKor(joinDate, asOfDate) {
    const j = new Date(joinDate);
    const a = new Date(asOfDate);
    let months = (a.getFullYear() - j.getFullYear()) * 12 + (a.getMonth() - j.getMonth()) + 1;
    if (months < 1) {
      months = 1;
    }
    const y = Math.floor(months / 12);
    const mo = months % 12;
    if (y > 0) {
      return mo > 0 ? (y + '년 ' + mo + '월') : (y + '년');
    }
    return mo + '월';
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
    // 기준 월의 말일 계산 (다음 달 0일 = 이번 달 마지막 날). asOfMonth는 1-based.
    const lastDay = new Date(fiscalYear, asOfMonth, 0).getDate();
    const asOfDate = fiscalYear + '-' + String(asOfMonth).padStart(2, '0') + '-' + String(lastDay).padStart(2, '0');
    const clamped = clampUsages(usages, fiscalYear, asOfMonth);
    const columns = employees.map((e) => ({
      id: e.id,
      name: e.name,
      joinDate: e.joinDate,
      tenureLabel: tenureLabel(e.joinDate, asOfDate),
      tenureLabelKor: tenureLabelKor(e.joinDate, asOfDate),
    }));
    // 연간 보유 연차 = 연시작잔액 + (입사해면 연말까지 월적립).
    const granted = employees.map((e) => {
      const start = yearStartBalance(e, clamped, fiscalYear);
      const accrual = isJoiningYear(e.joinDate, fiscalYear)
        ? monthlyAccrual(e.joinDate, fiscalYear + '-12-31') : 0;
      return Math.round((start + accrual) * 100) / 100;
    });
    // 사용 누계 = 회계연도 내(기준월까지 clamp됨) 총 사용분.
    const usedTotal = employees.map((e) =>
      usageInRange(clamped, e.id, fiscalYear + '-01-01', (fiscalYear + 1) + '-01-01'));
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
    return { fiscalYear, asOfMonth, columns, granted, usedTotal, monthRows, yearEnd };
  }

  // YYYY-MM-DD 다음 날 문자열(끝 포함 처리용).
  function addDay(dateStr) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

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

  // Date 객체에서 로컬(KST 등) 기준 "YYYY-MM" 문자열을 반환한다. toISOString()은 UTC 기준이라 자정 전후 오차 발생 가능.
  function monthKey(dateObj) {
    return dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0');
  }

  // Date 객체에서 로컬 기준 "YYYY-MM-DD" 문자열을 반환한다. dateObj 생략 시 오늘 날짜.
  function todayStr(dateObj) {
    const d = dateObj || new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  // 엑셀 임포트용 입사일 파싱: Date 객체 또는 "YY-MM-DD"/"YYYY-MM-DD"/"YY/MM/DD"/"YY.MM.DD" 문자열을
  // "YYYY-MM-DD"로 변환한다. 2자리 연도는 20YY로 본다. 파싱 불가 시 null 반환.
  function parseImportDate(value) {
    if (value === null || value === undefined || value === '') {
      return null;
    }
    if (value instanceof Date) {
      return todayStr(value); // 로컬 파트 기준 YYYY-MM-DD
    }
    const s = String(value).trim();
    const m = s.match(/^(\d{2,4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
    if (!m) {
      return null;
    }
    let year = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const day = parseInt(m[3], 10);
    if (m[1].length === 2) {
      year += 2000; // 2자리 연도 -> 20YY
    }
    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return null;
    }
    return year + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  const api = { BASE_GRANT, MAX_GRANT, BASE_FISCAL_YEAR, tenureYears, annualGrant, monthlyAccrual, isJoiningYear, usageInRange, yearStartBalance, yearEndBalance, balanceAtDate, tenureLabel, tenureLabelKor, buildReportMatrix, settlementByJoinDate, monthKey, todayStr, parseImportDate };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.LeaveLogic = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
