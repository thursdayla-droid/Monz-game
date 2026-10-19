import { BunkBrain } from './bunkBehavior';
import { insidePolygon, randomPointIn, type Pt } from './home';
import { range, type Rng } from './rng';

/**
 * お世話画面でMONZが自分で生活する仕組み(第1段階)。Phaserに依存しない。
 * 何もしない時間をはさみながら、次の行動を気まぐれに選ぶ。同じ行動は続けて選びにくくする。
 * 体の動き(姿・表情・歩くときの揺れ)は BunkBrain に伝え、位置と向きはここで持つ。
 * 【仮】座る・伸び・横向きの絵がまだないので、今ある姿と動きで表す(素材が届いたら差しかえる)。
 */
export type LifeAct = 'idle' | 'walk' | 'explore' | 'look' | 'rest' | 'sleep' | 'hop' | 'lookAtYou' | 'box';

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
};
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
  ) {
    [this.x, this.y] = start ?? randomPointIn(rng, floor);
    body.hold = true;
    this.timer = range(rng, ...IDLE_TIME);
  }

  /** なでる・ごはんなどのあいだ、自分で動くのを止める(秒) */
  pause(seconds: number): void {
    this.paused = Math.max(this.paused, seconds);
    this.target = null;
    if (this.act !== 'idle') this.begin('idle', range(this.rng, ...IDLE_TIME));
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

  /** 次の行動を選ぶ。行動のあとは、たいてい何もしない時間をはさむ */
  private next(): void {
    if (this.act === 'explore' && this.stops > 0 && !this.target) {
      this.walkTo(this.pickTarget(160, 420));
      return;
    }
    if (this.act !== 'idle' && this.rng() < 0.8) {
      this.begin('idle', range(this.rng, ...IDLE_TIME));
      return;
    }
    const acts = Object.keys(LIFE_RULES) as Exclude<LifeAct, 'idle'>[];
    const weights = acts.map((a) => {
      let w = LIFE_RULES[a].weight;
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
        // 【仮】座る絵がないので、腕を下ろしてじっとする
        body.start('idle');
        body.setPose('down');
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
