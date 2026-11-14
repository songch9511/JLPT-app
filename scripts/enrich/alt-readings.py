# Other dictionary readings of the reading-card (k = S) words, for the reading question's wrong choices
# (src/distractors.ts): a wrong choice must never be a reading the dictionary accepts for the same written
# word (重複 ちょうふく / じゅうふく, 気 き / け, 早急 さっきゅう / そうきゅう).
#
#   python3 -I scripts/enrich/alt-readings.py [path/to/jamdict.db]
#
# Reads public/data/n{1..5}.json (written form, reading, type) and JMdict from jamdict-data 1.5
# (fetched by fetch-sources.sh; default $ENRICH_CACHE or ~/.cache/luma-enrich/jamdict.db).
# Writes data/readings/n{l}.json = { "<idx>": ["reading", ...] } with only the readings the entry does not
# already give. JMdict is EDRDG CC BY-SA (docs/plan/08 §1). build-data.mjs --extras appends them as column x.
import json, os, re, sqlite3, sys

root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
db = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.environ.get('ENRICH_CACHE', os.path.expanduser('~/.cache/luma-enrich')), 'jamdict.db')
con = sqlite3.connect(db)

def hira(s):
    return ''.join(chr(ord(c) - 0x60) if 'ァ' <= c <= 'ヶ' else c for c in s)

def alternatives(s):
    s = re.sub(r'[(（][^)）]*[)）]', ' ', s)
    return [x for x in (re.sub(r'[～〜~]', '', p).strip() for p in re.split(r'[;；、,，\s]+', s)) if x]

def readings(form):
    out = []
    for (idseq,) in con.execute('select idseq from Kanji where text=?', (form,)):
        for kid, text in con.execute('select ID, text from Kana where idseq=?', (idseq,)):
            restr = [r for (r,) in con.execute('select text from KNR where kid=?', (kid,))]
            if restr and form not in restr:
                continue
            h = hira(text)
            if h not in out:
                out.append(h)
    return out

total = 0
for l in [5, 4, 3, 2, 1]:
    rows = json.load(open(os.path.join(root, 'public', 'data', f'n{l}.json'), encoding='utf8'))
    out = {}
    for idx, row in enumerate(rows):
        if len(row) < 7 or row[6] != 'S':
            continue
        own = set(alternatives(row[1] or row[0]))
        extra = []
        for form in alternatives(row[0]):
            for r in readings(form):
                if r not in own and r not in extra:
                    extra.append(r)
        if extra:
            out[str(idx)] = extra
    total += len(out)
    with open(os.path.join(root, 'data', 'readings', f'n{l}.json'), 'w', encoding='utf8') as f:
        json.dump(out, f, ensure_ascii=False, separators=(',', ':'), sort_keys=False)
        f.write('\n')
    print(f'N{l}: {len(out)} reading-card words with other dictionary readings')
print('total', total)
