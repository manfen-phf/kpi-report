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
SRC_TARGET_DIR  = r'E:\总商维度数据\考核目标'      # 官方考核目标（权威目标值）


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

# ---------------------------------------------------------------- 负向权益
# 来源：2026年10月城市外卖绩效考核方案-考核框架和关联权益（学城）
#注1：拼好饭&神抢手过程模块完成率 = 过程指标合计得分 /（过程指标合计权重*100）
#   拼好饭&神抢手结果模块完成率 = 结果指标合计得分 /（结果指标合计权重*100）
# 注2：涉及具体指标得分计算规则参考「拼好饭&神抢手业务考核方案」
WARN_LINE = 90.0# 模块绩效得分 < 90 分 → 触发 1 个警告
FINE_RATE = 0.90       # 过程模块完成率 < 90% → 触发对应城市等级罚款
RELIEF_RESULT = 1.05   # 罚款减免：结果模块完成率 ≥105%
RELIEF_PROC = 0.60     # 罚款减免：过程模块完成率 ≥60%
EXEMPT_SCORE = 105.0   # 警告豁免：模块月均绩效得分 ≥105 分
EXEMPT_TOP_PCT = 0.05  # 警告豁免：季度内该模块月均得分位于同等级城市前 5%

# 拼好饭&神抢手过程模块罚款（按城市等级，单位：元）
FINE_BY_TIER = {
    'E0': 15000, 'E1': 15000, 'E2': 12000, 'E3': 12000,
    'F1': 8000, 'F2': 8000, 'F3': 8000,
    'G1': 4000, 'G2': 4000,
    # G3 未列示→ 不触发罚款（保守处理，见README 说明）
    'G3': 0,
}
MAX_WARN_TOTAL = 4     # 各业务模块间处罚累加，城市最多触发 4 个警告

# ---------------------------------------------------------------- 预估口径（月末预判）
#① S1：星期对星期外推 —— 月末 = 实际累计 + 剩余每天按同星期当日单量推算（缺样本按当月日均兜底）
#   → 见 project_s1()
# ② 神抢手：预估达标率 = 当前上线率 − 10pp（按上线商品的达成折损估计，向下折损）
EST_SQS_DROP = 0.10
# ③ 拼好饭：预估达标率 = 当前累计达标率（不外推）
# ④ P3：月度日均覆盖率 = [已观测各日之和 + 剩余天数 × 最新一日当日覆盖率] ÷ 24 天
#   → 见 p3_series()


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


# ================================================================ 官方考核目标
# 来源：E:\总商维度数据\考核目标\10月拼好饭神抢手绩效考核方案、目标.xlsx（sheet '0'）
#列：7=结果指标目标(S1 PHF订单) / 11=过程1目标(神抢手货盘) / 14=过程2目标(拼好饭货盘) / 17=过程3目标(P3覆盖)
# 权重：5=结果40% / 9,12,15=过程三项权重（东兰凤山神抢手为空→权重转移）
def read_targets():
    path = latest(r'.*拼好饭神抢手绩效考核方案.*\.xlsx', SRC_TARGET_DIR)
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    rows = list(ws.iter_rows(values_only=True))
    wb.close()

    out = {}
    for r in rows[1:]:
        if not r[1]:
            continue
        city = str(r[1]).strip()
        out[city] = dict(
            node_id=r[0],
            scheme=r[4],
            w_s1=_num(r[5]) / 100 if _num(r[5]) else None,
            label_s1=r[6], tgt_s1=_num(r[7]),
            w_sqs=_num(r[9]) / 100 if _num(r[9]) else None,
            label_sqs=r[10], tgt_sqs=_num(r[11]),
            w_phf=_num(r[12]) / 100 if _num(r[12]) else None,
            label_phf=r[13], tgt_phf=_num(r[14]),
            w_p3=_num(r[15]) / 100 if _num(r[15]) else None,
            label_p3=r[16], tgt_p3=_num(r[17]),
        )
    if not out:
        raise RuntimeError('考核目标表未取到城市数据')
    return out, os.path.basename(path)


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
    # 分区维度（渠道经理 col11）：最新日的目标/完成，用于「分区进度」板块
    dist_all = defaultdict(lambda: defaultdict(lambda: [0.0, 0.0]))
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
        # 同一次遍历里按日期累计分区目标/完成（避免二次打开大文件）
        q = r[11]
        tgt0, cur0 = _num(r[13]), _num(r[14])
        if q is not None and tgt0 is not None and cur0 is not None:
            de = dist_all[d][str(q)]
            de[0] += tgt0
            de[1] += cur0
    wb.close()

    dates = sorted(trend)
    if not dates:
        raise RuntimeError('拼好饭-底表未取到 10 月数据')
    last = dates[-1]

    dist = dist_all.get(last, {})

    return dict(dates=dates, trend=trend, meta=meta, last=last,
                cur={c: trend[last].get(c) for c in CITIES},
                grade=meta[last],
                target={c: meta[last][c]['tgt'] for c in CITIES},
                dist={k: dict(tgt=v[0], cur=v[1],
                              rate=(v[1] / v[0]) if v[0] else None)
                      for k, v in dist.items()})


def project_s1(d):
    """S1 月末预估 —— 近 7 天每日完成量 + 星期对星期外推

    数据源：⑥【商品绩效】-拼好饭+神枪手 ·「拼好饭-底表」O 列 MTD 订单量
    （玉林商对应 8 个城市，见read_s1() 的 trend）

    算法：
      1) 由 MTD 差分还原逐日完成量（底表可能缺日，按真实间隔天数折算）
      2) 仅取**近 7 天**窗口作为同星期样本池
      3) 月末预估 = 实际累计(截至数据日) + Σ剩余每一天的预估单量
         预估单量优先取窗口内「同星期几」样本均值；该星期几无样本时按近7 天日均兜底
    """
    trend, dates = d['trend'], d['dates']
    last = dates[-1]
    # ★ 剩余天数 = 月总天数 − 数据日的**日号**（不是观测日个数）
    remain = MONTH_DAYS - last.day
    if remain <= 0:
        return {c: (trend[last].get(c) or 0) for c in CITIES}

    # ---- 逐日单量（按真实间隔折算，修正底表缺日造成的跨天跳变）
    daily = {}          # date -> {city: 单量}
    for i in range(1, len(dates)):
        gap = (dates[i] - dates[i - 1]).days
        row = {}
        for c in CITIES:
            a, b = trend[dates[i - 1]].get(c), trend[dates[i]].get(c)
            if a is not None and b is not None:
                row[c] = (b - a) / gap
        daily[dates[i]] = row

    # ---- 近 7 天窗口（含数据日当天）
    win_dates = [dt for dt in dates if (last - dt).days < 7]

    out = {}
    for c in CITIES:
        cur = trend[last].get(c)
        if cur is None:
            out[c] = 0
            continue
        # 近 7 天窗口内：同星期几 → 单量样本
        by_wd = defaultdict(list)
        for dt in win_dates:
            row = daily.get(dt) or {}
            if c in row and row[c] is not None:
                by_wd[dt.weekday()].append(row[c])
        # 近 7 天日均兜底
        allv = [row[c] for dt in win_dates
                for row in [daily.get(dt) or {}]
                if c in row and row[c] is not None]
        fallback = statistics.mean(allv) if allv else 0

        add = 0.0
        for k in range(1, remain + 1):
            dt = last + datetime.timedelta(days=k)
            # ★ 星期对星期：目标日往前推 7 天（同一星期几）取当日单量
            #   如 10/19(周一) → 10/12、10/20(周二) → 10/13，依此类推
            #   若 D-7 无数据，则继续按 14/21/28 天回退（仍是同一星期几）
            #   全部回退无果时用近 7 天日均兜底
            v = None
            for back in (7, 14, 21, 28):
                src = dt - datetime.timedelta(days=back)
                row = daily.get(src) or {}
                if c in row and row[c] is not None:
                    v = row[c]
                    break
            add += v if v is not None else fallback
        out[c] = cur + add
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

    stat = {c: {'SQS': {'pool': 0, 'on': 0, 'ok': 0, 'kg': 0, 'ord': 0.0, 'amt': 0.0, 'shop': set()},
                'PHF': {'pool': 0, 'on': 0, 'ok': 0, 'kg': 0, 'ord': 0.0, 'amt': 0.0, 'shop': set()}}
           for c in CITIES}
    src_stat = defaultdict(lambda: {'pool': 0, 'on': 0, 'ok': 0})
    shop_stat = defaultdict(lambda: {'pool': 0, 'on': 0, 'ok': 0, 'ord': 0.0, 'amt': 0.0})
    # 分区维度（全区所有城市，不受 CITIES 过滤影响）：SQS/PHF 各自的上线数与达标数
    dist = defaultdict(lambda: {'SQS': {'pool': 0, 'on': 0, 'ok': 0, 'kg': 0},
                                'PHF': {'pool': 0, 'on': 0, 'ok': 0, 'kg': 0}})

    for r in it:
        if r[0] is None:
            continue
        city = r[idx['城市']]
        src = str(r[idx['来源']] or '')
        # ★ 口径（用户 2026-10-20 明确）：
        #   M 列「达标情况」= 上线（招商上线在售）
        #   N 列「攻克情况」= 达标（攻克记为达标）
        #   → 上线数 = M列=达标；达标数 = N列=攻克
        online = (str(r[idx['达标情况']]).strip() == '达标')   # M 列 → 上线
        ok = (str(r[idx['攻克情况']]).strip() == '攻克')        # N 列 → 达标
        kg = ok
        key = 'SQS' if src.startswith('神抢手') else ('PHF' if src.startswith('拼好饭') else None)
        if key is None:
            continue

        # 分区聚合（全区口径）
        qn = str(r[idx['分区']] or '').strip()
        if qn and qn != 'NULL':
            de = dist[qn][key]
            de['pool'] += 1
            de['on'] += online
            de['ok'] += ok
            de['kg'] += kg

        if city not in CITIES:
            continue

        d = stat[city][key]
        d['pool'] += 1
        d['on'] += online
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
        src_stat[(city, src)]['on'] += online
        src_stat[(city, src)]['ok'] += ok

        mid = r[idx['商家ID']]
        name = r[idx['商家名称']]
        ss = shop_stat[(city, key, mid, name, r[idx['BD MIS ID']])]
        ss['pool'] += 1
        ss['on'] += online
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
            # ★ on=上线数（M列达标情况），ok=达标数（N列攻克情况）
            e[key] = dict(pool=d['pool'], on=d['on'], ok=d['ok'], kg=d['kg'],
                          ord=round(d['ord']), amt=round(d['amt']), shop=len(d['shop']),
                          onrate=(d['on'] / d['pool']) if d['pool'] else None,
                          rate=(d['ok'] / d['pool']) if d['pool'] else None,
                          kgr=(d['kg'] / d['pool']) if d['pool'] else None)
        tp = e['SQS']['pool'] + e['PHF']['pool']
        ton = e['SQS']['on'] + e['PHF']['on']
        tok = e['SQS']['ok'] + e['PHF']['ok']
        tkg = e['SQS']['kg'] + e['PHF']['kg']
        e['ALL'] = dict(pool=tp, on=ton, ok=tok, kg=tkg,
                        onrate=(ton / tp) if tp else None,
                        rate=(tok / tp) if tp else None,
                        kgr=(tkg / tp) if tp else None,
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
            pool=ss['pool'], on=ss['on'], ok=ss['ok'],
            onrate=(ss['on'] / ss['pool'] if ss['pool'] else 0),
            rate=(ss['ok'] / ss['pool'] if ss['pool'] else 0),
            ord=round(ss['ord']), amt=round(ss['amt'])))
    for k in shops:
        shops[k].sort(key=lambda x: (-x['ord'], -x['amt']))
    shop_rows = {f'{c}|{k}': shops[(c, k)] for (c, k) in shops}

    # 来源细分（5类）
    src_break = {}
    for c in CITIES:
        src_break[c] = {s: dict(pool=v['pool'], on=v['on'], ok=v['ok'],
                                onrate=(v['on'] / v['pool'] if v['pool'] else None),
                                rate=(v['ok'] / v['pool'] if v['pool'] else None))
                        for (cc, s), v in src_stat.items() if cc == c}

    # 分区维度明细（神抢手/拼好饭 各自的上线数与达标数）
    dist_rows = {}
    for q, e in dist.items():
        dist_rows[q] = {}
        for key in ('SQS', 'PHF'):
            v = e[key]
            dist_rows[q][key] = dict(
                pool=v['pool'], on=v['on'], ok=v['ok'], kg=v['kg'],
                onrate=(v['on'] / v['pool']) if v['pool'] else None,
                rate=(v['ok'] / v['pool']) if v['pool'] else None,
                kgr=(v['kg'] / v['pool']) if v['pool'] else None)

    return city_src, shop_rows, src_break, dist_rows


# ================================================================ C. 过程指标 结算价下探
def read_p3():
    """结算价下探日文件：逐日城市级 SKU 达标率 + 基线SKU数 + 商家数
    仅当某日达标列存在非零值时视为已回填；未发生日期取最新已发生日外推。"""
    files = sorted(f for f in os.listdir(SRC_P3_DIR)
                   if '结算价做功商品池明细' in f and f.endswith('.xlsx')
                   and not f.startswith('~$'))
    daily, meta = {}, {}
    dist_daily = {}
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
        dst = defaultdict(lambda: [0, 0])      # 分区维度：pool / ok
        day = None
        for r in it:
            if r[0] is None:
                continue
            d = _to_date(r[0])
            day = day or d
            ok = (str(r[idx['SKU是否达标']]).strip() == '1')

            # 分区聚合（全区口径，不受 CITIES 过滤）
            qn = str(r[idx['分区']] or '').strip()
            if qn and qn != 'NULL':
                dst[qn][0] += 1
                dst[qn][1] += ok

            city = r[idx['城市']]
            if city not in CITIES:
                continue
            e = st[city]
            e[0] += 1
            e[1] += ok
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
        dist_daily.setdefault(day, {})
        for q, v in dst.items():
            if v[0]:
                dist_daily[day][q] = v[1] / v[0]
    if not daily:
        raise RuntimeError('结算价下探：所有日文件达标列均未回填')
    return dict(daily=daily, meta=meta, last=max(daily), first=min(daily),
                files=len(files), dist_daily=dist_daily)


def p3_series(p3):
    """P3 考核期（10/8-10/31）每日序列 + 两种日均覆盖率

    对齐原模板口径：
      · 实际完成版 ④ = 考核期**已观测各日**覆盖率的算术平均
      · 预估完成版 ④ = [已观测各日之和 + 剩余天数 × 最新一日当日覆盖率] ÷ 考核期总天数
        （即以最新一日当日覆盖率外推填满考核期至 10/31）
    """
    daily, last = p3['daily'], p3['last']
    total_days = (P3_END - P3_START).days + 1        # 考核期总天数（10/8~10/31 = 24 天）
    days, out = [], {c: [] for c in CITIES}
    remain_cnt = 0
    d = P3_START
    while d <= P3_END:
        if d in daily:
            src = daily[d]
        else:
            src = daily[last]
            remain_cnt += 1
        days.append(d.strftime('%m-%d'))
        for c in CITIES:
            out[c].append(src.get(c))
        d += datetime.timedelta(days=1)

    # 预估版月度日均 = (已观测之和 + 剩余天数 × 最新一日) / 总天数
    avg = {}
    # 实际版：仅已观测日的算术平均
    avg_obs = {}
    for c in CITIES:
        latest = daily[last].get(c)
        observed = [daily[dt].get(c) for dt in sorted(daily) if daily[dt].get(c) is not None]
        avg_obs[c] = (sum(observed) / len(observed)) if observed else None
        if latest is None:
            v = [x for x in out[c] if x is not None]
            avg[c] = sum(v) / len(v) if v else None
            continue
        avg[c] = (sum(observed) + remain_cnt * latest) / total_days if total_days else None
    return days, out, avg, avg_obs


# ============================================ 分区维度（复刻原模板「分区进度」板块）
# 风险状态规则（用户 2026-10-19 指定）：
#   综合得分 > 广西区域基准        → 正常（绿）
#   综合得分 < 广西区域基准        → 低风险（橙）
#   综合得分 < 广西区域基准 − 2 分 → 高风险（红）
DIST_HIGH_GAP = 2.0
DIST_COLORS = {'正常': '#52c41a', '低风险': '#fa8c16', '高风险': '#f5222d'}


def build_districts(s1_dist, hp_dist, p3):
    """按分区经理聚合 4 项指标 + 综合得分 + 风险状态（对齐原模板排名表）
    · 拼好饭完成率  : 拼好饭-底表 渠道经理维度 MTD/目标
    · 神抢手攻克率  : 货盘明细 分区维度 神抢手* 攻克数 / 目标池
    · 拼好饭攻克率  : 货盘明细 分区维度 拼好饭* 攻克数 / 目标池
    · 月度覆盖率    : 结算价下探 分区维度 各日达标率算术平均
    · 综合得分      : S1完成率*40% + 神抢手攻克率*30% + 拼好饭攻克率*20% + 覆盖率*10%（满分100）
    """
    # 覆盖率：考核期日均（已回填日实测，未回填日按最新已发生日外推）
    dd = p3.get('dist_daily') or {}
    last = p3['last']
    all_q = {q for day in dd.values() for q in day}
    cov = {}
    for q in all_q:
        vals = []
        for dt in _p3_day_range():
            if dt in dd and q in dd[dt]:
                vals.append(dd[dt][q])
            elif q in dd.get(last, {}):
                vals.append(dd[last][q])
        cov[q] = (sum(vals) / len(vals)) if vals else None

    # 广西区域基准（全区汇总）
    def agg(mapping, key):
        pool = sum(v[key]['pool'] for v in mapping.values())
        ok = sum(v[key]['ok'] for v in mapping.values())
        kg = sum(v[key]['kg'] for v in mapping.values())
        return dict(pool=pool, ok=ok, kg=kg,
                    rate=(ok / pool) if pool else None,
                    kgr=(kg / pool) if pool else None)

    all_sqs = agg(hp_dist, 'SQS')
    all_phf = agg(hp_dist, 'PHF')

    def score(s1r, sqr, phr, cv):
        """综合得分（满分100），缺项按 0 计"""
        return ((s1r or 0) * 40 + (sqr or 0) * 30
                + (phr or 0) * 20 + (cv or 0) * 10)

    # 基准行
    base_t = sum(v['tgt'] for v in s1_dist.values() if v['tgt'])
    base_c = sum(v['cur'] for v in s1_dist.values() if v['tgt'])
    base_s1 = (base_c / base_t) if base_t else None
    cov_vals = [v for v in cov.values() if v is not None]
    base_cov = (sum(cov_vals) / len(cov_vals)) if cov_vals else None
    base_score = score(base_s1, all_sqs['kgr'], all_phf['kgr'], base_cov)
    base = dict(
        name='广西区域', s1=base_s1, sqs_kgr=all_sqs['kgr'], phf_kgr=all_phf['kgr'],
        cov=base_cov,
        score=base_score,
        tgt=base_t, cur=base_c, is_base=True, risk='基准')

    rows = []
    for q, s1v in s1_dist.items():
        h = hp_dist.get(q)
        if not h:
            continue
        r = dict(
            name=q, is_base=False,
            s1=s1v['rate'], tgt=s1v['tgt'], cur=s1v['cur'],
            sqs_kgr=h['SQS']['kgr'], sqs_pool=h['SQS']['pool'],
            phf_kgr=h['PHF']['kgr'], phf_pool=h['PHF']['pool'],
            cov=cov.get(q),
        )
        r['score'] = score(r['s1'], r['sqs_kgr'], r['phf_kgr'], r['cov'])
        rows.append(r)

    # 风险状态：以广西区域基准为标尺（高/等于基准=正常；低于基准=低风险；低于基准 2 分以上=高风险）
    for r in rows:
        gap = r['score'] - base_score
        r['gap'] = gap
        if gap >= 0:
            r['risk'] = '正常'
        elif gap > -DIST_HIGH_GAP:
            r['risk'] = '低风险'
        else:
            r['risk'] = '高风险'
        r['risk_color'] = DIST_COLORS[r['risk']]

    # 排名（基准行不参与排名，排在最前）
    rows.sort(key=lambda x: -x['score'])
    MEDALS = ['🥇', '🥈', '🥉']
    for i, r in enumerate(rows):
        r['rank'] = (MEDALS[i] if i < 3 else f'#{i + 1}')
    return dict(base=base, rows=rows, high_gap=DIST_HIGH_GAP)


def _p3_day_range():
    days, d = [], P3_START
    while d <= P3_END:
        days.append(d)
        d += datetime.timedelta(days=1)
    return days


# ============================================ 负向权益 / 正向权益判定
def assess_equity(score_result, score_proc, tier, n_warn_modules=0):
    """按学城《考核框架和关联权益》判定警告与罚款

    参数
      score_result : 结果指标合计得分（权重 40，满分 40×1.2 = 48）
      score_proc   : 过程指标合计得分（权重 60，满分 60×1.2 = 72）
      tier         : 城市等级，如 E1 / F2 / G3
    返回 dict：模块得分、完成率、警告、罚款、减免、豁免

    规则（原文）
      · 完成率：结果 = 得分/40、过程 = 得分/60（分母为权重本身）
      · 警告：拼好饭&神抢手模块绩效得分 < 90 分 → 触发 1 个警告
      · 罚款：过程指标模块完成率 < 90% → 触发对应城市等级的罚款
      · 罚款减免：同时满足 ①结果模块完成率 ≥105% ②过程模块完成率 ≥60%
      · 警告豁免：模块月均绩效得分 ≥105 分（且季度内位于同等级城市前 5%，
                  前 5% 需全区域历史数据，当前无法判定 → 标记为「待核」）
    """
    RES_W = 40.0      # 结果指标合计权重
    PRO_W = 60.0      # 过程指标合计权重
    # ★ 完成率 = 合计得分 ÷ 合计权重（分母是权重本身，不是权重×1.2）
    #   官方原文：完成率 = 合计得分 /（合计权重 × 100）
    #   例：过程得分 32.47 ÷ 60 = 54.1%（与原模板显示一致）
    res_rate = (score_result / RES_W) if score_result is not None else None
    proc_rate = (score_proc / PRO_W) if score_proc is not None else None
    # 模块绩效得分 = 结果得分 + 过程得分（上限 40×1.2 + 60×1.2 = 120）
    module_score = ((score_result or 0) + (score_proc or 0))
    module_w = RES_W + PRO_W

    warn = (module_score < WARN_LINE)
    # 警告豁免：得分 ≥105 即具备豁免资格；前 5% 条件需全区域数据，标记待核
    exempt_eligible = module_score >= EXEMPT_SCORE
    if warn and exempt_eligible:
        warn_state = '已豁免（待核同等级前5%）'
    elif warn:
        warn_state = '触发'
    elif exempt_eligible:
        warn_state = '无警告（得分达豁免线）'
    else:
        warn_state = '无警告'

    fine_rate_raw = FINE_BY_TIER.get(str(tier).strip().upper(), 0)
    fine = (proc_rate is not None and proc_rate < FINE_RATE and fine_rate_raw > 0)
    relief = (res_rate is not None and proc_rate is not None
              and res_rate >= RELIEF_RESULT and proc_rate >= RELIEF_PROC)

    if fine and relief:
        fine_state = '减免'
    elif fine:
        fine_state = '触发'
    else:
        fine_state = '不触发'

    return dict(
        res_score=score_result, proc_score=score_proc,
        res_rate=res_rate, proc_rate=proc_rate,
        module_score=module_score, module_max=module_w * 1.2,
        module_rate=(module_score / module_w if module_score is not None else None),
        warn=warn, warn_state=warn_state, exempt_eligible=exempt_eligible,
        warn_count=(1 if (warn and not exempt_eligible) else 0),
        fine=fine, fine_state=fine_state, fine_amount=(fine_rate_raw if fine else 0),
        relief=relief, relief_rate=RELIEF_RESULT, relief_proc_rate=RELIEF_PROC,
exempt_line=EXEMPT_SCORE,
            tier=str(tier or '').strip(),
            fine_by_tier_zero=(fine_rate_raw == 0),
        )


# ================================================================ 组装
def build():
    s1 = read_s1()
    city_hp, shops, srcs, hp_dist = read_hp()
    p3 = read_p3()
    p3_days, p3_ser, p3_avg, p3_avg_obs = p3_series(p3)
    proj = project_s1(s1)
    last_d = s1['last']
    districts = build_districts(s1['dist'], hp_dist, p3)
    targets, target_file = read_targets()

    rows = []
    for c in CITIES:
        m = s1['meta'][last_d].get(c, {})
        T = targets.get(c, {})
        cur = s1['cur'].get(c)
        # ★ 目标值一律以官方考核目标表为准，缺失才回退到底表
        tgt = T.get('tgt_s1') or s1['target'].get(c)
        rate = (cur / tgt) if (cur and tgt) else None
        k1 = coef(rate, S1_COEF)
        s1_score = min(rate, 1.2) * k1 * W[c]['S1'] if rate else 0

        hp = city_hp[c]
        # ★ 达标率分母 = 官方下发商品池数量
        #   分子 = N 列「攻克情况」=攻克 的数量（攻克记为达标）
        #   上线数 = M 列「达标情况」=达标 的数量 → 上线率 = 上线数 ÷ 目标数
        sq_pool_mine = hp['SQS']['pool']
        sq_pool = T.get('tgt_sqs') or sq_pool_mine
        sq_ok = hp['SQS']['ok']# N 列 攻克数 = 达标数
        sq_on = hp['SQS']['on']        # M 列 达标情况 = 上线数
        if c in NO_SQS or not sq_pool:
            sq_rate = sq_k = sq_score = None
            sq_onrate = None
        else:
            sq_rate = (sq_ok / sq_pool) if sq_pool else None
            sq_onrate = (sq_on / sq_pool) if sq_pool else None
            sq_k = coef(sq_rate, HP_COEF)
            sq_score = sq_rate * sq_k * W[c]['SQS'] if sq_rate else 0

        ph_pool_mine = hp['PHF']['pool']
        ph_pool = T.get('tgt_phf') or ph_pool_mine
        ph_ok = hp['PHF']['ok']# N 列 攻克数 = 达标数
        ph_on = hp['PHF']['on']
        ph_rate = (ph_ok / ph_pool) if ph_pool else None
        ph_onrate = (ph_on / ph_pool) if ph_pool else None
        ph_k = coef(ph_rate, HP_COEF)
        ph_score = ph_rate * ph_k * W[c]['PHF'] if ph_rate is not None else 0

        # ④ P3：实际版用「已观测日算术平均」，预估版用「最新一日外推填满考核期」
        p3r_act = p3_avg_obs[c]
        p3r = p3_avg[c]
        p3_pool_mine = p3['meta'][p3['last']].get(c, {}).get('pool')
        p3_pool = T.get('tgt_p3') or p3_pool_mine
        # 实际版
        p3_k_act = coef(p3r_act, P3_COEF)
        p3_score_act = (p3r_act or 0) * p3_k_act * W[c]['P3']
        # 预估版
        p3_k = coef(p3r, P3_COEF)
        p3_score = (p3r or 0) * p3_k * W[c]['P3']
        p3_ok = p3['meta'][p3['last']].get(c, {}).get('ok')

        proc = (sq_score or 0) + ph_score + p3_score_act
        pw = W[c]['SQS'] + W[c]['PHF'] + W[c]['P3']

        # 月末预估
        pt, prate = proj[c], (proj[c] / tgt if tgt else None)
        pk = coef(prate, S1_COEF)
        ps = min(prate, 1.2) * pk * W[c]['S1'] if prate else 0
        if c in NO_SQS:
            esq = None
        else:
            # 预估完成版②：预估达标率 = 【重点货盘（神抢手P1）上线率】− 10pp
            # 依据原模板 legacy：预估达标率 = 上线率 − 10%（上线商品的达成折损估计）
            #   例：玉林 上线率 77.14% → 预估达标率 67.14%（系数 0.8）
            pool = sq_pool
            base = sq_onrate
            r2 = max(base - EST_SQS_DROP, 0) if base is not None else None
            ok2 = round(r2 * pool) if r2 is not None else 0
            k2 = coef(r2, HP_COEF)
            esq = dict(pool=pool, ok=ok2, rate=r2, k=k2,
                       score=(r2 * k2 * W[c]['SQS']) if r2 else 0)
        est = (esq['score'] if esq else 0) + ph_score + p3_score

        # ★ 绩效总得分 = ① 结果指标得分 + ②③④ 过程指标得分（= 过程得分）
        total = s1_score + proc
        est_total = ps + est

        # ★ 负向/正向权益判定：实际版（当前实际值触发）+ 预估版（按预估值预判月末）
        equity = assess_equity(s1_score, proc, m.get('grade'))
        equity_est = assess_equity(ps, est, m.get('grade'))
        rows.append(dict(
            city=c, grade=m.get('grade'), mgr=m.get('mgr'),
            tgt=tgt, cur=cur, rate=rate, s1_k=k1, s1_score=s1_score,
            proj=pt, proj_rate=prate, proj_score=ps,
            shop_rate=m.get('shop_rate'), newcust_rate=m.get('newcust_rate'),
            group_rate=m.get('group_rate'), groupon_rate=m.get('groupon_rate'),
            pay_avg=m.get('pay_avg'), pen_rate=m.get('渗透'),
            phf_share=m.get('phf_share'),
            hp=hp, sq_rate=sq_rate, sq_k=sq_k, sq_score=sq_score,
            sq_onrate=sq_onrate,
            ph_rate=ph_rate, ph_k=ph_k, ph_score=ph_score,
            ph_onrate=ph_onrate,
            p3_rate=p3r_act, p3_k=p3_k_act, p3_score=p3_score_act,
            p3_rate_est=p3r, p3_k_est=p3_k, p3_score_est=p3_score, p3_ok_est=p3_ok,
            p3_meta=p3['meta'][p3['last']].get(c, {}),
            proc=proc, proc_w=pw, proc_pct=(proc / pw if pw else None),
            total=total, est_total=est_total,
            est_proc=est, est_pct=(est / pw if pw else None),
            est_sq=esq,
            equity=equity,
            equity_est=equity_est,
            # 官方目标 vs 明细表实际行数（口径差异留痕，便于核对）
            tgt_official=dict(s1=tgt, sqs=sq_pool, phf=ph_pool, p3=p3_pool),
            pool_mine=dict(s1=tgt, sqs=sq_pool_mine, phf=ph_pool_mine, p3=p3_pool_mine),
            ok_count=dict(sqs=sq_ok, phf=ph_ok, p3=p3['meta'][p3['last']].get(c, {}).get('ok')),
            on_count=dict(sqs=sq_on, phf=ph_on,
                          p3=p3['meta'][p3['last']].get(c, {}).get('pool')),
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
            cities=CITIES, no_sqs=sorted(NO_SQS),
            weights=W,
            src_result=os.path.basename(SRC_S1),
            src_hp=os.path.basename(SRC_HP),
            src_p3_dir=os.path.basename(SRC_P3_DIR),
            src_target=target_file,
            equity_rules=dict(
                warn_line=WARN_LINE,
                fine_rate=FINE_RATE,
                relief_result=RELIEF_RESULT,
                relief_proc=RELIEF_PROC,
                exempt_score=EXEMPT_SCORE,
                exempt_top_pct=EXEMPT_TOP_PCT,
                fine_by_tier=FINE_BY_TIER,
                max_warn_total=MAX_WARN_TOTAL,
            ),
        ),
        rows=rows,
        districts=districts,
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