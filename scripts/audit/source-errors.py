"""Cheap mechanical scan for two classes of source-deck errors (docs/plan/12 §6). Reports, never fixes.

Run (after scripts/enrich/fetch-sources.sh; JMdict from the cache):
    python3 -I scripts/audit/source-errors.py [--root <checkout>] [--out <csv>] [--max 40] [--force]
Writes data/tags/audit/source-errors.csv (UTF-8 BOM, opens in Excel), most likely first. Refuses to overwrite a
file that has a `decision` column (the reviewed 2026-11-14 list is a record): use --out for a fresh scan.

(a) headword/reading mismatch, the class of w4db (副 read とりわけ): the headword has kanji, the per-kanji
    on/kun readings of data/hanja/kanji.tsv cannot produce the reading (the pre-pass reading type is 'irr'), and
    JMdict has no entry pairing any of the written forms with the reading. Most likely when the reading is a
    JMdict reading of other kanji and the English gloss matches that entry rather than the headword's.
(b) gloss copied to the wrong reading, the class of w41j (目下 めした glossed as もっか "at present, now"):
    the same headword appears with two readings and both entries carry the same English gloss; the entry whose
    JMdict glosses (for its own form+reading) share fewer of the gloss's words is the suspect. Pairs JMdict cannot
    tell apart (variant readings of one word: 明日 あす/あした) are not reported.
(c) the same error with no sibling in the list: the form+reading is a JMdict entry, the gloss shares no word
    with it, but shares several with another JMdict entry of the same written form and another reading.

Gloss overlap = shared English content words (3+ letters, a short stop list), as in scripts/enrich/freq.py.
Irregular-but-real readings (今日 きょう, 大人 おとな) are JMdict pairs and are never reported under (a).
"""
import csv
import json
import os
import re
import sqlite3
import subprocess
import sys
from collections import defaultdict

args = sys.argv[1:]
opt = lambda name, default: args[args.index(name) + 1] if name in args else default
ROOT = os.path.abspath(opt('--root', os.path.join(os.path.dirname(__file__), '..', '..')))
OUT = opt('--out', os.path.join(ROOT, 'data', 'tags', 'audit', 'source-errors.csv'))
MAX = int(opt('--max', '40'))
CACHE = os.environ.get('ENRICH_CACHE', os.path.expanduser('~/.cache/luma-enrich'))

STOP = {'the', 'and', 'for', 'with', 'one', 'something', 'someone', 'etc', 'esp', 'abbr', 'not', 'from',
        'that', 'which', 'being', 'very', 'thing', 'things', 'used', 'kind', 'nbsp', 'one\'s', 'oneself'}


def words(text):
    return {t for t in re.findall(r'[a-z]{3,}', text.lower()) if t not in STOP}


def norm_en(text):
    return ' '.join(re.sub(r'&nbsp;|[^a-z0-9 ]', ' ', text.lower()).split())


def is_han(ch):
    return '㐀' <= ch <= '鿿' or ch in '々〆ヶ'


def kata_to_hira(s):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)


class JMdict:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.kanji = defaultdict(set)
        self.kana = defaultdict(set)
        for idseq, text in self.db.execute('select idseq, text from Kanji'):
            self.kanji[text].add(idseq)
        for idseq, text in self.db.execute('select idseq, text from Kana'):
            self.kana[text].add(idseq)
        # every English gloss once (per-entry queries on the unindexed tables take minutes)
        self._g = defaultdict(set)
        self._first = {}
        for idseq, text in self.db.execute('select s.idseq, g.text from SenseGloss g join Sense s on s.ID = g.sid '
                                           "where g.lang = 'eng' order by s.ID, g.rowid"):
            self._g[idseq] |= words(text)
            self._first.setdefault(idseq, text)
        self._k = defaultdict(set)
        for text, ids in self.kanji.items():
            for i in ids:
                self._k[i].add(text)

    def glosses(self, idseq):
        return self._g.get(idseq, set())

    def first_gloss(self, idseq):
        return self._first.get(idseq, '')

    def pair(self, forms, readings):
        k = set().union(*(self.kanji.get(f, set()) for f in forms)) if forms else set()
        r = set().union(*(self.kana.get(x, set()) for x in readings)) if readings else set()
        return k & r

    def overlap(self, ids, en):
        mine = words(en)
        return max((len(self.glosses(i) & mine) for i in ids), default=0)


def main():
    db = os.path.join(CACHE, 'jamdict.db')
    if not os.path.exists(db):
        sys.exit(f'missing {db}: run scripts/enrich/fetch-sources.sh first (or set ENRICH_CACHE)')
    jm = JMdict(db)
    levels = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'scripts/enrich/words.mjs')], cwd=ROOT))
    rt = {}
    for n in '54321':
        with open(os.path.join(ROOT, 'data', 'tags', 'prepass', f'n{n}.json'), encoding='utf8') as fh:
            rt.update({k: v.get('rt', '') for k, v in json.load(fh).items()})
    allw = [dict(w, level=int(n)) for n in '54321' for w in levels[n]]
    found = []  # (score, kind, word, evidence, reason)

    def label(ids):
        out = []
        for i in sorted(ids)[:2]:
            ks = sorted(jm._k.get(i, ()))
            out.append(f"{'/'.join(ks[:2]) or '(kana)'} \"{jm.first_gloss(i)}\"")
        return '; '.join(out)

    # (a) headword cannot produce the reading and is not a JMdict pair
    for w in allw:
        forms = [f for f in w['forms'] if any(is_han(c) for c in f)]
        readings = [kata_to_hira(r) for r in w['readings']] + list(w['readings'])
        # the deck writes some suru-nouns' readings with する (入学 にゅうがくする): a convention, not this error
        readings += [r[:-2] for r in readings if r.endswith('する') and not any(f.endswith('する') for f in forms)]
        if not forms or rt.get(w['id']) != 'irr' or jm.pair(forms, readings):
            continue
        by_r = set().union(*(jm.kana.get(r, set()) for r in readings)) - set().union(*(jm.kanji.get(f, set()) for f in forms))
        by_f = set().union(*(jm.kanji.get(f, set()) for f in forms))
        ov_r, ov_f = jm.overlap(by_r, w['en']), jm.overlap(by_f, w['en'])
        if ov_r > ov_f:
            best = max(by_r, key=lambda i: len(jm.glosses(i) & words(w['en'])))
            others = '/'.join(sorted(jm._k.get(best, ())) [:2]) or w['reading']
            score = 4 + ov_r - ov_f
            reason = f"표기 {w['expr']}의 한자 음훈으로 {w['reading']}가 나오지 않고 JMdict에도 없는 짝. 읽기·뜻은 {others}({w['reading']})와 맞음 → 표기 오류 의심"
            ev = f"reading+gloss match JMdict {others} (gloss overlap {ov_r} vs headword {ov_f})"
        elif ov_f > ov_r:
            score = 2 + ov_f - ov_r
            reason = f"표기 {w['expr']}의 한자 음훈으로 {w['reading']}가 나오지 않고 JMdict에도 없는 짝. 뜻은 표기 {w['expr']}의 다른 읽기와 맞음 → 읽기 오류 의심"
            ev = f"gloss matches JMdict {label(by_f)} (overlap {ov_f} vs reading's {ov_r})"
        else:
            score = 1
            reason = f"표기 {w['expr']}의 한자 음훈으로 {w['reading']}가 나오지 않고 JMdict에도 이 짝이 없음 (숙자훈·옛 표기일 수도 있음)"
            ev = 'no JMdict entry with this form and reading; per-kanji readings do not cover it'
        found.append((score, 'a', w, ev, reason))

    # (b) same headword, two readings, identical gloss
    by_expr = defaultdict(list)
    for w in allw:
        by_expr[w['expr']].append(w)
    flagged = set()
    for expr, ws in by_expr.items():
        for i, x in enumerate(ws):
            for y in ws[i + 1:]:
                if x['reading'] == y['reading'] or norm_en(x['en']) != norm_en(y['en']):
                    continue
                forms = [f for f in x['forms'] if any(is_han(c) for c in f)] or x['forms']
                ox = jm.overlap(jm.pair(forms, x['readings']), x['en'])
                oy = jm.overlap(jm.pair(forms, y['readings']), y['en'])
                if ox == oy:
                    # JMdict gives both readings the same sense (明日 あす/あした, 世論 よろん/せろん): not this error
                    continue
                bad, good, ob, og = (x, y, ox, oy) if ox < oy else (y, x, oy, ox)
                if bad['id'] in flagged:
                    continue
                flagged.add(bad['id'])
                own = jm.pair(forms, bad['readings'])
                # strongest when the gloss shares nothing with the entry's own JMdict senses
                found.append(((4 if ob == 0 else 1) + og - ob, 'b', bad,
                              f"same gloss as {good['id']} {good['expr']} {good['reading']} (N{good['level']}); gloss overlap with own JMdict entry {ob} vs {og}; own: {label(own)}",
                              f"영어 뜻이 같은 표기의 다른 읽기 {good['reading']}(N{good['level']})와 똑같고 그쪽 뜻임. {bad['reading']}의 JMdict 뜻과는 맞지 않음 → 뜻이 잘못 옮겨 옴"))

    # (c) gloss belongs to another reading of the same written form, no sibling in the list
    for w in allw:
        if w['id'] in flagged:
            continue
        forms = [f for f in w['forms'] if any(is_han(c) for c in f)]
        if not forms:
            continue
        own = jm.pair(forms, w['readings'])
        if not own:
            continue
        mine = words(w['en'])
        if not mine or jm.overlap(own, w['en']) > 0:
            continue
        others = set().union(*(jm.kanji.get(f, set()) for f in forms)) - own
        if not others:
            continue
        best = max(others, key=lambda i: len(jm.glosses(i) & mine))
        ob = len(jm.glosses(best) & mine)
        if ob < 2 or ob < len(mine) / 2:
            continue
        found.append((1.5 + ob / 2, 'c', w, f"gloss shares nothing with own JMdict entry ({label(own)}) but {ob} words with {label({best})}",
                      f"영어 뜻이 {w['expr']}({w['reading']})의 JMdict 뜻과 전혀 겹치지 않고, 같은 표기의 다른 말 뜻과 겹침 → 다른 읽기의 뜻일 수 있음"))

    found.sort(key=lambda t: (-t[0], t[2]['level'], t[2]['id']))
    # a reviewed list (a `decision` column, docs/plan/12 §6) is a record: never overwrite it
    if os.path.exists(OUT) and '--force' not in args:
        with open(OUT, encoding='utf-8-sig', newline='') as fh:
            if 'decision' in next(csv.reader(fh), []):
                sys.exit(f'{OUT} has a decision column (a reviewed list): write elsewhere with --out <csv>, or pass --force')
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8-sig', newline='') as fh:
        out = csv.writer(fh, lineterminator='\n')
        out.writerow(['rank', 'class', 'id', 'word', 'reading', 'level', 'en', 'ko', 'score', 'evidence', 'reason'])
        for k, (score, kind, w, ev, reason) in enumerate(found[:MAX], 1):
            out.writerow([k, kind, w['id'], w['expr'], w['reading'], f"N{w['level']}", w['en'], w['ko'], f'{score:g}', ev, reason])
    counts = defaultdict(int)
    for t in found:
        counts[t[1]] += 1
    print(f"{len(found)} candidates (a {counts['a']}, b {counts['b']}, c {counts['c']}); wrote top {min(MAX, len(found))} to {OUT}")


if __name__ == '__main__':
    main()
