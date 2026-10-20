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
  if (id === 'tab2') requestAnimationFrame(() => { });  // 同步 hash，便于分享深链；用 replaceState 避免污染历史记录
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
  sel.onchange = () => {
    focusDist = sel.value;
    renderFocusSelect();   // 同步刷新标题文字与下拉选中态
    renderDistCards();
    renderRankTable();
  };
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
}

/* 三张表：实际完成版 / 预估完成版 / 过程指标明细 —— 列与配色对齐原模板 */
function th2(isEst) {
  return `<thead>
  <tr class="grp">
    <th class="base" rowspan="2" style="width:88px;">城市</th>
    <th class="base" rowspan="2" style="width:56px;">城市等级</th>
    <th class="g-s1" colspan="5">① S1 PHF订单完成率（权重40%）</th>
    <th class="g-sqs" colspan="5">② 神抢手重点货盘达标率（权重30%）</th>
    <th class="g-phf" colspan="5">③ 拼好饭重点货盘达标率（权重20%/35%）</th>
    <th class="g-p2" colspan="5">④ P3 商家优惠活动覆盖率（权重10%/25%）</th>
    <th class="g-sum" rowspan="2" style="width:92px;">绩效<br>总得分</th>
    <th class="g-sum" rowspan="2" style="width:88px;">过程指标<br>完成率</th>
    ${isEst ? `<th class="g-fine" rowspan="2" style="width:130px;">预测负向权益</th>` : ''}
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
  const T = r.tgt_official || {};

  // ② 神抢手：目标数统一用官方下发池
  const sqPool = T.sqs || r.hp.SQS.pool;
  const sq = NO_SQS.has(r.city)
    ? `<td class="nc" colspan="5">不考核</td>`
    : (isEst
      ? `<td>${fmt(r.est_sq.pool)}</td><td>${fmt(r.est_sq.ok)}</td>
         <td class="${sc(r.est_sq.rate, 0.7)}">${pct(r.est_sq.rate)}</td>
         <td class="${scLow(r.est_sq.k, 1)}">${r.est_sq.k.toFixed(1)}</td>
         <td class="${sc(r.est_sq.score, 21)}">${r.est_sq.score.toFixed(2)}</td>`
      : `<td>${fmt(sqPool)}</td><td>${fmt(r.hp.SQS.ok)}</td>
         <td class="${sc(r.sq_rate, 0.7)}">${pct(r.sq_rate)}</td>
         <td class="${scLow(r.sq_k, 1)}">${r.sq_k === null ? '—' : r.sq_k.toFixed(1)}</td>
         <td class="${sc(r.sq_score, 21)}">${r.sq_score === null ? '—' : r.sq_score.toFixed(2)}</td>`);

  // ③ 拼好饭：预估版按当前累计达标率（不外推），得分与实际版一致
  const phPool = T.phf || r.hp.PHF.pool;
  const ph = `<td>${fmt(phPool)}</td><td>${fmt(r.hp.PHF.ok)}</td>
    <td class="${sc(r.ph_rate, 0.7)}">${pct(r.ph_rate)}</td>
    <td class="${scLow(r.ph_k, 1)}">${r.ph_k === null ? '—' : r.ph_k.toFixed(1)}</td>
    <td class="${sc(r.ph_score, 14)}">${r.ph_score.toFixed(2)}</td>`;

  // ④ P3：预估版用「最新一日当日覆盖率外推至月底」的月度日均
  const p3Pool = T.p3 || r.p3_meta.pool;
  const p3Rate = isEst ? r.p3_rate_est : r.p3_rate;
  const p3K = isEst ? r.p3_k_est : r.p3_k;
  const p3Score = isEst ? r.p3_score_est : r.p3_score;
  const p3Ok = isEst ? r.p3_ok_est : r.p3_meta.ok;
  const p3 = `<td>${fmt(p3Pool)}</td><td>${fmt(p3Ok)}</td>
    <td class="${sc(p3Rate, 0.6)}">${pct(p3Rate)}</td>
    <td class="${scLow(p3K, 1)}">${p3K === null ? '—' : p3K.toFixed(1)}</td>
    <td class="${sc(p3Score, 6)}">${p3Score === null ? '—' : p3Score.toFixed(2)}</td>`;

  // 过程指标得分 / 完成率
  const proc = isEst ? r.est_proc : r.proc;
  const procPct = isEst ? r.est_pct : r.proc_pct;
  // 绩效总得分 = ① 结果指标得分 + ②③④ 过程指标得分
  const total = isEst ? r.est_total : r.total;

  // 预估完成版末列 = 预测负向权益（原模板为单列：是否触发警告 / 罚款金额）
  let eqCols = '';
  if (isEst && r.equity_est) {
    const e = r.equity_est;
    const warnBad = e.warn && !e.exempt_eligible;
    const fineBad = e.fine_state === '触发';
    const noFine = (e.fine_by_tier_zero) || (e.tier || '').toUpperCase() === 'G3';
    let txt;
    if (noFine) {
      txt = warnBad ? '警告（不涉及罚款）' : '不涉及';
    } else if (fineBad) {
      txt = (warnBad ? '警告 · ' : '') + `罚款 ¥${e.fine_amount.toLocaleString('zh-CN')}`;
    } else {
      txt = warnBad ? '警告（免罚）' : '免罚';
    }
    eqCols = `<td class="${fineBad ? 'rt-r' : (warnBad ? 'rt-y' : 'rt-g')}">${txt}</td>`;
  }

  return `<td class="city">${esc(r.city)}</td>
    <td class="tier">${esc(r.grade || '--')}</td>
    <td>${fmt(r.tgt)}</td><td>${fmt(cur)}</td>
    <td class="${sc(rate, 0.8)}">${pct(rate)}</td>
    <td class="${scLow(k, 1)}">${k === null || Number.isNaN(k) ? '—' : k.toFixed(1)}</td>
    <td class="${sc(score, 32)}">${score === null || Number.isNaN(score) ? '—' : score.toFixed(2)}</td>
    ${sq}${ph}${p3}
    <td class="${sc(total, 80)}">${total === null || total === undefined ? '—' : total.toFixed(2)}</td>
    <td class="${sc(procPct, 0.6)}">${pct(procPct, 1)}</td>${eqCols}`;
}

function renderKpiTables() {
  // ① 实际完成版
  const t1 = ROWS.map(r => `<tr>${cellAct(r, false)}</tr>`).join('');

  // ② 预估完成版（浅米底 + 斜体，对齐原模板 fc-fore；末两列为按预估值预判的负向权益）
  const t2 = ROWS.map(r => `<tr style="background:#fdf6e9;">${cellAct(r, true)}</tr>`).join('');

  // ③ 过程指标明细 —— 三个货盘板块统一：目标数/上线数/上线率/达标数/达标率
  //    上线 = M 列「达标情况」=达标；达标 = N 列「攻克情况」=攻克
  const FIVE = ['目标数', '上线数', '上线率', '达标数', '达标率'];
  const th3 = `<thead>
    <tr class="grp">
      <th class="base" rowspan="2" style="width:88px;">城市</th>
      <th class="g-sqs" colspan="5">重点货盘（汇总）</th>
      <th class="g-sqs" colspan="5">重点货盘（神抢手 P1）</th>
      <th class="g-phf" colspan="5">重点货盘（拼好饭 P2）</th>
      <th class="g-sum" rowspan="2" style="width:96px;">过程指标得分</th>
    </tr>
    <tr class="sub">
      <th class="sqs">目标数</th><th class="sqs">上线数</th><th class="sqs">上线率</th><th class="sqs">达标数</th><th class="sqs">达标率</th>
      <th class="sqs">目标数</th><th class="sqs">上线数</th><th class="sqs">上线率</th><th class="sqs">达标数</th><th class="sqs">达标率</th>
      <th class="phf">目标数</th><th class="phf">上线数</th><th class="phf">上线率</th><th class="phf">达标数</th><th class="phf">达标率</th>
    </tr></thead>`;

  // 五字段单元格组：目标数取官方下发池，上线/达标取明细表
  const fiveCells = (pool, on, ok, rateCls) =>
    `<td>${fmt(pool)}</td><td>${fmt(on)}</td>`
    + `<td class="${sc(on / pool, 0.7)}">${pool ? pct(on / pool) : '—'}</td>`
    + `<td>${fmt(ok)}</td>`
    + `<td class="${sc(ok / pool, 0.5)}">${pool ? pct(ok / pool) : '—'}</td>`;

  const t3 = ROWS.map(r => {
    const T = r.tgt_official || {};
    // 汇总 = 神抢手 + 拼好饭
    const sqPool = T.sqs || r.hp.SQS.pool;
    const phPool = T.phf || r.hp.PHF.pool;
    const isNoSqs = NO_SQS.has(r.city);
    const allPool = (T.sqs || 0) + (T.phf || 0);
    const allOn = r.hp.ALL.on;
    const allOk = r.hp.ALL.ok;

    const sqCells = isNoSqs
      ? `<td class="nc" colspan="5">不考核</td>`
      : fiveCells(sqPool, r.hp.SQS.on, r.hp.SQS.ok);

    return `<tr>
      <td class="city">${esc(r.city)}</td>
      ${fiveCells(allPool, allOn, allOk)}
      ${sqCells}
      ${fiveCells(phPool, r.hp.PHF.on, r.hp.PHF.ok)}
      <td class="${sc(r.proc, 36)}">${r.proc.toFixed(2)}</td></tr>`;
  }).join('');

  document.getElementById('kpiTables').innerHTML = `
    <div class="section-h">
      <span class="left">📊 实际完成版</span>
      <span class="sub">（截至 ${M.data_date}）基于当前实际完成数据</span>
    </div>
    <div style="padding:0 18px;"><table class="dash">${th2(false)}<tbody>${t1}</tbody></table></div>

    <div class="section-h forecast">
      <span class="left">🔮 预估完成版</span>
      <span class="sub">① 星期对星期外推；② 预估达标率＝当前上线率 −10pp；③ 按当前累计达标率；④ 按最新一日当日覆盖率外推至 ${M.month_days}/${M.month_days} 计月度日均；末列＝按预估值预判的负向权益</span>
      <span class="tag">预估值</span>
    </div>
    <div class="fc-section" style="padding:0 18px;"><table class="dash">${th2(true)}<tbody>${t2}</tbody></table></div>

    <div class="sub-cap">过程指标明细 · 三个货盘板块（上线 = 明细表 M 列「达标情况」=达标；达标 = N 列「攻克情况」=攻克，攻克记为达标 ｜ 按来源 E 列拆分：神抢手 = P1，拼好饭 = P2 ｜ ④ P3 取考核期 ${M.p3_first.slice(5)} 起日均覆盖率，见上方实率/预估完成版）</div>
    <div style="padding:0 18px;"><table class="dash">${th3}<tbody>${t3}</tbody></table></div>`;
}




/* Tab 切换绑定 */
function bindTabs() {
  document.getElementById('mb1').onclick = e => showMainTab('tab1', e.currentTarget);
  document.getElementById('mb2').onclick = e => showMainTab('tab2', e.currentTarget);
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
renderTab1();
renderTab2();
bindTabs();

// 深链：#tab1 或 #tab2
(function initHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return;
  const tab = h.split(chr(61))[0];
  if (tab === 'tab1' || tab === 'tab2') showMainTab(tab, document.getElementById(tab === 'tab1' ? 'mb1' : 'mb2'));
})();

})();
