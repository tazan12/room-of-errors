/* 백엔드 REST API 클라이언트 */
const API = (() => {
  const base = '';
  let accessToken = sessionStorage.getItem('roe_access_token') || '';
  let currentUser = JSON.parse(sessionStorage.getItem('roe_user') || 'null');
  let authClient = null;

  function clearCachedAuth() {
    accessToken = '';
    currentUser = null;
    sessionStorage.removeItem('roe_access_token');
    sessionStorage.removeItem('roe_user');
  }

  async function req(method, url, body, allowRefresh = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    const opt = { method, headers };
    if (body !== undefined) opt.body = JSON.stringify(body);
    const r = await fetch(base + url, opt);
    if (r.status === 401 && allowRefresh && authClient) {
      const { data, error } = await authClient.auth.refreshSession();
      if (!error && data.session?.access_token) {
        accessToken = data.session.access_token;
        sessionStorage.setItem('roe_access_token', accessToken);
        return req(method, url, body, false);
      }
      clearCachedAuth();
    }
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  }

  return {
    /* 인증 */
    async init() {
      const config = await req('GET', '/api/auth/public-config');
      authClient = window.supabase.createClient(config.supabaseUrl, config.publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
      });
      const { data } = await authClient.auth.getSession();
      if (data.session?.access_token) {
        accessToken = data.session.access_token;
        sessionStorage.setItem('roe_access_token', accessToken);
        const sessionUser = data.session.user;
        currentUser = {
          id: sessionUser.id,
          email: sessionUser.email,
          role: sessionUser.app_metadata?.role === 'admin' ? 'admin' : 'student',
          profile: null,
        };
        sessionStorage.setItem('roe_user', JSON.stringify(currentUser));
        let lastError;
        for (let attempt = 0; attempt < 3; attempt += 1) {
          try { await this.me(); lastError = null; break; }
          catch (e) { lastError = e; await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1))); }
        }
        // Auth app metadata is issued by the server and is sufficient to route
        // an administrator even if the profile endpoint is temporarily delayed.
        if (lastError && currentUser.role !== 'admin') throw lastError;
      } else {
        // Never route from stale sessionStorage data after a server-side logout.
        clearCachedAuth();
      }
      return currentUser;
    },
    isLoggedIn: () => !!accessToken,
    isAdmin: () => currentUser?.role === 'admin',
    user: () => currentUser,
    async login(email, password) {
      const data = await req('POST', '/api/auth/login', { email, password });
      accessToken = data.accessToken; currentUser = data.user;
      sessionStorage.setItem('roe_access_token', accessToken);
      sessionStorage.setItem('roe_user', JSON.stringify(currentUser));
      return currentUser;
    },
    async loginWithGoogle(mode = 'student') {
      if (!authClient) throw new Error('인증 서비스를 준비하는 중입니다.');
      sessionStorage.setItem('roe_login_mode', mode);
      const { error } = await authClient.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${location.origin}/` },
      });
      if (error) throw error;
    },
    consumeLoginMode() {
      const mode = sessionStorage.getItem('roe_login_mode') || '';
      sessionStorage.removeItem('roe_login_mode');
      return mode;
    },
    updateProfile: (data) => req('PUT', '/api/auth/profile', data),
    requestFacultyAccess: () => req('POST', '/api/faculty/request'),
    facultyRequests: () => req('GET', '/api/admin/faculty-requests'),
    reviewFaculty: (userId, decision) => req('PUT', `/api/admin/faculty-requests/${userId}`, { decision }),
    studentApprovals: () => req('GET', '/api/admin/student-approvals'),
    reviewStudent: (userId, decision) => req('PUT', `/api/admin/student-approvals/${userId}`, { decision }),
    async me() {
      currentUser = await req('GET', '/api/auth/me');
      sessionStorage.setItem('roe_user', JSON.stringify(currentUser));
      return currentUser;
    },
    async logout() {
      if (authClient) await authClient.auth.signOut().catch(() => {});
      clearCachedAuth();
      sessionStorage.removeItem('roe_login_mode');
    },
    async downloadExport(fmt, q = {}) {
      const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
      const r = await fetch(`/api/export/scores.${fmt}?${p}`, { headers: { Authorization: `Bearer ${accessToken}` } });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || '내보내기 실패');
      const blob = await r.blob(); const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `RoomOfErrors_scores.${fmt === 'html' ? 'html' : fmt}`; a.click(); URL.revokeObjectURL(url);
    },

    /* 사례·세션 */
    listCases: () => req('GET', '/api/cases'),
    getCase: (id) => req('GET', `/api/cases/${id}`),
    getAnswers: (id) => req('GET', `/api/cases/${id}/answers`),
    createSession: (data) => req('POST', '/api/sessions', data),
    getSession: (id) => req('GET', `/api/sessions/${id}`),
    saveFindings: (id, findings) => req('PUT', `/api/sessions/${id}/findings`, { findings }),
    savePriorities: (id, priorities) => req('PUT', `/api/sessions/${id}/priorities`, { priorities }),
    saveSbar: (id, sbar) => req('PUT', `/api/sessions/${id}/sbar`, { sbar }),
    saveReflection: (id, reflection) => req('PUT', `/api/sessions/${id}/reflection`, { reflection }),
    submit: (id) => req('POST', `/api/sessions/${id}/submit`),
    getScore: (id) => req('GET', `/api/sessions/${id}/score`),
    saveManual: (id, manualScores) => req('PUT', `/api/sessions/${id}/manual`, { manualScores }),
    professorSessions: (q = {}) => {
      const p = new URLSearchParams(Object.entries(q).filter(([, v]) => v));
      return req('GET', `/api/professor/sessions?${p}`);
    },
  };
})();
