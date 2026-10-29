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
 *  GET  /api/professor/sessions/:id   세션 상세(학생이 작성한 탐지·우선순위·SBAR·성찰 전문) — 교수 채점용
 */
const express = require('express');
const path = require('path');
const { CASES, RUBRIC } = require('./data/cases');
const db = require('./store/supabase');
const { autoScore, finalScore } = require('./scoring');
const XP = require('./export');

const app = express();
app.use(express.json({ limit: '1mb' }));

// Always revalidate UI assets so a new Render deploy is visible immediately.
app.use(express.static(path.join(__dirname, '..', 'frontend'), {
  etag: true,
  maxAge: 0,
  setHeaders(res) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  },
}));

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

const isInstructor = (auth) => ['admin', 'faculty'].includes(auth?.role);

function requireInstructor(req, res, next) {
  if (isInstructor(req.auth)) return next();
  return res.status(403).json({ error: '교수자 권한이 필요합니다.' });
}

function requireApproved(req, res, next) {
  if (isInstructor(req.auth) || req.auth?.profile?.approval_status === 'approved') return next();
  return res.status(403).json({ error: '관리자 승인 후 사용할 수 있습니다.' });
}

/* 채점 행 생성(교수 대시보드·내보내기 공용)
 * 교수자 미리보기 세션은 학생 성적이 아니므로 채점 목록에서 제외한다. */
async function buildScoreRows(token, filter = {}) {
  const sessions = await db.listSessions(token, filter);
  return sessions
    .filter((s) => s.className !== db.PREVIEW_CLASS)
    .map((s) => {
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
    if (['admin', 'faculty'].includes(req.auth.role)) return res.status(403).json({ error: '학생 계정만 학생 정보를 수정할 수 있습니다.' });
    const body = req.body || {};
    const { grade, className, facultyUserId } = body;
    const fullName = String(body.fullName || '').trim();
    // 공백·하이픈이 섞여 들어오면 같은 학번이 다른 값으로 저장되므로 숫자/영문만 남긴다.
    const studentNumber = String(body.studentNumber || '').replace(/[\s-]/g, '');
    if (!fullName || !studentNumber || !grade || !className || !facultyUserId) return res.status(400).json({ error: '이름, 학번, 학년, 지도교수, 분반을 모두 입력하세요.' });
    if (!/^[0-9A-Za-z]{4,20}$/.test(studentNumber)) return res.status(400).json({ error: '학번을 올바르게 입력하세요(예: 23801001).' });
    if (!['1', '2', '3', '4'].includes(String(grade))) return res.status(400).json({ error: '학년을 올바르게 선택하세요.' });
    const routes = await db.listFacultyRoutes(req.auth.token);
    if (!routes.some((r) => r.user_id === facultyUserId && r.classes.includes(className))) return res.status(400).json({ error: '지도교수에게 배정된 분반을 선택하세요.' });
    try {
      const profile = await db.updateProfile(req.auth.token, req.auth.user.id, { fullName, studentNumber, grade: Number(grade), className, facultyUserId });
      return res.json(profile);
    } catch (e) {
      const duplicate = e.code === '23505' || /duplicate|unique/i.test(e.message || '');
      if (!duplicate) throw e;
      // 학생은 다른 계정의 정보를 볼 수 없으므로, 충돌을 기록해 교수자 대시보드에 띄운다.
      await db.reportStudentNumberConflict(req.auth.token, studentNumber)
        .catch((err) => console.error('[profile] conflict report failed:', err?.message || err));
      return res.status(409).json({
        error: `학번 ${studentNumber}은(는) 이미 다른 계정에 등록되어 있습니다. 학번을 다시 확인해 주세요. 본인 학번이 맞다면 담당 교수에게 알려 주세요 — 교수자 화면에 중복 내역이 표시됩니다.`,
      });
    }
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.get('/api/admin/student-number-conflicts', requireAuth, requireInstructor, async (req, res) => {
  try { res.json(await db.listStudentNumberConflicts(req.auth.token)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/admin/student-number-conflicts/:id/resolve', requireAuth, requireInstructor, async (req, res) => {
  try { await db.resolveStudentNumberConflict(req.auth.token, req.params.id); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/admin/students/:userId/release-student-number', requireAuth, requireAdmin, async (req, res) => {
  try { await db.releaseStudentNumber(req.auth.token, req.params.userId); res.json({ ok: true }); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/faculty/request', requireAuth, async (req, res) => {
  try {
    if (req.auth.role === 'admin') return res.json({ status: 'approved' });
    res.status(201).json(await db.requestFacultyAccess(req.auth.token, req.auth));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/faculty/routes', requireAuth, async (req, res) => {
  try { res.json(await db.listFacultyRoutes(req.auth.token)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/admin/faculty-assignments/:userId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const classes = Array.isArray(req.body?.classes) ? [...new Set(req.body.classes)] : [];
    if (classes.length > 2) return res.status(400).json({ error: '교수자당 최대 2개 분반만 배정할 수 있습니다.' });
    res.json(await db.assignFacultyClasses(req.auth.token, req.params.userId, classes));
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

app.get('/api/admin/student-approvals', requireAuth, requireInstructor, async (req, res) => {
  try { res.json(await db.listStudentApprovals(req.auth.token)); }
  catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/admin/student-approvals/:userId', requireAuth, requireInstructor, async (req, res) => {
  try {
    const decision = req.body?.decision;
    if (!['approved', 'rejected'].includes(decision)) return res.status(400).json({ error: '승인 또는 거절을 선택하세요.' });
    res.json(await db.reviewStudentApproval(req.auth.token, req.auth.user.id, req.params.userId, decision));
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/admin/students/:userId/route', requireAuth, requireAdmin, async (req, res) => {
  try {
    const className = req.body?.className || '';
    res.json(await db.manageStudentRoute(req.auth.token, req.auth.user.id, req.params.userId, className));
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

app.get('/api/cases/:id/answers', requireAuth, requireApproved, (req, res) => {
  const c = CASES.find((x) => x.id === req.params.id.toUpperCase());
  if (!c) return res.status(404).json({ error: 'case not found' });
  res.json({
    id: c.id, title: c.title, highRisk: c.highRisk,
    errors: c.errors, objects: c.objects, debrief: c.debrief, rubric: RUBRIC,
  });
});

/* ================= 세션 API ================= */
app.post('/api/sessions', requireAuth, requireApproved, async (req, res) => {
  const { caseId } = req.body || {};
  if (!CASES.find((c) => c.id === caseId)) {
    return res.status(400).json({ error: 'invalid caseId' });
  }
  try {
    // 교수자·관리자는 조 정보 입력 없이 바로 입장(미리보기 세션)
    const created = isInstructor(req.auth)
      ? await db.createPreviewSession(req.auth.token, req.auth.user.id, req.body)
      : await db.createSession(req.auth.token, req.auth.user.id, req.body);
    res.status(201).json(created);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/sessions/:id', requireAuth, requireApproved, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(s);
});

app.put('/api/sessions/:id/findings', requireAuth, requireApproved, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const findings = Array.isArray(req.body.findings) ? req.body.findings : [];
  res.json(await db.updateSession(req.auth.token, s.id, { findings }));
});

app.put('/api/sessions/:id/priorities', requireAuth, requireApproved, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(await db.updateSession(req.auth.token, s.id, { priorities: (req.body.priorities || []).slice(0, 5) }));
});

/* SBAR·성찰은 한 세션(조)을 여러 학생이 동시에 편집할 수 있다.
 * 전체 객체를 통째로 덮어쓰면 다른 조원이 방금 저장한 항목이 지워지므로,
 * 클라이언트가 실제로 변경한 항목만 받아 기존 값에 병합한다. */
function mergeFields(current, patch, keys) {
  const merged = { ...(current || {}) };
  if (patch && typeof patch === 'object') {
    for (const k of keys) if (typeof patch[k] === 'string') merged[k] = patch[k];
  }
  return merged;
}

const SBAR_KEYS = ['s', 'b', 'a', 'r'];
const REFLECTION_KEYS = ['firstAction', 'rationale', 'missed', 'apply', 'teamwork'];

app.put('/api/sessions/:id/sbar', requireAuth, requireApproved, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const sbar = mergeFields(s.sbar, req.body.sbar, SBAR_KEYS);
  const saved = await db.updateSession(req.auth.token, s.id, { sbar });
  res.json({ ...saved, savedAt: new Date().toISOString() });
});

app.put('/api/sessions/:id/reflection', requireAuth, requireApproved, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const reflection = mergeFields(s.reflection, req.body.reflection, REFLECTION_KEYS);
  const saved = await db.updateSession(req.auth.token, s.id, { reflection });
  res.json({ ...saved, savedAt: new Date().toISOString() });
});

app.post('/api/sessions/:id/submit', requireAuth, requireApproved, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(await db.updateSession(req.auth.token, s.id, { status: 'reporting', submittedAt: new Date().toISOString() }));
});

app.get('/api/sessions/:id/score', requireAuth, requireApproved, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  res.json(finalScore(s));
});

app.put('/api/sessions/:id/manual', requireAuth, requireInstructor, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: 'session not found' });
  const manualScores = { ...s.manualScores, ...(req.body.manualScores || {}) };
  const saved = await db.updateSession(req.auth.token, s.id, { manualScores, status: 'scored' });
  res.json({ session: saved, score: finalScore(saved) });
});

app.post('/api/sessions/:id/manual/reset', requireAuth, requireAdmin, async (req, res) => {
  try {
    const s = await db.getSession(req.auth.token, req.params.id);
    if (!s) return res.status(404).json({ error: '초기화할 실습 기록을 찾지 못했습니다.' });
    const saved = await db.updateSession(req.auth.token, s.id, {
      findings: [],
      priorities: [],
      sbar: { s: '', b: '', a: '', r: '' },
      reflection: {},
      manualScores: {},
      // roe_sessions_status_check permits exploring, reporting, and scored.
      status: 'exploring',
      submittedAt: null,
    });
    if (!saved) return res.status(404).json({ error: '실습 기록을 초기화하지 못했습니다.' });
    res.json({ session: saved, score: finalScore(saved) });
  } catch (e) {
    console.error('[session reset] failed:', e?.message || e);
    res.status(400).json({ error: `전체 실습·성적 초기화 실패: ${e?.message || '데이터베이스 저장 오류'}` });
  }
});

/* ================= 교수(관리자) 대시보드 ================= */
app.get('/api/professor/sessions', requireAuth, requireInstructor, async (req, res) => {
  const { caseId, className } = req.query;
  res.json(await buildScoreRows(req.auth.token, { caseId, className }));
});

/* 세션 상세 — 학생이 작성한 오류 탐지 기록·우선순위·SBAR·성찰을 그대로 노출(교수자 채점 근거) */
app.get('/api/professor/sessions/:id', requireAuth, requireInstructor, async (req, res) => {
  const s = await db.getSession(req.auth.token, req.params.id);
  if (!s) return res.status(404).json({ error: '실습 기록을 찾을 수 없습니다.' });
  const c = CASES.find((x) => x.id === s.caseId);
  const labelOf = (id) => c?.objects.find((o) => o.id === id)?.label || id;
  const findings = (s.findings || [])
    .filter((f) => f.flagged)
    .map((f) => ({ ...f, label: labelOf(f.objectId) }));
  const priorities = (s.priorities || []).map((objectId, i) => ({ rank: i + 1, objectId, label: labelOf(objectId) }));
  res.json({ session: s, score: finalScore(s), caseTitle: c ? c.title : s.caseId, findings, priorities });
});

/* ================= 내보내기 (관리자 전용) ================= */
app.get('/api/export/scores.:fmt', requireAuth, requireInstructor, async (req, res) => {
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
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  res.sendFile(path.join(__dirname, '..', 'frontend', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n  Room of Errors 서버 실행 중`);
  console.log(`  → http://localhost:${PORT}\n`);
});
