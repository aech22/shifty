#!/usr/bin/env python3
"""
株価取得スクリプト — 株式会社TODGE 投資デモ
毎時実行: 現在値を取得してportfolio.jsonを更新 → git push
"""

import json
import os
import subprocess
from datetime import datetime, timezone, timedelta
import yfinance as yf

REPO_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_PATH = os.path.join(REPO_DIR, "investment", "portfolio_config.json")
OUTPUT_PATH = os.path.join(REPO_DIR, "investment", "portfolio.json")
JST = timezone(timedelta(hours=9))


def fetch_prices(holdings):
    symbols = [h["symbol"] for h in holdings]
    data = yf.download(symbols, period="2d", interval="1h", auto_adjust=True, progress=False)

    results = []
    for h in holdings:
        sym = h["symbol"]
        try:
            close = data["Close"][sym].dropna()
            current_price = float(close.iloc[-1])
            prev_close = float(close.iloc[-2]) if len(close) >= 2 else current_price
        except Exception:
            current_price = 0.0
            prev_close = 0.0

        shares = h.get("shares", 0)
        avg_price = h.get("avg_price", 0)
        value = round(current_price * shares, 2)
        cost = round(avg_price * shares, 2)
        pnl = round(value - cost, 2)
        pnl_pct = round((pnl / cost * 100), 2) if cost > 0 else 0.0
        day_change = round(current_price - prev_close, 4)
        day_change_pct = round((day_change / prev_close * 100), 2) if prev_close > 0 else 0.0

        results.append({
            "symbol": sym,
            "name": h["name"],
            "market": h["market"],
            "shares": shares,
            "avg_price": avg_price,
            "current_price": round(current_price, 4),
            "value": value,
            "cost": cost,
            "pnl": pnl,
            "pnl_pct": pnl_pct,
            "day_change": day_change,
            "day_change_pct": day_change_pct
        })
    return results


def main():
    with open(CONFIG_PATH, "r") as f:
        config = json.load(f)

    holdings = config["holdings"]
    stocks = fetch_prices(holdings)

    total_value = sum(s["value"] for s in stocks)
    total_cost = sum(s["cost"] for s in stocks)
    total_pnl = round(total_value - total_cost, 2)
    total_pnl_pct = round((total_pnl / total_cost * 100), 2) if total_cost > 0 else 0.0
    cash = round(config["initial_capital"] - total_cost, 2)

    output = {
        "updated": datetime.now(JST).strftime("%Y-%m-%dT%H:%M:%S+09:00"),
        "demo": config.get("demo", True),
        "initial_capital": config["initial_capital"],
        "cash": cash,
        "stocks": stocks,
        "total": {
            "invested": round(total_cost, 2),
            "current": round(total_value, 2),
            "pnl": total_pnl,
            "pnl_pct": total_pnl_pct
        }
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)

    print(f"[{output['updated']}] portfolio.json 更新完了")
    print(f"  評価額合計: ¥{total_value:,.0f}  損益: ¥{total_pnl:,.0f} ({total_pnl_pct:+.2f}%)")

    # git commit & push（mainブランチに切り替えてpush）
    g = lambda *args: subprocess.run(["git", "-C", REPO_DIR] + list(args), check=True)
    gout = lambda *args: subprocess.run(
        ["git", "-C", REPO_DIR] + list(args), capture_output=True, text=True
    ).stdout.strip()

    current_branch = gout("branch", "--show-current")

    if current_branch != "main":
        g("stash", "--include-untracked", "-m", "fetch_stock_prices stash")
        g("checkout", "main")
        g("pull", "origin", "main", "--ff-only")

    # portfolio.jsonをmainに書き込む（既にOUTPUT_PATHに書き込み済み）
    g("add", "investment/portfolio.json")
    diff = subprocess.run(["git", "-C", REPO_DIR, "diff", "--cached", "--quiet"])
    if diff.returncode != 0:
        g("commit", "-m", f"chore: 株価更新 {datetime.now(JST).strftime('%Y-%m-%d %H:%M')} JST")
        g("push", "origin", "main")
        print("  git push main 完了")
    else:
        print("  変更なし、pushスキップ")

    if current_branch != "main":
        g("checkout", current_branch)
        stash_list = gout("stash", "list")
        if stash_list:
            g("stash", "pop")


if __name__ == "__main__":
    main()
