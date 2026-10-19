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

/**
 * 回答から最初に出会うMONZを決める場所。
 * 【未確定】判定ルールは企画者が決める。今は判定しない(null を返す)。
 * MONZがBUNKしかいないあいだは、呼び出し側でBUNKを出している。
 */
export function decideFirstMonz(_answers: Answers): string | null {
  return null;
}
