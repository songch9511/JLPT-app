// Hand-written outputs for the fixture words (test/fixtures/repo). Each one passes the validator;
// tests derive failing variants from them with `mutate`.

export const GOOD = {
  'n5-0': {
    examples: [
      { ja: 'この本は二度読みました。', kana: 'このほんはにどよみました。', ko: '이 책은 두 번 읽었어요.' },
      { ja: '今日は三十度です。', kana: 'きょうはさんじゅうどです。', ko: '오늘은 30도예요.' },
    ],
    kanji: [{ char: '度', reading: 'ど', kind: 'on', hanja: '법도 도' }],
    tip: '度=도. 횟수를 셀 때 二度(にど)=두 번',
    trap: "한국어 '도'는 온도·각도지만 일본어는 '~번'(횟수)으로 자주 써요",
    related: [
      { word: '回', kana: 'かい', ko: '~회, ~번', rel: 'syn' },
      { word: '温度', kana: 'おんど', ko: '온도', rel: 'kanji' },
    ],
    origin: '',
    meaningFlag: '',
  },
  'n5-1': {
    examples: [
      { ja: '庭に花があります。', kana: 'にわにはながあります。', ko: '정원에 꽃이 있어요.' },
      { ja: '庭で犬が遊んでいます。', kana: 'にわでいぬがあそんでいます。', ko: '정원에서 개가 놀고 있어요.' },
    ],
    kanji: [{ char: '庭', reading: 'にわ', kind: 'kun', hanja: '뜰 정' }],
    tip: "庭(にわ)는 집 마당. '~に/~で'와 함께 자주 써요",
    trap: '',
    related: [
      { word: '公園', kana: 'こうえん', ko: '공원', rel: 'confusable' },
      { word: '家庭', kana: 'かてい', ko: '가정', rel: 'kanji' },
    ],
    origin: '',
    meaningFlag: '',
  },
  'n5-2': {
    examples: [
      { ja: '夏はプールで泳ぎます。', kana: 'なつはプールでおよぎます。', ko: '여름에는 수영장에서 수영해요.' },
      { ja: 'このプールは大きいです。', kana: 'このぷーるはおおきいです。', ko: '이 수영장은 커요.' },
    ],
    kanji: [],
    tip: "プール는 '수영장'. 수영 자체는 水泳(すいえい)라고 해요",
    trap: '',
    related: [
      { word: '海', kana: 'うみ', ko: '바다', rel: 'confusable' },
      { word: '水泳', kana: 'すいえい', ko: '수영', rel: 'syn' },
    ],
    origin: 'pool (영어)',
    meaningFlag: '',
  },
  'n5-3': {
    examples: [
      { ja: '毎朝パンを食べます。', kana: 'まいあさパンをたべます。', ko: '매일 아침 빵을 먹어요.' },
      { ja: '昨日は何を食べましたか。', kana: 'きのうはなにをたべましたか。', ko: '어제는 무엇을 먹었어요?' },
    ],
    kanji: [{ char: '食', reading: 'た', kind: 'kun', hanja: '밥 식' }],
    tip: '食べる(たべる)는 を와 함께: ご飯を食べる',
    trap: '',
    related: [
      { word: '飲む', kana: 'のむ', ko: '마시다', rel: 'confusable' },
      { word: '食事', kana: 'しょくじ', ko: '식사', rel: 'kanji' },
    ],
    origin: '',
    meaningFlag: '',
  },
  'n5-4': {
    examples: [
      { ja: '私は学生です。', kana: 'わたしはがくせいです。', ko: '저는 학생이에요.' },
      { ja: 'この学生は日本語が上手です。', kana: 'このがくせいはにほんごがじょうずです。', ko: '이 학생은 일본어를 잘해요.' },
    ],
    kanji: [
      { char: '学', reading: 'がく', kind: 'on', hanja: '배울 학' },
      { char: '生', reading: 'せい', kind: 'on', hanja: '날 생' },
    ],
    tip: '学生=학생. がく=학, せい=생: ㄱ받침은 く로 끝나요',
    trap: '',
    related: [
      { word: '先生', kana: 'せんせい', ko: '선생님', rel: 'kanji' },
      { word: '大学', kana: 'だいがく', ko: '대학', rel: 'kanji' },
    ],
    origin: '',
    meaningFlag: '',
  },
  'n5-5': {
    examples: [
      { ja: '料理に少し工夫をしました。', kana: 'りょうりにすこしくふうをしました。', ko: '요리에 조금 궁리를 더했어요.' },
      { ja: '工夫すれば、時間が足ります。', kana: 'くふうすれば、じかんがたります。', ko: '방법을 궁리하면 시간이 충분해요.' },
    ],
    kanji: [
      { char: '工', reading: 'く', kind: 'on', hanja: '장인 공' },
      { char: '夫', reading: 'ふう', kind: 'on', hanja: '지아비 부' },
    ],
    tip: "'공부'처럼 보여도 '머리를 써서 방법을 찾는 것'. 工夫する=궁리하다",
    trap: "한국어 '공부'(학습)가 아니라 '궁리·고안'이라는 뜻",
    related: [
      { word: 'アイデア', kana: 'アイデア', ko: '아이디어', rel: 'syn' },
      { word: '勉強', kana: 'べんきょう', ko: '공부', rel: 'confusable' },
      { word: '工場', kana: 'こうじょう', ko: '공장', rel: 'kanji' },
    ],
    origin: '',
    meaningFlag: '',
  },
  'n4-0': {
    examples: [
      { ja: '明日、学校へ行きます。', kana: 'あした、がっこうへいきます。', ko: '내일 학교에 가요.' },
      { ja: '昨日、友だちと行った店です。', kana: 'きのう、ともだちといったみせです。', ko: '어제 친구와 갔던 가게예요.' },
    ],
    kanji: [{ char: '行', reading: 'い', kind: 'kun', hanja: '다닐 행' }],
    tip: '行く(いく)는 장소+へ/に와 함께. て형은 行って',
    trap: '',
    related: [
      { word: '来る', kana: 'くる', ko: '오다', rel: 'ant' },
      { word: '帰る', kana: 'かえる', ko: '돌아가다', rel: 'confusable' },
    ],
    origin: '',
    meaningFlag: '',
  },
  'n4-1': {
    examples: [
      { ja: '毎日日本語を勉強します。', kana: 'まいにちにほんごをべんきょうします。', ko: '매일 일본어를 공부해요.' },
      { ja: '図書館で勉強しました。', kana: 'としょかんでべんきょうしました。', ko: '도서관에서 공부했어요.' },
    ],
    kanji: [
      { char: '勉', reading: 'べん', kind: 'on', hanja: '힘쓸 면' },
      { char: '強', reading: 'きょう', kind: 'on', hanja: '강할 강' },
    ],
    tip: "勉強=면강. 한국어 '공부'에 해당: 勉強する=공부하다",
    trap: '',
    related: [
      { word: '学ぶ', kana: 'まなぶ', ko: '배우다', rel: 'syn' },
      { word: '練習', kana: 'れんしゅう', ko: '연습', rel: 'confusable' },
    ],
    origin: '',
    meaningFlag: '',
  },
}

/** Deep copy of a good output with a change applied. */
export function mutate(id, fn) {
  const o = structuredClone(GOOD[id])
  fn(o)
  return o
}

/** A batch result line as the API returns it. */
export function succeeded(id, output, { stop = 'end_turn', model = 'claude-sonnet-5-5', usage } = {}) {
  return {
    custom_id: id,
    result: {
      type: 'succeeded',
      message: {
        id: `msg_${id}`, type: 'message', role: 'assistant', model, stop_reason: stop,
        stop_details: stop === 'refusal' ? { type: 'refusal', category: 'cyber', explanation: null } : null,
        content: stop === 'refusal' ? [] : [{ type: 'thinking', thinking: '', signature: 'x' }, { type: 'text', text: typeof output === 'string' ? output : JSON.stringify(output) }],
        usage: usage || { input_tokens: 90, cache_creation_input_tokens: 0, cache_read_input_tokens: 1800, output_tokens: 700, output_tokens_details: { thinking_tokens: 150 } },
      },
    },
  }
}
