import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { newAdventure, stepAdventure, adventureReward, unequip, useBagItem, useHerb, BAG_MAX, SLOT_NAMES, type AdvItem, type AdvState, type AdvTech, type GearSlot } from '../core/adventure/sim';
import { getTech, isSupportTech } from '../core/battle3d/techTable';
import { RANK_HEX } from '../render/dungeonView';
import type { Proficiency } from '../core/battle3d/config';
import type { AnimeEntrant } from '../core/battle3d/anime';
import { formAt } from '../core/battle3d/techLearn';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { modelFor } from '../core/roster';
import { DungeonView } from '../render/dungeonView';
import { UI_FONT } from '../ui/paint';
import { partnerEntrant } from './AutoBattleScene';

/**
 * 冒険(2026-11-07 企画者)。試作: 1階だけ。今 育てている MONZ で ダンジョンを 歩き、モブを 全部 倒して 出口へ。
 * 横画面。左で 移動・右の こうげき で 攻撃。技・ドロップ・ボスは 次の 段階(docs/ADVENTURE.md)。
 */
const CSS = `
.adv{position:fixed;inset:0;z-index:50;background:#0b0712;color:#fff;font-family:${UI_FONT};user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden}
.adv canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.adv .top{position:absolute;left:0;right:0;top:0;display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 12px) 0 calc(env(safe-area-inset-left) + 12px);pointer-events:none}
.adv .top>*{pointer-events:auto}
.adv .back{background:#16101ccc;border:0;color:#fff;font:900 15px ${UI_FONT};padding:8px 12px;border-radius:10px}
.adv .me{background:#16101ccc;border-radius:12px;padding:5px 10px;min-width:180px}
.adv .me .nm{font-size:13px;font-weight:900}
.adv .me .bar{height:10px;background:#3a2a44;border-radius:6px;overflow:hidden;margin-top:3px}
.adv .me .bar i{display:block;height:100%;background:#3ad070;width:100%;transition:width .15s}
.adv .me .num{font-size:11px;text-align:right}
.adv .goal{margin-left:auto;background:#16101ccc;border-radius:12px;padding:7px 12px;font-size:14px;font-weight:900}
.adv .goal b{color:#ffd23a}
.adv .stickZone{position:absolute;left:0;top:60px;bottom:0;width:50%;touch-action:none}
.adv .stickBase{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:#ffffff30;border:3px solid #ffffffa0;display:none;pointer-events:none}
.adv .stickKnob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:#ffffffd0;border:3px solid #16101c}
.adv .stickHint{position:absolute;left:calc(env(safe-area-inset-left) + 40px);bottom:calc(env(safe-area-inset-bottom) + 34px);width:110px;height:110px;border-radius:50%;border:3px dashed #ffffff80;color:#ffffffc0;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;text-align:center;pointer-events:none}
.adv .atk{position:absolute;right:calc(env(safe-area-inset-right) + 26px);bottom:calc(env(safe-area-inset-bottom) + 26px);width:92px;height:92px;border-radius:50%;border:4px solid #fff;background:#e0303a;color:#fff;font:900 16px ${UI_FONT};box-shadow:0 5px 0 #16101c}
.adv .atk:active{transform:translateY(3px);box-shadow:0 2px 0 #16101c}
/* 2026-11-07 企画者「攻撃の まわりに 技4個の 丸ボタン・小さめ・一旦 ABCD」「アイテムを 使う 丸ボタン」 */
.adv .tb,.adv .ib{position:absolute;width:46px;height:46px;border-radius:50%;border:3px solid #fff;background:#3a2a6acc;color:#fff;font:900 17px ${UI_FONT};box-shadow:0 3px 0 #16101c;overflow:hidden;padding:0}
.adv .tb .cd{position:absolute;inset:0;border-radius:50%;pointer-events:none}
.adv .tb .lb,.adv .ib .lb{position:relative}
.adv .tb.sup{background:#2a8a5acc}
.adv .tb:disabled{opacity:.35}
.adv .ib{width:50px;height:50px;background:#2a8a3acc;font-size:12px;line-height:1.05}
.adv .ib b{display:block;font-size:15px}
.adv .ib:disabled{opacity:.4}
.adv .tb:active,.adv .ib:active{transform:translateY(2px);box-shadow:0 1px 0 #16101c}
.adv .bagBtn{background:#16101ccc;border:2px solid #ffffff60;color:#fff;font:900 14px ${UI_FONT};padding:7px 12px;border-radius:12px}
.adv .bag{position:absolute;inset:0;z-index:20;background:#0b0712e6;display:none;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 14px) calc(env(safe-area-inset-bottom) + 8px) calc(env(safe-area-inset-left) + 14px)}
.adv .bag .box{width:min(100%,720px);max-height:100%;overflow:auto;background:#1e1430;border:3px solid #ffd23a;border-radius:16px;padding:10px 14px;display:flex;flex-direction:column;gap:8px;box-sizing:border-box}
.adv .bag h3{margin:0;font-size:16px;color:#ffd23a;display:flex;justify-content:space-between;align-items:center}
.adv .bag .gear{display:flex;gap:8px}
.adv .bag .gs{flex:1;border:2px dashed #ffffff60;border-radius:10px;padding:6px;text-align:center;font-size:12px;font-weight:900;background:#ffffff10;color:#fff}
.adv .bag .gs.on{border-style:solid}
.adv .bag .grid{display:grid;grid-template-columns:repeat(10,1fr);gap:5px}
.adv .bag .it{aspect-ratio:1;border-radius:9px;border:2px solid #ffffff40;background:#ffffff10;color:#fff;font:900 11px ${UI_FONT};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;line-height:1.1}
.adv .bag .it b{font-size:15px}
.adv .bag .note{font-size:11px;color:#c8bcd8}
.adv .bag .close{align-self:center;font:900 16px ${UI_FONT};padding:7px 26px;border-radius:12px;border:3px solid #16101c;background:#ffd23a;color:#16101c}
.adv .msg{position:absolute;left:0;right:0;top:34%;text-align:center;font:900 min(48px,9vh) ${UI_FONT};color:#7affd0;-webkit-text-stroke:2px #16101c;text-shadow:0 5px 0 #16101c;pointer-events:none;opacity:0;transition:opacity .3s}
.adv .result{position:absolute;inset:0;background:#0b0712d0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px}
.adv .result h1{margin:0;font-size:min(64px,13vh);letter-spacing:.06em;color:#ffd23a;-webkit-text-stroke:3px #16101c;text-shadow:0 6px 0 #16101c}
.adv .result.lose h1{color:#9ab4ff}
.adv .result p{margin:0;font-size:17px;font-weight:900}
.adv .result .row{display:flex;gap:12px}
.adv .result button{font:900 19px ${UI_FONT};padding:9px 22px;border-radius:14px;border:3px solid #16101c;background:#ffd23a;color:#16101c;box-shadow:0 4px 0 #16101c}
.adv .rot{position:absolute;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:#0d0614f5}
.adv .rot div{border:4px solid #ffd23a;border-radius:18px;background:#16101c;color:#ffd23a;font-weight:900;font-size:26px;padding:22px 30px;text-align:center}
.adv .rot small{display:block;color:#fff;font-size:14px;margin-top:8px}
@media (orientation:portrait){.adv .rot{display:flex}}
`;

const START_PROFICIENCY: Proficiency = { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 };

export class AdventureScene extends Phaser.Scene {
  private root?: HTMLDivElement;
  private view?: DungeonView;
  private state!: AdvState;
  private stick = { x: 0, y: 0 };
  private attack = false;
  /** 押した(短く 押しても 1回は 出す) */
  private press = false;
  /** 押した 技(0〜3) */
  private techPress: number | null = null;
  private bagOpen = false;
  private done = false;
  private level = 1;
  private techNames: string[] = [];
  private onResize = () => this.resize();

  constructor() {
    super('Adventure');
  }

  create(): void {
    this.done = false;
    this.stick = { x: 0, y: 0 };
    this.attack = false;
    const partner = partnerEntrant();
    this.level = partner.level;
    const me: AnimeEntrant = { ...partner.entrant, proficiency: { ...START_PROFICIENCY }, form: formAt(partner.level) };
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    // 技: お世話の ステータス(わざ)で セットした 4つ(名前は MONZ RUMBLE の まま。2026-11-07 企画者)
    const life = loadLife();
    const mon = life.monz.find((m) => m.uid === life.activeMonz) ?? life.monz[0];
    const techs: (AdvTech | null)[] = [0, 1, 2, 3].map((i) => {
      const id = mon.techs?.equipped[i];
      if (!id) return null;
      const t = getTech(id);
      return { id, support: isSupportTech(id), power: t.power ?? 0, cooldown: Math.max(2, t.cooldown) };
    });
    this.techNames = techs.map((t) => (t ? getTech(t.id).name : ''));
    this.state = newAdventure(seed, me.stats, 1, techs);
    this.buildDom(me);
    audio.playBgm('battle');
    window.addEventListener('resize', this.onResize);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
  }

  private buildDom(me: AnimeEntrant): void {
    const root = document.createElement('div');
    root.className = 'adv';
    const style = document.createElement('style');
    style.textContent = CSS;
    root.appendChild(style);
    const canvas = document.createElement('canvas');
    root.appendChild(canvas);
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="top"><button class="back">◀ もどる</button><div class="me"><div class="nm">${me.name}　Lv.${this.level}</div><div class="bar"><i></i></div><div class="num"></div></div><div class="goal"></div><button class="bagBtn">もちもの</button></div>
       <div class="stickZone"><div class="stickBase"><div class="stickKnob"></div></div></div>
       <div class="stickHint">ここを<br>さわって<br>うごかす</div>
       <button class="atk">こうげき</button>
       ${[0, 1, 2, 3].map((i) => `<button class="tb" data-i="${i}"><span class="cd"></span><span class="lb">${'ABCD'[i]}</span></button>`).join('')}
       <button class="ib"><span class="lb">回復の実<b>0</b></span></button>
       <div class="bag"><div class="box"></div></div>
       <div class="msg"></div>
       <div class="result"><h1></h1><p class="prize"></p><div class="row"><button class="again">もう一度</button><button class="leave">もどる</button></div></div>
       <div class="rot"><div>スマホを 横にしてね<small>冒険は 横画面で あそびます</small></div></div>`,
    );
    document.body.appendChild(root);
    this.root = root;
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    $('.back').addEventListener('click', () => this.leave());
    $('.leave').addEventListener('click', () => this.leave());
    $('.again').addEventListener('click', () => {
      audio.se('tap');
      this.scene.restart();
    });
    const atk = $('.atk');
    atk.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      audio.unlock();
      this.attack = true;
      this.press = true;
    });
    const off = () => (this.attack = false);
    atk.addEventListener('pointerup', off);
    atk.addEventListener('pointercancel', off);
    atk.addEventListener('pointerleave', off);
    this.bindStick($('.stickZone'), $('.stickBase'), $('.stickKnob'), $('.stickHint'));
    // 技 A〜D: こうげきの まわりに 丸く ならべる(左・左上・上 へ)
    const tbs = [...root.querySelectorAll('.tb')] as HTMLButtonElement[];
    tbs.forEach((b, i) => {
      const a = Math.PI * (1 - i / 3) * 0.5 + Math.PI / 2; // 180° → 90°
      // 2026-11-07 企画者「技ボタン 重ねないで」→ こうげきから はなし、ボタンどうしも すき間を あける
      const R = 108;
      b.style.right = `calc(env(safe-area-inset-right) + ${26 + 46 - 23 + Math.round(-Math.cos(a) * R)}px)`;
      b.style.bottom = `calc(env(safe-area-inset-bottom) + ${26 + 46 - 23 + Math.round(Math.sin(a) * R)}px)`;
      const t = this.state.techs[i];
      b.disabled = !t;
      if (t?.support) b.classList.add('sup');
      b.title = this.techNames[i];
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        audio.unlock();
        if (t) this.techPress = i;
      });
    });
    const ib = $('.ib');
    ib.style.right = 'calc(env(safe-area-inset-right) + 222px)';
    ib.style.bottom = 'calc(env(safe-area-inset-bottom) + 12px)';
    ib.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      audio.unlock();
      if (useHerb(this.state)) audio.se('mcHeal');
      else audio.se('back');
    });
    $('.bagBtn').addEventListener('click', () => this.openBag());
    this.view = new DungeonView(canvas, this.state, me, modelFor(me.species, this.level));
    this.resize();
  }

  private bindStick(zone: HTMLElement, base: HTMLElement, knob: HTMLElement, hint: HTMLElement): void {
    let id: number | null = null;
    let ox = 0;
    let oy = 0;
    const R = 50;
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      let dx = e.clientX - ox;
      let dy = e.clientY - oy;
      const d = Math.hypot(dx, dy);
      if (d > R) {
        dx = (dx / d) * R;
        dy = (dy / d) * R;
      }
      knob.style.transform = `translate(${dx}px,${dy}px)`;
      this.stick = d > 4 ? { x: dx / R, y: dy / R } : { x: 0, y: 0 };
    };
    const end = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      base.style.display = 'none';
      this.stick = { x: 0, y: 0 };
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      audio.unlock();
      id = e.pointerId;
      zone.setPointerCapture(e.pointerId);
      const r = zone.getBoundingClientRect();
      ox = e.clientX;
      oy = e.clientY;
      base.style.left = `${ox - r.left}px`;
      base.style.top = `${oy - r.top}px`;
      base.style.display = 'block';
      knob.style.transform = '';
      hint.style.display = 'none';
    });
    zone.addEventListener('pointermove', move);
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  private resize(): void {
    if (!this.root || !this.view) return;
    this.view.resize(this.root.clientWidth, this.root.clientHeight);
  }

  update(_time: number, delta: number): void {
    if (!this.root || !this.view) return;
    if (this.root.clientWidth < this.root.clientHeight) return;
    const dt = Math.min(0.05, delta / 1000);
    const s = this.state;
    // カメラは 真上 より 少し 手前から 見ているので、スティックの 上 = 画面の 奥(-z)
    if (this.bagOpen) {
      // 持ち物を 見ている 間は 止める
      this.view.render(s, [], 0);
      return;
    }
    stepAdventure(s, { mx: this.stick.x, mz: this.stick.y, attack: this.attack || this.press, tech: this.techPress }, dt);
    if (s.events.some((e) => e.kind === 'attack' && e.id === 0)) this.press = false;
    if (s.player.act === 'tech' || this.techPress === null || (s.techCd[this.techPress] ?? 0) > s.t) this.techPress = null;
    for (const e of s.events) {
      if (e.kind === 'attack' && e.id === 0) audio.se('swing');
      else if (e.kind === 'hit') audio.se(e.target === 0 ? 'punch' : 'b3dPunchHit', e.crit ? { pitch: 0.8 } : undefined);
      else if (e.kind === 'die') audio.se('burst');
      else if (e.kind === 'open') this.message('出口が ひらいた！');
      else if (e.kind === 'tech') {
        audio.se(e.support ? 'mcHeal' : 'punchHeavy');
        this.message(this.techNames[e.slot]);
      } else if (e.kind === 'pick') audio.se('select');
      else if (e.kind === 'full') this.message('もちものが いっぱい（20こ まで）');
    }
    this.view.render(s, s.events, dt);
    this.hud();
    if (s.result !== 'play' && !this.done) this.finish();
  }

  private hud(): void {
    const s = this.state;
    const p = s.player;
    const root = this.root!;
    (root.querySelector('.me .bar i') as HTMLElement).style.width = `${(p.hp / p.maxHp) * 100}%`;
    (root.querySelector('.me .num') as HTMLElement).textContent = `HP ${p.hp}/${p.maxHp}`;
    (root.querySelectorAll('.tb') as NodeListOf<HTMLElement>).forEach((b, i) => {
      const t = s.techs[i];
      const cd = b.querySelector('.cd') as HTMLElement;
      const rest = t ? Math.max(0, s.techCd[i] - s.t) / t.cooldown : 0;
      cd.style.background = rest > 0 ? `conic-gradient(#000a ${rest * 360}deg, transparent 0)` : 'none';
    });
    const herbs = s.bag.filter((b) => b.kind === 'herb').length;
    (root.querySelector('.ib b') as HTMLElement).textContent = String(herbs);
    (root.querySelector('.ib') as HTMLButtonElement).disabled = herbs === 0;
    (root.querySelector('.bagBtn') as HTMLElement).textContent = `もちもの ${s.bag.length}/${BAG_MAX}`;
    const left = s.mobs.filter((m) => m.act !== 'dead').length;
    (root.querySelector('.goal') as HTMLElement).innerHTML = left ? `のこり <b>${left}</b> 体` : '<b>出口</b>へ すすもう';
  }

  private msgT = 0;
  private message(text: string): void {
    const el = this.root?.querySelector('.msg') as HTMLElement | null;
    if (!el) return;
    el.textContent = text;
    el.style.opacity = '1';
    window.clearTimeout(this.msgT);
    this.msgT = window.setTimeout(() => (el.style.opacity = '0'), 1600);
  }

  /** 持ち物の 名前(2文字くらい)と 色 */
  private itemLabel(it: AdvItem): { top: string; sub: string; color: string } {
    if (it.kind === 'herb') return { top: '実', sub: '回復', color: '#5ad05a' };
    return { top: it.rank, sub: SLOT_NAMES[it.slot], color: `#${RANK_HEX[it.rank].toString(16).padStart(6, '0')}` };
  }

  /** 持ち物と 装備(企画者「今 持ってる アイテム一覧と 装備を 変更できる アイテムボタン」)。開いている 間は 止まる */
  private openBag(): void {
    if (this.done) return;
    audio.se('tap');
    this.bagOpen = true;
    const bag = this.root!.querySelector('.bag') as HTMLElement;
    const box = bag.querySelector('.box') as HTMLElement;
    const draw = () => {
      const s = this.state;
      const slots: GearSlot[] = ['claw', 'armor', 'charm'];
      const p = s.player;
      box.innerHTML = `<h3>そうび<span style="font-size:12px;color:#fff">こうげき ${Math.round(p.atk)}・まもり ${Math.round(p.tough)}・HP ${p.hp}/${p.maxHp}</span></h3>
        <div class="gear">${slots
          .map((k) => {
            const g = s.gear[k];
            return `<button class="gs ${g ? 'on' : ''}" data-g="${k}" style="${g ? `border-color:${this.itemLabel(g).color}` : ''}">${SLOT_NAMES[k]}<br>${g ? `<b style="color:${this.itemLabel(g).color};font-size:16px">${g.rank}ランク</b>` : 'なし'}</button>`;
          })
          .join('')}</div>
        <h3>もちもの<span style="font-size:12px;color:#fff">${s.bag.length} / ${BAG_MAX}</span></h3>
        <div class="grid">${Array.from({ length: BAG_MAX }, (_, i) => {
          const it = s.bag[i];
          if (!it) return `<div class="it"></div>`;
          const l = this.itemLabel(it);
          return `<button class="it" data-i="${i}" style="border-color:${l.color}"><b style="color:${l.color}">${l.top}</b>${l.sub}</button>`;
        }).join('')}</div>
        <div class="note">さわると 使う・装備する（装備を さわると はずす）。S が いちばん 強い</div>
        <button class="close">とじる</button>`;
      (box.querySelector('.close') as HTMLElement).addEventListener('click', () => {
        audio.se('back');
        bag.style.display = 'none';
        this.bagOpen = false;
      });
      box.querySelectorAll('.it[data-i]').forEach((el) =>
        el.addEventListener('click', () => {
          const ok = useBagItem(this.state, Number((el as HTMLElement).dataset.i));
          audio.se(ok ? 'select' : 'back');
          draw();
        }),
      );
      box.querySelectorAll('.gs').forEach((el) =>
        el.addEventListener('click', () => {
          const ok = unequip(this.state, (el as HTMLElement).dataset.g as GearSlot);
          audio.se(ok ? 'tap' : 'back');
          draw();
        }),
      );
    };
    draw();
    bag.style.display = 'flex';
  }

  private finish(): void {
    this.done = true;
    const s = this.state;
    const got = adventureReward(s);
    // ごほうび(倒した ぶんと クリア)【仮】
    if (got.exp || got.coins) new LifeRecord(loadLife()).grant({ runId: `adv:${Date.now()}`, source: 'adventure', coins: got.coins, exp: got.exp });
    const res = this.root!.querySelector('.result') as HTMLElement;
    res.classList.toggle('lose', s.result === 'lose');
    (res.querySelector('h1') as HTMLElement).textContent = s.result === 'clear' ? 'CLEAR' : 'LOSE';
    (res.querySelector('.prize') as HTMLElement).textContent = `けいけんち +${got.exp}　コイン +${got.coins}`;
    window.setTimeout(() => (res.style.display = 'flex'), 700);
    audio.se(s.result === 'clear' ? 'cheer' : 'back');
  }

  private leave(): void {
    audio.se('back');
    // 確認用ページ(MONZ RUMBLE から 入った)は MONZ RUMBLE へ もどる
    this.scene.start(['Battle3D', 'RumbleMode'].includes((window as { __MONZ_START?: string }).__MONZ_START ?? '') ? 'RumbleMode' : 'Home');
  }

  private cleanup(): void {
    window.removeEventListener('resize', this.onResize);
    window.clearTimeout(this.msgT);
    this.view?.dispose();
    this.view = undefined;
    this.root?.remove();
    this.root = undefined;
  }
}
