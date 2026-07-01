// 대한민국 공휴일. 양력 고정 공휴일은 연도로 계산하고,
// 음력 기반(설날·추석·부처님오신날)과 대체공휴일은 연도별 표로 관리한다.
// ※ 음력/대체공휴일은 매년 확인·갱신이 필요하다(아래 표에 연도를 추가).
(function (root) {
  'use strict';

  // 음력 기반 및 대체공휴일(양력 환산). 매년 확인/추가 필요.
  const LUNAR_AND_SUBSTITUTE = {
    2025: {
      '2025-01-28': '설날 연휴', '2025-01-29': '설날', '2025-01-30': '설날 연휴',
      '2025-05-05': '어린이날·부처님오신날', '2025-05-06': '대체공휴일(부처님오신날)',
      '2025-10-05': '추석 연휴', '2025-10-06': '추석', '2025-10-07': '추석 연휴',
      '2025-10-08': '대체공휴일(추석)',
    },
    2026: {
      '2026-02-16': '설날 연휴', '2026-02-17': '설날', '2026-02-18': '설날 연휴',
      '2026-03-02': '대체공휴일(삼일절)',
      '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일(부처님오신날)',
      '2026-08-17': '대체공휴일(광복절)',
      '2026-09-24': '추석 연휴', '2026-09-25': '추석', '2026-09-26': '추석 연휴',
      '2026-10-05': '대체공휴일(개천절)',
    },
    2027: {
      '2027-02-06': '설날 연휴', '2027-02-07': '설날', '2027-02-08': '설날 연휴',
      '2027-02-09': '대체공휴일(설날)',
      '2027-05-13': '부처님오신날',
      '2027-09-14': '추석 연휴', '2027-09-15': '추석', '2027-09-16': '추석 연휴',
    },
  };

  // 양력 고정 공휴일.
  function fixed(year) {
    const map = {};
    map[year + '-01-01'] = '신정';
    map[year + '-03-01'] = '삼일절';
    map[year + '-05-05'] = '어린이날';
    map[year + '-06-06'] = '현충일';
    map[year + '-08-15'] = '광복절';
    map[year + '-10-03'] = '개천절';
    map[year + '-10-09'] = '한글날';
    map[year + '-12-25'] = '크리스마스';
    return map;
  }

  // 대체공휴일 표시 라벨.
  const SUBSTITUTE_LABEL = '대체공휴일';

  // 대체공휴일 적용 대상 공휴일: 정규화된 이름 → 표준 표시명.
  // Nager API는 대체일을 원 공휴일명(예: '3·1절')으로 주므로 이를 표준명으로 환산한다.
  const TARGET_CANONICAL = {
    삼일절: '삼일절', '31절': '삼일절',
    어린이날: '어린이날',
    부처님오신날: '부처님오신날',
    광복절: '광복절',
    개천절: '개천절',
    한글날: '한글날',
    크리스마스: '크리스마스', 성탄절: '크리스마스',
    설날: '설날', 설날연휴: '설날',
    추석: '추석', 추석연휴: '추석',
  };

  // 이름 비교용 정규화(공백·가운뎃점·마침표·쉼표 제거). '3·1절' → '31절'.
  function normalizeName(name) {
    return String(name || '').replace(/[\s·.,]/g, '');
  }

  // 해당 연도의 '자연일'(대체공휴일이 아닌 원래 공휴일) 날짜 집합.
  function naturalDates(year) {
    const set = new Set(Object.keys(fixed(year)));
    const tbl = LUNAR_AND_SUBSTITUTE[year] || {};
    Object.keys(tbl).forEach((d) => {
      if (!tbl[d].includes('대체')) {
        set.add(d);
      }
    });
    return set;
  }

  // 공휴일 맵에서 대체공휴일을 '대체공휴일(원공휴일명)' 형태로 통일한다.
  // 대체일 판별: 자연일이 아니면서 이름이 대체 대상 공휴일인 날
  //             (Nager가 원 공휴일명으로 준 대체일). 내장표의 '대체공휴일(...)'은 그대로 둔다.
  function relabelSubstitutes(map, year) {
    const natural = naturalDates(year);
    Object.keys(map).forEach((d) => {
      if (natural.has(d)) {
        return;
      }
      const canonical = TARGET_CANONICAL[normalizeName(map[d])];
      if (canonical) {
        map[d] = SUBSTITUTE_LABEL + '(' + canonical + ')';
      }
    });
    return map;
  }

  // 해당 연도의 공휴일(쉬는 날) { 'YYYY-MM-DD': '명칭' } 반환.
  function get(year) {
    const map = Object.assign({}, fixed(year), LUNAR_AND_SUBSTITUTE[year] || {});
    return relabelSubstitutes(map, year);
  }

  // 기념일(공휴일 아님, 쉬지 않음). 제헌절 등 — 달력에 회색으로 표시.
  function commemorations(year) {
    const map = {};
    map[year + '-07-17'] = '제헌절';
    return map;
  }

  const api = { get, commemorations, relabelSubstitutes, naturalDates, SUBSTITUTE_LABEL };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.Holidays = api;
  }
})(typeof window !== 'undefined' ? window : globalThis);
