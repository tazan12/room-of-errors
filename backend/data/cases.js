/**
 * Room of Errors — 4개 임상 사례 데이터 (오류 연출형 실사 병실 버전)
 *
 * 각 사례는 사진 속에 실제로 "연출된" 핵심 오류 10개(고위험 5개 포함)를 담는다.
 * objects[].x/y 는 assets/room_<CASE>.png 사진 위 백분율 좌표로, 연출된 오류 바로 위에 맵핑된다.
 *
 * 점수: 탐지(각 오류 point) 40 · 고위험 15 · 우선순위 15 · SBAR 15 · 팀워크 10 · 성찰 5 = 100
 */

const RUBRIC = [
  { key: 'detection', label: '오류 탐지 정확도', max: 40, auto: true,
    desc: '사례별 정답 오류 중 위치·단서·위험성을 함께 기록하며 정확히 발견한 개수에 비례.' },
  { key: 'highRisk', label: '고위험 오류 탐지', max: 15, auto: true,
    desc: '교수자 지정 고위험 오류 5개 탐지 여부. 즉시 위해 가능성을 설명하면 가산.' },
  { key: 'priority', label: '우선순위화', max: 15, auto: false,
    desc: 'ABC·의식·저혈당·저산소증·출혈·오투약 등 즉시 위해 기준으로 상위 5개를 정당화.' },
  { key: 'sbar', label: 'SBAR 보고', max: 15, auto: false,
    desc: '핵심 상황·관련 배경·객관적 사정·명확한 요청 포함, 2분 이내 보고.' },
  { key: 'teamwork', label: '팀워크·전문직 태도', max: 10, auto: false,
    desc: '역할분담, 상호확인, 존중, 환자·보호자 설명태도.' },
  { key: 'reflection', label: '개인 성찰', max: 5, auto: false,
    desc: '놓친 오류와 실제 임상 적용 행동을 구체적으로 작성.' },
];

/* ------------------------------------------------------------------ *
 * CASE A — 수술 후 1일차: 장 절제술 환자
 * ------------------------------------------------------------------ */
const CASE_A = {
  id: 'A',
  title: '수술 후 1일차 환자 안전',
  subtitle: '장 절제술 환자의 낙상·출혈·마약성 진통제 안전',
  theme: 'surgical',
  patient: {
    summary: '75세 남성, S상 결장 절제술 후 1일차. Foley catheter, JP drain, 말초정맥관, IV PCA 사용 중. 보호자는 잠시 자리를 비웠고 환자는 통증과 어지러움을 호소한다.',
    orders: [
      '활력징후 4시간마다, SpO2 관찰',
      'NPO 유지, 처방된 수액 80 mL/hr',
      'IV PCA: morphine, basal 없음, demand dose만 사용',
      'Foley·JP 배액량 기록',
      'SCD 적용, 낙상예방 교육',
      '기침·심호흡 및 incentive spirometer 교육',
    ],
    vitals: { BP: '102/64', HR: 104, RR: 10, SpO2: 90, T: 37.9, NRS: 6,
      note: 'room air, 졸림. 드레싱 하단에 젖은 자국이 보임.' },
    focus: '마약성 진통제 관련 호흡억제, 수술부위 출혈, 배액관·도뇨관 관리, 낙상예방, NPO 및 감염관리',
  },
  highRisk: ['A01', 'A05', 'A06', 'A09', 'A15'],
  objects: [
    { id: 'monitor',   label: '모니터·산소 연결',       icon: 'monitor', x: 13, y: 18, errors: ['A05'] },
    { id: 'ivpump',    label: 'PCA·수액 펌프',          icon: 'pump',    x: 55, y: 30, errors: ['A06'] },
    { id: 'tray',      label: 'NPO 식사 트레이',        icon: 'food',    x: 38, y: 42, errors: ['A15'] },
    { id: 'dressing',  label: '수술부위 드레싱',         icon: 'wound',   x: 58, y: 44, errors: ['A09'] },
    { id: 'scd',       label: 'SCD 하지압박',           icon: 'scd',     x: 44, y: 52, errors: ['A16'] },
    { id: 'idband',    label: '환자확인·팔찌·이름표',    icon: 'id',      x: 60, y: 54, errors: ['A01'] },
    { id: 'jpdrain',   label: 'JP 배액관',              icon: 'drain',   x: 61, y: 66, errors: ['A10'] },
    { id: 'foley',     label: 'Foley 소변백',           icon: 'foley',   x: 81, y: 37, errors: ['A11'] },
    { id: 'sharps',    label: '주사바늘·오염거즈',       icon: 'sharps',  x: 89, y: 61, errors: ['A18'] },
    { id: 'bed',       label: '침상 높이·브레이크·전선', icon: 'bed',     x: 68, y: 82, errors: ['A02'] },
  ],
  errors: [
    { code: 'A01', area: '환자확인', clue: '환자 팔찌와 침상 이름표(MICHAEL SMITH)가 일치하지 않음.', risk: '타 환자 처치·투약 위험.', action: '두 가지 식별자로 확인하고 팔찌·침상표·차트를 즉시 교정한다.', point: 2 },
    { code: 'A02', area: '낙상/환경', clue: '침상이 높게 올라가 있고 브레이크가 풀렸으며 전원선이 바닥에 널려 있음.', risk: '어지러움·수술 후 쇠약 환자의 낙상 위험.', action: '침상 낮추기, 브레이크 잠금, 바닥 정리.', point: 1 },
    { code: 'A05', area: '임상악화', clue: '모니터 RR 10·SpO2 90%인데 산소 튜브가 연결되지 않고 바닥에 있음.', risk: 'PCA opioid 관련 호흡억제 가능성.', action: '기도·호흡 사정, 산소 적용, PCA 일시 중지 여부 판단, 즉시 보고.', point: 3 },
    { code: 'A06', area: '투약/PCA', clue: 'PCA/수액 펌프 설정이 처방과 다를 수 있음(basal 여부 확인 필요).', risk: '과다투여와 호흡억제 위험.', action: '처방과 펌프 설정을 두 명이 대조, 오류 시 중지·보고.', point: 3 },
    { code: 'A09', area: '출혈/상처', clue: '복부 수술부위 드레싱에 붉은 출혈 자국이 있으나 표시·보고가 없음.', risk: '출혈·문합부 합병증 조기 발견 지연.', action: '드레싱 경계 표시, 활력징후 재사정, 배액량 확인, 보고.', point: 3 },
    { code: 'A10', area: '배액관', clue: 'JP drain bulb이 압축되지 않고 가득 찬 채 걸려 있음.', risk: '배액 기능 저하와 출혈량 평가 실패.', action: 'bulb 재압축, 색·양 기록, 갑작스런 증가 시 보고.', point: 2 },
    { code: 'A11', area: '도뇨관', clue: 'Foley 소변백이 방광보다 높은 침상 난간에 걸려 있음.', risk: '역류와 요로감염 위험.', action: '소변백을 방광보다 낮게 고정하고 바닥 접촉을 피한다.', point: 2 },
    { code: 'A15', area: '영양/NPO', clue: 'NPO 처방인데 식사 트레이·물컵·간식이 침상 옆에 놓여 있음.', risk: '흡인, 검사/수술 지연 위험.', action: 'NPO 표식 부착, 음식물 제거, 구강간호 대안 제공.', point: 3 },
    { code: 'A16', area: 'VTE 예방', clue: 'SCD가 한쪽만 적용되었거나 전원이 빠져 있음.', risk: '수술 후 심부정맥혈전 위험 증가.', action: 'SCD 착용·전원 확인, 금기 여부 확인.', point: 1 },
    { code: 'A18', area: '감염/안전', clue: '뚜껑 없는 주사바늘과 오염된 거즈가 침상 옆 테이블에 방치됨.', risk: '자상·교차감염·환경오염 위험.', action: '날카로운 물품 즉시 폐기, 폐기물 정리, 손위생.', point: 2 },
  ],
  debrief: [
    'PCA 사용 환자에서 호흡억제를 의심해야 하는 단서는 무엇이었는가?',
    '낙상예방 오류와 임상악화 오류 중 무엇을 먼저 조치해야 하는가?',
    '수술부위 드레싱의 젖은 자국을 발견했을 때 누구에게 어떤 방식으로 보고할 것인가?',
    'NPO 오류를 환자 존중을 해치지 않고 설명하는 문장은 무엇인가?',
  ],
};

/* ------------------------------------------------------------------ *
 * CASE B — 폐렴·패혈증 의심 환자
 * ------------------------------------------------------------------ */
const CASE_B = {
  id: 'B',
  title: '폐렴·패혈증 의심 환자 안전',
  subtitle: '산소요법·격리·검체·항생제 안전',
  theme: 'sepsis',
  patient: {
    summary: '68세 여성, 지역사회획득 폐렴으로 입원. 발열, 오한, 호흡곤란, 생산성 기침이 있으며 패혈증 선별검사가 진행 중이다. 혈액배양 2세트와 항생제 투여가 처방되어 있다.',
    orders: [
      'O2 nasal cannula 3 L/min, SpO2 94% 이상 유지',
      '혈액배양 2세트 채취 후 항생제 투여',
      'Lactate, CBC, 전해질 검사',
      '비말주의 및 표준주의',
      'I/O 기록, 소변량 관찰',
      '낙상예방 및 호흡곤란 시 즉시 보고',
    ],
    vitals: { BP: '92/58', HR: 118, RR: 28, SpO2: 88, T: 38.8, NRS: null,
      note: '산소줄은 있으나 연결 불량. 환자는 "숨이 차고 춥다"고 말한다.' },
    focus: '패혈증 조기인지, 산소요법 오류, 감염주의, 혈액배양-항생제 순서, 검체 라벨링, 낙상예방',
  },
  highRisk: ['B01', 'B02', 'B07', 'B08', 'B09'],
  objects: [
    { id: 'abxdose',   label: '항생제 약품·용량',       icon: 'pump',    x: 86, y: 15, errors: ['B09'] },
    { id: 'o2',        label: '산소 유량계·cannula',    icon: 'o2',      x: 46, y: 37, errors: ['B02'] },
    { id: 'antibiotic',label: '항생제 투여 순서',       icon: 'iv',      x: 75, y: 42, errors: ['B08'] },
    { id: 'position',  label: '호흡곤란 체위',          icon: 'bed',     x: 67, y: 50, errors: ['B13'] },
    { id: 'wristband', label: '검체 라벨·이름',         icon: 'id',      x: 87, y: 55, errors: ['B01'] },
    { id: 'bcbottle',  label: '혈액배양 병 2세트',      icon: 'blood',   x: 77, y: 57, errors: ['B07'] },
    { id: 'sputum',    label: '객담·컵 개방',           icon: 'cup',     x: 65, y: 62, errors: ['B06'] },
    { id: 'ppe',       label: 'PPE 카트·격리표식',      icon: 'ppe',     x: 31, y: 59, errors: ['B04'] },
    { id: 'sharps',    label: 'Sharps·바늘 방치',       icon: 'sharps',  x: 45, y: 73, errors: ['B18'] },
    { id: 'stetho',    label: '공용 청진기',            icon: 'stetho',  x: 78, y: 73, errors: ['B05'] },
  ],
  errors: [
    { code: 'B01', area: '환자확인/검체', clue: '혈액검체 라벨의 이름이 환자와 다름(SPECIMEN SMITH, JOHN).', risk: '검체 뒤바뀜과 부적절한 치료 위험.', action: '침상 옆 라벨링 원칙 적용, 라벨 폐기 후 재채혈/재라벨.', point: 3 },
    { code: 'B02', area: '산소요법', clue: '벽 산소 flowmeter가 0이고 nasal cannula가 연결되지 않은 채 늘어져 있음.', risk: '저산소증과 호흡부전 악화.', action: '산소 연결·유량 확인, SpO2 재측정, 호흡곤란 시 즉시 보고.', point: 3 },
    { code: 'B04', area: '감염주의', clue: '비말주의 표식이 없고 PPE 카트에 가운·마스크가 비어 있음.', risk: '교차감염과 노출 위험.', action: '격리표식 부착, PPE 준비, 출입자 교육.', point: 2 },
    { code: 'B05', area: '감염주의', clue: '공용 청진기가 침상 위에 오염된 상태로 놓임.', risk: '의료기구 매개 전파 위험.', action: '전용기구 사용 또는 사용 전후 소독.', point: 1 },
    { code: 'B06', area: '검체관리', clue: '컵/객담 용기가 열린 채 침상 테이블에 놓여 있음.', risk: '검체 오염 및 비말 노출 위험.', action: '뚜껑 닫기, 라벨 확인, 적절한 운반용기 사용.', point: 1 },
    { code: 'B07', area: '혈액배양', clue: '혈액배양 bottle이 비어 있고 시간·부위·2세트 구분 표기가 없음.', risk: '오염/균혈증 판단 오류.', action: '두 부위·두 세트 원칙, 시간·부위 표기, 무균술 확인.', point: 3 },
    { code: 'B08', area: '항생제 순서', clue: '항생제가 이미 연결되어 투여 중이나 혈액배양은 채취되지 않음.', risk: '원인균 확인 실패와 항생제 선택 오류.', action: '가능하면 배양 채취 후 항생제 시작, 지연 사유는 보고·기록.', point: 3 },
    { code: 'B09', area: '투약', clue: '항생제(VANCIMYCIN) 약품명·용량이 처방과 다름(PATIENT NAME/DOSAGE WRONG).', risk: '치료 실패, 알레르기, 부작용 위험.', action: '5 rights 확인, 의심 시 투약 보류 및 처방 확인.', point: 3 },
    { code: 'B13', area: '호흡자세', clue: '호흡곤란 환자가 낮은 자세(거의 앙와위)로 누워 있음.', risk: '환기 저하와 호흡곤란 악화.', action: '반좌위 적용, 호흡 양상 재사정.', point: 2 },
    { code: 'B18', area: '날카로운 물품', clue: 'sharps bin이 과충전되어 있고 바늘이 일반쓰레기에 버려져 있음.', risk: '자상 및 감염 노출 위험.', action: 'sharps box 교체, 즉시 안전폐기, 노출 예방교육.', point: 2 },
  ],
  debrief: [
    '저산소증과 패혈증 의심 단서를 어떻게 연결했는가?',
    '혈액배양과 항생제 투여 순서에서 안전과 신속성의 균형을 어떻게 잡을 것인가?',
    '격리주의 오류가 환자와 의료진에게 미치는 영향은 무엇인가?',
    '저혈압·고열·호흡곤란 상황을 SBAR로 보고한다면 핵심 문장은 무엇인가?',
  ],
};

/* ------------------------------------------------------------------ *
 * CASE C — 급성 뇌졸중 환자
 * ------------------------------------------------------------------ */
const CASE_C = {
  id: 'C',
  title: '급성 뇌졸중 환자 안전',
  subtitle: '연하곤란·흡인·낙상·신경학적 악화',
  theme: 'stroke',
  patient: {
    summary: '82세 여성, 좌측 중대뇌동맥 영역 뇌경색 의심으로 입원. 우측 편마비, 안면마비, 말 어눌함이 있으며 연하 선별검사는 아직 완료되지 않았다.',
    orders: [
      'NPO until swallow screen completed',
      '신경학적 사정 2시간마다',
      'HOB 30도 이상, 흡인예방',
      '혈압·SpO2 모니터링',
      '낙상예방, 이동 시 2인 보조',
      'SCD 적용 및 피부 사정',
    ],
    vitals: { BP: '178/96', HR: 88, RR: 20, SpO2: 94, T: 36.8, NRS: null,
      note: '오른손 힘이 약하고 말을 더듬는다. 보호자가 "아까보다 말이 더 이상하다"고 말한다.' },
    focus: '뇌졸중 악화 인지, 연하곤란과 흡인예방, 안전한 체위, 편마비 환자 낙상예방, 모니터링과 보고',
  },
  highRisk: ['C01', 'C02', 'C03', 'C07', 'C11'],
  objects: [
    { id: 'suction',   label: '흡인기 연결',            icon: 'suction', x: 88, y: 30, errors: ['C12'] },
    { id: 'neurochart',label: '신경사정 기록지',        icon: 'chart',   x: 48, y: 39, errors: ['C03'] },
    { id: 'bedhead',   label: '침상 머리 낮음',         icon: 'bed',     x: 73, y: 41, errors: ['C02'] },
    { id: 'scd',       label: 'SCD 하지압박',           icon: 'scd',     x: 59, y: 52, errors: ['C14'] },
    { id: 'wheelchair',label: '휠체어·gait belt',       icon: 'wheelchair', x: 24, y: 57, errors: ['C09'] },
    { id: 'family',    label: '보호자 외부음식',        icon: 'food',    x: 92, y: 61, errors: ['C18'] },
    { id: 'table',     label: 'NPO 물컵·빨대·간식',     icon: 'cup',     x: 72, y: 64, errors: ['C01'] },
    { id: 'pills',     label: '알약·투약컵',            icon: 'pills',   x: 81, y: 65, errors: ['C11'] },
    { id: 'callbell',  label: '호출벨 위치',            icon: 'bell',    x: 34, y: 84, errors: ['C06'] },
    { id: 'floor',     label: '브레이크·바닥 물기·전선', icon: 'hazard',  x: 50, y: 84, errors: ['C07'] },
  ],
  errors: [
    { code: 'C01', area: '연하/흡인', clue: '연하 선별 미완료·NPO인데 물컵·빨대·간식이 제공되어 있음.', risk: '흡인성 폐렴과 질식 위험.', action: '섭취 중지, NPO 표식, 연하 선별 후 식이 결정.', point: 3 },
    { code: 'C02', area: '체위/흡인', clue: '침상 머리가 낮게 눕혀져 있고 흡인 대비가 부족함.', risk: '흡인 발생 시 대응 지연.', action: 'HOB 30도 이상, suction/oxygen 작동 확인.', point: 3 },
    { code: 'C03', area: '임상악화', clue: '신경사정 기록이 지연되었고 보호자의 악화 호소에 대한 보고 기록이 없음.', risk: '뇌졸중 진행·출혈전환 등 악화 발견 지연.', action: 'FAST/NIHSS 기준으로 재사정, 즉시 보고, 필요 시 신속대응.', point: 3 },
    { code: 'C06', area: '호출벨', clue: '호출벨이 바닥에 떨어져 있어 환자 손이 닿지 않음.', risk: '도움 요청 실패와 낙상 위험.', action: '비마비측 손이 닿는 위치로 이동.', point: 1 },
    { code: 'C07', area: '낙상/환경', clue: '침상 브레이크가 풀려 있고 바닥에 물기와 전선이 지나감.', risk: '편마비·고령 환자의 중증 낙상 위험.', action: '브레이크 잠금, 바닥 정리, 낙상주의 강화.', point: 3 },
    { code: 'C09', area: '이동보조', clue: '휠체어 브레이크가 잠기지 않고 footrest가 정리되지 않음.', risk: '이동 중 낙상·끼임 위험.', action: '브레이크 잠금, footrest 정리, 이동 전 체크.', point: 2 },
    { code: 'C11', area: '투약/연하', clue: '알약·투약컵이 침상 옆에 있고 투약 경로 확인이 안 됨.', risk: '흡인·오투약 위험.', action: '연하 평가 전 경구투약 보류, 처방 경로 확인.', point: 3 },
    { code: 'C12', area: '산소/흡인', clue: 'suction canister 연결이 확실치 않거나 산소 튜브가 누락됨.', risk: '분비물·흡인 상황 대응 지연.', action: '흡인기 압력·연결 확인, 산소 장비 준비.', point: 2 },
    { code: 'C14', area: 'VTE 예방', clue: 'SCD가 한쪽 다리에만 적용되어 있음.', risk: '부동 환자의 혈전 위험.', action: '양측 적용 여부·전원 확인, 금기 확인.', point: 1 },
    { code: 'C18', area: '가족교육', clue: '보호자가 가져온 외부 음식(피자·음료)이 침상 옆에 있음.', risk: '흡인·상호작용·금식 위반 위험.', action: '외부음식/약물 확인, 교육, 보관 또는 제거.', point: 2 },
  ],
  debrief: [
    '연하 선별 전 금식이 중요한 이유를 환자와 보호자에게 어떻게 설명할 것인가?',
    '보호자의 "아까보다 이상하다"는 말을 임상자료로 어떻게 활용할 것인가?',
    '뇌졸중 환자의 낙상예방에서 일반 낙상예방과 다른 점은 무엇인가?',
    '신경학적 악화 보고를 SBAR로 구성해보라.',
  ],
};

/* ------------------------------------------------------------------ *
 * CASE D — 당뇨·인슐린 치료 환자
 * ------------------------------------------------------------------ */
const CASE_D = {
  id: 'D',
  title: '당뇨·인슐린 환자 안전',
  subtitle: '저혈당·투약·감염관리 오류',
  theme: 'diabetes',
  patient: {
    summary: '55세 남성, 제2형 당뇨병과 하지 cellulitis/당뇨발 상처로 입원. basal-bolus insulin 치료 중이며 오후 CT 검사 예정으로 일시적 NPO가 지시되어 있다.',
    orders: [
      'AC/HS blood glucose monitoring',
      'Rapid-acting insulin은 식사 직전 투여',
      'Glargine 20 units HS',
      '저혈당 프로토콜 적용',
      '상처 드레싱과 감염주의',
      'CT 전 NPO 유지, 검사 전후 처방 확인',
    ],
    vitals: { BP: '128/78', HR: 96, RR: 18, SpO2: 97, T: 37.1, NRS: null,
      glucose: 58, note: '혈당 58 mg/dL(30분 전). 식은땀과 손떨림 호소. 점심 식사 지연, rapid-acting insulin 모형이 침상 테이블에 놓여 있다.' },
    focus: '저혈당 대응, 인슐린 고위험약물 관리, 식사-인슐린 시간, 혈당측정 신뢰도, 상처·감염관리, NPO 처방 확인',
  },
  highRisk: ['D01', 'D02', 'D03', 'D04', 'D08'],
  objects: [
    { id: 'emergency', label: 'Glucagon 응급키트',      icon: 'emergency', x: 51, y: 20, errors: ['D08'] },
    { id: 'pencart',   label: '인슐린 pen 공용',        icon: 'pen',     x: 7,  y: 34, errors: ['D03'] },
    { id: 'tray',      label: 'NPO 식판·주스',          icon: 'food',    x: 53, y: 42, errors: ['D14'] },
    { id: 'wound',     label: '당뇨발 드레싱',          icon: 'wound',   x: 35, y: 52, errors: ['D09'] },
    { id: 'ivsite',    label: 'IV 삽입부 발적',         icon: 'iv',      x: 64, y: 55, errors: ['D11'] },
    { id: 'pens2',     label: '유사 인슐린 pen',        icon: 'meds',    x: 25, y: 62, errors: ['D04'] },
    { id: 'strips',    label: '시험지·QC',              icon: 'glucose', x: 90, y: 61, errors: ['D06'] },
    { id: 'insulin',   label: 'Rapid insulin 준비',     icon: 'syringe', x: 80, y: 63, errors: ['D01'] },
    { id: 'sharps',    label: '주사바늘 방치',          icon: 'sharps',  x: 84, y: 68, errors: ['D10'] },
    { id: 'glucometer',label: '혈당 58',                icon: 'glucose', x: 90, y: 73, errors: ['D02'] },
  ],
  errors: [
    { code: 'D01', area: '투약/인슐린', clue: 'rapid-acting insulin이 준비되어 있으나 식사가 지연되었거나 NPO 상태임.', risk: '저혈당 악화 위험.', action: '혈당·식사 여부 확인 전 투약 보류, 처방 확인·보고.', point: 3 },
    { code: 'D02', area: '저혈당', clue: '혈당측정기 화면이 58 mg/dL인데 저혈당 프로토콜이 시작되지 않음.', risk: '의식저하·경련 등 중증 저혈당 위험.', action: '즉시 재측정, 의식상태 확인, 기관 프로토콜에 따라 처치·보고.', point: 3 },
    { code: 'D03', area: '인슐린 pen', clue: '인슐린 pen에 환자 이름이 없고 공용 카트 위에 놓여 있음.', risk: '교차감염과 타환자 투여 위험.', action: '환자별 pen 원칙, 라벨링, 공용 사용 금지.', point: 3 },
    { code: 'D04', area: '고위험약물', clue: '작용시간이 다른 인슐린 pen 두 개가 비슷한 모양으로 나란히 놓여 있음.', risk: '인슐린 종류 혼동으로 저/고혈당 위험.', action: '약품명·작용시간 대조, 별도 보관, 독립 이중확인.', point: 3 },
    { code: 'D06', area: '혈당측정', clue: '시험지/약병이 개방·유효기간 확인 없이 방치됨.', risk: '부정확한 혈당값으로 잘못된 처치.', action: '유효한 시험지·QC 확인 후 재측정.', point: 2 },
    { code: 'D08', area: '응급약품', clue: 'glucagon 응급키트의 유효기간·즉시 사용 가능 여부가 확인되지 않음.', risk: '저혈당 응급대응 지연.', action: '응급약품 위치·유효기간 확인, 즉시 사용 가능하게 준비.', point: 3 },
    { code: 'D09', area: '상처/감염', clue: '하지 당뇨발 드레싱이 젖어 있고 상처관리 물품이 준비되지 않음.', risk: '감염 악화와 전파 위험.', action: '상처 사정, 드레싱 교환, 감염주의 적용, 보고.', point: 2 },
    { code: 'D10', area: '날카로운 물품', clue: '뚜껑 없는 인슐린 주사바늘이 침상 옆 테이블에 방치됨.', risk: '자상·감염 노출 위험.', action: '즉시 sharp box 폐기, 재사용 금지 교육.', point: 2 },
    { code: 'D11', area: 'IV 관리', clue: '정맥주사 삽입 부위가 붉고 부어 있음.', risk: '정맥염·감염 위험.', action: '삽입부 사정, 필요 시 제거·재삽입, 라벨링.', point: 1 },
    { code: 'D14', area: 'NPO/검사', clue: 'CT 전 NPO 지시가 있는데 식판과 주스가 제공되어 있음.', risk: '검사 지연, 흡인 위험. 단 저혈당 처치와 충돌 가능.', action: 'NPO 목적 확인, 저혈당 시 프로토콜과 검사팀/의사에 보고하여 조정.', point: 2 },
  ],
  debrief: [
    '식사 지연과 rapid-acting insulin의 관계를 어떻게 판단했는가?',
    'NPO와 저혈당 처치가 충돌할 때 어떤 순서로 확인·보고할 것인가?',
    '인슐린 pen을 환자별로 관리해야 하는 이유는 무엇인가?',
    '저혈당 환자를 SBAR로 보고할 때 반드시 포함할 값은 무엇인가?',
  ],
};

const CASES = [CASE_A, CASE_B, CASE_C, CASE_D];

/** 총 배점(탐지 점수 합) — 정규화에 사용 */
CASES.forEach((c) => {
  c.detectionTotal = c.errors.reduce((s, e) => s + e.point, 0);
});

module.exports = { CASES, RUBRIC };
