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
const db = require('./store/supabase');
const { autoScore, finalScore } = require('./scoring');
const XP = require('./export');

const app = express();
app.use(express.json({ limit: '1mb' }));

// 정적 프론트엔드 서빙
app.use(express.static(path.join(__dirname, '..', 'frontend')));

function bearer(req) {
  const value = req.get('authorization') || '';
  return value.startsWith('Bearer ') ? value.slice(7) : '';
}

async function requireAuth(req, res, next) {
  try {
    const token = bearer(req);
    const identity = token && await db.getIdentity(token);
    if (!identity) return res.status(401).json({ error: '로그인이 필요합니다.' });
    req.auth = { token, ...identity };
    next();
  } catch (e) {
    console.error('[auth] token verification failed:', e?.message || e);
    res.status(401).json({ error: '로그인 인증을 확인하지 못했습니다. 다시 로그인해 주세요.' });
  }
}

function requireAdmin(req, res, next) {
  if (req.auth?.role === 'admin') return next();
  return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
}

/* 채점 행 생성(교수 대시보드·내보내기 공용) */
async function buildScoreRows(token, filter = {}) {
  return (await db.listSessions(token, filter)).map((s) => {
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

/* ================= 인증 API ================= */
app.get('/api/auth/public-config', (req, res) => {
  res.json({ supabaseUrl: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const data = await db.signIn(req.body || {});
    const identity = await db.getIdentity(data.session.access_token);
    res.json({ accessToken: data.session.access_token, refreshToken: data.session.refresh_token, user: { id: data.user.id, email: data.user.email, role: identity.role, profile: identity.profile } });
  } catch (e) { res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다.' }); }
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ id: req.auth.user.id, email: req.auth.user.email, role: req.auth.role, profile: req.auth.profile });
});

app.put('/api/auth/profile', requireAuth, async (req, res) => {
  try {
    if (req.auth.role === 'admin') return res.status(403).json({ error: '학생 계정만 학생 정보를 수정할 수 있습니다.' });
    const { fullName, studentNumber, grade, className } = req.body || {};
    if (!fullName || !studentNumber || !grade || !className) return res.status(400).json({ error: '이름, 학번, 학년, 반을 모두 입력하세요.' });
    if (!['1', '2', '3', '4'].includes(String(grade))) return res.status(400).json({ error: '학년을 올바르게 선택하세요.' });
    const profile = await db.updateProfile(req.auth.token, req.auth.user.id, { fullName, studentNumber, grade: Number(grade), className });
    res.json(profile);
  } catch (e) {
    const duplicate = e.code === '23505' || /duplicate|unique/i.test(e.message || '');
    res.status(duplicate ? 409 : 400).json({ error: duplicate ? '이미 등록된 학번입니다.' : e.message });
  }
});

app.post('/api/faculty/request', requireAuth, async (req, res) => {
  try {
    if (req.auth.role === 'admin') return res.json({ status: 'approved' });
    res.status(201).json(await db.requestFacultyAccess(req.auth.token, req.auth));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/admin/faculty-requests', requireAuth, requireAdmin, async (req, res) => {
  try { res.json(await db.listFacultyRequests(req.auth.token)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/admin/faculty-requests/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const decision = req.body?.decision;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: '승인 또는 거절을 선택하세요.' });
    res.json(await db.reviewFacultyRequest(req.auth.token, req.params.userId, decision));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

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

app.get('/api/cases/:id/answers', requireAuth, (req, res) => {
  const c = CASES.find((x) => x.id === req.params.id.toUpperCase());
  if (!c) return res.status(404).json({ error: 'case not found' });
  res.json({
    id: c.id, title: c.title, highRisk: c.highRisk,
    errors: c.errors, objects: c.objects, debrief: c.debrief, rubric: RUBRIC,
  });
});

/* ================= 세션 API ================= */
app.post('/api/sessions', requireAuth, async (req, res) => {
  const { caseId } = req.body || {};
  if (!CASES.find((c) => c.id === caseId)) {
    return res.status(400).json({ error: 'invalid caseId' });
  }
  try { res.status(201).json(await db.createSession(req.auth.token, req.auth.user.id, req.body)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/sessions/:id', requireAuth, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(s);
});

app.put('/api/sessions/:id/findings', requireAuth, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const findings = Array.isArray(req.body.findings) ? req.body.findings : [];
  res.json(await db.updateSession(req.auth.token, s.id, { findings }));
});

app.put('/api/sessions/:id/priorities', requireAuth, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(await db.updateSession(req.auth.token, s.id, { priorities: (req.body.priorities || []).slice(0, 5) }));
});

app.put('/api/sessions/:id/sbar', requireAuth, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(await db.updateSession(req.auth.token, s.id, { sbar: req.body.sbar || s.sbar }));
});

app.put('/api/sessions/:id/reflection', requireAuth, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(await db.updateSession(req.auth.token, s.id, { reflection: req.body.reflection || s.reflection }));
});

app.post('/api/sessions/:id/submit', requireAuth, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(await db.updateSession(req.auth.token, s.id, { status: 'reporting', submittedAt: new Date().toISOString() }));
});

app.get('/api/sessions/:id/score', requireAuth, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(finalScore(s));
});

app.put('/api/sessions/:id/manual', requireAuth, requireAdmin, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const manualScores = { ...s.manualScores, ...(req.body.manualScores || {}) };
  const saved = await db.updateSession(req.auth.token, s.id, { manualScores, status: 'scored' });
  res.json({ session: saved, score: finalScore(saved) });
});

/* ================= 교수(관리자) 대시보드 ================= */
app.get('/api/professor/sessions', requireAuth, requireAdmin, async (req, res) => {
  const { caseId, className } = req.query;
  res.json(await buildScoreRows(req.auth.token, { caseId, className }));
});

/* ================= 내보내기 (관리자 전용) ================= */
app.get('/api/export/scores.:fmt', requireAuth, requireAdmin, async (req, res) => {
  const { caseId, className } = req.query;
  const rows = await buildScoreRows(req.auth.token, { caseId, className });
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
