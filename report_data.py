# -*- coding: utf-8 -*-
"""
商品运营分析报告 —— 数据层
================================================================
三个数据源：
  A结果指标      E:\\总商维度数据\\1结果指标\\⑥【商品绩效】-拼好饭+神枪手*.xlsx
  B 过程指标货盘 E:\\总商维度数据\\2过程指标\\每日明细\\下沉神抢手_货盘明细_*-去重.xlsx
  C 过程指标结算价下探 E:\\总商维度数据\\2过程指标\\结算价下探\\下沉拼好饭货盘_*结算价做功商品池明细_*.xlsx

输出 public/data.js（window.REPORT_DATA），供 GitHub Pages 前端消费。
"""
import os, re, json, glob, datetime, statistics
from collections import OrderedDict, defaultdict
import openpyxl

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT_DIR = ROOT
os.makedirs(OUT_DIR, exist_ok=True)

# ------------------------------------------------------------------ 数据源定位
SRC_RESULT_DIR = r'E:\总商维度数据\1结果指标'
SRC_HP_DIR      = r'E:\总商维度数据\2过程指标\每日明细'
SRC_P3_DIR      = r'E:\总商维度数据\2过程指标\结算价下探'


def latest(pattern, d):
    """取目录下匹配 pattern 的最新文件（按文件名内数字最大）"""
    fs = [f for f in os.listdir(d) if re.match(pattern, f) and f.endswith('.xlsx')
          and not f.startswith('~$')]
    if not fs:
        raise FileNotFoundError(f'{d} 下无匹配 {pattern} 的文件')

    def key(f):
        nums = re.findall(r'\d{4,}', f)
        return (nums[-1] if nums else '', f)
    return os.path.join(d, sorted(fs, key=key)[-1])


SRC_S1 = latest(r'.*【商品绩效】.*\.xlsx', SRC_RESULT_DIR)
SRC_HP = latest(r'.*货盘明细.*去重\.xlsx', SRC_HP_DIR)

CITIES = ['玉林市', '钦州市', '梧州市', '岑溪', '博白县', '田东县', '东兰县', '凤山县']
NO_SQS = {'东兰县', '凤山县'}
MONTH_DAYS = 31
P3_START, P3_END = datetime.date(2026, 10, 8), datetime.date(2026, 10, 31)

W = {c: {'S1': 40, 'SQS': 0 if c in NO_SQS else 30,
         'PHF': 35 if c in NO_SQS else 20,
         'P3': 25 if c in NO_SQS else 10} for c in CITIES}

S1_COEF = [(0.80, 1.0), (0.0, 0.0)]
HP_COEF = [(0.70, 1.2), (0.60, 0.8), (0.0, 0.0)]
P3_COEF = [(0.60, 1.2), (0.50, 1.0), (0.30, 0.8), (0.0, 0.0)]
FINELINE = 54          # 过程指标罚款线（满分60的 90%）
BLUELINE = 36          # 60% 免罚线


def coef(rate, table):
    if rate is None:
        return None
    for lo, k in table:
        if rate >= lo:
            return k
    return table[-1][1]


def _to_date(v):
    s = str(int(v)) if isinstance(v, (int, float)) and not isinstance(v, bool) else str(v or '')
    s = ''.join(ch for ch in s if ch.isdigit())
    if len(s) != 8:
        return None
    try:
        return datetime.date(int(s[:4]), int(s[4:6]), int(s[6:8]))
    except ValueError:
        return None


def _num(v):
    """安全转float，剔除 #VALUE! / #REF! / #DIV/0! 等错误值与千分位"""
    if v is None or isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).replace(',', '').strip()
    if not s or s.startswith('#') or s in ('-', '\\', 'NULL', 'None'):
        return None
    try:
        return float(s)
    except ValueError:
        return None


# ================================================================ A. 结果指标 S1
def read_s1():
    """拼好饭-底表：MTD订单量(14) / 月订单量目标(13) / 城市等级(7) / 渠道经理(11)
    同时取：有效商家完成率(32)、新客完成率(37)、社群人数完成率(43)、
           拼单率(51)、单均实付(57)、渗透率(21)、PHF订单占比(46)"""
    wb = openpyxl.load_workbook(SRC_S1, read_only=True, data_only=True)
    ws = wb['拼好饭-底表']
    it = ws.iter_rows(values_only=True)
    for _ in range(3):
        next(it)

    trend = OrderedDict()
    meta = defaultdict(dict)
    for r in it:
        if r[0] is None:
            continue
        d = _to_date(r[0])
        if d is None or d.year != 2026 or d.month != 10:
            continue
        city = r[6]
        if city is None:
            continue
        trend.setdefault(d, {})[city] = r[14]
        meta[d][city] = dict(
            grade=r[7], mgr=r[11], tgt=_num(r[13]), cur=_num(r[14]),
            rate=_num(r[15]),
            shop_rate=_num(r[32]), newcust_rate=_num(r[37]),
            group_rate=_num(r[43]), groupon_rate=_num(r[51]),
            pay_avg=_num(r[57]),渗透=_num(r[21]),
            phf_share=_num(r[46]), day_order=_num(r[17]),
            day_lw=_num(r[19]),
        )
    wb.close()

    dates = sorted(trend)
    if not dates:
        raise RuntimeError('拼好饭-底表未取到 10 月数据')
    last = dates[-1]
    return dict(dates=dates, trend=trend, meta=meta, last=last,
                cur={c: trend[last].get(c) for c in CITIES},
                grade=meta[last],
                target={c: meta[last][c]['tgt'] for c in CITIES})


def project_s1(d, win=5, cap=1.35):
    """S1 月末预估：近 win 个观测日的日均增量（按真实间隔折算）线性外推，完成率封顶 cap"""
    trend, dates = d['trend'], d['dates']
    last_i = len(dates) - 1
    remain = MONTH_DAYS - last_i

    inc = [None] * len(dates)
    for i in range(1, len(dates)):
        gap = (dates[i] - dates[i - 1]).days
        vs = []
        for c in CITIES:
            a, b = trend[dates[i - 1]].get(c), trend[dates[i]].get(c)
            vs.append(None if (a is None or b is None) else (b - a) / gap)
        if all(x is not None for x in vs):
            inc[i] = statistics.mean(vs)

    out = {}
    for c in CITIES:
        v = [trend[dt].get(c) for dt in dates]
        tgt = d['target'][c]
        if any(x is None for x in v) or not tgt:
            out[c] = v[-1] if v[-1] is not None else 0
            continue
        base = [inc[i] for i in range(max(1, last_i + 1 - win), last_i + 1)
                if inc[i] is not None]
        if not base:
            base = [inc[i] for i in range(1, last_i + 1) if inc[i] is not None]
        pred = v[-1] + remain * (statistics.mean(base) if base else 0)
        out[c] = min(pred, tgt * cap)
    return out


# ================================================================ B. 过程指标 货盘
def read_hp():
    """货盘明细：按来源拆神抢手/拼好饭，统计目标池/达标/攻克 + 订单金额
    返回 (city_stats, city_src_stats, sku_rows)"""
    wb = openpyxl.load_workbook(SRC_HP, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    it = ws.iter_rows(values_only=True)
    hdr = next(it)
    idx = {str(h).lstrip('\ufeff'): i for i, h in enumerate(hdr)}

    stat = {c: {'SQS': {'pool': 0, 'ok': 0, 'kg': 0, 'ord': 0.0, 'amt': 0.0, 'shop': set()},
                'PHF': {'pool': 0, 'ok': 0, 'kg': 0, 'ord': 0.0, 'amt': 0.0, 'shop': set()}}
           for c in CITIES}
    src_stat = defaultdict(lambda: {'pool': 0, 'ok': 0})
    shop_stat = defaultdict(lambda: {'pool': 0, 'ok': 0, 'ord': 0.0, 'amt': 0.0})

    for r in it:
        if r[0] is None:
            continue
        city = r[idx['城市']]
        if city not in CITIES:
            continue
        src = str(r[idx['来源']] or '')
        ok = (str(r[idx['达标情况']]).strip() == '达标')
        kg = (str(r[idx['攻克情况']]).strip() == '攻克')
        key = 'SQS' if src.startswith('神抢手') else ('PHF' if src.startswith('拼好饭') else None)
        if key is None:
            continue

        d = stat[city][key]
        d['pool'] += 1
        d['ok'] += ok
        d['kg'] += kg
        d['shop'].add(r[idx['商家ID']])
        if key == 'SQS':
            d['ord'] += _num(r[idx['SQS订单数']]) or 0
            d['amt'] += _num(r[idx['SQS实付金额']]) or 0
        else:
            d['ord'] += _num(r[idx['拼好饭订单数']]) or 0
            d['amt'] += _num(r[idx['拼好饭实付金额']]) or 0

        src_stat[(city, src)]['pool'] += 1
        src_stat[(city, src)]['ok'] += ok

        mid = r[idx['商家ID']]
        name = r[idx['商家名称']]
        ss = shop_stat[(city, key, mid, name, r[idx['BD MIS ID']])]
        ss['pool'] += 1
        ss['ok'] += ok
        ss['ord'] += (_num(r[idx['SQS订单数']]) or 0) if key == 'SQS' else (_num(r[idx['拼好饭订单数']]) or 0)
        ss['amt'] += (_num(r[idx['SQS实付金额']]) or 0) if key == 'SQS' else (_num(r[idx['拼好饭实付金额']]) or 0)

    wb.close()

    # 汇总为可序列化结构
    city_src = {}
    for c in CITIES:
        e = {}
        for key in ('SQS', 'PHF'):
            d = stat[c][key]
            e[key] = dict(pool=d['pool'], ok=d['ok'], kg=d['kg'], ord=round(d['ord']),
                          amt=round(d['amt']), shop=len(d['shop']),
                          rate=(d['ok'] / d['pool']) if d['pool'] else None,
                          kgr=(d['kg'] / d['pool']) if d['pool'] else None)
        tp, to = e['SQS']['pool'] + e['PHF']['pool'], e['SQS']['ok'] + e['PHF']['ok']
        tk, ts = e['SQS']['kg'] + e['PHF']['kg'], e['SQS']['shop'] and 0
        e['ALL'] = dict(pool=tp, ok=to, kg=tk,
                        rate=(to / tp) if tp else None,
                        kgr=(tk / tp) if tp else None,
                        ord=e['SQS']['ord'] + e['PHF']['ord'],
                        amt=e['SQS']['amt'] + e['PHF']['amt'])
        e['shop_all'] = len(stat[c]['SQS']['shop'] | stat[c]['PHF']['shop'])
        city_src[c] = e

    # 商家明细（按城市+业务，订单量降序）
    shops = defaultdict(list)
    for (city, key, mid, name, bd), ss in shop_stat.items():
        if city not in CITIES:
            continue
        shops[(city, key)].append(dict(
            mid=str(mid), name=name, bd=bd,
            pool=ss['pool'], ok=ss['ok'], rate=(ss['ok'] / ss['pool'] if ss['pool'] else 0),
            ord=round(ss['ord']), amt=round(ss['amt'])))
    for k in shops:
        shops[k].sort(key=lambda x: (-x['ord'], -x['amt']))
    shop_rows = {f'{c}|{k}': shops[(c, k)] for (c, k) in shops}

    # 来源细分（5类）
    src_break = {}
    for c in CITIES:
        src_break[c] = {s: dict(pool=v['pool'], ok=v['ok'],
                                rate=(v['ok'] / v['pool'] if v['pool'] else None))
                        for (cc, s), v in src_stat.items() if cc == c}

    return city_src, shop_rows, src_break


# ================================================================ C. 过程指标 结算价下探
def read_p3():
    """结算价下探日文件：逐日城市级 SKU 达标率 + 基线SKU数 + 商家数
    仅当某日达标列存在非零值时视为已回填；未发生日期取最新已发生日外推。"""
    files = sorted(f for f in os.listdir(SRC_P3_DIR)
                   if '结算价做功商品池明细' in f and f.endswith('.xlsx')
                   and not f.startswith('~$'))
    daily, meta = {}, {}
    for fn in files:
        wb = openpyxl.load_workbook(os.path.join(SRC_P3_DIR, fn),
                                    read_only=True, data_only=True)
        ws = wb[wb.sheetnames[0]]
        it = ws.iter_rows(values_only=True)
        hdr = next(it)
        idx = {str(h).lstrip('\ufeff'): i for i, h in enumerate(hdr)}
        need = ['日期', '城市', 'SKU是否达标', '做功场景']
        if any(k not in idx for k in need):
            wb.close()
            continue
        st = defaultdict(lambda: [0, 0, set(), set(), defaultdict(int)])
        day = None
        for r in it:
            if r[0] is None:
                continue
            d = _to_date(r[0])
            day = day or d
            city = r[idx['城市']]
            if city not in CITIES:
                continue
            e = st[city]
            e[0] += 1
            e[1] += (str(r[idx['SKU是否达标']]).strip() == '1')
            e[2].add(r[idx['SKU ID']])
            e[3].add(r[idx['商家ID']])
            e[4][str(r[idx['做功场景']] or '未知')] += 1
        wb.close()
        if not st or sum(v[1] for v in st.values()) == 0:
            continue
        daily[day] = {c: (st[c][1] / st[c][0] if st[c][0] else None) for c in CITIES}
        meta[day] = {c: dict(pool=st[c][0], ok=st[c][1], sku=len(st[c][2]),
                             shop=len(st[c][3]),
                             scene=dict(st[c][4])) for c in CITIES}
    if not daily:
        raise RuntimeError('结算价下探：所有日文件达标列均未回填')
    return dict(daily=daily, meta=meta, last=max(daily), first=min(daily),
                files=len(files))


def p3_series(p3):
    """10/8-10/31 每日序列（未发生日取最新已发生日外推）+ 日均覆盖率"""
    daily, last = p3['daily'], p3['last']
    days, out = [], {c: [] for c in CITIES}
    d = P3_START
    while d <= P3_END:
        src = daily[d] if d in daily else daily[last]
        days.append(d.strftime('%m-%d'))
        for c in CITIES:
            out[c].append(src.get(c))
        d += datetime.timedelta(days=1)
    avg = {}
    for c in CITIES:
        v = [x for x in out[c] if x is not None]
        avg[c] = sum(v) / len(v) if v else None
    return days, out, avg


# ================================================================ 组装
def build():
    s1 = read_s1()
    city_hp, shops, srcs = read_hp()
    p3 = read_p3()
    p3_days, p3_ser, p3_avg = p3_series(p3)
    proj = project_s1(s1)
    last_d = s1['last']

    rows = []
    for c in CITIES:
        m = s1['meta'][last_d].get(c, {})
        cur, tgt = s1['cur'].get(c), s1['target'].get(c)
        rate = (cur / tgt) if (cur and tgt) else None
        k1 = coef(rate, S1_COEF)
        s1_score = min(rate, 1.2) * k1 * W[c]['S1'] if rate else 0

        hp = city_hp[c]
        if c in NO_SQS or not hp['SQS']['pool']:
            sq_rate = sq_k = sq_score = None
        else:
            sq_rate = hp['SQS']['rate']
            sq_k = coef(sq_rate, HP_COEF)
            sq_score = sq_rate * sq_k * W[c]['SQS']

        ph_rate, ph_k = hp['PHF']['rate'], coef(hp['PHF']['rate'], HP_COEF)
        ph_score = ph_rate * ph_k * W[c]['PHF'] if ph_rate is not None else 0

        p3r = p3_avg[c]
        p3_k = coef(p3r, P3_COEF)
        p3_score = (p3r or 0) * p3_k * W[c]['P3']

        proc = (sq_score or 0) + ph_score + p3_score
        pw = W[c]['SQS'] + W[c]['PHF'] + W[c]['P3']

        # 月末预估
        pt, prate = proj[c], (proj[c] / tgt if tgt else None)
        pk = coef(prate, S1_COEF)
        ps = min(prate, 1.2) * pk * W[c]['S1'] if prate else 0
        if c in NO_SQS:
            esq = None
        else:
            pool, ok = hp['SQS']['pool'], hp['SQS']['ok'] + (hp['SQS']['pool'] - hp['SQS']['ok']) * 0.10
            r2 = ok / pool if pool else None
            k2 = coef(r2, HP_COEF)
            esq = dict(pool=pool, ok=round(ok), rate=r2, k=k2,
                       score=(r2 * k2 * W[c]['SQS']) if r2 else 0)
        est = (esq['score'] if esq else 0) + ph_score + p3_score

        rows.append(dict(
            city=c, grade=m.get('grade'), mgr=m.get('mgr'),
            tgt=tgt, cur=cur, rate=rate, s1_k=k1, s1_score=s1_score,
            proj=pt, proj_rate=prate, proj_score=ps,
            shop_rate=m.get('shop_rate'), newcust_rate=m.get('newcust_rate'),
            group_rate=m.get('group_rate'), groupon_rate=m.get('groupon_rate'),
            pay_avg=m.get('pay_avg'), pen_rate=m.get('渗透'),
            phf_share=m.get('phf_share'),
            hp=hp, sq_rate=sq_rate, sq_k=sq_k, sq_score=sq_score,
            ph_rate=ph_rate, ph_k=ph_k, ph_score=ph_score,
            p3_rate=p3r, p3_k=p3_k, p3_score=p3_score,
            p3_meta=p3['meta'][p3['last']].get(c, {}),
            proc=proc, proc_w=pw, proc_pct=(proc / pw if pw else None),
            est_proc=est, est_pct=(est / pw if pw else None),
            est_sq=esq,
        ))

    # ---- S1 趋势序列（每城 MTD + 完成率）
    s1_trend = []
    for dt in s1['dates']:
        pt = dict(d=dt.strftime('%m-%d'))
        for c in CITIES:
            v = s1['trend'][dt].get(c)
            pt[c] = v
        s1_trend.append(pt)

    # ---- S1 5日单日订单序列（高优池看板 16-20 列）
    s1_daily = read_board_daily()

    out = dict(
        meta=dict(
            generated=datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
            data_date=last_d.strftime('%Y-%m-%d'),
            p3_last=p3['last'].strftime('%Y-%m-%d'),
            p3_days=len(p3['daily']),
            p3_first=p3['first'].strftime('%Y-%m-%d'),
            month_days=MONTH_DAYS,
            time_pct=round(last_d.day / MONTH_DAYS, 4),
            fineline=FINELINE, blueline=BLUELINE,
            cities=CITIES, no_sqs=sorted(NO_SQS),
            weights=W,
            src_result=os.path.basename(SRC_S1),
            src_hp=os.path.basename(SRC_HP),
            src_p3_dir=os.path.basename(SRC_P3_DIR),
        ),
        rows=rows,
        s1_trend=s1_trend,
        s1_daily=s1_daily,
        p3_days=p3_days,
        p3_series=p3_ser,
        p3_avg=p3_avg,
        shops=shops,
        src_break=srcs,
    )
    return out


def read_board_daily():
    """高优池看板：8城最近 5 个单日分天完成率（列16-20）"""
    wb = openpyxl.load_workbook(SRC_S1, read_only=True, data_only=True)
    if '高优池看板' not in wb.sheetnames:
        wb.close()
        return {}
    ws = wb['高优池看板']
    rows = list(ws.iter_rows(min_row=1, max_row=200, values_only=True))
    wb.close()
    hdr = rows[5]
    dates = [str(hdr[j]) for j in range(16, 21)]
    days = [f"{d[4:6]}-{d[6:8]}" for d in dates if d and d.isdigit()]
    out = {c: [] for c in CITIES}
    for r in rows:
        c2 = str(r[2]) if len(r) > 2 else ''
        if c2 in CITIES:
            out[c2] = [_num(r[j]) for j in range(16, 21)]
    return dict(days=days, series=out)


# ================================================================ 导出
def to_js(d):
    p = os.path.join(OUT_DIR, 'data.js')
    with open(p, 'w', encoding='utf-8') as f:
        f.write('window.REPORT_DATA = ')
        json.dump(d, f, ensure_ascii=False, separators=(',', ':'), default=str)
        f.write(';\n')
    # latest.html 与 index.html 同内容（沿用仓库既有约定，供旧链接与本地双击访问）
    # newline='' 防止 Windows 下把 LF 改写成 CRLF，确保与 index.html 字节一致
    idx = os.path.join(OUT_DIR, 'index.html')
    if os.path.exists(idx):
        with open(idx, encoding='utf-8', newline='') as f:
            html = f.read()
        with open(os.path.join(OUT_DIR, 'latest.html'), 'w',
                  encoding='utf-8', newline='') as f:
            f.write(html)
    return p, os.path.getsize(p)


if __name__ == '__main__':
    d = build()
    p, size = to_js(d)
    print('数据源 S1 :', os.path.basename(SRC_S1))
    print('数据源 货盘:', os.path.basename(SRC_HP))
    print('数据源 P3  :', d['meta']['src_p3_dir'], f"（有效{d['meta']['p3_days']}天）")
    print('数据截至:', d['meta']['data_date'])
    print()
    print(f"{'城市':<7}{'等级':<5}{'S1完成率':>10}{'SQS达标':>10}{'PHF达标':>10}"
          f"{'P3日均':>9}{'过程分':>8}{'完成率':>8}{'预估过程':>9}")
    for r in d['rows']:
        f = lambda v: f'{v*100:.2f}%' if v is not None else '—'
        print(f"{r['city']:<7}{str(r['grade']):<5}{f(r['rate']):>10}"
              f"{f(r['sq_rate']):>10}{f(r['ph_rate']):>10}{f(r['p3_rate']):>9}"
              f"{r['proc']:>8.2f}{f(r['proc_pct']):>8}{r['est_proc']:>9.2f}")
    print()
    print('data.js 已写出:', p, f'({size/1024:.0f} KB)')