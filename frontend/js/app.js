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

  /* ================= 화면: 홈(사례 선택) ================= */
  async function viewHome() {
    document.body.classList.remove('in-room');
    S.cases = await API.listCases();
    const themeName = { surgical: '수술·낙상', sepsis: '패혈증·격리', stroke: '뇌졸중·연하', diabetes: '당뇨·투약' };
    app.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <div class="eyebrow"><span class="dot-ico">◆</span> KYUNGMIN UNIVERSITY · 4 CASES · 2.5D VR</div>
          <h1>병실로 들어가 <span>숨은 환자안전 오류</span>를 찾으세요</h1>
          <p>조별로 병실을 관찰해 오류를 기록하고, 즉시 위해가 될 상위 5개를 우선순위화한 뒤 SBAR로 보고합니다.
             총 4개 사례 · 사례당 18개 오류 · 100점 루브릭 자동/수동 채점.</p>
        </div>
        <aside class="institution-card" aria-label="경민대학교 간호학과 통합시뮬레이션수업">
          <img src="assets/kyungmin-logo.png" alt="경민대학교 로고" />
          <div>
            <span>경민대학교 간호학과</span>
            <strong>통합시뮬레이션수업</strong>
            <small>기획·제작 · 김정호 교수</small>
          </div>
        </aside>
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
  }

  /* ================= 화면: 조 정보 입력 ================= */
  async function viewIntake(caseId) {
    S.caseId = caseId;
    S.caseData = await API.getCase(caseId);
    const c = S.caseData;
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
          <h4>조 정보</h4>
          <div class="form-grid">
            <label>반 <input id="f-class" placeholder="예: 1반" /></label>
            <label>조 이름 <input id="f-team" placeholder="예: 3조" /></label>
            <label class="full">조원(쉼표로 구분) <input id="f-members" placeholder="홍길동, 김간호, ..." /></label>
          </div>
          <button class="btn primary lg" id="startBtn">병실 입장 →</button>
        </div>
      </div>`;
    app.querySelector('[data-route="home"]').addEventListener('click', viewHome);
    app.querySelector('#startBtn').addEventListener('click', async () => {
      const members = app.querySelector('#f-members').value.split(',').map((s) => s.trim()).filter(Boolean);
      S.session = await API.createSession({
        caseId,
        className: app.querySelector('#f-class').value.trim(),
        teamName: app.querySelector('#f-team').value.trim(),
        members,
      });
      saveLocal();
      viewRoom();
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
      meta: { caseId: c.id, title: c.title, subtitle: c.subtitle, count: c.objects.length },
      onSelect: openInspect,
      onInfo: openCaseInfo,
      onList: openFindingsList,
      onFinish: viewPriority,
      onExit: viewHome,
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
      await upsertFinding(objectId, { flagged: false });
      close(); toast('점검 완료 — 오류 없음으로 표시'); S.room.refreshBadges();
    });
    modal.querySelector('#i-save').addEventListener('click', async () => {
      const loc = modal.querySelector('#i-loc').value.trim();
      if (!loc) return toast('위치/단서를 입력하세요', 'warn');
      await upsertFinding(objectId, {
        flagged: true,
        location: loc,
        why: modal.querySelector('#i-why').value.trim(),
        action: modal.querySelector('#i-act').value.trim(),
        isHighRiskGuess: modal.querySelector('#i-high').checked,
      });
      close(); toast('오류 기록됨 ✓', 'ok');
      updateProgress(); S.room.refreshBadges();
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
    S.session.findings = findings;
    S.session = await API.saveFindings(S.session.id, findings);
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
    document.body.classList.remove('in-room');
    const flagged = (S.session.findings || []).filter((f) => f.flagged);
    if (flagged.length === 0) return toast('먼저 병실에서 오류를 기록하세요', 'warn');
    const labelOf = (id) => S.caseData.objects.find((o) => o.id === id)?.label || id;
    const chosen = new Set(S.session.priorities || []);
    app.innerHTML = `
      <div class="page-narrow">
        <a class="back" id="backRoom">← 병실로</a>
        <div class="panel">
          <h2>상위 5개 오류 우선순위화</h2>
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
      S.session = await API.savePriorities(S.session.id, order);
      viewSbar();
    });
  }

  /* ================= 화면: SBAR ================= */
  async function viewSbar() {
    const sb = S.session.sbar || {};
    const rows = [
      ['s', 'S 상황', '현재 가장 위험하다고 판단한 문제를 한 문장으로'],
      ['b', 'B 배경', '진단, 수술/검사/처방, 관련 위험요인을 간단히'],
      ['a', 'A 사정', '관찰한 객관적 단서와 위험 판단근거'],
      ['r', 'R 제안', '즉시 필요한 간호조치, 보고/처방 확인, 추가 사정 제안'],
    ];
    app.innerHTML = `
      <div class="page-narrow">
        <a class="back" id="backPrio">← 우선순위화로</a>
        <div class="panel">
          <h2>SBAR 구두보고 준비</h2>
          <p class="muted">가장 위험한 오류 1~2개를 SBAR 형식으로 교수자에게 보고합니다. 2분 이내로 작성하세요.</p>
          <div class="sbar-form">
            ${rows.map(([k, label, ph]) => `
              <div class="sbar-row">
                <span class="sbar-k">${label}</span>
                <textarea data-k="${k}" placeholder="${ph}">${esc(sb[k])}</textarea>
              </div>`).join('')}
          </div>
          <button class="btn primary lg" id="toReflect">개인 성찰 →</button>
        </div>
      </div>`;
    app.querySelector('#backPrio').addEventListener('click', viewPriority);
    app.querySelector('#toReflect').addEventListener('click', async () => {
      const sbar = {};
      app.querySelectorAll('[data-k]').forEach((t) => (sbar[t.dataset.k] = t.value.trim()));
      S.session = await API.saveSbar(S.session.id, sbar);
      viewReflection();
    });
  }

  /* ================= 화면: 개인 성찰 ================= */
  async function viewReflection() {
    const r = S.session.reflection || {};
    const rows = [
      ['firstAction', '가장 먼저 조치해야 한다고 판단한 오류'],
      ['rationale', '그렇게 판단한 근거'],
      ['missed', '우리 조가 놓쳤을 가능성이 있는 오류'],
      ['apply', '실제 임상실습에서 적용할 행동 1가지'],
      ['teamwork', '팀 의사소통에서 좋았던 점/개선할 점'],
    ];
    app.innerHTML = `
      <div class="page-narrow">
        <a class="back" id="backSbar">← SBAR로</a>
        <div class="panel">
          <h2>개인 성찰 기록</h2>
          <div class="reflect-form">
            ${rows.map(([k, label]) => `
              <label>${label}<textarea data-r="${k}">${esc(r[k])}</textarea></label>`).join('')}
          </div>
          <button class="btn primary lg" id="submitAll">제출하고 결과 보기 →</button>
        </div>
      </div>`;
    app.querySelector('#backSbar').addEventListener('click', viewSbar);
    app.querySelector('#submitAll').addEventListener('click', async () => {
      const refl = {};
      app.querySelectorAll('[data-r]').forEach((t) => (refl[t.dataset.r] = t.value.trim()));
      S.session = await API.saveReflection(S.session.id, refl);
      await API.submit(S.session.id);
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
            <h3>우리 조 SBAR</h3>
            <div class="sbar-review">
              ${['s','b','a','r'].map((k) => `<p><b>${k.toUpperCase()}</b> ${esc((S.session.sbar||{})[k]) || '<span class="muted">미작성</span>'}</p>`).join('')}
            </div>
            <div class="result-actions">
              <button class="btn ghost" id="again">다른 사례 하기</button>
              <button class="btn primary" id="toProf">교수 대시보드에서 채점</button>
            </div>
          </div>
        </div>
      </div>`;
    app.querySelector('#again').addEventListener('click', viewHome);
    app.querySelector('#toProf').addEventListener('click', () => viewProfessor(S.caseId));
  }

  /* ---------- 관리자 로그인 ---------- */
  function refreshAdminNav() {
    const nav = document.getElementById('adminNav');
    if (nav) nav.textContent = API.isAdmin() ? '관리자 ✓' : '관리자 모드';
  }
  function openAdminLogin() {
    document.body.classList.remove('in-room');
    app.innerHTML = `
      <div class="page-narrow">
        <div class="panel" style="max-width:420px;margin:60px auto;">
          <div class="eyebrow"><span class="dot-ico">◆</span> ADMIN</div>
          <h2>관리자 로그인</h2>
          <p class="muted">채점 대시보드·데이터 내보내기는 관리자 전용입니다. 관리자 코드를 입력하세요.</p>
          <div class="form-grid"><label class="full">관리자 코드
            <input id="admCode" type="password" placeholder="관리자 코드" autofocus /></label></div>
          <button class="btn primary lg full" id="admGo">로그인</button>
          <p class="muted" style="font-size:12px;margin-top:12px;">기본 코드는 서버 환경변수 <code>ADMIN_CODE</code>로 설정합니다(기본값 roe-admin).</p>
        </div>
      </div>`;
    const go = async () => {
      try {
        await API.adminLogin(app.querySelector('#admCode').value.trim());
        refreshAdminNav(); toast('관리자 로그인 ✓', 'ok'); viewProfessor();
      } catch (e) { toast(e.message || '로그인 실패', 'warn'); }
    };
    app.querySelector('#admGo').addEventListener('click', go);
    app.querySelector('#admCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
  }

  /* ================= 화면: 관리자 대시보드 ================= */
  async function viewProfessor(preCase) {
    if (!API.isAdmin()) return openAdminLogin();
    document.body.classList.remove('in-room');
    let rows;
    try { rows = await API.professorSessions(preCase ? { caseId: preCase } : {}); }
    catch (e) { API.adminLogout(); refreshAdminNav(); return openAdminLogin(); }
    const q = preCase ? { caseId: preCase } : {};
    app.innerHTML = `
      <div class="page-wide">
        <div class="result-head">
          <h2>관리자 대시보드</h2>
          <button class="btn ghost" id="admOut">로그아웃</button>
        </div>
        <div class="export-bar">
          <span class="muted">데이터 내보내기:</span>
          <a class="btn tiny" id="exXlsx">📊 Excel(.xlsx)</a>
          <a class="btn tiny" id="exCsv">📄 CSV</a>
          <a class="btn tiny" id="exDoc">📝 Word(.doc)</a>
          <a class="btn tiny" id="exPdf" target="_blank">🖨️ PDF(인쇄)</a>
          <span class="muted export-note">한글(Hancom)은 xlsx·doc·csv를 그대로 열 수 있습니다.</span>
        </div>
        <div class="prof-filter">
          <label>사례
            <select id="pf-case">
              <option value="">전체</option>
              ${['A','B','C','D'].map((x) => `<option value="${x}" ${preCase===x?'selected':''}>CASE ${x}</option>`).join('')}
            </select>
          </label>
          <span class="muted">${rows.length}개 조 세션</span>
        </div>
        <table class="prof-table">
          <thead><tr>
            <th>사례</th><th>반</th><th>조</th><th>탐지</th><th>고위험</th>
            <th>탐지40</th><th>고위험15</th><th>우선15</th><th>SBAR15</th><th>팀10</th><th>성찰5</th>
            <th>총점</th><th></th>
          </tr></thead>
          <tbody id="pf-body">
            ${rows.map(rowHtml).join('') || '<tr><td colspan="13" class="muted">세션이 없습니다.</td></tr>'}
          </tbody>
        </table>
      </div>`;
    app.querySelector('#pf-case').addEventListener('change', (e) => viewProfessor(e.target.value));
    app.querySelector('#admOut').addEventListener('click', () => { API.adminLogout(); refreshAdminNav(); viewHome(); });
    // 내보내기 링크(다운로드는 헤더를 못 실으므로 code를 쿼리로 전달)
    app.querySelector('#exXlsx').href = API.exportUrl('xlsx', q);
    app.querySelector('#exCsv').href = API.exportUrl('csv', q);
    app.querySelector('#exDoc').href = API.exportUrl('doc', q);
    app.querySelector('#exPdf').href = API.exportUrl('html', q);
    bindProfRows();

    function rowHtml(r) {
      const b = r.breakdown || {};
      const man = (k, max) => `<input class="mini-in" data-sid="${r.id}" data-k="${k}" type="number" min="0" max="${max}" value="${b[k] ?? 0}"/>`;
      return `<tr data-sid="${r.id}">
        <td><b>CASE ${r.caseId}</b></td><td>${esc(r.className)}</td><td>${esc(r.teamName)}</td>
        <td>${r.detectedCount}</td><td>${r.highRiskHit}/5</td>
        <td class="ro">${b.detection ?? 0}</td><td class="ro">${b.highRisk ?? 0}</td>
        <td>${man('priority',15)}</td><td>${man('sbar',15)}</td><td>${man('teamwork',10)}</td><td>${man('reflection',5)}</td>
        <td class="total"><b>${r.total ?? '-'}</b></td>
        <td><button class="btn tiny" data-save="${r.id}">저장</button></td>
      </tr>`;
    }
    function bindProfRows() {
      app.querySelectorAll('[data-save]').forEach((btn) => {
        btn.addEventListener('click', async () => {
          const sid = btn.dataset.save;
          const manualScores = {};
          app.querySelectorAll(`.mini-in[data-sid="${sid}"]`).forEach((inp) => {
            manualScores[inp.dataset.k] = Number(inp.value) || 0;
          });
          const res = await API.saveManual(sid, manualScores);
          const tr = app.querySelector(`tr[data-sid="${sid}"] .total b`);
          if (tr) tr.textContent = res.score.total;
          toast('채점 저장됨 ✓', 'ok');
        });
      });
    }
  }

  /* ---------------- 라우팅 ---------------- */
  document.querySelectorAll('[data-route]').forEach((b) =>
    b.addEventListener('click', () => {
      const r = b.dataset.route;
      if (r === 'home') viewHome();
      else if (r === 'professor') { API.isAdmin() ? viewProfessor() : openAdminLogin(); }
    }));
  document.getElementById('homeBtn').addEventListener('click', viewHome);
  refreshAdminNav();

  // 초기 진입
  viewHome();
})();
