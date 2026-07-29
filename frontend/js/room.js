/* =====================================================================
 *  Room.js — 실사 배경 VR형 병실 (경민대 Room of Error 스타일)
 *  - 사례별 포토리얼 병실 배경(assets/room_<CASE>.png) 위에
 *    각 오브젝트의 실제 위치(x/y%)에 번호 원형 핫스팟 마커를 오버레이
 *  - 16:9 스테이지로 마커가 사진 속 물체에 정확히 맵핑됨
 *  - 상단 툴바 · 하단 마커 바로가기 · 좌하단 컨트롤 · 우하단 줌
 *  - 마우스 패럴랙스 틸트, 마커 핑 애니메이션으로 역동적 구성
 * ===================================================================== */
(function (global) {
  'use strict';

  /* 프롭 아이콘(모달 헤더 등에서 사용) */
  const ICONS = {
    bed:'🛏️', id:'🪪', monitor:'📟', pump:'💉', iv:'💧', wound:'🩹', drain:'🧪',
    foley:'🟡', table:'🛎️', bell:'🔔', sign:'⚠️', scd:'🦵', spiro:'🫁', sharps:'🗑️',
    o2:'🫧', cannula:'👃', blood:'🩸', ppe:'🥽', stetho:'🩺', cup:'🥤', chart:'📋',
    io:'💦', pills:'💊', hazard:'⚠️', wheelchair:'🦽', suction:'🌀', syringe:'💉',
    meds:'💊', emergency:'🧯', food:'🍽️', glucose:'🩸', pen:'🖊️'
  };

  class Room {
    constructor(container, opts = {}) {
      this.el = container;
      this.onSelect = opts.onSelect || (() => {});
      this.onInfo = opts.onInfo || (() => {});
      this.onFinish = opts.onFinish || (() => {});
      this.onList = opts.onList || (() => {});
      this.onExit = opts.onExit || (() => {});
      this.onPractice = opts.onPractice || (() => {});
      this.getState = opts.getState || (() => ({}));
      this.meta = opts.meta || {};              // {caseId,title,subtitle,count}
      this.isMobile = window.matchMedia('(max-width: 600px)').matches;
      this.tilt = !this.isMobile; this.zoom = 1; this.showMarks = true;
      this.cam = { x: 0, y: 0 };
      this._build();
    }

    _build() {
      const m = this.meta;
      const bg = `assets/room_${m.caseId}.png`;
      this.el.classList.add('vr-room');
      this.el.innerHTML = `
        <div class="vr-scene">
          <div class="vr-stage" id="stage">
            <img class="vr-bg" src="${bg}" alt="병실" draggable="false"
                 onerror="this.onerror=null;this.src='assets/room.png'" />
            <div class="vr-markers" id="markers"></div>
          </div>
        </div>

        <div class="vr-top">
          <div class="vr-brand">
            <button class="vr-logo" id="btnExit" title="사례 선택으로"><img src="assets/kyungmin-logo.png" alt="경민대학교" /></button>
            <div>
              <strong>경민대학교 간호학과 통합시뮬레이션수업</strong>
              <em><span class="vr-credit">Room of Errors · 김정호 교수 제작</span><span class="vr-case"> · CASE ${m.caseId} · ${m.subtitle || ''}</span></em>
            </div>
          </div>
          <div class="vr-tools">
            <span class="vr-progress"><i class="on-dot"></i> 확인 <b id="vrFound">0</b>/${m.count}</span>
            <button class="vr-btn" id="btnInfo">사례정보</button>
            <button class="vr-btn" id="btnPractice">💡 연습 힌트</button>
            <button class="vr-btn" id="btnList">기록지</button>
            <button class="vr-btn" id="btnHide">표식 숨기기</button>
            <button class="vr-btn primary" id="btnFinish">관찰 종료 →</button>
          </div>
        </div>

        <div class="vr-jump">
          <span class="vr-jump-label">표식 바로가기</span>
          <div class="vr-jump-btns" id="jumpBtns"></div>
        </div>
        <div class="vr-jump-hint">${this.isMobile ? '← 좌우로 밀어 병실 탐색 · 번호를 눌러 바로가기 →' : `↔ 아래 1–${m.count} 바로가기 또는 표식을 클릭`}</div>

        <div class="vr-controls">
          <button class="vr-ctl on" id="ctlTilt">기울여 보기</button>
          <button class="vr-ctl" id="ctlFull">전체화면</button>
          <button class="vr-ctl" id="ctlVR">VR 고글</button>
          <button class="vr-ctl" id="ctlMotion">모션 줄임</button>
        </div>
        <div class="vr-zoom">
          <button id="zOut">−</button><span id="zVal">100%</span><button id="zIn">+</button>
        </div>`;

      this.stage = this.el.querySelector('#stage');
      this.markersEl = this.el.querySelector('#markers');
      this.jumpEl = this.el.querySelector('#jumpBtns');
      this._bindChrome();
      this._bindParallax();
      if (this.isMobile) this.el.classList.add('mobile-room');
    }

    _bindChrome() {
      this.el.querySelector('#btnInfo').onclick = () => this.onInfo();
      this.el.querySelector('#btnList').onclick = () => this.onList();
      this.el.querySelector('#btnExit').onclick = () => this.onExit();
      this.el.querySelector('#btnFinish').onclick = () => this.onFinish();
      const prac = this.el.querySelector('#btnPractice');
      prac.onclick = () => { const on = this.onPractice(); prac.classList.toggle('on', on); prac.textContent = on ? '💡 연습 힌트 ✓' : '💡 연습 힌트'; };
      const hide = this.el.querySelector('#btnHide');
      hide.onclick = () => {
        this.showMarks = !this.showMarks;
        this.markersEl.classList.toggle('hidden', !this.showMarks);
        hide.textContent = this.showMarks ? '표식 숨기기' : '표식 보이기';
        hide.classList.toggle('primary', !this.showMarks);
      };
      const tilt = this.el.querySelector('#ctlTilt');
      tilt.classList.toggle('on', this.tilt);
      tilt.onclick = () => { this.tilt = !this.tilt; tilt.classList.toggle('on', this.tilt); if (!this.tilt) this._resetCam(); };
      const motion = this.el.querySelector('#ctlMotion');
      motion.onclick = () => { this.el.classList.toggle('reduce-motion'); motion.classList.toggle('on'); };
      this.el.querySelector('#ctlVR').onclick = () => this.el.classList.toggle('vr-goggle');
      this.el.querySelector('#ctlFull').onclick = () => {
        if (!document.fullscreenElement) this.el.requestFullscreen?.();
        else document.exitFullscreen?.();
      };
      const zv = this.el.querySelector('#zVal');
      this._applyZoom = () => { zv.textContent = Math.round(this.zoom * 100) + '%'; this._applyCam(); };
      this.el.querySelector('#zIn').onclick = () => { this.zoom = Math.min(1.6, this.zoom + 0.1); this._applyZoom(); };
      this.el.querySelector('#zOut').onclick = () => { this.zoom = Math.max(0.85, this.zoom - 0.1); this._applyZoom(); };
    }

    _bindParallax() {
      const onMove = (px, py) => {
        if (!this.tilt) return;
        const r = this.el.getBoundingClientRect();
        this.cam.x = ((px - r.left) / r.width - 0.5);
        this.cam.y = ((py - r.top) / r.height - 0.5);
        this._applyCam();
      };
      this.el.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
      this.el.addEventListener('mouseleave', () => this._resetCam());
      this.el.addEventListener('touchmove', (e) => { const t = e.touches[0]; if (t) onMove(t.clientX, t.clientY); }, { passive: true });
    }
    _resetCam() { this.cam.x = 0; this.cam.y = 0; this._applyCam(); }
    _applyCam() {
      if (!this.stage) return;
      const rx = (-this.cam.y * 5).toFixed(2), ry = (this.cam.x * 7).toFixed(2);
      const tx = (-this.cam.x * 20).toFixed(1), ty = (-this.cam.y * 12).toFixed(1);
      this.stage.style.transform =
        `perspective(1500px) rotateX(${rx}deg) rotateY(${ry}deg) translate3d(${tx}px, ${ty}px, 0) scale(${this.zoom})`;
    }

    render(objects) {
      this.objects = objects;
      this.markersEl.innerHTML = '';
      this.jumpEl.innerHTML = '';
      objects.forEach((o, i) => {
        const mk = document.createElement('button');
        mk.className = 'vr-mark';
        mk.dataset.id = o.id;
        mk.style.left = o.x + '%';
        mk.style.top = o.y + '%';
        mk.style.setProperty('--delay', (i * 0.14).toFixed(2) + 's');
        mk.innerHTML = `
          <span class="vr-ping"></span>
          <span class="vr-num">${i + 1}</span>
          <span class="vr-mark-tip">${ICONS[o.icon] || '•'} ${o.label}</span>`;
        mk.onclick = (e) => { e.stopPropagation(); this.onSelect(o.id); this._focusMarker(o.id); };
        this.markersEl.appendChild(mk);

        const jb = document.createElement('button');
        jb.className = 'vr-jbtn'; jb.dataset.id = o.id; jb.textContent = i + 1;
        jb.title = o.label;
        jb.onclick = () => { this.onSelect(o.id); this._focusMarker(o.id); };
        this.jumpEl.appendChild(jb);
      });
      this.refreshBadges();
      this._applyCam();
    }

    _focusMarker(id) {
      this.markersEl.querySelectorAll('.vr-mark').forEach((m) => m.classList.toggle('active', m.dataset.id === id));
    }

    refreshBadges() {
      const state = this.getState();
      let found = 0;
      this.markersEl.querySelectorAll('.vr-mark').forEach((m) => {
        const st = state[m.dataset.id] || {};
        m.classList.toggle('inspected', !!st.inspected);
        m.classList.toggle('flagged', (st.flaggedCount || 0) > 0);
        if (st.flaggedCount > 0) found++;
      });
      this.jumpEl.querySelectorAll('.vr-jbtn').forEach((b) => {
        const st = state[b.dataset.id] || {};
        b.classList.toggle('inspected', !!st.inspected);
        b.classList.toggle('flagged', (st.flaggedCount || 0) > 0);
      });
      const f = this.el.querySelector('#vrFound'); if (f) f.textContent = found;
    }

    static icon(name) { return ICONS[name] || '•'; }
  }

  global.Room = Room;
})(window);
