/* =====================================================================
 *  app.js — SPA 컨트롤러
 *  화면: home → intake → room(탐지) → priority → sbar → reflection → result
 *        professor(대시보드)
 * ===================================================================== */
(function () {
  'use strict';
  const app = document.getElementById('app');
  const toastEl = document.getElementById('toast');

  const S = {
    cases: [],
    caseId: null,
    caseData: null,
    session: null,
    room: null,
    currentObject: null,
  };

  /* ---------------- 유틸 ---------------- */
  function toast(msg, kind = '') {
    toastEl.textContent = msg;
    toastEl.className = `toast show ${kind}`;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (toastEl.className = 'toast'), 2200);
  }
  const esc = (s) => (s == null ? '' : String(s).replace(/[&<>"]/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])));
  /* ---------------- 저장 상태 표시 ----------------
   * 학생이 "내가 쓴 내용이 서버에 저장되었는지"를 화면에서 바로 확인할 수 있게 한다. */
  const saveStateHTML = (id) =>
    `<div class="save-state" id="${id}" data-state="idle"><span class="save-dot"></span><span class="save-text">아직 저장되지 않음</span></div>`;

  const clockKR = (iso) => {
    const d = iso ? new Date(iso) : new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  function setSaveState(el, state, text) {
    if (!el) return;
    el.dataset.state = state;
    const label = el.querySelector('.save-text');
    if (label) label.textContent = text;
  }
  const markSaving = (el) => setSaveState(el, 'saving', '저장 중…');
  const markSaved = (el, iso) => setSaveState(el, 'saved', `저장됨 ✓ ${clockKR(iso)}`);
  const markDirty = (el) => setSaveState(el, 'dirty', '작성 중 — 아직 저장 안 됨');
  const markError = (el, msg) => setSaveState(el, 'error', `저장 실패: ${msg || '네트워크 오류'}`);

  /* 서버의 최신 세션으로 갱신(다른 조원이 저장한 내용을 덮어쓰지 않도록) */
  async function refreshSession() {
    try { S.session = await API.getSession(S.session.id); }
    catch (e) { /* 네트워크 실패 시 기존 화면 상태를 유지 */ }
    return S.session;
  }

  /* ---------------- 교수자 미리보기 ----------------
   * 미리보기 세션은 학생 성적이 아니므로 채점 목록·내보내기에서 제외된다(서버에서 처리). */
  const PREVIEW_CLASS = '미리보기';
  const isPreview = () => S.session?.className === PREVIEW_CLASS;
  const previewBadge = () => (isPreview()
    ? '<span class="preview-chip">교수자 미리보기 · 채점에 반영되지 않음</span>' : '');

  /* 실습 도중 언제든 빠져나가기 — 작성한 내용은 이미 저장되어 있다. */
  function exitBarHTML(backId, backLabel) {
    return `<div class="step-top">
      <a class="back" id="${backId}">${backLabel}</a>
      <button class="btn tiny ghost" id="exitNow">나가기 · 사례 선택으로</button>
    </div>`;
  }
  function bindExit() {
    app.querySelector('#exitNow')?.addEventListener('click', async () => {
      if (!isPreview() && !window.confirm('실습을 중단하고 사례 선택 화면으로 나갈까요?\n\n지금까지 작성한 내용은 저장되어 있으며, 나중에 이어서 할 수 있습니다.')) return;
      viewHome();
    });
  }

  const vitalsRow = (v) => {
    const items = [];
    if (v.BP) items.push(['혈압', v.BP + ' mmHg']);
    if (v.HR) items.push(['맥박', v.HR + ' 회/분']);
    if (v.RR) items.push(['호흡', v.RR + ' 회/분', v.RR <= 10 || v.RR >= 26 ? 'warn' : '']);
    if (v.SpO2) items.push(['SpO₂', v.SpO2 + ' %', v.SpO2 < 92 ? 'warn' : '']);
    if (v.T) items.push(['체온', v.T + ' ℃', v.T >= 38 ? 'warn' : '']);
    if (v.NRS != null) items.push(['통증', 'NRS ' + v.NRS]);
    if (v.glucose != null) items.push(['혈당', v.glucose + ' mg/dL', v.glucose < 70 ? 'warn' : '']);
    return items.map(([k, val, w]) =>
      `<span class="vital ${w || ''}"><b>${k}</b>${esc(val)}</span>`).join('');
  };

  /* localStorage 로 진행 중 세션 복원 */
  const LS = 'roe_session';
  const saveLocal = () => S.session && localStorage.setItem(LS, S.session.id);

  function viewLogin(mode = 'student') {
    document.body.classList.remove('in-room');
    const admin = mode === 'admin';
    app.innerHTML = `
      <div class="page-narrow auth-page">
        <div class="panel auth-panel">
          <div class="eyebrow"><span class="dot-ico">◆</span> ${admin ? 'INSTRUCTOR' : 'STUDENT'} ACCESS</div>
          <h2>${admin ? '교수자 로그인' : '학생 로그인'}</h2>
          <p class="muted">${admin ? '총괄관리자 또는 승인된 교수자 Google 계정으로 로그인하세요.' : '학교 Google 계정으로 안전하게 로그인하세요.'}</p>
          <button class="btn google lg full" id="googleLogin"><span class="google-g">G</span> ${admin ? '교수자 계정으로 로그인' : 'Google 계정으로 계속하기'}</button>
          ${admin ? '<p class="auth-note">신규 교수자는 로그인 후 총괄관리자에게 권한을 신청합니다.</p>' : `
          <p class="auth-note">로그인 후 이름·학번·학년·지도교수·분반을 등록합니다.</p>`}
        </div>
      </div>`;
    app.querySelector('#googleLogin').addEventListener('click', () => API.loginWithGoogle(admin ? 'admin' : 'student').catch((e) => toast(e.message || 'Google 로그인 실패', 'warn')));
  }

  function profileComplete(profile) {
    return !!(profile?.full_name && profile?.student_number && profile?.grade && profile?.class_name && profile?.faculty_user_id);
  }

  async function viewProfileSetup() {
    const profile = API.user()?.profile || {};
    let routes = [];
    try { routes = (await API.facultyRoutes()).filter((r) => r.classes?.length); }
    catch (e) { toast(e.message || '교수자 목록을 불러오지 못했습니다.', 'warn'); }
    app.innerHTML = `<div class="page-narrow auth-page"><div class="panel auth-panel">
      <div class="eyebrow"><span class="dot-ico">◆</span> STUDENT ROUTE</div>
      <h2>학생 정보 및 분반 선택</h2><p class="muted">분반을 선택하면 해당 분반의 지도교수가 자동으로 배정됩니다.</p>
      <div class="form-grid">
        <label>이름<input id="profileName" autocomplete="name" value="${esc(profile.full_name || '')}" /></label>
        <label>학번<input id="profileNumber" inputmode="numeric" placeholder="예: 23801001" value="${esc(profile.student_number || '')}" /></label>
        <label>학년<select id="profileGrade"><option value="">선택</option>${[1,2,3,4].map((g) => `<option value="${g}" ${Number(profile.grade)===g?'selected':''}>${g}학년</option>`).join('')}</select></label>
        <label>분반<select id="profileClass"><option value="">선택</option>${routes.flatMap((r) => r.classes.map((c) => `<option value="${c}" ${profile.class_name===c?'selected':''}>${c} · ${esc(r.full_name || r.email)} 교수</option>`)).join('')}</select></label>
      </div><button class="btn primary lg full" id="saveProfile">저장하고 승인 요청</button>
      ${routes.length ? '' : '<p class="auth-note">현재 분반이 배정된 교수자가 없습니다. 총괄관리자에게 문의하세요.</p>'}
    </div></div>`;
    const classSelect = app.querySelector('#profileClass');
    app.querySelector('#saveProfile').addEventListener('click', async () => {
      try {
        const route = routes.find((r) => r.classes.includes(classSelect.value));
        await API.updateProfile({ fullName: app.querySelector('#profileName').value.trim(), studentNumber: app.querySelector('#profileNumber').value.trim(), grade: app.querySelector('#profileGrade').value, facultyUserId: route?.user_id || '', className: classSelect.value });
        await API.me(); toast('학생 정보와 담당 교수가 저장되었습니다.', 'ok'); viewHome();
      } catch (e) { toast(e.message || '학생 정보 저장 실패', 'warn'); }
    });
  }

  function viewFacultyPending(request) {
    app.innerHTML = `<div class="page-narrow auth-page"><div class="panel auth-panel">
      <div class="eyebrow"><span class="dot-ico">◆</span> FACULTY ACCESS</div>
      <h2>교수자 승인 대기</h2>
      <p class="muted">총괄관리자에게 교수자 권한 신청을 전달했습니다. 승인 후 로그아웃하고 교수자 모드로 다시 로그인해 주세요.</p>
      <div class="patient-box"><b>${esc(API.user()?.email || '')}</b><p class="muted">신청 상태: ${esc(request?.status || 'pending')}</p></div>
      <button class="btn ghost full" id="pendingOut">로그아웃</button>
    </div></div>`;
    app.querySelector('#pendingOut').addEventListener('click', async () => { await API.logout(); refreshAdminNav(); viewLogin('student'); });
  }

  function viewAdminAccountMismatch() {
    const email = API.user()?.email || '';
    app.innerHTML = `<div class="page-narrow auth-page"><div class="panel auth-panel">
      <div class="eyebrow"><span class="dot-ico">◆</span> INSTRUCTOR ACCESS</div>
      <h2>교수자 권한이 필요합니다</h2>
      <p class="muted">현재 Google 계정은 아직 교수자로 승인되지 않았습니다. 권한을 신청하거나 다른 교수자 계정으로 로그인해 주세요.</p>
      <div class="patient-box"><b>${esc(email)}</b><p class="muted">현재 로그인된 계정</p></div>
      <button class="btn primary lg full" id="switchAdminAccount">다른 Google 계정으로 다시 로그인</button>
      <button class="btn ghost full" id="requestFacultyAccess">교수자 권한 신청</button>
    </div></div>`;
    app.querySelector('#switchAdminAccount').addEventListener('click', async () => {
      try {
        await API.logout();
        await API.loginWithGoogle('admin');
      } catch (e) { toast(e.message || 'Google 계정 전환 실패', 'warn'); }
    });
    app.querySelector('#requestFacultyAccess').addEventListener('click', async () => {
      try { viewFacultyPending(await API.requestFacultyAccess()); }
      catch (e) { toast(e.message || '교수자 권한 신청 실패', 'warn'); }
    });
  }

  function viewStudentPending(profile) {
    const rejected = profile?.approval_status === 'rejected';
    app.innerHTML = `<div class="page-narrow auth-page"><div class="panel auth-panel">
      <div class="eyebrow"><span class="dot-ico">◆</span> STUDENT APPROVAL</div>
      <h2>${rejected ? '학생 사용 신청이 거절되었습니다' : '학생 사용 승인 대기 중'}</h2>
      <p class="muted">${rejected ? '입력한 정보를 확인한 뒤 담당 교수자에게 문의해 주세요.' : '학생 정보가 제출되었습니다. 담당 교수자가 승인하면 사례 선택과 병실 입장이 가능합니다.'}</p>
      <div class="patient-box">
        <b>${esc(profile?.full_name || '')} · ${esc(profile?.student_number || '')}</b>
        <p class="muted">${esc(profile?.grade || '')}학년 · ${esc(profile?.class_name || '')} · 상태: ${rejected ? '거절' : '승인 대기'}</p>
      </div>
      <button class="btn ghost full" id="studentPendingOut">로그아웃</button>
    </div></div>`;
    app.querySelector('#studentPendingOut').addEventListener('click', async () => { await API.logout(); refreshAdminNav(); viewLogin('student'); });
  }

  /* ================= 화면: 홈(사례 선택) ================= */
  async function viewHome() {
    if (!API.isLoggedIn()) return viewLogin('student');
    if (!API.isInstructor() && !profileComplete(API.user()?.profile)) return viewProfileSetup();
    if (!API.isInstructor() && API.user()?.profile?.approval_status !== 'approved') return viewStudentPending(API.user()?.profile);
    document.body.classList.remove('in-room');
    S.cases = await API.listCases();
    const themeName = { surgical: '수술·낙상', sepsis: '패혈증·격리', stroke: '뇌졸중·연하', diabetes: '당뇨·투약' };
    app.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <div class="eyebrow"><span class="dot-ico">◆</span> KYUNGMIN UNIVERSITY · 4 CASES · 2.5D VR</div>
          <h1>병실로 들어가 <span>숨은 환자안전 오류</span>를 찾으세요</h1>
          <p>조별로 병실을 관찰해 오류를 기록하고, 즉시 위해가 될 상위 5개를 우선순위화한 뒤 SBAR로 보고합니다.
             총 4개 사례 · 사례당 10개 오류 · 100점 루브릭 자동/수동 채점.</p>
          ${API.isInstructor()
            ? `<button class="btn primary" id="goGrade">학생 작성 내용 보기 · 채점하기 →</button>
               <p class="hero-hint">담당 분반 조별로 오류 기록·우선순위·SBAR·성찰을 확인하고 점수를 입력합니다.</p>`
            : `<button class="btn ghost" id="editStudentProfile">내 정보·분반 변경</button>`}
        </div>
      </section>
      <div class="case-grid">
        ${S.cases.map((c, i) => `
          <button class="case-card theme-${c.theme}" data-case="${c.id}">
            <div class="case-head">
              <div class="case-num">${String(i + 1).padStart(2, '0')}</div>
              <div class="case-tag">${themeName[c.theme] || ''}</div>
            </div>
            <h3>${esc(c.title)}</h3>
            <p class="case-sub">${esc(c.subtitle || '')}</p>
            <p class="case-summary">${esc(c.summary)}</p>
            <div class="case-foot">
              <span>오류 ${c.errorCount} · 고위험 ${c.highRiskCount}</span>
              <span class="case-arrow">→</span>
            </div>
          </button>`).join('')}
      </div>`;
    app.querySelectorAll('[data-case]').forEach((b) =>
      b.addEventListener('click', () => viewIntake(b.dataset.case)));
    app.querySelector('#editStudentProfile')?.addEventListener('click', viewProfileSetup);
    app.querySelector('#goGrade')?.addEventListener('click', () => viewProfessor());
  }

  /* ================= 화면: 조 정보 입력 ================= */
  async function viewIntake(caseId) {
    S.caseId = caseId;
    S.caseData = await API.getCase(caseId);
    const c = S.caseData;
    const profile = API.user()?.profile || {};
    const instructor = API.isInstructor();
    // 교수자·관리자는 조 정보(분반·조이름·조원)를 입력하지 않고 바로 입장한다.
    const routes = instructor ? [] : (await API.facultyRoutes()).filter((r) => r.classes?.length);
    // 같은 사례를 다시 열면 새 기록을 만들지 않고 이어서 할 수 있게 기존 기록을 보여 준다.
    const statusRank = (s) => ({ scored: 3, reporting: 2 }[s.status] || (s.hasContent ? 1 : 0));
    const mine = instructor ? [] : (await API.mySessions(caseId).catch(() => []))
      .sort((a, b) => statusRank(b) - statusRank(a) || String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 3);
    const resumeLabel = { exploring: '작성 중', reporting: '제출 완료', scored: '채점 완료' };
    app.innerHTML = `
      <div class="page-narrow">
        <a class="back" data-route="home">← 사례 선택으로</a>
        <div class="panel">
          <div class="case-tag big">CASE ${c.id}</div>
          <h2>${esc(c.title)}</h2>
          <p class="muted">${esc(c.subtitle)}</p>
          <div class="patient-box">
            <h4>대상자 상황</h4>
            <p>${esc(c.patient.summary)}</p>
            <div class="vitals">${vitalsRow(c.patient.vitals)}</div>
            <p class="vital-note">${esc(c.patient.vitals.note || '')}</p>
            <h4>주요 처방/기록</h4>
            <ul class="orders">${c.patient.orders.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
            <h4>관찰 초점</h4>
            <p class="muted">${esc(c.patient.focus)}</p>
          </div>
          ${instructor ? `
            <p class="preview-note">교수자 미리보기로 입장합니다. 조 정보를 입력할 필요가 없으며,
              여기서 만든 기록은 학생 채점 목록에 포함되지 않습니다.</p>
          ` : `
            <h4>조 정보</h4>
            <div class="form-grid">
              <label>분반 <select id="f-class"><option value="">선택</option>${routes.flatMap((r) => r.classes.map((name) => `<option value="${name}" ${profile.class_name===name?'selected':''}>${name} · ${esc(r.full_name || r.email)} 교수</option>`)).join('')}</select></label>
              <label>조 이름 <input id="f-team" placeholder="예: 3조" /></label>
              <label class="full">조원(쉼표로 구분) <input id="f-members" placeholder="홍길동, 김간호, ..." value="${esc(profile.full_name || '')}" /></label>
            </div>
          `}
          ${mine.length ? `<div class="resume-box">
            <h4>이전에 하던 기록이 있습니다</h4>
            <p class="muted">새로 시작하지 말고 이어서 하세요. 교수님은 학생별 대표 기록 1건으로 채점합니다.</p>
            ${mine.map((s) => `<div class="resume-row">
              <span><b>${esc(resumeLabel[s.status] || s.status)}</b> · ${esc(s.className)} ${esc(s.teamName || '')} · 오류 기록 ${s.findings}건 · 마지막 저장 ${esc(new Date(s.updatedAt || s.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }))}</span>
              <button class="btn ${s === mine[0] ? 'primary' : 'ghost'}" data-resume="${s.id}">${s.status === 'exploring' ? '이어서 하기 →' : '결과 보기 →'}</button>
            </div>`).join('')}
          </div>` : ''}
          <button class="btn ${mine.length ? 'ghost' : 'primary'} lg" id="startBtn">${instructor ? '병실 입장(미리보기) →' : (mine.length ? '새 기록으로 처음부터 시작' : '병실 입장 →')}</button>
        </div>
      </div>`;
    app.querySelector('[data-route="home"]').addEventListener('click', viewHome);
    app.querySelectorAll('[data-resume]').forEach((b) => b.addEventListener('click', async () => {
      b.disabled = true;
      try {
        S.session = await API.getSession(b.dataset.resume);
        saveLocal();
        if (S.session.status === 'exploring') viewRoom(); else viewResult();
      } catch (e) { b.disabled = false; toast(e.message || '기록을 불러오지 못했습니다.', 'warn'); }
    }));
    app.querySelector('#startBtn').addEventListener('click', async () => {
      const btn = app.querySelector('#startBtn');
      if (mine.some((s) => s.status !== 'exploring' || s.findings > 0)
        && !window.confirm('이미 이 사례에 작성한 기록이 있습니다.\n새로 시작하면 별도의 빈 기록이 만들어집니다. 정말 처음부터 시작할까요?')) return;
      btn.disabled = true;
      try {
        let payload = { caseId };
        if (!instructor) {
          const className = app.querySelector('#f-class').value;
          if (!className) { btn.disabled = false; return toast('분반을 선택하세요.', 'warn'); }
          payload = {
            caseId,
            className,
            teamName: app.querySelector('#f-team').value.trim(),
            members: app.querySelector('#f-members').value.split(',').map((s) => s.trim()).filter(Boolean),
          };
        }
        S.session = await API.createSession(payload);
        if (!instructor) await API.me(); // 학생만 분반·지도교수 정보가 갱신된다
        saveLocal();
        viewRoom();
      } catch (e) {
        btn.disabled = false;
        toast(e.message || '병실 입장 준비 실패', 'warn');
      }
    });
  }

  /* ================= 화면: 병실 탐지(2.5D 룸) ================= */
  function findingsByObject() {
    const map = {};
    (S.session.findings || []).forEach((f) => {
      map[f.objectId] = map[f.objectId] || { inspected: true, flaggedCount: 0 };
      if (f.flagged) map[f.objectId].flaggedCount++;
    });
    // 열어본(inspected) 오브젝트도 표시
    (S._inspected || []).forEach((id) => { map[id] = map[id] || { inspected: true, flaggedCount: 0 }; });
    return map;
  }

  function viewRoom() {
    S._inspected = S._inspected || [];
    S.practice = false;             // 새 병실 진입 시 연습 힌트 초기화(사례별 정답 재로드 보장)
    document.body.classList.add('in-room');
    const c = S.caseData;
    app.innerHTML = `
      <div class="vr-wrap">
        <div id="room"></div>
      </div>
      <div id="inspectModal" class="modal-back"></div>`;

    S.room = new Room(document.getElementById('room'), {
      meta: { caseId: c.id, title: c.title, subtitle: c.subtitle, count: c.objects.length, preview: isPreview() },
      onSelect: openInspect,
      onInfo: openCaseInfo,
      onList: openFindingsList,
      onFinish: viewPriority,
      onExit: () => {
        // 병실에서 나가기 — 기록은 이미 저장되어 있으므로 잃는 내용이 없다.
        if (!isPreview() && !window.confirm('병실에서 나가 사례 선택 화면으로 갈까요?\n\n기록한 오류는 저장되어 있으며, 나중에 이어서 할 수 있습니다.')) return viewRoom();
        viewHome();
      },
      onPractice: togglePractice,
      getState: findingsByObject,
    });
    S.room.render(c.objects);
  }

  /* 연습(힌트) 모드 — 마커 클릭 시 실제 오류를 팝업으로 공개(학습용) */
  async function togglePractice() {
    S.practice = !S.practice;
    // 현재 사례의 정답을 확실히 로드(사례가 바뀌면 재요청)
    if (S.practice && (!S.answers || S.answers.id !== S.caseId)) {
      try { S.answers = await API.getAnswers(S.caseId); }
      catch (e) { S.answers = null; toast('힌트 정보를 불러오지 못했습니다', 'warn'); }
    }
    toast(S.practice ? '연습 힌트 ON — 마커를 누르면 오류가 공개됩니다' : '연습 힌트 OFF', S.practice ? 'ok' : '');
    return S.practice;
  }
  function errorInfoFor(objectId) {
    if (!S.answers || S.answers.id !== S.caseId || !S.answers.objects) return [];
    const obj = S.answers.objects.find((o) => o.id === objectId);   // answers 에는 오브젝트별 오류코드가 포함됨
    if (!obj || !obj.errors) return [];
    return obj.errors.map((code) => S.answers.errors.find((e) => e.code === code)).filter(Boolean);
  }

  /* 사례정보 모달 */
  function openCaseInfo() {
    const c = S.caseData;
    const modal = document.getElementById('inspectModal');
    modal.innerHTML = `
      <div class="modal">
        <button class="modal-x" id="mx">✕</button>
        <div class="case-tag big">CASE ${c.id}</div>
        <h3>${esc(c.title)}</h3>
        <div class="patient-box">
          <h4>대상자 상황</h4><p>${esc(c.patient.summary)}</p>
          <div class="vitals">${vitalsRow(c.patient.vitals)}</div>
          <p class="vital-note">${esc(c.patient.vitals.note || '')}</p>
          <h4>주요 처방/기록</h4>
          <ul class="orders">${c.patient.orders.map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
          <h4>관찰 초점</h4><p class="muted">${esc(c.patient.focus)}</p>
        </div>
        <div class="modal-actions"><button class="btn primary" id="close2">닫기</button></div>
      </div>`;
    modal.classList.add('open');
    const close = () => modal.classList.remove('open');
    modal.querySelector('#mx').onclick = close;
    modal.querySelector('#close2').onclick = close;
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  }

  /* ---- 오브젝트 점검 모달 ---- */
  function objFindings(objectId) {
    return (S.session.findings || []).filter((f) => f.objectId === objectId);
  }
  async function openInspect(objectId) {
    const obj = S.caseData.objects.find((o) => o.id === objectId);
    if (!S._inspected.includes(objectId)) S._inspected.push(objectId);
    S.currentObject = objectId;
    const existing = objFindings(objectId);
    const hints = S.practice ? errorInfoFor(objectId) : [];
    const modal = document.getElementById('inspectModal');
    modal.innerHTML = `
      <div class="modal inspect">
        <button class="modal-x" id="mx">✕</button>
        <div class="inspect-head">
          <div class="inspect-icon">${Room.icon(obj.icon)}</div>
          <div>
            <h3>${esc(obj.label)}</h3>
            <p class="muted">이 지점을 자세히 관찰하고, 발견한 오류를 기록하세요.</p>
          </div>
        </div>
        <div class="inspect-zoom" id="inspZoom" title="확대 관찰">
          <span class="zoom-cross"></span>
          <div class="zoom-ctrls">
            <button data-z="out" title="축소">−</button>
            <span id="zoomPct">340%</span>
            <button data-z="in" title="확대">+</button>
            <button data-z="reset" title="처음으로">⤢</button>
          </div>
          <span class="zoom-hint">🔍 휠·드래그·버튼으로 확대/이동</span>
        </div>
        ${hints.length ? `<div class="hint-box">
          <div class="hint-title">💡 연습 힌트 · 이 지점의 오류</div>
          ${hints.map((h) => `<div class="hint-item"><b>[${esc(h.area)}]</b> ${esc(h.clue)}
            <span class="hint-risk">→ ${esc(h.risk)}</span></div>`).join('')}
        </div>` : ''}
        <div class="finding-form">
          <label>위치/단서
            <input id="i-loc" placeholder="예: PCA 펌프에 basal rate가 켜져 있음" value="${esc(existing[0]?.location)}" />
          </label>
          <label>왜 위험한가
            <input id="i-why" placeholder="예: 과다투여로 호흡억제 위험" value="${esc(existing[0]?.why)}" />
          </label>
          <label>즉시 조치 또는 보고
            <input id="i-act" placeholder="예: 펌프 설정 이중확인 후 중지·보고" value="${esc(existing[0]?.action)}" />
          </label>
          <label class="check">
            <input type="checkbox" id="i-high" ${existing[0]?.isHighRiskGuess ? 'checked' : ''}/>
            즉시 위해 가능성이 큰 <b>고위험 오류</b>로 표시
          </label>
        </div>
        <div class="modal-actions">
          <button class="btn ghost" id="i-none">여기엔 오류 없음</button>
          <button class="btn primary" id="i-save">오류로 기록</button>
        </div>
        ${existing.length ? `<p class="saved-note">✓ 이미 이 물품에 ${existing.filter(f=>f.flagged).length}건 기록됨</p>` : ''}
      </div>`;
    modal.classList.add('open');
    setupZoom(modal.querySelector('#inspZoom'), obj);
    const close = () => modal.classList.remove('open');
    modal.querySelector('#mx').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('#i-none').addEventListener('click', async () => {
      try {
        await upsertFinding(objectId, { flagged: false });
        close(); toast('점검 완료 — 오류 없음으로 저장됨 ✓', 'ok'); S.room.refreshBadges();
      } catch (e) { toast(`저장 실패: ${e.message || '연결을 확인하세요'}`, 'warn'); }
    });
    modal.querySelector('#i-save').addEventListener('click', async () => {
      const loc = modal.querySelector('#i-loc').value.trim();
      if (!loc) return toast('위치/단서를 입력하세요', 'warn');
      const btn = modal.querySelector('#i-save');
      btn.disabled = true; btn.textContent = '저장 중…';
      try {
        await upsertFinding(objectId, {
          flagged: true,
          location: loc,
          why: modal.querySelector('#i-why').value.trim(),
          action: modal.querySelector('#i-act').value.trim(),
          isHighRiskGuess: modal.querySelector('#i-high').checked,
        });
        close(); toast('오류 기록이 저장되었습니다 ✓', 'ok');
        updateProgress(); S.room.refreshBadges();
      } catch (e) {
        // 저장 실패 시 모달을 닫지 않는다 — 학생이 쓴 내용이 사라지지 않도록.
        toast(`저장 실패: ${e.message || '연결을 확인하세요'}`, 'warn');
        btn.disabled = false; btn.textContent = '오류로 기록';
      }
    });
  }

  /* 인스펙트 모달의 확대(돋보기) — 휠·버튼 줌 + 드래그 이동으로 수치·기록 정독 */
  function setupZoom(box, obj) {
    if (!box) return;
    const src = `assets/room_${S.caseId}.png`;
    const BASE = 3.4, MIN = 1.2, MAX = 12;
    const st = { zoom: BASE, cx: obj.x / 100, cy: obj.y / 100 };
    box.style.backgroundImage = `url("${src}")`;
    box.style.backgroundRepeat = 'no-repeat';
    const pctEl = box.querySelector('#zoomPct');

    function render() {
      const W = box.clientWidth || 460, H = box.clientHeight || 200;
      const bgW = W * st.zoom, bgH = bgW * (9 / 16);      // 원본 16:9 비율 유지
      st.cx = Math.max(0, Math.min(1, st.cx));
      st.cy = Math.max(0, Math.min(1, st.cy));
      box.style.backgroundSize = `${bgW.toFixed(1)}px ${bgH.toFixed(1)}px`;
      box.style.backgroundPosition =
        `${(W / 2 - st.cx * bgW).toFixed(1)}px ${(H / 2 - st.cy * bgH).toFixed(1)}px`;
      if (pctEl) pctEl.textContent = Math.round(st.zoom * 100) + '%';
    }
    const setZoom = (z) => { st.zoom = Math.max(MIN, Math.min(MAX, z)); render(); };

    box.querySelector('[data-z="in"]').onclick = (e) => { e.stopPropagation(); setZoom(st.zoom * 1.4); };
    box.querySelector('[data-z="out"]').onclick = (e) => { e.stopPropagation(); setZoom(st.zoom / 1.4); };
    box.querySelector('[data-z="reset"]').onclick = (e) => { e.stopPropagation(); st.cx = obj.x / 100; st.cy = obj.y / 100; setZoom(BASE); };
    box.addEventListener('wheel', (e) => { e.preventDefault(); setZoom(st.zoom * (e.deltaY < 0 ? 1.18 : 1 / 1.18)); }, { passive: false });

    /* 드래그 이동(패닝) */
    let drag = false, lx = 0, ly = 0;
    box.addEventListener('mousedown', (e) => {
      if (e.target.closest('.zoom-ctrls')) return;
      drag = true; lx = e.clientX; ly = e.clientY; box.classList.add('grabbing');
    });
    const stop = () => { drag = false; box.classList.remove('grabbing'); };
    box.addEventListener('mouseup', stop);
    box.addEventListener('mouseleave', stop);
    box.addEventListener('mousemove', (e) => {
      if (!drag) return;
      const W = box.clientWidth, bgW = W * st.zoom, bgH = bgW * (9 / 16);
      st.cx -= (e.clientX - lx) / bgW; st.cy -= (e.clientY - ly) / bgH;
      lx = e.clientX; ly = e.clientY; render();
    });

    const img = new Image(); img.onload = render; img.src = src; render();
  }

  async function upsertFinding(objectId, patch) {
    // 오브젝트 단위로 기록을 저장(같은 오브젝트의 이전 기록은 대체)
    const findings = (S.session.findings || []).filter((f) => f.objectId !== objectId);
    if (patch.flagged) findings.push({ objectId, ...patch });
    // 서버 저장이 성공한 뒤에만 화면 상태에 반영한다.
    // 실패했는데 기록된 것처럼 보이는 상황을 막기 위함.
    S.session = await API.saveFindings(S.session.id, findings);
    return S.session;
  }

  function updateProgress() {
    if (S.room) S.room.refreshBadges();
  }

  function openFindingsList() {
    const modal = document.getElementById('inspectModal');
    const list = (S.session.findings || []).filter((f) => f.flagged);
    const labelOf = (id) => S.caseData.objects.find((o) => o.id === id)?.label || id;
    modal.innerHTML = `
      <div class="modal">
        <button class="modal-x" id="mx">✕</button>
        <h3>오류 탐지 기록지</h3>
        ${list.length === 0 ? '<p class="muted">아직 기록된 오류가 없습니다.</p>' : `
        <p class="saved-note">✓ 아래 ${list.length}건은 서버에 저장되어 있습니다. 교수자가 그대로 확인합니다.</p>`}
        ${list.length === 0 ? '' : `
        <table class="find-table">
          <thead><tr><th>#</th><th>위치/단서</th><th>왜 위험</th><th>조치</th><th>고위험</th></tr></thead>
          <tbody>${list.map((f, i) => `<tr>
            <td>${i + 1}</td>
            <td><b>${esc(labelOf(f.objectId))}</b><br><span class="muted">${esc(f.location)}</span></td>
            <td>${esc(f.why)}</td><td>${esc(f.action)}</td>
            <td>${f.isHighRiskGuess ? '⚠️' : ''}</td></tr>`).join('')}</tbody>
        </table>`}
        <div class="modal-actions"><button class="btn primary" id="close2">닫기</button></div>
      </div>`;
    modal.classList.add('open');
    const close = () => modal.classList.remove('open');
    modal.querySelector('#mx').addEventListener('click', close);
    modal.querySelector('#close2').addEventListener('click', close);
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
  }

  /* ================= 화면: 우선순위화 ================= */
  async function viewPriority() {
    const flagged = (S.session.findings || []).filter((f) => f.flagged);
    if (flagged.length === 0) {
      const modal = document.getElementById('inspectModal');
      modal.innerHTML = `
        <div class="modal finish-help">
          <button class="modal-x" id="mx">✕</button>
          <div class="finish-help-icon">1</div>
          <h3>오류를 1개 이상 기록해 주세요</h3>
          <p class="muted">다음 화면인 <b>우선순위화 → SBAR → 개인 성찰 → 결과</b>로 넘어가려면 먼저 병실 번호를 눌러 발견한 오류를 기록해야 합니다.</p>
          <ol>
            <li>병실의 번호 표식을 누릅니다.</li>
            <li>위치와 단서를 입력하고 <b>오류로 기록</b>을 누릅니다.</li>
            <li>다시 <b>다음 단계 →</b>를 누릅니다.</li>
          </ol>
          <p class="muted">실습을 중단하시려면 상단의 <b>✕ 나가기</b>를 누르세요.</p>
          <div class="modal-actions"><button class="btn primary" id="continueRoom">병실에서 계속 찾기</button></div>
        </div>`;
      modal.classList.add('open');
      const close = () => modal.classList.remove('open');
      modal.querySelector('#mx').addEventListener('click', close);
      modal.querySelector('#continueRoom').addEventListener('click', close);
      modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
      return;
    }
    document.body.classList.remove('in-room');
    const labelOf = (id) => S.caseData.objects.find((o) => o.id === id)?.label || id;
    const chosen = new Set(S.session.priorities || []);
    app.innerHTML = `
      <div class="page-narrow">
        ${exitBarHTML('backRoom', '← 병실로')}
        <div class="panel">
          <h2>상위 5개 오류 우선순위화 ${previewBadge()}</h2>
          <p class="muted">ABC · 의식 · 저혈당 · 저산소증 · 출혈 · 오투약 등 즉시 위해 기준으로
             가장 위험한 오류 5개를 선택하세요. 선택 순서가 우선순위가 됩니다.</p>
          <div class="prio-list" id="prioList">
            ${flagged.map((f, i) => `
              <label class="prio-item ${chosen.has(f.objectId) ? 'on' : ''}" data-id="${f.objectId}">
                <span class="prio-rank"></span>
                <span class="prio-body">
                  <b>${esc(labelOf(f.objectId))}</b> ${f.isHighRiskGuess ? '<em class="hr">고위험</em>' : ''}
                  <span class="muted">${esc(f.location)}</span>
                </span>
              </label>`).join('')}
          </div>
          <button class="btn primary lg" id="toSbar">SBAR 보고 작성 →</button>
        </div>
      </div>`;
    app.querySelector('#backRoom').addEventListener('click', viewRoom);
    bindExit();
    const order = [...(S.session.priorities || [])];
    const rerank = () => {
      app.querySelectorAll('.prio-item').forEach((el) => {
        const idx = order.indexOf(el.dataset.id);
        el.classList.toggle('on', idx >= 0);
        el.querySelector('.prio-rank').textContent = idx >= 0 ? idx + 1 : '';
      });
    };
    app.querySelectorAll('.prio-item').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        const id = el.dataset.id;
        const i = order.indexOf(id);
        if (i >= 0) order.splice(i, 1);
        else if (order.length < 5) order.push(id);
        else return toast('상위 5개까지만 선택할 수 있습니다', 'warn');
        rerank();
      });
    });
    rerank();
    app.querySelector('#toSbar').addEventListener('click', async () => {
      if (order.length === 0) return toast('최소 1개 이상 선택하세요', 'warn');
      const btn = app.querySelector('#toSbar');
      btn.disabled = true;
      try {
        S.session = await API.savePriorities(S.session.id, order);
        toast('우선순위가 저장되었습니다 ✓', 'ok');
        viewSbar();
      } catch (e) {
        toast(`저장 실패: ${e.message || '연결을 확인하세요'}`, 'warn');
        btn.disabled = false;
      }
    });
  }

  /* ================= 화면: SBAR ================= */
  const SBAR_ROWS = [
    ['s', 'S 상황', '현재 가장 위험하다고 판단한 문제를 한 문장으로'],
    ['b', 'B 배경', '진단, 수술/검사/처방, 관련 위험요인을 간단히'],
    ['a', 'A 사정', '관찰한 객관적 단서와 위험 판단근거'],
    ['r', 'R 제안', '즉시 필요한 간호조치, 보고/처방 확인, 추가 사정 제안'],
  ];

  const REFLECT_ROWS = [
    ['firstAction', '가장 먼저 조치해야 한다고 판단한 오류'],
    ['rationale', '그렇게 판단한 근거'],
    ['missed', '우리 조가 놓쳤을 가능성이 있는 오류'],
    ['apply', '실제 임상실습에서 적용할 행동 1가지'],
    ['teamwork', '팀 의사소통에서 좋았던 점/개선할 점'],
  ];

  async function viewSbar() {
    // 화면 진입 시 서버 최신본을 먼저 받아온다. 예전 화면의 낡은 값으로 덮어써서
    // 작성한 내용이 다른 내용으로 바뀌어 보이던 문제를 막는다.
    await refreshSession();
    const sb = S.session.sbar || {};
    app.innerHTML = `
      <div class="page-narrow">
        ${exitBarHTML('backPrio', '← 우선순위화로')}
        <div class="panel">
          <h2>SBAR 구두보고 준비 ${previewBadge()}</h2>
          <p class="muted">가장 위험한 오류 1~2개를 SBAR 형식으로 교수자에게 보고합니다. 2분 이내로 작성하세요.</p>
          <div class="sbar-form">
            ${SBAR_ROWS.map(([k, label, ph]) => `
              <div class="sbar-row">
                <span class="sbar-k">${label}</span>
                <textarea data-k="${k}" placeholder="${ph}">${esc(sb[k])}</textarea>
              </div>`).join('')}
          </div>
          ${saveStateHTML('sbarSave')}
          <p class="save-help muted">입력을 멈추면 자동으로 저장되며, 화면을 벗어날 때도 저장됩니다.</p>
          <div class="step-actions">
            <button class="btn ghost" id="saveSbarNow">지금 저장</button>
            <button class="btn primary lg" id="toReflect">개인 성찰 →</button>
          </div>
        </div>
      </div>`;

    const badge = app.querySelector('#sbarSave');
    // 로드 시점의 값을 기준으로 삼아, 실제로 바뀐 항목만 서버에 보낸다.
    // 같은 조의 다른 학생이 저장한 항목을 덮어쓰지 않게 하는 핵심 장치.
    let baseline = {};
    SBAR_ROWS.forEach(([k]) => (baseline[k] = sb[k] || ''));
    const anyText = SBAR_ROWS.some(([k]) => baseline[k]);
    if (anyText) setSaveState(badge, 'saved', '저장된 내용 불러옴');

    const readForm = () => {
      const out = {};
      app.querySelectorAll('textarea[data-k]').forEach((t) => (out[t.dataset.k] = t.value.trim()));
      return out;
    };
    const changedFields = (cur) => {
      const diff = {};
      SBAR_ROWS.forEach(([k]) => { if ((cur[k] || '') !== (baseline[k] || '')) diff[k] = cur[k] || ''; });
      return diff;
    };

    let timer = null;
    let saving = null;
    async function saveSbar() {
      clearTimeout(timer);
      if (saving) await saving.catch(() => {});
      const cur = readForm();
      const diff = changedFields(cur);
      if (!Object.keys(diff).length) return true;
      markSaving(badge);
      saving = (async () => {
        const saved = await API.saveSbar(S.session.id, diff);
        S.session = saved;
        baseline = { ...baseline, ...diff };
        markSaved(badge, saved.savedAt);
      })();
      try { await saving; return true; }
      catch (e) { markError(badge, e.message); return false; }
      finally { saving = null; }
    }

    app.querySelectorAll('textarea[data-k]').forEach((t) => {
      t.addEventListener('input', () => {
        markDirty(badge);
        clearTimeout(timer);
        timer = setTimeout(saveSbar, 1200);
      });
      t.addEventListener('blur', saveSbar);
    });

    app.querySelector('#saveSbarNow').addEventListener('click', async () => {
      const cur = readForm();
      if (!Object.keys(changedFields(cur)).length) {
        markSaved(badge, S.session.savedAt);
        return toast('변경된 내용이 없습니다', '');
      }
      if (await saveSbar()) toast('SBAR 저장됨 ✓', 'ok');
    });

    // 뒤로 가기에서도 반드시 저장 — 예전에는 여기서 작성 내용이 그대로 사라졌다.
    app.querySelector('#backPrio').addEventListener('click', async () => {
      await saveSbar();
      viewPriority();
    });
    // 중간에 나가더라도 작성한 내용을 먼저 저장한다.
    app.querySelector('#exitNow').addEventListener('click', async () => {
      if (!isPreview() && !window.confirm('실습을 중단하고 사례 선택 화면으로 나갈까요?\n\n지금까지 작성한 내용은 저장되어 있으며, 나중에 이어서 할 수 있습니다.')) return;
      await saveSbar();
      viewHome();
    });
    app.querySelector('#toReflect').addEventListener('click', async () => {
      if (!(await saveSbar())) return toast('저장에 실패했습니다. 연결 확인 후 다시 시도하세요.', 'warn');
      viewReflection();
    });
  }

  /* ================= 화면: 개인 성찰 ================= */
  async function viewReflection() {
    await refreshSession();
    const r = S.session.reflection || {};
    app.innerHTML = `
      <div class="page-narrow">
        ${exitBarHTML('backSbar', '← SBAR로')}
        <div class="panel">
          <h2>개인 성찰 기록 ${previewBadge()}</h2>
          <div class="reflect-form">
            ${REFLECT_ROWS.map(([k, label]) => `
              <label>${label}<textarea data-r="${k}">${esc(r[k])}</textarea></label>`).join('')}
          </div>
          ${saveStateHTML('reflSave')}
          <p class="save-help muted">입력을 멈추면 자동으로 저장되며, 화면을 벗어날 때도 저장됩니다.</p>
          <div class="step-actions">
            <button class="btn ghost" id="saveReflNow">지금 저장</button>
            <button class="btn primary lg" id="submitAll">제출하고 결과 보기 →</button>
          </div>
        </div>
      </div>`;

    const badge = app.querySelector('#reflSave');
    let baseline = {};
    REFLECT_ROWS.forEach(([k]) => (baseline[k] = r[k] || ''));
    if (REFLECT_ROWS.some(([k]) => baseline[k])) setSaveState(badge, 'saved', '저장된 내용 불러옴');

    const readForm = () => {
      const out = {};
      app.querySelectorAll('textarea[data-r]').forEach((t) => (out[t.dataset.r] = t.value.trim()));
      return out;
    };
    const changedFields = (cur) => {
      const diff = {};
      REFLECT_ROWS.forEach(([k]) => { if ((cur[k] || '') !== (baseline[k] || '')) diff[k] = cur[k] || ''; });
      return diff;
    };

    let timer = null;
    let saving = null;
    async function saveRefl() {
      clearTimeout(timer);
      if (saving) await saving.catch(() => {});
      const diff = changedFields(readForm());
      if (!Object.keys(diff).length) return true;
      markSaving(badge);
      saving = (async () => {
        const saved = await API.saveReflection(S.session.id, diff);
        S.session = saved;
        baseline = { ...baseline, ...diff };
        markSaved(badge, saved.savedAt);
      })();
      try { await saving; return true; }
      catch (e) { markError(badge, e.message); return false; }
      finally { saving = null; }
    }

    app.querySelectorAll('textarea[data-r]').forEach((t) => {
      t.addEventListener('input', () => {
        markDirty(badge);
        clearTimeout(timer);
        timer = setTimeout(saveRefl, 1200);
      });
      t.addEventListener('blur', saveRefl);
    });

    app.querySelector('#saveReflNow').addEventListener('click', async () => {
      if (!Object.keys(changedFields(readForm())).length) {
        markSaved(badge, S.session.savedAt);
        return toast('변경된 내용이 없습니다', '');
      }
      if (await saveRefl()) toast('성찰 저장됨 ✓', 'ok');
    });

    // 뒤로 가기에서도 저장 — 예전에는 여기서 작성 내용이 사라졌다.
    app.querySelector('#backSbar').addEventListener('click', async () => {
      await saveRefl();
      viewSbar();
    });
    app.querySelector('#exitNow').addEventListener('click', async () => {
      if (!isPreview() && !window.confirm('실습을 중단하고 사례 선택 화면으로 나갈까요?\n\n지금까지 작성한 내용은 저장되어 있으며, 나중에 이어서 할 수 있습니다.')) return;
      await saveRefl();
      viewHome();
    });
    app.querySelector('#submitAll').addEventListener('click', async () => {
      if (!(await saveRefl())) return toast('저장에 실패했습니다. 연결 확인 후 다시 시도하세요.', 'warn');
      await API.submit(S.session.id);
      toast('제출 완료 — 작성한 내용이 모두 저장되었습니다 ✓', 'ok');
      viewResult();
    });
  }

  /* ================= 화면: 결과 + 디브리핑 정답공개 ================= */
  async function viewResult() {
    const [score, answers] = await Promise.all([
      API.getScore(S.session.id),
      API.getAnswers(S.caseId),
    ]);
    const auto = score.auto;
    const detected = new Set(auto.detectionDetail.map((d) => d.code));
    app.innerHTML = `
      <div class="page-wide">
        <div class="result-head">
          <div>
            <div class="case-tag">CASE ${S.caseId} · 결과</div>
            <h2>${esc(S.session.teamName || '조')} · ${esc(S.session.className || '')}</h2>
          </div>
          <div class="score-ring" style="--pct:${score.total}">
            <span>${score.total}<small>/100</small></span>
          </div>
        </div>
        ${isPreview() ? `<p class="preview-note">교수자 미리보기 결과입니다. 아래 점수는 화면 확인용이며,
          <b>학생 채점 목록과 성적 내보내기에는 포함되지 않습니다.</b></p>` : ''}

        <div class="score-cards">
          ${score.rubric.map((r) => `
            <div class="score-card ${r.auto ? 'auto' : 'manual'}">
              <div class="sc-top"><b>${esc(r.label)}</b><span>${score.breakdown[r.key]} / ${r.max}</span></div>
              <div class="sc-bar"><i style="width:${score.breakdown[r.key] / r.max * 100}%"></i></div>
              <small class="muted">${r.auto ? '자동 채점' : '교수자 입력'}</small>
            </div>`).join('')}
        </div>

        <div class="result-two">
          <div class="panel">
            <h3>오류 탐지 결과 <span class="muted">${auto.detectedCount}/${auto.totalErrors}</span></h3>
            <p class="muted">고위험 ${auto.highRiskHit.length}/${auto.highRiskTotal.length} 탐지</p>
            <div class="answer-legend"><span class="dot found"></span>찾음 <span class="dot miss"></span>놓침 <span class="dot hr"></span>고위험</div>
            <table class="answer-table">
              <thead><tr><th>코드</th><th>영역</th><th>단서/오류</th><th>배점</th><th></th></tr></thead>
              <tbody>
                ${answers.errors.map((e) => {
                  const hit = detected.has(e.code);
                  const hr = answers.highRisk.includes(e.code);
                  return `<tr class="${hit ? 'row-found' : 'row-miss'}">
                    <td><span class="code ${hr ? 'hr' : ''}">${e.code}${hr ? '★' : ''}</span></td>
                    <td>${esc(e.area)}</td>
                    <td><b>${esc(e.clue)}</b><br><span class="muted">→ ${esc(e.action)}</span></td>
                    <td>${e.point}</td>
                    <td>${hit ? '✓' : '—'}</td></tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>
          <div class="panel">
            <h3>디브리핑 질문</h3>
            <ol class="debrief">${answers.debrief.map((d) => `<li>${esc(d)}</li>`).join('')}</ol>
            <h3>우리 조 SBAR <span class="saved-inline">저장됨 ✓</span></h3>
            <div class="sbar-review">
              ${['s','b','a','r'].map((k) => `<p><b>${k.toUpperCase()}</b> ${esc((S.session.sbar||{})[k]) || '<span class="muted">미작성</span>'}</p>`).join('')}
            </div>
            <h3>내 성찰 기록 <span class="saved-inline">저장됨 ✓</span></h3>
            <div class="reflect-review">
              ${REFLECT_ROWS.map(([k, label]) => `<p><b>${esc(label)}</b><br>${esc((S.session.reflection||{})[k]) || '<span class="muted">미작성</span>'}</p>`).join('')}
            </div>
            <p class="save-help muted">위 내용이 교수자 화면에 그대로 전달되어 채점됩니다.</p>
            <div class="result-actions">
              <button class="btn ghost" id="again">다른 사례 하기</button>
              ${API.isInstructor() ? '<button class="btn primary" id="toProf">교수 대시보드에서 채점</button>' : ''}
            </div>
          </div>
        </div>
      </div>`;
    app.querySelector('#again').addEventListener('click', viewHome);
    app.querySelector('#toProf')?.addEventListener('click', () => viewProfessor(S.caseId));
  }

  /* ---------- 관리자 로그인 ---------- */
  function refreshAdminNav() {
    const nav = document.getElementById('adminNav');
    if (nav) nav.textContent = API.isAdmin() ? '총괄관리자 ✓' : (API.isInstructor() ? '교수자 ✓' : '교수자 로그인');
  }
  function openAdminLogin() {
    viewLogin('admin');
  }

  /* ================= 화면: 교수자·총괄관리자 대시보드 =================
   * 탭: 채점 | 학생 관리 | (총괄) 교수자 관리
   * 채점 목록은 기본적으로 학생·사례별 대표 기록 1건만 보여 준다(서버 view=latest). */
  const CLASS_NAMES = ['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2'];
  const STATUS_LABEL = { exploring: '작성 중', reporting: '채점 대기', scored: '채점 완료' };
  const MANUAL_KEYS = [['priority', 15], ['sbar', 15], ['teamwork', 10], ['reflection', 5]];
  const PF = Object.assign(
    { tab: 'grade', caseId: '', className: '', status: 'all', view: 'latest', q: '', needsOnly: true, sq: '', sClass: '' },
    (() => { try { return JSON.parse(sessionStorage.getItem('roe_pf') || '{}'); } catch (e) { return {}; } })(),
  );
  const savePF = () => { try { sessionStorage.setItem('roe_pf', JSON.stringify(PF)); } catch (e) { /* 무시 */ } };
  const fmtTime = (t) => (t ? new Date(t).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
  const profileIncomplete = (r) => !(r.student_number && r.grade && r.class_name && r.faculty_user_id);
  const needsCheck = (r) => profileIncomplete(r) || String(r.student_number || '').startsWith('임시') || r.approval_status !== 'approved';

  async function viewProfessor(preCase, preClass) {
    if (!API.isInstructor()) return openAdminLogin();
    document.body.classList.remove('in-room');
    if (preCase !== undefined) { PF.caseId = preCase || ''; PF.tab = 'grade'; }
    if (preClass !== undefined) PF.className = preClass || '';
    savePF();
    app.innerHTML = '<div class="page-wide"><p class="muted">대시보드를 불러오는 중…</p></div>';

    const query = { view: PF.view, ...(PF.caseId ? { caseId: PF.caseId } : {}), ...(PF.className ? { className: PF.className } : {}) };
    const [sessionsResult, facultyResult, studentsResult, routesResult, conflictsResult] = await Promise.allSettled([
      API.professorSessions(query),
      API.isAdmin() ? API.facultyRequests() : Promise.resolve([]),
      API.studentApprovals(),
      API.facultyRoutes(),
      API.studentNumberConflicts(),
    ]);
    const allRows = sessionsResult.status === 'fulfilled' ? sessionsResult.value : [];
    const facultyRequests = facultyResult.status === 'fulfilled' ? facultyResult.value : [];
    const students = studentsResult.status === 'fulfilled' ? studentsResult.value : [];
    const facultyRoutes = routesResult.status === 'fulfilled' ? routesResult.value : [];
    const conflicts = conflictsResult.status === 'fulfilled' ? conflictsResult.value : [];
    const loadWarnings = [
      sessionsResult.status === 'rejected' ? `학생 실습 기록: ${sessionsResult.reason?.message || '불러오기 실패'}` : '',
      facultyResult.status === 'rejected' ? `교수자 승인 요청: ${facultyResult.reason?.message || '불러오기 실패'}` : '',
      studentsResult.status === 'rejected' ? `학생 목록: ${studentsResult.reason?.message || '불러오기 실패'}` : '',
    ].filter(Boolean);

    const me = API.user()?.id;
    const myClasses = API.isAdmin() ? CLASS_NAMES : (facultyRoutes.find((f) => f.user_id === me)?.classes || []);
    const classOptions = API.isAdmin() ? CLASS_NAMES : myClasses;
    const facultyName = (uid) => facultyRoutes.find((f) => f.user_id === uid)?.full_name || '-';
    const needCount = students.filter(needsCheck).length + conflicts.length;
    const pendingFaculty = facultyRequests.filter((r) => r.status === 'pending').length;
    const counts = { all: allRows.length, reporting: 0, scored: 0, exploring: 0 };
    allRows.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });

    // 선택한 사례에 아직 기록이 없는 승인 학생(미참여)
    const inScope = (s) => (PF.className ? s.class_name === PF.className : myClasses.includes(s.class_name));
    const participated = new Set(allRows.map((r) => r.studentUserId));
    const absent = PF.caseId
      ? students.filter((s) => s.approval_status === 'approved' && inScope(s) && !participated.has(s.user_id))
        .sort((a, b) => String(a.student_number || '').localeCompare(String(b.student_number || '')))
      : [];

    const tabBtn = (id, label, badge) => `<button class="tab-btn ${PF.tab === id ? 'on' : ''}" data-tab="${id}">${label}${badge ? ` <span class="tab-badge">${badge}</span>` : ''}</button>`;

    app.innerHTML = `
      <div class="page-wide prof-page">
        <div class="result-head">
          <h2>${API.isAdmin() ? '총괄관리자 대시보드' : '교수자 대시보드'}</h2>
          <div>
            <button class="btn primary" id="adminCases">사례 선택 · 병실 입장</button>
            <button class="btn ghost" id="admOut">로그아웃</button>
          </div>
        </div>
        ${loadWarnings.length ? `<div class="panel"><p class="muted">일부 자료를 불러오지 못했습니다.</p><p>${loadWarnings.map(esc).join('<br>')}</p></div>` : ''}
        <div class="tab-bar">
          ${tabBtn('grade', '채점', counts.reporting)}
          ${tabBtn('students', '학생 관리', needCount)}
          ${API.isAdmin() ? tabBtn('faculty', '교수자 관리', pendingFaculty) : ''}
        </div>
        <section data-pane="grade" ${PF.tab === 'grade' ? '' : 'hidden'}>${gradePaneHTML()}</section>
        <section data-pane="students" ${PF.tab === 'students' ? '' : 'hidden'}>${studentsPaneHTML()}</section>
        ${API.isAdmin() ? `<section data-pane="faculty" ${PF.tab === 'faculty' ? '' : 'hidden'}>${facultyPaneHTML()}</section>` : ''}
      </div>
      <div id="profModal" class="modal-back"></div>`;

    /* ---------- 채점 탭 ---------- */
    function gradePaneHTML() {
      const chip = (id, label) => `<button class="chip ${PF.status === id ? 'on' : ''}" data-status="${id}">${label} <b>${counts[id] || 0}</b></button>`;
      return `
        <div class="prof-filter">
          <label>사례
            <select id="pf-case"><option value="">전체</option>${['A', 'B', 'C', 'D'].map((x) => `<option value="${x}" ${PF.caseId === x ? 'selected' : ''}>CASE ${x}</option>`).join('')}</select>
          </label>
          <label>분반
            <select id="pf-class"><option value="">${API.isAdmin() ? '전체' : '담당 분반 전체'}</option>${classOptions.map((x) => `<option value="${x}" ${PF.className === x ? 'selected' : ''}>${x}</option>`).join('')}</select>
          </label>
          <label class="pf-search">학생 검색<input id="pf-q" placeholder="이름·학번·조" value="${esc(PF.q)}"></label>
          <label class="pf-check"><input type="checkbox" id="pf-all" ${PF.view === 'all' ? 'checked' : ''}> 모든 시도 보기</label>
        </div>
        <div class="status-chips">
          ${chip('all', '전체')}${chip('reporting', '채점 대기')}${chip('scored', '채점 완료')}${chip('exploring', '작성 중')}
          ${PF.caseId ? `<span class="chip ghost-chip">미참여 <b>${absent.length}</b></span>` : '<span class="muted small-note">사례를 선택하면 미참여 학생도 확인할 수 있습니다.</span>'}
        </div>
        ${PF.caseId && absent.length ? `<details class="absent-list"><summary>CASE ${esc(PF.caseId)} 미참여 학생 ${absent.length}명 보기</summary>
          <p>${absent.map((s) => `<span class="absent-chip">${esc(s.class_name)} · ${esc(s.student_number || '-')} ${esc(s.full_name || '')}</span>`).join('')}</p></details>` : ''}
        <p class="muted grade-help">${PF.view === 'all' ? '학생이 만든 모든 기록을 보여 줍니다.' : '학생·사례별로 대표 기록 1건(채점 완료 → 제출 → 작성 중 순, 같으면 최신)만 보여 줍니다. 시도가 여러 번이면 "시도 n" 표시가 붙습니다.'}
          탐지40·고위험15는 자동 채점, 우선15·SBAR15·팀10·성찰5는 직접 입력합니다. <b>작성 내용 보기</b>에서 학생 기록과 정답 대비 결과를 보며 채점하고 다음 학생으로 넘어갈 수 있습니다.</p>
        <div class="export-bar">
          <span class="muted">내보내기(현재 필터 기준):</span>
          <a class="btn tiny" data-export="xlsx">📊 Excel</a>
          <a class="btn tiny" data-export="csv">📄 CSV</a>
          <a class="btn tiny" data-export="doc">📝 Word</a>
          <a class="btn tiny" data-export="html">🖨️ PDF(인쇄)</a>
          <span class="spacer"></span>
          <button class="btn tiny primary" id="bulkSave" disabled>변경한 점수 저장 <b id="dirtyCount">0</b></button>
        </div>
        <div class="table-scroll">
        <table class="prof-table">
          <thead><tr>
            <th>반</th><th>학번</th><th>이름</th><th>사례</th><th>조</th><th>상태</th><th>탐지</th><th>고위험</th>
            <th>탐지40</th><th>고위험15</th><th>우선15</th><th>SBAR15</th><th>팀10</th><th>성찰5</th>
            <th>총점</th><th>채점</th>
          </tr></thead>
          <tbody id="pf-body"></tbody>
        </table>
        </div>`;
    }

    /* ---------- 학생 관리 탭 ---------- */
    function studentsPaneHTML() {
      return `
        ${conflicts.length ? `<div class="panel faculty-approval conflict-panel">
          <h3>학번 중복으로 등록하지 못한 학생 <small class="muted">${conflicts.length}건</small></h3>
          <p class="muted">아래 학생이 입력한 학번이 이미 다른 계정에 저장되어 있어 학생 정보 저장이 막혔습니다. 누가 학번을 잘못 입력했는지 확인하세요.
            ${API.isAdmin() ? '기존 등록자가 잘못 입력했다면 <b>기존 학번 해제</b>, 신청 학생이 잘못 입력했다면 학생에게 알린 뒤 <b>확인 완료</b>를 누르세요. 급하면 신청 학생을 <b>정보 수정</b>으로 직접 등록할 수 있습니다.' : '기존 등록 학번 해제는 총괄관리자에게 요청하세요.'}</p>
          ${conflicts.map((c) => `<div class="faculty-row">
            <span><b>${esc(c.requester_name || '이름 미등록')} → 학번 ${esc(c.student_number)}</b>
              <small>신청: ${esc(c.requester_email)} · ${esc(fmtTime(c.attempted_at))} · 시도 ${esc(c.attempts)}회</small>
              <small>기존 등록: ${c.owner_user_id ? `${esc(c.owner_name || '이름 미등록')} · ${esc(c.owner_email)} · ${esc(c.owner_class_name || '-')} · ${esc(c.owner_approval_status)}` : '기존 등록자 없음(이미 해제됨 — 학생에게 다시 저장하라고 안내)'}</small></span>
            <span>
              ${API.isAdmin() && c.owner_user_id ? `<button class="btn tiny" data-release-number="${c.owner_user_id}" data-number="${esc(c.student_number)}" data-owner="${esc(c.owner_name)}">기존 학번 해제</button>` : ''}
              <button class="btn tiny ghost" data-resolve-conflict="${c.id}">확인 완료</button>
            </span>
          </div>`).join('')}
        </div>` : ''}
        <div class="panel faculty-approval">
          <h3>학생 목록 <small class="muted">전체 ${students.length}명 · 확인 필요 ${students.filter(needsCheck).length}명</small></h3>
          <div class="prof-filter">
            <label>분반<select id="st-class"><option value="">전체</option>${CLASS_NAMES.map((c) => `<option value="${c}" ${PF.sClass === c ? 'selected' : ''}>${c}</option>`).join('')}<option value="__none" ${PF.sClass === '__none' ? 'selected' : ''}>분반 없음</option></select></label>
            <label class="pf-search">검색<input id="st-q" placeholder="이름·학번" value="${esc(PF.sq)}"></label>
            <label class="pf-check"><input type="checkbox" id="onlyNeedsCheck" ${PF.needsOnly ? 'checked' : ''}> 확인 필요만(정보 미입력·임시 학번·승인 대기·거절)</label>
          </div>
          <div id="studentList"></div>
        </div>`;
    }

    function studentRowHTML(r) {
      const incomplete = profileIncomplete(r);
      const tempNumber = String(r.student_number || '').startsWith('임시');
      const statusLabel = incomplete ? '정보 미입력' : ({ pending: '승인 대기', approved: '승인', rejected: '거절' }[r.approval_status] || r.approval_status);
      return `<div class="faculty-row" data-student-row="${r.user_id}">
        <span><b>${esc(r.full_name || '이름 미등록')}</b>${tempNumber ? ' <em class="badge-warn">학번 확인 필요</em>' : ''}
          <small>학번 ${esc(r.student_number || '-')} · ${esc(r.grade || '-')}학년 · ${esc(r.class_name || '-')} · 지도교수 ${esc(facultyName(r.faculty_user_id))} · <span class="st-${incomplete ? 'none' : r.approval_status}">${esc(statusLabel)}</span></small></span>
        <span>
          ${API.isAdmin() ? `<button class="btn tiny" data-edit-student="${r.user_id}">정보 수정</button><select data-student-class="${r.user_id}"><option value="">분반 선택</option>${CLASS_NAMES.map((c) => `<option value="${c}" ${r.class_name === c ? 'selected' : ''}>${c}</option>`).join('')}</select><button class="btn tiny ghost" data-move-student="${r.user_id}">분반 이동</button><button class="btn tiny ghost" data-unassign-student="${r.user_id}">분반 해제</button>` : ''}
          ${incomplete
            ? `<small class="muted">${API.isAdmin() ? '정보 수정으로 직접 등록 가능' : '학생이 정보를 저장하면 승인할 수 있습니다'}</small>`
            : `${r.approval_status !== 'approved' ? `<button class="btn tiny" data-student="${r.user_id}" data-decision="approved">승인</button>` : ''}${r.approval_status !== 'rejected' ? `<button class="btn tiny ghost" data-student="${r.user_id}" data-decision="rejected">거절</button>` : ''}`}
        </span>
      </div>`;
    }

    function renderStudents() {
      const box = app.querySelector('#studentList');
      if (!box) return;
      const q = PF.sq.trim().toLowerCase();
      const list = students.filter((r) => (!PF.needsOnly || needsCheck(r))
        && (!PF.sClass || (PF.sClass === '__none' ? !r.class_name : r.class_name === PF.sClass))
        && (!q || [r.full_name, r.student_number].some((v) => String(v || '').toLowerCase().includes(q))))
        .sort((a, b) => Number(needsCheck(b)) - Number(needsCheck(a))
          || String(a.class_name || '~').localeCompare(String(b.class_name || '~'))
          || String(a.student_number || '~').localeCompare(String(b.student_number || '~')));
      box.innerHTML = list.length ? list.map(studentRowHTML).join('')
        : `<p class="muted">${PF.needsOnly ? '확인이 필요한 학생이 없습니다. 체크를 해제하면 전체 학생을 볼 수 있습니다.' : '조건에 맞는 학생이 없습니다.'}</p>`;
      bindStudentRows();
    }

    /* ---------- 교수자 관리 탭(총괄) ---------- */
    function facultyPaneHTML() {
      return `
        <div class="panel faculty-approval">
          <h3>교수자 권한 신청</h3>
          ${facultyRequests.length ? facultyRequests.map((r) => `<div class="faculty-row">
            <span><b>${esc(r.full_name || '이름 미등록')}</b><small>${esc(r.email)} · ${esc({ pending: '승인 대기', approved: '승인', rejected: '거절' }[r.status] || r.status)}</small></span>
            ${r.status === 'pending' ? `<span><button class="btn tiny" data-faculty="${r.user_id}" data-decision="approved">승인</button><button class="btn tiny ghost" data-faculty="${r.user_id}" data-decision="rejected">거절</button></span>` :
              (r.status === 'approved' && r.user_id !== me ? `<span><button class="btn tiny ghost" data-faculty="${r.user_id}" data-decision="rejected" data-revoke-faculty="true">권한 회수</button></span>` : '')}
          </div>`).join('') : '<p class="muted">교수자 신청이 없습니다.</p>'}
        </div>
        <div class="panel faculty-approval">
          <h3>교수자 분반 배정 <small class="muted">교수자당 최대 2개</small></h3>
          ${facultyRoutes.length ? facultyRoutes.map((r) => `<div class="faculty-row faculty-assignment">
            <span><b>${esc(r.full_name || r.email)}</b><small>${esc(r.email)}</small></span>
            <span class="class-checks">${CLASS_NAMES.map((c) => `<label><input type="checkbox" data-class-for="${r.user_id}" value="${c}" ${r.classes.includes(c) ? 'checked' : ''}>${c}</label>`).join('')}<button class="btn tiny" data-save-classes="${r.user_id}">배정 저장</button></span>
          </div>`).join('') : '<p class="muted">승인된 교수자가 없습니다.</p>'}
        </div>`;
    }

    /* ---------- 채점 표 ---------- */
    const dirty = new Set();
    const visibleRows = () => {
      const q = PF.q.trim().toLowerCase();
      return allRows.filter((r) => (PF.status === 'all' || r.status === PF.status)
        && (!q || [r.studentName, r.studentNumber, r.teamName, ...(r.members || [])].some((v) => String(v || '').toLowerCase().includes(q))));
    };

    function rowHtml(r) {
      const b = r.breakdown || {};
      const man = (k, max) => `<input class="mini-in" data-sid="${r.id}" data-k="${k}" type="number" min="0" max="${max}" step="0.5" value="${b[k] ?? 0}"/>`;
      return `<tr data-sid="${r.id}" class="st-row-${r.status}${r.hasContent ? '' : ' row-empty'}">
        <td>${esc(r.className)}</td>
        <td>${esc(r.studentNumber || '-')}</td>
        <td><b>${esc(r.studentName || '-')}</b>${r.attempts > 1 ? ` <small class="muted" title="같은 사례에 만든 기록 수">시도 ${r.attempts}</small>` : ''}</td>
        <td>CASE ${esc(r.caseId)}</td><td>${esc(r.teamName || '-')}</td>
        <td><span class="status-pill ${r.status}">${STATUS_LABEL[r.status] || esc(r.status)}</span>${r.hasContent ? '' : '<small class="muted"> (빈 기록)</small>'}</td>
        <td>${r.detectedCount}</td><td>${r.highRiskHit}/5</td>
        <td class="ro">${b.detection ?? 0}</td><td class="ro">${b.highRisk ?? 0}</td>
        ${MANUAL_KEYS.map(([k, max]) => `<td>${man(k, max)}</td>`).join('')}
        <td class="total"><b>${r.total ?? '-'}</b></td>
        <td class="row-actions"><button class="btn tiny view-btn" data-detail="${r.id}">📄 작성 내용 보기</button>${API.isAdmin() ? ` <button class="btn tiny ghost danger" data-reset-score="${r.id}" title="학생 기록과 점수를 처음 상태로">초기화</button>` : ''}</td>
      </tr>`;
    }

    function renderTable() {
      const body = app.querySelector('#pf-body');
      if (!body) return;
      const rows = visibleRows();
      body.innerHTML = rows.map(rowHtml).join('')
        || `<tr><td colspan="16" class="muted">${allRows.length ? '조건에 맞는 기록이 없습니다.' : '아직 학생 기록이 없습니다.'}</td></tr>`;
      dirty.forEach((sid) => body.querySelector(`tr[data-sid="${sid}"]`)?.classList.add('row-dirty'));
      bindProfRows();
    }

    function updateDirtyUI() {
      const btn = app.querySelector('#bulkSave');
      if (!btn) return;
      btn.disabled = dirty.size === 0;
      app.querySelector('#dirtyCount').textContent = dirty.size;
    }

    function applySaved(sid, res) {
      const row = allRows.find((r) => r.id === sid);
      if (!row || !res?.score) return;
      row.breakdown = res.score.breakdown;
      row.total = res.score.total;
      if (res.session?.status) row.status = res.session.status;
    }

    async function saveRow(sid) {
      const manualScores = {};
      app.querySelectorAll(`.mini-in[data-sid="${sid}"]`).forEach((inp) => { manualScores[inp.dataset.k] = Number(inp.value) || 0; });
      const res = await API.saveManual(sid, manualScores);
      applySaved(sid, res);
      dirty.delete(sid);
      return res;
    }

    function bindProfRows() {
      app.querySelectorAll('[data-detail]').forEach((btn) => btn.addEventListener('click', () =>
        openSessionDetail(btn.dataset.detail, visibleRows().map((r) => r.id), (sid, res) => { applySaved(sid, res); dirty.delete(sid); renderTable(); updateDirtyUI(); })));
      app.querySelectorAll('.mini-in[data-sid]').forEach((inp) => {
        inp.addEventListener('input', () => {
          dirty.add(inp.dataset.sid);
          inp.closest('tr')?.classList.add('row-dirty');
          updateDirtyUI();
        });
        inp.addEventListener('blur', () => {
          const max = Number(inp.max); const v = Number(inp.value);
          if (inp.value !== '' && (v < 0 || v > max)) { inp.value = Math.max(0, Math.min(v, max)); toast(`이 항목은 0~${max}점입니다.`, 'warn'); }
        });
      });
      app.querySelectorAll('[data-reset-score]').forEach((btn) => btn.addEventListener('click', async () => {
        if (!window.confirm('이 실습 기록을 처음 상태로 초기화할까요?\n\n초기화 대상: 오류 탐지, 고위험 판정, 우선순위, SBAR, 성찰, 자동·수동 점수\n유지: 학생 계정, 분반, 조 정보')) return;
        try { await API.resetManual(btn.dataset.resetScore); toast('오류 탐지와 자동·수동 성적을 모두 초기화했습니다.', 'ok'); viewProfessor(); }
        catch (e) { toast(e.message || '전체 실습 초기화 실패', 'warn'); }
      }));
    }

    /* ---------- 공통 바인딩 ---------- */
    app.querySelectorAll('[data-tab]').forEach((btn) => btn.addEventListener('click', () => {
      if (dirty.size && !window.confirm(`저장하지 않은 점수 ${dirty.size}건이 있습니다. 탭을 옮겨도 입력값은 유지되지만 저장되지는 않습니다. 계속할까요?`)) return;
      PF.tab = btn.dataset.tab; savePF();
      app.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('on', b === btn));
      app.querySelectorAll('[data-pane]').forEach((p) => { p.hidden = p.dataset.pane !== PF.tab; });
    }));
    app.querySelector('#adminCases').addEventListener('click', viewHome);
    app.querySelector('#admOut').addEventListener('click', () => { API.logout(); refreshAdminNav(); viewLogin('student'); });

    const leaveGuard = () => !dirty.size || window.confirm(`저장하지 않은 점수 ${dirty.size}건이 사라집니다. 계속할까요?`);
    app.querySelector('#pf-case').addEventListener('change', (e) => { if (!leaveGuard()) { e.target.value = PF.caseId; return; } PF.caseId = e.target.value; viewProfessor(); });
    app.querySelector('#pf-class').addEventListener('change', (e) => { if (!leaveGuard()) { e.target.value = PF.className; return; } PF.className = e.target.value; viewProfessor(); });
    app.querySelector('#pf-all').addEventListener('change', (e) => { if (!leaveGuard()) { e.target.checked = !e.target.checked; return; } PF.view = e.target.checked ? 'all' : 'latest'; viewProfessor(); });
    app.querySelector('#pf-q').addEventListener('input', (e) => { PF.q = e.target.value; savePF(); renderTable(); });
    app.querySelectorAll('[data-status]').forEach((btn) => btn.addEventListener('click', () => {
      PF.status = btn.dataset.status; savePF();
      app.querySelectorAll('[data-status]').forEach((b) => b.classList.toggle('on', b === btn));
      renderTable();
    }));
    app.querySelectorAll('[data-export]').forEach((el) => el.addEventListener('click', () => {
      const q = { view: PF.view, ...(PF.caseId ? { caseId: PF.caseId } : {}), ...(PF.className ? { className: PF.className } : {}),
        ...(PF.status !== 'all' ? { status: PF.status } : {}), ...(PF.q.trim() ? { q: PF.q.trim() } : {}) };
      API.downloadExport(el.dataset.export, q).catch((e) => toast(e.message, 'warn'));
    }));
    app.querySelector('#bulkSave').addEventListener('click', async () => {
      const ids = [...dirty];
      const btn = app.querySelector('#bulkSave'); btn.disabled = true;
      let ok = 0; const failed = [];
      for (const sid of ids) {
        try { await saveRow(sid); ok++; } catch (e) { failed.push(sid); }
      }
      renderTable(); updateDirtyUI();
      toast(failed.length ? `${ok}건 저장, ${failed.length}건 실패 — 다시 시도하세요.` : `${ok}건 채점 저장됨 ✓`, failed.length ? 'warn' : 'ok');
    });

    app.querySelector('#st-class')?.addEventListener('change', (e) => { PF.sClass = e.target.value; savePF(); renderStudents(); });
    app.querySelector('#st-q')?.addEventListener('input', (e) => { PF.sq = e.target.value; savePF(); renderStudents(); });
    app.querySelector('#onlyNeedsCheck')?.addEventListener('change', (e) => { PF.needsOnly = e.target.checked; savePF(); renderStudents(); });

    app.querySelectorAll('[data-release-number]').forEach((btn) => btn.addEventListener('click', async () => {
      if (!window.confirm(`${btn.dataset.owner || '기존 등록자'} 계정에서 학번 ${btn.dataset.number}을(를) 해제할까요?\n해당 학생은 다음 접속 때 학번을 다시 입력해야 합니다. 기존 실습 기록은 유지됩니다.`)) return;
      try { await API.releaseStudentNumber(btn.dataset.releaseNumber); toast('기존 학번을 해제했습니다. 신청 학생에게 학생 정보를 다시 저장하라고 안내하세요.', 'ok'); viewProfessor(); }
      catch (e) { toast(e.message || '학번 해제 실패', 'warn'); }
    }));
    app.querySelectorAll('[data-resolve-conflict]').forEach((btn) => btn.addEventListener('click', async () => {
      try { await API.resolveStudentNumberConflict(btn.dataset.resolveConflict); toast('확인 완료로 처리했습니다.', 'ok'); viewProfessor(); }
      catch (e) { toast(e.message || '처리 실패', 'warn'); }
    }));
    app.querySelectorAll('[data-faculty]').forEach((btn) => btn.addEventListener('click', async () => {
      if (btn.dataset.revokeFaculty && !window.confirm('이 교수자의 권한과 분반 배정을 회수할까요?\n배정된 학생은 새 지도교수를 선택한 후 다시 승인받아야 합니다.')) return;
      try {
        await API.reviewFaculty(btn.dataset.faculty, btn.dataset.decision);
        toast(btn.dataset.decision === 'approved' ? '교수자 권한을 승인했습니다.' : (btn.dataset.revokeFaculty ? '교수자 권한과 분반 배정을 회수했습니다.' : '신청을 거절했습니다.'), 'ok');
        viewProfessor();
      } catch (e) { toast(e.message || '처리 실패', 'warn'); }
    }));
    app.querySelectorAll('[data-save-classes]').forEach((btn) => btn.addEventListener('click', async () => {
      const selected = [...app.querySelectorAll(`[data-class-for="${btn.dataset.saveClasses}"]:checked`)].map((x) => x.value);
      if (selected.length > 2) return toast('교수자당 최대 2개 분반만 배정할 수 있습니다.', 'warn');
      try { await API.assignFacultyClasses(btn.dataset.saveClasses, selected); toast('담당 분반을 저장했습니다.', 'ok'); viewProfessor(); }
      catch (e) { toast(e.message || '분반 배정 실패', 'warn'); }
    }));

    function bindStudentRows() {
      const box = app.querySelector('#studentList');
      box.querySelectorAll('[data-student]').forEach((btn) => btn.addEventListener('click', async () => {
        if (btn.dataset.decision === 'rejected' && !window.confirm('이 학생의 사용 신청을 거절할까요? 거절된 학생은 사례에 입장할 수 없습니다.')) return;
        try { await API.reviewStudent(btn.dataset.student, btn.dataset.decision); toast(btn.dataset.decision === 'approved' ? '학생 사용을 승인했습니다.' : '학생 사용을 거절했습니다.', 'ok'); viewProfessor(); }
        catch (e) { toast(e.message || '처리 실패', 'warn'); }
      }));
      box.querySelectorAll('[data-move-student]').forEach((btn) => btn.addEventListener('click', async () => {
        const className = box.querySelector(`[data-student-class="${btn.dataset.moveStudent}"]`).value;
        if (!className) return toast('옮길 분반을 선택하세요.', 'warn');
        try { await API.manageStudentRoute(btn.dataset.moveStudent, className); toast('학생 분반과 지도교수를 변경했습니다.', 'ok'); viewProfessor(); }
        catch (e) { toast(e.message || '분반 변경 실패', 'warn'); }
      }));
      box.querySelectorAll('[data-unassign-student]').forEach((btn) => btn.addEventListener('click', async () => {
        if (!window.confirm('이 학생의 분반과 지도교수 배정을 해제할까요? 기존 실습 기록은 유지됩니다.')) return;
        try { await API.manageStudentRoute(btn.dataset.unassignStudent, ''); toast('학생의 분반 배정을 해제했습니다.', 'ok'); viewProfessor(); }
        catch (e) { toast(e.message || '분반 해제 실패', 'warn'); }
      }));
      box.querySelectorAll('[data-edit-student]').forEach((btn) => btn.addEventListener('click', () => {
        const r = students.find((x) => x.user_id === btn.dataset.editStudent);
        const row = box.querySelector(`[data-student-row="${btn.dataset.editStudent}"]`);
        if (!r || !row) return;
        row.innerHTML = `<div class="student-edit">
          <label>이름<input data-f="fullName" value="${esc(r.full_name || '')}"></label>
          <label>학번<input data-f="studentNumber" inputmode="numeric" placeholder="모르면 비워두기" value="${esc(r.student_number || '')}"></label>
          <label>학년<select data-f="grade">${[1, 2, 3, 4].map((g) => `<option value="${g}" ${Number(r.grade) === g ? 'selected' : ''}>${g}학년</option>`).join('')}</select></label>
          <label>분반<select data-f="className">${CLASS_NAMES.map((c) => `<option value="${c}" ${r.class_name === c ? 'selected' : ''}>${c} · ${esc(facultyRoutes.find((f) => f.classes.includes(c))?.full_name || '교수 미배정')}</option>`).join('')}</select></label>
          <span><button class="btn tiny" data-save-edit>저장·승인</button><button class="btn tiny ghost" data-cancel-edit>취소</button></span>
          <small class="muted">저장하면 해당 분반 지도교수가 배정되고 바로 사용 승인됩니다. 학번이 다른 계정과 겹치면 그 계정을 알려 드립니다.</small>
        </div>`;
        const val = (f) => row.querySelector(`[data-f="${f}"]`).value.trim();
        row.querySelector('[data-cancel-edit]').addEventListener('click', renderStudents);
        row.querySelector('[data-save-edit]').addEventListener('click', async () => {
          try {
            await API.adminUpdateStudent(r.user_id, { fullName: val('fullName'), studentNumber: val('studentNumber'), grade: val('grade'), className: val('className') });
            toast(`${val('fullName')} 학생 정보를 저장하고 승인했습니다.`, 'ok'); viewProfessor();
          } catch (e) { toast(e.message || '학생 정보 수정 실패', 'warn'); }
        });
      }));
    }

    renderTable();
    renderStudents();
  }

  /* ================= 모달: 학생 작성 내용 보기(교수자 채점) =================
   * order: 현재 표에 보이는 기록 id 순서 — 이전/다음, 저장 후 다음으로 이동하며 연속 채점 */
  async function openSessionDetail(sid, order = [], onSaved = () => {}) {
    const modal = document.getElementById('profModal');
    if (!modal) return;
    let dirty = false;
    const close = () => {
      if (dirty && !window.confirm('저장하지 않은 점수가 있습니다. 닫을까요?')) return;
      modal.classList.remove('open'); document.removeEventListener('keydown', onKey);
    };
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.removeEventListener('keydown', onKey);
    document.addEventListener('keydown', onKey);
    modal.innerHTML = `<div class="modal detail"><p class="muted">불러오는 중…</p></div>`;
    modal.classList.add('open');
    modal.onclick = (e) => { if (e.target === modal) close(); };
    const idx = order.indexOf(sid);
    const prevId = idx > 0 ? order[idx - 1] : null;
    const nextId = idx >= 0 && idx < order.length - 1 ? order[idx + 1] : null;
    const go = (id) => { document.removeEventListener('keydown', onKey); openSessionDetail(id, order, onSaved); };
    try {
      const { session, score, caseTitle, findings, priorities, answerKey = [], priorityHighRiskHits = 0, student = {} } = await API.sessionDetail(sid);
      const sb = session.sbar || {};
      const rf = session.reflection || {};
      const notWritten = '<span class="muted">미작성</span>';
      const missed = answerKey.filter((e) => !e.found);
      modal.innerHTML = `
        <div class="modal detail">
          <button class="modal-x" id="mx" title="닫기(Esc)">✕</button>
          <div class="detail-nav">
            <button class="btn tiny ghost" id="dPrev" ${prevId ? '' : 'disabled'}>◀ 이전</button>
            <span class="muted">${idx >= 0 ? `${idx + 1} / ${order.length}` : ''}</span>
            <button class="btn tiny ghost" id="dNext" ${nextId ? '' : 'disabled'}>다음 ▶</button>
          </div>
          <div class="case-tag big">CASE ${esc(session.caseId)}</div>
          <h3>${esc(student.name || (session.members || [])[0] || '학생')} <small class="muted">${esc(student.number || '')}</small></h3>
          <p class="muted">${esc(caseTitle)} · ${esc(session.className)} · ${esc(session.teamName || '조 미입력')}${session.members?.length ? ' · 조원 ' + esc(session.members.join(', ')) : ''}
            · <span class="status-pill ${session.status}">${STATUS_LABEL[session.status] || esc(session.status)}</span>
            ${session.submittedAt ? ` · 제출 ${esc(fmtTime(session.submittedAt))}` : ''}</p>
          ${session.status === 'exploring' ? '<p class="preview-note">아직 제출하지 않은 기록입니다. 학생이 작성 중일 수 있습니다.</p>' : ''}

          <h4>오류 탐지 기록 <span class="muted">${findings.length}건 · 정답 ${answerKey.length - missed.length}/${answerKey.length} 찾음</span></h4>
          ${findings.length ? `<table class="find-table">
            <thead><tr><th>#</th><th>위치/단서</th><th>왜 위험</th><th>조치</th><th>고위험</th></tr></thead>
            <tbody>${findings.map((f, i) => `<tr>
              <td>${i + 1}</td>
              <td><b>${esc(f.label)}</b><br><span class="muted">${esc(f.location)}</span></td>
              <td>${esc(f.why)}</td><td>${esc(f.action)}</td>
              <td>${f.isHighRiskGuess ? '⚠️' : ''}</td></tr>`).join('')}</tbody>
          </table>` : '<p class="muted">기록된 오류가 없습니다.</p>'}
          ${answerKey.length ? `<details class="answer-key" ${missed.length ? 'open' : ''}><summary>정답 대비 결과 — 놓친 오류 ${missed.length}개</summary>
            <table class="find-table"><thead><tr><th>코드</th><th>영역</th><th>정답 단서</th><th>결과</th></tr></thead><tbody>
            ${answerKey.map((e) => `<tr class="${e.found ? 'row-found' : 'row-miss'}"><td>${esc(e.code)}${e.highRisk ? ' ★' : ''}</td><td>${esc(e.area)}</td><td>${esc(e.clue)}</td>
              <td>${e.found ? (e.documented ? '✓ 찾음' : '△ 찾음(기록 미흡·절반)') : '— 놓침'}</td></tr>`).join('')}
            </tbody></table><p class="muted small-note">★ 고위험 오류</p></details>` : ''}

          <h4>상위 5개 우선순위 <span class="muted">선택 순서 · 고위험 관련 ${priorityHighRiskHits}/${Math.min(5, priorities.length) || 5}</span></h4>
          ${priorities.length ? `<ol class="prio-review">${priorities.map((p) => `<li>${esc(p.label)}</li>`).join('')}</ol>` : '<p class="muted">우선순위를 선택하지 않았습니다.</p>'}

          <h4>SBAR 보고</h4>
          <div class="sbar-review">
            ${['s', 'b', 'a', 'r'].map((k) => `<p><b>${k.toUpperCase()}</b> ${esc(sb[k]) || notWritten}</p>`).join('')}
          </div>

          <h4>개인 성찰</h4>
          <div class="reflect-review">
            ${REFLECT_ROWS.map(([k, label]) => `<p><b>${esc(label)}</b><br>${esc(rf[k]) || notWritten}</p>`).join('')}
          </div>

          <h4>채점</h4>
          <div class="detail-score">
            ${score.rubric.map((rb) => `
              <div class="detail-score-row">
                <span>${esc(rb.label)} <small class="muted">(${rb.max}점${rb.auto ? ' · 자동' : ''})</small>${rb.desc ? `<small class="rubric-desc">${esc(rb.desc)}</small>` : ''}</span>
                ${rb.auto
                  ? `<b>${score.breakdown[rb.key]}</b>`
                  : `<span class="score-input"><input class="mini-in" data-dk="${rb.key}" type="number" min="0" max="${rb.max}" step="0.5" value="${score.breakdown[rb.key] ?? 0}"/>
                      <button class="btn tiny ghost" data-full="${rb.key}" data-max="${rb.max}" title="만점 입력">만점</button></span>`}
              </div>`).join('')}
            <p class="detail-total">총점 <b id="dTotal">${score.total}</b> / 100</p>
          </div>
          <div class="modal-actions">
            <button class="btn ghost" id="close2">닫기</button>
            <button class="btn" id="saveDetail">채점 저장</button>
            ${nextId ? '<button class="btn primary" id="saveNext">저장 후 다음 ▶</button>' : ''}
          </div>
        </div>`;
      const autoSum = score.rubric.filter((r) => r.auto).reduce((s, r) => s + Number(score.breakdown[r.key] || 0), 0);
      const recalc = () => {
        let t = autoSum;
        modal.querySelectorAll('[data-dk]').forEach((inp) => { t += Math.max(0, Math.min(Number(inp.value) || 0, Number(inp.max))); });
        modal.querySelector('#dTotal').textContent = Math.round(t * 10) / 10;
      };
      modal.querySelectorAll('[data-dk]').forEach((inp) => inp.addEventListener('input', () => { dirty = true; recalc(); }));
      modal.querySelectorAll('[data-full]').forEach((b) => b.addEventListener('click', () => {
        modal.querySelector(`[data-dk="${b.dataset.full}"]`).value = b.dataset.max; dirty = true; recalc();
      }));
      modal.querySelector('#mx').addEventListener('click', close);
      modal.querySelector('#close2').addEventListener('click', close);
      modal.querySelector('#dPrev').addEventListener('click', () => { if (!dirty || window.confirm('저장하지 않은 점수가 있습니다. 이동할까요?')) go(prevId); });
      modal.querySelector('#dNext').addEventListener('click', () => { if (!dirty || window.confirm('저장하지 않은 점수가 있습니다. 이동할까요?')) go(nextId); });
      const save = async () => {
        const manualScores = {};
        for (const inp of modal.querySelectorAll('[data-dk]')) {
          const v = Number(inp.value);
          if (inp.value === '' || Number.isNaN(v) || v < 0 || v > Number(inp.max)) { toast(`점수는 0~${inp.max}점 사이로 입력하세요.`, 'warn'); inp.focus(); return null; }
          manualScores[inp.dataset.dk] = v;
        }
        const res = await API.saveManual(sid, manualScores);
        dirty = false;
        onSaved(sid, res);
        toast(`${student.name || '학생'} 채점 저장됨 ✓ (${res.score.total}점)`, 'ok');
        return res;
      };
      modal.querySelector('#saveDetail').addEventListener('click', async () => {
        try { if (await save()) { modal.classList.remove('open'); document.removeEventListener('keydown', onKey); } }
        catch (e) { toast(e.message || '채점 저장 실패', 'warn'); }
      });
      modal.querySelector('#saveNext')?.addEventListener('click', async () => {
        try { if (await save()) go(nextId); }
        catch (e) { toast(e.message || '채점 저장 실패', 'warn'); }
      });
      modal.querySelector('.modal.detail')?.scrollTo?.(0, 0);
    } catch (e) {
      modal.innerHTML = `<div class="modal detail"><button class="modal-x" id="mx">✕</button><p class="muted">불러오지 못했습니다: ${esc(e.message)}</p></div>`;
      modal.querySelector('#mx').addEventListener('click', () => { modal.classList.remove('open'); document.removeEventListener('keydown', onKey); });
    }
  }

  /* ---------------- 라우팅 ---------------- */
  document.querySelectorAll('[data-route]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = b.dataset.route;
      if (r === 'home') viewHome();
      else if (r === 'professor') { API.isInstructor() ? viewProfessor() : openAdminLogin(); }
    }));
  document.getElementById('homeBtn').addEventListener('click', viewHome);
  refreshAdminNav();

  // 초기 진입: Google OAuth 콜백 세션을 먼저 복원
  API.init().then(async () => {
    refreshAdminNav();
    const mode = API.consumeLoginMode();
    if (mode === 'admin') {
      if (API.isInstructor()) return viewProfessor();
      return viewAdminAccountMismatch();
    }
    viewHome();
  }).catch(() => viewLogin('student'));
})();
