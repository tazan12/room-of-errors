/**
 * 초경량 JSON 파일 데이터스토어.
 * 네이티브 의존성(better-sqlite3 등) 없이 Windows에서도 바로 실행되도록
 * fs 기반 단일 파일 저장소를 사용한다. (교육용 규모에 충분)
 */
const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.json');

const DEFAULT = {
  sessions: {},   // sessionId -> session 객체
  seq: 0,
};

let cache = null;

function load() {
  if (cache) return cache;
  try {
    cache = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (e) {
    cache = JSON.parse(JSON.stringify(DEFAULT));
  }
  return cache;
}

function persist() {
  fs.writeFileSync(DB_PATH, JSON.stringify(cache, null, 2), 'utf-8');
}

function nextId(prefix) {
  const db = load();
  db.seq += 1;
  return `${prefix}${db.seq.toString(36)}${Date.now().toString(36).slice(-4)}`;
}

/* ---------- 세션 CRUD ---------- */
function createSession(data) {
  const db = load();
  const id = nextId('S');
  const session = {
    id,
    caseId: data.caseId,
    className: data.className || '',
    teamName: data.teamName || '',
    members: data.members || [],
    createdAt: new Date().toISOString(),
    status: 'exploring',        // exploring -> reporting -> scored
    findings: [],               // {code|null, objectId, location, why, action, flagged, isHighRiskGuess}
    priorities: [],             // 상위 5개 findingId (순서)
    sbar: { s: '', b: '', a: '', r: '' },
    reflection: { firstAction: '', rationale: '', missed: '', apply: '', teamwork: '' },
    manualScores: {},           // {priority, sbar, teamwork, reflection}
    score: null,
  };
  db.sessions[id] = session;
  persist();
  return session;
}

function getSession(id) {
  return load().sessions[id] || null;
}

function updateSession(id, patch) {
  const db = load();
  const s = db.sessions[id];
  if (!s) return null;
  Object.assign(s, patch);
  persist();
  return s;
}

function listSessions(filter = {}) {
  const db = load();
  let arr = Object.values(db.sessions);
  if (filter.caseId) arr = arr.filter((s) => s.caseId === filter.caseId);
  if (filter.className) arr = arr.filter((s) => s.className === filter.className);
  return arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

module.exports = {
  createSession, getSession, updateSession, listSessions, nextId,
};
