/**
 * 내보내기 모듈 — 채점/세션 데이터를 여러 형식으로 변환
 *  - CSV        (Excel·한글셀에서 열림)
 *  - XLSX       (SheetJS, 정식 Excel)
 *  - DOC(HTML)  (MS Word·한글에서 그대로 열림)
 *  - HTML 리포트 (브라우저 인쇄 → PDF 저장)
 * 한글(Hancom) Office 는 xlsx/doc/csv/html 을 모두 직접 열 수 있어 hwpx 대체가 가능함.
 */
const XLSX = require('xlsx');

const COLUMNS = [
  { key: 'caseId', label: '사례' },
  { key: 'className', label: '반' },
  { key: 'teamName', label: '조' },
  { key: 'members', label: '조원' },
  { key: 'status', label: '상태' },
  { key: 'detectedCount', label: '탐지수' },
  { key: 'highRiskHit', label: '고위험탐지' },
  { key: 'detection', label: '탐지(40)' },
  { key: 'highRisk', label: '고위험(15)' },
  { key: 'priority', label: '우선순위(15)' },
  { key: 'sbar', label: 'SBAR(15)' },
  { key: 'teamwork', label: '팀워크(10)' },
  { key: 'reflection', label: '성찰(5)' },
  { key: 'total', label: '총점(100)' },
  { key: 'createdAt', label: '생성일시' },
];

const STATUS_KR = { exploring: '관찰중', reporting: '보고완료', scored: '채점완료' };

/** 세션 rows(교수 대시보드 형태) → 평면 레코드 배열 */
function flatten(rows) {
  return rows.map((r) => {
    const b = r.breakdown || {};
    return {
      caseId: 'CASE ' + r.caseId,
      className: r.className || '',
      teamName: r.teamName || '',
      members: (r.members || []).join(', '),
      status: STATUS_KR[r.status] || r.status || '',
      detectedCount: r.detectedCount ?? 0,
      highRiskHit: (r.highRiskHit ?? 0) + '/5',
      detection: b.detection ?? 0,
      highRisk: b.highRisk ?? 0,
      priority: b.priority ?? 0,
      sbar: b.sbar ?? 0,
      teamwork: b.teamwork ?? 0,
      reflection: b.reflection ?? 0,
      total: r.total ?? '',
      createdAt: (r.createdAt || '').replace('T', ' ').slice(0, 16),
    };
  });
}

function toCSV(rows) {
  const recs = flatten(rows);
  const head = COLUMNS.map((c) => c.label).join(',');
  const body = recs.map((rec) =>
    COLUMNS.map((c) => {
      const v = String(rec[c.key] ?? '');
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    }).join(',')
  ).join('\n');
  return '﻿' + head + '\n' + body;   // BOM → Excel 한글 정상
}

function toXLSX(rows) {
  const recs = flatten(rows);
  const aoa = [COLUMNS.map((c) => c.label)];
  recs.forEach((rec) => aoa.push(COLUMNS.map((c) => rec[c.key])));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = COLUMNS.map((c) => ({ wch: Math.max(8, c.label.length + 2) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '채점표');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function tableHTML(rows) {
  const recs = flatten(rows);
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const th = COLUMNS.map((c) => `<th>${esc(c.label)}</th>`).join('');
  const trs = recs.map((rec) =>
    `<tr>${COLUMNS.map((c) => `<td>${esc(rec[c.key])}</td>`).join('')}</tr>`).join('');
  return `<table border="1" cellspacing="0" cellpadding="5">
    <thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

/** MS Word / 한글에서 열리는 .doc (HTML 기반) */
function toDoc(rows, title) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <style>body{font-family:'맑은 고딕','Malgun Gothic',sans-serif;}
  h1{font-size:18pt;} table{border-collapse:collapse;font-size:9pt;} th{background:#dce6f1;}</style>
  </head><body><h1>${title}</h1><p>생성: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</p>
  ${tableHTML(rows)}</body></html>`;
}

/** 인쇄→PDF 용 리포트 페이지 */
function reportHTML(rows, title) {
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${title}</title>
  <style>
    @page { size: A4 landscape; margin: 14mm; }
    body{font-family:'Malgun Gothic','맑은 고딕',sans-serif; color:#111;}
    h1{font-size:20px;margin:0 0 4px;} .sub{color:#666;font-size:12px;margin-bottom:14px;}
    table{border-collapse:collapse;width:100%;font-size:11px;}
    th,td{border:1px solid #999;padding:5px 6px;text-align:center;}
    th{background:#e8eef7;} tr:nth-child(even) td{background:#f6f8fc;}
    .toolbar{margin-bottom:12px;} @media print{.toolbar{display:none;}}
    button{padding:8px 16px;font-size:13px;border-radius:8px;border:1px solid #888;cursor:pointer;background:#2f6fd6;color:#fff;}
  </style></head><body>
  <div class="toolbar"><button onclick="window.print()">🖨️ 인쇄 / PDF로 저장</button></div>
  <h1>${title}</h1>
  <div class="sub">경민대학교 통합시뮬레이션수업 · Room of Errors · 생성 ${new Date().toISOString().slice(0, 16).replace('T', ' ')}</div>
  ${tableHTML(rows)}
  </body></html>`;
}

module.exports = { toCSV, toXLSX, toDoc, reportHTML, flatten, COLUMNS };
