import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { RANKS, equipStartWeapon, rpgJabReach, ALLEY_TOP, isBoss, MOB_KINDS, newAdventure, stepAdventure, playerRoom, adventureReward, aimPreview, unequip, useBagItem, discardBagItem, useQuick, setQuick, quickOf, useKindOf, USE_ITEMS, bagCap, SELF_KINDS, SLOT_NAMES, type AdvItem, type AdvState, type AdvTech, type GearSlot, type UseKind } from '../core/adventure/sim';
import { getTech, techDesc } from '../core/battle3d/techTable';
import { RANK_HEX } from '../render/dungeonView';
import { assetUrl } from '../assetUrl';
import type { Proficiency } from '../core/battle3d/config';
import type { AnimeEntrant } from '../core/battle3d/anime';
import { formAt, learnAt, slotsAt } from '../core/battle3d/techLearn';
import { addStats, autoGrowthAt, speciesStats, STAT_LABELS, type StatBlock, type StatKey } from '../core/stats';
import type { SpeciesId } from '../core/species';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { modelFor } from '../core/roster';
import { isChargeTech, GEAR_ICON, ROLE_OF, RPG_MODEL, RPG_SPECIES, START_WEAPON, WEAPON_LIST, GACHA_WEAPONS, rpgLearned, rpgTechDesc } from '../core/rpg/roles';

/** 擬人化RPG の 試作(確認用ページ --rpg)。冒険の 画面を 借りて 試す */
// 2026-11-28 企画者「冒険は、モンズは 全部 擬人化して やる」→ 擬人化の モデルが ある 種族は 冒険でも 擬人化(確認用ページは いつも)
const rpgTest = () => !!(window as { __MONZ_RPG?: boolean }).__MONZ_RPG || RPG_SPECIES.includes(partnerEntrant().entrant.species);
/** 試作の 見た目: false = 3D(B)・true = 3D から 写した ドット(C) */
const rpgPixel = { on: false };
/** 試作で 動かす 擬人化の 種族 */
const rpgPick = { i: -1 };
const rpgSp = (): string => {
  // はじめは 自分の MONZ の 種族(擬人化の モデルが あれば)
  if (rpgPick.i < 0) rpgPick.i = Math.max(0, RPG_SPECIES.indexOf(partnerEntrant().entrant.species));
  return RPG_SPECIES[rpgPick.i] ?? 'bunk';
};

/** 技の 名前 → 冒険で 使う 技 */
function advTech(id: string | undefined): AdvTech | null {
  if (!id) return null;
  const t = getTech(id);
  return { id, kind: t.kind, power: t.power ?? 0, cooldown: Math.max(2, t.cooldown), element: t.element, effect: t.effect ?? 'なし', strength: t.strength };
}
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
.adv .cancel{position:absolute;right:calc(env(safe-area-inset-right) + 34px);bottom:calc(env(safe-area-inset-bottom) + 214px);width:66px;height:66px;border-radius:50%;border:3px solid #fff;background:#16101ccc;color:#fff;font:900 12px ${UI_FONT};display:none;align-items:center;justify-content:center;pointer-events:none;z-index:6}
.adv .cancel.over{background:#e0303a;transform:scale(1.12)}
.adv .tb:active,.adv .ib:active{transform:translateY(2px);box-shadow:0 1px 0 #16101c}
.adv .bagBtn{background:#16101ccc;border:2px solid #ffffff60;color:#fff;font:900 14px ${UI_FONT};padding:7px 12px;border-radius:12px}
.adv .bag{position:absolute;inset:0;z-index:20;background:#0b0712e6;display:none;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 14px) calc(env(safe-area-inset-bottom) + 8px) calc(env(safe-area-inset-left) + 14px)}
.adv .bag .box{width:min(100%,720px);max-height:100%;overflow:auto;background:#1e1430;border:3px solid #ffd23a;border-radius:16px;padding:10px 14px;display:flex;flex-direction:column;gap:8px;box-sizing:border-box}
.adv .bag h3{margin:0;font-size:16px;color:#ffd23a;display:flex;justify-content:space-between;align-items:center}
.adv .bag .gear{display:flex;gap:8px;flex-shrink:0}
.adv .bag .gs{flex:1;border:2px dashed #ffffff60;border-radius:10px;padding:3px 6px;line-height:1.15;text-align:center;font-size:12px;font-weight:900;background:#ffffff10;color:#fff}
.adv .bag .gs.on{border-style:solid}
.adv .bag .grid{display:grid;grid-template-columns:repeat(10,1fr);gap:5px;flex-shrink:0;max-height:var(--bagH,none);overflow-y:auto}
.adv .bag .it{aspect-ratio:1;border-radius:9px;border:2px solid #ffffff40;background:#ffffff10;color:#fff;font:900 11px ${UI_FONT};display:flex;flex-direction:column;align-items:center;justify-content:center;padding:0;line-height:1.1}
.adv .bag .it b{font-size:15px}
.adv .bag .note{font-size:11px;color:#c8bcd8}
.adv .bag .techBtn{border:2px solid #ffd23a;border-radius:9px;background:#3a2a6a;color:#ffd23a;font:900 15px ${UI_FONT}}
.adv .bag .trashOk{font:900 13px ${UI_FONT};padding:3px 14px;border-radius:9px;border:2px solid #16101c;background:#ff4a5a;color:#fff}
.adv .bag .trashBtn{border:2px solid #ff8a94;border-radius:9px;background:#3a1a2a;color:#ff8a94;font:900 15px ${UI_FONT}}
.adv .bag .tslots{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}
.adv .bag .ts{border:2px dashed #ffffff60;border-radius:10px;padding:6px 4px;background:#ffffff10;color:#fff;font:900 12px ${UI_FONT};min-height:52px}
.adv .bag .ts.on{border-style:solid;border-color:#ffd23a;background:#ffd23a30}
.adv .bag .ts.lock{opacity:.35}
.adv .bag .tl{display:grid;grid-template-columns:repeat(3,1fr);gap:5px}
.adv .bag .tk{border:2px solid #ffffff40;border-radius:9px;padding:6px 4px;background:#ffffff10;color:#fff;font:900 12px ${UI_FONT};text-align:left}
.adv .bag .tk.used{opacity:.5}
.adv .bag .tk small{display:block;font-size:10px;font-weight:700;color:#c8bcd8;margin-top:3px;line-height:1.3}
.adv .bag .ts i,.adv .bag .tk i{font-style:normal;font-size:10px;padding:0 4px;border-radius:4px;margin-right:4px;color:#16101c}
.adv .bag .close{align-self:center;font:900 16px ${UI_FONT};padding:7px 26px;border-radius:12px;border:3px solid #16101c;background:#ffd23a;color:#16101c}
.adv .msg{position:absolute;left:0;right:0;top:30%;text-align:center;font:900 min(30px,7vh) ${UI_FONT};color:#ffe680;text-shadow:0 3px 0 #16101c,0 0 4px #16101c,0 0 8px #16101c;pointer-events:none;opacity:0;transition:opacity .3s}
.adv .result{position:absolute;inset:0;background:#0b0712d0;display:none;flex-direction:column;align-items:center;justify-content:center;gap:12px}
.adv .result h1{margin:0;font-size:min(64px,13vh);letter-spacing:.06em;color:#ffd23a;-webkit-text-stroke:3px #16101c;text-shadow:0 6px 0 #16101c}
.adv .result.lose h1{color:#9ab4ff}
.adv .result p{margin:0;font-size:17px;font-weight:900}
.adv .result .row{display:flex;gap:12px}
.adv .result button{font:900 19px ${UI_FONT};padding:9px 22px;border-radius:14px;border:3px solid #16101c;background:#ffd23a;color:#16101c;box-shadow:0 4px 0 #16101c}
.adv .rot{position:absolute;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:#0d0614f5}
.adv .rot div{border:4px solid #ffd23a;border-radius:18px;background:#16101c;color:#ffd23a;font-weight:900;font-size:26px;padding:22px 30px;text-align:center}
.adv .rot small{display:block;color:#fff;font-size:14px;margin-top:8px}
.adv .rot .rback{position:absolute;left:calc(env(safe-area-inset-left) + 16px);top:calc(env(safe-area-inset-top) + 24px);background:#16101c;border:2px solid #ffd23a;color:#fff;font-weight:900;font-size:18px;padding:12px 18px;border-radius:12px;min-height:48px}
@media (orientation:portrait){.adv .rot{display:flex}}
`;

/** 確認用ページかどうか(MONZ RUMBLE から 入った) */
const isPreview = () => ['Battle3D', 'RumbleMode', 'Adventure'].includes((window as { __MONZ_START?: string }).__MONZ_START ?? '');
/** 確認用: ためす レベルと 型 */
const advDev: { level: number; type: string; species: string | null } = { level: 1, type: 'power', species: null };
const DEV_SPECIES = ['bunk', 'mofu', 'zipp', 'puni', 'klak', 'riot', 'snek', 'grit', 'vybe', 'shellz', 'crownie'];
const DEV_LEVELS = [1, 10, 20, 25, 45, 70];
/**
 * 今の 階(2026-11-24 企画者「次の 階に 行ける ワープ」・1〜10階 路地裏)。
 * 【仮】クリアで 次の 階へ(HP は 満タンに もどる・持ち物と 装備は 持ちこす)。負けたら 同じ 階から。もどるで 1階から
 */
const advRun: { floor: number; carry: Pick<AdvState, 'bag' | 'gear' | 'quick'> | null } = { floor: 1, carry: null };
/** 回復の 物の しるし・色(ポーション・救急箱の 絵は まだ)【仮】 */
const USE_ICON: Record<UseKind, string> = { berry: '🍏', potion: '🧪', kit: '🩹' };
const USE_CSS: Record<UseKind, string> = { berry: '#5ad05a', potion: '#ff6ab0', kit: '#ff4a4a' };
const DEV_TYPES = ['power', 'tough', 'speed', 'tech'];

const START_PROFICIENCY: Proficiency = { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 };

export class AdventureScene extends Phaser.Scene {
  private root?: HTMLDivElement;
  private view?: DungeonView;
  private state!: AdvState;
  private stick = { x: 0, y: 0 };
  private attack = false;
  /** 押した(短く 押しても 1回は 出す) */
  private press = false;
  /** 当てた 瞬間の 止まる 時間(秒) */
  private hitStop = 0;
  /** 技ボタンを 押して いた 秒(ためる 技) */
  private techHold = 0;
  private holdStart = 0;
  /** 押した 技(0〜3) */
  private techPress: number | null = null;
  private bagOpen = false;
  /** 長押しで ねらっている 技と 向き */
  private aim: { slot: number; dir: number | null } | null = null;
  private techDir: number | null = null;
  private done = false;
  private level = 1;
  private techNames: string[] = [];
  /** 覚えている 技・使える 枠の 数・確認用の 仮の 技か(仮の ときは 保存しない) */
  private learned: string[] = [];
  private slotCount = 4;
  private devTechs = false;
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
    let me: AnimeEntrant = { ...partner.entrant, proficiency: { ...START_PROFICIENCY }, form: formAt(partner.level) };
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    // 技: お世話の ステータス(わざ)で セットした 4つ(名前は MONZ RUMBLE の まま。2026-11-07 企画者)
    const life = loadLife();
    const mon = life.monz.find((m) => m.uid === life.activeMonz) ?? life.monz[0];
    let equipped = mon.techs?.equipped ?? [];
    let growType: string | null = mon.growType ?? null;
    // 確認用ページだけ: レベルと 型を えらんで ためす(自由ポイントを 全部 その型に・技は 新しい 順に 4つ)
    if (isPreview() && (advDev.level > 1 || advDev.species)) {
      // 確認用: 種族も えらべる(2026-11-07 企画者「技と 他の キャラを 試したい」)
      if (advDev.species) me = { ...me, species: advDev.species, name: advDev.species.toUpperCase() };
      const sp = me.species as SpeciesId;
      const L = advDev.level;
      const stats = addStats(addStats(speciesStats(sp).base, autoGrowthAt(sp, 'dev', L)), { hp: 0, power: 0, tough: 0, speed: 0, tech: 0, [advDev.type]: L - 1 } as StatBlock);
      me = { ...me, stats, form: formAt(L) };
      this.level = L;
      growType = advDev.type;
      equipped = learnAt(sp, L, stats, [], advDev.type as StatKey).slice(-slotsAt(L));
      this.learned = learnAt(sp, L, stats, [], advDev.type as StatKey);
      this.devTechs = true;
    } else {
      this.learned = mon.techs?.learned ?? [...equipped];
      this.devTechs = false;
    }
    this.slotCount = Math.min(4, slotsAt(this.level));
    // 擬人化RPG の 試作: ロールの 専用技 ＋ しぼった BUNK の 技(2026-11-27 企画者 OK)。保存は しない(お世話の 技は 変えない)
    if (rpgTest()) {
      this.learned = rpgLearned(rpgSp(), this.level);
      equipped = this.learned.slice(-this.slotCount);
      this.devTechs = true;
    }
    const techs: (AdvTech | null)[] = [0, 1, 2, 3].map((i) => advTech(equipped[i]));
    this.techNames = techs.map((t) => (t ? getTech(t.id).name : ''));
    this.state = newAdventure(seed, me.stats, advRun.floor, techs, growType, me.species);
    // 持ち物の 枠(課金で 増やした ぶん。古い データは 20)
    this.state.bagMax = life.advBag;
    // 擬人化RPG の 試作: BUNK は 拳闘士。進化で 通常攻撃が 少し 長く なる(姿は 変わらない)
    // 擬人化は 武器で 打つ(MONZ の 電撃ダッシュ・ムチ などは 使わない)
    if (rpgTest()) this.state.jab = 'punch';
    if (rpgTest()) this.state.brawler = ROLE_OF[rpgSp()] === '拳闘士';
    if (rpgTest()) this.state.jabBase = this.state.jabReach = rpgJabReach(ROLE_OF[rpgSp()] ?? '拳闘士', formAt(this.level));
    if (advRun.carry) {
      this.state.bag = advRun.carry.bag;
      this.state.gear = advRun.carry.gear;
      this.state.quick = advRun.carry.quick;
    }
    // 擬人化RPG: ロールの 初めの 武器
    if (rpgTest()) equipStartWeapon(this.state, START_WEAPON[ROLE_OF[rpgSp()] ?? '拳闘士'], WEAPON_LIST[ROLE_OF[rpgSp()] ?? '拳闘士']);
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
      `<div class="top"><button class="back">◀ もどる</button><div class="me"><div class="nm">${me.name}　Lv.${this.level}　<b style="color:#ffd23a">${advRun.floor}F</b></div><div class="bar"><i></i></div><div class="num"></div></div><div class="goal"></div><button class="bagBtn">持ち物&amp;技</button></div>
       ${isPreview() ? `<div class="dev" style="position:absolute;z-index:5;left:calc(env(safe-area-inset-left) + 12px);top:calc(env(safe-area-inset-top) + 62px);display:flex;gap:6px"><button class="back devLv">確認 Lv.${advDev.level}</button><button class="back devTy">型：${STAT_LABELS[advDev.type as StatKey]}</button><button class="back devFl">確認 ${advRun.floor}F</button><button class="back devSp">${rpgTest() ? `${rpgSp().toUpperCase()}（${ROLE_OF[rpgSp()]}）` : (advDev.species ?? '自分').toUpperCase()}</button>${rpgTest() ? `<button class="back devPx">見た目：${rpgPixel.on ? 'ドット' : '3D'}</button><button class="back devWr">ブキ ${this.state.gear.weapon?.rank ?? '-'}</button><button class="back devWn">${this.state.gear.weapon?.name ?? '-'}</button>` : ''}</div>` : ''}
       <div class="stickZone"><div class="stickBase"><div class="stickKnob"></div></div></div>
       <div class="stickHint">ここを<br>さわって<br>うごかす</div>
       <button class="atk">こうげき</button>
       ${[0, 1, 2, 3].map((i) => `<button class="tb" data-i="${i}"><span class="cd"></span><span class="lb">${'ABCD'[i]}</span></button>`).join('')}
       <div class="cancel">キャンセル</div>
       <button class="ib" data-q="0"><span class="ic" style="position:absolute;left:6px;top:4px;width:34px;height:34px;display:block;pointer-events:none"></span><span class="lb" style="position:absolute;right:2px;bottom:0;text-shadow:0 0 3px #000,0 0 3px #000"><b>0</b></span></button>
       <button class="ib" data-q="1"><span class="ic" style="position:absolute;left:6px;top:4px;width:34px;height:34px;display:block;pointer-events:none"></span><span class="lb" style="position:absolute;right:2px;bottom:0;text-shadow:0 0 3px #000,0 0 3px #000"><b>0</b></span></button>
       <div class="bag"><div class="box"></div></div>
       <div class="msg"></div>
       <div class="result"><h1></h1><p class="prize"></p><div class="row"><button class="again">もう一度</button><button class="leave">もどる</button></div></div>
       <div class="rot"><button class="rback">◀ もどる</button><div>スマホを 横にしてね<small>冒険は 横画面で あそびます</small></div></div>`,
    );
    document.body.appendChild(root);
    this.root = root;
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    $('.back').addEventListener('click', () => this.leave());
    // 2026-11-09 企画者「横から 縦に すると 戻る 押せない」→「横にしてね」の 上にも もどる
    $('.rback').addEventListener('click', () => this.leave());
    $('.leave').addEventListener('click', () => this.leave());
    $('.again').addEventListener('click', () => {
      audio.se('tap');
      // クリア → 次の 階へ(持ち物と 装備を 持ちこす)。負け → 同じ 階を もう一度
      if (this.state.result === 'clear' && advRun.floor < ALLEY_TOP) {
        advRun.floor++;
        advRun.carry = { bag: this.state.bag, gear: this.state.gear, quick: this.state.quick };
      } else if (this.state.result === 'clear') {
        advRun.floor = 1;
        advRun.carry = null;
      }
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
      if (t && SELF_KINDS.has(t.kind)) b.classList.add('sup');
      b.title = this.techNames[i];
      // 2026-11-07 企画者「技は 長押し しながら 打つ 方向 決めたい。離すと 発動」:
      // ボタンを おさえて 指を ずらすと その向きを ねらう(床に 矢印)。はなすと 発動。ずらさずに はなすと いちばん 近い 敵へ
      let pid: number | null = null;
      let holdT = 0;
      let ox = 0;
      let oy = 0;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        audio.unlock();
        if (!t) return;
        pid = e.pointerId;
        b.setPointerCapture(e.pointerId);
        ox = e.clientX;
        oy = e.clientY;
        this.aim = { slot: i, dir: null };
        holdT = performance.now();
        this.holdStart = holdT;
      });
      // ドラッグ 中だけ こうげきの 上に キャンセル(そこで はなすと うたない。2026-11-07 企画者)
      const cancel = $('.cancel');
      const overCancel = (e: PointerEvent) => {
        const r = cancel.getBoundingClientRect();
        return cancel.style.display === 'flex' && Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)) < r.width * 0.7;
      };
      b.addEventListener('pointermove', (e) => {
        if (e.pointerId !== pid || !this.aim) return;
        const dx = e.clientX - ox;
        const dy = e.clientY - oy;
        this.aim.dir = Math.hypot(dx, dy) > 14 ? Math.atan2(dy, dx) : null;
        cancel.style.display = this.aim.dir !== null ? 'flex' : 'none';
        cancel.classList.toggle('over', overCancel(e));
      });
      const up = (e: PointerEvent, fire: boolean) => {
        if (e.pointerId !== pid) return;
        pid = null;
        const canceled = overCancel(e);
        cancel.style.display = 'none';
        cancel.classList.remove('over');
        if (canceled) audio.se('back');
        if (fire && this.aim && !canceled) {
          this.techPress = i;
          this.techDir = this.aim.dir;
          this.techHold = (performance.now() - holdT) / 1000;
        }
        this.aim = null;
      };
      b.addEventListener('pointerup', (e) => up(e, true));
      b.addEventListener('pointercancel', (e) => up(e, false));
    });
    // すぐ 使う 枠 2つ(2026-11-28 企画者「消費アイテムは 2つ 使える ように」)
    this.root!.querySelectorAll('.ib').forEach((el) => {
      const ib = el as HTMLElement;
      const k = Number(ib.dataset.q);
      ib.style.right = `calc(env(safe-area-inset-right) + ${222 + (1 - k) * 58}px)`;
      ib.style.bottom = 'calc(env(safe-area-inset-bottom) + 12px)';
      ib.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        audio.unlock();
        if (useQuick(this.state, k)) audio.se('mcHeal');
        else audio.se('back');
      });
    });
    $('.bagBtn').addEventListener('click', () => this.openBag());
    if (isPreview()) {
      $('.devLv').addEventListener('click', () => {
        advDev.level = DEV_LEVELS[(DEV_LEVELS.indexOf(advDev.level) + 1) % DEV_LEVELS.length];
        this.scene.restart();
      });
      $('.devFl').addEventListener('click', () => {
        advRun.floor = (advRun.floor % ALLEY_TOP) + 1;
        advRun.carry = null;
        this.scene.restart();
      });
      $('.devSp').addEventListener('click', () => {
        if (rpgTest()) {
          // 擬人化RPG の 試作: 擬人化の モデルが ある 種族だけ
          rpgPick.i = (rpgPick.i + 1) % RPG_SPECIES.length;
          this.scene.restart();
          return;
        }
        const i = advDev.species ? DEV_SPECIES.indexOf(advDev.species) : -1;
        advDev.species = i + 1 < DEV_SPECIES.length ? DEV_SPECIES[i + 1] : null;
        this.scene.restart();
      });
      if (rpgTest())
        // 確認用: 武器の ランクを D→C→B→A→S と 切りかえ(範囲の ちがいを ためす)
        $('.devWr').addEventListener('click', () => {
          const w = this.state.gear.weapon;
          if (!w) return;
          w.rank = RANKS[(RANKS.indexOf(w.rank) + 1) % RANKS.length];
          equipStartWeapon(this.state, w.name ?? '');
          $('.devWr').textContent = `ブキ ${w.rank}`;
        });
      if (rpgTest())
        // 確認用: 武器の 種類を ロールの 中で 切りかえ(打ち方の ちがいを ためす)
        $('.devWn').addEventListener('click', () => {
          const w = this.state.gear.weapon;
          // ガチャの 武器も ためせる(確認用だけ。落ちは しない)
          const list = [...(this.state.weapons ?? []), ...GACHA_WEAPONS[ROLE_OF[rpgSp()] ?? '拳闘士']];
          if (!w || !list.length) return;
          w.name = list[(list.indexOf(w.name ?? '') + 1) % list.length];
          equipStartWeapon(this.state, w.name);
          $('.devWn').textContent = w.name;
        });
      if (rpgTest())
        $('.devPx').addEventListener('click', () => {
          rpgPixel.on = !rpgPixel.on;
          $('.devPx').textContent = `見た目：${rpgPixel.on ? 'ドット' : '3D'}`;
        });
      $('.devTy').addEventListener('click', () => {
        advDev.type = DEV_TYPES[(DEV_TYPES.indexOf(advDev.type) + 1) % DEV_TYPES.length];
        if (advDev.level === 1) advDev.level = 25;
        this.scene.restart();
      });
    }
    // 擬人化RPG の 試作(2026-11-26。確認用ページ --rpg だけ): 企画者の BUNK 擬人化 モデルで 路地裏を 動く
    const pick = rpgTest() ? { file: RPG_MODEL[rpgSp()], form: 1, height: 1.75, bones: true, amp: 1, rig: 'auto' as const } : modelFor(me.species, this.level);
    this.view = new DungeonView(canvas, this.state, me, pick, rpgTest() ? { ...rpgPixel, get on() { return rpgPixel.on; }, role: ROLE_OF[rpgSp()] } : null);
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
    // 当てた 瞬間 少しだけ 止める(重い 手ごたえ。2026-11-26 企画者「攻撃に もう少し 重厚感」)
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      this.view.render(s, [], 0);
      return;
    }
    stepAdventure(s, { mx: this.stick.x, mz: this.stick.y, attack: this.attack || this.press, tech: this.techPress, techDir: this.techDir, techHold: this.techHold }, dt);
    // ためる 技を 押して いる 間: 体の まわりに 光が 集まる
    const holdSlot = this.aim?.slot;
    const ht = holdSlot != null && s.techs[holdSlot] && isChargeTech(getTech(s.techs[holdSlot]!.id).name) && (s.techCd[holdSlot] ?? 0) <= s.t ? Math.min(1, (performance.now() - this.holdStart) / 1200) : -1;
    this.view.setCharge(ht);
    if (s.events.some((e) => e.kind === 'attack' && e.id === 0)) this.press = false;
    if (s.player.act === 'tech' || this.techPress === null || (s.techCd[this.techPress] ?? 0) > s.t) {
      this.techPress = null;
      this.techDir = null;
    }
    const shape = this.aim ? aimPreview(s, this.aim.slot, this.aim.dir) : null;
    this.view.setAim(shape && this.aim ? { ...shape, dir: this.aim.dir ?? s.player.face, auto: this.aim.dir === null } : null);
    // 拳闘士の 技は 1発 1発 重く(長めに 止める)
    for (const e of s.events) if (e.kind === 'hit' && e.target !== 0) this.hitStop = Math.max(this.hitStop, s.brawler && s.player.act === 'tech' ? 0.12 : e.crit || s.chain === 3 ? 0.09 : 0.05);
    for (const e of s.events) {
      if (e.kind === 'attack' && e.id === 0) audio.se('swing');
      else if (e.kind === 'hit') audio.se(e.target === 0 ? 'punch' : 'b3dPunchHit', e.crit ? { pitch: 0.8 } : undefined);
      else if (e.kind === 'die') audio.se('burst');
      else if (e.kind === 'crate') audio.se(e.broken ? 'punchHeavy' : 'b3dPunchHit');
      else if (e.kind === 'open') this.message('ボスを たおした！ DOOR OPENED!');
      else if (e.kind === 'house') {
        if (e.state === 'wait') this.message('…なにか いやな 予感が する');
        else if (e.state === 'locked') {
          audio.se('punchHeavy');
          this.message('モンスターハウスだ！ 出られない！');
        } else {
          audio.se('cheer');
          this.message('DOOR OPENED!');
        }
      }
      else if (e.kind === 'door') {
        audio.se('cheer');
        this.message('DOOR OPENED!');
      } else if (e.kind === 'press') audio.se('select');
      else if (e.kind === 'key') {
        audio.se('select');
        this.message('カギを ひろった！ とびらへ');
      } else if (e.kind === 'boxReset') this.message('箱が もとの 場所に もどった');
      else if (e.kind === 'tech') {
        audio.se(e.fx === 'heal' || e.fx === 'barrier' || e.fx === 'buff' ? 'mcHeal' : e.fx === 'shot' ? 'whoosh' : 'punchHeavy');
      } else if (e.kind === 'pick') audio.se('select');
      else if (e.kind === 'full') this.message(`もちものが いっぱい（${bagCap(this.state)}こ まで）`);
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
    const q = quickOf(s);
    root.querySelectorAll('.ib').forEach((el) => {
      const ib = el as HTMLButtonElement;
      const kind = q[Number(ib.dataset.q)];
      const n = kind ? s.bag.filter((b) => useKindOf(b) === kind).length : 0;
      (ib.querySelector('b') as HTMLElement).textContent = kind ? String(n) : '';
      const ic = ib.querySelector('.ic') as HTMLElement;
      const key = kind ?? '';
      if (ic.dataset.k !== key) {
        ic.dataset.k = key;
        ic.innerHTML = kind ? this.itemImg({ kind: 'herb', use: kind }, 34) : '<span style="font-size:11px;line-height:34px;display:block;text-align:center;opacity:.7">なし</span>';
      }
      ib.disabled = n === 0;
    });
    (root.querySelector('.bagBtn') as HTMLElement).textContent = `持ち物&技 ${s.bag.length}/${bagCap(s)}`;
    // 今の 部屋の めあて(2026-11-24 しかけ)
    const ri = playerRoom(s);
    const z = ri >= 0 ? s.puzzles[ri] : undefined;
    const left = s.mobs.filter((m, k) => m.act !== 'dead' && s.mobRoom[k] === ri).length;
    const boss = s.mobs.find((m) => isBoss(m) && m.act !== 'dead');
    const H = s.house;
    const houseLeft = s.mobs.filter((m, k) => m.act !== 'dead' && s.mobRoom[k] === -50).length;
    const goal = H?.state === 'locked'
      ? `<b style="color:#ff5a6a">モンスターハウス</b>　のこり <b>${houseLeft}</b> 体・<b>${Math.max(0, Math.ceil(60 - H.t))}</b> 秒`
      : boss && s.mobRoom[s.mobs.indexOf(boss)] === ri
        ? `<b>${MOB_KINDS[boss.mobKind!].name}</b>　HP <b>${Math.ceil((boss.hp / boss.maxHp) * 100)}%</b>`
        : ''; // 2026-11-27 企画者「わき道？とか 敵を 倒そう とか ガイド いらない」→ めあての 文は 出さない(ボスの HP・モンスターハウスの のこり だけ)
    void z;
    void left;
    const goalEl = root.querySelector('.goal') as HTMLElement;
    goalEl.innerHTML = goal + (s.keys > 0 ? '　🔑' : '');
    goalEl.style.visibility = goalEl.innerHTML ? 'visible' : 'hidden';
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

  /** 持ち物の 絵(2026-11-26 企画者の 絵) */
  private itemImg(it: AdvItem | GearSlot, px = 34): string {
    // ポーション・救急箱は 絵が まだ ない(企画者の 絵 待ち)→ しるし
    const uk = typeof it === 'string' ? null : useKindOf(it);
    if (uk && uk !== 'berry') return `<span style="display:block;width:${px}px;height:${px}px;font-size:${Math.round(px * 0.78)}px;line-height:${px}px;text-align:center;pointer-events:none">${USE_ICON[uk]}</span>`;
    const n = typeof it === 'string' ? it : it.kind === 'herb' ? 'herb' : it.slot;
    // 名前の ある 装備は その 絵(2026-11-28 企画者の 絵)
    const named = typeof it === 'string' ? (it === 'weapon' ? this.state.gear.weapon?.name : undefined) : it.kind === 'gear' ? it.name : undefined;
    if (named && GEAR_ICON[named]) return `<img src="${assetUrl(GEAR_ICON[named])}" style="width:${px}px;height:${px}px;object-fit:contain;display:block;pointer-events:none" alt="">`;
    // 武器の 絵は まだ ない(企画者の 絵 待ち)→ 剣の しるし
    if (n === 'weapon') return `<span style="display:block;width:${px}px;height:${px}px;font-size:${Math.round(px * 0.8)}px;line-height:${px}px;text-align:center;pointer-events:none">⚔️</span>`;
    return `<img src="${assetUrl(`assets/adventure/item_${n}.webp`)}" style="width:${px}px;height:${px}px;object-fit:contain;display:block;pointer-events:none" alt="">`;
  }

  /** 持ち物の 名前(2文字くらい)と 色 */
  private itemLabel(it: AdvItem): { top: string; sub: string; color: string } {
    if (it.kind === 'herb') return { top: '実', sub: '回復', color: USE_CSS[it.use ?? 'berry'] };
    return { top: it.rank, sub: SLOT_NAMES[it.slot], color: `#${RANK_HEX[it.rank].toString(16).padStart(6, '0')}` };
  }

  /** 持ち物と 装備(企画者「今 持ってる アイテム一覧と 装備を 変更できる アイテムボタン」)。開いている 間は 止まる */
  private openBag(): void {
    if (this.done) return;
    audio.se('tap');
    this.bagOpen = true;
    const bag = this.root!.querySelector('.bag') as HTMLElement;
    const box = bag.querySelector('.box') as HTMLElement;
    // 2026-11-26 企画者「持ち物の とこ、技 入れ替えられる ように。持ち物と 別に なる ように 技って ボタン」
    let mode: 'items' | 'techs' = 'items';
    let sel: number | null = null;
    // すてる モード: さわった 物を えらんで(赤)、「すてる」で 消す
    let trash = false;
    let trashSel: number | null = null;
    // すぐ 使う 枠を えらんで いる 時(その あと 回復の 物を さわると セット)
    let qSel: number | null = null;
    const EL_CSS: Record<string, string> = { 炎: '#ff6a2a', 水: '#3aa8ff', 自然: '#6ad04a', 雷: '#ffd23a', 光: '#fff2a0', 闇: '#a05aff', 無: '#e0e0f0' };
    const close = () => {
      audio.se('back');
      bag.style.display = 'none';
      this.bagOpen = false;
    };
    const drawTechs = () => {
      const s = this.state;
      // 名前で そろえる(古い 呼び名の 技も 同じ 技として あつかう)
      const nm = (id: string) => {
        try {
          return getTech(id).name;
        } catch {
          return id;
        }
      };
      const eq = s.techs.map((t) => (t ? nm(t.id) : ''));
      const chip = (id: string) => {
        const t = getTech(id);
        return `<i style="background:${EL_CSS[t.element] ?? '#fff'}">${t.element}</i>`;
      };
      box.innerHTML = `<h3>わざ<span style="font-size:12px;color:#fff">${sel === null ? '入れかえる 枠を さわる' : `${'ABCD'[sel]} に 入れる わざを さわる`}</span></h3>
        <div class="tslots">${[0, 1, 2, 3]
          .map((i) => {
            const id = eq[i];
            const lock = i >= this.slotCount;
            const ds = id ? rpgTechDesc(getTech(id).name) ?? techDesc(getTech(id).name) : '';
            return `<button class="ts ${sel === i ? 'on' : ''} ${lock ? 'lock' : ''}" data-s="${i}">${'ABCD'[i]}<br>${lock ? 'まだ 使えない' : id ? `${chip(id)}${getTech(id).name}<small style="display:block;font-size:10px;font-weight:700;color:#c8bcd8;margin-top:3px;line-height:1.3">${ds}</small>` : '― なし'}</button>`;
          })
          .join('')}</div>
        <h3>おぼえている わざ<span style="font-size:12px;color:#fff">${this.learned.length}こ</span></h3>
        <div class="tl">${this.learned
          .map((id) => {
            const u = eq.indexOf(nm(id));
            const nmv = getTech(id).name;
            const ds = rpgTechDesc(nmv) ?? techDesc(nmv);
            return `<button class="tk ${u >= 0 ? 'used' : ''}" data-t="${id}">${chip(id)}${u >= 0 ? `${'ABCD'[u]}:` : ''}${nmv}<small>${ds}</small></button>`;
          })
          .join('')}</div>
        <div class="note">枠を さわってから わざを さわると 入れかわる（同じ わざを もう一度 さわると はずす）</div>
        <div style="display:flex;gap:8px"><button class="close techBack" style="flex:1">持ち物へ</button><button class="close techClose" style="flex:1">とじる</button></div>`;
      (box.querySelector('.techBack') as HTMLElement).addEventListener('click', () => {
        audio.se('tap');
        mode = 'items';
        sel = null;
        draw();
      });
      (box.querySelector('.techClose') as HTMLElement).addEventListener('click', close);
      box.querySelectorAll('.ts').forEach((el) =>
        el.addEventListener('click', () => {
          const i = Number((el as HTMLElement).dataset.s);
          if (i >= this.slotCount) {
            audio.se('back');
            return;
          }
          audio.se('tap');
          sel = sel === i ? null : i;
          drawTechs();
        }),
      );
      box.querySelectorAll('.tk').forEach((el) =>
        el.addEventListener('click', () => {
          if (sel === null) {
            audio.se('tap', { pitch: 0.8 });
            return;
          }
          const id = nm((el as HTMLElement).dataset.t!);
          const next = [...eq];
          if (next[sel] === id) next[sel] = '';
          else {
            const was = next.indexOf(id);
            if (was >= 0) next[was] = next[sel];
            next[sel] = id;
          }
          this.setTechs(next);
          audio.se('select');
          sel = null;
          drawTechs();
        }),
      );
    };
    const draw = () => {
      if (mode === 'techs') return drawTechs();
      const s = this.state;
      const slots: GearSlot[] = rpgTest() ? ['weapon', 'head', 'armor', 'charm'] : ['head', 'armor', 'charm'];
      const p = s.player;
      box.innerHTML = `<h3>そうび<span style="font-size:12px;color:#fff">こうげき ${Math.round(p.atk)}・まもり ${Math.round(p.tough)}・HP ${p.hp}/${p.maxHp}</span></h3>
        <div class="gear">${slots
          .map((k) => {
            const g = s.gear[k];
            return `<button class="gs ${g ? 'on' : ''}" data-g="${k}" style="${g ? `border-color:${this.itemLabel(g).color}` : ''}"><span style="display:flex;justify-content:center;opacity:${g ? 1 : 0.35}">${this.itemImg(k, 24)}</span>${SLOT_NAMES[k]}${g?.name ? `・<span style="font-size:11px">${g.name}</span>` : ''}<br>${g ? `<b style="color:${this.itemLabel(g).color};font-size:14px">${g.rank}ランク</b>` : 'なし'}</button>`;
          })
          .join('')}</div>
        <h3><span>すぐ使う <span style="font-size:12px;color:#fff">${qSel === null ? '枠を さわって 回復の 物を えらぶ' : `${qSel + 1} に セットする 物を さわる（もう一度 さわると からに）`}</span></span></h3>
        <div class="gear">${quickOf(s)
          .map((kind, k) => {
            const n = kind ? s.bag.filter((b) => useKindOf(b) === kind).length : 0;
            return `<button class="gs qs ${kind ? 'on' : ''}" data-q="${k}" style="${qSel === k ? 'border-color:#ffd23a;background:#ffd23a33' : kind ? `border-color:${USE_CSS[kind]}` : ''}"><span style="display:flex;justify-content:center;opacity:${kind ? 1 : 0.35}">${kind ? this.itemImg({ kind: 'herb', use: kind }, 24) : ''}</span>${k + 1}・${kind ? `${USE_ITEMS[kind].name} ×${n}` : 'なし'}</button>`;
          })
          .join('')}</div>
        <h3><span>もちもの <span style="font-size:12px;color:#fff">${s.bag.length} / ${bagCap(s)}</span></span><span style="display:flex;gap:6px"><button class="trashBtn" style="padding:4px 12px;${trash ? 'background:#ff4a5a;color:#fff' : ''}">${trash ? 'やめる' : 'すてる'}</button><button class="techBtn" style="padding:4px 18px">技</button></span></h3>
        <div class="grid" style="${bagCap(s) > 20 ? '--bagH:34vh' : ''}">${Array.from({ length: bagCap(s) }, (_, i) => {
          const it = s.bag[i];
          if (!it) return `<div class="it"></div>`;
          const l = this.itemLabel(it);
          const marked = trash && trashSel === i;
          return `<button class="it" data-i="${i}" style="border-color:${marked ? '#ff4a5a' : l.color};position:relative;${marked ? 'background:#ff4a5a55;box-shadow:0 0 0 2px #ff4a5a' : trash ? 'opacity:.75' : ''}">${this.itemImg(it)}${it.kind === 'gear' ? `<b style="color:${l.color};position:absolute;right:3px;bottom:1px;font-size:13px;text-shadow:0 0 3px #000,0 0 3px #000">${l.top}</b>` : ''}</button>`;
        }).join('')}</div>
        <div class="note">${trash ? (trashSel === null ? 'すてる 物を さわる' : `<span style="color:#ff8a94">えらんだ 物を すてる？</span> <button class="trashOk">すてる</button>`) : 'さわると 使う・装備する（装備を さわると はずす）。S が いちばん 強い'}</div>
        <button class="close">とじる</button>`;
      (box.querySelector('.close') as HTMLElement).addEventListener('click', close);
      (box.querySelector('.techBtn') as HTMLElement).addEventListener('click', () => {
        audio.se('tap');
        mode = 'techs';
        drawTechs();
      });
      (box.querySelector('.trashBtn') as HTMLElement).addEventListener('click', () => {
        audio.se('tap');
        trash = !trash;
        trashSel = null;
        draw();
      });
      box.querySelector('.trashOk')?.addEventListener('click', () => {
        const ok = trashSel !== null && discardBagItem(this.state, trashSel);
        audio.se(ok ? 'select' : 'back');
        trashSel = null;
        draw();
      });
      box.querySelectorAll('.qs').forEach((el) =>
        el.addEventListener('click', () => {
          const k = Number((el as HTMLElement).dataset.q);
          audio.se('tap');
          if (qSel === k) {
            // もう一度 さわると から
            setQuick(this.state, k, null);
            qSel = null;
          } else qSel = k;
          draw();
        }),
      );
      box.querySelectorAll('.it[data-i]').forEach((el) =>
        el.addEventListener('click', () => {
          if (qSel !== null) {
            const it = this.state.bag[Number((el as HTMLElement).dataset.i)];
            const kind = it ? useKindOf(it) : null;
            if (kind) {
              setQuick(this.state, qSel, kind);
              audio.se('select');
              qSel = null;
            } else audio.se('back');
            draw();
            return;
          }
          if (trash) {
            const i = Number((el as HTMLElement).dataset.i);
            trashSel = trashSel === i ? null : i;
            audio.se('tap');
            draw();
            return;
          }
          const ok = useBagItem(this.state, Number((el as HTMLElement).dataset.i));
          audio.se(ok ? 'select' : 'back');
          draw();
        }),
      );
      box.querySelectorAll('.gs:not(.qs)').forEach((el) =>
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

  /** 技を 入れかえる(冒険の 中の 4つ・ボタン。ふだんは 保存して MONZ RUMBLE と 同じ セットに する) */
  private setTechs(eq: string[]): void {
    const s = this.state;
    for (let i = 0; i < 4; i++) {
      const id = eq[i] || undefined;
      if ((s.techs[i] ? getTech(s.techs[i]!.id).name : undefined) === id) continue;
      s.techs[i] = advTech(id);
      s.techCd[i] = 0;
    }
    this.techNames = s.techs.map((t) => (t ? getTech(t.id).name : ''));
    this.root?.querySelectorAll<HTMLButtonElement>('.tb').forEach((b) => {
      const t = s.techs[Number(b.dataset.i)];
      b.disabled = !t;
      b.classList.toggle('sup', !!t && SELF_KINDS.has(t.kind));
      b.title = this.techNames[Number(b.dataset.i)];
    });
    if (!this.devTechs) new LifeRecord(loadLife()).setTechs(eq.filter(Boolean));
  }

  private finish(): void {
    this.done = true;
    const s = this.state;
    const got = adventureReward(s);
    // ごほうび(倒した ぶんと クリア)【仮】
    if (got.exp || got.coins) new LifeRecord(loadLife()).grant({ runId: `adv:${Date.now()}`, source: 'adventure', coins: got.coins, exp: got.exp });
    const res = this.root!.querySelector('.result') as HTMLElement;
    res.classList.toggle('lose', s.result === 'lose');
    (res.querySelector('h1') as HTMLElement).textContent = s.result === 'clear' ? (advRun.floor >= ALLEY_TOP ? '路地裏 CLEAR' : `${advRun.floor}F CLEAR`) : 'LOSE';
    (res.querySelector('.again') as HTMLElement).textContent = s.result === 'clear' ? (advRun.floor < ALLEY_TOP ? `${advRun.floor + 1}階へ ▶` : '1階から') : 'もう一度';
    (res.querySelector('.prize') as HTMLElement).textContent = `EXP +${got.exp}　コイン +${got.coins}`;
    window.setTimeout(() => (res.style.display = 'flex'), 700);
    audio.se(s.result === 'clear' ? 'cheer' : 'back');
  }

  private leave(): void {
    audio.se('back');
    advRun.floor = 1;
    advRun.carry = null;
    // 確認用ページ(MONZ RUMBLE から 入った)は MONZ RUMBLE へ もどる。冒険の 確認用ページは 1階から やりなおし
    const start = (window as { __MONZ_START?: string }).__MONZ_START;
    if (start === 'Adventure') this.scene.restart();
    else this.scene.start(isPreview() ? 'RumbleMode' : 'Home');
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
