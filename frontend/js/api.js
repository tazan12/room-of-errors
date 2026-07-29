/* 백엔드 REST API 클라이언트 */
const API = (() => {
  const base = '';
  let adminCode = localStorage.getItem('roe_admin') || '';

  async function req(method, url, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (adminCode) headers['x-admin-code'] = adminCode;
    const opt = { method, headers };
    if (body !== undefined) opt.body = JSON.stringify(body);
    const r = await fetch(base + url, opt);
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
    return r.json();
  }

  return {
    /* 관리자 */
    isAdmin: () => !!adminCode,
    async adminLogin(code) {
      const r = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || '로그인 실패');
      adminCode = code; localStorage.setItem('roe_admin', code);
      return true;
    },
    adminLogout() { adminCode = ''; localStorage.removeItem('roe_admin'); },
    exportUrl(fmt, q = {}) {
      const p = new URLSearchParams({ ...q, code: adminCode });
      return `/api/export/scores.${fmt}?${p}`;
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
