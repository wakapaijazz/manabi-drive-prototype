/*
 * まなびドライブ：問題データと自動出題ロジック
 * ここを編集すれば、新しい漢字や英語の問題を追加できます。
 *
 * 1問の共通形式:
 * {
 *   id: 'unique-id', question: 'もんだい', choices: ['ひだり', 'みぎ'],
 *   correctIndex: 0 または 1, explanation: 'かいせつ',
 *   visual: { type: '...' } (省略可), speech: '...' (英語のみ、省略可)
 * }
 *
 * file:// でも開けるように、JSONをfetchせず通常のscriptとして読み込みます。
 */
(function () {
  'use strict';

  const KANJI = [
    // grade 1: よみ / かき / じゅくご
    { id:'k1-yama', grade:1, kind:'reading', word:'山', answer:'やま', wrong:'かわ' },
    { id:'k1-kawa', grade:1, kind:'reading', word:'川', answer:'かわ', wrong:'うみ' },
    { id:'k1-mori', grade:1, kind:'reading', word:'森', answer:'もり', wrong:'はやし' },
    { id:'k1-ame', grade:1, kind:'reading', word:'雨', answer:'あめ', wrong:'ゆき' },
    { id:'k1-hana', grade:1, kind:'reading', word:'花', answer:'はな', wrong:'くさ' },
    { id:'k1-sora', grade:1, kind:'reading', word:'空', answer:'そら', wrong:'うみ' },
    { id:'k1-write-water', grade:1, kind:'writing', word:'みず', answer:'水', wrong:'木' },
    { id:'k1-write-fire', grade:1, kind:'writing', word:'ひ（もえる ひ）', answer:'火', wrong:'日' },
    { id:'k1-write-gold', grade:1, kind:'writing', word:'きん', answer:'金', wrong:'玉' },
    { id:'k1-write-tree', grade:1, kind:'writing', word:'き', answer:'木', wrong:'本' },
    { id:'k1-comp-school', grade:1, kind:'compound', word:'学校', answer:'がっこう', wrong:'がくこう' },
    { id:'k1-comp-blue', grade:1, kind:'compound', word:'青空', answer:'あおぞら', wrong:'あおから' },
    { id:'k1-comp-volcano', grade:1, kind:'compound', word:'火山', answer:'かざん', wrong:'ひやま' },
    { id:'k1-comp-book', grade:1, kind:'compound', word:'本日', answer:'ほんじつ', wrong:'ほんひ' },

    // grade 2
    { id:'k2-sea', grade:2, kind:'reading', word:'海', answer:'うみ', wrong:'いけ' },
    { id:'k2-spring', grade:2, kind:'reading', word:'春', answer:'はる', wrong:'あき' },
    { id:'k2-summer', grade:2, kind:'reading', word:'夏', answer:'なつ', wrong:'ふゆ' },
    { id:'k2-autumn', grade:2, kind:'reading', word:'秋', answer:'あき', wrong:'はる' },
    { id:'k2-winter', grade:2, kind:'reading', word:'冬', answer:'ふゆ', wrong:'なつ' },
    { id:'k2-read', grade:2, kind:'reading', word:'読む', answer:'よむ', wrong:'かく' },
    { id:'k2-write-sea', grade:2, kind:'writing', word:'うみ', answer:'海', wrong:'毎' },
    { id:'k2-write-spring', grade:2, kind:'writing', word:'はる', answer:'春', wrong:'秋' },
    { id:'k2-write-star', grade:2, kind:'writing', word:'ほし', answer:'星', wrong:'晴' },
    { id:'k2-write-paper', grade:2, kind:'writing', word:'かみ', answer:'紙', wrong:'雪' },
    { id:'k2-comp-train', grade:2, kind:'compound', word:'電車', answer:'でんしゃ', wrong:'てんしゃ' },
    { id:'k2-comp-weather', grade:2, kind:'compound', word:'天気', answer:'てんき', wrong:'でんき' },
    { id:'k2-comp-read', grade:2, kind:'compound', word:'読書', answer:'どくしょ', wrong:'とくしょ' },
    { id:'k2-comp-clock', grade:2, kind:'compound', word:'時計', answer:'とけい', wrong:'ときけい' },

    // grade 3
    { id:'k3-bridge', grade:3, kind:'reading', word:'橋', answer:'はし', wrong:'かわ' },
    { id:'k3-island', grade:3, kind:'reading', word:'島', answer:'しま', wrong:'やま' },
    { id:'k3-lake', grade:3, kind:'reading', word:'湖', answer:'みずうみ', wrong:'うみべ' },
    { id:'k3-swim', grade:3, kind:'reading', word:'泳ぐ', answer:'およぐ', wrong:'あそぶ' },
    { id:'k3-cold', grade:3, kind:'reading', word:'寒い', answer:'さむい', wrong:'あつい' },
    { id:'k3-travel', grade:3, kind:'reading', word:'旅', answer:'たび', wrong:'みち' },
    { id:'k3-write-bridge', grade:3, kind:'writing', word:'はし（川にかかる）', answer:'橋', wrong:'様' },
    { id:'k3-write-lake', grade:3, kind:'writing', word:'みずうみ', answer:'湖', wrong:'海' },
    { id:'k3-write-island', grade:3, kind:'writing', word:'しま', answer:'島', wrong:'鳥' },
    { id:'k3-write-swim', grade:3, kind:'writing', word:'およぐ', answer:'泳ぐ', wrong:'遊ぐ' },
    { id:'k3-comp-library', grade:3, kind:'compound', word:'図書館', answer:'としょかん', wrong:'ずしょかん' },
    { id:'k3-comp-exercise', grade:3, kind:'compound', word:'運動', answer:'うんどう', wrong:'うんとう' },
    { id:'k3-comp-travel', grade:3, kind:'compound', word:'旅行', answer:'りょこう', wrong:'りょうこう' },
    { id:'k3-comp-study', grade:3, kind:'compound', word:'勉強', answer:'べんきょう', wrong:'べんごう' },
    { id:'k3-comp-station', grade:3, kind:'compound', word:'駅前', answer:'えきまえ', wrong:'やくまえ' },

    // grade 1: 追加の読み・書き・熟語
    { id:'k1-one', grade:1, kind:'reading', word:'一', answer:'いち', wrong:'に' },
    { id:'k1-two', grade:1, kind:'reading', word:'二', answer:'に', wrong:'さん' },
    { id:'k1-three', grade:1, kind:'reading', word:'三', answer:'さん', wrong:'よん' },
    { id:'k1-four', grade:1, kind:'reading', word:'四', answer:'よん', wrong:'ご' },
    { id:'k1-five', grade:1, kind:'reading', word:'五', answer:'ご', wrong:'ろく' },
    { id:'k1-six', grade:1, kind:'reading', word:'六', answer:'ろく', wrong:'なな' },
    { id:'k1-seven', grade:1, kind:'reading', word:'七', answer:'なな', wrong:'はち' },
    { id:'k1-eight', grade:1, kind:'reading', word:'八', answer:'はち', wrong:'きゅう' },
    { id:'k1-nine', grade:1, kind:'reading', word:'九', answer:'きゅう', wrong:'じゅう' },
    { id:'k1-write-one', grade:1, kind:'writing', word:'ひとつ', answer:'一', wrong:'二' },
    { id:'k1-write-two', grade:1, kind:'writing', word:'ふたつ', answer:'二', wrong:'三' },
    { id:'k1-write-three', grade:1, kind:'writing', word:'みっつ', answer:'三', wrong:'四' },
    { id:'k1-write-four', grade:1, kind:'writing', word:'よっつ', answer:'四', wrong:'五' },
    { id:'k1-write-five', grade:1, kind:'writing', word:'いつつ', answer:'五', wrong:'六' },
    { id:'k1-comp-year', grade:1, kind:'compound', word:'一年', answer:'いちねん', wrong:'いちにち' },
    { id:'k1-comp-person', grade:1, kind:'compound', word:'二人', answer:'ふたり', wrong:'さんにん' },
    { id:'k1-comp-day', grade:1, kind:'compound', word:'三日', answer:'みっか', wrong:'よっか' },
    { id:'k1-comp-month', grade:1, kind:'compound', word:'六月', answer:'ろくがつ', wrong:'ろくつき' },
    { id:'k1-comp-hundred', grade:1, kind:'compound', word:'百円', answer:'ひゃくえん', wrong:'ひゃくねん' },

    // grade 2: 追加の読み・書き・熟語
    { id:'k2-go', grade:2, kind:'reading', word:'行く', answer:'いく', wrong:'くる' },
    { id:'k2-come', grade:2, kind:'reading', word:'来る', answer:'くる', wrong:'いく' },
    { id:'k2-new', grade:2, kind:'reading', word:'新しい', answer:'あたらしい', wrong:'ふるい' },
    { id:'k2-old', grade:2, kind:'reading', word:'古い', answer:'ふるい', wrong:'あたらしい' },
    { id:'k2-high', grade:2, kind:'reading', word:'高い', answer:'たかい', wrong:'やすい' },
    { id:'k2-near', grade:2, kind:'reading', word:'近い', answer:'ちかい', wrong:'とおい' },
    { id:'k2-far', grade:2, kind:'reading', word:'遠い', answer:'とおい', wrong:'ちかい' },
    { id:'k2-strong', grade:2, kind:'reading', word:'強い', answer:'つよい', wrong:'よわい' },
    { id:'k2-weak', grade:2, kind:'reading', word:'弱い', answer:'よわい', wrong:'つよい' },
    { id:'k2-write-go', grade:2, kind:'writing', word:'いく', answer:'行く', wrong:'来る' },
    { id:'k2-write-new', grade:2, kind:'writing', word:'あたらしい', answer:'新しい', wrong:'古い' },
    { id:'k2-write-high', grade:2, kind:'writing', word:'たかい', answer:'高い', wrong:'安い' },
    { id:'k2-write-near', grade:2, kind:'writing', word:'ちかい', answer:'近い', wrong:'遠い' },
    { id:'k2-write-strong', grade:2, kind:'writing', word:'つよい', answer:'強い', wrong:'弱い' },
    { id:'k2-comp-am', grade:2, kind:'compound', word:'午前', answer:'ごぜん', wrong:'ごご' },
    { id:'k2-comp-pm', grade:2, kind:'compound', word:'午後', answer:'ごご', wrong:'ごぜん' },
    { id:'k2-comp-eastwest', grade:2, kind:'compound', word:'東西', answer:'とうざい', wrong:'なんぼく' },
    { id:'k2-comp-southnorth', grade:2, kind:'compound', word:'南北', answer:'なんぼく', wrong:'とうざい' },
    { id:'k2-comp-everyday', grade:2, kind:'compound', word:'毎日', answer:'まいにち', wrong:'まいばん' },

    // grade 3: 追加の読み・書き・熟語
    { id:'k3-leaf', grade:3, kind:'reading', word:'葉', answer:'は', wrong:'えだ' },
    { id:'k3-field', grade:3, kind:'reading', word:'畑', answer:'はたけ', wrong:'たんぼ' },
    { id:'k3-port', grade:3, kind:'reading', word:'港', answer:'みなと', wrong:'かわ' },
    { id:'k3-old-days', grade:3, kind:'reading', word:'昔', answer:'むかし', wrong:'いま' },
    { id:'k3-second', grade:3, kind:'reading', word:'秒', answer:'びょう', wrong:'ふん' },
    { id:'k3-iron', grade:3, kind:'reading', word:'鉄', answer:'てつ', wrong:'かね' },
    { id:'k3-win', grade:3, kind:'reading', word:'勝つ', answer:'かつ', wrong:'まつ' },
    { id:'k3-lose', grade:3, kind:'reading', word:'負ける', answer:'まける', wrong:'かける' },
    { id:'k3-write-leaf', grade:3, kind:'writing', word:'は', answer:'葉', wrong:'草' },
    { id:'k3-write-field', grade:3, kind:'writing', word:'はたけ', answer:'畑', wrong:'田' },
    { id:'k3-write-port', grade:3, kind:'writing', word:'みなと', answer:'港', wrong:'湖' },
    { id:'k3-write-iron', grade:3, kind:'writing', word:'てつ', answer:'鉄', wrong:'金' },
    { id:'k3-write-win', grade:3, kind:'writing', word:'かつ', answer:'勝つ', wrong:'負ける' },
    { id:'k3-write-lose', grade:3, kind:'writing', word:'まける', answer:'負ける', wrong:'勝つ' },
    { id:'k3-comp-science', grade:3, kind:'compound', word:'理科', answer:'りか', wrong:'りょうか' },
    { id:'k3-comp-society', grade:3, kind:'compound', word:'社会', answer:'しゃかい', wrong:'しゃがい' },
    { id:'k3-comp-world', grade:3, kind:'compound', word:'世界', answer:'せかい', wrong:'せいかい' },
    { id:'k3-comp-presentation', grade:3, kind:'compound', word:'発表', answer:'はっぴょう', wrong:'はつひょう' },
    { id:'k3-comp-shape', grade:3, kind:'compound', word:'図形', answer:'ずけい', wrong:'とけい' }
  ];

  const KANJI_SENTENCES = [
    {id:'ks1-day', grade:1, text:'きょうは よい 【日】 です。', target:'日', fillWrong:'目', reading:'ひ', readingWrong:'め'},
    {id:'ks1-tree', grade:1, text:'大きな 【木】 が あります。', target:'木', fillWrong:'本', reading:'き', readingWrong:'もり'},
    {id:'ks1-book', grade:1, text:'学校で 【本】 を よみます。', target:'本', fillWrong:'木', reading:'ほん', readingWrong:'もと'},
    {id:'ks1-river', grade:1, text:'【川】 で あそびます。', target:'川', fillWrong:'山', reading:'かわ', readingWrong:'うみ'},
    {id:'ks1-sky', grade:1, text:'あさ、【空】 が あおい。', target:'空', fillWrong:'天', reading:'そら', readingWrong:'うみ'},
    {id:'ks2-spring', grade:2, text:'【春】 に 花が さきます。', target:'春', fillWrong:'夏', reading:'はる', readingWrong:'あき'},
    {id:'ks2-summer', grade:2, text:'【夏】 は あついです。', target:'夏', fillWrong:'冬', reading:'なつ', readingWrong:'ふゆ'},
    {id:'ks2-train', grade:2, text:'【電車】 で 駅へ 行く。', target:'電車', fillWrong:'電気', reading:'でんしゃ', readingWrong:'てんしゃ'},
    {id:'ks2-rain', grade:2, text:'【雨】 の 日は かさを さします。', target:'雨', fillWrong:'雪', reading:'あめ', readingWrong:'ゆき'},
    {id:'ks2-star', grade:2, text:'大きな 【星】 を みつけた。', target:'星', fillWrong:'晴', reading:'ほし', readingWrong:'はれ'},
    {id:'ks3-library', grade:3, text:'【図書館】 で 本を かりた。', target:'図書館', fillWrong:'図書室', reading:'としょかん', readingWrong:'ずしょかん'},
    {id:'ks3-trip', grade:3, text:'【旅行】 に 行きます。', target:'旅行', fillWrong:'旅校', reading:'りょこう', readingWrong:'りょうこう'},
    {id:'ks3-bridge', grade:3, text:'川に かかる 【橋】 を わたる。', target:'橋', fillWrong:'様', reading:'はし', readingWrong:'はじ'},
    {id:'ks3-study', grade:3, text:'毎日、【勉強】 を がんばる。', target:'勉強', fillWrong:'努力', reading:'べんきょう', readingWrong:'べんごう'},

    // grade 1: ぶんしょうの よみ・かんじ
    {id:'ks1-month', grade:1, text:'【月】 が きれいに みえます。', target:'月', fillWrong:'日', reading:'つき', readingWrong:'ひ'},
    {id:'ks1-fire', grade:1, text:'【火】 を つかうときは 気をつけます。', target:'火', fillWrong:'水', reading:'ひ', readingWrong:'みず'},
    {id:'ks1-water', grade:1, text:'コップに 【水】 を いれます。', target:'水', fillWrong:'火', reading:'みず', readingWrong:'ひ'},
    {id:'ks1-gold', grade:1, text:'【金】 よう日は 学校へ いきます。', target:'金', fillWrong:'土', reading:'きん', readingWrong:'つち'},
    {id:'ks1-earth', grade:1, text:'【土】 の うえに 花を うえます。', target:'土', fillWrong:'金', reading:'つち', readingWrong:'きん'},
    {id:'ks1-person', grade:1, text:'あの 【人】 は 先生です。', target:'人', fillWrong:'入', reading:'ひと', readingWrong:'いり'},
    {id:'ks1-child', grade:1, text:'【子】 どもが 公園で あそぶ。', target:'子', fillWrong:'字', reading:'こ', readingWrong:'じ'},
    {id:'ks1-woman', grade:1, text:'【女】 の こどもが わらった。', target:'女', fillWrong:'男', reading:'おんな', readingWrong:'おとこ'},
    {id:'ks1-man', grade:1, text:'【男】 の こどもが はしる。', target:'男', fillWrong:'女', reading:'おとこ', readingWrong:'おんな'},
    {id:'ks1-eye', grade:1, text:'【目】 を とじて ください。', target:'目', fillWrong:'耳', reading:'め', readingWrong:'みみ'},
    {id:'ks1-ear', grade:1, text:'【耳】 で おとを ききます。', target:'耳', fillWrong:'目', reading:'みみ', readingWrong:'め'},
    {id:'ks1-mouth', grade:1, text:'【口】 を おおきく あけます。', target:'口', fillWrong:'日', reading:'くち', readingWrong:'ひ'},
    {id:'ks1-hand', grade:1, text:'【手】 を あらいましょう。', target:'手', fillWrong:'足', reading:'て', readingWrong:'あし'},
    {id:'ks1-foot', grade:1, text:'【足】 で ボールを けります。', target:'足', fillWrong:'手', reading:'あし', readingWrong:'て'},
    {id:'ks1-power', grade:1, text:'【力】 を いっぱい だします。', target:'力', fillWrong:'刀', reading:'ちから', readingWrong:'かたな'},
    {id:'ks1-name', grade:1, text:'紙に 【名】 前を かきます。', target:'名', fillWrong:'多', reading:'な', readingWrong:'おお'},
    {id:'ks1-year', grade:1, text:'【年】 が かわると しんねんです。', target:'年', fillWrong:'毎', reading:'とし', readingWrong:'まい'},
    {id:'ks1-big', grade:1, text:'【大】 きな 木が あります。', target:'大', fillWrong:'小', reading:'おお', readingWrong:'ちい'},
    {id:'ks1-small', grade:1, text:'【小】 さな 花を みつけた。', target:'小', fillWrong:'大', reading:'ちい', readingWrong:'おお'},
    {id:'ks1-up', grade:1, text:'つくえの 【上】 に 本が あります。', target:'上', fillWrong:'下', reading:'うえ', readingWrong:'した'},
    {id:'ks1-down', grade:1, text:'いすの 【下】 に ねこが います。', target:'下', fillWrong:'上', reading:'した', readingWrong:'うえ'},
    {id:'ks1-left', grade:1, text:'【左】 の 手を あげます。', target:'左', fillWrong:'右', reading:'ひだり', readingWrong:'みぎ'},
    {id:'ks1-right', grade:1, text:'【右】 の 手を あげます。', target:'右', fillWrong:'左', reading:'みぎ', readingWrong:'ひだり'},
    {id:'ks1-middle', grade:1, text:'まんなかの 【中】 に すわります。', target:'中', fillWrong:'外', reading:'なか', readingWrong:'そと'},
    {id:'ks1-ten', grade:1, text:'りんごが 【十】 こ あります。', target:'十', fillWrong:'千', reading:'じゅう', readingWrong:'せん'},
    {id:'ks1-hundred', grade:1, text:'【百】 円を はらいます。', target:'百', fillWrong:'千', reading:'ひゃく', readingWrong:'せん'},
    {id:'ks1-thousand', grade:1, text:'【千】 円を もらいました。', target:'千', fillWrong:'百', reading:'せん', readingWrong:'ひゃく'},
    {id:'ks1-first', grade:1, text:'【先】 生に あいさつします。', target:'先', fillWrong:'生', reading:'せん', readingWrong:'なま'},
    {id:'ks1-school', grade:1, text:'【学校】 で べんきょうします。', target:'学校', fillWrong:'学年', reading:'がっこう', readingWrong:'がくねん'},

    // grade 2: ぶんしょうの よみ・かんじ
    {id:'ks2-autumn', grade:2, text:'【秋】 は すずしいです。', target:'秋', fillWrong:'春', reading:'あき', readingWrong:'はる'},
    {id:'ks2-winter', grade:2, text:'【冬】 に ゆきが ふります。', target:'冬', fillWrong:'夏', reading:'ふゆ', readingWrong:'なつ'},
    {id:'ks2-read', grade:2, text:'毎晩、本を 【読む】。', target:'読む', fillWrong:'書く', reading:'よむ', readingWrong:'かく'},
    {id:'ks2-paper', grade:2, text:'白い 【紙】 に えを かきます。', target:'紙', fillWrong:'雪', reading:'かみ', readingWrong:'ゆき'},
    {id:'ks2-weather', grade:2, text:'きょうの 【天気】 は はれです。', target:'天気', fillWrong:'電気', reading:'てんき', readingWrong:'でんき'},
    {id:'ks2-clock', grade:2, text:'【時計】 を みて でかけます。', target:'時計', fillWrong:'時代', reading:'とけい', readingWrong:'じだい'},
    {id:'ks2-new', grade:2, text:'【新しい】 くつを はきます。', target:'新しい', fillWrong:'古い', reading:'あたらしい', readingWrong:'ふるい'},
    {id:'ks2-old', grade:2, text:'これは 【古い】 写真です。', target:'古い', fillWrong:'新しい', reading:'ふるい', readingWrong:'あたらしい'},
    {id:'ks2-high', grade:2, text:'この 山は 【高い】。', target:'高い', fillWrong:'低い', reading:'たかい', readingWrong:'ひくい'},
    {id:'ks2-near', grade:2, text:'駅は ここから 【近い】。', target:'近い', fillWrong:'遠い', reading:'ちかい', readingWrong:'とおい'},
    {id:'ks2-far', grade:2, text:'海は 家から 【遠い】。', target:'遠い', fillWrong:'近い', reading:'とおい', readingWrong:'ちかい'},
    {id:'ks2-strong', grade:2, text:'風が 【強い】 日です。', target:'強い', fillWrong:'弱い', reading:'つよい', readingWrong:'よわい'},
    {id:'ks2-weak', grade:2, text:'今日は 風が 【弱い】。', target:'弱い', fillWrong:'強い', reading:'よわい', readingWrong:'つよい'},
    {id:'ks2-go', grade:2, text:'明日、学校へ 【行く】。', target:'行く', fillWrong:'来る', reading:'いく', readingWrong:'くる'},
    {id:'ks2-come', grade:2, text:'友だちが 家へ 【来る】。', target:'来る', fillWrong:'行く', reading:'くる', readingWrong:'いく'},
    {id:'ks2-am', grade:2, text:'【午前】 に さんぽします。', target:'午前', fillWrong:'午後', reading:'ごぜん', readingWrong:'ごご'},
    {id:'ks2-pm', grade:2, text:'【午後】 に おやつを たべます。', target:'午後', fillWrong:'午前', reading:'ごご', readingWrong:'ごぜん'},
    {id:'ks2-east', grade:2, text:'たいようは 【東】 から のぼる。', target:'東', fillWrong:'西', reading:'ひがし', readingWrong:'にし'},
    {id:'ks2-west', grade:2, text:'たいようは 【西】 に しずむ。', target:'西', fillWrong:'東', reading:'にし', readingWrong:'ひがし'},
    {id:'ks2-south', grade:2, text:'鳥が 【南】 へ とんでいく。', target:'南', fillWrong:'北', reading:'みなみ', readingWrong:'きた'},
    {id:'ks2-north', grade:2, text:'【北】 の くにへ たびをする。', target:'北', fillWrong:'南', reading:'きた', readingWrong:'みなみ'},
    {id:'ks2-everyday', grade:2, text:'【毎日】 はやおきします。', target:'毎日', fillWrong:'毎年', reading:'まいにち', readingWrong:'まいとし'},
    {id:'ks2-electric', grade:2, text:'へやの 【電気】 を つけます。', target:'電気', fillWrong:'天気', reading:'でんき', readingWrong:'てんき'},
    {id:'ks2-morning', grade:2, text:'【朝】 ごはんを たべます。', target:'朝', fillWrong:'夜', reading:'あさ', readingWrong:'よる'},
    {id:'ks2-noon', grade:2, text:'【昼】 に おべんとうを たべる。', target:'昼', fillWrong:'夜', reading:'ひる', readingWrong:'よる'},
    {id:'ks2-night', grade:2, text:'【夜】 は 星が みえます。', target:'夜', fillWrong:'昼', reading:'よる', readingWrong:'ひる'},
    {id:'ks2-snow', grade:2, text:'白い 【雪】 が ふりました。', target:'雪', fillWrong:'雨', reading:'ゆき', readingWrong:'あめ'},
    {id:'ks2-fish', grade:2, text:'川で 【魚】 を みつけた。', target:'魚', fillWrong:'鳥', reading:'さかな', readingWrong:'とり'},

    // grade 3: ぶんしょうの よみ・かんじ
    {id:'ks3-library-visit', grade:3, text:'【図書館】 で しずかに 本を よむ。', target:'図書館', fillWrong:'図書室', reading:'としょかん', readingWrong:'ずしょかん'},
    {id:'ks3-bridge-cross', grade:3, text:'大きな 【橋】 を わたりました。', target:'橋', fillWrong:'柱', reading:'はし', readingWrong:'はじ'},
    {id:'ks3-travel-plan', grade:3, text:'夏休みに 【旅行】 を します。', target:'旅行', fillWrong:'旅館', reading:'りょこう', readingWrong:'りょかん'},
    {id:'ks3-study-plan', grade:3, text:'算数の 【勉強】 を します。', target:'勉強', fillWrong:'運動', reading:'べんきょう', readingWrong:'べんごう'},
    {id:'ks3-leaf-fall', grade:3, text:'秋に 【葉】 が おちます。', target:'葉', fillWrong:'草', reading:'は', readingWrong:'くさ'},
    {id:'ks3-field-work', grade:3, text:'【畑】 で 野菜を そだてる。', target:'畑', fillWrong:'池', reading:'はたけ', readingWrong:'いけ'},
    {id:'ks3-port-town', grade:3, text:'船が 【港】 に はいる。', target:'港', fillWrong:'湖', reading:'みなと', readingWrong:'みずうみ'},
    {id:'ks3-old-days', grade:3, text:'【昔】 の くらしを しらべる。', target:'昔', fillWrong:'今', reading:'むかし', readingWrong:'いま'},
    {id:'ks3-second', grade:3, text:'あと 【秒】 で スタートします。', target:'秒', fillWrong:'分', reading:'びょう', readingWrong:'ふん'},
    {id:'ks3-iron', grade:3, text:'【鉄】 の つよい はしです。', target:'鉄', fillWrong:'銀', reading:'てつ', readingWrong:'ぎん'},
    {id:'ks3-win', grade:3, text:'試合に 【勝つ】 ために れんしゅうする。', target:'勝つ', fillWrong:'負ける', reading:'かつ', readingWrong:'まける'},
    {id:'ks3-lose', grade:3, text:'試合に 【負ける】 と くやしい。', target:'負ける', fillWrong:'勝つ', reading:'まける', readingWrong:'かつ'},
    {id:'ks3-science', grade:3, text:'【理科】 で 植物を そだてる。', target:'理科', fillWrong:'社会', reading:'りか', readingWrong:'しゃかい'},
    {id:'ks3-society', grade:3, text:'【社会】 で 町の しくみを まなぶ。', target:'社会', fillWrong:'理科', reading:'しゃかい', readingWrong:'りか'},
    {id:'ks3-world', grade:3, text:'【世界】 の ことを しらべる。', target:'世界', fillWrong:'世代', reading:'せかい', readingWrong:'せだい'},
    {id:'ks3-presentation', grade:3, text:'クラスで 【発表】 を しました。', target:'発表', fillWrong:'発見', reading:'はっぴょう', readingWrong:'はっけん'},
    {id:'ks3-shape', grade:3, text:'三角形は 【図形】 の なかまです。', target:'図形', fillWrong:'時計', reading:'ずけい', readingWrong:'とけい'},
    {id:'ks3-island', grade:3, text:'海に 小さな 【島】 が あります。', target:'島', fillWrong:'鳥', reading:'しま', readingWrong:'とり'},
    {id:'ks3-lake', grade:3, text:'山の なかに 【湖】 が あります。', target:'湖', fillWrong:'海', reading:'みずうみ', readingWrong:'うみ'},
    {id:'ks3-swim', grade:3, text:'プールで 【泳ぐ】 れんしゅうを する。', target:'泳ぐ', fillWrong:'走る', reading:'およぐ', readingWrong:'はしる'},
    {id:'ks3-cold', grade:3, text:'冬の 朝は 【寒い】。', target:'寒い', fillWrong:'暑い', reading:'さむい', readingWrong:'あつい'},
    {id:'ks3-exercise', grade:3, text:'毎朝、 【運動】 を します。', target:'運動', fillWrong:'勉強', reading:'うんどう', readingWrong:'べんきょう'},
    {id:'ks3-station', grade:3, text:'【駅前】 に 大きな 店が ある。', target:'駅前', fillWrong:'駅中', reading:'えきまえ', readingWrong:'えきなか'},
    {id:'ks3-medicine', grade:3, text:'病気の ときは 【薬】 を のみます。', target:'薬', fillWrong:'草', reading:'くすり', readingWrong:'くさ'},
    {id:'ks3-question', grade:3, text:'先生に 【問題】 を きく。', target:'問題', fillWrong:'文章', reading:'もんだい', readingWrong:'ぶんしょう'},
    {id:'ks3-answer', grade:3, text:'【答え】 を かきます。', target:'答え', fillWrong:'考え', reading:'こたえ', readingWrong:'かんがえ'},
    {id:'ks3-place', grade:3, text:'あそぶ 【場所】 を きめる。', target:'場所', fillWrong:'場合', reading:'ばしょ', readingWrong:'ばあい'},
    {id:'ks3-festival', grade:3, text:'町の 【祭り】 に いきます。', target:'祭り', fillWrong:'祭日', reading:'まつり', readingWrong:'さいじつ'},
    {id:'ks3-open', grade:3, text:'本を 【開く】 と えが みえます。', target:'開く', fillWrong:'閉じる', reading:'ひらく', readingWrong:'とじる'}
  ];

  const ENGLISH_WORDS = [
    { word:'apple', meaning:'りんご', emoji:'🍎' },
    { word:'banana', meaning:'バナナ', emoji:'🍌' },
    { word:'cat', meaning:'ねこ', emoji:'🐈' },
    { word:'dog', meaning:'いぬ', emoji:'🐕' },
    { word:'bird', meaning:'とり', emoji:'🐦' },
    { word:'fish', meaning:'さかな', emoji:'🐟' },
    { word:'car', meaning:'くるま', emoji:'🚗' },
    { word:'bus', meaning:'バス', emoji:'🚌' },
    { word:'book', meaning:'ほん', emoji:'📘' },
    { word:'pen', meaning:'ペン', emoji:'🖊️' },
    { word:'milk', meaning:'ぎゅうにゅう', emoji:'🥛' },
    { word:'water', meaning:'みず', emoji:'💧' },
    { word:'sun', meaning:'たいよう', emoji:'☀️' },
    { word:'moon', meaning:'つき', emoji:'🌙' },
    { word:'star', meaning:'ほし', emoji:'⭐' },
    { word:'piano', meaning:'ピアノ', emoji:'🎹' },
    { word:'tree', meaning:'き', emoji:'🌳' },
    { word:'flower', meaning:'はな', emoji:'🌼' },
    { word:'ball', meaning:'ボール', emoji:'⚽' },
    { word:'cake', meaning:'ケーキ', emoji:'🍰' },
    { word:'orange', meaning:'オレンジ', emoji:'🍊' },
    { word:'egg', meaning:'たまご', emoji:'🥚' },
    { word:'school', meaning:'がっこう', emoji:'🏫' },
    { word:'house', meaning:'いえ', emoji:'🏠' },

    // 追加の単語：色・数・家族・体・食べ物・動物・天気・動作・学校・身の回り
    { word:'red', meaning:'あか', emoji:'🔴' },
    { word:'blue', meaning:'あお', emoji:'🔵' },
    { word:'green', meaning:'みどり', emoji:'🟢' },
    { word:'yellow', meaning:'きいろ', emoji:'🟡' },
    { word:'black', meaning:'くろ', emoji:'⚫' },
    { word:'white', meaning:'しろ', emoji:'⚪' },
    { word:'pink', meaning:'ピンク', emoji:'🩷' },
    { word:'purple', meaning:'むらさき', emoji:'🟣' },
    { word:'brown', meaning:'ちゃいろ', emoji:'🟤' },
    { word:'one', meaning:'いち', emoji:'1️⃣' },
    { word:'two', meaning:'に', emoji:'2️⃣' },
    { word:'three', meaning:'さん', emoji:'3️⃣' },
    { word:'four', meaning:'よん', emoji:'4️⃣' },
    { word:'five', meaning:'ご', emoji:'5️⃣' },
    { word:'eight', meaning:'はち', emoji:'8️⃣' },
    { word:'ten', meaning:'じゅう', emoji:'🔟' },
    { word:'mother', meaning:'おかあさん', emoji:'👩' },
    { word:'father', meaning:'おとうさん', emoji:'👨' },
    { word:'brother', meaning:'おにいさん・おとうと', emoji:'👦' },
    { word:'sister', meaning:'おねえさん・いもうと', emoji:'👧' },
    { word:'baby', meaning:'あかちゃん', emoji:'👶' },
    { word:'family', meaning:'かぞく', emoji:'👪' },
    { word:'head', meaning:'あたま', emoji:'🧑' },
    { word:'eye', meaning:'め', emoji:'👁️' },
    { word:'ear', meaning:'みみ', emoji:'👂' },
    { word:'nose', meaning:'はな', emoji:'👃' },
    { word:'mouth', meaning:'くち', emoji:'👄' },
    { word:'hand', meaning:'て', emoji:'✋' },
    { word:'foot', meaning:'あし', emoji:'🦶' },
    { word:'bread', meaning:'パン', emoji:'🍞' },
    { word:'rice', meaning:'ごはん・おこめ', emoji:'🍚' },
    { word:'cheese', meaning:'チーズ', emoji:'🧀' },
    { word:'meat', meaning:'にく', emoji:'🥩' },
    { word:'juice', meaning:'ジュース', emoji:'🧃' },
    { word:'tea', meaning:'おちゃ', emoji:'🍵' },
    { word:'cookie', meaning:'クッキー', emoji:'🍪' },
    { word:'horse', meaning:'うま', emoji:'🐎' },
    { word:'cow', meaning:'うし', emoji:'🐄' },
    { word:'pig', meaning:'ぶた', emoji:'🐖' },
    { word:'sheep', meaning:'ひつじ', emoji:'🐑' },
    { word:'rabbit', meaning:'うさぎ', emoji:'🐇' },
    { word:'monkey', meaning:'さる', emoji:'🐒' },
    { word:'lion', meaning:'ライオン', emoji:'🦁' },
    { word:'tiger', meaning:'トラ', emoji:'🐅' },
    { word:'bear', meaning:'くま', emoji:'🐻' },
    { word:'rain', meaning:'あめ', emoji:'🌧️' },
    { word:'cloud', meaning:'くも', emoji:'☁️' },
    { word:'snow', meaning:'ゆき', emoji:'❄️' },
    { word:'wind', meaning:'かぜ', emoji:'💨' },
    { word:'fire', meaning:'ひ', emoji:'🔥' },
    { word:'earth', meaning:'ちきゅう・つち', emoji:'🌍' },
    { word:'run', meaning:'はしる', emoji:'🏃' },
    { word:'jump', meaning:'とぶ', emoji:'🤸' },
    { word:'swim', meaning:'およぐ', emoji:'🏊' },
    { word:'walk', meaning:'あるく', emoji:'🚶' },
    { word:'sing', meaning:'うたう', emoji:'🎤' },
    { word:'dance', meaning:'おどる', emoji:'💃' },
    { word:'read', meaning:'よむ', emoji:'📖' },
    { word:'write', meaning:'かく', emoji:'✍️' },
    { word:'chair', meaning:'いす', emoji:'🪑' },
    { word:'desk', meaning:'つくえ', emoji:'🖥️' },
    { word:'pencil', meaning:'えんぴつ', emoji:'✏️' },
    { word:'eraser', meaning:'けしゴム', emoji:'🧽' },
    { word:'ruler', meaning:'じょうぎ', emoji:'📏' },
    { word:'bag', meaning:'かばん', emoji:'🎒' },
    { word:'door', meaning:'ドア', emoji:'🚪' },
    { word:'window', meaning:'まど', emoji:'🪟' },
    { word:'room', meaning:'へや', emoji:'🛏️' },
    { word:'bed', meaning:'ベッド', emoji:'🛌' },
    { word:'table', meaning:'テーブル', emoji:'🪵' },
    { word:'clock', meaning:'とけい', emoji:'🕒' },
    { word:'train', meaning:'でんしゃ', emoji:'🚆' },
    { word:'plane', meaning:'ひこうき', emoji:'✈️' },
    { word:'boat', meaning:'ふね', emoji:'⛵' },
    { word:'bike', meaning:'じてんしゃ', emoji:'🚲' },
    { word:'truck', meaning:'トラック', emoji:'🚚' }
  ];

  const ENGLISH_SENTENCES = [
    { english:'I have a pen.', japanese:'わたしは ペンを もっています。' },
    { english:'My name is Bob.', japanese:'わたしの なまえは ボブです。' },
    { english:'How are you?', japanese:'げんきですか？' },
    { english:'I play the piano.', japanese:'わたしは ピアノを ひきます。' },
    { english:'Bob has a big pen.', japanese:'ボブは おおきな ペンを もっています。' },
    { english:'This is a cat.', japanese:'これは ねこです。' },
    { english:'I like bananas.', japanese:'わたしは バナナが すきです。' },
    { english:'She has a dog.', japanese:'かのじょは いぬを かっています。' },
    { english:'It is a red car.', japanese:'それは あかい くるまです。' },
    { english:'The sun is hot.', japanese:'たいようは あついです。' },
    { english:'I see a bird.', japanese:'わたしには とりが みえます。' },
    { english:'I have two books.', japanese:'わたしは ほんを 2さつ もっています。' },
    { english:'Good morning!', japanese:'おはよう！' },
    { english:'Thank you!', japanese:'ありがとう！' },

    // 追加の英文：身近なもの・動作・ようす・学校生活
    { english:'This is a dog.', japanese:'これは いぬです。' },
    { english:'That is a bus.', japanese:'あれは バスです。' },
    { english:'I have a book.', japanese:'わたしは 本を もっています。' },
    { english:'I have a red bag.', japanese:'わたしは あかい かばんを もっています。' },
    { english:'I like apples.', japanese:'わたしは りんごが すきです。' },
    { english:'I like cats.', japanese:'わたしは ねこが すきです。' },
    { english:'I like soccer.', japanese:'わたしは サッカーが すきです。' },
    { english:'I can run.', japanese:'わたしは はしることが できます。' },
    { english:'I can jump.', japanese:'わたしは とぶことが できます。' },
    { english:'I can swim.', japanese:'わたしは およぐことが できます。' },
    { english:'I can sing.', japanese:'わたしは うたうことが できます。' },
    { english:'I can dance.', japanese:'わたしは おどることが できます。' },
    { english:'I can read.', japanese:'わたしは よむことが できます。' },
    { english:'I can write.', japanese:'わたしは かくことが できます。' },
    { english:'You are kind.', japanese:'あなたは しんせつです。' },
    { english:'You are my friend.', japanese:'あなたは わたしの ともだちです。' },
    { english:'He is a teacher.', japanese:'かれは 先生です。' },
    { english:'She is a student.', japanese:'かのじょは 学生です。' },
    { english:'He has a blue bike.', japanese:'かれは あおい じてんしゃを もっています。' },
    { english:'She has a pink hat.', japanese:'かのじょは ピンクの ぼうしを もっています。' },
    { english:'We are happy.', japanese:'わたしたちは うれしいです。' },
    { english:'We play together.', japanese:'わたしたちは いっしょに あそびます。' },
    { english:'We read a book.', japanese:'わたしたちは 本を よみます。' },
    { english:'We eat lunch.', japanese:'わたしたちは ひるごはんを たべます。' },
    { english:'They are friends.', japanese:'かれらは ともだちです。' },
    { english:'They play soccer.', japanese:'かれらは サッカーを します。' },
    { english:'Open the door.', japanese:'ドアを あけてください。' },
    { english:'Close the window.', japanese:'まどを しめてください。' },
    { english:'Sit on the chair.', japanese:'いすに すわってください。' },
    { english:'Look at the star.', japanese:'星を みてください。' },
    { english:'Look at the moon.', japanese:'月を みてください。' },
    { english:'Touch your nose.', japanese:'はなを さわってください。' },
    { english:'Wash your hands.', japanese:'手を あらってください。' },
    { english:'This is my room.', japanese:'これは わたしの へやです。' },
    { english:'This is my bed.', japanese:'これは わたしの ベッドです。' },
    { english:'The dog is big.', japanese:'いぬは おおきいです。' },
    { english:'The cat is small.', japanese:'ねこは ちいさいです。' },
    { english:'The bird is blue.', japanese:'とりは あおいです。' },
    { english:'The flower is yellow.', japanese:'はなは きいろです。' },
    { english:'The grass is green.', japanese:'くさは みどりです。' },
    { english:'The sky is blue.', japanese:'そらは あおいです。' },
    { english:'The rain is cold.', japanese:'あめは つめたいです。' },
    { english:'The snow is white.', japanese:'ゆきは しろいです。' },
    { english:'The wind is strong.', japanese:'かぜは つよいです。' },
    { english:'The apple is red.', japanese:'りんごは あかいです。' },
    { english:'The banana is yellow.', japanese:'バナナは きいろです。' },
    { english:'I eat bread.', japanese:'わたしは パンを たべます。' },
    { english:'I drink water.', japanese:'わたしは みずを のみます。' },
    { english:'I drink milk.', japanese:'わたしは ぎゅうにゅうを のみます。' },
    { english:'I like cake.', japanese:'わたしは ケーキが すきです。' },
    { english:'I have a cookie.', japanese:'わたしは クッキーを もっています。' },
    { english:'Mom has a car.', japanese:'おかあさんは くるまを もっています。' },
    { english:'Dad has a truck.', japanese:'おとうさんは トラックを もっています。' },
    { english:'My brother can run.', japanese:'わたしの おにいさんは はしれます。' },
    { english:'My sister can sing.', japanese:'わたしの おねえさんは うたえます。' },
    { english:'The baby is cute.', japanese:'あかちゃんは かわいいです。' },
    { english:'The horse can run.', japanese:'うまは はしれます。' },
    { english:'The cow eats grass.', japanese:'うしは くさを たべます。' },
    { english:'The monkey has a banana.', japanese:'さるは バナナを もっています。' },
    { english:'The lion is strong.', japanese:'ライオンは つよいです。' },
    { english:'The tiger is big.', japanese:'トラは おおきいです。' },
    { english:'The bear is brown.', japanese:'くまは ちゃいろです。' },
    { english:'The train is long.', japanese:'でんしゃは ながいです。' },
    { english:'The plane is in the sky.', japanese:'ひこうきは そらに あります。' },
    { english:'The boat is on the water.', japanese:'ふねは みずの うえに あります。' },
    { english:'It is sunny today.', japanese:'きょうは はれです。' },
    { english:'It is rainy today.', japanese:'きょうは あめです。' },
    { english:'It is hot today.', japanese:'きょうは あついです。' },
    { english:'It is cold today.', japanese:'きょうは さむいです。' },
    { english:'What is this?', japanese:'これは なんですか？' },
    { english:'What color is it?', japanese:'それは なんいろですか？' },
    { english:'Where is my pen?', japanese:'わたしの ペンは どこですか？' },
    { english:'Here is your book.', japanese:'ここに あなたの 本が あります。' },
    { english:'Please help me.', japanese:'わたしを たすけてください。' },
    { english:'Please sit down.', japanese:'すわってください。' },
    { english:'Please stand up.', japanese:'たってください。' },
    { english:'Come here.', japanese:'ここへ きてください。' },
    { english:'Go home.', japanese:'いえへ かえりましょう。' },
    { english:'Let’s play.', japanese:'あそびましょう。' },
    { english:'Let’s read.', japanese:'よみましょう。' },
    { english:'Let’s go to school.', japanese:'学校へ いきましょう。' },
    { english:'I see a big tree.', japanese:'おおきな 木が みえます。' },
    { english:'I see a white cloud.', japanese:'しろい くもが みえます。' },
    { english:'The clock is on the table.', japanese:'とけいは テーブルの うえに あります。' },
    { english:'My pencil is in the bag.', japanese:'わたしの えんぴつは かばんの なかに あります。' },
    { english:'The desk is in the room.', japanese:'つくえは へやの なかに あります。' }
  ];

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const coin = () => Math.random() < 0.5;
  const fmt = (h, m) => `${h}時${String(m).padStart(2, '0')}分`;
  const clockHour = (h) => ((h - 1) % 12 + 12) % 12 + 1;
  const clockMinute = (m) => ((m % 60) + 60) % 60;
  const clockText = (h, m) => fmt(clockHour(h), clockMinute(m));

  function twoChoices(question, correct, wrong, extra = {}) {
    const correctText = String(correct);
    const wrongText = String(wrong);
    const isLabeledAB = new Set([correctText, wrongText]).size === 2
      && [correctText, wrongText].every(value => value === 'A' || value === 'B');
    const correctIndex = isLabeledAB ? (correctText === 'A' ? 0 : 1) : (coin() ? 0 : 1);
    const choices = isLabeledAB ? ['A', 'B'] : (correctIndex === 0 ? [correctText, wrongText] : [wrongText, correctText]);
    // 問題データを追加・変更しても、正解が選択肢から消えないようにする。
    if (!choices.includes(correctText)) choices[correctIndex] = correctText;
    return {
      id: question.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      interaction: 'route',
      choiceCount: 2,
      question: question.question || question.text || '',
      choices,
      correctIndex: choices.indexOf(correctText),
      answer: correctText,
      explanation: question.explanation || `せいかいは「${correct}」だよ。`,
      ...extra
    };
  }

  function multiChoices(question, choices, correctIndex, extra = {}) {
    const values = choices.map(String);
    return {
      id: question.id || `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      interaction: 'route',
      choiceCount: values.length,
      question: question.question || question.text || '',
      choices: values,
      correctIndex,
      answer: values[correctIndex],
      explanation: question.explanation || `せいかいは「${values[correctIndex]}」だよ。`,
      ...extra
    };
  }

  function bossifyQuestion(q, subject) {
    if (!q || q.choiceCount > 2 || (q.visual?.type === 'compare' && (q.choices || []).every(choice => choice === 'A' || choice === 'B'))) return q;
    const correctText = String(q.answer ?? q.choices[q.correctIndex]);
    const pool = [];
    const numeric = Number(correctText.replaceAll(',', ''));
    if (/^-?\d+(\.\d+)?$/.test(correctText.replaceAll(',', '')) && Number.isFinite(numeric)) {
      const step = Math.max(1, Math.round(Math.abs(numeric) * .1));
      for (const delta of [step, -step, step * 2, -step * 2, 5, -5, 10, -10, 20, -20]) {
        const value = numeric + delta;
        if (value > 0 && Number.isFinite(value)) pool.push(Number.isInteger(value) ? String(value) : value.toFixed(1));
      }
    } else {
      const clock = correctText.match(/^(\d{1,2})時(\d{2})分$/);
      if (clock) {
        const hour = Number(clock[1]);
        const minute = Number(clock[2]);
        pool.push(clockText(hour + 1, minute), clockText(hour, minute + 5), clockText(hour, minute + 10));
      } else if (subject === 'math') {
        const remainder = correctText.match(/^(\d+)\s*あまり\s*(\d+)$/);
        if (remainder) {
          const quotient = Number(remainder[1]);
          const rest = Number(remainder[2]);
          pool.push(`${quotient + 1} あまり ${rest}`, `${quotient + 2} あまり ${rest}`, `${Math.max(1, quotient - 1)} あまり ${rest}`);
        }
      } else if (subject === 'kanji') {
        if (q.tag?.includes('ぶんしょうの かんじ')) pool.push(...KANJI_SENTENCES.map(entry => entry.target));
        else if (q.tag?.includes('ぶんしょうの よみ')) pool.push(...KANJI_SENTENCES.map(entry => entry.reading));
        else {
          const kind = q.tag?.includes('かんじの かきかた') ? 'writing' : q.tag?.includes('じゅくご') ? 'compound' : 'reading';
          pool.push(...KANJI.filter(entry => entry.kind === kind).map(entry => entry.answer));
        }
      } else if (subject === 'english') {
        const isEnglish = /^[A-Za-z]/.test(correctText);
        if (isEnglish && /[ .!?]/.test(correctText)) pool.push(...ENGLISH_SENTENCES.map(entry => entry.english));
        else if (isEnglish) pool.push(...ENGLISH_WORDS.map(entry => entry.word));
        else if (q.speech && q.speech.includes(' ')) pool.push(...ENGLISH_SENTENCES.map(entry => entry.japanese));
        else pool.push(...ENGLISH_WORDS.map(entry => entry.meaning));
      }
    }

    const targetCount = Math.random() < .5 ? 3 : 4;
    const choices = [correctText];
    for (const candidate of [...q.choices, ...pool].sort(() => Math.random() - .5)) {
      const text = String(candidate);
      if (!choices.includes(text)) choices.push(text);
      if (choices.length >= targetCount) break;
    }
    if (choices.length < 3) return q;
    const shuffled = [...choices].sort(() => Math.random() - .5);
    return {
      ...q,
      choices: shuffled,
      choiceCount: shuffled.length,
      correctIndex: shuffled.indexOf(correctText),
      answer: correctText,
      routeMode: 'boss',
      isBoss: true
    };
  }

  // 問題の組み立て方が増えても、正解値が選択肢から消えないよう最後に正規化する。
  function ensureAnswerChoice(q) {
    const choices = (q.choices || []).map(String);
    const answer = String(q.answer ?? choices[q.correctIndex] ?? '');
    let correctIndex = choices.indexOf(answer);
    if (correctIndex < 0) {
      choices[0] = answer;
      correctIndex = 0;
    }
    return {...q, choices, choiceCount: choices.length, correctIndex, answer};
  }

  function wrongNumber(correct, max = 999) {
    const delta = pick([1, 2, 3, 5, 10, 11, 20]);
    const cand = correct + (coin() ? delta : -delta);
    return cand > 0 && cand <= max ? cand : correct + (correct + delta <= max ? delta : -1);
  }

  const MATH_LEVELS = [
    {level:1, type:'add1', label:'1けたの たし算'},
    {level:2, type:'sub1', label:'1けたの ひき算'},
    {level:3, type:'add2', label:'2けたの たし算'},
    {level:4, type:'sub2', label:'2けたの ひき算'},
    {level:5, type:'multiply1', label:'九九の かけ算'},
    {level:6, type:'divide1', label:'九九の わり算'},
    {level:7, type:'multiply2', label:'2けた × 1けた'},
    {level:8, type:'divideRemainder', label:'あまりの ある わり算'}
  ];

  function mathLevelInfo(level = 1) {
    const index = Math.max(0, Math.min(MATH_LEVELS.length - 1, Math.floor(Number(level) || 1) - 1));
    return MATH_LEVELS[index];
  }

  function levelledMath(question, spec) {
    const timeLimitSec = spec.level <= 2 ? 10 : spec.level <= 4 ? 15 : spec.level <= 6 ? 17 : 20;
    return {...question, level:spec.level, levelTag:spec.label, mathType:spec.type, timeLimitSec};
  }

  function mathLevelQuestion(level = 1) {
    const spec = mathLevelInfo(level);
    if (spec.type === 'add1') {
      const a = rand(1, 8);
      const b = rand(1, 9 - a);
      const result = a + b;
      return levelledMath(twoChoices({question:`${a} ＋ ${b} = ?`, explanation:`${a} ＋ ${b} = ${result} だよ。`}, result, wrongNumber(result)), spec);
    }
    if (spec.type === 'sub1') {
      const a = rand(1, 9);
      const b = rand(0, a);
      const result = a - b;
      return levelledMath(twoChoices({question:`${a} － ${b} = ?`, explanation:`${a} － ${b} = ${result} だよ。`}, result, wrongNumber(result)), spec);
    }
    if (spec.type === 'add2') {
      const a = rand(10, 49);
      const b = rand(10, 99 - a);
      const result = a + b;
      return levelledMath(twoChoices({question:`${a} ＋ ${b} = ?`, explanation:`${a} ＋ ${b} = ${result} だよ。`}, result, wrongNumber(result)), spec);
    }
    if (spec.type === 'sub2') {
      const a = rand(20, 99);
      const b = rand(10, a - 10);
      const result = a - b;
      return levelledMath(twoChoices({question:`${a} － ${b} = ?`, explanation:`${a} － ${b} = ${result} だよ。`}, result, wrongNumber(result)), spec);
    }
    if (spec.type === 'multiply1') {
      const a = rand(1, 9);
      const b = rand(1, 9);
      const result = a * b;
      return levelledMath(twoChoices({question:`${a} × ${b} = ?`, explanation:`${a} × ${b} = ${result} だよ。`}, result, wrongNumber(result)), spec);
    }
    if (spec.type === 'divide1') {
      const divisor = rand(2, 9);
      const quotient = rand(1, 9);
      const dividend = divisor * quotient;
      return levelledMath(twoChoices({question:`${dividend} ÷ ${divisor} = ?`, explanation:`${divisor} × ${quotient} = ${dividend} だから、こたえは ${quotient}。`}, quotient, wrongNumber(quotient, 12)), spec);
    }
    if (spec.type === 'multiply2') {
      const a = rand(10, 99);
      const b = rand(2, 9);
      const result = a * b;
      return levelledMath(twoChoices({question:`${a} × ${b} = ?`, explanation:`${a} × ${b} = ${result} だよ。`}, result, wrongNumber(result)), spec);
    }
    const divisor = rand(2, 9);
    const quotient = rand(1, 9);
    const remainder = rand(1, divisor - 1);
    const dividend = divisor * quotient + remainder;
    const answer = `${quotient} あまり ${remainder}`;
    const wrong = `${quotient + 1} あまり ${remainder}`;
    return levelledMath(twoChoices({question:`${dividend} ÷ ${divisor} = ?`, explanation:`${divisor} × ${quotient} ＋ ${remainder} = ${dividend} だから、こたえは ${answer}。`}, answer, wrong), spec);
  }

  function mathCalculation(type) {
    if (type === 'addsub') {
      const add = coin();
      let a, b, result;
      if (add) {
        a = rand(1, 949);
        b = rand(1, Math.min(999 - a, rand(10, 230)));
        result = a + b;
      } else {
        a = rand(2, 999);
        b = rand(1, a - 1); // 負の数も0も答えに出さない
        result = a - b;
      }
      const symbol = add ? '＋' : '－';
      return twoChoices({
        question:`${a} ${symbol} ${b} = ?`,
        explanation:`${a} ${symbol} ${b} = ${result} だよ。`
      }, result, wrongNumber(result));
    }
    if (type === 'multiply') {
      const long = Math.random() < 0.42;
      const a = long ? rand(10, 99) : rand(1, 9);
      const b = rand(1, 9);
      const result = a * b;
      return twoChoices({question:`${a} × ${b} = ?`, explanation:`${a} × ${b} = ${result} だよ。`}, result, wrongNumber(result));
    }
    const a = rand(1, 9);
    const b = rand(2, 9);
    const product = a * b;
    return twoChoices({question:`${product} ÷ ${b} = ?`, explanation:`${b} × ${a} = ${product} だから、こたえは ${a}。`}, a, wrongNumber(a, 12));
  }

  function mathBlocks() {
    const count = rand(5, 20);
    return twoChoices({question:'ブロックは ぜんぶで いくつ？', explanation:`ひとつずつ かぞえると、${count}こ あるよ。`}, count, wrongNumber(count, 24), {
      visual: {type:'blocks', count}
    });
  }

  function mathCompare(boss = false) {
    const mode = pick(['count', 'length', 'weight']);
    const a = rand(mode === 'count' ? 3 : 2, mode === 'count' ? 13 : 9);
    let b = rand(mode === 'count' ? 3 : 2, mode === 'count' ? 13 : 9);
    if (a === b) b = a === 9 ? a - 2 : a + 2;
    const count = boss ? (coin() ? 3 : 4) : 2;
    const values = [a, b];
    while (values.length < count) {
      const next = rand(mode === 'count' ? 3 : 2, mode === 'count' ? 13 : 9);
      if (!values.includes(next)) values.push(next);
    }
    const labels = values.map((_, index) => String.fromCharCode(65 + index));
    const correctIndex = values.indexOf(Math.max(...values));
    const correct = labels[correctIndex];
    const wrong = correct === 'A' ? 'B' : 'A';
    const subjectText = mode === 'count' ? 'ブロックが おおい' : mode === 'length' ? 'ぼうが ながい' : 'おもい';
    const unit = mode === 'weight' ? 'kg' : mode === 'count' ? 'こ' : '';
    if (boss) {
      return multiChoices({
        question: `${labels.join('・')}の なかで、どれが ${subjectText}？`,
        explanation: `${values.map((value, index) => `${labels[index]} は ${value}${unit}`).join('、')}。${correct} のほうだよ。`
      }, labels, correctIndex, {
        visual: {type:'compare', mode, items: values.map((value, index) => ({label:labels[index], value}))},
        routeMode: 'boss',
        isBoss: true
      });
    }
    const prompt = mode === 'count' ? 'AとB、どちらの ブロックが おおい？' : mode === 'length' ? 'AとB、どちらの ぼうが ながい？' : 'AとB、どちらが おもい？';
    return twoChoices({question:prompt, explanation:`A は ${a}${unit}、B は ${b}${unit}。${correct} のほうだよ。`}, correct, wrong, {
      visual: {type:'compare', mode, a, b}
    });
  }

  function mathClock() {
    const kind = pick(['read', 'find', 'after']);
    const h = rand(1, 12);
    // 基本は5分刻み、時々1分刻みの問題を出す
    const m = Math.random() < 0.7 ? rand(0, 11) * 5 : rand(0, 59);
    if (kind === 'read') {
      const wrongH = clockHour(h + 1);
      const correct = fmt(h, m);
      const wrong = coin() ? clockText(wrongH, m) : clockText(h, m + 5);
      return twoChoices({question:'この とけいは なんじ なんぷん？', explanation:`みじかい はりが「時」、ながい はりが「分」。${correct} だよ。`}, correct, wrong, {
        visual:{type:'clock', h, m}
      });
    }
    if (kind === 'find') {
      const otherH = clockHour(h + 1);
      const aIsCorrect = coin();
      const a = aIsCorrect ? {h, m} : {h:otherH, m};
      const b = aIsCorrect ? {h:otherH, m} : {h, m};
      return twoChoices({question:`${fmt(h, m)} は どちらの とけい？`, explanation:`${fmt(h, m)} は ${aIsCorrect ? 'A' : 'B'} の とけいだよ。`}, aIsCorrect ? 'A' : 'B', aIsCorrect ? 'B' : 'A', {
        visual:{type:'clock-pair', a, b}
      });
    }
    const hours = rand(1, 3);
    const afterH = clockHour(h + hours);
    const correct = clockText(afterH, m);
    const wrong = clockText(afterH + 1, m);
    return twoChoices({question:`この とけいの ${hours}時間後は？`, explanation:`${fmt(h, m)} から ${hours}時間 すすむと ${correct}。`}, correct, wrong, {
      visual:{type:'clock', h, m}
    });
  }

  function freshItem(items, recentIds) {
    const eligible = items.filter(x => !recentIds.includes(x.id));
    return pick(eligible.length ? eligible : items);
  }

  function kanjiQuestion(topic, grade, recentIds) {
    const kind = topic === 'mix' ? pick(['reading', 'writing', 'compound', 'sentence']) : topic;
    if (kind === 'sentence') {
      const mode = coin() ? 'fill' : 'reading';
      const filteredSentences = KANJI_SENTENCES.filter(x => x.grade <= grade);
      const e = freshItem(filteredSentences, recentIds);
      if (mode === 'fill') {
        const prompt = e.text.replace(`【${e.target}】`, '□');
        return twoChoices({id:`${e.id}-fill`, question:'文の □ に 入る かんじは どれ？', explanation:`文の □ に 入るのは「${e.target}」だよ。`}, e.target, e.fillWrong, {
          tag:'ぶんしょうの かんじ',
          gradeTag:`小学${e.grade}年生`,
          timeLimitSec: e.grade === 1 ? 10 : e.grade === 2 ? 15 : 20,
          visual:{type:'sentence', text:prompt}
        });
      }
      return twoChoices({id:`${e.id}-reading`, question:`文の「${e.target}」は なんと よむ？`, explanation:`「${e.target}」は「${e.reading}」と よむよ。`}, e.reading, e.readingWrong, {
        tag:'ぶんしょうの よみ',
        gradeTag:`小学${e.grade}年生`,
        timeLimitSec: e.grade === 1 ? 10 : e.grade === 2 ? 15 : 20,
        visual:{type:'sentence', text:e.text}
      });
    }
    const filtered = KANJI.filter(x => x.grade <= grade && x.kind === kind);
    const e = freshItem(filtered, recentIds);
    const prompt = kind === 'reading' ? `「${e.word}」の よみは？` : kind === 'writing' ? `「${e.word}」を かんじで かくと どれ？` : `「${e.word}」の よみは？`;
    return twoChoices({id:e.id, question:prompt, explanation:`「${e.word}」は「${e.answer}」だよ。`}, e.answer, e.wrong, {
      tag: kind === 'reading' ? 'かんじの よみ' : kind === 'writing' ? 'かんじの かきかた' : 'じゅくごの よみ',
      gradeTag: `小学${e.grade}年生`,
      timeLimitSec: e.grade === 1 ? 10 : e.grade === 2 ? 15 : 20,
      visual: kind === 'writing' ? {type:'notebook'} : {type:'kanji', word:e.word}
    });
  }

  function englishQuestion(topic, recentIds) {
    const kind = topic === 'mix' ? (Math.random() < 0.58 ? 'words' : 'sentences') : topic;
    if (kind === 'words') {
      const entries = ENGLISH_WORDS.map(x => ({...x, id:`en-word-${x.word}`}));
      const e = freshItem(entries, recentIds);
      const other = pick(entries.filter(x=>x.word!==e.word));
      const fromPicture = coin();
      if (fromPicture) {
        return twoChoices({id:e.id, question:'この えの えいごは どっち？', explanation:`${e.emoji} は英語で「${e.word}」だよ。`}, e.word, other.word, {
          visual:{type:'emoji', emoji:e.emoji}, speech:e.word
        });
      }
      return twoChoices({id:e.id, question:`「${e.word}」の いみは？`, explanation:`${e.word} は「${e.meaning}」という いみだよ。`}, e.meaning, other.meaning, {
        visual:{type:'emoji', emoji:e.emoji}, speech:e.word
      });
    }
    const entries = ENGLISH_SENTENCES.map((x,i)=>({...x, id:`en-sentence-${i}`}));
    const e = freshItem(entries, recentIds);
    const other = pick(entries.filter(x=>x.id!==e.id));
    const toEnglish = Math.random() < 0.32;
    if (toEnglish) {
      return twoChoices({id:e.id, question:`「${e.japanese}」は えいごで？`, explanation:`「${e.english}」だよ。`}, e.english, other.english, {speech:e.english, tag:'えいぶん'});
    }
    return twoChoices({id:e.id, question:`「${e.english}」の いみは？`, explanation:`${e.english} = ${e.japanese}`, }, e.japanese, other.japanese, {speech:e.english, tag:'えいぶん'});
  }

  function generateQuestion({subject='math', topic='mix', grade=3, recentIds=[], boss=false, mathLevel=1}={}) {
    let question;
    if (subject === 'math') {
      if (topic === 'mix') question = mathLevelQuestion(mathLevel);
      else {
        const kind = topic;
        if (['addsub','multiply','divide'].includes(kind)) question = {...mathCalculation(kind), tag: {addsub:'たし算・ひき算',multiply:'かけ算',divide:'わり算'}[kind], timeLimitSec:15};
        else if (kind === 'count') question = {...mathBlocks(), tag:'かずを かぞえる'};
        else if (kind === 'compare') question = {...mathCompare(boss), tag:'くらべる', timeLimitSec:15};
        else question = {...mathClock(), tag:'とけい', timeLimitSec:15};
      }
    } else if (subject === 'kanji') {
      question = kanjiQuestion(topic, Number(grade), recentIds);
    } else {
      question = englishQuestion(topic, recentIds);
    }
    question = boss && !question.isBoss ? bossifyQuestion(question, subject) : question;
    return ensureAnswerChoice(question);
  }

  // 開発コンソールからも参照できるように公開
  window.StudyQuestions = {
    generateQuestion,
    KANJI,
    MATH_LEVELS,
    ENGLISH_WORDS,
    ENGLISH_SENTENCES,
    KANJI_SENTENCES
  };
})();
