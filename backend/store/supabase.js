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
    caseId: row.case_id,
    className: row.class_name,
    teamName: row.team_name,
    members: row.members || [],
    status: row.status,
    findings: row.findings || [],
    priorities: row.priorities || [],
    sbar: row.sbar || { s: '', b: '', a: '', r: '' },
    reflection: row.reflection || {},
    manualScores: row.manual_scores || {},
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
  };
}

async function getIdentity(token) {
  const sb = client(token);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  // Administrators are identified by trusted Auth app metadata.  Do not make
  // admin access depend on the student profile table being available.
  if (user.app_metadata?.role === 'admin') {
    return { user, profile: null, role: 'admin' };
  }
  const { data: profile } = await sb.from('roe_profiles').select('*').eq('user_id', user.id).maybeSingle();
  return {
    user,
    profile,
    role: user.app_metadata?.role === 'admin' || profile?.role === 'admin' ? 'admin' : 'student',
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

async function updateProfile(token, userId, { fullName, studentNumber, grade, className }) {
  const row = {
    full_name: fullName,
    student_number: studentNumber,
    grade,
    class_name: className,
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

async function reviewFacultyRequest(token, userId, decision) {
  const { data, error } = await client(token).rpc('roe_review_faculty', { target_user_id: userId, decision });
  if (error) throw error;
  return data;
}

async function createSession(token, userId, data) {
  const row = {
    student_user_id: userId, case_id: data.caseId, class_name: data.className || '',
    team_name: data.teamName || '', members: data.members || [],
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

async function listSessions(token, filter = {}) {
  let q = client(token).from('roe_sessions').select('*').order('created_at', { ascending: false });
  if (filter.caseId) q = q.eq('case_id', filter.caseId);
  if (filter.className) q = q.eq('class_name', filter.className);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(toSession);
}

module.exports = { configured, getIdentity, signUp, signIn, updateProfile, requestFacultyAccess, listFacultyRequests, reviewFacultyRequest, createSession, getSession, updateSession, listSessions };
