import { BunkBrain } from './bunkBehavior';
import { newNeeds, type Needs } from './needs';
import { insidePolygon, randomPointIn, type Pt } from './home';
import { range, type Rng } from './rng';

/**
 * お世話画面でMONZが自分で生活する仕組み(第1段階)。Phaserに依存しない。
 * 何もしない時間をはさみながら、次の行動を気まぐれに選ぶ。同じ行動は続けて選びにくくする。
 * 体の動き(姿・表情・歩くときの揺れ)は BunkBrain に伝え、位置と向きはここで持つ。
 * 【仮】座る・伸び・横向きの絵がまだないので、今ある姿と動きで表す(素材が届いたら差しかえる)。
 * 第2段階: お腹・眠さ・機嫌(src/core/needs.ts)で、選ぶ行動と表情が変わる。
 *   お腹がすく → しょんぼりして、ごはんを欲しがる(beg) / 眠い → よく眠る / 機嫌がいい → よく跳ねる・こっちを見る / 悪い → じっとする
 *   企画者決定(2026-10-21): お腹のゲージが3以下 → お腹すいた姿がとても多い / なでるのゲージが3以下 → 泣いている姿(cry)がとても多い
 */
export type LifeAct = 'idle' | 'walk' | 'explore' | 'look' | 'rest' | 'sleep' | 'hop' | 'lookAtYou' | 'box' | 'stretch' | 'beg' | 'cry';

interface ActRule {
  weight: number;
  /** 続ける秒数 [最小, 最大] */
  time: [number, number];
}

/** 【仮】行動の選ばれやすさと長さ。あとで性格(第4段階)によって変える */
export const LIFE_RULES: Record<Exclude<LifeAct, 'idle'>, ActRule> = {
  walk: { weight: 5, time: [2, 5] },
  explore: { weight: 2, time: [6, 10] },
  look: { weight: 3, time: [2.5, 4.5] },
  rest: { weight: 2, time: [5, 10] },
  sleep: { weight: 1, time: [10, 18] },
  hop: { weight: 1.5, time: [1.4, 1.4] },
  lookAtYou: { weight: 2, time: [2, 3.5] },
  box: { weight: 1.5, time: [2, 3.5] },
  stretch: { weight: 1.2, time: [1.8, 2.4] },
  // お腹がすいたときだけ選ぶ
  beg: { weight: 0, time: [3, 5] },
  // なでてほしいときだけ選ぶ(泣いている)
  cry: { weight: 0, time: [3, 5] },
};

/** お腹・眠さ・機嫌による、行動の選ばれやすさの倍率 */
export function needWeights(n: Needs): Partial<Record<Exclude<LifeAct, 'idle'>, number>> {
  const w: Partial<Record<Exclude<LifeAct, 'idle'>, number>> = {};
  const mul = (a: Exclude<LifeAct, 'idle'>, k: number) => (w[a] = (w[a] ?? 1) * k);
  // ゲージ3以下(10目もりの3)。ほかの行動よりずっと選ばれやすくする
  if (n.full <= 0.3 + 1e-9) {
    w.beg = 12;
    mul('hop', 0.3);
    mul('box', 0.4);
  }
  if ((n.touch ?? 1) <= 0.3 + 1e-9) {
    w.cry = 12;
    mul('hop', 0.3);
    mul('lookAtYou', 0.5);
  }
  if (n.sleepy > 0.6) {
    mul('sleep', 3);
    mul('rest', 1.5);
    mul('stretch', 1.5);
    mul('hop', 0.5);
    mul('explore', 0.5);
  }
  if (n.mood < 0.3) {
    mul('hop', 0.2);
    mul('lookAtYou', 0.3);
    mul('box', 0.5);
    mul('rest', 2);
  } else if (n.mood > 0.7) {
    mul('hop', 1.8);
    mul('lookAtYou', 1.5);
  }
  return w;
}
/** 行動と行動のあいだの、何もしない時間 */
const IDLE_TIME: [number, number] = [1.5, 5];
/** 歩く速さ(画面の手前での px/秒)。奥ではゆっくりに見せる */
const WALK_SPEED = 70;

export class MonzLife {
  act: LifeAct = 'idle';
  x: number;
  y: number;
  /** 向き(1=右向き=元の絵, -1=左向き=反転) */
  facing: 1 | -1 = 1;
  private timer: number;
  private target: Pt | null = null;
  /** 探索のとき、あと何か所立ち寄るか */
  private stops = 0;
  private recent: LifeAct[] = [];
  private paused = 0;
  private lookTimer = 0;
  private boxTimer = 0;

  constructor(
    readonly body: BunkBrain,
    private readonly floor: Pt[],
    private readonly rng: Rng,
    /** 奥(0)〜手前(1)の割合を返す。速さの調整に使う */
    private readonly depth: (y: number) => number,
    start?: Pt,
    /** 今のお腹・眠さ・機嫌 */
    private readonly needs: () => Needs = newNeeds,
  ) {
    [this.x, this.y] = start ?? randomPointIn(rng, floor);
    body.hold = true;
    this.timer = range(rng, ...IDLE_TIME);
  }

  /** なでる・ごはんなどのあいだ、自分で動くのを止める(秒)。keepAct: 今の行動(眠るなど)は続けたまま止まる */
  pause(seconds: number, keepAct = false): void {
    this.paused = Math.max(this.paused, seconds);
    this.target = null;
    if (keepAct) {
      if (this.act !== 'sleep') this.body.start('idle');
      return;
    }
    if (this.act !== 'idle') this.begin('idle', range(this.rng, ...IDLE_TIME));
  }

  /** タップされた: 足を止めて、こっちを見る(眠っていたら起きて嫌がる) */
  tapped(): 'look' | 'angry' {
    if (this.act === 'sleep') {
      this.pause(1.6);
      this.body.pet();
      return 'angry';
    }
    this.pause(1.6);
    this.facing = 1;
    this.body.setPose('guard');
    this.body.reaction = { face: this.rng() < 0.5 ? 'happy' : null, kind: 'calm', left: 1.4, age: 0 };
    return 'look';
  }

  /**
   * 指でなでられている(なぞった距離ごとに呼ぶ)。止まったまま、うれしそうにする。ときどき小さく跳ねる。
   * 眠っているときは起こさずに、気持ちよさそうに眠り続ける。機嫌が悪いと、ときどき嫌がる。
   * enough: 今日はもう十分なでられた(お世話マックス)。なでると怒る(企画者の指示 2026-10-20)。
   */
  stroked(enough = false): 'happy' | 'angry' | 'asleep' {
    if (this.act === 'sleep') {
      this.pause(1.2, true);
      return 'asleep';
    }
    this.pause(1.2, true);
    if (enough || (this.needs().mood < 0.3 && this.rng() < 0.35)) {
      this.body.reaction = { face: 'angry', kind: 'angry', left: 1.2, age: 0 };
      return 'angry';
    }
    const hop = this.rng() < 0.2;
    this.body.reaction = { face: this.rng() < 0.85 ? 'happy' : 'closed', kind: hop ? 'happy' : 'calm', left: hop ? 1.0 : 0.8, age: 0 };
    return 'happy';
  }

  get isPaused(): boolean {
    return this.paused > 0;
  }

  update(dt: number): void {
    this.body.update(dt);
    if (this.paused > 0) {
      this.paused -= dt;
      return;
    }
    if (this.target) this.move(dt);
    if (this.act === 'look') {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0) {
        this.facing = this.facing === 1 ? -1 : 1;
        this.lookTimer = range(this.rng, 0.7, 1.6);
      }
    }
    if (this.act === 'box') {
      this.boxTimer -= dt;
      if (this.boxTimer <= 0) {
        this.body.startJab();
        this.boxTimer = range(this.rng, 0.45, 0.9);
      }
    }
    this.timer -= dt;
    if (this.timer <= 0 && !(this.target && (this.act === 'walk' || this.act === 'explore'))) this.next();
  }

  private move(dt: number): void {
    const [tx, ty] = this.target!;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const dist = Math.hypot(dx, dy);
    const speed = WALK_SPEED * (0.6 + 0.4 * this.depth(this.y));
    if (dist <= speed * dt) {
      [this.x, this.y] = [tx, ty];
      this.target = null;
      if (this.act === 'explore' && this.stops > 0) {
        // ちょっと立ち止まってから、次の場所へ
        this.stops--;
        this.body.start('idle');
        this.timer = range(this.rng, 1, 2.5);
        this.act = 'explore';
        return;
      }
      this.timer = 0;
      return;
    }
    const nx = this.x + (dx / dist) * speed * dt;
    const ny = this.y + (dy / dist) * speed * dt;
    // 床の外には出ない(念のため)
    if (insidePolygon([nx, ny], this.floor)) [this.x, this.y] = [nx, ny];
    else this.target = null;
    if (Math.abs(dx) > 4) this.facing = dx > 0 ? 1 : -1;
    this.body.dir = this.facing;
  }

  /** なでられた(なでるボタン)。機嫌が悪いと怒りやすい。enough: お世話マックスなら怒る */
  petted(enough = false): 'happy' | 'angry' | 'surprised' {
    const n = this.needs();
    if ((enough && this.act !== 'sleep') || (n.mood < 0.3 && this.act !== 'sleep' && this.rng() < 0.5)) {
      this.body.start('idle');
      this.body.reaction = { face: 'angry', kind: 'angry', left: 1.4, age: 0 };
      return 'angry';
    }
    return this.body.pet();
  }

  /** 次の行動を選ぶ。行動のあとは、たいてい何もしない時間をはさむ */
  private next(): void {
    // 眠いときは眠る(眠っていれば、そのまま眠り続ける)
    if (this.needs().asleep) {
      if (this.act === 'sleep') this.timer = range(this.rng, 10, 20);
      else this.begin('sleep', range(this.rng, 20, 40));
      return;
    }
    // 起きたら、まず伸びをする
    if (this.act === 'sleep') {
      this.begin('stretch', range(this.rng, ...LIFE_RULES.stretch.time));
      return;
    }
    if (this.act === 'explore' && this.stops > 0 && !this.target) {
      this.walkTo(this.pickTarget(160, 420));
      return;
    }
    if (this.act !== 'idle' && this.rng() < 0.8) {
      this.begin('idle', range(this.rng, ...IDLE_TIME));
      return;
    }
    const acts = Object.keys(LIFE_RULES) as Exclude<LifeAct, 'idle'>[];
    const byNeeds = needWeights(this.needs());
    const weights = acts.map((a) => {
      let w = a === 'beg' || a === 'cry' ? (byNeeds[a] ?? 0) : LIFE_RULES[a].weight * (byNeeds[a] ?? 1);
      // 最近やったことは選びにくい(同じことのくり返しを避ける)
      const ago = this.recent.lastIndexOf(a);
      if (ago >= 0) w *= ago === this.recent.length - 1 ? 0.1 : 0.4;
      return w;
    });
    const total = weights.reduce((s, w) => s + w, 0);
    let r = this.rng() * total;
    let act = acts[acts.length - 1];
    for (let i = 0; i < acts.length; i++) {
      r -= weights[i];
      if (r < 0) {
        act = acts[i];
        break;
      }
    }
    this.begin(act, range(this.rng, ...LIFE_RULES[act].time));
  }

  private begin(act: LifeAct, seconds: number): void {
    this.act = act;
    this.timer = seconds;
    this.target = null;
    if (act !== 'idle') this.recent = [...this.recent, act].slice(-3);
    const body = this.body;
    body.reaction = null;
    switch (act) {
      case 'idle':
        body.start('idle');
        break;
      case 'walk':
        this.walkTo(this.pickTarget(80, 300));
        break;
      case 'explore':
        this.stops = 1 + Math.floor(this.rng() * 2);
        this.walkTo(this.pickTarget(200, 480));
        break;
      case 'look':
        body.start('idle');
        this.lookTimer = range(this.rng, 0.5, 1.2);
        break;
      case 'rest':
        // 【仮】座る絵がないので、腕を下ろしてじっとする。機嫌が悪いとしょんぼり、眠いと目を閉じる
        body.start('idle');
        body.setPose('down');
        if (this.needs().mood < 0.3) body.reaction = { face: 'sad', kind: 'calm', left: seconds, age: 0 };
        else if (this.needs().sleepy > 0.6) body.reaction = { face: 'closed', kind: 'calm', left: seconds, age: 0 };
        break;
      case 'stretch':
        body.start('idle');
        break;
      case 'beg':
        // ごはんを欲しがる: こっちを向いて、しょんぼり顔(画面に肉の吹き出しを出す)
        body.start('idle');
        body.setPose('down');
        body.reaction = { face: 'sad', kind: 'calm', left: seconds, age: 0 };
        break;
      case 'cry':
        // なでてほしくて泣いている: 腕を下ろして、泣き顔
        body.start('idle');
        body.setPose('down');
        body.reaction = { face: 'sad', kind: 'calm', left: seconds, age: 0 };
        break;
      case 'sleep':
        body.start('sleep');
        break;
      case 'hop':
        body.start('idle');
        body.reaction = { face: 'happy', kind: 'happy', left: seconds, age: 0 };
        break;
      case 'lookAtYou':
        // こちら(画面の手前)を見る: 正面の構えで、少しうれしそうに
        body.start('idle');
        body.setPose('guard');
        body.reaction = { face: this.rng() < 0.5 ? 'happy' : null, kind: 'calm', left: seconds, age: 0 };
        break;
      case 'box':
        // シャドーボクシング(BUNKはボクサー)
        body.start('idle');
        body.setPose('guard');
        this.boxTimer = 0.3;
        break;
    }
  }

  private walkTo(p: Pt): void {
    this.target = p;
    this.body.start('walk');
    this.body.dir = p[0] >= this.x ? 1 : -1;
    this.facing = this.body.dir;
  }

  /** 今いる場所から、だいたい min〜max 離れた床の上の点 */
  private pickTarget(min: number, max: number): Pt {
    let best: Pt = randomPointIn(this.rng, this.floor);
    for (let i = 0; i < 20; i++) {
      const p = randomPointIn(this.rng, this.floor);
      const d = Math.hypot(p[0] - this.x, p[1] - this.y);
      best = p;
      if (d >= min && d <= max) break;
    }
    return best;
  }
}
