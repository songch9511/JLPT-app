# Example sentences

`n5.json`: one short example sentence for each of the 718 N5 words, keyed by the stable word id (`data/ids.json`).

```
{ "<word id>": { "seg": [[text] | [text, reading], …], "ko": "<Korean translation>" } }
```

Joining the first element of every segment gives the Japanese sentence. A segment that contains kanji carries its
reading in hiragana (shown as furigana); kana, okurigana and punctuation are segments without one.

**Machine-written.** The sentences, their segmentation and readings, and the Korean translations were written by a
language model (2026-11), not by a native speaker, and have not been reviewed one by one. They were checked
mechanically: every id is an N5 word, every kanji segment has a hiragana reading and no kana inside it, no kana
segment has one, the sentence is 6–28 characters long and ends in 。 or ？ with no digits, the headword (or its
inflected stem) appears in the sentence, and a one-kanji-run headword's segment reads as the word does. One segment
was split by hand afterwards (w047 お腹 → お + 腹). The Korean translations were then put into one register by hand
(합니다체: …습니다. / …입니다. / …습니까?; requests stay …주세요.).

`scripts/build-data.mjs` checks the format again on every build (`checkExamples`) and writes
`public/data/examples-n5.json`, which the app loads when a card of that level is shown. Other levels have no examples
yet; a level without a file shows none. Corrections go here, then `npm run data`.
