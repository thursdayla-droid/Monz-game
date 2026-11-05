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
