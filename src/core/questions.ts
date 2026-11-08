/**
 * 初回起動時の質問(2026-10-19 企画者指定の文面)。Phaserに依存しない。
 * 文面の {…} は強調する言葉。icon は【仮】の絵文字(絵の素材ができたら差しかえる)。
 */
export interface Choice {
  id: string;
  label: string;
  icon: string;
}

export interface Question {
  id: string;
  title: string;
  sub: string;
  choices: Choice[];
  /** 選択肢の並べ方。grid=2×2 / rows=横長カードを縦に並べる */
  layout: 'grid' | 'rows';
}

export const INTRO = {
  title: 'まずは\n{あなたのこと}を\n教えてください！',
  sub: 'MONZをもっと楽しむために\nいくつか質問するよ！',
};

export const QUESTIONS: Question[] = [
  {
    id: 'personality',
    title: 'キミはどんな\n{性格}？',
    sub: '一番近いものを選んでね！',
    layout: 'grid',
    choices: [
      { id: 'energetic', label: '元気でやんちゃ', icon: '👑' },
      { id: 'easygoing', label: 'のんびりマイペース', icon: '💗' },
      { id: 'cool', label: 'クールでカッコいい', icon: '⚡' },
      { id: 'quirky', label: 'ちょっと変わり者', icon: '⚙️' },
    ],
  },
  {
    id: 'world',
    title: 'どんな世界で\n{冒険}したい？',
    sub: '行ってみたい場所を選んでね！',
    layout: 'rows',
    choices: [
      { id: 'city', label: '街・シティ', icon: 'city' },
      { id: 'forest', label: '森・自然', icon: 'forest' },
      { id: 'ruins', label: '遺跡・ミステリー', icon: 'ruins' },
    ],
  },
  {
    id: 'play',
    title: 'MONZと一緒に\n{なにをしたい}？',
    sub: 'メインで楽しみたいものを選んでね！',
    layout: 'grid',
    choices: [
      { id: 'battle', label: 'バトルを楽しみたい', icon: '⚔️' },
      { id: 'collect', label: 'コレクションを集めたい', icon: '⭐' },
      { id: 'adventure', label: 'のんびり冒険したい', icon: '📖' },
      { id: 'live', label: '一緒に暮らしたい', icon: '🏠' },
    ],
  },
  {
    id: 'pinch',
    title: '{ピンチ}のとき、\nキミならどうする？',
    sub: '一番近いものを選んでね！',
    layout: 'grid',
    choices: [
      { id: 'charge', label: '正面突破！', icon: '👊' },
      { id: 'plan', label: '作戦を考える！', icon: '🧠' },
      { id: 'team', label: '仲間と協力！', icon: '🤝' },
      { id: 'run', label: 'まずは逃げる！', icon: '💨' },
    ],
  },
  {
    id: 'money',
    title: '道端に{100万円}が\n落ちてた！\nキミならどうする？',
    sub: '一番近いものを選んでね！',
    layout: 'grid',
    choices: [
      { id: 'police', label: 'もちろん交番に届ける！', icon: '👮' },
      { id: 'lookaround', label: 'とりあえず周りを確認する', icon: '👀' },
      { id: 'yakiniku', label: '今日は焼肉だぁぁ！！', icon: '🥩' },
      { id: 'sns', label: '拾う前にSNSに投稿する', icon: '📱' },
    ],
  },
];

/** 質問id → 選んだ選択肢id */
export type Answers = Record<string, string>;

export function isComplete(answers: Answers): boolean {
  return QUESTIONS.every((q) => q.choices.some((c) => c.id === answers[q.id]));
}

/** 最初に 生まれる MONZ の 候補(敵 専用の CROWNIE は 出ない) */
export const FIRST_MONZ = ['bunk', 'mofu', 'zipp', 'puni', 'klak', 'riot', 'snek', 'grit', 'vybe', 'shellz'] as const;

/**
 * 答えごとに 生まれやすく なる MONZ【仮：Claude の 案。企画者が 変えられる】。
 * 種族の 性格(stats.ts の コメント)に 合わせた: BUNK 元気・パワー／MOFU のんびり・守り／ZIPP 速い／PUNI のんびり・変わり者／KLAK 作戦・メカ／
 * RIOT 暴れる／SNEK クール・ずる賢い／GRIT 重い・まじめ／VYBE クール・電気・目立ちたがり／SHELLZ のんびり・かたい
 */
const LEAN: Record<string, Record<string, string[]>> = {
  personality: { energetic: ['bunk', 'riot', 'zipp'], easygoing: ['mofu', 'puni', 'shellz'], cool: ['snek', 'vybe', 'zipp'], quirky: ['klak', 'puni', 'vybe'] },
  world: { city: ['bunk', 'vybe', 'riot', 'klak'], forest: ['mofu', 'snek', 'grit', 'puni'], ruins: ['klak', 'shellz', 'grit', 'snek'] },
  play: { battle: ['riot', 'grit', 'bunk'], collect: ['klak', 'vybe', 'zipp'], adventure: ['zipp', 'snek', 'shellz'], live: ['mofu', 'puni', 'bunk'] },
  pinch: { charge: ['bunk', 'riot', 'grit'], plan: ['klak', 'snek', 'vybe'], team: ['mofu', 'puni', 'shellz'], run: ['zipp', 'snek', 'mofu'] },
  money: { police: ['grit', 'shellz', 'mofu'], lookaround: ['snek', 'klak', 'zipp'], yakiniku: ['bunk', 'riot', 'puni'], sns: ['vybe', 'zipp', 'klak'] },
};

/** 答えから 決まる 生まれやすさ(どの MONZ も 1 は ある = 必ず どれでも 生まれる 見こみが ある) */
export function firstMonzWeights(answers: Answers): Record<string, number> {
  const w: Record<string, number> = Object.fromEntries(FIRST_MONZ.map((m) => [m, 1]));
  for (const [q, a] of Object.entries(answers)) for (const m of LEAN[q]?.[a] ?? []) w[m] += 2;
  return w;
}

/**
 * 回答から 最初に 出会う MONZ を 決める(2026-11-08 企画者「質問から 色んな MONZ が 生まれるように。この 答えだから これしか 産まれないってのも やめて」)。
 * 答えで 生まれやすさが 変わるが、くじ引きなので 同じ 答えでも ちがう MONZ が 生まれる。rnd: 0〜1 の 乱数
 */
export function decideFirstMonz(answers: Answers, rnd: () => number = Math.random): string {
  const w = firstMonzWeights(answers);
  let r = rnd() * Object.values(w).reduce((a, b) => a + b, 0);
  for (const m of FIRST_MONZ) if ((r -= w[m]) < 0) return m;
  return FIRST_MONZ[FIRST_MONZ.length - 1];
}
