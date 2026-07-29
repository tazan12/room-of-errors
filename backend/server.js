/**
 * Room of Errors — 백엔드 API 서버 (Express)
 *
 * REST API 요약
 *  GET  /api/cases                    사례 목록(학생용: 정답 제외)
 *  GET  /api/cases/:id                사례 상세(학생용: 오브젝트/상황, 정답 제외)
 *  GET  /api/cases/:id/answers        정답표(교수용/디브리핑)
 *  POST /api/sessions                 세션 생성(조 시작)
 *  GET  /api/sessions/:id             세션 조회
 *  PUT  /api/sessions/:id/findings    오류 기록 저장
 *  PUT  /api/sessions/:id/priorities  상위 5개 우선순위 저장
 *  PUT  /api/sessions/:id/sbar        SBAR 보고 저장
 *  PUT  /api/sessions/:id/reflection  개인 성찰 저장
 *  POST /api/sessions/:id/submit      제출(상태 reporting)
 *  GET  /api/sessions/:id/score       채점 결과(자동 점수 포함)
 *  PUT  /api/sessions/:id/manual      교수자 수동 점수 입력
 *  GET  /api/professor/sessions       전체 세션(반/사례 필터) — 교수 대시보드
 */
const express = require('express');
const path = require('path');
const { CASES, RUBRIC } = require('./data/cases');
const db = require('./store/db');
const { autoScore, finalScore } = require('./scoring');
const XP = require('./export');

const ADMIN_CODE = process.env.ADMIN_CODE || 'roe-admin';   // 관리자 코드(환경변수로 변경 가능)

const app = express();
app.use(express.json({ limit: '1mb' }));

// 정적 프론트엔드 서빙
app.use(express.static(path.join(__dirname, '..', 'frontend')));

/* 관리자 인증 미들웨어 — 헤더 x-admin-code 또는 쿼리 code 확인 */
function requireAdmin(req, res, next) {
  const code = req.get('x-admin-code') || req.query.code;
  if (code === ADMIN_CODE) return next();
  return res.status(401).json({ error: 'admin authentication required' });
}

/* 채점 행 생성(교수 대시보드·내보내기 공용) */
function buildScoreRows(filter = {}) {
  return db.listSessions(filter).map((s) => {
    const score = finalScore(s);
    return {
      id: s.id, caseId: s.caseId, className: s.className, teamName: s.teamName,
      members: s.members, status: s.status, createdAt: s.createdAt,
      total: score ? score.total : null,
      detectedCount: score ? score.auto.detectedCount : 0,
      highRiskHit: score ? score.auto.highRiskHit.length : 0,
      breakdown: score ? score.breakdown : null,
    };
  });
}

/* ---------- 유틸: 학생에게 노출할 사례 뷰(정답 숨김) ---------- */
function publicCase(c) {
  return {
    id: c.id,
    title: c.title,
    subtitle: c.subtitle,
    theme: c.theme,
    patient: c.patient,
    objects: c.objects.map((o) => ({
      id: o.id, label: o.label, icon: o.icon, x: o.x, y: o.y,
      errorCount: o.errors.length,          // 힌트: 이 오브젝트에 몇 개의 잠재 오류가 있는지
    })),
    errorCount: c.errors.length,
    highRiskCount: c.highRisk.length,
    detectionTotal: c.detectionTotal,
  };
}

/* ================= 사례 API ================= */
app.get('/api/cases', (req, res) => {
  res.json(CASES.map((c) => ({
    id: c.id, title: c.title, subtitle: c.subtitle, theme: c.theme,
    summary: c.patient.summary, focus: c.patient.focus,
    errorCount: c.errors.length, highRiskCount: c.highRisk.length,
  })));
});

app.get('/api/cases/:id', (req, res) => {
  const c = CASES.find((x) => x.id === req.params.id.toUpperCase());
  if (!c) return res.status(404).json({ error: 'case not found' });
  res.json(publicCase(c));
});

app.get('/api/cases/:id/answers', (req, res) => {
  const c = CASES.find((x) => x.id === req.params.id.toUpperCase());
  if (!c) return res.status(404).json({ error: 'case not found' });
  res.json({
    id: c.id, title: c.title, highRisk: c.highRisk,
    errors: c.errors, objects: c.objects, debrief: c.debrief, rubric: RUBRIC,
  });
});

/* ================= 세션 API ================= */
app.post('/api/sessions', (req, res) => {
  const { caseId } = req.body || {};
  if (!CASES.find((c) => c.id === caseId)) {
    return res.status(400).json({ error: 'invalid caseId' });
  }
  const s = db.createSession(req.body);
  res.status(201).json(s);
});

app.get('/api/sessions/:id', (req, res) => {
  const s = db.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(s);
});

app.put('/api/sessions/:id/findings', (req, res) => {
  const s = db.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const findings = Array.isArray(req.body.findings) ? req.body.findings : [];
  db.updateSession(s.id, { findings });
  res.json(db.getSession(s.id));
});

app.put('/api/sessions/:id/priorities', (req, res) => {
  const s = db.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  db.updateSession(s.id, { priorities: (req.body.priorities || []).slice(0, 5) });
  res.json(db.getSession(s.id));
});

app.put('/api/sessions/:id/sbar', (req, res) => {
  const s = db.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  db.updateSession(s.id, { sbar: req.body.sbar || s.sbar });
  res.json(db.getSession(s.id));
});

app.put('/api/sessions/:id/reflection', (req, res) => {
  const s = db.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  db.updateSession(s.id, { reflection: req.body.reflection || s.reflection });
  res.json(db.getSession(s.id));
});

app.post('/api/sessions/:id/submit', (req, res) => {
  const s = db.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  db.updateSession(s.id, { status: 'reporting', submittedAt: new Date().toISOString() });
  res.json(db.getSession(s.id));
});

app.get('/api/sessions/:id/score', (req, res) => {
  const s = db.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(finalScore(s));
});

app.put('/api/sessions/:id/manual', requireAdmin, (req, res) => {
  const s = db.getSession(req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const manualScores = { ...s.manualScores, ...(req.body.manualScores || {}) };
  db.updateSession(s.id, { manualScores, status: 'scored' });
  res.json({ session: db.getSession(s.id), score: finalScore(db.getSession(s.id)) });
});

/* ================= 관리자 인증 ================= */
app.post('/api/admin/login', (req, res) => {
  const code = (req.body && req.body.code) || '';
  if (code === ADMIN_CODE) return res.json({ ok: true });
  res.status(401).json({ ok: false, error: '관리자 코드가 올바르지 않습니다.' });
});

/* ================= 교수(관리자) 대시보드 ================= */
app.get('/api/professor/sessions', requireAdmin, (req, res) => {
  const { caseId, className } = req.query;
  res.json(buildScoreRows({ caseId, className }));
});

/* ================= 내보내기 (관리자 전용) ================= */
app.get('/api/export/scores.:fmt', requireAdmin, (req, res) => {
  const { caseId, className } = req.query;
  const rows = buildScoreRows({ caseId, className });
  const title = 'Room of Errors 채점표' + (caseId ? ` · CASE ${caseId}` : '');
  const stamp = new Date().toISOString().slice(0, 10);
  const fname = `RoomOfErrors_scores_${stamp}`;
  switch (req.params.fmt) {
    case 'csv':
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.csv"`);
      return res.send(XP.toCSV(rows));
    case 'xlsx':
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.xlsx"`);
      return res.send(XP.toXLSX(rows));
    case 'doc':
      res.setHeader('Content-Type', 'application/msword; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${fname}.doc"`);
      return res.send(XP.toDoc(rows, title));
    case 'html':
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send(XP.reportHTML(rows, title));
    default:
      return res.status(400).json({ error: 'unsupported format' });
  }
});

/* ---------- SPA fallback ---------- */
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Room of Errors 서버 실행 중`);
  console.log(`  → http://localhost:${PORT}\n`);
});
