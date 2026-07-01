// 프론트엔드 상태 관리 및 서버 저장 글루.
(function () {
  'use strict';
  const L = window.LeaveLogic;

  const App = {
    state: { employees: [], usages: [], settings: { baseFiscalYear: 2026 } },
    views: {},
    activeView: 'dashboard',
    year: new Date().getFullYear(), // 모든 화면이 공유하는 전역 조회 연도
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
    // 서버 응답에 배열이 없을 경우 기본값으로 백필. 이후 로직이 안전하게 동작하도록 보장.
    if (!App.state.employees) {
      App.state.employees = [];
    }
    if (!App.state.usages) {
      App.state.usages = [];
    }
    if (!App.state.settings) {
      App.state.settings = { baseFiscalYear: 2026 };
    }
    // 색이 없는 직원은 자동 색을 배정해 data.json에 남긴다(한 번만 저장).
    let colorFilled = false;
    App.state.employees.forEach((e) => {
      if (!e.color) {
        e.color = empColor(e);
        colorFilled = true;
      }
    });
    if (colorFilled) {
      App.save();
    }
  };

  // 저장 상태 문구를 표시(+성공 시 일정 시간 후 자동으로 숨김).
  App._showSaveStatus = function (text, autoHide) {
    const status = document.getElementById('save-status');
    status.textContent = text;
    status.classList.add('is-visible');
    clearTimeout(App._saveHideTimer);
    if (autoHide) {
      App._saveHideTimer = setTimeout(() => {
        status.classList.remove('is-visible');
      }, 2000);
    }
  };

  // 서버에 저장(300ms 디바운스).
  App.save = function () {
    App._showSaveStatus('저장 중...', false);
    clearTimeout(App._saveTimer);
    App._saveTimer = setTimeout(async () => {
      try {
        await fetch('/api/data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(App.state),
        });
        App._showSaveStatus('저장됨', true);
      } catch (e) {
        App._showSaveStatus('저장 실패!', false);
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

  // 사이드바 연도 라벨 갱신.
  function updateYearLabel() {
    const lbl = document.getElementById('year-label');
    if (lbl) {
      lbl.textContent = App.year + '년';
    }
  }

  // 전역 조회 연도 변경 → 달력 연도 동기화 후 재렌더.
  function setYear(y) {
    App.year = y;
    const mm = App._calMonth ? App._calMonth.split('-')[1] : '01';
    App._calMonth = App.year + '-' + mm; // 달력도 선택 연도를 따르게(월은 유지)
    updateYearLabel();
    App.renderAll();
  }

  // 사이드바 연도 네비게이션(◀ 연도 ▶) 바인딩.
  function bindYearNav() {
    updateYearLabel();
    document.getElementById('year-prev').addEventListener('click', () => {
      setYear(App.year - 1);
    });
    document.getElementById('year-next').addEventListener('click', () => {
      setYear(App.year + 1);
    });
  }

  // 지정한 뷰로 전환한다(프로그램적 이동 + 탭 클릭 공용).
  App.goToView = function (view) {
    document.querySelectorAll('.tab').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('active'));
    const tabBtn = document.querySelector('.tab[data-view="' + view + '"]');
    if (tabBtn) {
      tabBtn.classList.add('active');
    }
    const viewEl = document.getElementById('view-' + view);
    if (viewEl) {
      viewEl.classList.add('active');
    }
    App.activeView = view;
    App.renderAll();
  };

  // 탭 전환.
  function bindTabs() {
    document.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        App.goToView(btn.dataset.view);
      });
    });
  }

  // 직원 관리 화면.
  App.views.employees = function (el) {
    const base = App.year; // 네비바에서 선택한 조회 연도를 기준연도로 사용

    // 한 직원 행을 표시 모드 또는 편집 모드로 렌더한다.
    const rows = App.state.employees.map((e) => {
      if (App._editingEmpId === e.id) {
        // 편집 모드: 각 칸을 입력 필드로 표시.
        return `
      <tr data-row="${e.id}">
        <td><input class="ed-color" type="color" value="${empColor(e)}" title="색상" /><button class="note-clear" data-resetcolor="${e.id}" title="직전 색으로 되돌리기" style="margin-left:6px;">↺</button></td>
        <td><input class="ed-name" value="${escapeHtml(e.name)}" style="width:100px" /></td>
        <td><input class="ed-join" type="date" value="${escapeHtml(e.joinDate)}" /></td>
        <td><input class="ed-init" type="number" step="0.25" value="${e.initialBalance ?? 0}" style="width:90px" /></td>
        <td><input class="ed-resign" type="date" value="${escapeHtml(e.resignDate || '')}" title="퇴사일(비우면 재직)" /></td>
        <td>
          <button class="action" data-save="${e.id}">저장</button>
          <button class="action" data-cancel="${e.id}">취소</button>
        </td>
      </tr>`;
      }
      // 표시 모드.
      return `
      <tr>
        <td><span class="emp-swatch" style="background:${empColor(e)}"></span></td>
        <td>${escapeHtml(e.name)}</td>
        <td>${escapeHtml(e.joinDate)}</td>
        <td>${e.initialBalance ?? 0}</td>
        <td>${e.active === false ? '퇴사(' + escapeHtml(e.resignDate || '') + ')' : '재직'}</td>
        <td>
          <button class="action" data-edit="${e.id}">수정</button>
          <button class="action danger" data-del="${e.id}">삭제</button>
        </td>
      </tr>`;
    }).join('');

    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2 style="margin:0;">직원 관리</h2>
        <button class="action" id="emp-import-btn">엑셀 가져오기</button>
      </div>
      <input id="emp-import" type="file" accept=".xlsx" style="display:none" />
      <p style="color:#666; font-size:13px; margin:6px 0 4px;">엑셀 가져오기는 이미지 양식(입사일·이름·${base}년1월 행)을 읽어 <b>전체 교체</b>합니다.</p>
      <p style="color:#666; font-size:13px; margin:0 0 12px;">초기잔액은 <b>${base}년 기존재직자</b>에게만 입력합니다(${base}년 이후 입사자는 자동 0).</p>
      <div class="row">
        <input id="emp-color" type="color" value="${DEFAULT_COLOR}" title="색상" />
        <input id="emp-name" placeholder="이름" />
        <input id="emp-join" type="date" />
        <input id="emp-init" type="number" step="0.25" placeholder="초기잔액" style="width:120px" />
        <button class="action" id="emp-add">추가</button>
      </div>
      <div id="import-preview"></div>
      <table>
        <thead><tr><th>색</th><th>이름</th><th>입사일</th><th>초기잔액</th><th>상태/퇴사일</th><th>관리</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="6">등록된 직원이 없습니다.</td></tr>'}</tbody>
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
      const color = el.querySelector('#emp-color').value;
      App.state.employees.push({
        id: App.uid(), name, joinDate, initialBalance, color, active: true,
      });
      App.save();
      App.renderAll();
    });

    // 엑셀 시트에서 직원 목록을 파싱한다(이미지 양식: 직원=열, 라벨=1열).
    function parseEmployeeSheet(ws) {
      let joinRow = null;
      let nameRow = null;
      let nameRowNum = 0;
      ws.eachRow((row, rn) => {
        const label = String(row.getCell(1).text || '').replace(/\s/g, '');
        if (!joinRow && label.includes('입사일')) {
          joinRow = row;
        }
        if (!nameRow && label.includes('이름')) {
          nameRow = row;
          nameRowNum = rn;
        }
      });
      if (!joinRow || !nameRow) {
        throw new Error("'입사일' 또는 '이름' 행을 찾지 못했습니다.");
      }
      // 직원 열 = 이름 행에서 이름이 채워진 2열 이상 컬럼.
      const empCols = [];
      nameRow.eachCell((cell, col) => {
        if (col >= 2 && String(cell.text || '').trim()) {
          empCols.push(col);
        }
      });
      if (empCols.length === 0) {
        throw new Error('직원 이름 열을 찾지 못했습니다.');
      }
      // 초기잔액 행 = 이름 행 이후, 직원 열에 숫자 값이 있는 첫 행(예: "26년1월").
      let balanceRow = null;
      ws.eachRow((row, rn) => {
        if (balanceRow || rn <= nameRowNum) {
          return;
        }
        const hasNumber = empCols.some((c) => typeof row.getCell(c).value === 'number');
        if (hasNumber) {
          balanceRow = row;
        }
      });
      return empCols.map((c) => {
        const name = String(nameRow.getCell(c).text || '').trim();
        const joinDate = L.parseImportDate(joinRow.getCell(c).value);
        let initialBalance = 0;
        if (balanceRow) {
          const v = balanceRow.getCell(c).value;
          initialBalance = (typeof v === 'number') ? v : (parseFloat(v) || 0);
        }
        return { name, joinDate, initialBalance, valid: !!(name && joinDate) };
      });
    }

    // 파싱 결과 미리보기와 확인/취소 버튼을 렌더한다.
    function renderImportPreview(list) {
      const box = el.querySelector('#import-preview');
      const validCount = list.filter((x) => x.valid).length;
      const rowsHtml = list.map((x) => `
        <tr style="${x.valid ? '' : 'background:#fdecea;'}">
          <td>${escapeHtml(x.name || '(이름 없음)')}</td>
          <td>${escapeHtml(x.joinDate || '(입사일 인식 실패)')}</td>
          <td>${x.initialBalance}</td>
        </tr>`).join('');
      box.innerHTML = `
        <div style="border:1px solid #3a6ea5; border-radius:8px; padding:12px; margin:10px 0; background:#fff;">
          <h3>가져오기 미리보기 — 총 ${list.length}명 (유효 ${validCount}명)</h3>
          <p style="color:#c0392b;">확인 시 기존 직원 ${App.state.employees.length}명과 <b>모든 사용기록</b>이 삭제되고 아래 내용으로 교체됩니다.</p>
          <table><thead><tr><th>이름</th><th>입사일</th><th>초기잔액</th></tr></thead><tbody>${rowsHtml}</tbody></table>
          <div class="row" style="margin-top:10px;">
            <button class="action" id="import-confirm">확인(전체 교체)</button>
            <button class="action" id="import-cancel">취소</button>
          </div>
          <p style="color:#888; font-size:12px;">빨간 행은 이름/입사일 인식 실패로 가져오지 않습니다.</p>
        </div>`;

      box.querySelector('#import-cancel').addEventListener('click', () => {
        box.innerHTML = '';
      });

      box.querySelector('#import-confirm').addEventListener('click', () => {
        const valids = list.filter((x) => x.valid);
        if (valids.length === 0) {
          alert('가져올 유효한 직원이 없습니다.');
          return;
        }
        if (!confirm(`기존 직원과 사용기록을 모두 지우고 ${valids.length}명으로 교체합니다. 진행할까요?`)) {
          return;
        }
        // 이름 기준으로 기존 직원의 색을 찾아 유지하기 위한 맵.
        const existingByName = {};
        App.state.employees.forEach((e) => { existingByName[e.name] = e; });
        // 입사연도가 운영 첫해 이후면 초기잔액은 자동(0) — 수동 추가와 동일 규칙.
        App.state.employees = valids.map((x) => {
          const joinYear = new Date(x.joinDate).getFullYear();
          const initialBalance = (joinYear < base) ? x.initialBalance : 0;
          // 이름이 같은 기존 직원이 있으면 그 색을 유지, 신규는 기본 보라색.
          const existing = existingByName[x.name];
          const color = existing ? empColor(existing) : DEFAULT_COLOR;
          return { id: App.uid(), name: x.name, joinDate: x.joinDate, initialBalance, color, active: true };
        });
        App.state.usages = [];
        App._editingEmpId = null;
        App.save();
        App.renderAll();
      });
    }

    // 버튼 클릭 시 숨긴 파일 입력을 연다.
    el.querySelector('#emp-import-btn').addEventListener('click', () => {
      el.querySelector('#emp-import').click();
    });

    // 엑셀 파일 선택 시 파싱 후 미리보기.
    el.querySelector('#emp-import').addEventListener('change', (ev) => {
      const file = ev.target.files && ev.target.files[0];
      if (!file) {
        return;
      }
      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const wb = new ExcelJS.Workbook();
          await wb.xlsx.load(reader.result);
          const ws = wb.worksheets[0];
          if (!ws) {
            throw new Error('시트를 찾을 수 없습니다.');
          }
          renderImportPreview(parseEmployeeSheet(ws));
        } catch (e) {
          alert('엑셀을 읽지 못했습니다: ' + e.message);
        }
      };
      reader.readAsArrayBuffer(file);
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

    // 수정 버튼: 해당 행을 편집 모드로 전환.
    el.querySelectorAll('[data-edit]').forEach((b) => {
      b.addEventListener('click', () => {
        App._editingEmpId = b.dataset.edit;
        App.renderAll();
      });
    });

    // 색 되돌리기(↺) 버튼: 색 선택기를 수정 전 저장돼 있던 직전 색으로 되돌린다.
    el.querySelectorAll('[data-resetcolor]').forEach((b) => {
      b.addEventListener('click', () => {
        const emp = App.state.employees.find((x) => x.id === b.dataset.resetcolor);
        const row = el.querySelector(`tr[data-row="${b.dataset.resetcolor}"]`);
        row.querySelector('.ed-color').value = empColor(emp);
      });
    });

    // 취소 버튼: 편집 모드 해제.
    el.querySelectorAll('[data-cancel]').forEach((b) => {
      b.addEventListener('click', () => {
        App._editingEmpId = null;
        App.renderAll();
      });
    });

    // 저장 버튼: 편집 중인 행의 입력값을 반영.
    el.querySelectorAll('[data-save]').forEach((b) => {
      b.addEventListener('click', () => {
        const emp = App.state.employees.find((x) => x.id === b.dataset.save);
        if (!emp) {
          return;
        }
        const row = el.querySelector(`tr[data-row="${emp.id}"]`);
        const name = row.querySelector('.ed-name').value.trim();
        const joinDate = row.querySelector('.ed-join').value;
        const initRaw = row.querySelector('.ed-init').value;
        const resign = row.querySelector('.ed-resign').value;
        if (!name || !joinDate) {
          alert('이름과 입사일을 입력하세요.');
          return;
        }
        emp.name = name;
        emp.joinDate = joinDate;
        emp.initialBalance = parseFloat(initRaw) || 0;
        emp.color = row.querySelector('.ed-color').value;
        emp.active = !resign;
        emp.resignDate = resign || undefined;
        App._editingEmpId = null;
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

  // 연차 사용 입력 화면.
  App.views.usage = function (el) {
    const emps = App.state.employees.filter((e) => e.active !== false);
    const options = emps.map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
    // 날짜 입력 기본값: 달력에서 넘어온 날짜가 있으면 그 날짜, 없으면 전역 연도 기준.
    const defDate = App._usageDate || ((App.year === new Date().getFullYear())
      ? L.todayStr(new Date())
      : (App.year + '-01-01'));
    App._usageDate = null; // 일회성 사용 후 초기화
    // 추가 직후 유지할 메모(연속 입력 편의).
    const defNote = App._usageNote || '';
    App._usageNote = null;
    // 달력에서 넘어온 경우 하이라이트할 기록(직원+날짜). 1회성으로 소비한다.
    const highlight = App._usageHighlight;
    App._usageHighlight = null;

    el.innerHTML = `
      <h2>연차 사용 입력</h2>
      <div class="row">
        <select id="u-emp">${options || '<option>직원 없음</option>'}</select>
        <input id="u-date" type="date" value="${defDate}" />
        <span class="note-wrap">
          <input id="u-note" placeholder="메모(선택)" value="${escapeHtml(defNote)}" />
          <button id="u-note-clear" class="note-clear" title="메모 지우기">×</button>
        </span>
        <span>일수:</span>
        <button class="action" data-days="1">1일</button>
        <button class="action" data-days="0.5">0.5일</button>
        <button class="action" data-days="0.25">0.25일</button>
      </div>
      <p id="u-balance"></p>
      <h3 id="u-records-title">사용 기록</h3>
      <table><thead><tr><th>날짜</th><th>일수</th><th>메모</th><th></th></tr></thead>
      <tbody id="u-records"></tbody></table>`;

    // 현재 선택된 직원의 사용 기록만 필터링해 목록을 그린다.
    function renderRecords() {
      const id = el.querySelector('#u-emp').value;
      const emp = App.state.employees.find((e) => e.id === id);
      const title = el.querySelector('#u-records-title');
      title.textContent = emp ? `${emp.name}님의 사용 기록` : '사용 기록';
      const list = App.state.usages
        .filter((u) => u.employeeId === id)
        .sort((a, b) => b.date.localeCompare(a.date));
      const body = el.querySelector('#u-records');
      body.innerHTML = list.length
        ? list.map((u) => {
            // 달력에서 선택해 넘어온 직원·날짜와 일치하면 하이라이트.
            const isHl = highlight && u.employeeId === highlight.empId && u.date === highlight.date;
            return `<tr class="${isHl ? 'hl-row' : ''}"><td>${u.date}</td><td>${u.days}</td>
            <td>${escapeHtml(u.note || '')}</td>
            <td><button class="action danger" data-delu="${u.id}">삭제</button></td></tr>`;
          }).join('')
        : '<tr><td colspan="4">기록 없음</td></tr>';
      // 하이라이트된 행이 있으면 화면에 보이도록 스크롤.
      const hlRow = body.querySelector('.hl-row');
      if (hlRow) {
        hlRow.scrollIntoView({ block: 'center', behavior: 'smooth' });
      }
      // 삭제 버튼 바인딩(목록이 다시 그려질 때마다).
      body.querySelectorAll('[data-delu]').forEach((b) => {
        b.addEventListener('click', () => {
          App.state.usages = App.state.usages.filter((u) => u.id !== b.dataset.delu);
          // 삭제 후 재렌더 시 현재 선택(직원·날짜·메모)이 초기화되지 않도록 보존.
          App._usagePreselect = el.querySelector('#u-emp').value;
          App._usageDate = el.querySelector('#u-date').value;
          App._usageNote = el.querySelector('#u-note').value;
          App.save();
          App.renderAll();
        });
      });
    }

    function showBalance() {
      const id = el.querySelector('#u-emp').value;
      const emp = App.state.employees.find((e) => e.id === id);
      const p = el.querySelector('#u-balance');
      if (!emp) { p.textContent = ''; return; }
      const date = el.querySelector('#u-date').value;
      const bal = L.balanceAtDate(emp, App.state.usages, date);
      p.textContent = `${emp.name}님의 ${date} 시점 잔여 연차: ${bal}일`;
    }
    // 대시보드 카드에서 넘어온 경우 해당 직원을 미리 선택.
    if (App._usagePreselect) {
      const sel = el.querySelector('#u-emp');
      if (sel && emps.some((e) => e.id === App._usagePreselect)) {
        sel.value = App._usagePreselect;
      }
      App._usagePreselect = null;
    }

    el.querySelector('#u-emp').addEventListener('change', () => {
      showBalance();
      renderRecords(); // 직원이 바뀌면 그 직원의 기록으로 갱신
    });
    el.querySelector('#u-date').addEventListener('change', showBalance);
    showBalance();
    renderRecords();

    // 메모 지우기(×) 버튼.
    el.querySelector('#u-note-clear').addEventListener('click', () => {
      const note = el.querySelector('#u-note');
      note.value = '';
      note.focus();
    });

    el.querySelectorAll('[data-days]').forEach((b) => {
      b.addEventListener('click', () => {
        const id = el.querySelector('#u-emp').value;
        const emp = App.state.employees.find((e) => e.id === id);
        if (!emp) { alert('직원을 먼저 등록/선택하세요.'); return; }
        const date = el.querySelector('#u-date').value;
        const days = parseFloat(b.dataset.days);
        const note = el.querySelector('#u-note').value.trim();
        // 같은 직원·같은 날짜의 기존 사용분 합계 + 이번 입력이 1일을 넘으면 막는다.
        const existing = App.state.usages
          .filter((u) => u.employeeId === id && u.date === date)
          .reduce((sum, u) => sum + u.days, 0);
        // 부동소수점 오차 보정 후 비교(예: 0.1+0.2).
        if (Math.round((existing + days) * 100) / 100 > 1) {
          alert(`${emp.name}님의 ${date} 연차 합계가 1일을 초과합니다.\n(현재 ${existing}일 + ${days}일)`);
          return;
        }
        App.state.usages.push({ id: App.uid(), employeeId: id, date, days, note });
        // 추가 후에도 같은 직원·날짜·메모를 유지(연속 입력 편의).
        App._usagePreselect = id;
        App._usageDate = date;
        App._usageNote = note;
        App.save();
        App.renderAll();
      });
    });
  };

  // 대시보드 카드 정렬 모드: 'excel'(엑셀/등록 순서) | 'name'(이름순).
  App.getDashSort = function () {
    return localStorage.getItem('dashSort') || 'excel';
  };

  // 대시보드 화면.
  App.views.dashboard = function (el) {
    const year = App.year;
    const sortMode = App.getDashSort();
    let emps = App.state.employees.filter((e) => e.active !== false);
    // 이름순 선택 시 이름 기준 한글 정렬(원본 배열은 건드리지 않도록 복사본 정렬).
    if (sortMode === 'name') {
      emps = emps.slice().sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    }
    // 잔여 기준일: 올해면 오늘, 그 외 연도면 해당 연도 말일.
    const refDate = (year === new Date().getFullYear())
      ? L.todayStr(new Date())
      : (year + '-12-31');

    const cards = emps.map((e) => {
      // 해당 연도 부여량 = 연시작잔액 + (입사해면 연말까지 적립)
      const start = L.yearStartBalance(e, App.state.usages, year);
      const accrual = L.isJoiningYear(e.joinDate, year)
        ? L.monthlyAccrual(e.joinDate, year + '-12-31') : 0;
      const granted = Math.round((start + accrual) * 100) / 100;
      const used = L.usageInRange(App.state.usages, e.id, year + '-01-01', (year + 1) + '-01-01');
      const bal = L.balanceAtDate(e, App.state.usages, refDate);
      const negClass = bal < 0 ? 'neg' : '';
      return `<div class="emp-card" data-emp="${e.id}" title="클릭하면 이 직원의 연차 사용 화면으로 이동">
        <h3>${escapeHtml(e.name)}</h3>
        <div class="num ${negClass}">${bal}</div>
        <div>부여 ${granted} · 사용 ${used}</div>
        <small>입사 ${e.joinDate}</small>
      </div>`;
    }).join('');

    const sortLabel = sortMode === 'name' ? '이름순' : '엑셀 순서';
    el.innerHTML = `
      <div style="display:flex; align-items:center; gap:16px; margin-bottom:20px;">
        <h2 style="margin:0;">${year}년 대시보드</h2>
        <div style="display:flex; align-items:center; gap:8px; font-size:13px; color:#666;">
          <span>정렬</span>
          <button class="action" id="dash-sort-toggle" title="정렬 순서 전환">${sortLabel}</button>
        </div>
      </div>
      <div class="card-grid">${cards || '직원을 등록하세요.'}</div>
      <div id="dash-calendar" style="margin-top:24px;"></div>`;

    // 정렬 토글 버튼 → 엑셀 순서 ↔ 이름순 번갈아 전환 후 재렌더.
    el.querySelector('#dash-sort-toggle').addEventListener('click', () => {
      const next = sortMode === 'name' ? 'excel' : 'name';
      localStorage.setItem('dashSort', next);
      App.renderAll();
    });

    // 카드 클릭 → 해당 직원 선택된 채 연차 사용 화면으로 이동.
    el.querySelectorAll('[data-emp]').forEach((card) => {
      card.addEventListener('click', () => {
        App._usagePreselect = card.dataset.emp;
        App.goToView('usage');
      });
    });

    // 달력을 대시보드 하단에 함께 표시한다(별도 탭 없이 재사용).
    App.views.calendar(el.querySelector('#dash-calendar'));
  };

  // 달력 태그 색 기본값(설정에서 변경 가능).
  // 신규(가져오기) 직원 기본 색상 — 처음 설정했던 보라색.
  const DEFAULT_COLOR = '#b234b2';

  // 기본 색상 팔레트(파스텔). 직원이 색을 지정하지 않았을 때 id로 자동 배정.
  const PALETTE = [
    '#f7c6c7', '#f9d9a7', '#f2ee9e', '#c9e8b8', '#b8e0e0', '#bcd4f0',
    '#cdc7f0', '#e6c7ec', '#f0c7dc', '#d9d2c5', '#a7e0c8', '#f0d0b0',
  ];

  // 직원 표시 색: 지정색(emp.color)이 있으면 사용, 없으면 id 해시로 팔레트에서 자동 배정.
  function empColor(emp) {
    if (emp && emp.color) {
      return emp.color;
    }
    const id = (emp && emp.id) ? emp.id : '';
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
      hash = (hash * 31 + id.charCodeAt(i)) & 0x7fffffff;
    }
    // 황금각(137)을 곱해 비슷한 id라도 팔레트에 골고루 분산.
    return PALETTE[(hash * 137) % PALETTE.length];
  }

  // 배경색 밝기에 따라 읽기 좋은 글자색(어두우면 흰색, 밝으면 진한색)을 반환.
  function textOn(bg) {
    if (typeof bg !== 'string' || bg[0] !== '#') {
      return '#333';
    }
    let hex = bg.slice(1);
    if (hex.length === 3) {
      hex = hex.split('').map((c) => c + c).join('');
    }
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    // 관용 휘도 공식(0~255). 밝으면 진한 글자, 어두우면 흰 글자.
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 150 ? '#333' : '#fff';
  }

  // 달력 화면(대시보드 하단에 임베드).
  App.views.calendar = function (el) {
    if (!App._calMonth) {
      // 로컬(KST) 기준 현재 연월을 초기화한다. toISOString()은 UTC 기준이라 자정 근처에 오차 발생 가능.
      App._calMonth = L.monthKey(new Date()); // YYYY-MM
    }
    const [y, m] = App._calMonth.split('-').map(Number);
    const startDow = new Date(y, m - 1, 1).getDay();
    const daysInMonth = new Date(y, m, 0).getDate();
    const todayS = L.todayStr(new Date());
    // 공휴일: 서버 API(공개 API+캐시) 우선, 로딩 전엔 내장 표로 즉시 표시.
    if (!App._holidayCache) {
      App._holidayCache = {};
    }
    if (!App._holidayFetched) {
      App._holidayFetched = {};
    }
    const holidays = App._holidayCache[y] || (window.Holidays ? window.Holidays.get(y) : {});
    // 기념일(공휴일 아님, 쉬지 않음) — 회색으로 표시.
    const commems = (window.Holidays && window.Holidays.commemorations) ? window.Holidays.commemorations(y) : {};
    if (!App._holidayFetched[y]) {
      App._holidayFetched[y] = true;
      fetch('/api/holidays?year=' + y)
        .then((r) => r.json())
        .then((map) => { App._holidayCache[y] = map; App.renderAll(); })
        .catch(() => { /* 실패 시 내장 표 유지 */ });
    }
    const empById = {};
    App.state.employees.forEach((e) => { empById[e.id] = e; });

    // 요일 헤더(일=빨강, 토=파랑).
    const dowNames = ['일', '월', '화', '수', '목', '금', '토'];
    const head = dowNames.map((nm, i) => {
      const cls = i === 0 ? 'sun' : (i === 6 ? 'sat' : '');
      return `<div class="cal-head ${cls}">${nm}</div>`;
    }).join('');

    let cells = '';
    for (let i = 0; i < startDow; i++) {
      cells += '<div class="cal-cell empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = new Date(y, m - 1, d).getDay();
      const holiday = holidays[dateStr];
      const commem = !holiday ? commems[dateStr] : null;
      // 날짜 숫자 색상: 공휴일/일요일=빨강, 토요일=파랑. (기념일은 빨강 아님)
      const dcls = (holiday || dow === 0) ? 'sun' : (dow === 6 ? 'sat' : '');
      const todayCls = (dateStr === todayS) ? ' today' : '';
      const holTag = holiday
        ? `<span class="cal-holiday">${escapeHtml(holiday)}</span>`
        : (commem ? `<span class="cal-commem">${escapeHtml(commem)}</span>` : '');
      // 같은 날 같은 직원의 사용분은 합산해 하나로 표시한다.
      const sumByEmp = {};
      App.state.usages.forEach((u) => {
        if (u.date === dateStr) {
          sumByEmp[u.employeeId] = (sumByEmp[u.employeeId] || 0) + u.days;
        }
      });
      const tags = Object.keys(sumByEmp).map((empId) => {
        const e = empById[empId];
        const nm = e ? e.name : '?';
        const total = Math.round(sumByEmp[empId] * 100) / 100;
        const bg = empColor(e || { id: empId });
        return `<span class="cal-use" style="background:${bg}; color:${textOn(bg)}" data-emp="${empId}" title="${escapeHtml(nm)}님의 연차 사용 탭으로 이동">${escapeHtml(nm)} ${total}</span>`;
      }).join('');
      cells += `<div class="cal-cell${todayCls}" data-date="${dateStr}" title="클릭하면 이 날짜로 연차 사용 입력"><span class="d ${dcls}">${d}</span>${holTag}${tags}</div>`;
    }

    // 달력을 지정 연월로 이동. 연도가 바뀌면 네비바 연도(App.year)도 동기화한다.
    function gotoCalMonth(monthKey) {
      App._calMonth = monthKey;
      const ny = Number(monthKey.split('-')[0]);
      if (App.year !== ny) {
        App.year = ny;
        updateYearLabel();
      }
      App.renderAll();
    }

    // 연도 드롭다운 범위: 기준연도·현재연도·선택연도를 모두 포함하고 앞뒤로 여유를 둔다.
    const nowY = new Date().getFullYear();
    const baseY = (App.state.settings && App.state.settings.baseFiscalYear) || nowY;
    const minY = Math.min(baseY, nowY, y) - 1;
    const maxY = Math.max(baseY, nowY, y) + 3;
    let yearOpts = '';
    for (let yy = minY; yy <= maxY; yy++) {
      yearOpts += `<option value="${yy}"${yy === y ? ' selected' : ''}>${yy}년</option>`;
    }
    let monthOpts = '';
    for (let mm2 = 1; mm2 <= 12; mm2++) {
      monthOpts += `<option value="${mm2}"${mm2 === m ? ' selected' : ''}>${mm2}월</option>`;
    }

    el.innerHTML = `
      <div class="cal-bar">
        <span class="cal-nav">
          <button class="year-btn" id="cal-prev" title="이전 달">‹</button>
          <span class="cal-period">
            <select class="cal-sel" id="cal-year" title="연도 선택">${yearOpts}</select>
            <select class="cal-sel" id="cal-month" title="월 선택">${monthOpts}</select>
          </span>
          <button class="year-btn" id="cal-next" title="다음 달">›</button>
          <button class="cal-today-btn" id="cal-today">오늘</button>
        </span>
      </div>
      <div class="cal-grid">
        ${head}
        ${cells}
      </div>`;

    el.querySelector('#cal-prev').addEventListener('click', () => {
      // 로컬 날짜 생성 후 L.monthKey로 포맷. toISOString() 대신 로컬 기준 사용.
      gotoCalMonth(L.monthKey(new Date(y, m - 2, 1)));
    });
    el.querySelector('#cal-next').addEventListener('click', () => {
      gotoCalMonth(L.monthKey(new Date(y, m, 1)));
    });
    el.querySelector('#cal-year').addEventListener('change', (ev) => {
      // 선택한 연도로 이동(월은 유지).
      gotoCalMonth(L.monthKey(new Date(Number(ev.target.value), m - 1, 1)));
    });
    el.querySelector('#cal-month').addEventListener('change', (ev) => {
      // 선택한 월로 이동(연도는 유지).
      gotoCalMonth(L.monthKey(new Date(y, Number(ev.target.value) - 1, 1)));
    });
    el.querySelector('#cal-today').addEventListener('click', () => {
      // 현재(오늘) 연월로 이동. 로컬 기준 monthKey 사용.
      gotoCalMonth(L.monthKey(new Date()));
    });

    // 날짜 클릭 → 그 날짜가 채워진 채 연차 사용 화면으로 이동.
    el.querySelectorAll('.cal-cell[data-date]').forEach((cell) => {
      cell.addEventListener('click', () => {
        App._usageDate = cell.dataset.date;
        App.goToView('usage');
      });
    });

    // 사람 라벨 클릭 → 해당 직원이 선택된 연차 사용 화면으로 이동.
    // 날짜 셀 클릭 핸들러가 중복 실행되지 않도록 이벤트 전파를 막는다.
    el.querySelectorAll('.cal-use[data-emp]').forEach((tag) => {
      tag.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const empId = tag.dataset.emp;
        const date = tag.closest('.cal-cell[data-date]').dataset.date;
        App._usagePreselect = empId;
        App._usageDate = date;
        // 이동 후 해당 직원의 그 날짜 기록을 하이라이트하도록 지정(1회성).
        App._usageHighlight = { empId, date };
        App.goToView('usage');
      });
    });
  };

  // 전역 연도 + 선택된 반기로 매트릭스 생성.
  App.buildCurrentMatrix = function () {
    const year = App.year;
    const half = App._reportHalf || (new Date().getMonth() < 6 ? 1 : 2);
    const asOfMonth = half === 1 ? 6 : 12;
    const emps = App.state.employees;
    return { matrix: L.buildReportMatrix(emps, App.state.usages, year, asOfMonth), year, half, asOfMonth };
  };

  // 보고서 화면.
  App.views.report = function (el) {
    App._reportHalf = App._reportHalf || (new Date().getMonth() < 6 ? 1 : 2);
    const { matrix, year, half, asOfMonth } = App.buildCurrentMatrix();
    const cols = matrix.columns;
    const yy = year % 100;
    // 기준일 라벨: "6/30" 형태(기준월 말일).
    const lastDay = new Date(year, asOfMonth, 0).getDate();
    const asOfLabel = asOfMonth + '/' + lastDay;

    // 열별 배경색: 직원 지정색(empColor)을 사용해 대시보드와 색을 통일.
    const empById = {};
    App.state.employees.forEach((e) => { empById[e.id] = e; });
    const colColors = cols.map((c) => empColor(empById[c.id]));
    // 값 두 자리 소수 표기(빈 값은 공백 유지).
    const fmt = (v) => (v || v === 0 ? Number(v).toFixed(2) : '');
    // 열 배경색이 적용된 데이터 셀.
    const colorTd = (i, v, cls) => {
      const bg = colColors[i];
      return `<td class="${cls || ''}" style="background:${bg}; color:${textOn(bg)}">${v}</td>`;
    };

    // 헤더 3행: 입사일 / 이름 / 근속(기준)
    // joinDate는 prompt()로 자유 입력 가능하므로 XSS 방지를 위해 이스케이프 처리.
    const headJoin = cols.map((c) => `<th>${escapeHtml(c.joinDate)}</th>`).join('');
    const headName = cols.map((c) => `<th>${escapeHtml(c.name)}</th>`).join('');
    const headTenure = cols.map((c) => `<th>${escapeHtml(c.tenureLabelKor)}</th>`).join('');

    // 보유 연차(1행) — 열 색 + 굵게.
    const grantTds = matrix.granted.map((v, i) => colorTd(i, fmt(v), 'bal')).join('');
    // 월별 사용분(12행) — 열 색.
    let monthRows = '';
    for (let i = 0; i < 12; i++) {
      const r = matrix.monthRows[i];
      const tds = r.usages.map((v, ci) => colorTd(ci, fmt(v), 'use')).join('');
      monthRows += `<tr><th>${yy}.${String(r.month).padStart(2, '0')}월 사용분</th>${tds}</tr>`;
    }
    // 사용 누계 / 잔여 연차(흰 배경).
    const usedTds = matrix.usedTotal.map((v) => `<td>${fmt(v)}</td>`).join('');
    const remainTds = matrix.yearEnd.map((v) => `<td class="bal">${fmt(v)}</td>`).join('');

    el.innerHTML = `
      <h2>${year}년 ${asOfMonth}월말 기준 연/월차 내역</h2>
      <div class="row">
        <span class="half-radio">
          <label><input type="radio" name="rp-half" value="1" ${half === 1 ? 'checked' : ''} />상반기(6월말)</label>
          <label><input type="radio" name="rp-half" value="2" ${half === 2 ? 'checked' : ''} />하반기(12월말)</label>
        </span>
        <button class="action" id="rp-excel">엑셀 내보내기</button>
        <span>작성일: ${L.todayStr(new Date())}</span>
      </div>
      <div style="overflow:auto">
        <table class="report-table">
          <thead>
            <tr><th>입사일</th>${headJoin}</tr>
            <tr><th>이름</th>${headName}</tr>
            <tr><th>${asOfLabel}기준</th>${headTenure}</tr>
          </thead>
          <tbody>
            <tr><th>${year}년 보유 연차</th>${grantTds}</tr>
            ${monthRows}
            <tr><th>사용 누계</th>${usedTds}</tr>
            <tr><th>잔여 연차</th>${remainTds}</tr>
          </tbody>
        </table>
      </div>`;

    el.querySelectorAll('input[name="rp-half"]').forEach((r) => {
      r.addEventListener('change', (ev) => {
        App._reportHalf = parseInt(ev.target.value, 10);
        App.renderAll();
      });
    });
    el.querySelector('#rp-excel').addEventListener('click', () => {
      App.exportReportExcel(); // Task 17에서 정의
    });
  };

  // 보고서를 ExcelJS로 .xlsx 생성·다운로드.
  App.exportReportExcel = async function () {
    const { matrix, year, asOfMonth } = App.buildCurrentMatrix();
    const cols = matrix.columns;
    const yy = year % 100;
    const nCols = cols.length;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('연월차내역');

    const thin = { style: 'thin', color: { argb: 'FFAAAAAA' } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };
    const headFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF1F6' } };
    const center = { horizontal: 'center', vertical: 'middle' };
    const numFmt = '0.00';

    // 기준일 라벨 및 열별 색상(직원 지정색).
    const lastDay = new Date(year, asOfMonth, 0).getDate();
    const asOfLabel = asOfMonth + '/' + lastDay;
    const empById = {};
    App.state.employees.forEach((e) => { empById[e.id] = e; });
    // '#rrggbb' 또는 '#rgb' → ExcelJS ARGB('FFRRGGBB').
    const toArgb = (hex) => {
      let h = String(hex || '').replace('#', '');
      if (h.length === 3) { h = h.split('').map((ch) => ch + ch).join(''); }
      return 'FF' + h.toUpperCase();
    };
    const colColors = cols.map((c) => empColor(empById[c.id]));
    const colFills = colColors.map((c) => ({ type: 'pattern', pattern: 'solid', fgColor: { argb: toArgb(c) } }));
    const colFonts = colColors.map((c) => ({ argb: toArgb(textOn(c)) }));

    // 1행: 제목(병합)
    const titleRow = ws.addRow([`${year}년 ${asOfMonth}월말 기준 연/월차 내역`]);
    ws.mergeCells(1, 1, 1, nCols + 1);
    titleRow.getCell(1).font = { bold: true, size: 14 };
    titleRow.getCell(1).alignment = center;

    // 2행: 작성일(오른쪽)
    const dateRow = ws.addRow(['작성일: ' + L.todayStr(new Date())]);
    ws.mergeCells(2, 1, 2, nCols + 1);
    dateRow.getCell(1).alignment = { horizontal: 'right' };

    // 헤더 3행: 입사일 / 이름 / 근속(기준)
    const r3 = ws.addRow(['입사일', ...cols.map((c) => c.joinDate)]);
    const r4 = ws.addRow(['이름', ...cols.map((c) => c.name)]);
    const r5 = ws.addRow([`${asOfLabel}기준`, ...cols.map((c) => c.tenureLabelKor)]);
    [r3, r4, r5].forEach((row) => {
      row.eachCell((cell) => {
        cell.border = border;
        cell.fill = headFill;
        cell.alignment = center;
        cell.font = { bold: true };
      });
    });

    // 데이터 셀(2열~)에 열 색상·폰트·서식을 적용하는 헬퍼.
    const styleDataCell = (cell, colIdx, opts) => {
      cell.border = border;
      cell.alignment = center;
      cell.fill = colFills[colIdx];
      cell.font = { color: colFonts[colIdx], bold: !!(opts && opts.bold) };
      cell.numFmt = numFmt;
    };
    // 1열(라벨) 스타일.
    const styleLabelCell = (cell, opts) => {
      cell.border = border;
      cell.alignment = center;
      cell.font = { bold: !!(opts && opts.bold) };
    };

    // 보유 연차 행(열 색 + 굵게).
    const grantRow = ws.addRow([`${year}년 보유 연차`, ...matrix.granted]);
    styleLabelCell(grantRow.getCell(1), { bold: true });
    matrix.granted.forEach((v, i) => styleDataCell(grantRow.getCell(i + 2), i, { bold: true }));

    // 월별 사용분(12행, 열 색).
    for (let i = 0; i < 12; i++) {
      const mr = matrix.monthRows[i];
      const useRow = ws.addRow([`${yy}.${String(mr.month).padStart(2, '0')}월 사용분`,
        ...mr.usages.map((v) => (v ? v : null))]);
      styleLabelCell(useRow.getCell(1));
      mr.usages.forEach((v, ci) => styleDataCell(useRow.getCell(ci + 2), ci));
    }

    // 사용 누계 행(흰 배경).
    const usedRow = ws.addRow(['사용 누계', ...matrix.usedTotal]);
    usedRow.eachCell((cell, cn) => {
      cell.border = border; cell.alignment = center;
      if (cn > 1) { cell.numFmt = numFmt; }
    });

    // 잔여 연차 행(흰 배경 + 굵게).
    const remainRow = ws.addRow(['잔여 연차', ...matrix.yearEnd]);
    remainRow.eachCell((cell, cn) => {
      cell.border = border; cell.alignment = center; cell.font = { bold: true };
      if (cn > 1) { cell.numFmt = numFmt; }
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
    // 일부 브라우저(파이어폭스 등)는 DOM에 붙지 않은 앵커의 클릭을 무시하므로 잠시 추가한다.
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  };

  // 퇴사 정산 화면.
  App.views.settlement = function (el) {
    const options = App.state.employees
      .map((e) => `<option value="${e.id}">${escapeHtml(e.name)}</option>`).join('');
    // 정산 기준일 기본값: 전역 연도가 올해면 오늘, 그 외 연도면 해당 연도 말일.
    const defDate = (App.year === new Date().getFullYear())
      ? L.todayStr(new Date())
      : (App.year + '-12-31');
    el.innerHTML = `
      <h2>퇴사 정산 (입사일 기준 vs 회계연도 기준)</h2>
      <div class="row">
        <select id="st-emp">${options || '<option>직원 없음</option>'}</select>
        <input id="st-date" type="date" value="${defDate}" />
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

  window.App = App;

  window.addEventListener('DOMContentLoaded', async () => {
    bindTabs();
    bindYearNav();
    await App.load();
    App.renderAll();
  });
})();
