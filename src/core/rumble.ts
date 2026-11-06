/**
 * MONZ RUMBLE(3Dバトル)のモード(2026-11-03 企画者):
 * - ストーリーモード: 一枚絵で話が進んでバトル(2026-11-05 すごろくは やめた)。全部で30ステージ(2026-11-05 企画者。前は20)。
 *   敵がだんだん強くなり、さいごのボスは技とプレイがうまくないと勝てない。クリアした所は好きなだけ もう一度遊べる。
 * - バトルモード: CPU の強さを好きに選ぶ。
 * 話の文と絵は企画者が作る(ここは入れ物。文は【仮】)。報酬は まだ決まっていない(作らない)。
 * Phaser に依存しない(テストのため)。
 */
import type { Proficiency } from './battle3d/config';

/** CPU の強さ(バトルモード)。level: 自分のレベルとの差・prof: 戦いのうまさ(1〜5)【仮】 */
export const CPU_LEVELS = [
  { id: 1, name: 'よわい', level: -5, prof: 1 },
  { id: 2, name: 'ふつう', level: 0, prof: 2 },
  { id: 3, name: 'つよい', level: 3, prof: 3 },
  { id: 4, name: 'とてもつよい', level: 6, prof: 4 },
  { id: 5, name: 'さいきょう', level: 10, prof: 5 },
] as const;

export interface StoryStage {
  /** 1〜30 */
  no: number;
  title: string;
  /** バトルの前の話(一枚絵に出す文)。【仮】企画者が書く */
  text: string;
  /** 一枚絵(企画者が作る)。まだなければ null */
  image: string | null;
  /**
   * 敵: 種族・形態(1〜3)・名前・レベル・戦いのうまさ(1〜5)・ボスか・HP の倍率
   */
  enemy: { species: string; form: 1 | 2 | 3; name: string; level: number; prof: number; boss: boolean; hp: number };
  /** そのマスで戦うマップ(arena.ts の ARENAS。2026-11-03 企画者「ストーリーモードでは指定マップ」) */
  map: string;
  /** 章(1〜6。5戦ずつ) */
  chapter: number;
  /** 話(1行ずつ 読む。who が null は ナレーション)。さいごに BATTLE START! */
  lines: StoryLine[];
}

export interface StoryLine {
  who: string | null;
  text: string;
}

/** ストーリーの 名前(2026-11-05 企画者) */
export const STORY_NAME = 'STREET KING';
/** 章ごとの ステージ(2026-11-05 企画者: 1〜2章 草原・3〜4章 ストリート・5〜6章 チャンピオン と KROWN戦) */
export const CHAPTER_MAP = ['grassland', 'grassland', 'street', 'street', 'champion', 'champion'];
/**
 * KROWN(さいごの ボス・敵専用。2026-11-05 企画者「今後作る。今いるキャラで代用」)【仮】:
 * 体は 今いる キャラ(下の species・form)を 使う。名前だけ KROWN
 */
export const KROWN = { name: 'KROWN', species: 'bunk', form: 3 as const };

/** 2026-11-05 企画者「ストーリーは全30ステージ」 */
export const STORY_COUNT = 30;
/** ボスの HP の倍率(ステージの 倍率に さらに かける)【仮】 */
export const BOSS_HP = 1.4;

/**
 * 敵の 種族の 順番(10ステージごと)【仮】。2026-11-05 企画者「最初の10ステージは第1形態、11からは第2形態、21から最終進化」。
 * 順番は CPU どうしの バランス調べ(tests/balance.sim.test.ts)で 弱い → 強い の順。さいご(10・20・30)が いちばん強い
 */
export const STORY_ORDER: Record<1 | 2 | 3, string[]> = {
  // 2026-11-05 企画者「絵はグリット。ライオットはこれから出てくる形に」→ 1戦目 GRIT・RIOT は 4戦目
  1: ['grit', 'snek', 'shellz', 'riot', 'vybe', 'zipp', 'klak', 'bunk', 'puni', 'mofu'],
  2: ['vybe', 'klak', 'zipp', 'shellz', 'grit', 'snek', 'riot', 'bunk', 'mofu', 'puni'],
  // 30戦目は KROWN(代わりの 体は BUNKLORD)。PUNISHROOM は 28戦目
  3: ['snek', 'shellz', 'vybe', 'klak', 'riot', 'zipp', 'grit', 'puni', 'mofu', 'bunk'],
};
/** ストーリーの 一枚絵(企画者が ChatGPT で 作った絵。元の PNG は design/story/)。ステージの 番号 → 絵 */
export const STORY_IMAGES: Record<number, string> = {
  1: 'assets/story/ch1_01.webp', // 1章1話(2026-11-05 企画者)
  2: 'assets/story/ch1_02.webp', // 1章2話 SNEK(2026-11-05 企画者)
  3: 'assets/story/ch1_03.webp', // 1章3話 SHELLZ(2026-11-05 企画者)
  4: 'assets/story/ch1_04.webp', // 1章4話 RIOT(2026-11-05 企画者)
  5: 'assets/story/ch1_05.webp', // 1章5話 VYBE(中ボス。2026-11-05 企画者)
  6: 'assets/story/ch2_06.webp', // 2章6話 ZIPP(2026-11-05 企画者)
  7: 'assets/story/ch2_07.webp', // 2章7話 KLAK(2026-11-05 企画者)
  8: 'assets/story/ch2_08.webp', // 2章8話 BUNK(2026-11-05 企画者)
  9: 'assets/story/ch2_09.webp', // 2章9話 PUNI(2026-11-05 企画者)
  10: 'assets/story/ch2_10.webp', // 2章10話 MOFU(中ボス。2026-11-05 企画者)
  11: 'assets/story/ch3_11.webp', // 3章11話 VYGA(2026-11-06 企画者)
  12: 'assets/story/ch3_12.webp', // 3章12話 KLAKER(2026-11-06 企画者)
  13: 'assets/story/ch3_13.webp', // 3章13話 ZIPRO(2026-11-06 企画者)
  14: 'assets/story/ch3_14.webp', // 3章14話 SHELD(2026-11-06 企画者)
  15: 'assets/story/ch3_15.webp', // 3章15話 GRITTER(中ボス。2026-11-06 企画者)
  16: 'assets/story/ch4_16.webp', // 4章16話 SNEKER(2026-11-06 企画者)
};

/** 話(企画者が 書いた 文。ステージの 番号 → 題名と 行) */
export const STORY_SCRIPTS: Record<number, { title: string; lines: StoryLine[] }> = {
  // 2026-11-05 企画者
  1: {
    title: '第1話「最初の挑戦」',
    lines: [
      { who: null, text: 'ストリートの頂点を目指し、旅に出た無名の挑戦者。' },
      { who: null, text: '草原の岩場で、ひときわ大きな声が響いた。' },
      { who: 'GRIT', text: '「おい、そこのお前！」' },
      { who: 'GRIT', text: '「ストリートの王を目指してるんだって？」' },
      { who: 'GRIT', text: '「へっ、面白ぇ！」' },
      { who: 'GRIT', text: '「だったらまず、俺を倒してみな！」' },
    ],
  },
  2: {
    title: '第2話「草むらの待ち伏せ」',
    lines: [
      { who: null, text: 'GRITとの初戦を制し、草原の奥へと進む挑戦者。' },
      { who: null, text: 'そのとき、草むらから不気味な笑い声が聞こえてきた。' },
      { who: 'SNEK', text: '「シャシャシャ……」' },
      { who: 'SNEK', text: '「お前か？ あのGRITを倒したってヤツは。」' },
      { who: 'SNEK', text: '「へぇ〜、なかなかやるじゃねぇか。」' },
      { who: 'SNEK', text: '「でもよぉ……ここから先は俺の縄張りだぜ？」' },
      { who: 'SNEK', text: '「通りたきゃ、俺を倒してみな！」' },
    ],
  },
  3: {
    title: '第3話「小川の番人」',
    lines: [
      { who: null, text: 'GRIT、SNEKとの戦いを勝ち抜き、草原の奥へと進む挑戦者。' },
      { who: null, text: '目の前に現れたのは、キラキラと輝く小川。' },
      { who: null, text: 'その真ん中の大きな岩に、一匹のMONZがどっしりと構えていた。' },
      { who: 'SHELLZ', text: '「おっと！ ここから先は通行止めだぜ！」' },
      { who: 'SHELLZ', text: '「お前が噂の挑戦者か。」' },
      { who: 'SHELLZ', text: '「GRITもSNEKも倒したんだってな。へっ、やるじゃねぇか！」' },
      { who: 'SHELLZ', text: '「だがな、俺の甲羅はそう簡単には破れねぇぞ！」' },
      { who: 'SHELLZ', text: '「さあ、かかってこい！」' },
    ],
  },
  4: {
    title: '第4話「燃える挑戦者」',
    lines: [
      { who: null, text: '3連勝を飾り、草原のはずれまでたどり着いた挑戦者。' },
      { who: null, text: '夕焼けに染まる岩場で、突然、激しい雄叫びが響き渡る。' },
      { who: 'RIOT', text: '「グルルル……お前が噂の挑戦者か！」' },
      { who: 'RIOT', text: '「GRITもSNEKもSHELLZも倒したんだってな！」' },
      { who: 'RIOT', text: '「へっ！ どいつも情けねぇ！」' },
      { who: 'RIOT', text: '「俺はあんな連中とは違うぜ！」' },
      { who: 'RIOT', text: '「その連勝記録、ここで燃やし尽くしてやる！」' },
      { who: null, text: 'RIOTが牙をむき出しにし、岩の上から飛びかかる！' },
    ],
  },
  5: {
    title: '第5話「雷鳴の支配者」',
    lines: [
      { who: null, text: '4連勝を飾り、ついに草原の最奥へたどり着いた挑戦者。' },
      { who: null, text: '夜空を引き裂く稲妻。' },
      { who: null, text: '丘の頂上には、雷をまとった一匹のMONZが待ち構えていた。' },
      { who: 'VYBE', text: '「……来たか。噂の挑戦者。」' },
      { who: 'VYBE', text: '「ここまで全勝とは、なかなかやるじゃねぇか。」' },
      { who: 'VYBE', text: '「だが、ここから先は遊びじゃねぇ。」' },
      { who: 'VYBE', text: '「この丘を越えたければ、俺を超えてみろ。」' },
      { who: 'VYBE', text: '「見せてみな。お前の本当の力を！」' },
    ],
  },
  6: {
    title: '第6話「電光石火の挑発者」',
    lines: [
      { who: null, text: '草原の王者VYBEを倒し、新たな道へと踏み出した挑戦者。' },
      { who: null, text: '朝日が照らす一本道を歩いていると、突然、目の前を稲妻のような影が駆け抜けた！' },
      { who: null, text: '土煙を巻き上げ、急ブレーキで現れたのはZIPPだった。' },
      { who: 'ZIPP', text: '「おっそーい！ やっと来たのかよ！」' },
      { who: 'ZIPP', text: '「お前だろ？ VYBEを倒したってヤツ！」' },
      { who: 'ZIPP', text: '「へへっ！ ずっと待ってたんだぜ！」' },
      { who: 'ZIPP', text: '「でもさぁ、強いだけじゃ勝てねぇんだよ！」' },
      { who: 'ZIPP', text: '「俺のスピードについてこれるかな？」' },
      { who: 'ZIPP', text: '「さあ、追いついてみな！」' },
    ],
  },
  7: {
    title: '第7話「罠だらけの遺跡」',
    lines: [
      { who: null, text: 'スピード自慢のZIPPを倒し、草原の奥へと進む挑戦者。' },
      { who: null, text: 'たどり着いたのは、崩れた石柱が立ち並ぶ古い遺跡。' },
      { who: null, text: 'そのとき、足元から「カチッ」と不気味な音が響いた。' },
      { who: 'KLAK', text: '「ケケケッ！ 動くんじゃねぇぞ！」' },
      { who: 'KLAK', text: '「お前、もう俺の罠に囲まれてるぜ！」' },
      { who: 'KLAK', text: '「ZIPPを倒したんだってな？ でもよぉ……」' },
      { who: 'KLAK', text: '「速さも力も、頭を使わなきゃ意味ねぇんだよ！」' },
      { who: 'KLAK', text: '「ケケッ！ さあ、俺の罠を全部かわせるかな？」' },
    ],
  },
  8: {
    title: '第8話「拳で語るライバル」',
    lines: [
      { who: null, text: '罠だらけの遺跡を突破し、夕日に染まる丘へとたどり着いた挑戦者。' },
      { who: null, text: '大きな木の下から、激しいパンチの音が響いてくる。' },
      { who: null, text: 'そこには、ひたすら拳を打ち込む一匹のMONZがいた。' },
      { who: 'BUNK', text: '「シュッ！ シュッ！ ……ふぅ！」' },
      { who: 'BUNK', text: '「ん？ お前、もしかして噂の挑戦者か？」' },
      { who: 'BUNK', text: '「GRITもVYBEも倒したって聞いたぜ！」' },
      { who: 'BUNK', text: '「へへっ！ ずっと強ぇヤツと戦いたかったんだ！」' },
      { who: 'BUNK', text: '「小細工も罠もいらねぇ！」' },
      { who: 'BUNK', text: '「正面から、全力でぶつかろうぜ！」' },
    ],
  },
  9: {
    title: '第9話「笑顔のファイター」',
    lines: [
      { who: null, text: 'BUNKとの熱い勝負を終え、挑戦者は草原の奥へと進む。' },
      { who: null, text: '雨上がりの朝。虹のかかる池に、楽しそうな声が響いていた。' },
      { who: null, text: '大きなハスの葉の上で、ぷるぷると跳ねる小さなMONZ。' },
      { who: 'PUNI', text: '「ぷにっ！ あっ、お客さんだ〜！」' },
      { who: 'PUNI', text: '「キミがみんなを倒してきた挑戦者？」' },
      { who: 'PUNI', text: '「えへへっ！ ボクも勝負したかったんだ〜！」' },
      { who: 'PUNI', text: '「でもね、かわいいからって油断しちゃダメだよ？」' },
      { who: 'PUNI', text: '「ボクの水玉、けっこう痛いんだから！」' },
      { who: 'PUNI', text: '「それじゃあ……いっくよ〜！」' },
    ],
  },
  10: {
    title: '第10話「花畑の小さな王者」',
    lines: [
      { who: null, text: '9連勝を飾り、ついに草原の最奥へたどり着いた挑戦者。' },
      { who: null, text: '夕暮れの花畑に、無数の花びらと綿毛が舞っている。' },
      { who: null, text: 'その中心にある大きな切り株には、小さなMONZが静かに座っていた。' },
      { who: 'MOFU', text: '「ふふっ……やっと来たんだね。」' },
      { who: 'MOFU', text: '「キミの噂、風がいっぱい運んできたよ。」' },
      { who: 'MOFU', text: '「みんな強かったでしょ？」' },
      { who: 'MOFU', text: '「でもね……強いだけじゃ、王様にはなれないんだよ。」' },
      { who: 'MOFU', text: '「この草原で、いちばん強いのは誰だと思う？」' },
      { who: 'MOFU', text: '「ふふっ。ボクが教えてあげる。」' },
      { who: null, text: 'MOFUが静かに微笑むと、足元のツルが一斉に動き出した！' },
    ],
  },
  11: {
    title: '第11話「ネオン街の洗礼」',
    lines: [
      { who: null, text: '草原での10連勝を達成し、ついに街へと足を踏み入れた挑戦者。' },
      { who: null, text: '雨上がりの倉庫街。' },
      { who: null, text: 'ネオンが光る路地に、突然、激しい電撃音が響いた。' },
      { who: null, text: '見上げると、コンテナの上に一匹のMONZが立っていた。' },
      { who: 'VYGA', text: '「へぇ……お前が草原で暴れてたヤツか。」' },
      { who: 'VYGA', text: '「VYBEを倒したって聞いたぜ。」' },
      { who: 'VYGA', text: '「だがよ、草原で10回勝ったくらいで調子に乗るなよ？」' },
      { who: 'VYGA', text: '「ここはストリート。弱ぇヤツに居場所はねぇ。」' },
      { who: 'VYGA', text: '「へへっ……歓迎してやるよ。」' },
      { who: 'VYGA', text: '「この街のルール、体に叩き込んでやる！」' },
    ],
  },
  12: {
    title: '第12話「仕組まれた罠」',
    lines: [
      { who: null, text: 'VYGAを倒し、街の奥へと進む挑戦者。' },
      { who: null, text: '薄暗い工業地帯に足を踏み入れると、突然、足元から「カチッ」と音が響いた。' },
      { who: null, text: '頭上の鉄の足場から、不気味な笑い声が聞こえてくる。' },
      { who: 'KLAKER', text: '「ケケケッ！ そこまでだ！」' },
      { who: 'KLAKER', text: '「お前の動きは、もう全部計算済みだぜ。」' },
      { who: 'KLAKER', text: '「草原でKLAKの罠を破ったらしいな？」' },
      { who: 'KLAKER', text: '「だが、俺の仕掛けはあんな単純なモンじゃねぇ！」' },
      { who: 'KLAKER', text: '「一歩でも動けば……どうなるか分かるよな？」' },
      { who: 'KLAKER', text: '「ケケケッ！ さあ、頭脳戦といこうぜ！」' },
    ],
  },
  13: {
    title: '第13話「電光石火のリベンジ」',
    lines: [
      { who: null, text: 'KLAKERの罠を突破し、工業地帯を抜けた挑戦者。' },
      { who: null, text: 'たどり着いたのは、巨大な高速道路の下に広がる一本道。' },
      { who: null, text: 'そのとき、遠くから激しいエンジンのような音が響いてきた！' },
      { who: null, text: '青白い電撃が走り、一瞬で目の前に現れたのはZIPROだった。' },
      { who: 'ZIPRO', text: '「ヒューッ！ やっと来たな！」' },
      { who: 'ZIPRO', text: '「覚えてるか？ 草原でお前と勝負したZIPPだぜ！」' },
      { who: 'ZIPRO', text: '「あのときは負けたけどよ……」' },
      { who: 'ZIPRO', text: '「今の俺は、あのころとは別モンだ！」' },
      { who: 'ZIPRO', text: '「へへっ！ このスピード、目で追えるかな？」' },
      { who: 'ZIPRO', text: '「今度こそ、お前を置き去りにしてやるぜ！」' },
    ],
  },
  14: {
    title: '第14話「鉄壁の水路番長」',
    lines: [
      { who: null, text: 'ZIPROとの激しいスピード勝負を制し、街の地下へと進む挑戦者。' },
      { who: null, text: 'たどり着いたのは、ネオンの光が揺れる巨大な地下水路。' },
      { who: null, text: '細い鉄の橋を渡ろうとした、そのとき。' },
      { who: null, text: '水しぶきとともに、大きな影が立ちはだかった！' },
      { who: 'SHELD', text: '「おっと、そこまでだ！」' },
      { who: 'SHELD', text: '「へっ！ 久しぶりじゃねぇか！」' },
      { who: 'SHELD', text: '「草原の小川で俺を倒したの、覚えてるよな？」' },
      { who: 'SHELD', text: '「あれから俺も、ずいぶん鍛え直したぜ。」' },
      { who: 'SHELD', text: '「今度の甲羅は、そう簡単には砕けねぇ！」' },
      { who: 'SHELD', text: '「この橋を渡りたきゃ、正面からぶつかってこい！」' },
    ],
  },
  15: {
    title: '第15話「地下ランブルの番長」',
    lines: [
      { who: null, text: '地下水路を突破し、ついに地下ランブルの中心地へたどり着いた挑戦者。' },
      { who: null, text: '古びた倉庫の扉を開くと、赤と紫のライトが照らす巨大なリングが現れた。' },
      { who: null, text: 'その真ん中には、見覚えのある大きな影が立っていた。' },
      { who: 'GRITTER', text: '「……よう。久しぶりだな。」' },
      { who: 'GRITTER', text: '「覚えてるか？ 草原の岩場でお前に負けたGRITだ。」' },
      { who: 'GRITTER', text: '「へっ！ あのときの借りを返すために、ここまで強くなったんだぜ！」' },
      { who: 'GRITTER', text: '「今じゃ俺が、この地下ランブルの番長だ！」' },
      { who: 'GRITTER', text: '「お前が勝ち続けてるって聞いて、ずっと待ってたんだ。」' },
      { who: 'GRITTER', text: '「さあ……あの日の決着、つけようぜ！」' },
      { who: null, text: 'GRITTERが拳を打ち鳴らすと、足元のコンクリートに亀裂が走った！' },
    ],
  },
  16: {
    title: '第16話「ネオン街の毒牙」',
    lines: [
      { who: null, text: '地下ランブルの番長GRITTERを倒し、15連勝を飾った挑戦者。' },
      { who: null, text: 'その名は、ついに街のトップランカーたちにも知れ渡っていた。' },
      { who: null, text: 'ネオンが輝く繁華街の路地裏。' },
      { who: null, text: '突然、頭上から聞き覚えのある笑い声が響く。' },
      { who: 'SNEKER', text: '「シャシャシャ……久しぶりだなぁ。」' },
      { who: 'SNEKER', text: '「覚えてるか？ 草原でお前に負けたSNEKだぜ。」' },
      { who: 'SNEKER', text: '「あのときは、ちょいと油断しちまったが……」' },
      { who: 'SNEKER', text: '「今じゃ俺も、この街のトップランカーの一匹だ。」' },
      { who: 'SNEKER', text: '「へへっ……地下ランブルを制したくらいで、いい気になるなよ？」' },
      { who: 'SNEKER', text: '「この街じゃ、強いだけじゃ生き残れねぇんだ。」' },
      { who: 'SNEKER', text: '「さぁ……今度はどっちが狩られるかな？」' },
    ],
  },
};

/** 種族・形態の 名前(rosterData の 表と 同じ) */
const FORM_NAME: Record<string, [string, string, string]> = {
  bunk: ['BUNK', 'BUNKER', 'BUNKLORD'], mofu: ['MOFU', 'MOFUR', 'MOFUGARD'], zipp: ['ZIPP', 'ZIPRO', 'ZIPRAX'], puni: ['PUNI', 'PUNISH', 'PUNISHROOM'], klak: ['KLAK', 'KLAKER', 'KLAKTRAP'],
  riot: ['RIOT', 'RIOTER', 'RIOTRAX'], snek: ['SNEK', 'SNEKER', 'SNEKXUS'], grit: ['GRIT', 'GRITTER', 'GRITBULL'], vybe: ['VYBE', 'VYGA', 'VYGARD'], shellz: ['SHELLZ', 'SHELD', 'SHELDOZER'],
};
export const formName = (species: string, form: number) => FORM_NAME[species]?.[form - 1] ?? species.toUpperCase();

/**
 * 30のステージ【仮】。CPU は どんどん強くなる(2026-11-05 企画者)。
 * - レベル: 1〜10 = 1→28(第1形態)・11〜20 = 30→57(第2形態)・21〜30 = 60→96、さいごは 100(最終進化)
 * - うまさ: 6ステージごとに 1つ上がる(1→5)。中ボスは +1・さいごの ボスは 5
 * - HP: 1ステージめ ×1.3 から 1つごとに +0.05(30で ×2.75)。ボスは さらに ×1.4(企画者「体力ももっと多くして大丈夫」)
 * - 5・10・15・20・25 は 中ボス、30 が さいごの ボス
 */
export const STORY_STAGES: StoryStage[] = Array.from({ length: STORY_COUNT }, (_, i) => {
  const no = i + 1;
  const last = no === STORY_COUNT;
  const mid = no % 5 === 0 && !last;
  const form = (no <= 10 ? 1 : no <= 20 ? 2 : 3) as 1 | 2 | 3;
  const k = (no - 1) % 10;
  const species = last ? KROWN.species : STORY_ORDER[form][k];
  const chapter = Math.ceil(no / 5);
  const level = last ? 100 : form === 1 ? 1 + k * 3 : form === 2 ? 30 + k * 3 : 60 + k * 4;
  return {
    no,
    title: STORY_SCRIPTS[no]?.title ?? (last ? 'KROWN戦' : mid ? `ステージ${no}（中ボス）` : `ステージ${no}`),
    lines: STORY_SCRIPTS[no]?.lines ?? [],
    text: '（ここに話が入ります。企画者が一枚絵と文を作ります）',
    image: STORY_IMAGES[no] ?? null,
    map: CHAPTER_MAP[chapter - 1],
    chapter,
    enemy: {
      species,
      form,
      name: last ? KROWN.name : formName(species, form),
      level,
      prof: last ? 5 : Math.min(5, 1 + Math.floor((no - 1) / 6) + (mid ? 1 : 0)),
      boss: last || mid,
      hp: +((1.3 + (no - 1) * 0.05) * (last || mid ? BOSS_HP : 1)).toFixed(2),
    },
  };
});

/** バトルモードのマップ(マップが増えたら ランダムに。今はロストテンプルだけ) */
export const pickFreeMap = (rng: () => number, ids: string[]): string => ids[Math.floor(rng() * ids.length)] ?? 'grassland';

/** 戦いのうまさ(1〜5)を、5つの全部に同じだけ */
export const profOf = (n: number): Proficiency => ({ attack: n, defense: n, evasion: n, counter: n, spacing: n });

/** 次に遊べるマス(cleared = クリアしたいちばん先のマス) */
export const nextStage = (cleared: number) => Math.min(STORY_COUNT, cleared + 1);
/** そのマスを遊べるか(クリアした所と、次のマス) */
export const canPlay = (no: number, cleared: number) => no >= 1 && no <= nextStage(cleared);
