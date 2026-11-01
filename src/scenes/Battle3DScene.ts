import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import type { StatBlock } from '../core/stats';
import type { Proficiency } from '../core/battle3d/config';
import { ANIME, TECHS, TECH_IDS, type TechId } from '../core/battle3d/animeConfig';
import { animeFinished, commandState, giveCommand, newAnimeBattle, stepAnime, type AnimeBattle, type AnimeEntrant, type AnimeEvent, type Command } from '../core/battle3d/anime';
import { AnimeField, ELEMENT_HEX } from '../render/animeField';
import { UI_FONT } from '../ui/paint';
import { partnerEntrant, rivalEntrant } from './AutoBattleScene';

/** 【仮】AI習熟度。まだ育てる仕組み・保存がないので、自分も相手も Lv.2 */
const START_PROFICIENCY: Proficiency = { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 };
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

const CSS = `
.b3d{position:fixed;inset:0;z-index:50;background:#8ac8f5;font-family:${UI_FONT};color:#fff;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden}
.b3d canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.b3d .top{position:absolute;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 10px) 0 calc(env(safe-area-inset-left) + 10px);display:flex;gap:10px;align-items:flex-start;pointer-events:none}
.b3d .back{pointer-events:auto;background:#16101ccc;border:0;color:#fff;font:900 15px ${UI_FONT};padding:8px 12px;border-radius:10px}
.b3d .card{flex:0 1 260px;min-width:0;background:#fffffff0;color:#16101c;border-radius:12px;padding:5px 10px 7px;border:3px solid #16101c;box-shadow:0 3px 0 #16101c}
.b3d .card.r{margin-left:auto}
.b3d .name{font-weight:900;font-size:14px;display:flex;justify-content:space-between}
.b3d .name small{font-size:11px;color:#6a6070}
.b3d .bar{height:10px;border-radius:5px;background:#3a3040;overflow:hidden;margin-top:3px}
.b3d .bar>i{display:block;height:100%;background:#3ad070;transition:width .25s}
.b3d .num{font-size:11px;font-weight:900;text-align:right;margin-top:1px}
.b3d .timer{font-weight:900;font-size:20px;min-width:36px;text-align:center;text-shadow:0 2px 0 #16101c;padding-top:10px;margin:0 auto}
.b3d .call{position:absolute;left:50%;top:26%;transform:translateX(-50%);font-weight:900;font-size:26px;white-space:nowrap;padding:8px 22px;border-radius:12px;background:#16101ce0;border:3px solid #fff;opacity:0;pointer-events:none}
.b3d .pop{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-weight:900;font-size:30px;color:#fff;text-shadow:0 3px 0 #16101c;pointer-events:none;opacity:0;white-space:nowrap}
.b3d .big{position:absolute;left:0;right:0;top:36%;text-align:center;font-weight:900;font-size:68px;color:#ffd23a;text-shadow:0 5px 0 #16101c,0 0 24px #f40;pointer-events:none;opacity:0}
.b3d .cmds{position:absolute;left:0;right:0;bottom:0;padding:0 calc(env(safe-area-inset-right) + 10px) calc(env(safe-area-inset-bottom) + 8px) calc(env(safe-area-inset-left) + 10px);display:grid;grid-template-columns:repeat(2,minmax(84px,150px)) minmax(70px,1fr) repeat(2,minmax(84px,150px));gap:8px;align-items:end}
.b3d .cmds button{position:relative;height:58px;border-radius:14px;border:3px solid #16101c;color:#16101c;font:900 min(15px,2.1vw) ${UI_FONT};white-space:nowrap;letter-spacing:-.05em;padding:0 4px;overflow:hidden;box-shadow:0 4px 0 #16101c;background:#fff}
.b3d .cmds button .el{display:block;font-size:10px;color:#fff;border-radius:6px;margin:0 auto 2px;width:3.2em}
.b3d .cmds button .cd{position:absolute;left:0;bottom:0;right:0;background:#16101c99;pointer-events:none}
.b3d .cmds button .lb{position:relative}
.b3d .cmds button:active{transform:translateY(3px);box-shadow:0 1px 0 #16101c}
.b3d .cmds button.queued{outline:3px solid #ffd23a;animation:b3p .35s infinite alternate}
.b3d .cmds button.cool{filter:grayscale(.8) brightness(.8)}
.b3d .cmds .mid{display:flex;justify-content:center}
.b3d .cmds .dodge{width:min(96px,100%);height:46px;background:#16101c;color:#fff;border-color:#fff}
@keyframes b3p{to{outline-color:#fff}}
.b3d .result{position:absolute;inset:0;background:#0d0614b0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:16px}
.b3d .result h1{margin:0;font-size:60px;color:#ffd23a;text-shadow:0 5px 0 #16101c}
.b3d .result button{font:900 22px ${UI_FONT};padding:10px 28px;border-radius:14px;border:3px solid #16101c;background:#ffd23a;color:#16101c;min-width:200px}
.b3d .turn{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:#0d0614d0;z-index:5}
.b3d .turn div{border:4px solid #ffd23a;border-radius:18px;background:#16101c;color:#ffd23a;font-weight:900;font-size:26px;padding:22px 30px;text-align:center}
.b3d .turn small{display:block;color:#fff;font-size:14px;margin-top:8px}
`;

/**
 * 3Dバトル「アニメのモンスターバトル風」(企画者 2026-11-01「アニメのポケモンバトルのような感じ」)。
 * - 広い野外のコートで、モンスターが動き回り、技を撃ち合う。プレイヤーは「技の名前」のボタンで指示する
 * - 3D の絵は Three.js、ボタン・HP は HTML。横画面(企画者 2026-11-01)。縦のときは止めて「横にしてね」
 * 【仮】モンスターは仮(BUNKの3Dモデル待ち)。技の名前・数・強さ、相手(色違いのBUNKの能力)、報酬なし。
 * 前の「格闘ゲーム風」の試作は Battle3DFightScene に残してある。
 * 入口: 3Dバトル用の確認用ページ(window.__MONZ_START = 'Battle3D')。バトルメニューの「バトル」は 10/30 の2Dオートバトルのまま
 */
export class Battle3DScene extends Phaser.Scene {
  private battle!: AnimeBattle;
  private field?: AnimeField;
  private root?: HTMLDivElement;
  private ui!: {
    hp: HTMLElement[];
    num: HTMLElement[];
    timer: HTMLElement;
    call: HTMLElement;
    pop: HTMLElement;
    big: HTMLElement;
    btn: Record<Command, { el: HTMLButtonElement; cd: HTMLElement }>;
    result: HTMLElement;
    resultTitle: HTMLElement;
    turn: HTMLElement;
  };
  private slowT = 0;
  private zoomT = 0;
  private hitStop = 0;
  private ended = false;
  private started = false;
  private onResize = () => this.resize();

  constructor() {
    super('Battle3D');
  }

  create(): void {
    this.ended = false;
    this.started = false;
    this.slowT = this.zoomT = this.hitStop = 0;
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const partner = partnerEntrant();
    const me: AnimeEntrant = { ...partner.entrant, proficiency: { ...START_PROFICIENCY } };
    const rival = rivalEntrant(partner.level, seed);
    const foe: AnimeEntrant = { ...rival, stats: rival.stats as StatBlock, proficiency: { ...START_PROFICIENCY } };
    this.battle = newAnimeBattle(me, foe, seed);
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
    const card = (f: typeof p, cls: string) => `<div class="card ${cls}"><div class="name"><span>${esc(f.name)}</span><small>${f === p ? 'あなた' : 'あいて'}</small></div><div class="bar"><i style="width:100%"></i></div><div class="num">${f.hp}/${f.maxHp}</div></div>`;
    const techBtn = (id: TechId) => {
      const t = TECHS[id];
      return `<button data-c="${id}"><span class="el" style="background:${hex(ELEMENT_HEX[t.element])};${t.element === '無' ? 'color:#16101c' : ''}">${t.element}</span><span class="lb">${t.name}</span><span class="cd" style="height:0"></span></button>`;
    };
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="top"><button class="back">◀</button>${card(p, '')}<div class="timer">90</div>${card(q, 'r')}</div>
       <div class="call"></div><div class="pop"></div><div class="big"></div>
       <div class="cmds">${techBtn(TECH_IDS[0])}${techBtn(TECH_IDS[1])}<div class="mid"><button class="dodge" data-c="dodge"><span class="lb">よけろ！</span><span class="cd" style="height:0"></span></button></div>${techBtn(TECH_IDS[2])}${techBtn(TECH_IDS[3])}</div>
       <div class="result"><h1></h1><button class="again">もう一度</button><button class="leave">もどる</button></div>
       <div class="turn"><div>スマホを 横にしてね<small>横にすると バトルが始まります</small></div></div>`,
    );
    document.body.appendChild(root);
    this.root = root;
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    const all = (s: string) => [...root.querySelectorAll(s)] as HTMLElement[];
    const btn = {} as Battle3DScene['ui']['btn'];
    for (const el of all('.cmds button') as HTMLButtonElement[]) {
      const c = el.dataset.c as Command;
      btn[c] = { el, cd: el.querySelector('.cd') as HTMLElement };
      el.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        audio.unlock();
        if (giveCommand(this.battle, 0, c)) audio.se('select');
        else audio.se('beep');
      });
    }
    this.ui = {
      hp: all('.card .bar > i'),
      num: all('.card .num'),
      timer: $('.timer'),
      call: $('.call'),
      pop: $('.pop'),
      big: $('.big'),
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
    this.field = new AnimeField(canvas);
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  private resize(): void {
    if (!this.root || !this.field) return;
    this.field.resize(this.root.clientWidth, this.root.clientHeight);
  }

  update(_time: number, delta: number): void {
    if (!this.field || !this.root) return;
    // 横画面で遊ぶ(企画者 2026-11-01)。縦のあいだは止めて「横にしてね」
    const portrait = this.root.clientWidth < this.root.clientHeight;
    this.ui.turn.style.display = portrait ? 'flex' : 'none';
    if (portrait) return;
    if (!this.started) {
      this.started = true;
      this.big('BATTLE START!');
      audio.se('whistle');
    }
    let dt = Math.min(delta / 1000, 0.1);
    const real = dt;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt = 0;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= 0.3;
    }
    const b = this.battle;
    if (dt > 0 && !animeFinished(b)) {
      b.events = [];
      stepAnime(b, dt);
      for (const e of b.events) this.onEvent(e);
    }
    if (this.zoomT > 0) {
      this.zoomT -= real;
      this.field.zoom += (ANIME.fx.ko.zoom - this.field.zoom) * Math.min(1, real * 20);
    } else this.field.zoom += (1 - this.field.zoom) * Math.min(1, real * 6);
    this.field.render(b, dt > 0 ? dt : real * 0.05);
    this.drawHud();
    if (animeFinished(b) && !this.ended) this.showResult();
  }

  private onEvent(e: AnimeEvent): void {
    const F = this.field!;
    const b = this.battle;
    switch (e.kind) {
      case 'call': {
        // 技の名前をさけぶ(アニメ風)。自分の指示 → 「BUNK、○○だ！」
        const t = TECHS[e.tech];
        const f = b.f[e.side];
        const text = e.side === 0 ? (e.byCommand ? `${f.name}、${t.name}だ！` : `${f.name}の ${t.name}！`) : `あいての ${t.name}！`;
        this.call(text, hex(ELEMENT_HEX[t.element]), e.side === 0 ? '#3a9cff' : '#ff4a4a');
        audio.se(t.kind === 'beam' ? 'mcThunder' : t.kind === 'shot' ? 'mcFire' : 'whoosh', { pitch: 1 });
        break;
      }
      case 'fire': {
        const k = TECHS[e.tech].kind;
        if (k === 'beam') {
          audio.se('mcMagic');
          F.shake(0.25);
        } else if (k === 'shot') audio.se('mcSlash', { pitch: 1.2 });
        else if (k === 'rush') audio.se('whoosh', { pitch: 0.8 });
        else audio.se('hop', { pitch: 0.8 });
        break;
      }
      case 'hit':
        F.flash(e.target);
        audio.se(e.big ? 'punchHeavy' : 'punch', { pitch: 0.9 + Math.random() * 0.2 });
        this.hitStop = Math.max(this.hitStop, e.big ? 0.1 : 0.05);
        if (!e.big) F.explode(e.x, e.y, e.z, e.tech, false);
        this.pop(`-${e.damage}`, e.target === 0 ? '#ff8a8a' : '#ffd23a');
        break;
      case 'explode':
        F.explode(e.x, e.y, e.z, e.tech, e.big);
        audio.se('crackBig', { pitch: e.big ? 0.8 : 1.2 });
        break;
      case 'clash':
        F.clash(e.x, e.y, e.z);
        audio.se('koBlast', { pitch: 1.3 });
        this.pop('ぶつかった！', '#ffffff');
        break;
      case 'quake':
        F.rocks(e.x, e.z);
        audio.se('slam');
        break;
      case 'dodge':
        audio.se('whoosh', { pitch: 1.5 });
        break;
      case 'evaded':
        this.pop(e.side === 0 ? 'よけた！' : 'よけられた！', e.side === 0 ? '#7dffa0' : '#ffb070');
        break;
      case 'land': {
        const f = b.f[e.side];
        F.dust(f.x, f.z, e.hard);
        if (e.hard) audio.se('land');
        break;
      }
      case 'command':
        if (e.side === 0 && e.state === 'expired') this.pop('いまは 出せない…', '#ffb070');
        break;
      case 'ko':
        this.slowT = ANIME.fx.ko.slow;
        this.zoomT = ANIME.fx.ko.slow;
        this.big(`${b.f[e.side].name} は たおれた！`);
        audio.se('koBlast');
        navigator.vibrate?.(120);
        F.shake(0.4);
        break;
      case 'timeUp':
        this.big('TIME UP');
        audio.se('whistle');
        break;
      case 'victory':
        audio.se(e.side === 0 ? 'cheer' : 'back');
        break;
    }
  }

  private call(text: string, color: string, border: string): void {
    const el = this.ui.call;
    el.textContent = text;
    el.style.color = color;
    el.style.borderColor = border;
    el.animate(
      [
        { opacity: 0, transform: 'translateX(-50%) scale(.6)' },
        { opacity: 1, transform: 'translateX(-50%) scale(1.08)', offset: 0.12 },
        { opacity: 1, transform: 'translateX(-50%) scale(1)', offset: 0.8 },
        { opacity: 0, transform: 'translateX(-50%) scale(1)' },
      ],
      { duration: 1300 },
    );
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
      { duration: 800 },
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
      { duration: 1700 },
    );
  }

  private drawHud(): void {
    const b = this.battle;
    b.f.forEach((f, i) => {
      const r = f.hp / f.maxHp;
      this.ui.hp[i].style.width = `${r * 100}%`;
      this.ui.hp[i].style.background = r > 0.5 ? '#3ad070' : r > 0.2 ? '#ffc020' : '#ff4a4a';
      this.ui.num[i].textContent = `${f.hp}/${f.maxHp}`;
    });
    this.ui.timer.textContent = String(Math.max(0, Math.ceil(ANIME.timeLimit - b.t)));
    const me = b.f[0];
    for (const c of [...TECH_IDS, 'dodge'] as Command[]) {
      const s = commandState(b, 0, c);
      const btn = this.ui.btn[c];
      btn.el.classList.toggle('queued', s === 'queued');
      btn.el.classList.toggle('cool', s === 'cooldown');
      const total = c === 'dodge' ? ANIME.dodge.cooldown : TECHS[c].cooldown;
      btn.cd.style.height = `${s === 'cooldown' ? (Math.max(0, me.cooldown[c] - b.t) / total) * 100 : 0}%`;
    }
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
    this.field?.dispose();
    this.field = undefined;
    this.root?.remove();
    this.root = undefined;
  }
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
