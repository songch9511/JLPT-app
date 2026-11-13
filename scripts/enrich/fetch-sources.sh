#!/usr/bin/env bash
# Fetches the external word-data sources into a cache outside the repo, pinned and checksummed.
#   - wordfreq 3.1.1 (+ MeCab/ipadic) from PyPI into a virtualenv      -> frequency (CC BY-SA 4.0)
#   - jamdict-data 1.5 sdist from PyPI (JMdict + KANJIDIC2 as SQLite)  -> priority tags, on/kun, korean_h (EDRDG, CC BY-SA)
#   - @vearvip/hanzi-readings 1.0.7 from npm (verbatim Unihan_Readings.txt, Unicode 17.0.0) -> kHangul (Unicode License v3)
# unicode.org, edrdg.org and GitHub release downloads are not reachable from the build sandbox,
# so the registry copies above are used; their checksums are pinned here.
# Usage: scripts/enrich/fetch-sources.sh        (cache: $ENRICH_CACHE or ~/.cache/luma-enrich)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
cache="${ENRICH_CACHE:-$HOME/.cache/luma-enrich}"
mkdir -p "$cache"
cd "$cache"

if [ ! -x venv/bin/python ]; then python3 -m venv venv; fi
venv/bin/pip install -q -r "$here/requirements.txt"

check() { echo "$2  $1" | sha256sum -c --quiet - || { echo "checksum mismatch: $1" >&2; exit 1; }; }

if [ ! -f jamdict.db ]; then
  mkdir -p dl-jamdict && rm -rf dl-jamdict/*
  venv/bin/pip download -q --no-deps --no-binary :all: jamdict-data==1.5 -d dl-jamdict
  check dl-jamdict/jamdict_data-1.5.tar.gz a4247dd9bb3148ab17c1b32fc56d7a7f1c35293b0d6ff2838c811f896d13f415
  tar xzf dl-jamdict/jamdict_data-1.5.tar.gz -C dl-jamdict jamdict_data-1.5/jamdict_data/jamdict.db.xz jamdict_data-1.5/jamdict_data/LICENSE.md
  xz -dc dl-jamdict/jamdict_data-1.5/jamdict_data/jamdict.db.xz > jamdict.db.tmp && mv jamdict.db.tmp jamdict.db
  cp dl-jamdict/jamdict_data-1.5/jamdict_data/LICENSE.md EDRDG-LICENSE.md
fi

if [ ! -f Unihan_Readings.txt ]; then
  mkdir -p dl-unihan && rm -rf dl-unihan/*
  curl -sSfL -o dl-unihan/hanzi-readings-1.0.7.tgz https://registry.npmjs.org/@vearvip/hanzi-readings/-/hanzi-readings-1.0.7.tgz
  check dl-unihan/hanzi-readings-1.0.7.tgz 53715272fc2dc367946c83e7add471fffafa42600465bdf558515dc67fade458
  tar xzf dl-unihan/hanzi-readings-1.0.7.tgz -C dl-unihan package/src/dataSource/Unihan_Readings.txt
  cp dl-unihan/package/src/dataSource/Unihan_Readings.txt Unihan_Readings.txt
  check Unihan_Readings.txt 575e69c9ad85a4737a889a4f94cbd987042a90a1a6cc16dd3f4ed995c715b17c
fi

echo "sources ready in $cache"
echo "next: $cache/venv/bin/python -I $here/freq.py   and   $cache/venv/bin/python -I $here/kanji-table.py"
