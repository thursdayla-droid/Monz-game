import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import type { StatBlock } from '../core/stats';
import { B3, ORDER_NAMES, type OrderName, type Proficiency } from '../core/battle3d/config';
import { b3Finished, giveOrder, newB3Battle, orderState, stepB3, type B3Battle, type B3Entrant, type B3Event } from '../core/battle3d/engine';
import { Arena3D, guardLabel } from '../render/arena3d';
import { UI_FONT } from '../ui/paint';
import { partnerEntrant, rivalEntrant } from './AutoBattleScene';

/** 4つの指示【確定】(Ver.41)。ボタンの文字 */
const ORDER_LABEL: Record<OrderName, string> = { attack: '攻めろ！', defend: '守れ！', evade: '避けろ！', now: '今だ！' };
const ORDER_COLOR: Record<OrderName, string> = { attack: '#ff5a3a', defend: '#3a8aff', evade: '#3ac070', now: '#ffb000' };
/** 【仮】AI習熟度。まだ育てる仕組み・保存がないので、自分も相手も Lv.2 */
const START_PROFICIENCY: Proficiency = { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 };

const CSS = `
.b3d{position:fixed;inset:0;z-index:50;background:#1b1024;font-family:${UI_FONT};color:#fff;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden}
.b3d canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.b3d .top{position:absolute;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top) + 8px) 12px 0;display:flex;gap:10px;align-items:flex-start;pointer-events:none}
.b3d .back{pointer-events:auto;background:#16101ccc;border:0;color:#fff;font:900 15px ${UI_FONT};padding:8px 12px;border-radius:10px}
.b3d .side{flex:1;min-width:0}
.b3d .name{font-weight:900;font-size:14px;text-shadow:0 2px 0 #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.b3d .bar{height:12px;border-radius:6px;background:#0008;border:2px solid #16101c;overflow:hidden;margin-top:3px}
.b3d .bar>i{display:block;height:100%;transition:width .12s}
.b3d .st{height:6px;margin-top:3px}
.b3d .tag{font-size:11px;font-weight:900;color:#ffb070;height:14px}
.b3d .r{text-align:right}
.b3d .r .bar>i{margin-left:auto}
.b3d .timer{font-weight:900;font-size:22px;min-width:36px;text-align:center;text-shadow:0 2px 0 #000;padding-top:14px}
.b3d .combo{position:absolute;top:28%;font-weight:900;font-size:40px;color:#ffd23a;text-shadow:0 3px 0 #16101c,0 0 12px #ff6a00;opacity:0;transition:opacity .2s;pointer-events:none}
.b3d .combo.l{left:16px}.b3d .combo.r{right:16px}
.b3d .combo small{font-size:18px;display:block;color:#fff}
.b3d .pop{position:absolute;left:50%;top:40%;transform:translate(-50%,-50%);font-weight:900;font-size:34px;color:#fff;text-shadow:0 3px 0 #16101c,0 0 14px #3af;pointer-events:none;opacity:0;white-space:nowrap}
.b3d .big{position:absolute;left:0;right:0;top:38%;text-align:center;font-weight:900;font-size:72px;color:#ffd23a;text-shadow:0 5px 0 #16101c,0 0 24px #f40;pointer-events:none;opacity:0}
.b3d .orders{position:absolute;left:0;right:0;bottom:0;padding:0 10px calc(env(safe-area-inset-bottom) + 12px);display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.b3d .orders button{position:relative;height:74px;border-radius:16px;border:3px solid #16101c;color:#fff;font:900 min(18px,4.2vw) ${UI_FONT};white-space:nowrap;letter-spacing:-.04em;padding:0;text-shadow:0 2px 0 #0008;overflow:hidden;box-shadow:0 4px 0 #16101c}
.b3d .orders button:active{transform:translateY(3px);box-shadow:0 1px 0 #16101c}
.b3d .orders button .cd{position:absolute;left:0;bottom:0;right:0;background:#000a;pointer-events:none}
.b3d .orders button .lb{position:relative}
.b3d .orders button .sub{position:absolute;left:0;right:0;bottom:4px;font-size:10px;color:#fff}
.b3d .orders button.reserved{outline:3px solid #fff;animation:b3p .4s infinite alternate}
.b3d .orders button.cool{filter:grayscale(.7) brightness(.7)}
.b3d .orders button.hint{box-shadow:0 0 16px 4px #ffd23a,0 4px 0 #16101c}
@keyframes b3p{to{outline-color:#ffd23a}}
.b3d .state{position:absolute;left:0;right:0;bottom:calc(env(safe-area-inset-bottom) + 100px);text-align:center;font-weight:900;font-size:14px;text-shadow:0 2px 0 #000;pointer-events:none}
.b3d .result{position:absolute;inset:0;background:#0d0614c0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:18px}
.b3d .result h1{margin:0;font-size:64px;color:#ffd23a;text-shadow:0 5px 0 #16101c}
.b3d .result button{font:900 22px ${UI_FONT};padding:12px 28px;border-radius:14px;border:3px solid #16101c;background:#ffd23a;color:#16101c;min-width:200px}
.b3d .orders .gap{display:none}
.b3d .turn{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#0d0614d0;z-index:5}
.b3d .turn div{border:4px solid #ffd23a;border-radius:18px;background:#16101c;color:#ffd23a;font-weight:900;font-size:26px;padding:22px 30px;text-align:center}
.b3d .turn small{display:block;color:#fff;font-size:14px;margin-top:8px}
@media (orientation:landscape){
 .b3d .top{padding-left:calc(env(safe-area-inset-left) + 10px);padding-right:calc(env(safe-area-inset-right) + 10px)}
 .b3d .orders{grid-template-columns:repeat(2,minmax(76px,104px)) 1fr repeat(2,minmax(76px,104px));padding-left:calc(env(safe-area-inset-left) + 10px);padding-right:calc(env(safe-area-inset-right) + 10px);padding-bottom:calc(env(safe-area-inset-bottom) + 8px)}
 .b3d .orders .gap{display:block}
 .b3d .orders button{height:60px;font-size:16px}
 .b3d .state{bottom:calc(env(safe-area-inset-bottom) + 76px)}
 .b3d .note{display:none!important}
 .b3d .combo{top:30%}
}
.b3d .note{position:absolute;left:0;right:0;top:calc(env(safe-area-inset-top) + 74px);text-align:center;font-size:11px;color:#fff9;pointer-events:none}
`;

/**
 * 【使っていない】格闘ゲーム風の試作(2026-11-01)。企画者「違うな！アニメのポケモンバトルのような感じ」で Battle3DScene(アニメ風)に置きかえた。比べられるようにコードは残す(main.ts には登録していない)。
 * 3Dオートバトル(企画者 BATTLE SYSTEM Ver.41・2026-10-31 / 試作の開始 2026-11-01「やってみてください」)。
 * 3D の絵は Three.js で、Phaser の画面の上に重ねる。ボタン・HP は HTML。横画面(企画者 2026-11-01)。縦のときは止めて「横にしてね」を出す
 * 【仮】キャラクターは仮の人形(BUNKの3Dモデル待ち)。相手は 10/30 と同じ「色違いのBUNK」の能力。報酬はまだない。
 * 入口: 3Dバトル用の確認用ページ(window.__MONZ_START = 'Battle3D')。バトルメニューの「バトル」は、企画者の確認が終わるまで 10/30 の2Dオートバトルのまま
 */
export class Battle3DFightScene extends Phaser.Scene {
  private battle!: B3Battle;
  private arena?: Arena3D;
  private root?: HTMLDivElement;
  private ui!: {
    hp: HTMLElement[];
    st: HTMLElement[];
    tag: HTMLElement[];
    timer: HTMLElement;
    combo: HTMLElement[];
    pop: HTMLElement;
    big: HTMLElement;
    state: HTMLElement;
    btn: Record<OrderName, { el: HTMLButtonElement; cd: HTMLElement; sub: HTMLElement }>;
    result: HTMLElement;
    resultTitle: HTMLElement;
    turn: HTMLElement;
  };
  private hitStop = 0;
  private slowT = 0;
  private zoomT = 0;
  private zoomTo = 1;
  private comboHold = [0, 0];
  private ended = false;
  private onResize = () => this.resize();

  constructor() {
    super('Battle3DFight');
  }

  create(): void {
    this.ended = false;
    this.hitStop = this.slowT = this.zoomT = 0;
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const partner = partnerEntrant();
    const me: B3Entrant = { ...partner.entrant, proficiency: { ...START_PROFICIENCY } };
    const rival = rivalEntrant(partner.level, seed);
    const foe: B3Entrant = { ...rival, stats: rival.stats as StatBlock, proficiency: { ...START_PROFICIENCY } };
    this.battle = newB3Battle(me, foe, seed);
    this.buildDom();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    audio.playBgm('dash');
  }

  private buildDom(): void {
    const root = document.createElement('div');
    root.className = 'b3d';
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    const canvas = document.createElement('canvas');
    root.appendChild(canvas);
    const [p, q] = this.battle.f;
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="top"><button class="back">◀</button>
        <div class="side"><div class="name">${esc(p.name)}</div><div class="bar"><i style="background:#3ad070;width:100%"></i></div><div class="bar st"><i style="background:#ffd23a;width:100%"></i></div><div class="tag"></div></div>
        <div class="timer">90</div>
        <div class="side r"><div class="name">${esc(q.name)}</div><div class="bar"><i style="background:#ff5a5a;width:100%"></i></div><div class="bar st"><i style="background:#ffd23a;width:100%"></i></div><div class="tag"></div></div></div>
       <div class="note">【試作】仮の人形で動きを確かめる画面です（BUNKの3Dモデル待ち）</div>
       <div class="combo l"></div><div class="combo r"></div><div class="pop"></div><div class="big"></div><div class="state"></div>
       <div class="orders">${ORDER_NAMES.map((o, i) => `${i === 2 ? '<span class="gap"></span>' : ''}<button data-o="${o}" style="background:${ORDER_COLOR[o]}"><span class="lb">${ORDER_LABEL[o]}</span><span class="sub"></span><span class="cd" style="height:0"></span></button>`).join('')}</div>
       <div class="turn"><div>スマホを 横にしてね<small>横にすると バトルが始まります</small></div></div>
       <div class="result"><h1></h1><button class="again">もう一度</button><button class="leave">もどる</button></div>`,
    );
    document.body.appendChild(root);
    this.root = root;
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    const all = (s: string) => [...root.querySelectorAll(s)] as HTMLElement[];
    const btn = {} as Battle3DFightScene['ui']['btn'];
    for (const el of all('.orders button') as HTMLButtonElement[]) {
      const o = el.dataset.o as OrderName;
      btn[o] = { el, cd: el.querySelector('.cd') as HTMLElement, sub: el.querySelector('.sub') as HTMLElement };
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        audio.unlock();
        if (giveOrder(this.battle, 0, o)) audio.se('select');
        else audio.se('beep');
      });
    }
    this.ui = {
      hp: all('.side .bar:not(.st) > i'),
      st: all('.side .st > i'),
      tag: all('.side .tag'),
      timer: $('.timer'),
      combo: all('.combo'),
      pop: $('.pop'),
      big: $('.big'),
      state: $('.state'),
      btn,
      result: $('.result'),
      resultTitle: $('.result h1'),
      turn: $('.turn'),
    };
    $('.back').addEventListener('click', () => this.leave());
    $('.leave').addEventListener('click', () => this.leave());
    $('.again').addEventListener('click', () => {
      audio.se('tap');
      this.scene.restart();
    });
    this.arena = new Arena3D(canvas);
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  private resize(): void {
    if (!this.root || !this.arena) return;
    this.arena.resize(this.root.clientWidth, this.root.clientHeight);
  }

  update(_time: number, delta: number): void {
    if (!this.arena || !this.root) return;
    // 横画面で遊ぶ(企画者 2026-11-01「横画面で良いよ」)。縦のあいだは止めて「横にしてね」
    const portrait = this.root.clientWidth < this.root.clientHeight;
    this.ui.turn.style.display = portrait ? 'flex' : 'none';
    if (portrait) return;
    let dt = Math.min(delta / 1000, 0.1);
    const real = dt;
    // 5ヒット目のヒットストップ・KOのスロー【確定】
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt = 0;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= 0.3;
    }
    const b = this.battle;
    if (dt > 0 && !b3Finished(b)) {
      b.events = [];
      stepB3(b, dt);
      for (const e of b.events) this.onEvent(e);
    }
    // 演出のズーム(戻す)
    if (this.zoomT > 0) {
      this.zoomT -= real;
      this.arena.zoom += (this.zoomTo - this.arena.zoom) * Math.min(1, real * 30);
    } else this.arena.zoom += (1 - this.arena.zoom) * Math.min(1, real * 8);
    this.arena.render(b, real);
    this.drawHud(real);
    if (b3Finished(b) && !this.ended) this.showResult();
  }

  private onEvent(e: B3Event): void {
    const A = this.arena!;
    switch (e.kind) {
      case 'windup':
        audio.se('whoosh', { pitch: e.move === 'smash' ? 0.75 : e.move === 'jab' ? 1.25 : 1 });
        break;
      case 'hit':
        A.spark(e.x, e.y, e.z, e.combo >= 3 ? 'big' : 'hit', 0.8 + e.combo * 0.15);
        A.flash(e.target);
        // 【仮】当たった瞬間に少し止まって、画面がゆれる(手ごたえ。企画者 2026-11-01「もっと格闘ゲームぽく」)
        {
          const pw = B3.moves[e.move].power;
          this.hitStop = Math.max(this.hitStop, 0.035 + pw * 0.0035);
          A.shake(0.03 + pw * 0.006);
        }
        audio.se(e.move === 'smash' || e.move === 'counter' ? 'punchHeavy' : 'punch', { pitch: 0.9 + e.combo * 0.06 });
        if (e.combo >= 2) {
          const c = this.ui.combo[e.side];
          c.innerHTML = `${e.combo}<small>HIT</small>`;
          c.style.opacity = '1';
          this.comboHold[e.side] = 1.1;
        }
        break;
      case 'fifth':
        // 5ヒット目の短い演出【確定】ヒットストップ50ms・ズーム1.05倍120ms・VFX250ms・振動80ms
        this.hitStop = B3.fx.fifth.hitStop;
        this.zoom(B3.fx.fifth.zoom, B3.fx.fifth.zoomTime);
        {
          const t = this.battle.f[e.target];
          A.spark(t.x, t.y + 0.9, t.z, 'big', 2.2);
          A.ring(t.x, t.z, 0xffb000);
        }
        navigator.vibrate?.(B3.fx.fifth.vibrate);
        A.shake(0.18);
        audio.se('crackBig');
        break;
      case 'block': {
        const perfect = e.grade === 'perfect' || e.grade === 'good';
        A.spark(e.x, e.y, e.z, e.grade === 'perfect' ? 'perfect' : 'guard', e.grade === 'perfect' ? 1.6 : 1);
        audio.se('guard', { pitch: e.grade === 'perfect' ? 1.4 : 1 });
        A.shake(0.02);
        if (e.grade === 'perfect') this.hitStop = Math.max(this.hitStop, 0.08);
        if (perfect) {
          const t = this.battle.f[e.target];
          A.ring(t.x, t.z, e.grade === 'perfect' ? 0x7affee : 0x5aa8ff);
          this.pop(guardLabel[e.grade], e.grade === 'perfect' ? '#7affee' : '#9ad0ff');
        }
        break;
      }
      case 'counter':
        this.pop('COUNTER!', '#ffd23a');
        break;
      case 'dodged':
        audio.se('whoosh', { pitch: 1.5 });
        if (e.side === 0) this.pop('よけた！', '#7dffa0');
        break;
      case 'step':
        audio.se('whoosh', { pitch: e.back ? 1.6 : 1.4 });
        break;
      case 'land': {
        const f = this.battle.f[e.side];
        A.dust(f.x, f.z, e.hard);
        if (e.hard) {
          audio.se('land');
          A.shake(0.06);
        }
        break;
      }
      case 'jump':
        audio.se('hop', { pitch: 1.2 });
        break;
      case 'exhausted':
        if (e.side === 0) this.pop('息切れ…', '#ffb070');
        break;
      case 'order':
        if (e.side === 0 && e.state === 'executed') this.pop(ORDER_LABEL[e.order], ORDER_COLOR[e.order]);
        break;
      case 'ko':
        // KO【確定】ズーム約1.08倍＋約0.8秒スロー
        this.slowT = B3.fx.ko.slow;
        this.zoom(B3.fx.ko.zoom, B3.fx.ko.slow);
        this.big('K.O.!');
        A.shake(0.25);
        audio.se('koBlast');
        navigator.vibrate?.(120);
        break;
      case 'timeUp':
        this.big('TIME UP');
        audio.se('whistle');
        break;
      case 'victory':
        audio.se(e.side === 0 ? 'cheer' : 'back');
        break;
      case 'whiff':
        break;
    }
  }

  private zoom(z: number, t: number): void {
    this.zoomTo = z;
    this.zoomT = t;
  }

  private pop(text: string, color: string): void {
    const el = this.ui.pop;
    el.textContent = text;
    el.style.color = color;
    el.animate(
      [
        { opacity: 0, transform: 'translate(-50%,-30%) scale(.7)' },
        { opacity: 1, transform: 'translate(-50%,-50%) scale(1.1)', offset: 0.2 },
        { opacity: 1, transform: 'translate(-50%,-55%) scale(1)', offset: 0.7 },
        { opacity: 0, transform: 'translate(-50%,-70%) scale(1)' },
      ],
      { duration: 700 },
    );
  }

  private big(text: string): void {
    const el = this.ui.big;
    el.textContent = text;
    el.animate(
      [
        { opacity: 0, transform: 'scale(2)' },
        { opacity: 1, transform: 'scale(1)', offset: 0.15 },
        { opacity: 1, transform: 'scale(1)', offset: 0.8 },
        { opacity: 0, transform: 'scale(1)' },
      ],
      { duration: 1600 },
    );
  }

  private drawHud(dt: number): void {
    const b = this.battle;
    b.f.forEach((f, i) => {
      this.ui.hp[i].style.width = `${(f.hp / f.maxHp) * 100}%`;
      this.ui.st[i].style.width = `${(f.stamina / B3.stamina.max) * 100}%`;
      this.ui.st[i].style.background = f.exhausted ? '#ff7a3a' : '#ffd23a';
      this.ui.tag[i].textContent = f.exhausted ? '息切れ' : '';
      this.comboHold[i] -= dt;
      if (this.comboHold[i] <= 0) this.ui.combo[i].style.opacity = '0';
    });
    this.ui.timer.textContent = String(Math.max(0, Math.ceil(B3.timeLimit - b.t)));
    const me = b.f[0];
    for (const o of ORDER_NAMES) {
      const s = orderState(b, 0, o);
      const btn = this.ui.btn[o];
      btn.el.classList.toggle('reserved', s === 'reserved');
      btn.el.classList.toggle('cool', s === 'cooldown');
      const left = Math.max(0, me.cooldown[o] - b.t);
      btn.cd.style.height = `${s === 'cooldown' ? (left / B3.orders.cooldown[o]) * 100 : 0}%`;
      btn.sub.textContent = s === 'reserved' ? '予約中' : '';
      // 反撃のチャンス(ジャストガードのあと)は「今だ！」を光らせる
      btn.el.classList.toggle('hint', o === 'now' && b.t <= me.counterUntil && s === 'ready');
    }
    const r = me.reserve;
    this.ui.state.textContent = r ? `${ORDER_LABEL[r.order]} を予約中… あと${Math.max(0, Math.ceil((r.until - b.t) * 10) / 10).toFixed(1)}秒` : '';
  }

  private showResult(): void {
    this.ended = true;
    const w = this.battle.winner;
    this.ui.resultTitle.textContent = w === 0 ? 'WIN!' : w === 1 ? 'LOSE…' : 'DRAW';
    this.ui.result.style.display = 'flex';
  }

  private leave(): void {
    audio.se('back');
    this.scene.start('BattleMenu');
  }

  private cleanup(): void {
    window.removeEventListener('resize', this.onResize);
    this.arena?.dispose();
    this.arena = undefined;
    this.root?.remove();
    this.root = undefined;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
