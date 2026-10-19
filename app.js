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
const FINE = M.fineline, BLUE = M.blueline, W = M.weights;
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
  const ths = ['排名', '分区经理', '拼好饭完成率', '神抢手攻克率', '拼好饭攻克率', '月度覆盖率', '综合得分', '风险状态'];
  const b = DIST.base;
  const td = (txt, cls2, style) => `<td style="padding:10px 10px;text-align:center;${style || ''};${cls2 ? 'font-weight:700;' : ''}">${txt}</td>`;

  const baseRow = `<tr style="background:#fffbe6;">
    ${td('—', 1, 'font-size:15px;')}
    ${td(esc(b.name), 1, 'color:#333;font-weight:600;white-space:nowrap;')}
    ${td(pct(b.s1), 1, `color:${scoreColor(b.s1, 0.5)};`)}
    ${td(pct(b.sqs_kgr), 1, `color:${scoreColor(b.sqs_kgr, 0.4)};`)}
    ${td(pct(b.phf_kgr), 1, `color:${scoreColor(b.phf_kgr, 0.75)};`)}
    ${td(pct(b.cov), 1, `color:${scoreColor(b.cov, 0.6)};`)}
    ${td(b.score.toFixed(2), 1, 'color:#3a5e8c;')}
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

  const below = ROWS.filter(r => r.proc < FINE);
  const warn = document.getElementById('kpiWarn');
  if (below.length) {
    warn.classList.remove('hidden');
    warn.innerHTML = `<b>⚠️ 罚款风险：</b>${below.map(r => `${r.city}（${r.proc.toFixed(2)} 分）`).join('、')} `
      + `低于 ${FINE} 分罚款线`;
  } else {
    warn.classList.remove('hidden');
    warn.style.background = '#f2fbf3';
    warn.style.borderColor = '#b7e4c1';
    warn.style.color = '#2c6e35';
    warn.innerHTML = `<b>✅ 罚款风险：无</b> —— 8 城过程指标得分 ${Math.min(...ROWS.map(r => r.proc)).toFixed(2)}~`
      + `${Math.max(...ROWS.map(r => r.proc)).toFixed(2)} 分，全部 ≥ ${FINE} 分罚款线`;
  }

  renderKpiTables();
  renderNotes();
}

/* 三张表：实际完成版 / 预估完成版 / 过程指标明细 —— 列与配色对齐原模板 */
function th2(cityCol = 2) {
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

  return `<td class="city">${esc(r.city)}</td>
    <td class="tier">${esc(r.grade || '--')}</td>
    <td>${fmt(r.tgt)}</td><td>${fmt(cur)}</td>
    <td class="${sc(rate, 0.8)}">${pct(rate)}</td>
    <td class="${scLow(k, 1)}">${k === null || Number.isNaN(k) ? '—' : k.toFixed(1)}</td>
    <td class="${sc(score, 32)}">${score === null || Number.isNaN(score) ? '—' : score.toFixed(2)}</td>
    ${sq}${ph}${p3}
    <td class="${sc(proc, 36)}">${proc.toFixed(2)}</td>
    <td class="${sc(procPct, 0.6)}">${pct(procPct, 1)}</td>`;
}

function renderKpiTables() {
  // ① 实际完成版
  const t1 = ROWS.map(r => `<tr>${cellAct(r, false)}</tr>`).join('');

  // ② 预估完成版（斜体 +浅底，对齐原模板 fc-fore）
  const t2 = ROWS.map(r => {
    const tr = cellAct(r, true);
    return `<tr style="background:#fdf6e9;">${tr.replace(/(<td[^>]*>)([^<]*)/g,
      (m, a, b) => /预估|完成率|得分/.test(m) ? a + b : a + b)}</tr>`;
  }).join('');

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

  document.getElementById('kpiTables').innerHTML = `
    <div class="section-h">
      <span class="left">📊 实际完成版</span>
      <span class="sub">（截至 ${M.data_date}）基于当前实际完成数据</span>
    </div>
    <div style="padding:0 18px;"><table class="dash">${th2()}<tbody>${t1}</tbody></table></div>

    <div class="section-h forecast">
      <span class="left">🔮 预估完成版</span>
      <span class="sub">按当前累计趋势外推至 ${M.month_days}/${M.month_days} 的月末预判</span>
      <span class="tag">预估值</span>
    </div>
    <div class="fc-section" style="padding:0 18px;"><table class="dash">${th2()}<tbody>${t2}</tbody></table></div>

    <div class="sub-cap">过程指标明细（②③ 上线/达标取自货盘明细去重表；④ 取考核期 ${M.p3_first.slice(5)} 起日均覆盖率）</div>
    <div style="padding:0 18px;"><table class="dash">${th3}<tbody>${t3}</tbody></table></div>`;
}

/* 口径说明 —— 沿用原模板 notes 样式 */
function renderNotes() {
  const s1fail = ROWS.filter(r => r.rate && r.rate < 0.8);
  const sqs = ROWS.filter(r => r.sq_rate !== null);
  const phf = ROWS.filter(r => r.ph_rate !== null);
  const rng = a => `${pct(Math.min(...a.map(x => x.rate)))} ~ ${pct(Math.max(...a.map(x => x.rate)))}`;

  document.getElementById('notesBox').innerHTML =
    `<b>指标体系（10月）</b>：① PHF订单完成率 40% + ② 神抢手重点货盘商品达标率 30% `
    + `+ ③ 拼好饭重点货盘商品达标率 20% + ④ 商家参与优惠活动覆盖率 10%（过程指标合计 60%）。<br>`
    + `<b>S1</b>：得分 = 完成率 × 系数 × 40%；系数 &lt;80% = 0、≥80% = 1，完成率封顶 120%。<br>`
    + `<b>②③</b>：得分 = 达标率 × 系数 × 权重（②30%；③8城20% / 东兰凤山35%）；`
    + `系数 <b style="color:#9c1b1b">70-100% = 1.2、60-70% = 0.8、&lt;60% = 0</b>。<br>`
    + `<b>④P3</b>：得分 = 日均覆盖率 × 系数 × 权重（8城10% / 东兰凤山25%）；`
    + `系数 <b style="color:#9c1b1b">60-100% = 1.2、50-60% = 1、30-50% = 0.8、&lt;30% = 0</b>；`
    + `覆盖率取「考核期累计日均」= ${M.p3_first.slice(5)}~${M.month_days} 各日 SKU 达标率的算术平均，`
    + `<b>未发生日期取已发生最新日期（${M.p3_last.slice(5)}）外推至月底</b>。<br>`
    + `<b>过程指标完成率</b> = ②③④得分 ÷ 60；<b>罚款线 = ${FINE} 分（90%）</b>；`
    + `<b>免罚规则</b>：过程完成率 ≥90% 直接免罚；<b>唯一豁免</b> = 结果指标完成率 ≥105% 且 过程指标完成率 ≥60%。<br>`
    + `<b>权重转移</b>：东兰县、凤山县无神抢手目标池，30% 转移给 ③（20%→35%）与 ④（10%→25%），过程权重合计仍为 60%。<br>`
    + `<b>数据观察（截至 ${M.data_date}）</b>：S1 完成率 ${rng(ROWS)}，`
    + (s1fail.length
      ? `<b style="color:#9c1b1b">${s1fail.length} 城低于 80% 系数线（${s1fail.map(r => r.city).join('、')}）→ 得分归 0</b>，是本月最大失分点`
      : `<b style="color:#155f15">8 城全部 ≥80% 系数线</b>`)
    + `；神抢手货盘 ${rng(sqs)}，拼好饭货盘 ${rng(phf)}；`
    + `P3 已回填 <b>${M.p3_days}</b> 天（最新 ${M.p3_last.slice(5)}）。`;

  document.getElementById('footerBox').innerHTML =
    `数据来源：⑥【商品绩效】-拼好饭+神枪手（拼好饭-底表）＋下沉神抢手_货盘明细_去重`
    + `＋下沉拼好饭货盘_结算价做功商品池明细（数据截至 ${M.data_date}） ｜ 生成时间 ${M.generated}`
    + ` ｜ 由 AI 生成，仅供参考，以业务系统为准。`;
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
    `共 <b>${fmt(all.length)}</b> 家商家${kw ? `，匹配 <b style="color:#667eea;">${fmt(data.length)}</b> 家` : ''}`
    + `${data.length > 400 ? '，按当前排序显示前 400 家' : ''}`;

  document.getElementById('bizSqs').classList.toggle('on', curBiz === 'SQS');
  document.getElementById('bizPhf').classList.toggle('on', curBiz === 'PHF');
}
window.setBiz = b => { curBiz = b; renderShops(); };

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
window.addEventListener('resize', () => { if (document.getElementById('tab2').classList.contains('active')) renderOps(); });

// 深链：#tab2 或 #tab2=玉林市
(function initHash() {
  const h = decodeURIComponent(location.hash.slice(1));
  if (!h) return;
  const [tab, city] = h.split('=');
  if (tab === 'tab2') {
    if (city && CITIES.includes(city)) { curCity = city; document.getElementById('citySel').value = city; }
    showMainTab('tab2', document.getElementById('mb2'));
  } else if (tab === 'tab1') {
    showMainTab('tab1', document.getElementById('mb1'));
  }
})();

})();