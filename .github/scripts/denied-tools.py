"""Temporary diagnostic: summarise tool usage from a Claude execution log.

Prints tool NAMES and error/denial counts only — never tool arguments or
results, which can contain secrets and land in a public Actions log.
"""
import json
import sys
from collections import Counter

try:
    with open(sys.argv[1]) as fh:
        data = json.load(fh)
except Exception as exc:  # noqa: BLE001 - diagnostic must never fail the job
    print("could not read execution file:", exc)
    sys.exit(0)

msgs = data if isinstance(data, list) else data.get("messages", [])

used = Counter()
errored = Counter()
pending = {}

for m in msgs:
    content = (m.get("message") or {}).get("content") or []
    if not isinstance(content, list):
        continue
    for c in content:
        if not isinstance(c, dict):
            continue
        if c.get("type") == "tool_use":
            name = c.get("name", "?")
            used[name] += 1
            pending[c.get("id")] = name
        elif c.get("type") == "tool_result" and c.get("is_error"):
            errored[pending.get(c.get("tool_use_id"), "?")] += 1

print("=== tool_use by name ===")
for name, count in used.most_common():
    print(f"{count:3d}  {name}")

print("\n=== errored / denied results by tool ===")
if errored:
    for name, count in errored.most_common():
        print(f"{count:3d}  {name}")
else:
    print("  (none recorded)")
