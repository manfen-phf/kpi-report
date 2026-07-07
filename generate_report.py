# -*- coding: utf-8 -*-
"""商品运营分析报告 - 日维度自动生成器
==================================================
读取最新 结果指标(每日) / 过程指标(看板) / 覆盖率日维度 数据，自动生成 HTML 报告。
支持每日更新：把新日期的 Excel 放入对应目录后运行本脚本即可（或双击 update.bat）。

取数规则（重要）：
- 数据日期 = 结果指标表 G4 列（如 20260705），文件名"X月Y日更"只是更新日，不作数据日。
- 时间进度 = 数据日 / 当月天数（7月=31）* 100。
- 结果指标(高优池看板)：广西区域基准(row colC='广西区域', colJ完成率)；
  分区经理(colC 形如 广西分区（X）/广西区域（X）)；8城(colC=城市名, colF=等级, colG=考核, colJ=完成率)。
- 过程指标(看板汇总)：经理/城市货盘攻克率均在 colH(索引7)。
- 覆盖率日维度：文件名 _dddd 取日期，月周均=数据日期前所有日，单日=最新日。
"""
import re, os, calendar
import pandas as pd

# ---------- 路径配置 ----------
DATA_ROOT = r'E:\0总商维度数据\KPI绩效'
RES_DIR   = os.path.join(DATA_ROOT, '结果指标（每日）')
WATCH_DIR = os.path.join(DATA_ROOT, '过程指标（看板）')
COV_BASE  = os.path.join(DATA_ROOT, '001重点货盘日报输出', '商家参与优惠活动覆盖率')
OUT_DIR   = os.path.dirname(os.path.abspath(__file__))   # 本脚本所在目录(即仓库根)

CITY_ORDER = ['玉林市', '梧州市', '钦州市', '博白县', '田东县', '岑溪', '东兰县', '凤山县']

# ---------- 工具 ----------
def latest_file(folder, ext='.xlsx'):
    fs = [f for f in os.listdir(folder) if f.lower().endswith(ext) and not f.startswith('~$')]
    fs.sort()
    return os.path.join(folder, fs[-1]) if fs else None

def safe_float(v, default=0.0):
    try:
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return default
        return float(v)
    except Exception:
        return default

def paren(name):
    """从 '广西分区（欧阳云龙）' 提取括号内核名 '欧阳云龙'"""
    m = re.search(r'（(.+?)）', str(name))
    return m.group(1) if m else str(name)

# ============================================================
# 1. 结果指标（每日）
# ============================================================
def load_result_metrics():
    f = latest_file(RES_DIR)
    if not f:
        raise SystemExit('❌ 未找到结果指标文件: ' + RES_DIR)
    print('  📥 结果指标:', os.path.basename(f))
    df = pd.read_excel(f, sheet_name='高优池看板', header=None)
    # G4 数据日期
    g4 = str(df.iloc[3, 6]).strip()
    m = re.search(r'(\d{4})(\d{2})(\d{2})', g4)
    if not m:
        raise SystemExit('❌ 无法解析结果指标 G4 日期: ' + g4)
    Y, M, D = int(m.group(1)), int(m.group(2)), int(m.group(3))
    days_in_month = calendar.monthrange(Y, M)[1]
    time_progress = round(D / days_in_month * 100, 2)
    data_day_str = '%02d%02d' % (M, D)
    print('     数据日期: %04d-%02d-%02d | 时间进度: %.2f%% (%d/%d)' % (Y, M, D, time_progress, D, days_in_month))

    # 广西区域基准 phf (colC 精确 '广西区域', colJ)
    gx_phf = None
    for i in range(len(df)):
        if str(df.iloc[i, 2]).strip() == '广西区域':
            gx_phf = round(safe_float(df.iloc[i, 9]) * 100, 2)
            break
    if gx_phf is None:
        raise SystemExit('❌ 未找到 广西区域 拼好饭完成率')

    # 分区经理 (colC 形如 广西(分区|区域)（ )
    managers = []   # [(全名, phf%)]
    for i in range(len(df)):
        name = str(df.iloc[i, 2]).strip()
        if re.match(r'广西(分区|区域)（', name):
            phf = round(safe_float(df.iloc[i, 9]) * 100, 2)
            managers.append((name, phf))

    # 8 城 (colC=城市名, colF=等级, colG=考核, colJ=完成率)
    cities = []     # [(城市, 等级, 考核, phf%)]
    for i in range(len(df)):
        name = str(df.iloc[i, 2]).strip()
        if name in CITY_ORDER:
            phf = round(safe_float(df.iloc[i, 9]) * 100, 2)
            grade = str(df.iloc[i, 5]).strip() if pd.notna(df.iloc[i, 5]) else ''
            assess = str(df.iloc[i, 6]).strip() if pd.notna(df.iloc[i, 6]) else 'P+S'
            cities.append((name, grade, assess, phf))
    cities.sort(key=lambda x: CITY_ORDER.index(x[0]))

    return dict(Y=Y, M=M, D=D, days_in_month=days_in_month, time_progress=time_progress,
                data_day_str=data_day_str, gx_phf=gx_phf, managers=managers, cities=cities,
                src_file=os.path.basename(f))

# ============================================================
# 2. 过程指标（看板）
# ============================================================
def load_process_metrics():
    f = latest_file(WATCH_DIR)
    if not f:
        raise SystemExit('❌ 未找到过程指标文件: ' + WATCH_DIR)
    print('  📥 过程指标:', os.path.basename(f))
    xl = pd.ExcelFile(f)
    sheet = '看板汇总' if '看板汇总' in xl.sheet_names else xl.sheet_names[0]
    df = pd.read_excel(f, sheet_name=sheet, header=None)
    # 经理货盘攻克率: col0 形如 广西(分区|区域)（, colH(索引7)
    mgr_hp = {}      # {内核名: 攻克率%}
    gx_hp = 23.80    # 广西区域基准默认（过程指标无纯区域行时保留）
    for i in range(len(df)):
        a = str(df.iloc[i, 0]).strip() if pd.notna(df.iloc[i, 0]) else ''
        if re.match(r'广西(分区|区域)（', a):
            h = df.iloc[i, 7]
            mgr_hp[paren(a)] = round(safe_float(h) * 100, 2) if pd.notna(h) else None
        elif str(df.iloc[i, 0]).strip() == '广西区域':
            h = df.iloc[i, 7]
            if pd.notna(h):
                gx_hp = round(safe_float(h) * 100, 2)
    # 城市货盘攻克率: col0/col1 含城市名, colH(索引7)
    city_hp = {}     # {城市名: 攻克率% 或 None}
    for i in range(len(df)):
        row = df.iloc[i]
        txt = ' '.join(str(x) for x in row[:3] if pd.notna(x))
        for t in CITY_ORDER:
            if t in txt:
                h = df.iloc[i, 7]
                city_hp[t] = round(safe_float(h) * 100, 2) if pd.notna(h) else None
                break
    return dict(mgr_hp=mgr_hp, city_hp=city_hp, gx_hp=gx_hp)

# ============================================================
# 3. 覆盖率日维度（动态日期）
# ============================================================
def load_coverage(data_day_str):
    base = COV_BASE
    daily_dir = os.path.join(base, '日维度数据')
    files = sorted([f for f in os.listdir(daily_dir) if f.endswith('.xlsx') and not f.startswith('~$')])
    day_files = {re.search(r'_(\d{4})\.xlsx$', f).group(1): os.path.join(daily_dir, f) for f in files}
    all_days = sorted(day_files.keys())
    days = [d for d in all_days if d <= data_day_str]   # 数据日期及之前
    if not days:
        days = all_days
    single_day = max(days)
    print('  📥 覆盖率日维度: 可用日=%s | 计入月周均=%s | 单日=%s' % (all_days, days, single_day))

    # --- 经理级（月周均/单日）---
    tfile = os.path.join(base, '7月结算价下探达成进展播报_完整版.xlsx')
    tdf = pd.read_excel(tfile, sheet_name='7月结算价下探达成')
    target = dict(zip(tdf['组织结构'].astype(str), tdf['总目标SKU数'].astype(float)))
    T_gx = target.get('广西区域', 17650)
    daily_cov = {}
    gx_daily = {}
    for d in days:
        df_d = pd.read_excel(day_files[d], sheet_name='0')
        daily_cov[d] = df_d.groupby('分区')['SKU是否达标'].apply(lambda s: int((s == 1).sum())).to_dict()
        gx_daily[d] = int((df_d['SKU是否达标'] == 1).sum())
    mgr = {}
    for name, T in target.items():
        if T <= 0:
            continue
        rates = [daily_cov[d].get(name, 0) / T * 100 for d in days]
        single = daily_cov[single_day].get(name, 0) / T * 100
        mgr[name] = (round(sum(rates) / len(rates), 2), round(single, 2))
    gx_weekly = sum(gx_daily[d] / T_gx * 100 for d in days) / len(days)
    gx_single = gx_daily[single_day] / T_gx * 100

    # --- 城市级（月周均/单日）---
    city = {}
    for city_std in CITY_ORDER:
        weekly_rates, single_rate, target_n = [], 0, 0
        for d in days:
            df_d = pd.read_excel(day_files[d], sheet_name='0')
            sub = df_d[df_d['城市'] == city_std]
            if len(sub) == 0:
                short = city_std.replace('市', '').replace('县', '')
                matches = [c for c in df_d['城市'].dropna().unique() if short in str(c)]
                if matches:
                    sub = df_d[df_d['城市'].isin(matches)]
            pool = len(sub)
            covered = int((sub['SKU是否达标'] == 1).sum()) if pool > 0 else 0
            rate = covered / pool * 100 if pool > 0 else 0
            weekly_rates.append(rate)
            if d == single_day:
                single_rate, target_n = rate, pool
        avg = sum(weekly_rates) / len(weekly_rates) if weekly_rates else 0
        city[city_std] = (round(avg, 2), round(single_rate, 2), target_n)

    return dict(mgr=mgr, gx_cov=(round(gx_weekly, 2), round(gx_single, 2)), city=city, single_day=single_day)

# ============================================================
# 公式 / 样式 辅助（与已验证版本一致）
# ============================================================
def hp_coef(rate):
    if rate is None or rate < 0.50: return 0.0
    if rate < 0.60: return 0.8
    return 1.2

def cov_coef_func(rate):
    if rate is None or rate < 0.50: return 0.0
    if rate < 0.60: return 0.8
    if rate < 0.70: return 1.0
    return 1.2

def score_color(v):
    if v is None: return '#444'
    if v < 20: return '#f44336'
    if v < 40: return '#ff9800'
    return '#4caf50'

def fmt_pct(v):
    if v is None: return '—'
    return '%.2f%%' % v

def est_color(v):
    if v is None: return '#2e7d32'
    return '#c62828' if v < 90 else '#ff9800' if v < 100 else '#2e7d32'

# ============================================================
# 分区经理综合排名
# ============================================================
def build_ranking_table(gx_phf, gx_hp, managers, mgr_hp, cov_data, gx_cov):
    green, red = '#52c41a', '#f5222d'
    headers = ['排名', '分区经理', '拼好饭完成率', '重点货盘攻克率', '月周均达成率', '单日达成率', '综合得分', '风险状态']
    th = ''.join('<th style="padding:12px 10px;text-align:center;font-weight:600;white-space:nowrap;">%s</th>' % h for h in headers)

    def risk_status(total, gx):
        if total >= gx: return '正常', '#52c41a', '#e8f5e9'
        elif (gx - total) <= 2: return '低风险', '#fa8c16', '#fff4e0'
        else: return '高风险', '#f5222d', '#ffe8e8'

    rows = []
    gx_weekly, gx_single = gx_cov
    gx_score = round(gx_phf * 0.5 + gx_hp * 0.4 + gx_weekly * 0.1, 1)
    rows.append(
        '<tr style="background:#fff3e0;">'
        '<td style="padding:10px 10px;text-align:center;font-size:15px;font-weight:700;color:#e65100;">—</td>'
        '<td style="padding:10px 10px;font-weight:700;color:#e65100;text-align:center;white-space:nowrap;">广西区域</td>'
        '<td style="padding:10px 10px;text-align:center;font-weight:700;color:#e65100;">%.2f%%</td>' % gx_phf
        + '<td style="padding:10px 10px;text-align:center;font-weight:700;color:#e65100;">%.2f%%</td>' % gx_hp
        + '<td style="padding:10px 10px;text-align:center;font-weight:700;color:#e65100;">%.2f%%</td>' % gx_weekly
        + '<td style="padding:10px 10px;text-align:center;font-weight:700;color:#e65100;">%.2f%%</td>' % gx_single
        + '<td style="padding:10px 10px;text-align:center;font-weight:700;color:#e65100;">%.1f</td>' % gx_score
        + '<td style="padding:10px 10px;text-align:center;color:#999;">—</td>'
        + '</tr>'
    )
    records = []
    for name, phf in managers:
        hp = mgr_hp.get(paren(name), 0) or 0
        wk, sn = cov_data.get(name, (0, 0))
        total = round(phf * 0.5 + hp * 0.4 + wk * 0.1, 1)
        records.append({'name': name, 'phf': phf, 'hp': hp, 'wk': wk, 'sn': sn, 'total': total})
    records.sort(key=lambda x: x['total'], reverse=True)
    rank_icons = ['🥇', '🥈', '🥉'] + ['#%d' % i for i in range(4, len(records) + 1)]
    for idx, rec in enumerate(records):
        rank, name, phf, hp, wk, sn, total = (rank_icons[idx], rec['name'], rec['phf'], rec['hp'], rec['wk'], rec['sn'], rec['total'])
        c_phf = green if phf >= gx_phf else red
        c_hp = green if hp >= gx_hp else red
        c_wk = green if wk >= gx_weekly else red
        c_sn = green if sn >= gx_single else red
        status, st_color, st_bg = risk_status(total, gx_score)
        bg = '#f8f9ff' if idx % 2 == 0 else '#fff'
        rows.append(
            '<tr style="background:%s;">' % bg
            + '<td style="padding:10px 10px;text-align:center;font-size:15px;">%s</td>' % rank
            + '<td style="padding:10px 10px;font-weight:600;color:#333;text-align:center;white-space:nowrap;">%s</td>' % name
            + '<td style="padding:10px 10px;text-align:center;font-weight:700;color:%s;">%.2f%%</td>' % (c_phf, phf)
            + '<td style="padding:10px 10px;text-align:center;font-weight:700;color:%s;">%.2f%%</td>' % (c_hp, hp)
            + '<td style="padding:10px 10px;text-align:center;font-weight:700;color:%s;">%.2f%%</td>' % (c_wk, wk)
            + '<td style="padding:10px 10px;text-align:center;font-weight:700;color:%s;">%.2f%%</td>' % (c_sn, sn)
            + '<td style="padding:10px 10px;text-align:center;font-weight:700;color:#667eea;">%.1f</td>' % total
            + '<td style="padding:10px 10px;text-align:center;"><span style="display:inline-block;padding:3px 12px;border-radius:12px;font-size:12px;font-weight:700;color:%s;background:%s;">%s</span></td>' % (st_color, st_bg, status)
            + '</tr>'
        )
    return ('<div style="padding:16px 20px 12px;">'
            '<div style="font-size:16px;font-weight:700;color:#333;margin-bottom:12px;display:flex;align-items:center;gap:8px;">'
            '<span>🏆</span><span>分区经理综合排名</span>'
            '<span style="font-size:12px;font-weight:400;color:#999;margin-left:auto;">综合得分=拼好饭(50)+货盘(40)+月周均(10) ｜ 颜色: ≥广西绿 / &lt;广西红</span></div>'
            '<div style="overflow-x:auto;"><table class="rank-grid" style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.06);">'
            '<thead><tr style="background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;">' + th + '</tr></thead>'
            '<tbody>' + ''.join(rows) + '</tbody></table></div></div>')

# ============================================================
# KPI 卡片（欧阳云龙分区 vs 广西区域）
# ============================================================
def kpi_card(icon, title, value, gx, gap, gap_color, border_color, bg):
    return ('''<div class="kpi-district-card" style="background:#fff;border-radius:12px;padding:18px 20px;'''
            '''box-shadow:0 2px 12px rgba(0,0,0,0.08);border-left:4px solid %s;position:relative;">'''
            '''<div style="display:flex;align-items:center;margin-bottom:10px;">'''
            '''<span style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:10px;background:%s;font-size:22px;margin-right:10px;">%s</span>'''
            '''<span style="font-size:14px;font-weight:700;color:#333;">%s</span></div>'''
            '''<div style="font-size:32px;font-weight:800;color:%s;margin-bottom:8px;">%s</div>'''
            '''<div style="font-size:12px;color:#888;line-height:1.9;">广西区域: <b style="color:#333;">%s</b> &nbsp; 差距: <b style="color:%s;">%s</b></div></div>''') % (
            border_color, bg, icon, title, border_color, value, gx, gap_color, gap)

def build_kpi_cards(gx_phf, gx_hp, managers, mgr_hp, cov_data, gx_cov, date_label):
    # 欧阳云龙
    oy_name = next((n for n, _ in managers if '欧阳云龙' in n), None)
    oy_phf = next((p for n, p in managers if '欧阳云龙' in n), 0)
    oy_hp = mgr_hp.get('欧阳云龙', 0) or 0
    oy_wk = cov_data.get(oy_name, (0, 0))[0]
    gx_weekly = gx_cov[0]
    def gap_str(v, g):
        d = round(v - g, 2)
        return ('+' if d >= 0 else '') + '%.2f%%' % d, '#52c41a' if d >= 0 else '#f44336'
    g1, c1 = gap_str(oy_phf, gx_phf)
    g2, c2 = gap_str(oy_hp, gx_hp)
    g3, c3 = gap_str(oy_wk, gx_weekly)
    return ('<div style="padding:16px 20px 4px;"><div style="font-size:16px;font-weight:700;color:#333;margin-bottom:16px;'
            'display:flex;align-items:center;gap:8px;"><span>📊</span><span>KPI指标（欧阳云龙分区 vs 广西区域）</span>'
            '<span style="font-size:12px;font-weight:400;color:#999;margin-left:auto;">%s</span></div>'
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;">'
            + kpi_card('🍚', '拼好饭（50%）', '%.2f%%' % oy_phf, '%.2f%%' % gx_phf, g1, c1, '#7c3aed', '#ede9fe')
            + kpi_card('📦', '重点货盘（40%）', '%.2f%%' % oy_hp, '%.2f%%' % gx_hp, g2, c2, '#db2777', '#fce7f3')
            + kpi_card('🏪', '月度覆盖率（10%）', '%.2f%%' % oy_wk, '%.2f%%' % gx_weekly, g3, c3, '#2563eb', '#dbeafe')
            + '</div></div>')

# ============================================================
# 玉林商8城 KPI 进度总览 + 风险
# ============================================================
def build_city_table_and_risk(time_progress, cities, city_hp, city_cov):
    rows = []
    city_risk = []
    HP_EST = 75.0
    for i, (name, grade, assess, phf) in enumerate(cities, 1):
        gap = round(phf - time_progress, 2)
        pest = round(phf / time_progress * 100, 2)
        phf_rate = phf / 100.0
        phf_score = round(min(phf_rate * 50, 60), 2)
        pest_rate = pest / 100.0
        pest_score = round(min(pest_rate * 50, 60), 2)

        hp_weight = 50 if assess == 'P' else 40
        hp = city_hp.get(name)
        if hp is None:
            hp_rate, hp_str, c_hp = None, '—', 0.0
            hp_coef_str = '—'
            hp_score = 0.0
            hp_est_rate = HP_EST / 100.0
            hp_est_score = round(hp_est_rate * hp_coef(hp_est_rate) * hp_weight, 2)
        else:
            hp_rate = hp / 100.0
            hp_str = fmt_pct(hp)
            c_hp = hp_coef(hp_rate)
            hp_coef_str = '%.1f' % c_hp if c_hp > 0 else '0'
            hp_score = round(hp_rate * c_hp * hp_weight, 2)
            hp_est_rate = HP_EST / 100.0
            hp_est_score = round(hp_est_rate * hp_coef(hp_est_rate) * hp_weight, 2)

        cov_weekly, cov_single, cov_target = city_cov.get(name, (0, 0, 0))
        if assess == 'P':
            cov_str, cov_c_str = '—', '—'
            cov_score = 0.0
            cov_est_rate, cov_est_str = None, '—'
            cov_est_score = 0.0
        else:
            cov_str = fmt_pct(cov_weekly)
            c_cv = cov_coef_func(cov_weekly / 100.0) if cov_target > 0 else 0
            cov_c_str = '%.1f' % c_cv if c_cv > 0 else ('0' if cov_target > 0 else '—')
            cov_score = round((cov_weekly / 100.0) * c_cv * 10, 2)
            cov_est_rate = cov_single if cov_target > 0 else None
            cov_est_str = fmt_pct(cov_est_rate)
            c_cv_est = cov_coef_func(cov_est_rate / 100.0) if cov_est_rate else 0
            cov_est_score = round((cov_est_rate / 100.0) * c_cv_est * 10, 2)

        total_now = round(phf_score + hp_score + cov_score, 2)
        total_est = round(pest_score + hp_est_score + cov_est_score, 2)
        process_est = round(hp_est_score + cov_est_score, 2)
        is_exempt = pest >= 105
        is_warn = total_est < 90
        is_fine = process_est < 45 and not is_exempt
        risk_parts = []
        if is_fine: risk_parts.append('💰罚款')
        if is_warn: risk_parts.append('⚠️警告')
        if not risk_parts: risk_parts.append('✅无风险')
        if is_exempt and (is_fine or is_warn):
            risk_parts.append('🛡️可减免')
        risk_label = ' '.join(risk_parts)
        city_risk.append(dict(name=name, total_est=round(total_est, 2), process_est=round(process_est, 2),
                              is_warn=is_warn, is_fine=is_fine, is_exempt=is_exempt, pest=pest))
        if is_fine:
            r_class, r_color = 'risk-tag-both', '#c62828'
        elif is_warn:
            r_class, r_color = 'risk-tag-warn', '#f44336'
        elif is_exempt:
            r_class, r_color = 'risk-tag-normal', '#4caf50'
        else:
            r_class, r_color = 'risk-tag-normal', '#4caf50'
        tag = 'P' if assess == 'P' else 'P+S'
        tc = '#2e7d32' if assess == 'P' else '#1565c0'
        bc = '#a5d6a7' if assess == 'P' else '#90caf9'
        gap_color = '#4CAF50' if gap >= 0 else '#f44336'
        gap_str = ('+' if gap >= 0 else '') + '%.2f%%' % gap
        est_phf_c = '#2e7d32' if pest >= 105 else ('#c62828' if pest < 90 else '#ff9800')
        est_hp_c = '#2e7d32'
        est_cov_c = '#2e7d32'
        rows.append('''<tr>
    <td class="col-info"><strong>%d</strong></td>
    <td class="col-info"><strong>%s</strong></td>
    <td class="col-info">%s</td>
    <td class="col-info"><span class="risk-tag" style="background:%s;color:%s;font-size:10px;border:1px solid %s;">%s</span></td>
    <td>%s</td>
    <td><span style="color:%s;font-weight:bold">%s</span></td>
    <td><span style="color:%s;font-weight:bold">%.2f</span></td>
    <td class="col-est-phf" style="background:#e8f5e9;font-style:italic;font-weight:700;color:%s;">%s</td>
    <td>%s</td>
    <td>%s</td>
    <td><span style="color:%s;font-weight:bold">%.2f</span></td>
    <td class="col-est-hp" style="background:#e8f5e9;font-style:italic;font-weight:700;color:%s;">%s</td>
    <td>%s</td>
    <td>%s</td>
    <td><span style="color:%s;font-weight:bold">%.2f</span></td>
    <td class="col-est-cov" style="background:#e8f5e9;font-style:italic;font-weight:700;color:%s;">%s</td>
    <td><span style="color:%s;font-weight:bold">%.2f</span></td>
    <td class="col-est-total" style="background:#e8f5e9;font-style:italic;font-weight:700;color:%s;">%.2f</td>
    <td><span class="risk-tag %s" style="font-size:11px;">%s</span></td>
</tr>''' % (
            i, name, grade,
            '#e8f5e9' if assess == 'P' else '#e3f2fd', tc, bc, tag,
            fmt_pct(phf), gap_color, gap_str,
            score_color(phf_score), phf_score,
            est_phf_c, fmt_pct(pest),
            hp_str, hp_coef_str,
            score_color(hp_score), hp_score,
            est_hp_c, fmt_pct(HP_EST),
            cov_str, cov_c_str,
            score_color(cov_score), cov_score,
            est_cov_c, cov_est_str,
            score_color(total_now), total_now,
            est_color(total_est), total_est,
            r_class, risk_label,
        ))
    tbody = '\n'.join(rows)

    kpi_table_html = '''<div style="padding:16px 20px 12px;"><div style="font-size:16px;font-weight:700;color:#333;margin-bottom:16px;display:flex;align-items:center;gap:8px;"><span>🏙️</span><span>玉林商8城KPI进度总览</span>
<span style="font-size:12px;font-weight:400;color:#999;margin-left:auto;">拼好饭50% + 货盘40%(P城50%) + 月度覆盖10%(P城不计) ｜ 货盘预估=75% ｜ 覆盖预估=单日</span></div>
<div class="table-wrapper">
<table class="kpi-table">
<colgroup>
    <col style="width:42px"><col style="width:62px"><col style="width:48px"><col style="width:52px">
    <col style="width:68px"><col style="width:66px"><col style="width:64px"><col style="width:68px">
    <col style="width:62px"><col style="width:46px"><col style="width:60px"><col style="width:66px">
    <col style="width:62px"><col style="width:46px"><col style="width:60px"><col style="width:66px">
    <col style="width:64px"><col style="width:66px">
    <col style="width:110px">
</colgroup>
<thead>
<tr>
    <th class="th-group-1" colspan="4">📝 基础信息</th>
    <th class="th-group-2" colspan="4">🍚 拼好饭（50%）</th>
    <th class="th-group-4" colspan="4">📦 重点货盘</th>
    <th class="th-group-5" colspan="4">🏪 月度覆盖率（10%）</th>
    <th class="th-group-3" colspan="2">📊 合计</th>
    <th class="th-group-1" colspan="1">⚠️ 风险状态</th>
</tr>
<tr>
    <th class="th-sub-1">排</th><th class="th-sub-1">城市</th><th class="th-sub-1">等级</th><th class="th-sub-1">考核</th>
    <th class="th-sub-2">完成率</th><th class="th-sub-2">GAP</th><th class="th-sub-2">目前得分</th><th class="th-sub-2 col-est-phf">预估完成率</th>
    <th class="th-sub-4">攻克率</th><th class="th-sub-4">系数</th><th class="th-sub-4">目前得分</th><th class="th-sub-4 col-est-hp">预估完成率</th>
    <th class="th-sub-5">覆盖率</th><th class="th-sub-5">系数</th><th class="th-sub-5">目前得分</th><th class="th-sub-5 col-est-cov">预估完成率</th>
    <th class="th-sub-3">目前总得分</th><th class="th-sub-3 col-est-total">预计总得分</th>
    <th class="th-sub-1">判定</th>
</tr>
</thead>
<tbody>''' + '\n' + tbody + '''</tbody>
</table>
</div>
<div class="note-box">
💡 <b>计分规则</b>：
<b>拼好饭</b>=完成率×50（封顶60）｜
<b>货盘</b>=达标率×系数×权重，系数：[60%,100%]→1.2 / [50%,60%)→0.8 / &lt;50%→0｜
<b>月度覆盖</b>=覆盖率×系数×10，系数：≥70%→1.2 / ≥60%→1.0 / ≥50%→0.8 / &lt;50%→0<br>
📌 <b>权重</b>：P+S城市 = 拼好饭50%+货盘40%+月度覆盖10%；<b>P城市(东兰/凤山) = 拼好饭50%+货盘50%，不考核月度覆盖率</b><br>
⚠️ <b>警告</b>：预估总得分&lt;90分 ｜ 💰 <b>罚款</b>：过程指标(货盘+覆盖)预估&lt;45分 ｜ 🛡️ <b>可减免</b>：拼好饭预估完成率≥105%
</div>
</div>'''

    risk_cards = build_risk_cards(city_risk)
    risk_analysis = build_risk_analysis(city_risk)
    return kpi_table_html, risk_cards, risk_analysis

def build_risk_cards(city_risk):
    warn_n = sum(1 for c in city_risk if c['is_warn'])
    fine_n = sum(1 for c in city_risk if c['is_fine'])
    exempt_n = sum(1 for c in city_risk if c['is_exempt'])
    return ('<div class="kpi-section"><div class="summary-cards">'
        '<div class="summary-card card-warn"><div class="card-icon">⚠️</div>'
        '<div class="card-label">警告城市数</div><div class="card-value">%d</div>'
        '<div class="card-sub">预估总得分&lt;90（共%d城）</div></div>'
        '<div class="summary-card card-fine"><div class="card-icon">💰</div>'
        '<div class="card-label">罚款城市数</div><div class="card-value">%d</div>'
        '<div class="card-sub">过程(货盘+覆盖)预估&lt;45分（共%d城）</div></div>'
        '<div class="summary-card card-good"><div class="card-icon">✅</div>'
        '<div class="card-label">可减免城市</div><div class="card-value">%d</div>'
        '<div class="card-sub">拼好饭预估完成率≥105%%（共%d城）</div></div>'
        '</div></div>') % (warn_n, warn_n, fine_n, fine_n, exempt_n, exempt_n)

def build_risk_analysis(city_risk):
    warn_cities = [c for c in city_risk if c['is_warn']]
    fine_cities = [c for c in city_risk if c['is_fine']]
    good_cities = [c for c in city_risk if not c['is_warn'] and not c['is_fine']]
    def nm(cs): return '、'.join(c['name'] for c in cs) if cs else '—'
    warn_detail = '；'.join('%s：%.2f' % (c['name'], c['total_est']) for c in warn_cities) if warn_cities else '无'
    items = []
    if warn_cities:
        items.append('<div class="risk-item risk-item-warn"><span class="risk-tag risk-tag-warn">⚠️ 警告风险（%d城）</span>'
            '<span class="risk-text"><strong>%s：</strong>预估总得分 %s &lt; 90，触发警告。</span></div>'
            % (len(warn_cities), nm(warn_cities), warn_detail))
    if fine_cities:
        items.append('<div class="risk-item risk-item-fine"><span class="risk-tag risk-tag-fine">💰 罚款风险（%d城）</span>'
            '<span class="risk-text"><strong>%s：</strong>不能减免，过程指标(货盘+覆盖)预估&lt;45分，触发罚款。</span></div>'
            % (len(fine_cities), nm(fine_cities)))
    if good_cities:
        items.append('<div class="risk-item risk-item-normal"><span class="risk-tag risk-tag-normal">✅ 表现优秀（%d城）</span>'
            '<span class="risk-text"><strong>%s：</strong>预估总得分≥90 或 可减免，不触发警告/罚款。</span></div>'
            % (len(good_cities), nm(good_cities)))
    return '<div class="kpi-section"><div class="ui-analysis"><h3>📋 结果分析</h3>' + ''.join(items) + '</div></div>'

# ============================================================
# 组装
# ============================================================
TEMPLATE = '''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>商品运营分析报告</title>
<style>
* { margin:0; padding:0; box-sizing:border-box; }
body { font-family:'Microsoft YaHei',Arial,sans-serif; background:linear-gradient(135deg,#667eea,#764ba2); padding:20px; min-height:100vh; }
.container { max-width:1600px; margin:0 auto; background:white; border-radius:15px; box-shadow:0 20px 60px rgba(0,0,0,.3); overflow:hidden; }
.header { background:linear-gradient(135deg,#667eea,#764ba2); color:white; padding:30px; text-align:center; }
.header h1 { font-size:32px; margin-bottom:10px; }
.header .subtitle { font-size:16px; opacity:.9; }
.main-tabs { display:flex; background:linear-gradient(135deg, rgba(102,126,234,0.08), rgba(118,75,162,0.08)); border-bottom:2px solid rgba(102,126,234,0.2); gap:8px; padding:8px 20px 0; }
.main-tab-btn { flex:1; padding:16px 24px; border:none; background:rgba(255,255,255,0.6); font-size:16px; cursor:pointer; transition:all .3s ease; border-radius:12px 12px 0 0; color:#555; font-weight:500; margin-bottom:-2px; }
.main-tab-btn:hover { background:rgba(255,255,255,0.9); color:#667eea; transform:translateY(-2px); }
.main-tab-btn.active { background:linear-gradient(135deg,#667eea,#764ba2); color:white; font-weight:bold; box-shadow:0 4px 15px rgba(102,126,234,0.4); }
.tab-content { display:none; }
.tab-content.active { display:block; }
.tab-content > div:first-child { border-top: none; }
.time-progress { background:#f8f9fa; padding:16px 20px 24px; }
.time-progress h3 { font-size:16px; font-weight:700; color:#333; margin-bottom:12px; display:flex; align-items:center; gap:8px; }
.progress-bar-container { margin-top:10px; }
.progress-label { display:flex; justify-content:space-between; margin-bottom:5px; font-size:14px; color:#666; }
.progress-bar { width:100%; height:30px; background:#e0e0e0; border-radius:15px; overflow:hidden; }
.progress-fill { height:100%; background:linear-gradient(90deg,#667eea,#764ba2); display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; font-size:14px; }
.kpi-district-card { transition:transform .3s ease, box-shadow .3s ease; cursor:default; }
.kpi-district-card:hover { transform:translateY(-6px); box-shadow:0 12px 28px rgba(0,0,0,.15); }
.rank-grid { border-collapse:collapse; }
.rank-grid th, .rank-grid td { border:1px solid #e6e6e6; }
.rank-grid thead th { border-color:rgba(255,255,255,0.35); font-size:13px; }
.rank-grid td { font-size:13.5px; }
.rank-grid tbody tr:first-child td { border-color:#ffcc80; }
.kpi-table { width:100%; border-collapse:separate; border-spacing:0; font-size:14px; min-width:1300px; background:#fff; }
.kpi-table thead { position:sticky; top:0; z-index:20; }
.kpi-table th { padding:14px 10px; text-align:center; font-size:13px; font-weight:600; color:#fff; border-right:1px solid rgba(255,255,255,.25); letter-spacing:.3px; }
.kpi-table th:last-child { border-right:none; }
.kpi-table td { padding:12px 10px; text-align:center; border-bottom:1px solid #f0f0f0; border-right:1px solid #f0f0f0; font-size:13px; color:#444; line-height:1.5; }
.kpi-table td:last-child { border-right:none; }
.kpi-table thead tr:last-child th { border-bottom:2.5px solid rgba(0,0,0,.2); }
.kpi-table tbody tr { transition:background .2s; }
.kpi-table tbody tr:hover { background:#f0f4ff; }
.kpi-table tbody tr:nth-child(even) { background:#fafbff; }
.kpi-table tbody tr:nth-child(even):hover { background:#f0f4ff; }
.th-group-1, .th-sub-1 { background:#5c6bc0; color:#fff; }
.th-group-2, .th-sub-2 { background:#7e57c2; color:#fff; }
.th-group-3, .th-sub-3 { background:#42a5f5; color:#fff; }
.th-group-4, .th-sub-4 { background:#ff7043; color:#fff; }
.th-group-5, .th-sub-5 { background:#66bb6a; color:#fff; }
td.col-est-phf, td.col-est-hp, td.col-est-cov, td.col-est-total { font-style:italic; font-weight:700; }
.table-wrapper { margin:0 20px 20px; overflow-x:auto; border-radius:12px; box-shadow:0 4px 20px rgba(0,0,0,.08); background:white; }
.summary-cards { display:grid; grid-template-columns:repeat(3, 1fr); gap:18px; margin:0 20px 20px; }
.summary-card { border-radius:14px; padding:20px 18px; color:white; box-shadow:0 6px 20px rgba(0,0,0,.12); transition:all .3s ease; text-align:center; }
.summary-card:hover { transform:translateY(-3px); box-shadow:0 10px 30px rgba(0,0,0,.2); }
.card-warn { background:linear-gradient(135deg, #e57373, #ef5350); }
.card-fine { background:linear-gradient(135deg, #ffb74d, #ffa726); }
.card-good { background:linear-gradient(135deg, #81c784, #66bb6a); }
.card-icon { font-size:28px; margin-bottom:10px; }
.card-label { font-size:14px; opacity:.95; margin-bottom:10px; font-weight:500; }
.card-value { font-size:44px; font-weight:bold; }
.card-sub { font-size:13px; opacity:.9; margin-top:10px; }
.risk-item { display:flex; align-items:flex-start; gap:12px; margin:12px 20px; padding:12px 15px; border-radius:8px; background:#fafafa; border-left:3px solid transparent; }
.risk-item-warn { background:#ffebee; border-left-color:#f44336; }
.risk-item-fine { background:#fff8e1; border-left-color:#ff9800; }
.risk-item-normal { background:#e8f5e9; border-left-color:#4caf50; }
.risk-tag { display:inline-block; padding:4px 12px; border-radius:4px; font-size:13px; font-weight:600; white-space:nowrap; }
.risk-tag-warn { background:#ffebee; color:#f44336; border:1px solid #f44336; }
.risk-tag-fine { background:#fff3e0; color:#ff9800; border:1px solid #ff9800; }
.risk-tag-both { background:#ffebee; color:#c62828; border:1px solid #f44336; }
.risk-tag-normal { background:#e8f5e9; color:#4caf50; }
.risk-text { flex:1; color:#555; line-height:1.6; font-size:14px; }
.note-box { margin:10px 20px 24px; padding:12px 16px; background:#f8f9fa; border-radius:8px; font-size:13px; color:#666; line-height:1.8; }
.col-info { background:#f4f5fb; }
.kpi-section { padding:0; }
.ui-analysis { background:#f8f9fa; border-radius:8px; padding:15px 20px; margin:0 0 20px; }
.ui-analysis h3 { font-size:16px; font-weight:700; color:#333; margin-bottom:12px; display:flex; align-items:center; gap:8px; }
.block-title { font-size:16px; font-weight:700; color:#333; margin-bottom:16px; display:flex; align-items:center; gap:8px; }
.block-title .badge { font-size:12px; font-weight:400; color:#999; margin-left:auto; }
</style>
</head>
<body>
<div class="container">
<div class="header">
    <h1>📊 商品运营分析报告</h1>
    <div class="subtitle">数据周期：__SUBTITLE__</div>
</div>
<div class="main-tabs">
    <button class="main-tab-btn active" onclick="showMainTab('tab1', this)">📊 分区进度</button>
    <button class="main-tab-btn" onclick="showMainTab('tab2', this)">🏪 玉林商进度</button>
</div>
<div id="tab1" class="tab-content active">
    __TIME__
    __KPI__
    __RANK__
</div>
<div id="tab2" class="tab-content">
    <div style="padding:16px 20px 0;">
        <div class="block-title"><span>⚠️</span><span>风险预估</span><span class="badge">结果指标 + 过程指标综合评估</span></div>
    </div>
    __RISKCARDS__
    __RISKANA__
    __KTABLE__
</div>
<script>
function showMainTab(tabId, btn) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    document.querySelectorAll('.main-tab-btn').forEach(el => el.classList.remove('active'));
    btn.classList.add('active');
}
</script>
</div>
</body>
</html>'''

def build_time_block(Y, M, D, time_progress, days_in_month):
    return ('''<div class="time-progress">
  <h3><span>⏰</span><span>T-1 时间进度（%02d月%02d日）</span></h3>
  <div class="progress-bar-container">
    <div class="progress-label"><span>时间进度</span><span>%.2f%% (%d/%d)</span></div>
    <div class="progress-bar"><div class="progress-fill" style="width:%.2f%%">%.2f%%</div></div>
  </div>
</div>''' % (M, D, time_progress, D, days_in_month, time_progress, time_progress))

def main():
    print('🔄 生成商品运营分析报告...')
    res = load_result_metrics()
    proc = load_process_metrics()
    cov = load_coverage(res['data_day_str'])
    print('  📊 广西区域拼好饭: %.2f%% | 经理数: %d | 城市数: %d'
          % (res['gx_phf'], len(res['managers']), len(res['cities'])))

    time_block = build_time_block(res['Y'], res['M'], res['D'], res['time_progress'], res['days_in_month'])
    date_label = '%02d月%02d日' % (res['M'], res['D'])
    subtitle = '%04d-%02d-%02d' % (res['Y'], res['M'], res['D'])
    ranking_block = build_ranking_table(res['gx_phf'], proc['gx_hp'], res['managers'], proc['mgr_hp'], cov['mgr'], cov['gx_cov'])
    kpi_cards_html = build_kpi_cards(res['gx_phf'], proc['gx_hp'], res['managers'], proc['mgr_hp'], cov['mgr'], cov['gx_cov'], date_label)
    kpi_table_html, risk_cards, risk_analysis = build_city_table_and_risk(res['time_progress'], res['cities'], proc['city_hp'], cov['city'])

    out = (TEMPLATE
           .replace('__SUBTITLE__', subtitle)
           .replace('__TIME__', time_block)
           .replace('__KPI__', kpi_cards_html)
           .replace('__RANK__', ranking_block)
           .replace('__RISKCARDS__', risk_cards)
           .replace('__RISKANA__', risk_analysis)
           .replace('__KTABLE__', kpi_table_html))

    out_index = os.path.join(OUT_DIR, 'index.html')
    out_latest = os.path.join(OUT_DIR, 'latest.html')
    out_dated = os.path.join(OUT_DIR, '商品运营分析报告-%s.html' % res['data_day_str'])
    with open(out_index, 'w', encoding='utf-8') as f:
        f.write(out)
    with open(out_latest, 'w', encoding='utf-8') as f:
        f.write(out)
    with open(out_dated, 'w', encoding='utf-8') as f:
        f.write(out)
    print('✅ 已生成:')
    print('   ', out_index)
    print('   ', out_latest)
    print('   ', out_dated)
    print('   文件大小: %d 字节' % len(out))

if __name__ == '__main__':
    main()
