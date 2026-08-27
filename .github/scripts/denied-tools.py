"""Temporary diagnostic: summarise tool usage from a Claude execution log.

Prints tool NAMES and error/denial counts only — never tool arguments or
results, which can contain secrets and land in a public Actions log.

The log is a heterogeneous list: some records carry `message` as a dict with a
`content` list, others (e.g. the `init` record) carry it as a plain string.
Anything unexpected is skipped rather than raised — a diagnostic must never be
the reason a job goes red.
"""
import json
import sys
from collections import Counter


def records(payload):
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for key in ("messages", "records", "events"):
            value = payload.get(key)
            if isinstance(value, list):
                return value
    return []


def content_blocks(record):
    if not isinstance(record, dict):
        return []
    message = record.get("message")
    if isinstance(message, dict):
        blocks = message.get("content")
    elif isinstance(record.get("content"), list):
        blocks = record.get("content")
    else:
        blocks = None
    if isinstance(blocks, list):
        return [b for b in blocks if isinstance(b, dict)]
    return []


def main():
    try:
        with open(sys.argv[1]) as fh:
            payload = json.load(fh)
    except Exception as exc:  # noqa: BLE001 - never fail the job
        print("could not read execution file:", exc)
        return

    used, errored, pending = Counter(), Counter(), {}
    kinds = Counter()

    for record in records(payload):
        if isinstance(record, dict):
            kinds[record.get("type", record.get("subtype", "?"))] += 1
        for block in content_blocks(record):
            kind = block.get("type")
            if kind == "tool_use":
                name = block.get("name", "?")
                used[name] += 1
                pending[block.get("id")] = name
            elif kind == "tool_result" and block.get("is_error"):
                errored[pending.get(block.get("tool_use_id"), "?")] += 1

    print("=== record types seen ===")
    for name, count in kinds.most_common():
        print(f"{count:3d}  {name}")

    print("\n=== tool_use by name ===")
    if used:
        for name, count in used.most_common():
            print(f"{count:3d}  {name}")
    else:
        print("  (none recorded — log shape may differ from expectations)")

    print("\n=== errored / denied results by tool ===")
    if errored:
        for name, count in errored.most_common():
            print(f"{count:3d}  {name}")
    else:
        print("  (none recorded)")


if __name__ == "__main__":
    main()
