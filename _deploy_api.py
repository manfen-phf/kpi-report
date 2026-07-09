# -*- coding: utf-8 -*-
"""Deploy kpi-report files to GitHub Pages via Git Data REST API (single commit per run).

设计要点：
- 每次运行只产生 1 个 commit（用 Git Data API 构建 tree + commit），历史干净。
- 只依赖 api.github.com，不依赖 github.com:443 的 git 协议（沙箱可运行）。
- Token 不写死：优先环境变量 GITHUB_TOKEN/GH_TOKEN，否则调用本机 Git Credential
  Manager（git credential fill）自动获取，避免把密钥提交进仓库。
- 并发安全：PATCH ref 若遇 non-fast-forward(422) 会自动重新拉取最新 tip 并重试。
用法：
  GITHUB_TOKEN=xxx python _deploy_api.py      # 或本机已登录 GCM 直接 python _deploy_api.py
"""
import base64, json, os, subprocess, sys, urllib.request, urllib.error, urllib.parse

TOKEN = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")

# 第三种方式：从同目录 .github_token 文件读取（一行一个 token）
if not TOKEN:
    _token_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".github_token")
    if os.path.isfile(_token_file):
        with open(_token_file, "r", encoding="utf-8") as _f:
            TOKEN = _f.read().strip().splitlines()[0].strip()

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

HEADERS = {
    "Authorization": "Bearer %s" % TOKEN,
    "Accept": "application/vnd.github+json",
    "Content-Type": "application/json",
    "User-Agent": "kpi-report-deploy",
}

def api(method, path, body=None, attempt=0):
    url = "https://api.github.com/repos/%s/%s" % (REPO, urllib.parse.quote(path))
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        if e.code == 422 and attempt == 0 and method == "PATCH" and path.startswith("git/refs"):
            # non-fast-forward：上层调用会重拉 tip 后重试
            raise _Retry()
        err = e.read().decode("utf-8", "ignore")
        print("  HTTPError %s on %s %s: %s" % (e.code, method, path, err[:200]))
        raise

class _Retry(Exception):
    pass

def get_ref():
    st, j = api("GET", "git/refs/heads/%s" % BRANCH)
    return j["object"]["sha"]

def create_blob(content_b64):
    st, j = api("POST", "git/blobs", {"content": content_b64, "encoding": "base64"})
    return j["sha"]

def create_tree(base_tree, entries):
    body = {"tree": entries}
    if base_tree:
        body["base_tree"] = base_tree
    st, j = api("POST", "git/trees", body)
    return j["sha"]

def create_commit(message, tree_sha, parent_sha):
    st, j = api("POST", "git/commits", {"message": message, "tree": tree_sha, "parents": [parent_sha]})
    return j["sha"]

def update_ref(new_sha, old_sha):
    # 第一次尝试；若 non-fast-forward 由调用方重拉后重试
    api("PATCH", "git/refs/heads/%s" % BRANCH, {"sha": new_sha, "force": False})

# ---- 文件清单（自动包含最新每日存档） ----
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
    import re as _re
    cand = [f for f in os.listdir(LOCAL) if _re.match(r"商品运营分析报告-\d{4}-\d{4}\.html$", f)]
    if not cand:
        return None
    cand.sort()
    return cand[-1]

dated = latest_dated_report()
if dated and dated not in FILES:
    FILES.append(dated)

MSG = "更新商品运营分析报告(动态日维度生成器) - 一键部署"

def main():
    # 收集本地文件内容
    blobs = {}
    for name in FILES:
        p = os.path.join(LOCAL, name)
        if not os.path.exists(p):
            print("SKIP (missing local):", name)
            continue
        with open(p, "rb") as f:
            blobs[name] = base64.b64encode(f.read()).decode("ascii")

    for attempt in range(3):
        try:
            tip = get_ref()
            st, commit = api("GET", "git/commits/%s" % tip)
            base_tree = commit["tree"]["sha"]
            entries = []
            for name, b64 in blobs.items():
                sha = create_blob(b64)
                entries.append({"path": name, "mode": "100644", "type": "blob", "sha": sha})
            new_tree = create_tree(base_tree, entries)
            new_commit = create_commit(MSG, new_tree, tip)
            update_ref(new_commit, tip)
            print("OK: 1 commit %s (files: %d)" % (new_commit[:10], len(blobs)))
            return
        except _Retry:
            print("  ref 冲突，重拉最新 tip 重试 (%d)..." % (attempt + 1))
            continue
    print("ERROR: 多次重试仍失败，请稍后重试。")
    sys.exit(1)

if __name__ == "__main__":
    main()
