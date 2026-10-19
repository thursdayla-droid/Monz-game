import type { Personality } from './dna';
import { reactToPet } from './reaction';
import { mulberry32, range, type Rng } from './rng';
import type { BehaviorConfig, BunkFace, BunkPoseName } from './bunkPose';

export type BunkActivity = 'idle' | 'walk' | 'sleep';

/**
 * 【仮】BUNKの自律行動(テスト実装)。Phaserに依存しない。
 * - 構え ⇄ 腕を下ろした姿 を時々切りかえる
 * - 歩くのと眠るのは、腕を下ろした姿のとき
 * - タップ(なでる)すると、喜ぶ・嫌がる。寝ているときは起きて嫌がる
 */
export class BunkBrain {
  pose: BunkPoseName = 'guard';
  activity: BunkActivity = 'idle';
  /** 歩く向き(1=右, -1=左) */
  dir: 1 | -1 = 1;
  /** 反応中の表情と残り時間(calm は体を動かさず表情だけ) */
  reaction: { face: BunkFace | null; kind: 'happy' | 'angry' | 'surprised' | 'calm'; left: number; age: number } | null = null;
  /** 姿を切りかえている途中(0〜1)。null なら切りかえ中ではない */
  switching: { to: BunkPoseName; k: number; then: BunkActivity } | null = null;
  /** 拳を突き出している途中(0〜1)。null なら突き出していない */
  jab: number | null = null;
  /** true のあいだは自分で行動を変えない(確認用) */
  hold = false;
  /** 拳を突き出す時間(秒) */
  jabDuration = 0.34;

  private timer: number;
  private jabTimer: number;
  private readonly rng: Rng;

  constructor(
    private readonly cfg: BehaviorConfig,
    seed: number,
    private readonly personality: Personality,
  ) {
    this.rng = mulberry32(seed);
    this.timer = range(this.rng, ...cfg.guardTime);
    this.jabTimer = range(this.rng, ...cfg.jabInterval);
  }

  update(dt: number): void {
    if (this.switching) {
      this.switching.k += dt / this.cfg.switchTime;
      if (this.switching.k >= 0.5 && this.pose !== this.switching.to) this.pose = this.switching.to;
      if (this.switching.k >= 1) {
        this.activity = this.switching.then;
        this.timer = this.durationOf(this.activity);
        this.switching = null;
      }
      return;
    }
    if (this.reaction) {
      this.reaction.left -= dt;
      this.reaction.age += dt;
      if (this.reaction.left <= 0) this.reaction = null;
      return;
    }
    if (this.jab !== null) {
      this.jab += dt / this.jabDuration;
      if (this.jab >= 1) this.jab = null;
    } else if (this.pose === 'guard' && this.activity === 'idle' && !this.hold) {
      this.jabTimer -= dt;
      if (this.jabTimer <= 0) {
        this.jab = 0;
        this.jabTimer = range(this.rng, ...this.cfg.jabInterval);
      }
    }
    if (this.hold) return;
    this.timer -= dt;
    if (this.timer <= 0) this.next();
  }

  /** 次の行動を選ぶ */
  private next(): void {
    if (this.activity !== 'idle') {
      this.activity = 'idle';
      this.timer = this.durationOf('idle');
      return;
    }
    const r = this.rng();
    if (r < this.cfg.walkChance) this.start('walk');
    else if (r < this.cfg.walkChance + this.cfg.sleepChance) this.start('sleep');
    else this.setPose(this.pose === 'guard' ? 'down' : 'guard');
  }

  private durationOf(a: BunkActivity): number {
    if (a === 'walk') return range(this.rng, ...this.cfg.walkTime);
    if (a === 'sleep') return range(this.rng, ...this.cfg.sleepTime);
    return range(this.rng, ...(this.pose === 'guard' ? this.cfg.guardTime : this.cfg.downTime));
  }

  /** 歩く・眠るを始める(腕を下ろした姿で行う) */
  start(a: BunkActivity): void {
    this.reaction = null;
    this.jab = null;
    if (a === 'walk' && this.rng() < 0.5) this.dir = this.dir === 1 ? -1 : 1;
    if (a !== 'idle' && this.pose !== 'down') {
      this.switching = { to: 'down', k: 0, then: a };
      return;
    }
    this.activity = a;
    this.timer = this.durationOf(a);
  }

  setPose(p: BunkPoseName): void {
    if (p === this.pose && !this.switching) return;
    this.jab = null;
    this.switching = { to: p, k: 0, then: 'idle' };
  }

  startJab(): void {
    if (this.pose === 'guard' && !this.switching) this.jab = 0;
  }

  /** 歩いていて端に着いたら向きを変える */
  bounce(dir: 1 | -1): void {
    this.dir = dir;
  }

  /** なでられた(タップされた) */
  pet(): 'happy' | 'angry' | 'surprised' {
    if (this.switching) return 'surprised';
    if (this.activity === 'sleep') {
      this.activity = 'idle';
      this.timer = this.durationOf('idle');
      this.reaction = { face: 'angry', kind: 'angry', left: this.cfg.reactTime, age: 0 };
      return 'angry';
    }
    if (this.activity === 'walk') {
      this.activity = 'idle';
      this.timer = this.durationOf('idle');
    }
    const e = reactToPet(this.personality, this.rng);
    const kind = e === 'happy' ? 'happy' : e === 'angry' ? 'angry' : 'surprised';
    this.jab = null;
    this.reaction = { face: kind === 'surprised' ? null : kind, kind, left: this.cfg.reactTime, age: 0 };
    return kind;
  }

  /** 今の表情(null ならふつうの顔) */
  face(): BunkFace | null {
    if (this.reaction?.face) return this.reaction.face;
    if (this.activity === 'sleep' && !this.switching) return 'closed';
    return null;
  }
}
