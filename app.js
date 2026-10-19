/* ============================================================
   商品运营分析报告 —— 前端渲染
   数据来源 window.REPORT_DATA（由 report_data.py 生成）
   ============================================================ */
(function () {
'use strict';

const D = window.REPORT_DATA;
if (!D) { document.body.innerHTML = '<div class="wrap" style="padding:60px;color:#f85149">数据未加载：请先运行 report_data.py 生成 public/data.js</div>'; return; }

const M = D.meta, ROWS = D.rows, CITIES = M.cities, NO_SQS = new Set(M.no_sqs);
const FINE = M.fineline, BLUE = M.blueline;
const W = M.weights;

/* ---------- 工具 ---------- */
const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const fmt = (n, d = 0) => (n === null || n === undefined || Number.isNaN(n)) ? '—'
  : Number(n).toLocaleString('zh-CN', { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (n, d = 2) => (n === null || n === undefined || Number.isNaN(n)) ? '—' : (n * 100).toFixed(d) + '%';
const wan = n => (n === null || n === undefined) ? '—' : (n >= 1e8 ? (n / 1e8).toFixed(2) + '亿' : n >= 1e4 ? (n / 1e4).toFixed(1) + '万' : fmt(n));

// 分档着色
function cls(v, th, warnMul = 0.9) {
  if (v === null || v === undefined || Number.isNaN(v)) return 'na';
  if (v >= th) return 'ok';
  if (v >= th * warnMul) return 'warn';
  return 'bad';
}
// 越低越好的着色（攻克率等）
function clsInv(v, th) {
  if (v === null || v === undefined) return 'na';
  if (v >= th) return 'ok';
  if (v >= th * 0.85) return 'warn';
  return 'bad';
}
function kcls(k) { return k === null ? 'na' : k >= 1.2 ? 'ok' : k >= 1 ? 'ok' : k > 0 ? 'warn' : 'bad'; }

function bar(rate, th, color) {
  if (rate === null || rate === undefined) return '<span class="dim">—</span>';
  const w = Math.max(2, Math.min(100, rate * 100));
  const c = rate >= th ? 'var(--ok)' : rate >= th * 0.9 ? 'var(--warn)' : 'var(--bad)';
  return `<div class="bar-cell"><div class="bt"><div class="bf" style="width:${w}%;background:${color || c}"></div></div><span class="n ${c}">${pct(rate)}</span></div>`;
}

/* ---------- SVG 图表 ---------- */
const NS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs) {
  const e = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] !== null && attrs[k] !== undefined) e.setAttribute(k, attrs[k]);
  return e;
}

/**
 * 分组柱状图
 * cfg: { cats:[], series:[{name,color,values:[],fmt}], height, yMax, yTitle, refLine:{v,label,color}, showValues }
 */
function barChart(id, cfg) {
  const host = document.getElementById(id);
  if (!host) return;
  host.innerHTML = '';
  const W = host.clientWidth || 780, H = cfg.height || 300;
  const pad = { t: 16, r: 14, b: cfg.cats.some(c => c.length > 4) ? 62 : 34, l: 46 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, height: H });

  const all = cfg.series.flatMap(s => s.values.filter(v => v !== null && v !== undefined));
  let yMax = cfg.yMax || Math.max(...all, 0) * 1.18 || 1;
  const nS = cfg.series.length, nC = cfg.cats.length;
  const gw = iw / Math.max(nC, 1);
  const bw = Math.min(cfg.barW || 30, (gw * 0.72) / nS);

  // y 轴
  const ticks = cfg.yTicks || 4;
  for (let i = 0; i <= ticks; i++) {
    const y = pad.t + ih - (ih * i / ticks);
    const v = yMax * i / ticks;
    svg.appendChild(svgEl('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, class: 'gl' }));
    const tx = svgEl('text', { x: pad.l - 7, y: y + 3.5, class: 'ax', 'text-anchor': 'end' });
    tx.textContent = cfg.yFmt ? cfg.yFmt(v) : fmt(v);
    svg.appendChild(tx);
  }
  // 参考线
  if (cfg.refLine !== undefined && cfg.refLine !== null) {
    const y = pad.t + ih - ih * Math.min(1, cfg.refLine / yMax);
    svg.appendChild(svgEl('line', {
      x1: pad.l, y1: y, x2: W - pad.r, y2: y,
      stroke: '#f0883e', 'stroke-width': 1.4, 'stroke-dasharray': '5 3'
    }));
    const lt = svgEl('text', { x: W - pad.r, y: y - 5, fill: '#f0883e', 'font-size': 10, 'text-anchor': 'end', 'font-weight': 600 });
    lt.textContent = cfg.refLabel || '';
    svg.appendChild(lt);
  }

  cfg.series.forEach((s, si) => {
    s.values.forEach((v, ci) => {
      if (v === null || v === undefined) return;
      const h = Math.max(1, ih * Math.min(1, v / yMax));
      const cx = pad.l + gw * ci + gw / 2;
      const x = cx - (bw * nS) / 2 + si * bw;
      const y = pad.t + ih - h;
      const rect = svgEl('rect', { x: x + 1, y: y, width: bw - 2, height: h, fill: s.color, rx: 2, opacity: .9 });
      rect.appendChild(svgEl('title')).textContent =
        `${cfg.cats[ci]} · ${s.name}: ${cfg.vFmt ? cfg.vFmt(v) : fmt(v)}`;
      svg.appendChild(rect);
      if (cfg.showValues && bw >= 15) {
        const t = svgEl('text', { x: x + bw / 2, y: y - 4, class: 'vv', 'text-anchor': 'middle' });
        t.textContent = cfg.vFmt ? cfg.vFmt(v, true) : fmt(v);
        svg.appendChild(t);
      }
    });
  });

  cfg.cats.forEach((c, ci) => {
    const words = String(c).length > 4 ? String(c).match(/.{1,4}/g) : [c];
    words.forEach((w, wi) => {
      const t = svgEl('text', {
        x: pad.l + gw * ci + gw / 2, y: pad.t + ih + 15 + wi * 12,
        class: 'ax', 'text-anchor': 'middle'
      });
      t.textContent = w;
      svg.appendChild(t);
    });
  });

  host.appendChild(svg);
  // 图例
  if (cfg.series.length > 1) {
    const lg = document.createElement('div');
    lg.className = 'lg';
    lg.innerHTML = cfg.series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('');
    host.appendChild(lg);
  }
}

/**
 * 折线图 cfg:{x:[], series:[{name,color,values,fmt}], height, yMin, yMax, refLine}
 */
function lineChart(id, cfg) {
  const host = document.getElementById(id);
  if (!host) return;
  host.innerHTML = '';
  const W = host.clientWidth || 780, H = cfg.height || 300;
  const pad = { t: 16, r: 14, b: 30, l: 46 };
  const iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, height: H });
  const all = cfg.series.flatMap(s => s.values.filter(v => v !== null && v !== undefined));
  let yMin = cfg.yMin !== undefined ? cfg.yMin : Math.min(...all, 1);
  let yMax = cfg.yMax !== undefined ? cfg.yMax : Math.max(...all, 0);
  if (yMax - yMin < 1e-9) { yMax = yMin + 1; }
  const span = yMax - yMin;
  yMin -= span * 0.14; yMax += span * 0.14;
  const X = i => pad.l + (cfg.x.length > 1 ? iw * i / (cfg.x.length - 1) : iw / 2);
  const Y = v => pad.t + ih - ih * (v - yMin) / (yMax - yMin);

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + ih - ih * i / 4;
    svg.appendChild(svgEl('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, class: 'gl' }));
    const t = svgEl('text', { x: pad.l - 7, y: y + 3.5, class: 'ax', 'text-anchor': 'end' });
    t.textContent = cfg.yFmt ? cfg.yFmt(yMin + (yMax - yMin) * i / 4) : fmt(yMin + (yMax - yMin) * i / 4);
    svg.appendChild(t);
  }
  if (cfg.refLine !== undefined) {
    const y = Y(cfg.refLine);
    svg.appendChild(svgEl('line', { x1: pad.l, y1: y, x2: W - pad.r, y2: y, stroke: '#f0883e', 'stroke-width': 1.4, 'stroke-dasharray': '5 3' }));
    const lt = svgEl('text', { x: W - pad.r, y: y - 5, fill: '#f0883e', 'font-size': 10, 'text-anchor': 'end', fontWeight: 600 });
    lt.textContent = cfg.refLabel || '';
    svg.appendChild(lt);
  }
  const step = cfg.x.length > 16 ? Math.ceil(cfg.x.length / 12) : 1;
  cfg.x.forEach((xv, i) => {
    if (i % step !== 0 && i !== cfg.x.length - 1) return;
    const t = svgEl('text', { x: X(i), y: pad.t + ih + 16, class: 'ax', 'text-anchor': 'middle' });
    t.textContent = xv;
    svg.appendChild(t);
  });
  cfg.series.forEach(s => {
    const idxs = s.values.map((v, i) => [v, i]).filter(([v]) => v !== null && v !== undefined).map(([, i]) => i);
    if (!idxs.length) return;
    // 按实测/外推连续分组：mask(i)=true 为实测
    const groups = [];
    idxs.forEach(i => {
      const actual = s.mask ? !!s.mask(i) : true;
      const last = groups[groups.length - 1];
      if (last && last.actual === actual) last.idxs.push(i);
      else groups.push({ actual, idxs: [i] });
    });
    groups.forEach(g => {
      const pts = g.idxs.map(i => [X(i), Y(s.values[i])]);
      if (pts.length === 1) pts.push(pts[0]);
      svg.appendChild(svgEl('polyline', {
        points: pts.map(p => p.join(',')).join(' '), fill: 'none',
        stroke: s.color, 'stroke-width': 2,
        'stroke-dasharray': g.actual ? null : '5 4',
        opacity: g.actual ? 1 : .55,
        'stroke-linejoin': 'round'
      }));
    });
    idxs.forEach(i => {
      const actual = s.mask ? !!s.mask(i) : true;
      const c = svgEl('circle', {
        cx: X(i), cy: Y(s.values[i]), r: 2.6, fill: s.color,
        opacity: actual ? 1 : .5
      });
      c.appendChild(svgEl('title')).textContent =
        (cfg.x[i] || '') + ' ' + s.name + (s.mask && !actual ? '（外推）' : '（实测）') +
        ': ' + (s.fmt ? s.fmt(s.values[i]) : fmt(s.values[i]));
      svg.appendChild(c);
    });
    // 末端标签
    const li = idxs[idxs.length - 1];
    const t = svgEl('text', { x: X(li) + 6, y: Y(s.values[li]) + 3.5, class: 'vl', fill: s.color });
    t.textContent = s.fmt ? s.fmt(s.values[li]) : fmt(s.values[li]);
    svg.appendChild(t);
  });
  host.appendChild(svg);
  if (cfg.series.length > 1) {
    const lg = document.createElement('div');
    lg.className = 'lg';
    lg.innerHTML = cfg.series.map(s => `<span><i style="background:${s.color}"></i>${s.name}</span>`).join('');
    host.appendChild(lg);
  }
}

/* ---------- 顶部 ---------- */
function renderHead() {
  const el = $('#hdMeta');
  const below = ROWS.filter(r => r.proc < FINE).length;
  el.innerHTML =
    `<span>周期 <b>2026年10月</b></span>` +
    `<span>数据截至 <b>${M.data_date}</b></span>` +
    `<span>P3 结算价已回填 <b>${M.p3_days}</b> 天（至 ${M.p3_last}）</span>` +
    `<span>过程指标≥${FINE}分 <b>${ROWS.length - below}/${ROWS.length}</b> 城</span>` +
    `<span class="badge ${below === 0 ? 'g' : 'b'}">${below === 0 ? '本月无罚扣风险' : below + ' 城低于罚款线'}</span>`;
}

function renderPbar() {
  const p = M.time_pct;
  $('#pbar').innerHTML =
    `<span class="lb">10 月时间进度</span>
     <span class="tk"><span class="fl" style="width:${(p * 100).toFixed(2)}%"></span></span>
     <span class="vl">${pct(p, 2)}（${M.data_date.slice(-2)}/${M.month_days} 天）</span>`;
}

/* ---------- KPI 卡片 ---------- */
let lockCity = null;
function renderCards() {
  const html = ROWS.map(r => {
    const below = r.proc < FINE;
    return `<div class="kpi c1${lockCity === r.city ? ' on' : ''}" data-city="${r.city}">
      <div class="k"><span>${r.city}</span><span class="gr">${r.grade || '--'}</span></div>
      <div class="v ${cls(r.rate, 0.8)}">${pct(r.rate)}</div>
      <div class="s">
        <span>S1 <b>${wan(r.cur)}</b>/${wan(r.tgt)}</span>
        <span>过程 <b class="${below ? 'bad' : 'ok'}">${r.proc.toFixed(1)}</b>分</span>
      </div></div>`;
  }).join('');
  $('#kpiCards').innerHTML = html;
  $('#ovN').textContent = `结果指标 8 城区间 ${pct(Math.min(...ROWS.map(r => r.rate)))} ~ ${pct(Math.max(...ROWS.map(r => r.rate)))}`;

  $$('#kpiCards .kpi').forEach(e => e.onclick = () => {
    lockCity = lockCity === e.dataset.city ? null : e.dataset.city;
    renderCards(); renderCharts();
    if (lockCity) switchTab('ops'), setCity(lockCity);
  });
}

/* ---------- KPI 图表 ---------- */
function actualIdx(){
  const st=new Set();
  const a=D.p3_days.indexOf(M.p3_first.slice(5)), b=D.p3_days.indexOf(M.p3_last.slice(5));
  for(let i=Math.max(0,a);i<=b;i++) st.add(i);
  return st;
}

function renderCharts() {
  const cities = lockCity ? ROWS.filter(r => r.city === lockCity) : ROWS;

  // S1 MTD 订单量 vs 目标
  barChart('s1Chart', {
    cats: cities.map(r => r.city),
    series: [
      { name: 'MTD订单量', color: '#58a6ff', values: cities.map(r => r.cur) },
      { name: '月订单量目标', color: '#30363d', values: cities.map(r => r.tgt) }
    ],
    yFmt: v => wan(v), vFmt: (v, sh) => sh ? wan(v) : '', showValues: true, height: 300
  });
  $('#s1ChartSub').innerHTML =
    `柱状为当月累计订单量（MTD）与月目标；完成率 = MTD / 目标。数据日 ${M.data_date}`;

  // 近5日分天节奏（y轴封顶 150%，超出值标注——小基数城市单日可超 200%）
  const dd = D.s1_daily || {};
  if (dd.days && dd.days.length) {
    const YMAX = 1.5;
    barChart('s1DailyChart', {
      cats: dd.days,
      series: cities.map(r => ({
        name: r.city, color: colorOf(cities, r.city),
        values: (dd.series[r.city] || []).map(v => (v === null || v === undefined) ? null : Math.min(v, YMAX)),
        over: (dd.series[r.city] || []).map(v => (v !== null && v !== undefined && v > YMAX) ? v : null)
      })),
      yMax: YMAX,
      yFmt: v => (v * 100).toFixed(0) + '%', vFmt: (v, sh) => sh ? (v * 100).toFixed(0) : '',
      refLine: 1, refLabel: '100% 分天目标', showValues: false, height: 300, barW: 26
    });
    // 超 150% 的城市单独提示
    const overCities = cities.filter(r => (dd.series[r.city] || []).some(v => v !== null && v > YMAX));
    const box = $('#s1DailyChart').parentElement;
    let tip = box.querySelector('.ov-tip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'ov-tip'; box.appendChild(tip); }
    tip.style.cssText = 'font-size:11.5px;color:var(--warn);margin-top:8px;line-height:1.7';
    tip.innerHTML = overCities.length
      ? '⚠️ 以下城市存在单日超 150% 的分天节奏（小基数城市单日波动大），图中已截顶显示实际值：' +
        overCities.map(r => {
          const mx = Math.max(...(dd.series[r.city] || []).filter(v => v !== null));
          return `${r.city} ${(mx * 100).toFixed(0)}%`;
        }).join('　')
      : '';
  }

  // 货盘达标率
  barChart('hpChart', {
    cats: cities.map(r => r.city),
    series: [
      { name: '神抢手货盘达标率', color: '#3fb950', values: cities.map(r => r.sq_rate) },
      { name: '拼好饭货盘达标率', color: '#58a6ff', values: cities.map(r => r.ph_rate) },
      { name: '货盘合计', color: '#a371f7', values: cities.map(r => r.hp.ALL.rate) }
    ],
    yFmt: v => (v * 100).toFixed(0) + '%', vFmt: (v, sh) => sh ? (v * 100).toFixed(1) : '',
    refLine: 0.70, refLabel: '70% 满系数线', height: 300
  });

  // P3 趋势：实测段实线 + 外推段虚线，避免把外推值误读为实测
  const actualSet = actualIdx();

  const series = cities.map(r => {
    const vals = D.p3_series[r.city] || [];
    return {
      name: r.city, color: colorOf(cities, r.city), values: vals,
      fmt: v => v === null ? '—' : (v * 100).toFixed(1) + '%',
      mask: i => actualSet.has(i)          // 实测点
    };
  });
  lineChart('p3Chart', {
    x: D.p3_days, series, yFmt: v => (v * 100).toFixed(0) + '%',
    refLine: 0.60, refLabel: '60% 满系数线', height: 300, dashed: true
  });
  $('#p3Sub').innerHTML =
    `考核期 ${M.p3_first} ~ ${M.month_days} 日，共 ${D.p3_days.length} 天。` +
    `<b style="color:var(--ok)">实线</b> = ${M.p3_first} ~ ${M.p3_last} 已回填实测值；` +
    `<b style="color:var(--tx3)">虚线</b> = ${M.p3_last} 之后按最新日外推（非实测）。`;
  // 实测/外推分界竖线
  const chart = $('#p3Chart');
  const tip = document.createElement('div');
  tip.className = 'ov-tip';
  tip.style.cssText = 'font-size:11.5px;color:var(--tx3);margin-top:8px';
  const nAct = actualSet.size, nAll = D.p3_days.length;
  tip.innerHTML = `已回填 <b style="color:var(--ok)">${nAct}</b> 天实测　|　外推 <b>${nAll - nAct}</b> 天　|　日均覆盖率取全考核期 ${D.p3_days.length} 天算术平均`;
  chart.parentElement.appendChild(tip);
}

function colorOf(list, city) {
  const PAL = ['#58a6ff', '#3fb950', '#d29922', '#f85149', '#a371f7', '#f0883e', '#56d4dd', '#7ee787'];
  const i = list.findIndex(r => r.city === city);
  return PAL[(i < 0 ? 0 : i) % PAL.length];
}

/* ---------- KPI 表格 ---------- */
function barCell(rate, th, color) { return bar(rate, th, color); }

function renderTables() {
  const th2 = `<tr>
    <th rowspan="2">城市</th><th rowspan="2">等级</th><th rowspan="2">渠道经理</th>
    <th colspan="4">① S1 拼好饭订单完成率 <span style="font-weight:400;opacity:.7">(权重40%)</span></th>
    <th colspan="4" class="g">② 神抢手货盘达标率 <span style="font-weight:400;opacity:.7">(权重30%)</span></th>
    <th colspan="4" class="b">③ 拼好饭货盘达标率 <span style="font-weight:400;opacity:.7">(20%/35%)</span></th>
    <th colspan="4" class="o">④ 结算价下探覆盖率 <span style="font-weight:400;opacity:.7">(10%/25%)</span></th>
    <th rowspan="2">过程<br>得分</th><th rowspan="2">过程<br>完成率</th></tr>
  <tr>
    <th>目标数</th><th>完成量</th><th>完成率</th><th>得分</th>
    <th>目标池</th><th>达标数</th><th>达标率</th><th>得分</th>
    <th>目标池</th><th>达标数</th><th>达标率</th><th>得分</th>
    <th>基线SKU</th><th>日均覆盖</th><th>系数</th><th>得分</th>
  </tr>`;

  $('#tblActual').innerHTML = `<thead>${th2}</thead><tbody>` + ROWS.map(r => {
    const sq = NO_SQS.has(r.city) ? '<td class="na">不考核</td>'.repeat(4)
      : `<td class="n">${fmt(r.hp.SQS.pool)}</td><td class="n">${fmt(r.hp.SQS.ok)}</td>
         <td>${barCell(r.sq_rate, 0.70)}</td><td class="n ${cls(r.sq_score, 21)}">${r.sq_score.toFixed(2)}</td>`;
    return `<tr>
      <td class="cty">${r.city}<span class="gr">${r.grade || '--'}</span></td>
      <td class="dim" style="max-width:118px;overflow:hidden;text-overflow:ellipsis" title="${r.mgr || ''}">${r.mgr || '--'}</td>
      <td class="n">${fmt(r.tgt)}</td><td class="n">${fmt(r.cur)}</td>
      <td>${barCell(r.rate, 0.80)}</td>
      <td class="n ${cls(r.s1_score, 32)}">${r.s1_score.toFixed(2)}</td>
      ${sq}
      <td class="n">${fmt(r.hp.PHF.pool)}</td><td class="n">${fmt(r.hp.PHF.ok)}</td>
      <td>${barCell(r.ph_rate, 0.70)}</td>
      <td class="n ${cls(r.ph_score, 14)}">${r.ph_score.toFixed(2)}</td>
      <td class="n dim">${fmt(r.p3_meta.pool)}</td>
      <td>${barCell(r.p3_rate, 0.60)}</td>
      <td class="n ${kcls(r.p3_k)}">${r.p3_k === null ? '—' : r.p3_k.toFixed(1)}</td>
      <td class="n ${cls(r.p3_score, 6)}">${r.p3_score.toFixed(2)}</td>
      <td class="n ${cls(r.proc, 36)}">${r.proc.toFixed(2)}</td>
      <td>${barCell(r.proc_pct, 0.60)}</td></tr>`;
  }).join('') + '</tbody>';
  $('#t1N').textContent = `数据日 ${M.data_date}｜罚款线 ${FINE} 分`;

  // 预估版
  $('#tblEst').innerHTML = `<thead>${th2}</thead><tbody>` + ROWS.map(r => {
    const sq = NO_SQS.has(r.city) || !r.est_sq ? '<td class="na">不考核</td>'.repeat(4)
      : `<td class="n">${fmt(r.est_sq.pool)}</td><td class="n">${fmt(r.est_sq.ok)}</td>
         <td>${barCell(r.est_sq.rate, 0.70)}</td><td class="n ${cls(r.est_sq.score, 21)}">${r.est_sq.score.toFixed(2)}</td>`;
    return `<tr>
      <td class="cty">${r.city}<span class="gr">${r.grade || '--'}</span></td>
      <td class="dim" style="max-width:118px;overflow:hidden;text-overflow:ellipsis" title="${r.mgr || ''}">${r.mgr || '--'}</td>
      <td class="n">${fmt(r.tgt)}</td><td class="n">${fmt(r.proj)}</td>
      <td>${barCell(r.proj_rate, 0.80)}</td>
      <td class="n ${cls(r.proj_score, 32)}">${r.proj_score.toFixed(2)}</td>
      ${sq}
      <td class="n">${fmt(r.hp.PHF.pool)}</td><td class="n">${fmt(r.hp.PHF.ok)}</td>
      <td>${barCell(r.ph_rate, 0.70)}</td>
      <td class="n ${cls(r.ph_score, 14)}">${r.ph_score.toFixed(2)}</td>
      <td class="n dim">${fmt(r.p3_meta.pool)}</td>
      <td>${barCell(r.p3_rate, 0.60)}</td>
      <td class="n ${kcls(r.p3_k)}">${r.p3_k === null ? '—' : r.p3_k.toFixed(1)}</td>
      <td class="n ${cls(r.p3_score, 6)}">${r.p3_score.toFixed(2)}</td>
      <td class="n ${cls(r.est_proc, 36)}">${r.est_proc.toFixed(2)}</td>
      <td>${barCell(r.est_pct, 0.60)}</td></tr>`;
  }).join('') + '</tbody>';
  $('#t2N').textContent = '外推至 10/31 的月末预判';

  // 过程明细
  const th3 = `<tr>
    <th rowspan="2">城市</th><th colspan="3">货盘汇总（②+③）</th>
    <th colspan="3" class="g">② 神抢手货盘</th>
    <th colspan="3" class="b">③ 拼好饭货盘</th>
    <th colspan="4" class="o">④ 结算价下探</th>
    <th rowspan="2">过程<br>得分</th></tr>
  <tr><th>目标池</th><th>达标数</th><th>达标率</th>
    <th>目标池</th><th>达标数</th><th>达标率</th>
    <th>目标池</th><th>达标数</th><th>达标率</th>
    <th>基线SKU</th><th>商家数</th><th>日均覆盖</th><th>得分</th></tr>`;
  $('#tblDetail').innerHTML = `<thead>${th3}</thead><tbody>` + ROWS.map(r => {
    const sq = NO_SQS.has(r.city) ? '<td class="na">不考核</td><td class="na">—</td><td class="na">—</td>'
      : `<td class="n">${fmt(r.hp.SQS.pool)}</td><td class="n">${fmt(r.hp.SQS.ok)}</td><td>${barCell(r.sq_rate, .7)}</td>`;
    return `<tr>
      <td class="cty">${r.city}</td>
      <td class="n">${fmt(r.hp.ALL.pool)}</td><td class="n">${fmt(r.hp.ALL.ok)}</td>
      <td>${barCell(r.hp.ALL.rate, 0.70)}</td>
      ${sq}
      <td class="n">${fmt(r.hp.PHF.pool)}</td><td class="n">${fmt(r.hp.PHF.ok)}</td>
      <td>${barCell(r.ph_rate, 0.70)}</td>
      <td class="n dim">${fmt(r.p3_meta.sku)}</td><td class="n dim">${fmt(r.p3_meta.shop)}</td>
      <td>${barCell(r.p3_rate, 0.60)}</td>
      <td class="n ${cls(r.p3_score, 6)}">${r.p3_score.toFixed(2)}</td>
      <td class="n ${cls(r.proc, 36)}">${r.proc.toFixed(2)}</td></tr>`;
  }).join('') + '</tbody>';
}

/* ---------- 关注 ---------- */
function renderFocus() {
  const s1fail = ROWS.filter(r => r.rate && r.rate < 0.8);
  const sqs = ROWS.filter(r => r.sq_rate !== null);
  const phf = ROWS.filter(r => r.ph_rate !== null);
  const p3 = ROWS.filter(r => r.p3_rate !== null);
  const below = ROWS.filter(r => r.proc < FINE).sort((a, b) => a.proc - b.proc);
  const below60 = ROWS.filter(r => r.proc < BLUE);
  const bestS1 = [...ROWS].sort((a, b) => b.rate - a.rate)[0];
  const worstS1 = [...ROWS].sort((a, b) => a.rate - b.rate)[0];
  const bestProc = [...ROWS].sort((a, b) => b.proc - a.proc)[0];

  const rng = a => `${pct(Math.min(...a.map(x => x.rate)))} ~ ${pct(Math.max(...a.map(x => x.rate)))}`;
  const dayN = Number(M.data_date.slice(-2));

  $('#focusNote').innerHTML = `<h4>💡 关注点（截至 ${M.data_date}，考核已进行 ${dayN} 天）</h4>
  <ul>
    <li><b>结果指标 S1：</b>8 城完成率 ${rng(ROWS)}，
      ${s1fail.length
        ? `<span class="r">${s1fail.length} 城低于 80% 系数线（${s1fail.map(r => r.city).join('、')}）→ 得分归 0</span>，是本月最大失分点`
        : `<span class="g">全部过 80% 系数线</span>`}。
      领先 <b>${bestS1.city} ${pct(bestS1.rate)}</b>，落后 <b>${worstS1.city} ${pct(worstS1.rate)}</b>。</li>
    <li><b>② 神抢手货盘：</b>${rng(sqs)}，
      ${sqs.every(r => r.sq_rate >= 0.7) ? '<span class="g">6 城全部 ≥70%，系数 1.2 满档</span>'
        : `<span class="r">${sqs.filter(r => r.sq_rate < 0.7).map(r => r.city).join('、')} 低于 70%，系数下调</span>`}。
      东兰、凤山无神抢手目标池，不考核。</li>
    <li><b>③ 拼好饭货盘：</b>${rng(phf)}，
      ${phf.every(r => r.ph_rate >= 0.7) ? '<span class="g">8 城全部 ≥70%，系数 1.2 满档</span>'
        : `<span class="r">${phf.filter(r => r.ph_rate < 0.7).map(r => r.city).join('、')} 低于 70%</span>`}。</li>
    <li><b>④ 结算价下探：</b>考核期 ${M.p3_first} ~ 10/31，已回填 <b>${M.p3_days}</b> 天（最新 ${M.p3_last}），
      日均覆盖率 ${rng(p3)}（未发生日期取 ${M.p3_last} 外推）。
      ${p3.filter(r => r.p3_rate < 0.6).length ? `<span class="r">${p3.filter(r => r.p3_rate < 0.6).map(r => r.city).join('、')} 低于 60% 满系数线</span>` : '<span class="g">8 城全部 ≥60%，系数 1.2</span>'}。</li>
    <li><b>过程指标合计：</b>得分区间 ${Math.min(...ROWS.map(r => r.proc)).toFixed(2)} ~ ${Math.max(...ROWS.map(r => r.proc)).toFixed(2)} 分，
      领先 <b>${bestProc.city} ${bestProc.proc.toFixed(2)}</b>。
      ${below.length ? `<span class="r">${below.map(r => r.city + ' ' + r.proc.toFixed(1) + '分').join('、')} 低于 ${FINE} 分罚款线</span>`
        : `<span class="g">8 城全部 ≥${FINE} 分罚款线，本月无罚扣风险</span>`}；
      ${below60.length ? `<span class="y">${below60.map(r => r.city).join('、')} 未达 ${BLUE} 分（60% 完成率）</span>` : ''}。</li>
  </ul>`;
}

/* ---------- 口径说明 ---------- */
function renderRule() {
  $('#ruleBox').innerHTML = `
  <h4>10 月指标体系（过程指标权重合计 60%）</h4>
  <ul>
    <li><b>① 结果指标 S1 · 拼好饭订单完成率（权重 40%）</b><br>
      得分 = min(完成率, 120%) × 系数 × 40%。
      系数：<span class="g">≥80% = 1</span>、<span class="r">&lt;80% = 0</span>。
      完成率 = 当月MTD 订单量 ÷ 月订单量目标。</li>
    <li><b>② 神抢手重点货盘商品达标率（权重 30%）</b> ／ <b>③ 拼好饭重点货盘商品达标率（权重 20%，东兰凤山 35%）</b><br>
      得分 = 达标率 × 系数 × 权重。系数：
      <span class="g">70~100% = 1.2</span>、<span class="y">60~70% = 0.8</span>、<span class="r">&lt;60% = 0</span>。
      目标池 = 货盘明细表行数（已按商家/SKU 去重），达标 = 「达标情况」列为「达标」。</li>
    <li><b>④ 结算价下探覆盖率（权重 10%，东兰凤山 25%）</b><br>
      得分 = 日均覆盖率 × 系数 × 权重。系数：
      <span class="g">60~100% = 1.2</span>、<span class="y">50~60% = 1</span>、30~50% = 0.8、<span class="r">&lt;30% = 0</span>。<br>
      覆盖率取「考核期累计日均」= ${M.p3_first} ~ 10/31 各日 SKU 达标率的算术平均，
      <b>未发生日期统一取已发生最新日期（${M.p3_last}）数据外推至月底</b>。</li>
    <li><b>过程指标完成率</b> = ②③④得分 ÷ 60；
      <b>罚款线 = ${FINE} 分（完成率 90%）</b>；<span class="g">完成率 ≥90% 直接免罚</span>；
      唯一豁免 = 结果指标完成率 ≥105% 且 过程指标完成率 ≥60%。</li>
    <li><b>月末预估口径</b>：<br>
      ① S1 线性外推—— 取近 5 个观测日的日均增量（增量按实际间隔天数折算，修正底表缺日造成的跳变）× 剩余天数，完成率封顶 135% 抑制小基数城市噪声；<br>
      ② 神抢手预估 = 当前达标率 +（100% − 当前）× 10pp（按未达标部分 10% 达成估计），按②系数重算；<br>
      ③ 拼好饭预估 = 当前达标率（不外推），按 ③系数计分；<br>
      ④ P3 沿用当前日均覆盖率（已按最新日外推至月底）。</li>
    <li><b>权重转移</b>：东兰县、凤山县无神抢手目标池，30% 权重转移给 ③拼好饭货盘（20%→35%）与 ④P3（10%→25%），过程权重合计仍为 60%。</li>
  </ul>`;

  $('#tblSrc').innerHTML = `<thead><tr>
    <th>层级</th><th>数据源目录</th><th>文件</th><th>取数口径</th></tr></thead><tbody>
    <tr><td class="cty">① 结果指标</td><td class="dim">E:\\总商维度数据\\1结果指标</td>
      <td class="dim">${M.src_result}</td>
      <td style="text-align:left">拼好饭-底表：MTD订单量 / 月订单量目标 / 城市等级；高优池看板：近5日分天节奏</td></tr>
    <tr><td class="cty">② 过程指标货盘</td><td class="dim">E:\\总商维度数据\\2过程指标\\每日明细</td>
      <td class="dim">${M.src_hp}</td>
      <td style="text-align:left">按「来源」拆分神抢手*/拼好饭*，统计目标池 / 达标 / 攻克 / 订单 / 实付金额</td></tr>
    <tr><td class="cty">③ 过程指标结算价下探</td><td class="dim">E:\\总商维度数据\\2过程指标\\结算价下探</td>
      <td class="dim">下沉拼好饭货盘_10月结算价做功商品池明细_*.xlsx</td>
      <td style="text-align:left">「SKU是否达标」=1 记达标；仅统计已回填日（达标列非全0），未发生日取最新已发生日外推</td></tr>
  </tbody>`;
  $('#ftSrc').innerHTML =
    `数据来源：${M.src_result}　|　${M.src_hp}　|　${M.src_p3_dir}（数据截至 ${M.data_date}）` +
    `　|　生成时间 ${M.generated}`;
}

/* ============================================================
   TAB 2 —— 商品运营明细
   ============================================================ */
let curCity = CITIES[0], curBiz = 'SQS', shopSort = 'ord', shopKw = '';

function renderCityNav() {
  $('#cityNav').innerHTML = ROWS.map(r => {
    const dot = r.proc < FINE ? 'var(--bad)' : r.proc < BLUE ? 'var(--warn)' : 'var(--ok)';
    return `<div class="cn${curCity === r.city ? ' on' : ''}" data-city="${r.city}">
      <span class="dot" style="background:${dot}"></span>${r.city}
      <span class="rt">${r.proc.toFixed(1)}分</span></div>`;
  }).join('');
  $$('#cityNav .cn').forEach(e => e.onclick = () => setCity(e.dataset.city));
}

function setCity(c) {
  curCity = c; lockCity = c;
  if (location.hash.startsWith('#ops')) history.replaceState(null,'','#ops='+encodeURIComponent(c));
  renderCityNav(); renderCards(); renderOps(); renderCharts();
}

function renderOps() {
  const r = ROWS.find(x => x.city === curCity);
  if (!r) return;
  $('#ocTitle').textContent = `${r.city} · 货盘与商家结构`;
  $('#ocN').textContent = `${r.grade || '--'} ｜ 渠道经理 ${r.mgr || '--'} ｜ 过程得分 ${r.proc.toFixed(2)}`;

  const hp = r.hp;
  $('#opCards').innerHTML = `
   <div class="kpi c1"><div class="k"><i style="background:var(--sq)"></i>神抢手货盘</div>
     <div class="v ${cls(hp.SQS.rate, .7)}">${pct(hp.SQS.rate)}</div>
     <div class="s"><span>达标 <b>${fmt(hp.SQS.ok)}</b>/${fmt(hp.SQS.pool)}</span>
     <span>攻克率 <b>${pct(hp.SQS.kgr)}</b></span></div>
     <div class="s"><span>商家 <b>${fmt(hp.SQS.shop)}</b></span><span>订单 <b>${wan(hp.SQS.ord)}</b></span>
     <span>实付 <b>${wan(hp.SQS.amt)}</b></span></div></div>
   <div class="kpi c2"><div class="k"><i style="background:var(--ph)"></i>拼好饭货盘</div>
     <div class="v ${cls(hp.PHF.rate, .7)}">${pct(hp.PHF.rate)}</div>
     <div class="s"><span>达标 <b>${fmt(hp.PHF.ok)}</b>/${fmt(hp.PHF.pool)}</span>
     <span>攻克率 <b>${pct(hp.PHF.kgr)}</b></span></div>
     <div class="s"><span>商家 <b>${fmt(hp.PHF.shop)}</b></span><span>订单 <b>${wan(hp.PHF.ord)}</b></span>
     <span>实付 <b>${wan(hp.PHF.amt)}</b></span></div></div>
   <div class="kpi c4"><div class="k"><i style="background:var(--acc2)"></i>货盘合计</div>
     <div class="v ${cls(hp.ALL.rate, .7)}">${pct(hp.ALL.rate)}</div>
     <div class="s"><span>达标 <b>${fmt(hp.ALL.ok)}</b>/${fmt(hp.ALL.pool)}</span>
     <span>攻克率 <b>${pct(hp.ALL.kgr)}</b></span></div>
     <div class="s"><span>商家 <b>${fmt(r.hp.shop_all)}</b></span><span>订单 <b>${wan(hp.ALL.ord)}</b></span>
     <span>实付 <b>${wan(hp.ALL.amt)}</b></span></div></div>
   <div class="kpi c3"><div class="k"><i style="background:var(--p3)"></i>结算价下探</div>
     <div class="v ${cls(r.p3_rate, .6)}">${pct(r.p3_rate)}</div>
     <div class="s"><span>达标 <b>${fmt(r.p3_meta.ok)}</b>/${fmt(r.p3_meta.pool)}</span>
     <span>系数 <b>${r.p3_k === null ? '—' : r.p3_k.toFixed(1)}</b></span></div>
     <div class="s"><span>基线SKU <b>${fmt(r.p3_meta.sku)}</b></span><span>覆盖商家 <b>${fmt(r.p3_meta.shop)}</b></span></div></div>`;

  // 来源细分
  const sb = D.src_break[r.city] || {};
  const keys = Object.keys(sb).sort((a, b) => sb[b].pool - sb[a].pool);
  $('#srcTitle').textContent = `${r.city} · 货盘来源达标率`;
  barChart('srcChart', {
    cats: keys,
    series: [
      { name: '目标池SKU', color: '#58a6ff', values: keys.map(k => sb[k].pool) },
      { name: '达标数', color: '#3fb950', values: keys.map(k => sb[k].ok) }
    ],
    yFmt: v => wan(v), vFmt: (v, sh) => sh ? fmt(v) : '', showValues: true, height: 290
  });

  // 做功场景
  const scene = r.p3_meta.scene || {};
  const sk = Object.keys(scene).sort((a, b) => scene[b] - scene[a]);
  barChart('sceneChart', {
    cats: sk, series: [{ name: '基线SKU', color: '#d29922', values: sk.map(k => scene[k]) }],
    yFmt: v => fmt(v), vFmt: (v, sh) => sh ? fmt(v) : '', showValues: true, height: 290
  });
  $('#sceneN').textContent = `${r.city} ｜ 基线 ${fmt(r.p3_meta.pool)} SKU ｜ 覆盖 ${fmt(r.p3_meta.shop)} 商家`;

  // 该城 P3 趋势
  const v3 = D.p3_series[r.city] || [];
  lineChart('ocP3Chart', {
    x: D.p3_days,
    series: [{ name: r.city, color: colorOf(ROWS, r.city), values: v3,
               fmt: v => v === null ? '—' : (v * 100).toFixed(1) + '%',
               mask: i => actualIdx().has(i) }],
    yFmt: v => (v * 100).toFixed(0) + '%', refLine: 0.60, refLabel: '60% 满系数线', height: 290
  });
  const as = actualIdx();
  $('#ocP3Sub').innerHTML =
    `${r.city} 考核期（${M.p3_first} ~ 10/31）每日 SKU 达标率。` +
    `<b style="color:var(--ok)">实线</b> = 已回填实测 ${as.size} 天；` +
    `<b style="color:var(--tx3)">虚线</b> = 按 ${M.p3_last} 外推（非实测）。`;

  renderShops();
}

function renderShops() {
  const list = (D.shops[`${curCity}|${curBiz}`] || []).slice();
  const kw = shopKw.trim().toLowerCase();
  let data = kw ? list.filter(s =>
    (s.name || '').toLowerCase().includes(kw) || (s.bd || '').toLowerCase().includes(kw)
    || String(s.mid).includes(kw)) : list;

  const cmp = {
    ord: (a, b) => b.ord - a.ord || b.amt - a.amt,
    amt: (a, b) => b.amt - a.amt,
    rate: (a, b) => a.rate - b.rate,
    pool: (a, b) => b.pool - a.pool
  }[shopSort];
  data.sort(cmp);

  $('#tblShop').innerHTML = `<thead><tr>
    <th style="min-width:52px">#</th><th style="text-align:left;min-width:230px">商家名称</th>
    <th>商家ID</th><th>BD MIS ID</th><th>货盘<br>SKU数</th><th>达标<br>数</th>
    <th style="min-width:132px">达标率</th><th>订单量</th><th>实付金额</th></tr></thead><tbody>`
    + data.slice(0, 400).map((s, i) => `<tr>
      <td class="dim n">${i + 1}</td>
      <td style="text-align:left" title="${(s.name || '').replace(/"/g, '&quot;')}">${s.name || '<span class="dim">—</span>'}</td>
      <td class="n dim">${s.mid}</td><td class="n dim">${s.bd || '—'}</td>
      <td class="n">${fmt(s.pool)}</td><td class="n">${fmt(s.ok)}</td>
      <td>${bar(s.rate, 0.70)}</td>
      <td class="n ${s.ord > 0 ? '' : 'dim'}">${fmt(s.ord)}</td>
      <td class="n ${s.amt > 0 ? '' : 'dim'}">${fmt(s.amt)}</td></tr>`).join('')
    + '</tbody>';

  const total = list.length;
  $('#shopN').textContent = `${curCity} · ${curBiz === 'SQS' ? '神抢手' : '拼好饭'} ｜ 共 ${fmt(total)} 家商家`;
  $('#shopCount').innerHTML = kw
    ? `匹配 <b style="color:var(--acc)">${fmt(data.length)}</b> / ${fmt(total)} 家${data.length > 400 ? '，仅显示前 400 家' : ''}`
    : `共 ${fmt(total)} 家${total > 400 ? '，按当前排序显示前 400 家' : ''}`;

  $$('#bizTabs button').forEach(b => b.classList.toggle('on', b.dataset.b === curBiz));
}

function bindOps() {
  $$('#bizTabs button').forEach(b => b.onclick = () => { curBiz = b.dataset.b; renderShops(); });
  $('#sortSel').onchange = e => { shopSort = e.target.value; renderShops(); };
  let t; $('#searchInp').oninput = e => { clearTimeout(t); t = setTimeout(() => { shopKw = e.target.value; renderShops(); }, 220); };
}

/* ---------- Tab 切换 ---------- */
function switchTab(name) {
  if (!['kpi','ops','rule'].includes(name)) name = 'kpi';
  $$('.tab').forEach(t => t.classList.toggle('on', t.dataset.tab === name));
  ['kpi', 'ops', 'rule'].forEach(n => $('#tab-' + n).classList.toggle('hidden', n !== name));
  if (location.hash.slice(1) !== name) history.replaceState(null, '', '#' + name);
  requestAnimationFrame(renderCharts);
}
$$('.tab').forEach(t => t.onclick = () => switchTab(t.dataset.tab));
window.addEventListener('hashchange', () => switchTab(location.hash.slice(1)));

/* ---------- 启动 ---------- */
renderHead(); renderPbar(); renderCards(); renderCharts();
renderTables(); renderFocus(); renderRule();
renderCityNav(); renderOps(); bindOps();
window.addEventListener('resize', () => { renderCharts(); renderOps(); });

// 深链：#ops / #ops=玉林市 / #rule
(function initHash() {
  const h = decodeURIComponent(location.hash.slice(1) || 'kpi');
  if (h.startsWith('ops')) {
    const c = h.split('=')[1];
    if (c && CITIES.includes(c)) curCity = c;
    switchTab('ops');
  } else {
    switchTab(h);
  }
})();

})();