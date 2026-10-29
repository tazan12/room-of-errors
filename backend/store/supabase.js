const { createClient } = require('@supabase/supabase-js');

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_PUBLISHABLE_KEY;

function configured() { return Boolean(url && key); }

function client(token) {
  if (!configured()) throw new Error('Supabase environment variables are not configured');
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: token ? { headers: { Authorization: `Bearer ${token}` } } : undefined,
  });
}

function toSession(row) {
  if (!row) return null;
  return {
    id: row.id,
    studentUserId: row.student_user_id,
    caseId: row.case_id,
    className: row.class_name,
    facultyUserId: row.faculty_user_id,
    teamName: row.team_name,
    members: row.members || [],
    status: row.status,
    findings: row.findings || [],
    priorities: row.priorities || [],
    sbar: row.sbar || { s: '', b: '', a: '', r: '' },
    reflection: row.reflection || {},
    manualScores: row.manual_scores || {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    submittedAt: row.submitted_at,
  };
}

async function getIdentity(token) {
  const sb = client(token);
  // Verify the signed access token directly. This avoids making every API
  // request depend on a separate Auth user lookup while still rejecting
  // expired, altered, or unsigned tokens.
  const { data, error } = await sb.auth.getClaims(token);
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  const user = {
    id: claims.sub,
    email: claims.email || '',
    app_metadata: claims.app_metadata || {},
    user_metadata: claims.user_metadata || {},
  };
  // Administrators are identified by trusted Auth app metadata.  Do not make
  // admin access depend on the student profile table being available.
  if (user.app_metadata?.role === 'admin') {
    return { user, profile: null, role: 'admin' };
  }
  const { data: profile } = await sb.from('roe_profiles').select('*').eq('user_id', user.id).maybeSingle();
  return {
    user,
    profile,
    role: ['admin', 'faculty'].includes(user.app_metadata?.role)
      ? user.app_metadata.role
      : (['admin', 'faculty'].includes(profile?.role) ? profile.role : 'student'),
  };
}

async function signUp({ email, password, fullName, studentNumber, className }) {
  const { data, error } = await client().auth.signUp({
    email, password,
    options: { data: { full_name: fullName, student_number: studentNumber, class_name: className } },
  });
  if (error) throw error;
  return data;
}

async function signIn({ email, password }) {
  const { data, error } = await client().auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function updateProfile(token, userId, { fullName, studentNumber, grade, className, facultyUserId }) {
  const row = {
    full_name: fullName,
    student_number: studentNumber,
    grade,
    class_name: className,
    faculty_user_id: facultyUserId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client(token).from('roe_profiles').update(row).eq('user_id', userId).select().single();
  if (error) throw error;
  return data;
}

async function requestFacultyAccess(token, identity) {
  const row = { user_id: identity.user.id, email: identity.user.email,
    full_name: identity.profile?.full_name || identity.user.user_metadata?.full_name || identity.user.user_metadata?.name || '',
    status: 'pending', requested_at: new Date().toISOString(), reviewed_at: null, reviewed_by: null };
  const { data, error } = await client(token).from('roe_faculty_requests').upsert(row, { onConflict: 'user_id' }).select().single();
  if (error) throw error;
  return data;
}

async function listFacultyRequests(token) {
  const { data, error } = await client(token).from('roe_faculty_requests').select('*').order('requested_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function listFacultyRoutes(token) {
  const sb = client(token);
  const [{ data: faculty, error: facultyError }, { data: classes, error: classError }] = await Promise.all([
    sb.from('roe_faculty_requests').select('user_id,email,full_name,status').eq('status', 'approved').order('full_name'),
    sb.from('roe_faculty_classes').select('faculty_user_id,class_name').order('class_name'),
  ]);
  if (facultyError) throw facultyError;
  if (classError) throw classError;
  return (faculty || []).map((f) => ({ ...f, classes: (classes || []).filter((c) => c.faculty_user_id === f.user_id).map((c) => c.class_name) }));
}

async function assignFacultyClasses(token, userId, classes) {
  const { data, error } = await client(token).rpc('roe_assign_faculty_classes', { target_user_id: userId, class_names: classes });
  if (error) throw error;
  return data || [];
}

async function reviewFacultyRequest(token, userId, decision) {
  const { data, error } = await client(token).rpc('roe_review_faculty', { target_user_id: userId, decision });
  if (error) throw error;
  return data;
}

async function listStudentApprovals(token) {
  const { data, error } = await client(token).from('roe_profiles')
    .select('user_id,full_name,student_number,grade,class_name,faculty_user_id,approval_status,created_at,approved_at')
    .eq('role', 'student').order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function reviewStudentApproval(token, adminUserId, userId, decision) {
  if (!['approved', 'rejected'].includes(decision)) throw new Error('잘못된 승인 상태입니다.');
  const row = {
    approval_status: decision,
    approved_at: new Date().toISOString(),
    approved_by: adminUserId,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await client(token).from('roe_profiles')
    .update(row).eq('user_id', userId).eq('role', 'student').select().single();
  if (error) throw error;
  return data;
}

async function manageStudentRoute(token, adminUserId, userId, className) {
  const sb = client(token);
  if (!className) {
    const { data, error } = await sb.from('roe_profiles').update({
      class_name: null, faculty_user_id: null, approval_status: 'pending',
      approved_at: null, approved_by: null, updated_at: new Date().toISOString(),
    }).eq('user_id', userId).eq('role', 'student').select().single();
    if (error) throw error;
    return data;
  }
  const normalized = String(className).toUpperCase();
  const { data: route, error: routeError } = await sb.from('roe_faculty_classes')
    .select('faculty_user_id,class_name').eq('class_name', normalized).single();
  if (routeError || !route) throw new Error('지도교수가 배정된 분반을 선택하세요.');
  const { data, error } = await sb.from('roe_profiles').update({
    class_name: route.class_name, faculty_user_id: route.faculty_user_id,
    approval_status: 'approved', approved_at: new Date().toISOString(),
    approved_by: adminUserId, updated_at: new Date().toISOString(),
  }).eq('user_id', userId).eq('role', 'student').select().single();
  if (error) throw error;
  return data;
}

async function reportStudentNumberConflict(token, studentNumber) {
  const { error } = await client(token).rpc('roe_report_student_number_conflict', { p_student_number: studentNumber });
  if (error) throw error;
}

async function listStudentNumberConflicts(token) {
  const { data, error } = await client(token).rpc('roe_list_student_number_conflicts');
  if (error) throw error;
  return data || [];
}

async function resolveStudentNumberConflict(token, conflictId) {
  const { error } = await client(token).rpc('roe_resolve_student_number_conflict', { conflict_id: conflictId });
  if (error) throw error;
}

async function releaseStudentNumber(token, userId) {
  const { error } = await client(token).rpc('roe_release_student_number', { target_user_id: userId });
  if (error) throw error;
}

async function adminUpdateStudent(token, userId, { fullName, studentNumber, grade, className }) {
  const { data, error } = await client(token).rpc('roe_admin_update_student', {
    target_user_id: userId, p_full_name: fullName, p_student_number: studentNumber,
    p_grade: Number(grade), p_class_name: className,
  });
  if (error) throw error;
  return data;
}

async function createSession(token, userId, data) {
  const sb = client(token);
  const className = String(data.className || '').toUpperCase();
  const { data: route, error: routeError } = await sb.from('roe_faculty_classes')
    .select('faculty_user_id,class_name').eq('class_name', className).single();
  if (routeError || !route) throw new Error('지도교수가 배정된 분반을 선택하세요.');
  const { error: profileError } = await sb.from('roe_profiles').update({
    class_name: route.class_name,
    faculty_user_id: route.faculty_user_id,
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  if (profileError) throw profileError;
  const row = {
    student_user_id: userId, faculty_user_id: route.faculty_user_id,
    case_id: data.caseId, class_name: route.class_name,
    team_name: data.teamName || '', members: data.members || [],
  };
  const { data: saved, error } = await sb.from('roe_sessions').insert(row).select().single();
  if (error) throw error;
  return toSession(saved);
}

/* 교수자·관리자 미리보기 세션 — 조 정보(분반/조이름/조원) 입력 없이 병실에 바로 들어가기 위한 것.
 * 학생 세션과 달리 지도교수 배정 조회도, 프로필 변경도 하지 않는다.
 * (교수자 프로필은 role이 student가 아니라 RLS상 수정이 막혀 있기도 하다) */
const PREVIEW_CLASS = '미리보기';

async function createPreviewSession(token, userId, data) {
  const row = {
    student_user_id: userId,
    faculty_user_id: userId, // 본인을 담당자로 두어 이후 조회·수정 권한을 확보
    case_id: data.caseId,
    class_name: PREVIEW_CLASS,
    team_name: data.teamName || '교수 미리보기',
    members: data.members || [],
  };
  const { data: saved, error } = await client(token).from('roe_sessions').insert(row).select().single();
  if (error) throw error;
  return toSession(saved);
}

async function getSession(token, id) {
  const { data, error } = await client(token).from('roe_sessions').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return toSession(data);
}

async function updateSession(token, id, patch) {
  const row = {};
  const map = { findings: 'findings', priorities: 'priorities', sbar: 'sbar', reflection: 'reflection', manualScores: 'manual_scores', status: 'status', submittedAt: 'submitted_at' };
  for (const [keyName, column] of Object.entries(map)) if (patch[keyName] !== undefined) row[column] = patch[keyName];
  row.updated_at = new Date().toISOString();
  const { data, error } = await client(token).from('roe_sessions').update(row).eq('id', id).select().maybeSingle();
  if (error) throw error;
  return toSession(data);
}

async function listProfilesByIds(token, ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const out = [];
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await client(token).from('roe_profiles')
      .select('user_id,full_name,student_number,grade,class_name,role').in('user_id', unique.slice(i, i + 200));
    if (error) throw error;
    out.push(...(data || []));
  }
  return out;
}

async function listMySessions(token, userId, caseId) {
  let q = client(token).from('roe_sessions').select('*').eq('student_user_id', userId).order('updated_at', { ascending: false });
  if (caseId) q = q.eq('case_id', caseId);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(toSession);
}

async function listSessions(token, filter = {}) {
  let q = client(token).from('roe_sessions').select('*').order('created_at', { ascending: false });
  if (filter.caseId) q = q.eq('case_id', filter.caseId);
  if (filter.className) q = q.eq('class_name', filter.className);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(toSession);
}

module.exports = { configured, getIdentity, signUp, signIn, updateProfile, requestFacultyAccess, listFacultyRequests, listFacultyRoutes, assignFacultyClasses, reviewFacultyRequest, listStudentApprovals, reviewStudentApproval, manageStudentRoute, reportStudentNumberConflict, listStudentNumberConflicts, resolveStudentNumberConflict, releaseStudentNumber, adminUpdateStudent, createSession, createPreviewSession, PREVIEW_CLASS, getSession, updateSession, listSessions, listProfilesByIds, listMySessions };
