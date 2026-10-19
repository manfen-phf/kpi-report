/* ============================================================
   商品运营分析报告 —— 前端渲染
   数据来源 window.REPORT_DATA（由 report_data.py 生成）
   UI 复刻自 0916-legacy.html：双板块 = 分区进度 / 玉林总商KPI播报
   ============================================================ */
(function () {
'use strict';

const D = window.REPORT_DATA;
if (!D) {
  document.body.innerHTML = '<div style="padding:60px;color:#fff;font-size:18px">'
    + '数据未加载：请先运行 report_data.py 生成 data.js</div>';
  return;
}

const M = D.meta, ROWS = D.rows, CITIES = M.cities, NO_SQS = new Set(M.no_sqs);
const FINE = (M.equity_rules && M.equity_rules.warn_line) || 90, BLUE = 36, W = M.weights;
// 负向/正向权益规则（依据学城《2026年10月城市外卖绩效考核方案-考核框架和关联权益》）
const EQ = M.equity_rules || {};
const DIST = D.districts;

/* ---------------- 工具 ---------------- */
const $ = s => document.querySelector(s);
const fmt = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n)) ? '—'
  : Number(n).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : (n * 100).toFixed(d) + '%';
const wan = n => (n === null || n === undefined) ? '—'
  : (n >= 1e8 ? (n / 1e8).toFixed(2) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : fmt(n));
const esc = s => String(s === null || s === undefined ? '' : s).replace(/[&<>"]/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* 得分/完成率着色（沿用原模板 sc-g / sc-y / sc-r 三色） */
function sc(v, th) {           //越高越好
  if (v === null || v === undefined) return 'ph';
  return v >= th ? 'sc-g' : v >= th * 0.9 ? 'sc-y' : 'sc-r';
}
function scLow(v, th) {        // 越低越好（如系数）
  if (v === null || v === undefined) return 'ph';
  return v <= 0 ? 'sc-r' : v < th ? 'sc-y' : 'sc-g';
}

/* ---------------- 主 Tab 切换 ---------------- */
function showMainTab(id, btn) {
  document.querySelectorAll('.main-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  const el = document.getElementById(id);
  if (el) el.classList.add('active');
  if (id === 'tab2') requestAnimationFrame(renderOps);
  // 同步 hash，便于分享深链；用 replaceState 避免污染历史记录
  if (location.hash.slice(1) !== id) history.replaceState(null, '', '#' + id);
}

/* ============================================================
   TAB 1 —— 分区进度
   ============================================================ */
let focusDist = null;   // 选中的分区经理，默认取排行榜第1名

function distByName(n) {
  return DIST.rows.find(r => r.name === n) || null;
}

function renderTab1() {
  const day = Number(M.data_date.slice(-2));
  const tp = M.time_pct;

  // 时间进度
  document.getElementById('tpTitle').textContent =
    `T-1 时间进度（${M.data_date.slice(0, 4)}年${Number(M.data_date.slice(5, 7))}月${day}日）`;
  document.getElementById('tpLabel').textContent = `${pct(tp)} (${day}/${M.month_days})`;
  const fill = document.getElementById('tpFill');
  fill.style.width = (tp * 100).toFixed(2) + '%';
  fill.textContent = pct(tp);

  document.getElementById('subtitle').textContent =
    `数据周期：结果${M.data_date.slice(5)} · 过程${M.data_date.slice(5)}（10月考核口径）`;

  if (!focusDist && DIST.rows.length) focusDist = DIST.rows[0].name;
  renderFocusSelect();
  renderDistCards();
  renderRankTable();
}

function renderFocusSelect() {
  const sel = document.getElementById('focusSel');
  sel.innerHTML = DIST.rows.map(r =>
    `<option value="${esc(r.name)}"${r.name === focusDist ? ' selected' : ''}>${esc(r.name)}</option>`
  ).join('');
  sel.onchange = () => { focusDist = sel.value; renderDistCards(); };
  document.getElementById('focusDist').textContent = focusDist || '—';
  document.getElementById('kpiDate').textContent =
    `${M.data_date.slice(0, 7).replace('-', '月')}日（10月试算·数据截至${M.data_date.slice(5)}）`;
}

/* 四张KPI 卡片 —— 结构与配色完全对齐原模板 */
const CARD_META = [
  { icon: '🍚', label: '拼好饭订单（40%）', color: '#7c3aed', bg: '#ede9fe' },
  { icon: '🔥', label: '神抢手货盘（30%）', color: '#db2777', bg: '#fce7f3' },
  { icon: '📦', label: '拼好饭货盘（20%）', color: '#0d9488', bg: '#ccfbf1' },
  { icon: '🏪', label: '月度覆盖率（10%）', color: '#2563eb', bg: '#dbeafe' }
];

function renderDistCards() {
  const r = distByName(focusDist);
  const b = DIST.base;
  if (!r) { document.getElementById('distCards').innerHTML = ''; return; }

  const vals = [
    { v: r.s1, base: b.s1 },
    { v: r.sqs_kgr, base: b.sqs_kgr },
    { v: r.phf_kgr, base: b.phf_kgr },
    { v: r.cov, base: b.cov }
  ];

  document.getElementById('distCards').innerHTML = CARD_META.map((m, i) => {
    const { v, base } = vals[i];
    let diffHtml;
    if (v === null || v === undefined || base === null || base === undefined) {
      diffHtml = `广西区域: <b style="color:#333;">${pct(base)}</b> &nbsp; 差距: <b style="color:#999;">—</b>`;
    } else {
      const d = (v - base) * 100;
      const col = d >= 0 ? '#52c41a' : '#f44336';
      diffHtml = `广西区域: <b style="color:#333;">${pct(base)}</b> &nbsp; 差距: `
        + `<b style="color:${col};">${d >= 0 ? '+' : ''}${d.toFixed(2)}%</b>`;
    }
    return `<div class="kpi-district-card" style="background:#fff;border-radius:12px;padding:18px 20px;`
      + `box-shadow:0 2px 12px rgba(0,0,0,0.08);border-left:4px solid ${m.color};position:relative;">`
      + `<div style="display:flex;align-items:center;margin-bottom:10px;">`
      + `<span style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;`
      + `border-radius:10px;background:${m.bg};font-size:22px;margin-right:10px;">${m.icon}</span>`
      + `<span style="font-size:14px;font-weight:700;color:#333;">${m.label}</span></div>`
      + `<div style="font-size:32px;font-weight:800;color:${m.color};margin-bottom:8px;">${pct(v)}</div>`
      + `<div style="font-size:12px;color:#888;line-height:1.9;">${diffHtml}</div></div>`;
  }).join('');
}

/* 分区排名表 —— 列与徽章、风险色完全对齐原模板 */
function renderRankTable() {
  const ths = ['排名', '分区经理', '拼好饭完成率', '神抢手攻克率', '拼好饭攻克率', '月度覆盖率', '综合得分', '对比基准', '风险状态'];
  const b = DIST.base;
  const td = (txt, cls2, style) => `<td style="padding:10px 10px;text-align:center;${style || ''};${cls2 ? 'font-weight:700;' : ''}">${txt}</td>`;
  const gapCell = g => {
    if (g === null || g === undefined) return td('—', 0, 'color:#999;');
    const c = g >= 0 ? '#52c41a' : g > -DIST.high_gap ? '#fa8c16' : '#f5222d';
    return td(`${g >= 0 ? '+' : ''}${g.toFixed(2)}`, 1, `color:${c};`);
  };

  const baseRow = `<tr style="background:#fffbe6;">
    ${td('—', 1, 'font-size:15px;')}
    ${td(esc(b.name), 1, 'color:#333;font-weight:600;white-space:nowrap;')}
    ${td(pct(b.s1), 1, `color:${scoreColor(b.s1, 0.5)};`)}
    ${td(pct(b.sqs_kgr), 1, `color:${scoreColor(b.sqs_kgr, 0.4)};`)}
    ${td(pct(b.phf_kgr), 1, `color:${scoreColor(b.phf_kgr, 0.75)};`)}
    ${td(pct(b.cov), 1, `color:${scoreColor(b.cov, 0.6)};`)}
    ${td(b.score.toFixed(2), 1, 'color:#3a5e8c;')}
    ${td('基准', 1, 'color:#3a5e8c;')}
    ${td('基准', 1, 'color:#3a5e8c;')}</tr>`;

  const rows = DIST.rows.map(r => {
    const cur = r.name === focusDist;
    return `<tr style="background:${cur ? '#f0f4ff' : '#fff'};">
      ${td(esc(r.rank), 1, 'font-size:15px;')}
      ${td(esc(r.name), 1, `color:#333;white-space:nowrap;${cur ? 'background:#e8efff;' : ''}`)}
      ${td(pct(r.s1), 1, `color:${scoreColor(r.s1, 0.5)};`)}
      ${td(pct(r.sqs_kgr), 1, `color:${scoreColor(r.sqs_kgr, 0.4)};`)}
      ${td(pct(r.phf_kgr), 1, `color:${scoreColor(r.phf_kgr, 0.75)};`)}
      ${td(pct(r.cov), 1, `color:${scoreColor(r.cov, 0.6)};`)}
      ${td(r.score.toFixed(2), 1, `color:${r.risk_color};`)}
      ${gapCell(r.gap)}
      ${td(esc(r.risk), 1, `color:${r.risk_color};`)}</tr>`;
  }).join('');

  document.getElementById('rankTable').innerHTML =
    `<thead><tr>${ths.map((t, i) =>
      `<th style="background:${i === 0 ? '#3a5e8c' : '#4a5f8a'};color:#fff;padding:11px 10px;font-weight:600;">${t}</th>`
    ).join('')}</tr></thead><tbody>${baseRow}${rows}</tbody>`;

  // 点击行切换聚焦分区
  document.querySelectorAll('#rankTable tbody tr').forEach((tr, i) => {
    if (i === 0) return;      // 基准行不可选
    tr.style.cursor = 'pointer';
    tr.onclick = () => {
      focusDist = DIST.rows[i - 1].name;
      renderFocusSelect(); renderDistCards(); renderRankTable();
    };
  });
}

function scoreColor(v, th) {
  if (v === null || v === undefined) return '#999';
  return v >= th ? '#52c41a' : v >= th * 0.9 ? '#fa8c16' : '#f5222d';
}

/* ============================================================
   TAB 2 —— 玉林总商 KPI 播报
   ============================================================ */
function renderTab2() {
  document.getElementById('kpiTitle').textContent =
    '玉林总商 · 拼好饭 & 神抢手 KPI 绩效得分播报';
  document.getElementById('kpiSub').innerHTML =
    `南部大区 · 广西区域 ｜ 2026-10 ｜ 数据截至 ${M.data_date} ｜ 制表人：陈杜烽（玉林总商，自动生成）`
    + ` ｜ 数据来源：10月目标表（总部10月6日）`;

  const tp = M.time_pct;
  document.getElementById('prLabel').textContent = `⏰ 10月时间进度`;
  document.getElementById('prFill').style.width = (tp * 100).toFixed(2) + '%';
  document.getElementById('prPct').textContent = `${pct(tp)} (${M.data_date.slice(-2)}/${M.month_days})`;

  // ---------- 负向/正向权益判定
const warned = ROWS.filter(r => r.equity && r.equity.warn && !r.equity.exempt_eligible);
const fined = ROWS.filter(r => r.equity && r.equity.fine && r.equity.fine_state === '触发');
const relieved = ROWS.filter(r => r.equity && r.equity.fine && r.equity.relief);
const warnBox = document.getElementById('kpiWarn');
const parts = [];
if (warned.length) {
  parts.push(`<b>⚠️ 警告风险（模块得分 &lt; ${EQ.warn_line}分）：</b>`
    + warned.map(r => `${r.city}（${r.equity.module_score.toFixed(2)}分 / ${r.grade || '--'}）`).join('、')
    + `　→ 各触发 <b>1 个警告</b>${EQ.max_warn_total ? `（各模块累加，城市最多 ${EQ.max_warn_total} 个）` : ''}`);
} else {
  parts.push(`<b>✅ 警告风险：无</b> —— 8 城模块绩效得分均 ≥ ${EQ.warn_line} 分`
    + `（最低 ${Math.min(...ROWS.map(r => r.equity.module_score)).toFixed(2)} 分）`);
}
if (fined.length) {
  parts.push(`<b>💰 罚款触发：</b>` + fined.map(r => {
    const amt = r.equity.fine_amount ? `${r.equity.fine_amount.toLocaleString('zh-CN')} 元` : '不罚款';
    return `${r.city}（过程完成率 ${pct(r.equity.proc_rate, 1)} &lt; ${pct(EQ.fine_rate, 0)}，${r.grade} → ${amt}）`;
  }).join('、'));
} else {
  parts.push(`<b>✅ 罚款触发：无</b> —— 8 城过程模块完成率均 ≥ ${pct(EQ.fine_rate, 0)}`);
}
if (relieved.length) {
  parts.push(`<b>🛡️ 罚款减免：</b>${relieved.map(r =>
    `${r.city}（结果 ${pct(r.equity.res_rate, 1)} ≥ ${pct(EQ.relief_result, 0)} 且过程 ${pct(r.equity.proc_rate, 1)} ≥ ${pct(EQ.relief_proc, 0)}）`
  ).join('、')} → 本应触发但已减免`);
}
warnBox.innerHTML = parts.join('<br>');
warnBox.style.background = (warned.length || fined.length) ? '#fff5f5' : '#f2fbf3';
warnBox.style.borderColor = (warned.length || fined.length) ? '#f3c9c9' : '#b7e4c1';
warnBox.style.color = (warned.length || fined.length) ? '#a3332f' : '#2c6e35';

renderKpiTables();
renderNotes();
}

/* 三张表：实际完成版 / 预估完成版 / 过程指标明细 —— 列与配色对齐原模板 */
function th2(isEst) {
  return `<thead>
  <tr class="grp">
    <th class="base" rowspan="2" style="width:88px;">城市</th>
    <th class="base" rowspan="2" style="width:56px;">城市等级</th>
    <th class="g-s1" colspan="4">① S1 PHF订单完成率（权重40%）</th>
    <th class="g-sqs" colspan="5">② 神抢手重点货盘达标率（权重30%）</th>
    <th class="g-phf" colspan="5">③ 拼好饭重点货盘达标率（权重20%/35%）</th>
    <th class="g-p2" colspan="5">④ P3 商家优惠活动覆盖率（权重10%/25%）</th>
    <th class="g-sum" rowspan="2" style="width:96px;">绩效总得分</th>
    <th class="g-sum" rowspan="2" style="width:92px;">过程指标<br>完成率</th>
    ${isEst ? `<th class="g-fine" rowspan="2" style="width:78px;">预测<br>警告</th>
    <th class="g-fine" rowspan="2" style="width:92px;">预测罚款</th>` : ''}
  </tr>
  <tr class="sub">
    <th class="s1">目标数</th><th class="s1">完成</th><th class="s1">完成率</th><th class="s1">系数</th><th class="s1">得分</th>
    <th class="sqs">目标数</th><th class="sqs">达标数</th><th class="sqs">达标率</th><th class="sqs">系数</th><th class="sqs">得分</th>
    <th class="phf">目标数</th><th class="phf">达标数</th><th class="phf">达标率</th><th class="phf">系数</th><th class="phf">得分</th>
    <th class="p2">目标</th><th class="p2">达标</th><th class="p2">覆盖率</th><th class="p2">系数</th><th class="p2">得分</th>
  </tr></thead>`;
}

function cellAct(r, isEst) {
  const cur = isEst ? r.proj : r.cur;
  const rate = isEst ? r.proj_rate : r.rate;
  const k = isEst ? r.proj_score / (W[r.city]['S1'] * Math.min(rate || 1.2, 1.2) || 1) : r.s1_k;
  const score = isEst ? r.proj_score : r.s1_score;

  const sq = NO_SQS.has(r.city)
    ? `<td class="nc" colspan="5">不考核</td>`
    : (isEst
      ? `<td>${fmt(r.est_sq.pool)}</td><td>${fmt(r.est_sq.ok)}</td>
         <td class="${sc(r.est_sq.rate, 0.7)}">${pct(r.est_sq.rate)}</td>
         <td class="${scLow(r.est_sq.k, 1)}">${r.est_sq.k.toFixed(1)}</td>
         <td class="${sc(r.est_sq.score, 21)}">${r.est_sq.score.toFixed(2)}</td>`
      : `<td>${fmt(r.hp.SQS.pool)}</td><td>${fmt(r.hp.SQS.ok)}</td>
         <td class="${sc(r.sq_rate, 0.7)}">${pct(r.sq_rate)}</td>
         <td class="${scLow(r.sq_k, 1)}">${r.sq_k === null ? '—' : r.sq_k.toFixed(1)}</td>
         <td class="${sc(r.sq_score, 21)}">${r.sq_score === null ? '—' : r.sq_score.toFixed(2)}</td>`);

  const ph = `<td>${fmt(r.hp.PHF.pool)}</td><td>${fmt(r.hp.PHF.ok)}</td>
    <td class="${sc(r.ph_rate, 0.7)}">${pct(r.ph_rate)}</td>
    <td class="${scLow(r.ph_k, 1)}">${r.ph_k === null ? '—' : r.ph_k.toFixed(1)}</td>
    <td class="${sc(r.ph_score, 14)}">${r.ph_score.toFixed(2)}</td>`;

  const p3 = `<td>${fmt(r.p3_meta.pool)}</td><td>${fmt(r.p3_meta.ok)}</td>
    <td class="${sc(r.p3_rate, 0.6)}">${pct(r.p3_rate)}</td>
    <td class="${scLow(r.p3_k, 1)}">${r.p3_k === null ? '—' : r.p3_k.toFixed(1)}</td>
    <td class="${sc(r.p3_score, 6)}">${r.p3_score.toFixed(2)}</td>`;

  const proc = isEst ? r.est_proc : r.proc;
  const procPct = isEst ? r.est_pct : r.proc_pct;

  // 预估完成版末两列 = 按预估值预判的月末负向权益
  let eqCols = '';
  if (isEst && r.equity_est) {
    const e = r.equity_est;
    const warnBad = e.warn && !e.exempt_eligible;
    const fineBad = e.fine_state === '触发';
    const fineTxt = fineBad
      ? (e.relief ? '触发·减免' : '触发')
      : (e.fine_state === '减免' ? '触发·减免' : '不触发');
    eqCols = `<td class="${warnBad ? 'rt-r' : 'rt-g'}">${warnBad ? '触发' : '无'}</td>
      <td class="${fineBad ? 'rt-r' : 'rt-g'}">${fineTxt}${fineBad ? ` ${e.fine_amount.toLocaleString('zh-CN')}` : ''}</td>`;
  }

  return `<td class="city">${esc(r.city)}</td>
    <td class="tier">${esc(r.grade || '--')}</td>
    <td>${fmt(r.tgt)}</td><td>${fmt(cur)}</td>
    <td class="${sc(rate, 0.8)}">${pct(rate)}</td>
    <td class="${scLow(k, 1)}">${k === null || Number.isNaN(k) ? '—' : k.toFixed(1)}</td>
    <td class="${sc(score, 32)}">${score === null || Number.isNaN(score) ? '—' : score.toFixed(2)}</td>
    ${sq}${ph}${p3}
    <td class="${sc(proc, 36)}">${proc.toFixed(2)}</td>
    <td class="${sc(procPct, 0.6)}">${pct(procPct, 1)}</td>${eqCols}`;
}

function renderKpiTables() {
  // ① 实际完成版
  const t1 = ROWS.map(r => `<tr>${cellAct(r, false)}</tr>`).join('');

  // ② 预估完成版（浅米底 + 斜体，对齐原模板 fc-fore；末两列为按预估值预判的负向权益）
  const t2 = ROWS.map(r => `<tr style="background:#fdf6e9;">${cellAct(r, true)}</tr>`).join('');

  // ③ 过程指标明细
  const th3 = `<thead>
    <tr class="grp">
      <th class="base" rowspan="2" style="width:88px;">城市</th>
      <th class="g-sqs" colspan="3">重点货盘（汇总）</th>
      <th class="g-sqs" colspan="3">重点货盘（神抢手）</th>
      <th class="g-phf" colspan="3">重点货盘（拼好饭）</th>
      <th class="g-p2" colspan="4">④ P3 商家优惠活动覆盖率</th>
      <th class="g-sum" rowspan="2" style="width:96px;">过程指标得分</th>
    </tr>
    <tr class="sub">
      <th class="sqs">目标池</th><th class="sqs">达标数</th><th class="sqs">达标率</th>
      <th class="sqs">目标池</th><th class="sqs">达标数</th><th class="sqs">达标率</th>
      <th class="phf">目标池</th><th class="phf">达标数</th><th class="phf">达标率</th>
      <th class="p2">目标</th><th class="p2">达标</th><th class="p2">覆盖率</th><th class="p2">系数</th>
    </tr></thead>`;
  const t3 = ROWS.map(r => {
    const sq = NO_SQS.has(r.city)
      ? `<td class="nc" colspan="3">不考核</td>`
      : `<td>${fmt(r.hp.SQS.pool)}</td><td>${fmt(r.hp.SQS.ok)}</td><td class="${sc(r.sq_rate, 0.7)}">${pct(r.sq_rate)}</td>`;
    return `<tr>
      <td class="city">${esc(r.city)}</td>
      <td>${fmt(r.hp.ALL.pool)}</td><td>${fmt(r.hp.ALL.ok)}</td>
      <td class="${sc(r.hp.ALL.rate, 0.7)}">${pct(r.hp.ALL.rate)}</td>
      ${sq}
      <td>${fmt(r.hp.PHF.pool)}</td><td>${fmt(r.hp.PHF.ok)}</td>
      <td class="${sc(r.ph_rate, 0.7)}">${pct(r.ph_rate)}</td>
      <td>${fmt(r.p3_meta.pool)}</td><td>${fmt(r.p3_meta.ok)}</td>
      <td class="${sc(r.p3_rate, 0.6)}">${pct(r.p3_rate)}</td>
      <td class="${scLow(r.p3_k, 1)}">${r.p3_k === null ? '—' : r.p3_k.toFixed(1)}</td>
      <td class="${sc(r.proc, 36)}">${r.proc.toFixed(2)}</td></tr>`;
  }).join('');

  // ④ 负向/正向权益
  const thEq = `<thead><tr class="grp">
      <th class="base" style="width:82px;">城市</th>
      <th class="base" style="width:54px;">等级</th>
      <th class="g-s1">结果得分<br>(满分48)</th>
      <th class="g-sqs">过程得分<br>(满分72)</th>
      <th class="g-sum">模块绩效得分<br>(满分120)</th>
      <th class="g-p2">结果模块<br>完成率</th>
      <th class="g-p2">过程模块<br>完成率</th>
      <th class="g-s1">⚠️ 警告<br>(&lt;${EQ.warn_line}分)</th>
      <th class="g-fine">💰 罚款<br>(过程&lt;${pct(EQ.fine_rate, 0)})</th>
      <th class="g-fine">罚款金额</th>
      <th class="g-sum">🛡️ 减免/豁免</th>
    </tr></thead>`;
  const tEq = ROWS.map(r => {
    const e = r.equity;
    const warnBad = e.warn && !e.warn_state.startsWith('已豁免');
    const fineBad = e.fine_state === '触发';
    const reliefTag = e.fine_state === '减免'
      ? `<span style="color:#155f15;font-weight:700;">罚款减免</span>`
      : (e.warn_state.startsWith('已豁免')
        ? `<span style="color:#155f15;font-weight:700;">警告豁免(待核)</span>`
        : (e.exempt_eligible ? `<span style="color:#1f50a0;">得分达豁免线</span>` : '<span class="ph">—</span>'));
    return `<tr>
      <td class="city">${esc(r.city)}</td>
      <td class="tier">${esc(e.tier || '--')}</td>
      <td class="${sc(e.res_score, 40)}">${e.res_score.toFixed(2)}</td>
      <td class="${sc(e.proc_score, 57.6)}">${e.proc_score.toFixed(2)}</td>
      <td class="${e.module_score >= EQ.warn_line ? 'sc-g' : 'sc-r'}">${e.module_score.toFixed(2)}</td>
      <td class="${e.res_rate >= EQ.relief_result ? 'cv-g' : 'cv-0'}">${pct(e.res_rate, 1)}</td>
      <td class="${e.proc_rate >= EQ.fine_rate ? 'cv-g' : 'cv-o'}">${pct(e.proc_rate, 1)}</td>
      <td class="${warnBad ? 'rt-r' : 'rt-g'}">${warnBad ? '触发 1 个' : e.warn_state}</td>
      <td class="${fineBad ? 'rt-r' : 'rt-g'}">${fineBad ? '触发' : (e.fine_state === '减免' ? '触发(已减免)' : '不触发')}</td>
      <td class="${fineBad ? 'rt-r' : 'ph'}">${fineBad ? e.fine_amount.toLocaleString('zh-CN') : '—'}</td>
      <td>${reliefTag}</td></tr>`;
  }).join('');

  document.getElementById('kpiTables').innerHTML = `
    <div class="section-h">
      <span class="left">📊 实际完成版</span>
      <span class="sub">（截至 ${M.data_date}）基于当前实际完成数据</span>
    </div>
    <div style="padding:0 18px;"><table class="dash">${th2(false)}<tbody>${t1}</tbody></table></div>

    <div class="section-h forecast">
      <span class="left">🔮 预估完成版</span>
      <span class="sub">① 星期对星期外推；② 预估达标率＝当前上线率 −10pp；③ 按当前累计达标率；④ 按最新一日当日覆盖率外推至 ${M.month_days}/${M.month_days} 计月度日均；末两列＝按预估值预判的负向权益</span>
      <span class="tag">预估值</span>
    </div>
    <div class="fc-section" style="padding:0 18px;"><table class="dash">${th2(true)}<tbody>${t2}</tbody></table></div>

    <div class="sub-cap">过程指标明细（②③ 上线/达标取自货盘明细去重表分「P1SQS 神抢手／P2PHF 拼好饭」口径；④ 取考核期 ${M.p3_first.slice(5)} 起日均覆盖率）</div>
    <div style="padding:0 18px;"><table class="dash">${th3}<tbody>${t3}</tbody></table></div>

    <div class="sub-cap" style="color:#c0392b;">⚠️ 负向权益与减免判定（依据《2026年10月城市外卖绩效考核方案-考核框架和关联权益》）</div>
    <div style="padding:0 18px;"><table class="dash">${thEq}<tbody>${tEq}</tbody></table></div>`;
}

/* 口径说明 —— 沿用原模板 notes 样式 */
function renderNotes() {
  const s1fail = ROWS.filter(r => r.rate && r.rate < 0.8);
  const sqs = ROWS.filter(r => r.sq_rate !== null);
  const phf = ROWS.filter(r => r.ph_rate !== null);
  const rng = a => `${pct(Math.min(...a.map(x => x.rate)))} ~ ${pct(Math.max(...a.map(x => x.rate)))}`;
  const eq = EQ;
  const dayN = Number(M.data_date.slice(-2));
  const procVals = ROWS.map(r => r.proc);
  const procLo = Math.min(...procVals), procHi = Math.max(...procVals);
  const p3vals = ROWS.map(r => r.p3_rate).filter(v => v !== null);
  const p3Lo = Math.min(...p3vals), p3Hi = Math.max(...p3vals);
  const fineList = ROWS.filter(r => r.equity && r.equity.fine_state === '触发')
    .map(r => `${r.city} ${r.proc.toFixed(2)}`);
  const tierRows = Object.keys(eq.fine_by_tier || {}).sort()
    .map(t => `${t} ¥${(eq.fine_by_tier[t] || 0).toLocaleString('zh-CN')}`).join('　');

  document.getElementById('notesBox').innerHTML =
    `<b>指标体系（10月）</b>：① PHF订单完成率 40% ＋ ② 神抢手重点货盘商品达标率 30% ＋ ③ 拼好饭重点货盘商品达标率 20% ＋ ④ 商家参与优惠活动覆盖率 10%（过程指标合计 60%）。<br>`
    + `<b>①S1</b>：得分=完成率×系数×40%×100；系数 &lt;80%=0、≥80%=1；封顶 120%。<br>`
    + `<b>②神抢手货盘 ／ ③拼好饭货盘</b>：得分=达标率×系数×权重（②30%；③8城20%/东兰凤山35%）×100；`
    + `②系数（10月新调整）<b style="color:#9c1b1b">70-100%=1.2、60-70%=0.8、&lt;60%=0</b>（满系数线由 9 月的 60% 提高至 70%）；`
    + `③系数 <b style="color:#9c1b1b">60-100%=1.2、50-60%=1、30-50%=0.8、&lt;30%=0</b>。<br>`
    + `<b>②③达标口径</b>：需招商上线在售，且 神抢手商品 全月累计订单≥3单且 GTV≥40元 ／ 拼好饭商品 全月累计订单≥5单且 GTV≥60元。<br>`
    + `<b>④P3</b>：得分=日均覆盖率×系数×权重（8城10%/东兰凤山25%）×100；`
    + `系数 <b style="color:#9c1b1b">60-100%=1.2、50-60%=1、30-50%=0.8、&lt;30%=0</b>；达标口径 = 当前结算价≤目标结算价。`
    + `覆盖率取「考核期累计日均」= 考核期（${M.p3_first.slice(5)}–${M.month_days}/${M.month_days}）内各日达标率的算术平均；`
    + `考核期未启动前（数据 ≤10/7）只展示当日达标率、系数/得分自 ${M.p3_first.slice(5)} 起算。<br>`
    + `<b>目标值来源</b>：${M.src_target}（下发商品池数量）；达标率 = 明细表达标数 ÷ 官方下发商品池数，`
    + `明细表行数与下发池数存在 2%~8% 差异（已在数据层并列留痕）。<br>`
    + `<b>权重转移</b>：东兰县、凤山县无神抢手目标池，30% 转移给 ③拼好饭货盘(+15%→35%) 与 ④P3(+15%→25%)，过程权重合计仍为 60%。<br>`
    + `<b>过程指标完成率</b> = ②③④得分 ÷ 60（过程权重满分 60）；罚款线 = 54 分（90%）；`
    + `免罚规则：过程完成率≥90% 直接免罚；唯一豁免 = 结果指标完成率 ≥105% 且 过程完成率 ≥60%。<br>`

    + `<b style="color:#c0392b">━━ 负向权益（10月，口径与 9 月一致）━━</b><br>`
    + `<b>警告线与罚款脱钩</b>：绩效总得分 &lt; <b style="color:#9c1b1b">${eq.warn_line}</b> → 触发警告（各模块累加，城市最多 ${eq.max_warn_total} 个）；<br>`
    + `<b>罚款触发起点</b> = 过程指标完成率 &lt; <b style="color:#9c1b1b">90%</b>（即过程得分 &lt; 54 分／满分 60），`
    + `唯一豁免 = 结果指标完成率 ≥105% 且 过程指标完成率 ≥60%（★结果指标 = ① S1 PHF订单完成率，非绩效总分）。<br>`
    + `<b>罚款标准按城市等级</b>：${tierRows || '—'}；G3（东兰、凤山）不涉及罚款。<br>`
    + `<b>警告豁免</b>：模块月均绩效得分 ≥${eq.exempt_score} 分，且需位于季度内同等级城市前 ${pct(eq.exempt_top_pct, 0)}`
    + `（前 5% 需全区域历史数据，本看板标记「待核」）。<br>`
    + `本表「实际完成版」为按当前实际值触发的<b>即时判定</b>；「预估完成版」末两列 = 按预估值预判的<b>月末结果</b>。<br>`

    + `<b style="color:#1f3a63">━━ 预测说明（预估完成版口径）━━</b><br>`
    + `<b>① S1 按星期对星期外推</b>：月末 = 实际累计（${M.data_date}）＋ 剩余每天按本月已有逐日窗口同星期当日订单量推算`
    + `（缺样本的星期按当月日均兜底）。<br>`
    + `<b>② 神抢手预估达标率 = 当前上线率 − 10pp</b>（按上线商品的达成折损估计），再按 ② 系数规则与 30% 权重计分。<br>`
    + `<b>③ 拼好饭预估达标率 = 当前累计达标率</b>（不外推），按 ③ 系数规则与权重计分。<br>`
    + `<b>④ P3 以最新一日的当日覆盖率外推填满考核期至 ${M.month_days}/${M.month_days}</b>`
    + `（月度日均覆盖率 = ［考核期已观测各日覆盖率之和 ＋ 剩余天数 × 最新一日当日覆盖率］÷ 考核期 24 天），再按 ④ 系数规则计分；`
    + `覆盖率分母 = 当日下发池 SKU 数，逐日变化，故预估版「达标数」列沿用最新一日的达标 SKU 数。<br>`

    + `<b style="color:#1d6b1d">━━ 数据说明（截至 ${M.data_date}）━━</b><br>`
    + `① 考核已进行 <b>${dayN}</b> 天（时间进度 <b>${pct(M.time_pct)}</b>），S1完成率 ${rng(ROWS)}，`
    + (s1fail.length
      ? `<b style="color:#9c1b1b">${s1fail.length} 城低于 80% 系数线（${s1fail.map(r => r.city).join('、')}）→ ① 得分全部为 0</b>（月末按累计完成率定档）`
      : `<b style="color:#155f15">8 城全部高于 80% 系数线</b>`)
    + `；② 神抢手货盘达标率 ${rng(sqs)}（东兰/凤山不考核）；③ 拼好饭货盘达标率 ${rng(phf)}；`
    + `④ P3 考核期已跑 <b>${M.p3_days}</b> 天（${M.p3_first.slice(5)} 起），累计日均覆盖率 ${pct(p3Lo)}~${pct(p3Hi)}；`
    + `过程指标完成率 ${pct(procLo / 60, 1)}~${pct(procHi / 60, 1)}%（过程得分÷60）。`
    + (fineList.length
      ? `<b style="color:#9c1b1b">⚠️ ${fineList.length} 城过程得分低于罚款线 54 分</b>：${fineList.join('、')}。`
      : `<b style="color:#155f15">8 城过程得分均 ≥54 分罚款线</b>。`)
    + `<br>口径沿革：10月起 ② 满系数线由 60% 上调至 70%；③ 由 9 月的「PHF 拼好饭货盘攻克率」调整为「拼好饭重点货盘商品达标率」，与 ② 统一为「上线在售 ＋ 单量/GTV 双门槛」口径。`;

  document.getElementById('footerBox').innerHTML =
    `数据来源：${M.src_target}（考核目标）＋⑥【商品绩效】-拼好饭+神枪手（拼好饭-底表）`
    + `＋下沉神抢手_货盘明细_去重＋下沉拼好饭货盘_结算价做功商品池明细（数据截至 ${M.data_date}）`
    + ` ｜ 考核规则：2026年10月城市绩效考核方案-拼好饭&神抢手业务 ＋ 考核框架和关联权益`
    + ` ｜ 生成时间 ${M.generated} ｜ 由 AI 生成，仅供参考，以业务系统为准。`;
}

/* ============================================================
   TAB 2 下钻：图表 + 商家明细
   ============================================================ */
let curCity = CITIES[0], curBiz = 'SQS', shopSort = 'ord', shopKw = '';

const NS = 'http://www.w3.org/2000/svg';
function el(tag, a) {
  const e = document.createElementNS(NS, tag);
  for (const k in a) if (a[k] !== null && a[k] !== undefined) e.setAttribute(k, a[k]);
  return e;
}

function barChart(id, cfg) {
  const host = document.getElementById(id);
  if (!host) return;
  host.innerHTML = '';
  const W = host.clientWidth || 520, H = cfg.height || 240;
  const pad = { t: 14, r: 12, b: 46, l: 42 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, height: H });

  const all = cfg.series.flatMap(s => s.values.filter(v => v !== null && v !== undefined));
  const yMax = cfg.yMax || Math.max(...all, 0) * 1.2 || 1;
  const nS = cfg.series.length, nC = cfg.cats.length;
  const gw = iw / Math.max(nC, 1);
  const bw = Math.min(cfg.barW || 26, (gw * 0.7) / nS);

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ih - ih * i / 4;
    svg.appendChild(el('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: '#e3e8ef' }));
    const t = el('text', { x: pad.l - 6, y: y + 3.5, 'font-size': 9.5, fill: '#889', 'text-anchor': 'end' });
    t.textContent = cfg.yFmt ? cfg.yFmt(yMax * i / 4) : fmt(yMax * i / 4);
    svg.appendChild(t);
  }
  cfg.series.forEach((s, si) => {
    s.values.forEach((v, ci) => {
      if (v === null || v === undefined) return;
      const h = Math.max(1, ih * Math.min(1, v / yMax));
      const cx = pad.l + gw * ci + gw / 2;
      const x = cx - (bw * nS) / 2 + si * bw;
      const y = pad.t + ih - h;
      const r = el('rect', { x: x + 1, y: y, width: bw - 2, height: h, fill: s.color, rx: 2 });
      r.appendChild(el('title')).textContent = `${cfg.cats[ci]} ${s.name}: ${cfg.vFmt ? cfg.vFmt(v) : fmt(v)}`;
      svg.appendChild(r);
      if (cfg.showValues && bw >= 14) {
        const t = el('text', { x: x + bw / 2, y: y - 4, 'font-size': 9, fill: '#667', 'text-anchor': 'middle' });
        t.textContent = cfg.vFmt ? cfg.vFmt(v, true) : fmt(v);
        svg.appendChild(t);
      }
    });
  });
  cfg.cats.forEach((c, ci) => {
    const ws = String(c).length > 5 ? String(c).match(/.{1,5}/g) : [c];
    ws.forEach((w, wi) => {
      const t = el('text', { x: pad.l + gw * ci + gw / 2, y: pad.t + ih + 14 + wi * 11, 'font-size': 9.5, fill: '#667', 'text-anchor': 'middle' });
      t.textContent = w;
      svg.appendChild(t);
    });
  });
  host.appendChild(svg);
  if (nS > 1) {
    const lg = document.createElement('div');
    lg.className = 'legend';
    lg.innerHTML = cfg.series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('');
    host.appendChild(lg);
  }
}

function renderOps() {
  const r = ROWS.find(x => x.city === curCity);
  if (!r) return;

  // 货盘来源细分
  const sb = D.src_break[r.city] || {};
  const keys = Object.keys(sb).sort((a, b) => sb[b].pool - sb[a].pool);
  document.getElementById('srcCap').textContent =
    `${r.city} ｜ 目标池=货盘明细行数，柱=目标池 SKU 数、绿=达标数`;
  barChart('srcChart', {
    cats: keys,
    series: [
      { name: '目标池', color: '#7c8fbf', values: keys.map(k => sb[k].pool) },
      { name: '达标数', color: '#5aab7a', values: keys.map(k => sb[k].ok) }
    ],
    yFmt: v => fmt(v), vFmt: (v, sh) => sh ? fmt(v) : '', showValues: true, height: 250
  });

  // 做功场景
  const scene = r.p3_meta.scene || {};
  const sk = Object.keys(scene).sort((a, b) => scene[b] - scene[a]);
  document.getElementById('sceneCap').textContent =
    `${r.city} ｜ 基线 ${fmt(r.p3_meta.pool)} SKU ｜ 覆盖 ${fmt(r.p3_meta.shop)} 商家 ｜ 数据日 ${M.p3_last.slice(5)}`;
  barChart('sceneChart', {
    cats: sk.length ? sk : ['无数据'],
    series: [{ name: '基线 SKU', color: '#c9892f', values: sk.length ? sk.map(k => scene[k]) : [0] }],
    yFmt: v => fmt(v), vFmt: (v, sh) => sh ? fmt(v) : '', showValues: true, height: 250, barW: 34
  });

  renderShops();
}

function renderShops() {
  const all = D.shops[`${curCity}|${curBiz}`] || [];
  const kw = shopKw.trim().toLowerCase();
  let data = kw ? all.filter(s =>
    (s.name || '').toLowerCase().includes(kw) || (s.bd || '').toLowerCase().includes(kw)
    || String(s.mid).includes(kw)) : all.slice();

  const cmp = {
    ord: (a, b) => b.ord - a.ord || b.amt - a.amt,
    amt: (a, b) => b.amt - a.amt,
    rate: (a, b) => a.rate - b.rate,
    pool: (a, b) => b.pool - a.pool
  }[shopSort];
  data.sort(cmp);

  document.getElementById('shopTable').innerHTML =
    `<thead><tr><th style="width:48px;">#</th><th style="text-align:left;">商家名称</th>
     <th>商家ID</th><th>BD MIS ID</th><th>货盘<br>SKU数</th><th>达标数</th>
     <th>达标率</th><th>订单量</th><th>实付金额</th></tr></thead><tbody>`
    + data.slice(0, 400).map((s, i) => `<tr>
      <td style="color:#999;">${i + 1}</td>
      <td class="nm" title="${esc(s.name)}">${esc(s.name) || '<span style="color:#bbb;">—</span>'}</td>
      <td style="color:#889;">${esc(s.mid)}</td><td style="color:#889;">${esc(s.bd) || '—'}</td>
      <td>${fmt(s.pool)}</td><td>${fmt(s.ok)}</td>
      <td class="${sc(s.rate, 0.7)}">${pct(s.rate)}</td>
      <td>${fmt(s.ord)}</td><td>${fmt(s.amt)}</td></tr>`).join('')
    + '</tbody>';

  document.getElementById('shopCount').innerHTML =
    `<b>${curBiz === 'SQS' ? '神抢手' : '拼好饭'}</b> ｜ ${curCity} ｜ 共 <b>${fmt(all.length)}</b> 家商家`
    + `${kw ? `，匹配 <b style="color:#667eea;">${fmt(data.length)}</b> 家` : ''}`
    + `${data.length > 400 ? `，按当前排序显示前 <b>400</b> 家（完整清单可搜索缩小范围）` : ''}`;

  document.getElementById('bizSqs').classList.toggle('on', curBiz === 'SQS');
  document.getElementById('bizPhf').classList.toggle('on', curBiz === 'PHF');
}
function setBiz(b) { curBiz = b; renderShops(); }

/* ---------------- 事件绑定 ---------------- */
function bindTabs() {
  document.getElementById('mb1').onclick = e => showMainTab('tab1', e.currentTarget);
  document.getElementById('mb2').onclick = e => showMainTab('tab2', e.currentTarget);
  document.getElementById('bizSqs').onclick = () => setBiz('SQS');
  document.getElementById('bizPhf').onclick = () => setBiz('PHF');
  window.addEventListener('hashchange', () => {
    const h = location.hash.slice(1).split('=')[0];
    if (h === 'tab1' && !document.getElementById('tab1').classList.contains('active')) {
      showMainTab('tab1', document.getElementById('mb1'));
    } else if (h === 'tab2' && !document.getElementById('tab2').classList.contains('active')) {
      showMainTab('tab2', document.getElementById('mb2'));
    }
  });
}

/* ---------------- 启动 ---------------- */
function bindOps() {
  const sel = document.getElementById('citySel');
  sel.innerHTML = CITIES.map(c => `<option value="${esc(c)}"${c === curCity ? ' selected' : ''}>${esc(c)}</option>`).join('');
  sel.onchange = () => { curCity = sel.value; renderOps(); };

  document.getElementById('sortSel').onchange = e => { shopSort = e.target.value; renderShops(); };
  let t;
  document.getElementById('shopSearch').oninput = e => {
    clearTimeout(t); t = setTimeout(() => { shopKw = e.target.value; renderShops(); }, 220);
  };
}

renderTab1();
renderTab2();
bindOps();
bindTabs();
window.addEventListener('resize', () => { if (document.getElementById('tab2').classList.contains('active')) renderOps(); });

// 深链：#tab2 或 #tab2=玉林市
(function initHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return;
  const [tab, city] = h.split('=');
  if (city && CITIES.includes(city)) { curCity = city; document.getElementById('citySel').value = city; }
  if (tab === 'tab1' || tab === 'tab2') showMainTab(tab, document.getElementById(tab === 'tab1' ? 'mb1' : 'mb2'));
})();

})();