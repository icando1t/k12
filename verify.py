#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""K12 城市资源配置页 —— 部署后自检（仅需 Python 3 标准库）

用法:
    python3 verify.py https://your-domain.com
    python3 verify.py https://your-domain.com/ceo      # 部署在子目录时
    python3 verify.py https://your-domain.com --user u --pass p   # 站点开了 Basic Auth

退出码: 0 = 全过 / 1 = 有失败项（会逐条说明）
"""
import argparse
import base64
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

TIMEOUT = 20
OK, BAD, WARN = "✓", "✗", "!"


def get(url, auth=None):
    """返回 (status, body_bytes, final_url)。异常也归一成状态码返回。"""
    req = urllib.request.Request(url, headers={"User-Agent": "k12-deploy-verify/1.0"})
    if auth:
        req.add_header("Authorization", "Basic " + base64.b64encode(auth.encode()).decode())
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
            return r.status, r.read(), r.geturl()
    except urllib.error.HTTPError as e:
        return e.code, e.read() or b"", url
    except Exception as e:  # DNS / 连接 / 超时
        return None, str(e).encode(), url


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("base", help="站点根 URL,如 https://example.com 或 https://example.com/ceo")
    ap.add_argument("--user", default=os.environ.get("VERIFY_USER"))
    ap.add_argument("--pass", dest="pwd", default=os.environ.get("VERIFY_PASS"))
    args = ap.parse_args()

    base = args.base.rstrip("/") + "/"
    auth = f"{args.user}:{args.pwd}" if args.user else None
    failures = []

    def check(label, cond, detail=""):
        print(f"  {OK if cond else BAD} {label}{('  ' + detail) if detail else ''}")
        if not cond:
            failures.append(label)

    print(f"目标: {base}\n")

    # ---- 1. 入口页 ----
    print("[1] 入口页")
    st, body, final = get(base, auth)
    home = ""
    if st is None:
        check("可访问", False, f"连接失败: {body.decode('utf-8', 'replace')[:120]}")
    elif st in (401, 403):
        check("可访问", False, f"HTTP {st} —— 站点开了鉴权? 用 --user/--pass 传凭据")
    elif st != 200:
        check("可访问", False, f"HTTP {st}")
    else:
        check("HTTP 200", True)
        home = body.decode("utf-8", "replace")
        check("标题存在", "K12 城市资源配置" in home)
        check("数据已内嵌(非空壳)",
              len(home) > 200_000 and ("city_deck.html?c=" in home or '"deck"' in home),
              f"{len(home) / 1024:.0f} KB")
        if len(home) < 200_000:
            check("页面体积正常", False, "疑似传了模板空壳,不是构建产物")

    # ---- 2. city_deck.html ----
    print("\n[2] 竞对详情页")
    st2, body2, _ = get(urllib.parse.urljoin(base, "city_deck.html"), auth)
    check("HTTP 200", st2 == 200, "" if st2 == 200 else f"HTTP {st2}")

    # ---- 3. 中文文件名 deck 数据（坑 ②） ----
    print("\n[3] 中文文件名数据文件（UTF-8 文件名是否被服务器正确处理）")
    local_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data", "deck")
    samples = []
    if os.path.isdir(local_dir):
        names = sorted(f[:-3] for f in os.listdir(local_dir) if f.endswith(".js"))
        if names:
            step = max(1, len(names) // 3)
            samples = [names[0], names[len(names) // 2], names[-1]][:3]
            samples = list(dict.fromkeys(samples))
    if not samples:
        samples = ["广州", "苏州", "北京"]
        print(f"  {WARN} 本地没有 data/deck/ 目录,改用固定抽样: {', '.join(samples)}")
    for city in samples:
        url = urllib.parse.urljoin(base, "data/deck/" + urllib.parse.quote(city) + ".js")
        st3, body3, _ = get(url, auth)
        txt = body3.decode("utf-8", "replace")[:200]
        ok = st3 == 200 and len(body3) > 200 and "DECK=" in txt
        check(f"{city}.js", ok, f"HTTP {st3}" + ("" if ok else "  ← 中文文件名没对上?"))
        if st3 == 404:
            print(f"      提示: 若文件确实存在,是服务器文件编码或 URL 解码问题(见 部署说明.md 坑 ②)")

    # ---- 4. 无外部依赖 ----
    print("\n[4] 无外网依赖（内网可运行）")
    if home:
        host = urllib.parse.urlparse(base).hostname or ""
        ext = set()
        for m in re.finditer(r'(?:src|href)\s*=\s*["\'](https?://[^"\']+)', home):
            u = m.group(1)
            if host and host not in u:
                ext.add(urllib.parse.urlparse(u).netloc)
        check("入口页无外部域名引用", not ext, ("发现: " + ", ".join(sorted(ext)[:5])) if ext else "")

    print()
    if failures:
        print(f"{BAD} 有 {len(failures)} 项未通过:")
        for f in failures:
            print(f"    - {f}")
        return 1
    print(f"{OK} 自检全过:入口可达 · 数据内嵌 · deck 页可达 · 中文文件名正常 · 无外网依赖")
    return 0


if __name__ == "__main__":
    sys.exit(main())
