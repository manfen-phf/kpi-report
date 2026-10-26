# -*- coding: utf-8 -*-
"""kpi-report 仓库内 9月 报告生成入口（shim）
==================================================
9月考核口径：结果指标(40%) + 过程指标(60%)
  · S1 PHF订单完成率（40%）
  · P1 神抢手重点货盘商品达标率（30%，东兰/凤山不考核）
  · P2 拼好饭重点货盘商品达标率（20% / 东兰凤山35%）
  · P3 商家参与优惠活动覆盖率（10% / 东兰凤山25%）

单一事实来源（canonical generator）：
  E:/0总商维度数据/KPI绩效/000报告生成和输出/build_ui_prototype_sept.py

本脚本只做两件事：
  1) 调用源生成器（9月四指标口径）在源目录产出 index.html / latest.html / 商品运营分析报告-*.html
  2) 把产出同步到本仓库目录，供 _deploy_api.py 部署到 GitHub Pages

这样仓库与本地源始终保持同一套 9月 逻辑，不会出现"仓库是 8月、线上是 9月"的漂移。
"""
import os, shutil, subprocess, glob

SRC_DIR = r"E:\0总商维度数据\KPI绩效\000报告生成和输出"
GEN     = os.path.join(SRC_DIR, "build_ui_prototype_sept.py")
PY      = r"C:\Users\13601\.workbuddy\binaries\python\envs\default\Scripts\python.exe"
HERE    = os.path.dirname(os.path.abspath(__file__))


def sync_html():
    copied = []
    for name in ("index.html", "latest.html"):
        src = os.path.join(SRC_DIR, name)
        if os.path.exists(src):
            shutil.copy(src, os.path.join(HERE, name))
            copied.append(name)
    cands = sorted(glob.glob(os.path.join(SRC_DIR, "商品运营分析报告-*.html")))
    if cands:
        latest = cands[-1]
        shutil.copy(latest, os.path.join(HERE, os.path.basename(latest)))
        copied.append(os.path.basename(latest))
    return copied


def main():
    if not os.path.exists(GEN):
        raise SystemExit("未找到源生成器: " + GEN)
    if not os.path.exists(PY):
        raise SystemExit("未找到 Python: " + PY)
    print("[9月] 调用源生成器 build_ui_prototype_sept.py ...")
    subprocess.run([PY, GEN], check=True)
    copied = sync_html()
    print("[9月] 已同步到仓库: " + ", ".join(copied))


if __name__ == "__main__":
    main()
