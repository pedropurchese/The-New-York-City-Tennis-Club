#!/usr/bin/env python3
"""Reformat court finder descriptions into bullet points."""

import csv
import re
from pathlib import Path

CSV_PATH = Path(__file__).resolve().parent.parent / "public/NYC TENNIS COURTS - Sheet1.csv"

DESCRIPTION_OVERRIDES = {
    "McCarren Park Tennis Courts": lambda desc: to_bullets(desc).replace(
        "• After 7 PM: No permit required.",
        "• After 7 PM: Courts switch to first come, first served. No permit required — you can show up after 7:00 PM and walk on without a NYC Parks tennis permit.",
    ).replace(
        "• Winter Access (Approx.\n• Columbus Day - April 27th):",
        "• Winter Access (Approx. Columbus Day - April 27th):",
    ),
}


def normalize_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def split_sentences(line: str) -> list[str]:
    protected = line
    placeholders: dict[str, str] = {}
    for i, abbr in enumerate(
        ["Approx.", "A.M.", "P.M.", "Dr.", "St.", "vs.", "e.g.", "i.e."]
    ):
        token = f"__ABBR{i}__"
        placeholders[token] = abbr
        protected = protected.replace(abbr, token)

    parts = re.split(r"(?<=[.!?])\s+(?=[A-Z\"'(])", protected)
    result: list[str] = []
    for part in parts:
        text = normalize_whitespace(part)
        for token, abbr in placeholders.items():
            text = text.replace(token, abbr)
        if text:
            result.append(text)
    return result


def to_bullets(description: str) -> str:
    if not description or not normalize_whitespace(description):
        return ""

    bullets: list[str] = []
    for raw_line in description.split("\n"):
        line = raw_line.strip()
        if not line:
            continue

        asterisk = re.match(r"^\*+\s*(.+)$", line)
        if asterisk:
            bullets.append(f"• {normalize_whitespace(asterisk.group(1))}")
            continue

        if re.match(r"^[A-Za-z][A-Za-z0-9 &/-]*:\s*$", line):
            bullets.append(f"• {line.rstrip(':').strip()}:")
            continue

        if re.match(r"^[^:]+:\s+\S", line) and len(line) < 260:
            bullets.append(f"• {normalize_whitespace(line)}")
            continue

        for sentence in split_sentences(line):
            bullets.append(f"• {sentence}")

    deduped: list[str] = []
    for bullet in bullets:
        if not deduped or bullet != deduped[-1]:
            deduped.append(bullet)
    return "\n".join(deduped)


def main() -> None:
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        reader = csv.reader(f)
        rows = list(reader)

    header, data = rows[0], rows[1:]
    desc_idx = header.index("Description/Local Tips")

    for row in data:
        if len(row) <= desc_idx:
            continue
        name = row[0]
        original = row[desc_idx]
        if name in DESCRIPTION_OVERRIDES:
            row[desc_idx] = DESCRIPTION_OVERRIDES[name](original)
        else:
            row[desc_idx] = to_bullets(original)

    with CSV_PATH.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f, quoting=csv.QUOTE_MINIMAL)
        writer.writerow(header)
        writer.writerows(data)

    print(f"Reformatted {len(data)} court descriptions.")

    # Sanity check embed fields preserved
    with CSV_PATH.open(newline="", encoding="utf-8") as f:
        checked = list(csv.reader(f))[1:]
    broken = [r[0] for r in checked if len(r) > 11 and r[11] and 'src="' not in r[11]]
    if broken:
        raise SystemExit(f"Embed quotes missing for: {broken[:5]}")


if __name__ == "__main__":
    main()
