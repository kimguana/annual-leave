// 개발자 라이브 리로드: public/ 파일이 바뀌면 자동으로 새로고침한다.
// 끄고 싶으면 index.html에서 이 스크립트 태그를 제거하면 된다.
(function () {
  'use strict';

  let baseline = null;

  // 서버의 파일 최신 수정시각을 확인해 변경되면 새로고침.
  async function check() {
    try {
      const res = await fetch('/api/version', { cache: 'no-store' });
      const data = await res.json();
      if (baseline === null) {
        baseline = data.v;
        return;
      }
      if (data.v !== baseline) {
        location.reload();
      }
    } catch (e) {
      // 서버 재시작 중 등 일시적 오류는 무시.
    }
  }

  check();
  setInterval(check, 1000);
  console.log('[dev] 라이브 리로드 활성화 — public/ 변경 시 자동 새로고침');
})();
