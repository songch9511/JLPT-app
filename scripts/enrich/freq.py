"""Frequency score + introduction order for every word, keyed by the existing index.

Run (after scripts/enrich/fetch-sources.sh):
    $CACHE/venv/bin/python -I scripts/enrich/freq.py
Writes (all committed):
    data/freq/n{l}.json        {"<idx>": f}   f = round(Zipf * 10), 10..80 (never 0, see fallback)
    data/freq/n{l}.src.json    {"<idx>": "<method>"}   how f was obtained (below)
    data/freq/order-n{l}.json  [idx, ...]     introduction order, a permutation of 0..n-1
    data/freq/coverage.json    per-level method counts

Sources: wordfreq 3.1.1 'ja' (CC BY-SA 4.0) and JMdict priority tags / "usually kana" flag
(jamdict-data 1.5, EDRDG licence, CC BY-SA).

Methods, tried in order:
  w  written form found in wordfreq as one token. Max over the entry's written forms plus the other
     kanji spellings JMdict lists for the same entry+reading (曲る -> 曲がる). Verbs and i-adjectives
     written with kanji are summed over their inflection surfaces (書く+書か+書き+書け+書こ+書い).
  h  as w, but the written form is a homograph with several JMdict readings (上 うえ/かみ/じょう):
     Zipf + log10(share), share = this reading's JMdict-priority weight / sum over the form's readings
  c  written form only as a multi-token estimate: wordfreq combines token frequencies (1/f = sum 1/fi);
     we then subtract 0.5 Zipf per extra token, at most 1.0 (wordfreq itself subtracts 1 per break
     for Chinese only), so compounds and inflected forms MeCab splits (しまっ+た, 何+で+も) are not
     overrated by their common parts
  k  JMdict marks the word "usually written in kana" and the kana spelling is not shared by another
     common JMdict word: f = max(written, kana)   (e.g. 沢山 -> たくさん)
  r  written form unknown; kana reading found and not a common homophone: f = 0.8 * Zipf(reading)
  j  neither found; JMdict priority tag -> median Zipf of JMdict words carrying the same tag
  z  nothing at all: floor Zipf 1.0 (f = 10), i.e. "rarer than anything wordfreq lists"

Order: f descending, then JMdict priority rank (news1/ichi1/spec1/spec2/gai1 < other tags < none),
then idx ascending. idx is already a fixed seeded shuffle, so ties stay in a stable random order.
"""
import json
import math
import re
import os
import sqlite3
import statistics
import subprocess
import sys
from collections import Counter, defaultdict

from wordfreq import tokenize, zipf_frequency

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CACHE = os.environ.get('ENRICH_CACHE', os.path.expanduser('~/.cache/luma-enrich'))
OUT = os.path.join(ROOT, 'data', 'freq')
LEVELS = [5, 4, 3, 2, 1]
COMMON = {'news1', 'ichi1', 'spec1', 'spec2', 'gai1'}
UK = 'word usually written using kana alone'
FLOOR = 1.0


def z(s):
    return zipf_frequency(s, 'ja', wordlist='best')


def ntok(s):
    return len(tokenize(s, 'ja'))


class JMdict:
    def __init__(self, path):
        c = sqlite3.connect(path)
        self.kanji = defaultdict(set)   # text -> {idseq}
        self.kana = defaultdict(set)
        self.prio = defaultdict(set)    # idseq -> {tags} (kanji or kana element)
        self.kprio = defaultdict(set)   # (idseq, text) -> {tags}
        for kid, idseq, text in c.execute('select ID, idseq, text from Kanji'):
            self.kanji[text].add(idseq)
        for kid, idseq, text in c.execute('select ID, idseq, text from Kana'):
            self.kana[text].add(idseq)
        for idseq, text, tag in c.execute('select k.idseq, k.text, p.text from KJP p join Kanji k on k.ID = p.kid'):
            self.prio[idseq].add(tag)
            self.kprio[(idseq, text)].add(tag)
        for idseq, text, tag in c.execute('select k.idseq, k.text, p.text from KNP p join Kana k on k.ID = p.kid'):
            self.prio[idseq].add(tag)
            self.kprio[(idseq, text)].add(tag)
        # "usually kana" only when the entry's FIRST sense says so (later senses are often suffix uses)
        self.uk = {idseq for (idseq,) in c.execute(
            'select s.idseq from Sense s join misc m on m.sid = s.ID where m.text = ? '
            'and s.ID = (select min(ID) from Sense where idseq = s.idseq)', (UK,))}
        # written form -> {(idseq, reading)} for homograph splitting
        self.readings_of = defaultdict(set)
        for idseq, ktext, rtext in c.execute(
                'select k.idseq, k.text, n.text from Kanji k join Kana n on n.idseq = k.idseq'):
            self.readings_of[ktext].add((idseq, rtext))
        self.has_kanji = {i for ids in self.kanji.values() for i in ids}
        # single kanji -> common verbs/adjectives written with it plus okurigana (出 -> 出る, 来 -> 来る):
        # wordfreq counts the surface 出 of 出た/出て, so those lexemes compete for the lone kanji's count
        self.stems = defaultdict(set)
        for text, ids in self.kanji.items():
            if len(text) >= 2 and is_han(text[0]) and all('\u3041' <= ch <= '\u309f' for ch in text[1:]):
                for i in ids:
                    if self.kprio.get((i, text), set()) & COMMON:
                        self.stems[text[0]].add((i, text))
        self.common = {i for i, tags in self.prio.items() if tags & COMMON}
        self.db = c
        self._gloss = {}

    def match(self, forms, readings):
        """idseqs of JMdict entries matching the written forms (+ readings when possible)."""
        byk = set().union(*(self.kanji.get(f, set()) for f in forms))
        byr = set().union(*(self.kana.get(r, set()) for r in readings + forms))
        both = byk & byr
        return both or byk or byr

    def match_exact(self, forms, readings):
        """Entries whose kanji AND kana elements both match (or kana-only entries for kana words)."""
        byk = set().union(*(self.kanji.get(f, set()) for f in forms))
        byr = set().union(*(self.kana.get(r, set()) for r in readings))
        return (byk & byr) if byk else byr

    def rank(self, ids):
        tags = set().union(*(self.prio[i] for i in ids)) if ids else set()
        if tags & COMMON:
            return 1, tags
        return (2 if tags else 3), tags

    def weight(self, idseq, form, reading):
        tags = self.kprio.get((idseq, form), set()) | self.kprio.get((idseq, reading), set())
        w = 1.0 if tags & COMMON else (0.3 if tags else 0.1)
        nf = nf_bucket(tags)
        if nf and int(nf[2:]) <= 12:
            w *= 2
        return w

    def glosses(self, idseq):
        if idseq not in self._gloss:
            rows = self.db.execute('select g.text from SenseGloss g join Sense s on s.ID = g.sid '
                                   'where s.idseq = ? and g.lang = ?', (idseq, 'eng')).fetchall()
            self._gloss[idseq] = set().union(*(words(t) for (t,) in rows)) if rows else set()
        return self._gloss[idseq]

    def share(self, form, readings, en):
        """Fraction of a written form's wordfreq count that belongs to this word (homograph split).
        wordfreq counts surface strings, not words: 上 is うえ/かみ/じょう/うわ, the kana より is both the
        particle and 縒り "twist", and the lone kanji 出 includes 出た/出て. Each competing word gets a
        weight from its JMdict priority tags; the share is ours / total. Returns 1.0 when unknown."""
        weights = {}  # competitor key -> weight
        own = set()
        if any(is_han(ch) for ch in form):
            for idseq, r in self.readings_of.get(form, ()):
                weights[r] = max(weights.get(r, 0), self.weight(idseq, form, r))
                if r in readings:
                    own.add(r)
            if len(form) == 1:
                for idseq, text in self.stems.get(form, ()):
                    weights[text] = max(weights.get(text, 0), self.weight(idseq, text, text))
        else:
            # kana spelling: competitors are words normally written this way (no kanji, or usually kana)
            # kana spelling: competitors are all words with this kana; those normally written in kanji
            # (has kanji, not "usually kana") rarely appear in kana, so their weight is cut to a fifth
            ids = sorted(self.kana.get(form, ()))
            if len(ids) < 2:
                return 1.0
            mine = words(en)
            overlap = {i: len(self.glosses(i) & mine) for i in ids}
            best = max(overlap.values())
            if best == 0:
                return 1.0
            for i in ids:
                kana_usual = i not in self.has_kanji or i in self.uk
                weights[i] = self.weight(i, form, form) * (1.0 if kana_usual else 0.2)
                if overlap[i] == best:
                    own.add(i)
        if len(weights) < 2 or not own:
            return 1.0
        return min(1.0, sum(weights[k] for k in own) / sum(weights.values()))

    def first_pos(self, idseq):
        return [t for (t,) in self.db.execute(
            'select p.text from pos p where p.sid = (select min(ID) from Sense where idseq = ?)', (idseq,))]

    def variants(self, ids, readings):
        """Other kanji spellings of the matched entries (曲る -> 曲がる, 引っ繰り返す -> ひっくり返す)."""
        out = set()
        for i in ids:
            for text, pairs in ((t, self.readings_of[t]) for t in self.kanji_of(i)):
                if any(j == i and r in readings for j, r in pairs):
                    out.add(text)
        return out

    def kanji_of(self, idseq):
        if not hasattr(self, '_kanji_of'):
            self._kanji_of = defaultdict(set)
            for text, ids in self.kanji.items():
                for i in ids:
                    self._kanji_of[i].add(text)
        return self._kanji_of.get(idseq, ())

    def common_homophone(self, reading, own):
        return bool((self.kana.get(reading, set()) & self.common) - own)


STOP = {'the', 'and', 'for', 'with', 'one', 'something', 'someone', 'etc', 'esp', 'abbr', 'not', 'from',
        'that', 'which', 'being', 'very', 'thing', 'things', 'used', 'kind'}


def words(text):
    return {t for t in re.findall(r'[a-z]{3,}', text.lower()) if t not in STOP}


def is_han(ch):
    return '\u3400' <= ch <= '\u9fff' or ch in '々〆ヶ'


GODAN = {'u': 'わいえおっ', 'ku': 'かきけこい', 'gu': 'がぎげごい', 'su': 'さしせそ', 'tsu': 'たちてとっ',
         'nu': 'なにねのん', 'bu': 'ばびべぼん', 'mu': 'まみめもん', 'ru': 'らりれろっ'}


def conj_class(pos):
    for p in pos:
        m = re.match(r"Godan verb with '(\w+)' ending", p)
        if m and m.group(1) in GODAN:
            return 'v5' + m.group(1)
        if p.startswith('Godan verb - Iku/Yuku'):
            return 'v5iku'
        if p.startswith('Godan verb - -aru'):
            return 'v5aru'
        if p.startswith('Ichidan verb'):
            return 'v1'
        if p.startswith('Kuru verb'):
            return 'vk'
        if p.startswith('suru verb - special') or p.startswith('suru verb - included'):
            return 'vs'
        if p.startswith('adjective (keiyoushi)') and 'yoi/ii' not in p:
            return 'adj'
    return None


def surfaces(form, cls):
    """Surface tokens MeCab produces for a verb / i-adjective (書く -> 書く 書か 書き 書け 書こ 書い)."""
    if cls in ('v1', 'vk'):
        stem = form[:-1]
        return [form, stem, stem + 'れ', stem + 'ろ', stem + 'よ', stem + 'い']
    if cls == 'vs' and form.endswith('する'):
        stem = form[:-2]
        return [form, stem + 'し', stem + 'さ', stem + 'せ', stem + 'すれ']
    if cls == 'adj':
        stem = form[:-1]
        return [form, stem + 'く', stem + 'かっ', stem + 'けれ']
    if cls and cls.startswith('v5'):
        stem, end = form[:-1], cls[2:]
        row = {'iku': 'かきけこっ', 'aru': 'らりれろっい'}.get(end, GODAN.get(end))
        return [form] + [stem + ch for ch in row]
    return [form]


def lemma_zipf(form, cls):
    """Zipf of a word; verbs/i-adjectives with kanji are summed over their inflection surfaces
    (single-token ones only), because wordfreq counts 書い/書き/書か separately from 書く.
    Returns (zipf, tokens): tokens is 1 when the value is a sum of single tokens, else ntok(form)."""
    if cls and len(form) >= 2 and any(is_han(ch) for ch in form):
        total = sum(10 ** v for v in (z(sf) for sf in dict.fromkeys(surfaces(form, cls))
                                      if ntok(sf) == 1) if v > 0)
        if total:
            return math.log10(total), 1
    return z(form), ntok(form)


def nf_bucket(tags):
    nfs = sorted(t for t in tags if t.startswith('nf'))
    return nfs[0] if nfs else None


def calibrate(jm):
    """Median wordfreq Zipf per JMdict priority bucket (nf01..nf48, then news/ichi/spec without nf)."""
    vals = defaultdict(list)
    for (idseq, text), tags in jm.kprio.items():
        if not any('一' <= ch <= '鿿' for ch in text):
            continue
        key = nf_bucket(tags) or ('common' if tags & COMMON else 'other')
        vals[key].append(z(text))
    return {k: statistics.median(v) for k, v in vals.items() if v}


def score(w, jm, calib):
    forms, readings = w['forms'], w['readings']
    ids = jm.match(forms, readings)
    rank, tags = jm.rank(ids)
    exact = jm.match_exact(forms, readings)
    cls = next((c for c in (conj_class(jm.first_pos(i)) for i in sorted(exact)) if c), None)
    cand = list(forms) + sorted(jm.variants(exact, readings) - set(forms))
    zf, split, multi = 0.0, False, False
    for f in cand:
        v, nt = lemma_zipf(f, cls)
        if v > 0 and nt > 1:
            v = max(v - min(0.5 * (nt - 1), 1.0), FLOOR)  # inferred-word-break penalty, see 'c'
        sh = jm.share(f, readings, w['en']) if v > 0 else 1.0
        if sh < 1.0:
            v = max(v + math.log10(sh), FLOOR)
        if v > zf:
            zf, split, multi = v, sh < 0.8, nt > 1
    written_is_kana = all(f in readings for f in forms)
    homophone = lambda r: jm.common_homophone(r, ids)
    zr, best_r = 0.0, None
    if not written_is_kana:
        for r in readings:
            if r in forms or homophone(r):
                continue
            v = z(r)
            if v > zr:
                zr, best_r = v, r
    if zf > 0:
        method, val = ('c' if multi else 'h' if split else 'w'), zf
        if ids & jm.uk and zr > zf:
            method, val = 'k', zr
    elif zr > 0:
        method, val = 'r', 0.8 * zr
    else:
        key = nf_bucket(tags) or ('common' if tags & COMMON else ('other' if tags else None))
        if key and key in calib:
            method, val = 'j', calib[key]
        else:
            method, val = 'z', FLOOR
    val = max(val, FLOOR)
    return round(val * 10), method, rank


def main():
    db = os.path.join(CACHE, 'jamdict.db')
    if not os.path.exists(db):
        sys.exit(f'missing {db}: run scripts/enrich/fetch-sources.sh first (or set ENRICH_CACHE)')
    words = json.loads(subprocess.check_output(['node', os.path.join(ROOT, 'scripts/enrich/words.mjs')]))
    jm = JMdict(db)
    calib = calibrate(jm)
    os.makedirs(OUT, exist_ok=True)
    coverage = {}
    for n in LEVELS:
        ws = words[str(n)]
        f, src, keys = {}, {}, []
        for w in ws:
            v, m, rank = score(w, jm, calib)
            f[str(w['idx'])] = v
            src[str(w['idx'])] = m
            keys.append((-v, rank, w['idx']))
        order = [k[2] for k in sorted(keys)]
        assert sorted(order) == list(range(len(ws)))
        dump(f'n{n}.json', f)
        dump(f'n{n}.src.json', src)
        with open(os.path.join(OUT, f'order-n{n}.json'), 'w', encoding='utf8') as fh:
            fh.write(json.dumps(order) + '\n')
        c = Counter(src.values())
        coverage[f'n{n}'] = {'words': len(ws), **{m: c.get(m, 0) for m in 'whckrjz'}}
        print(f"N{n}: {len(ws)} words  " + '  '.join(f'{m}={c.get(m, 0)}' for m in 'whckrjz'))
    dump('coverage.json', coverage)


def dump(name, obj):
    with open(os.path.join(OUT, name), 'w', encoding='utf8') as fh:
        fh.write('{\n' + ',\n'.join(f'{json.dumps(k, ensure_ascii=False)}:{json.dumps(v, ensure_ascii=False)}'
                                    for k, v in obj.items()) + '\n}\n')


if __name__ == '__main__':
    main()
