"""Per-kanji reading table for the tag pre-pass: Korean hanja readings + Japanese on/kun readings.

Run (after scripts/enrich/fetch-sources.sh):
    $CACHE/venv/bin/python -I scripts/enrich/kanji-table.py
Writes data/hanja/kanji.tsv (committed), one row per kanji used anywhere in the word lists:
    char  ko_unihan  ko_kanjidic  on  kun
  ko_unihan   Unihan kHangul readings (Unicode 17.0.0, Unicode License v3), readings flagged "E"
              (Korean basic education hanja) first, e.g. 料 -> 료 요 ... space-separated
  ko_kanjidic KANJIDIC2 korean_h readings (EDRDG licence, CC BY-SA) not already in ko_unihan;
              this is the only Korean source for Japanese shinjitai forms (図 駅 売 気 ...)
  on / kun    KANJIDIC2 ja_on (katakana) / ja_kun (hiragana, "." marks okurigana) readings
"""
import json
import os
import sqlite3
import subprocess
import sys
from collections import defaultdict

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CACHE = os.environ.get('ENRICH_CACHE', os.path.expanduser('~/.cache/luma-enrich'))


def is_han(ch):
    return '㐀' <= ch <= '鿿' or '豈' <= ch <= '﫿' or '\U00020000' <= ch <= '\U0003134f'


def main():
    uni = os.path.join(CACHE, 'Unihan_Readings.txt')
    db = os.path.join(CACHE, 'jamdict.db')
    for p in (uni, db):
        if not os.path.exists(p):
            sys.exit(f'missing {p}: run scripts/enrich/fetch-sources.sh first (or set ENRICH_CACHE)')
    words = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'scripts/enrich/words.mjs')]))
    chars = sorted({ch for ws in words.values() for w in ws for f in w['forms'] for ch in f if is_han(ch)})

    khangul = {}
    with open(uni, encoding='utf8') as fh:
        for line in fh:
            if '\tkHangul\t' not in line:
                continue
            cp, _, val = line.rstrip('\n').split('\t')
            items = [v.split(':') for v in val.split()]
            # E = in the Korean education hanja list; put those readings first, keep source order otherwise
            items.sort(key=lambda kv: 0 if len(kv) > 1 and 'E' in kv[1] else 1)
            khangul[chr(int(cp[2:], 16))] = [kv[0] for kv in items]

    c = sqlite3.connect(db)
    kd = defaultdict(lambda: defaultdict(list))
    for lit, typ, val in c.execute(
            "select ch.literal, r.r_type, r.value from character ch join rm_group g on g.cid = ch.ID "
            "join reading r on r.gid = g.ID where r.r_type in ('korean_h', 'ja_on', 'ja_kun') order by r.rowid"):
        kd[lit][typ].append(val)

    out = os.path.join(ROOT, 'data', 'hanja', 'kanji.tsv')
    os.makedirs(os.path.dirname(out), exist_ok=True)
    missing = []
    with open(out, 'w', encoding='utf8') as fh:
        fh.write('# char\tko_unihan\tko_kanjidic\ton\tkun   (see data/hanja/NOTICE.md for sources and licences)\n')
        for ch in chars:
            u = khangul.get(ch, [])
            k = [r for r in dict.fromkeys(kd[ch]['korean_h']) if r not in u]
            if not u and not k:
                missing.append(ch)
            fh.write('\t'.join([ch, ' '.join(u), ' '.join(k), ' '.join(dict.fromkeys(kd[ch]['ja_on'])),
                                ' '.join(dict.fromkeys(kd[ch]['ja_kun']))]) + '\n')
    print(f'{len(chars)} kanji -> {out}; no Korean reading: {"".join(missing) or "-"}')


if __name__ == '__main__':
    main()
