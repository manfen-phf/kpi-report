# -*- coding: utf-8 -*-
"""Deploy kpi-report files to GitHub Pages via Contents REST API.

设计要点：
- 沙箱/任意环境都可运行（只依赖 api.github.com，不依赖 github.com:443 的 git 协议）。
- Token 不写死在文件里：优先读环境变量 GITHUB_TOKEN/GH_TOKEN；否则调用本机
  Git Credential Manager（`git credential fill`）自动获取，避免把密钥提交进仓库。
- 已存在则 UPDATE（带 sha），不存在则 CREATE。
用法：
  GITHUB_TOKEN=xxx python _deploy_api.py      # 或本机已登录 GCM 直接 python _deploy_api.py
"""
import base64, json, os, subprocess, sys, urllib.request, urllib.error

TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")

def get_token_from_gcm():
    try:
        out = subprocess.run(
            ["git", "credential", "fill"],
            input="protocol=https\nhost=github.com\n\n",
            capture_output=True, text=True, timeout=30,
        ).stdout
        for line in out.splitlines():
            if line.lower().startswith("password="):
                return line.split("=", 1)[1].strip()
    except Exception:
        pass
    return None

if not TOKEN:
    TOKEN = get_token_from_gcm()
if not TOKEN:
    sys.stderr.write("ERROR: 未找到 GitHub token。请先通过 Git Credential Manager 登录 github.com，\n"
                     "或设置环境变量 GITHUB_TOKEN。\n")
    sys.exit(2)

REPO = "manfen-phf/kpi-report"
BRANCH = "main"
LOCAL = os.path.dirname(os.path.abspath(__file__))

FILES = [
    "index.html",
    "latest.html",
    "README.md",
    "generate_report.py",
    "update.bat",
    ".gitignore",
    "_deploy_api.py",
]

def latest_dated_report():
    """返回本地最新的 商品运营分析报告-MMdd.html（按文件名日期排序），用于每日存档上线。"""
    import re as _re
    cand = [f for f in os.listdir(LOCAL) if _re.match(r"商品运营分析报告-\d{4}\.html$", f)]
    if not cand:
        return None
    cand.sort()  # 文件名 MMdd 升序，最后一个最新
    return cand[-1]

API = "https://api.github.com/repos/%s/contents/%%s" % REPO
HEADERS = {
    "Authorization": "Bearer %s" % TOKEN,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "kpi-report-deploy",
}

def api_get(path):
    req = urllib.request.Request(API % path, headers=HEADERS, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise

def api_put(repo_path, content_b64, sha, message):
    body = {"message": message, "content": content_b64, "branch": BRANCH}
    if sha:
        body["sha"] = sha
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(API % repo_path, data=data, headers=HEADERS, method="PUT")
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.status, json.loads(r.read().decode("utf-8"))

MSG = "更新商品运营分析报告(动态日维度生成器) - 一键部署"

# 追加每日存档快照（如果存在）
dated = latest_dated_report()
if dated:
    if dated not in FILES:
        FILES.append(dated)

for name in FILES:
    local_path = os.path.join(LOCAL, name)
    if not os.path.exists(local_path):
        print("SKIP (missing local):", name)
        continue
    with open(local_path, "rb") as f:
        raw = f.read()
    b64 = base64.b64encode(raw).decode("ascii")
    existing = api_get(name)
    sha = existing.get("sha") if existing and "sha" in existing else None
    mode = "UPDATE" if sha else "CREATE"
    try:
        status, resp = api_put(name, b64, sha, MSG)
        print("%-7s %-20s -> HTTP %s  (commit=%s)" % (mode, name, status, resp.get("commit", {}).get("sha", "?")[:10]))
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "ignore")
        print("%-7s %-20s -> ERROR %s: %s" % (mode, name, e.code, err[:300]))
    except Exception as e:
        print("%-7s %-20s -> EXC %s" % (mode, name, e))
print("DONE.")
