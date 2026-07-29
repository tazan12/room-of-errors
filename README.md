# Room of Errors — 간호 환자안전 병실 시뮬레이션 웹앱

간호학과 4학년 대상 **Room of Errors 추가 사례 4종**(교수용 정답해설·학생용 활동지·평가표)을
그대로 구현한 풀스택 웹 애플리케이션입니다. 병실을 **VR형 2.5D 그래픽**으로 탐색하며 숨은
환자안전 오류를 찾고, 상위 5개를 우선순위화한 뒤 SBAR로 보고하고, 100점 루브릭으로 자동/수동
채점합니다.

---

## 1. 빠른 실행

```bash
cd room-of-errors-app/backend
npm install
npm start
```

브라우저에서 **http://localhost:3000** 접속. (Node.js 16+ 필요)

---

## 2. 원본 자료 → 앱 매핑

| 원본 문서 | 앱 구현 |
|---|---|
| 학생용 활동지 (관찰→기록→우선순위→SBAR→성찰) | 5단계 학생 플로우 |
| 교수용 정답해설 (사례별 18개 오류표, 고위험 5개) | `backend/data/cases.js` 정답 데이터 · 디브리핑 정답공개 화면 |
| 평가표 (탐지40+고위험15+우선15+SBAR15+팀10+성찰5=100) | `backend/scoring.js` 자동/수동 채점 · 교수 대시보드 |

4개 사례 · 사례당 18개 오류 · 총 72개 오류를 모두 데이터화했습니다.

- **CASE A** 수술 후 1일차(낙상·출혈·PCA) — 고위험 A01/A05/A06/A09/A15
- **CASE B** 폐렴·패혈증(산소·격리·검체·항생제) — 고위험 B01/B02/B07/B08/B09
- **CASE C** 급성 뇌졸중(연하·흡인·낙상·악화) — 고위험 C01/C02/C03/C07/C11
- **CASE D** 당뇨·인슐린(저혈당·투약·감염) — 고위험 D01/D02/D03/D04/D08

---

## 3. 아키텍처

```
┌────────────────────────── Frontend (SPA, Vanilla JS) ──────────────────────────┐
│  index.html                                                                     │
│  js/api.js   — REST 클라이언트                                                    │
│  js/room.js  — 2.5D VR 병실 렌더러 (아이소메트릭 + 패럴랙스 + 핫스팟)               │
│  js/app.js   — 화면 라우팅: home→intake→room→priority→sbar→reflection→result      │
│  css/styles.css — 다크 테마 · 2.5D 룸 CSS(3D transform)                           │
└───────────────────────────────────┬─────────────────────────────────────────────┘
                                     │ fetch (JSON REST)
┌───────────────────────────────────┴──────── Backend (Node + Express) ───────────┐
│  server.js       — REST API + 정적 파일 서빙                                       │
│  data/cases.js   — 4개 사례 · 72개 오류 정답 · 병실 오브젝트 좌표                    │
│  scoring.js      — 자동채점(탐지40+고위험15) + 수동채점 합산                         │
│  store/db.js     — JSON 파일 데이터스토어(무-네이티브 의존, Windows 친화)            │
│  store/data.json — 세션 영속화(자동 생성)                                          │
└──────────────────────────────────────────────────────────────────────────────────┘
```

의존성은 **Express 하나**뿐입니다. DB는 네이티브 컴파일이 필요한 SQLite 대신 JSON 파일
스토어를 사용해 Windows에서도 `npm install` 한 번으로 바로 실행됩니다.

---

## 4. 2.5D VR 병실 구현 (`js/room.js` + `css/styles.css`)

- **아이소메트릭 무대**: `perspective` + `rotateX(52deg)` 로 바닥을 눕혀 깊이감 부여
- **기립형 프롭(billboard)**: 각 물품은 바닥 위에 세워진 카드. 바닥 기울기를 `rotateX(-52deg)`로
  상쇄해 항상 정면을 보게 함 (클래식 2.5D 기법)
- **VR 둘러보기**: 마우스 이동/드래그 → 카메라 `rotateZ`·translate + 프롭 깊이별 **패럴랙스**
- **핫스팟**: 14개 상호작용 오브젝트. 각 오브젝트에 정답 오류코드가 부착됨(학생에겐 숨김)
- **상태 표시**: 점검함(회색) · 오류 기록(주황 발광 + 배지 카운트) 실시간 갱신
- **SVG 아이콘**: 병상·모니터·PCA/IV 펌프·Foley·JP drain·SCD·sharps box·산소·인슐린 pen 등
  30여 종 스타일화 아이콘 내장(외부 asset 없음)

사례를 바꾸면 `objects` 좌표/구성이 교체되어 4개 병실이 각기 다르게 렌더링됩니다.

---

## 5. REST API

| 메서드 · 경로 | 설명 |
|---|---|
| `GET /api/cases` | 사례 목록(학생용, 정답 제외) |
| `GET /api/cases/:id` | 사례 상세 + 병실 오브젝트(정답 숨김) |
| `GET /api/cases/:id/answers` | 정답표·고위험·디브리핑(교수/결과화면) |
| `POST /api/sessions` | 조 세션 생성 |
| `GET /api/sessions/:id` | 세션 조회 |
| `PUT /api/sessions/:id/findings` | 오류 기록 저장(오브젝트 단위) |
| `PUT /api/sessions/:id/priorities` | 상위 5개 우선순위 |
| `PUT /api/sessions/:id/sbar` | SBAR 보고 |
| `PUT /api/sessions/:id/reflection` | 개인 성찰 |
| `POST /api/sessions/:id/submit` | 제출 |
| `GET /api/sessions/:id/score` | 채점 결과(자동 점수 포함) |
| `PUT /api/sessions/:id/manual` | 교수 수동 점수 입력 |
| `GET /api/professor/sessions` | 교수 대시보드(반/사례 필터) |

---

## 6. 채점 로직 (`scoring.js`)

- **자동**
  - *탐지 40점*: flagged 오브젝트에 부착된 정답 오류코드의 배점 합을 40점 만점으로 정규화.
    위치·근거를 함께 기록하면 전액, 미기록 시 절반 인정(활동지 원칙 반영).
  - *고위험 15점*: 지정 고위험 5개 중 탐지 개수 × 3점.
- **수동(교수 입력)**: 우선순위 15 · SBAR 15 · 팀워크 10 · 성찰 5.
  교수 대시보드에서 인라인 입력 → 총점 즉시 갱신.

---

## 7. 운영 시나리오 (2시간 수업)

1. 학생: 사례 선택 → 조 정보 입력 → **병실 입장**
2. 병실 2.5D 탐색하며 오류 기록(위치/단서 - 왜 위험 - 즉시 조치)
3. 상위 5개 우선순위화 → SBAR 작성 → 개인 성찰 → 제출
4. 결과 화면에서 **정답 공개 + 디브리핑 질문**(찾음/놓침/고위험 시각화)
5. 교수: 대시보드에서 반·조별 점수 확인, 수동 항목 입력 → 최종 100점

---

## 8. 폴더 구조

```
room-of-errors-app/
├── backend/
│   ├── server.js          # Express API + 정적 서빙
│   ├── scoring.js         # 채점 엔진
│   ├── data/cases.js      # 4개 사례 · 72개 오류 정답
│   ├── store/db.js        # JSON 데이터스토어
│   └── package.json
├── frontend/
│   ├── index.html
│   ├── css/styles.css
│   └── js/{api,room,app}.js
└── README.md
```

## 9. 확장 아이디어

- 실제 DB(PostgreSQL/SQLite) 및 로그인(반/학번) 전환 — `store/db.js` 인터페이스만 교체
- 병실 배경을 실제 3D(three.js)로 승급, 또는 실사 파노라마 위 핫스팟
- 오류 기록의 자유서술을 LLM으로 정답 매칭/피드백 자동화
- 타이머·조별 순환(8분 관찰 + 2분 전환) 진행 모드
```
