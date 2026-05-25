#!/usr/bin/env python3
"""
Session Token Tracker — see where your tokens go.

Usage:
  python3 session-tokens.py                  # analyze current/latest session
  python3 session-tokens.py --all            # analyze all sessions, show summary table
  python3 session-tokens.py --last 5         # analyze last 5 sessions
  python3 session-tokens.py --session <id>   # analyze a specific session
  python3 session-tokens.py --csv            # append latest session to CSV log

The CSV log builds up over time at ~/.axhy-sessions/token-log.csv
so you can spot patterns (which sessions are expensive, which are cheap).
"""

import json
import os
import sys
import glob
import csv
from datetime import datetime
from pathlib import Path
from collections import defaultdict

# --- Config ---

PROJECT_DIR = os.path.expanduser(
    "~/.claude/projects/-Users-thotaakshay-eclean-workspace"
)
LOG_DIR = os.path.expanduser("~/.axhy-sessions")
LOG_FILE = os.path.join(LOG_DIR, "token-log.csv")

# Pricing (per million tokens) — update if model pricing changes
PRICING = {
    "opus-4": {"input": 15.0, "output": 75.0, "cache_read": 1.5, "cache_write": 18.75},
    "sonnet-4": {"input": 3.0, "output": 15.0, "cache_read": 0.30, "cache_write": 3.75},
    "haiku": {"input": 0.80, "output": 4.0, "cache_read": 0.08, "cache_write": 1.0},
}
DEFAULT_PRICING = {"input": 15.0, "output": 75.0, "cache_read": 1.5, "cache_write": 18.75}


def get_pricing(model: str) -> dict:
    if not model:
        return DEFAULT_PRICING
    m = model.lower()
    if "opus" in m:
        return PRICING["opus-4"]
    if "sonnet" in m:
        return PRICING["sonnet-4"]
    if "haiku" in m:
        return PRICING["haiku"]
    return DEFAULT_PRICING


def analyze_session(filepath: str) -> dict:
    """Parse a session transcript and extract token usage stats."""
    stats = {
        "session_id": Path(filepath).stem,
        "file": filepath,
        "file_size_mb": os.path.getsize(filepath) / (1024 * 1024),
        "first_timestamp": None,
        "last_timestamp": None,
        "model": None,
        "user_messages": 0,
        "assistant_messages": 0,
        "total_input_tokens": 0,
        "total_output_tokens": 0,
        "total_cache_read_tokens": 0,
        "total_cache_write_tokens": 0,
        "total_cost_usd": 0.0,
        "tool_calls": defaultdict(int),
        "first_user_message": None,
    }

    with open(filepath) as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError:
                continue

            ts = obj.get("timestamp")
            msg_type = obj.get("type")

            if ts:
                if stats["first_timestamp"] is None:
                    stats["first_timestamp"] = ts
                stats["last_timestamp"] = ts

            if msg_type == "user":
                stats["user_messages"] += 1
                if stats["first_user_message"] is None:
                    msg = obj.get("message", {})
                    if isinstance(msg, dict):
                        content = msg.get("content", "")
                        if isinstance(content, str):
                            stats["first_user_message"] = content[:120]
                        elif isinstance(content, list):
                            for block in content:
                                if isinstance(block, dict) and block.get("type") == "text":
                                    stats["first_user_message"] = block.get("text", "")[:120]
                                    break

            elif msg_type == "assistant":
                stats["assistant_messages"] += 1
                msg = obj.get("message", {})
                if not isinstance(msg, dict):
                    continue

                model = msg.get("model", "")
                if model and not stats["model"]:
                    stats["model"] = model

                usage = msg.get("usage", {})
                if not usage:
                    continue

                input_tok = usage.get("input_tokens", 0)
                output_tok = usage.get("output_tokens", 0)
                cache_read = usage.get("cache_read_input_tokens", 0)
                cache_write = usage.get("cache_creation_input_tokens", 0)

                stats["total_input_tokens"] += input_tok
                stats["total_output_tokens"] += output_tok
                stats["total_cache_read_tokens"] += cache_read
                stats["total_cache_write_tokens"] += cache_write

                pricing = get_pricing(model)
                turn_cost = (
                    (input_tok / 1_000_000) * pricing["input"]
                    + (output_tok / 1_000_000) * pricing["output"]
                    + (cache_read / 1_000_000) * pricing["cache_read"]
                    + (cache_write / 1_000_000) * pricing["cache_write"]
                )
                stats["total_cost_usd"] += turn_cost

                content = msg.get("content", [])
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "tool_use":
                            tool_name = block.get("name", "unknown")
                            stats["tool_calls"][tool_name] += 1

    # Duration
    if stats["first_timestamp"] and stats["last_timestamp"]:
        try:
            t1 = datetime.fromisoformat(stats["first_timestamp"].replace("Z", "+00:00"))
            t2 = datetime.fromisoformat(stats["last_timestamp"].replace("Z", "+00:00"))
            stats["duration_minutes"] = (t2 - t1).total_seconds() / 60
        except Exception:
            stats["duration_minutes"] = 0
    else:
        stats["duration_minutes"] = 0

    stats["total_tokens"] = (
        stats["total_input_tokens"]
        + stats["total_output_tokens"]
        + stats["total_cache_read_tokens"]
        + stats["total_cache_write_tokens"]
    )

    return stats


def fmt(n: int) -> str:
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


def pct(part: int, total: int) -> str:
    if total == 0:
        return "0%"
    return f"{part / total * 100:.0f}%"


def print_session_report(stats: dict, verbose: bool = True):
    """Print a human-readable session report."""
    print(f"\n{'=' * 65}")
    print(f"  Session: {stats['session_id'][:16]}...")
    if stats["first_user_message"]:
        msg = stats["first_user_message"][:80]
        print(f"  Topic:   \"{msg}...\"")
    print(f"  Model:   {stats.get('model', 'unknown')}")

    if stats["first_timestamp"]:
        try:
            t1 = datetime.fromisoformat(stats["first_timestamp"].replace("Z", "+00:00"))
            print(f"  Date:    {t1.strftime('%Y-%m-%d %I:%M %p')}")
        except Exception:
            pass
    print(f"  Duration: {stats['duration_minutes']:.0f} minutes")
    print(f"  Turns:   {stats['user_messages']} user / {stats['assistant_messages']} assistant")
    print(f"{'=' * 65}")

    total = stats["total_tokens"]
    print(f"\n  Token Breakdown:")
    print(f"  {'Input (new):':<25} {fmt(stats['total_input_tokens']):>10}  ({pct(stats['total_input_tokens'], total)})")
    print(f"  {'Output:':<25} {fmt(stats['total_output_tokens']):>10}  ({pct(stats['total_output_tokens'], total)})")
    print(f"  {'Cache read (cheap):':<25} {fmt(stats['total_cache_read_tokens']):>10}  ({pct(stats['total_cache_read_tokens'], total)})")
    print(f"  {'Cache write:':<25} {fmt(stats['total_cache_write_tokens']):>10}  ({pct(stats['total_cache_write_tokens'], total)})")
    print(f"  {'_' * 45}")
    print(f"  {'TOTAL:':<25} {fmt(total):>10}")
    cost_str = f"${stats['total_cost_usd']:.4f}"
    print(f"  {'Estimated cost:':<25} {cost_str:>10}")

    cache_total = stats["total_cache_read_tokens"] + stats["total_cache_write_tokens"]
    if cache_total > 0:
        cache_hit_rate = stats["total_cache_read_tokens"] / cache_total * 100
        print(f"\n  Cache hit rate: {cache_hit_rate:.0f}% (higher = you pay less)")

    if verbose and stats["tool_calls"]:
        print(f"\n  Top Tool Calls:")
        sorted_tools = sorted(stats["tool_calls"].items(), key=lambda x: -x[1])
        for tool, count in sorted_tools[:12]:
            short = tool.replace("mcp__axhy-guardrail__", "axhy/")
            short = short.replace("mcp__plugin_claude-mem_mcp-search__", "mem/")
            short = short.replace("mcp__ccd_session__", "ccd/")
            short = short.replace("mcp__Claude_in_Chrome__", "chrome/")
            short = short.replace("mcp__computer-use__", "desktop/")
            print(f"    {short:<45} {count:>4}x")

    if stats["duration_minutes"] > 0:
        cpm = stats["total_cost_usd"] / stats["duration_minutes"]
        tpm = int(total / stats["duration_minutes"])
        print(f"\n  Cost/min: ${cpm:.4f}    Tokens/min: {fmt(tpm)}")

    print()


def print_summary_table(all_stats: list):
    """Print a compact table of all sessions."""
    print(f"\n{'Date':<18} {'Dur':>5} {'Turns':>6} {'Tokens':>10} {'Cost':>8} {'$/min':>7} {'Model':<15} {'Topic'}")
    print("_" * 115)

    total_cost = 0.0
    total_tokens = 0
    total_minutes = 0.0

    for s in sorted(all_stats, key=lambda x: x.get("first_timestamp", "")):
        date = ""
        if s["first_timestamp"]:
            try:
                t = datetime.fromisoformat(s["first_timestamp"].replace("Z", "+00:00"))
                date = t.strftime("%b %d %I:%M%p")
            except Exception:
                pass

        dur = f"{s['duration_minutes']:.0f}m"
        turns = str(s["user_messages"])
        tokens = fmt(s["total_tokens"])
        cost = f"${s['total_cost_usd']:.3f}"
        cpm = f"${s['total_cost_usd'] / max(s['duration_minutes'], 1):.4f}" if s["duration_minutes"] > 0 else "-"
        model = (s.get("model") or "unknown")
        if "opus" in model.lower():
            model = "opus"
        elif "sonnet" in model.lower():
            model = "sonnet"
        elif "haiku" in model.lower():
            model = "haiku"
        else:
            model = model[:15]
        msg = (s.get("first_user_message") or "")[:35]

        total_cost += s["total_cost_usd"]
        total_tokens += s["total_tokens"]
        total_minutes += s["duration_minutes"]

        print(f"{date:<18} {dur:>5} {turns:>6} {tokens:>10} {cost:>8} {cpm:>7} {model:<15} {msg}")

    print("_" * 115)
    avg_cpm = f"${total_cost / max(total_minutes, 1):.4f}" if total_minutes > 0 else "-"
    print(f"{'TOTAL':<18} {total_minutes:.0f}m {'':>6} {fmt(total_tokens):>10} {'$' + f'{total_cost:.3f}':>8} {avg_cpm:>7}")
    print()


def append_to_csv(stats: dict):
    """Append session stats to the CSV log."""
    os.makedirs(LOG_DIR, exist_ok=True)

    file_exists = os.path.exists(LOG_FILE)

    with open(LOG_FILE, "a", newline="") as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow([
                "date", "session_id", "model", "duration_min", "user_turns",
                "input_tokens", "output_tokens", "cache_read", "cache_write",
                "total_tokens", "cost_usd", "cost_per_min", "cache_hit_pct", "first_message"
            ])

        date = ""
        if stats["first_timestamp"]:
            try:
                t = datetime.fromisoformat(stats["first_timestamp"].replace("Z", "+00:00"))
                date = t.strftime("%Y-%m-%d %H:%M")
            except Exception:
                pass

        cache_total = stats["total_cache_read_tokens"] + stats["total_cache_write_tokens"]
        cache_hit = f"{stats['total_cache_read_tokens'] / cache_total * 100:.0f}" if cache_total > 0 else "0"
        cpm = f"{stats['total_cost_usd'] / max(stats['duration_minutes'], 1):.4f}" if stats["duration_minutes"] > 0 else "0"

        writer.writerow([
            date,
            stats["session_id"][:16],
            stats.get("model", ""),
            f"{stats['duration_minutes']:.0f}",
            stats["user_messages"],
            stats["total_input_tokens"],
            stats["total_output_tokens"],
            stats["total_cache_read_tokens"],
            stats["total_cache_write_tokens"],
            stats["total_tokens"],
            f"{stats['total_cost_usd']:.4f}",
            cpm,
            cache_hit,
            (stats.get("first_user_message") or "")[:80],
        ])

    print(f"  Logged to {LOG_FILE}")


def get_session_files(count: int = None) -> list:
    """Get session transcript files, sorted by modification time (newest first)."""
    pattern = os.path.join(PROJECT_DIR, "*.jsonl")
    files = glob.glob(pattern)
    files.sort(key=os.path.getmtime, reverse=True)
    if count:
        files = files[:count]
    return files


def main():
    args = sys.argv[1:]

    if "--help" in args or "-h" in args:
        print(__doc__)
        return

    if "--all" in args:
        files = get_session_files()
        print(f"Analyzing {len(files)} sessions...")
        all_stats = []
        for f in files:
            try:
                s = analyze_session(f)
                if s["assistant_messages"] > 0:
                    all_stats.append(s)
            except Exception as e:
                print(f"  Skip {Path(f).stem[:12]}: {e}")
        print_summary_table(all_stats)

        if "--csv" in args:
            for s in all_stats:
                append_to_csv(s)
        return

    if "--last" in args:
        idx = args.index("--last")
        count = int(args[idx + 1]) if idx + 1 < len(args) else 5
        files = get_session_files(count)
        print(f"Analyzing last {len(files)} sessions...\n")
        all_stats = []
        for f in files:
            try:
                s = analyze_session(f)
                if s["assistant_messages"] > 0:
                    all_stats.append(s)
            except Exception as e:
                print(f"  Skip {Path(f).stem[:12]}: {e}")
        print_summary_table(all_stats)

        for s in sorted(all_stats, key=lambda x: x.get("first_timestamp", "")):
            print_session_report(s)
        return

    if "--session" in args:
        idx = args.index("--session")
        sid = args[idx + 1] if idx + 1 < len(args) else ""
        matches = glob.glob(os.path.join(PROJECT_DIR, f"{sid}*.jsonl"))
        if not matches:
            print(f"No session found matching '{sid}'")
            return
        filepath = matches[0]
    else:
        files = get_session_files(1)
        if not files:
            print("No session transcripts found.")
            return
        filepath = files[0]

    print(f"Analyzing: {Path(filepath).stem[:16]}...")
    stats = analyze_session(filepath)
    print_session_report(stats)

    if "--csv" in args:
        append_to_csv(stats)


if __name__ == "__main__":
    main()
