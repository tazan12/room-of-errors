/**
 * 채점 엔진.
 * 자동 채점: 탐지(40) + 고위험(15)
 * 수동 채점: 우선순위(15) + SBAR(15) + 팀워크(10) + 성찰(5)  ← 교수자 입력
 */
const { CASES, RUBRIC } = require('./data/cases');

function getCase(caseId) {
  return CASES.find((c) => c.id === caseId);
}

/**
 * 세션의 findings 로부터 자동 점수 계산.
 * findings 는 병실 오브젝트(objectId) 단위로 저장된다.
 * flagged=true 인 오브젝트에 부착된 정답 오류코드를 탐지한 것으로 인정한다.
 * (각 오류코드는 정확히 하나의 오브젝트에 속하므로 중복 인정되지 않는다.)
 */
function autoScore(session) {
  const c = getCase(session.caseId);
  if (!c) return null;

  const errorByCode = Object.fromEntries(c.errors.map((e) => [e.code, e]));
  const objById = Object.fromEntries(c.objects.map((o) => [o.id, o]));
  const flagged = (session.findings || []).filter((f) => f.flagged);

  // 오브젝트별 문서화 여부(위치·근거 함께 기록 시 완전 인정)
  const documentedObj = new Set(
    flagged
      .filter((f) => (f.location || '').trim() && (f.why || '').trim())
      .map((f) => f.objectId)
  );

  // 탐지한 오류코드 = flagged 오브젝트에 부착된 코드들의 합집합
  const detectedCodes = [];
  const codeDocumented = {};
  flagged.forEach((f) => {
    const obj = objById[f.objectId];
    if (!obj) return;
    obj.errors.forEach((code) => {
      if (!detectedCodes.includes(code)) detectedCodes.push(code);
      if (documentedObj.has(f.objectId)) codeDocumented[code] = true;
    });
  });

  let rawDetection = 0;
  const detectionDetail = [];
  detectedCodes.forEach((code) => {
    const e = errorByCode[code];
    if (!e) return;
    const full = !!codeDocumented[code];
    const earned = full ? e.point : e.point * 0.5; // 기록 미흡 시 절반 인정
    rawDetection += earned;
    detectionDetail.push({ code, area: e.area, point: e.point, earned, documented: full });
  });

  // 40점 만점으로 정규화
  const detection = Math.round((rawDetection / c.detectionTotal) * 40 * 10) / 10;

  // 고위험 탐지: 5개 중 맞춘 개수 × 3점 (15점 만점)
  const highHit = c.highRisk.filter((code) => detectedCodes.includes(code));
  const highRisk = highHit.length * 3;

  return {
    detection: Math.min(detection, 40),
    highRisk: Math.min(highRisk, 15),
    detectionDetail,
    detectedCount: detectedCodes.length,
    totalErrors: c.errors.length,
    highRiskHit: highHit,
    highRiskTotal: c.highRisk,
  };
}

/** 자동 + 수동 점수를 합산해 최종 점수표 생성 */
function finalScore(session) {
  const auto = autoScore(session);
  if (!auto) return null;
  const m = session.manualScores || {};
  const clamp = (v, max) => Math.max(0, Math.min(Number(v) || 0, max));

  const breakdown = {
    detection: auto.detection,
    highRisk: auto.highRisk,
    priority: clamp(m.priority, 15),
    sbar: clamp(m.sbar, 15),
    teamwork: clamp(m.teamwork, 10),
    reflection: clamp(m.reflection, 5),
  };
  const total = Object.values(breakdown).reduce((s, v) => s + v, 0);

  return {
    breakdown,
    total: Math.round(total * 10) / 10,
    auto,
    rubric: RUBRIC,
  };
}

module.exports = { autoScore, finalScore, getCase };
