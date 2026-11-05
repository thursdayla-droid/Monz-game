import * as Phaser from 'phaser';
import { getTech } from '../core/battle3d/techTable';
import { audio } from '../audio/engine';
import type { StatBlock } from '../core/stats';
import type { Proficiency } from '../core/battle3d/config';
import { ANIME, type TechId } from '../core/battle3d/animeConfig';
import { formAt, growTechs, SLOT_LEVELS, slotsAt } from '../core/battle3d/techLearn';
import { LifeRecord, loadLife } from '../core/lifeSave';
import { addStats, autoGrowthAt, speciesStats, type StatKey } from '../core/stats';
import { instinctFor } from '../core/autobattle/engine';
import { animeFinished, commandState, giveCommand, newAnimeBattle, stepAnime, type AnimeBattle, type AnimeEntrant, type AnimeEvent, type Command } from '../core/battle3d/anime';
import { AnimeField, ELEMENT_HEX } from '../render/animeField';
import { modelFor } from '../core/roster';
import { UI_FONT } from '../ui/paint';
import { assetUrl } from '../assetUrl';
import { partnerEntrant, rivalEntrant } from './AutoBattleScene';
import { BOSS_HP, CPU_LEVELS, profOf, STORY_STAGES } from '../core/rumble';
import { ARENAS, DEFAULT_MAP } from '../core/battle3d/arena';

/** どのモードで戦うか(2026-11-03 企画者: ストーリーモードとバトルモード)。なければ 自分と同じレベルの相手(確認用) */
export interface RumbleParams {
  mode?: 'free' | 'story';
  /** バトルモードの CPU の強さ(CPU_LEVELS の id) */
  cpu?: number;
  /** ストーリーのマス(1〜20) */
  stage?: number;
}

/** 【仮】AI習熟度。まだ育てる仕組み・保存がないので、自分も相手も Lv.2 */
const START_PROFICIENCY: Proficiency = { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 };
/** 確認用ページだけ: レベルと育て方を切りかえて、技枠と覚える技を見る(ゲーム本体には出さない) */
let devPick: { level: number; style: StatKey; species?: DevSpecies } | null = null;
type DevSpecies = 'bunk' | 'mofu' | 'zipp' | 'puni' | 'klak' | 'riot' | 'snek' | 'grit' | 'vybe' | 'shellz';
const isPreview = () => ['Battle3D', 'RumbleMode'].includes((window as { __MONZ_START?: string }).__MONZ_START ?? '');
const STYLE_LABEL: Record<string, string> = { power: 'パワー', tough: 'タフネス', speed: 'スピード', tech: 'テクニック' };
/**
 * オート / 手動(2026-11-02 企画者「オート手動は邪魔にならないところに」)。この端末に覚える。
 * オート = MONZ が自分で動いて技も出す(技のボタンで指示もできる) / 手動 = 左のスティックで動かし、技は自分で押す
 */
const MODE_KEY = 'monz:b3d:control';
const loadControl = (): 'auto' | 'manual' => {
  try {
    return localStorage.getItem(MODE_KEY) === 'auto' ? 'auto' : 'manual';
  } catch {
    return 'manual';
  }
};
const saveControl = (m: 'auto' | 'manual') => {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* 保存できなくても続ける */
  }
};
/** 確認用ページで、試合前にえらんだ技(保存データには入れない) */
let devTechs: string[] | null = null;
const real0 = (delta: number) => Math.min(delta / 1000, 0.1) * 0.05;
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

const CSS = `
.b3d{position:fixed;inset:0;z-index:50;background:#8ac8f5;font-family:${UI_FONT};color:#fff;user-select:none;-webkit-user-select:none;touch-action:none;overflow:hidden}
.b3d canvas{position:absolute;inset:0;width:100%;height:100%;display:block}
.b3d .top{position:absolute;left:0;right:0;top:0;padding:calc(env(safe-area-inset-top) + 8px) calc(env(safe-area-inset-right) + 10px) 0 calc(env(safe-area-inset-left) + 10px);display:flex;gap:10px;align-items:flex-start;pointer-events:none;z-index:3}
.b3d .back{pointer-events:auto;background:#16101ccc;border:0;color:#fff;font:900 15px ${UI_FONT};padding:8px 12px;border-radius:10px}
.b3d .card{flex:0 1 260px;min-width:0;background:#fffffff0;color:#16101c;border-radius:12px;padding:5px 10px 7px;border:3px solid #16101c;box-shadow:0 3px 0 #16101c}
.b3d .card.r{margin-left:auto}
.b3d .card{position:relative}
/* コンボの数: HPの下に 小さく(2発目から。じゃまに ならないように すぐ消える。10発から 少し大きく明るく 2026-11-04 企画者) */
.b3d .chit{position:absolute;z-index:4;top:calc(100% + 4px);right:6px;font:900 15px ${UI_FONT};color:#fff;-webkit-text-stroke:1px #16101c;text-shadow:0 2px 0 #16101c;opacity:0;white-space:nowrap;pointer-events:none;transform-origin:right center}
.b3d .card.r .chit{right:auto;left:6px;transform-origin:left center}
.b3d .chit b{font-size:22px;margin-right:3px}
.b3d .chit.big{color:#ffe14a}
.b3d .chit.big b{font-size:28px}
.b3d .name{font-weight:900;font-size:14px;display:flex;justify-content:space-between}
.b3d .name small{font-size:11px;color:#6a6070}
.b3d .bar{height:10px;border-radius:5px;background:#3a3040;overflow:hidden;margin-top:3px}
.b3d .bar>i{display:block;height:100%;background:#3ad070;transition:width .25s}
.b3d .gbar{height:4px;border-radius:2px;background:#2a2838;overflow:hidden;margin-top:2px}
.b3d .gbar>i{display:block;height:100%;background:#7ad0ff}
.b3d .num{font-size:11px;font-weight:900;text-align:right;margin-top:1px}
.b3d .timer{font-weight:900;font-size:20px;min-width:36px;text-align:center;text-shadow:0 2px 0 #16101c;padding-top:10px;margin:0 auto}
/* 技の名前は小さく、上のHPの下へ(試合が見えるように。企画者 2026-11-02) */
.b3d .cutin{position:absolute;top:calc(env(safe-area-inset-top) + 82px);height:62px;width:min(62%,460px);display:flex;align-items:center;gap:10px;pointer-events:none;z-index:2;opacity:0;background:linear-gradient(90deg,#3a0a6ae6,#a040ffcc 70%,#a040ff00);border-top:3px solid #ffd23a;border-bottom:3px solid #ffd23a;overflow:hidden}
.b3d .cutin.l{left:0;padding-left:env(safe-area-inset-left);clip-path:polygon(0 0,100% 0,88% 100%,0 100%)}
.b3d .cutin.r{right:0;flex-direction:row-reverse;padding-right:env(safe-area-inset-right);clip-path:polygon(12% 0,100% 0,100% 100%,0 100%);background:linear-gradient(270deg,#5a0a1ae6,#ff4a6acc 70%,#ff4a6a00)}
.b3d .cutin img{height:100%;width:auto;flex:none}
.b3d .cutin b{font:900 19px ${UI_FONT};color:#fff;-webkit-text-stroke:1px #16101c;text-shadow:0 3px 0 #16101c;white-space:nowrap}
.b3d .call{position:absolute;top:calc(env(safe-area-inset-top) + 74px);font-weight:900;font-size:15px;white-space:nowrap;padding:4px 12px;border-radius:9px;background:#16101cd0;border:2px solid #fff;opacity:0;pointer-events:none}
.b3d .call.l{left:calc(env(safe-area-inset-left) + 60px)}
.b3d .call.r{right:calc(env(safe-area-inset-right) + 12px)}
.b3d .pop{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-weight:900;font-size:30px;color:#fff;text-shadow:0 3px 0 #16101c;pointer-events:none;opacity:0;white-space:nowrap}
.b3d .big{position:absolute;left:0;right:0;top:36%;text-align:center;font-weight:900;font-size:68px;color:#ffd23a;text-shadow:0 5px 0 #16101c,0 0 24px #f40;pointer-events:none;opacity:0}
.b3d .cmds{position:absolute;left:0;right:0;bottom:0;padding:0 calc(env(safe-area-inset-right) + 10px) calc(env(safe-area-inset-bottom) + 8px) calc(env(safe-area-inset-left) + 10px);display:grid;grid-template-columns:repeat(2,minmax(84px,150px)) minmax(8px,1fr) repeat(2,minmax(84px,150px)) minmax(70px,96px);gap:8px;align-items:end}
.b3d .cmds button{position:relative;height:58px;border-radius:14px;border:3px solid #16101c;color:#16101c;font:900 min(15px,2.1vw) ${UI_FONT};white-space:nowrap;letter-spacing:-.05em;padding:0 4px;overflow:hidden;box-shadow:0 4px 0 #16101c;background:#fff}
.b3d .cmds button .el{display:block;font-size:10px;color:#fff;border-radius:6px;margin:0 auto 2px;width:3.2em}
.b3d .cmds button .cd{position:absolute;left:0;bottom:0;right:0;background:#16101c99;pointer-events:none}
.b3d .cmds button .lb{position:relative}
.b3d .cmds button:active{transform:translateY(3px);box-shadow:0 1px 0 #16101c}
.b3d .cmds button.queued{outline:3px solid #ffd23a;animation:b3p .35s infinite alternate}
.b3d .cmds button.cool{filter:grayscale(.8) brightness(.8)}
.b3d .cmds button.lock,.b3d .cmds button.empty{background:#3a3040;color:#bfb4c8;box-shadow:0 4px 0 #16101c}
/* 2026-11-02 企画者「左に移動スティック・右に技4つ・よけるボタン」 */
.b3d .stickZone{position:absolute;left:0;top:70px;bottom:0;width:45%;touch-action:none}
.b3d .stickBase{position:absolute;width:120px;height:120px;margin:-60px 0 0 -60px;border-radius:50%;background:#ffffff30;border:3px solid #ffffffa0;display:none;pointer-events:none}
.b3d .stickKnob{position:absolute;left:50%;top:50%;width:56px;height:56px;margin:-28px 0 0 -28px;border-radius:50%;background:#ffffffd0;border:3px solid #16101c}
.b3d .stickHint{position:absolute;left:calc(env(safe-area-inset-left) + 40px);bottom:calc(env(safe-area-inset-bottom) + 40px);width:110px;height:110px;border-radius:50%;border:3px dashed #ffffff80;color:#ffffffc0;font-weight:900;font-size:13px;display:flex;align-items:center;justify-content:center;text-align:center;pointer-events:none}
.b3d .pad{position:absolute;right:calc(env(safe-area-inset-right) + 10px);bottom:calc(env(safe-area-inset-bottom) + 10px);display:flex;flex-direction:column;align-items:flex-end;gap:8px}
/* よけるボタンは技のボタンの右上(企画者 2026-11-02) */
.b3d .grid{display:grid;grid-template-columns:repeat(2,minmax(96px,128px));gap:8px}
.b3d .pad button{position:relative;height:54px;border-radius:14px;border:3px solid #16101c;color:#16101c;font:900 min(14px,1.9vw) ${UI_FONT};white-space:nowrap;letter-spacing:-.05em;padding:0 4px;overflow:hidden;box-shadow:0 4px 0 #16101c;background:#fff}
.b3d .pad button .el{display:block;font-size:10px;color:#fff;border-radius:6px;margin:0 auto 2px;width:3.2em}
.b3d .pad button .cd{position:absolute;left:0;bottom:0;right:0;background:#16101c99;pointer-events:none}
.b3d .pad button .lb{position:relative}
.b3d .pad button:active{transform:translateY(3px);box-shadow:0 1px 0 #16101c}
.b3d .pad button.queued{outline:3px solid #ffd23a}
.b3d .pad button.cool{filter:grayscale(.8) brightness(.8)}
.b3d .pad button.lock,.b3d .pad button.empty{background:#3a3040;color:#bfb4c8}
.b3d .pad .acts{display:flex;gap:8px}
/* 2026-11-02 企画者「よけるとジャンプと攻撃 少し小さく」 */
.b3d .pad .dodge,.b3d .pad .jump,.b3d .pad .atk{width:54px;height:54px;border-radius:50%;background:#16101c;color:#fff;border-color:#fff;font-size:11px}
.b3d .pad .jump{background:#2a6ad8}
.b3d .pad .atk{background:#d8402a;width:60px;height:60px}
.b3d .setup{position:absolute;inset:0;background:#0d0614e8;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top) + 10px) calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 10px) calc(env(safe-area-inset-left) + 16px);gap:8px;z-index:6}
.b3d .setup h2{margin:0 0 0 70px;font-size:20px;color:#ffd23a}
.b3d .setup .row{display:flex;gap:12px;flex:1;min-height:0}
.b3d .setup .slots{margin-top:34px;display:grid;grid-template-columns:repeat(2,130px);grid-auto-rows:52px;gap:8px;align-content:start}
.b3d .setup .slot{border:3px dashed #ffffff80;border-radius:12px;display:flex;align-items:center;justify-content:center;font-weight:900;font-size:13px;text-align:center;padding:2px}
.b3d .setup .slot.on{border-style:solid;border-color:#ffd23a;background:#ffd23a22}
.b3d .setup .slot.sel{border-style:solid;border-color:#7dd8ff;background:#7dd8ff33;box-shadow:0 0 12px #7dd8ff}
.b3d .setup .slot.lock{color:#8a809a;border-color:#5a4a6a}
.b3d .setup .list{flex:1;overflow-y:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:6px;align-content:start}
.b3d .setup .t{background:#fff;color:#16101c;border:3px solid #16101c;border-radius:10px;padding:4px 8px;text-align:left;font:900 13px ${UI_FONT};position:relative}
.b3d .setup .t small{display:block;font-size:10px;color:#5a4a66;font-weight:700}
.b3d .setup .t.on{background:#ffd23a}
.b3d .setup .t i{position:absolute;right:6px;top:4px;font-style:normal;background:#16101c;color:#ffd23a;border-radius:50%;width:18px;height:18px;font-size:11px;display:flex;align-items:center;justify-content:center}
.b3d .setup .go{align-self:flex-end;font:900 18px ${UI_FONT};padding:8px 26px;border-radius:12px;border:3px solid #16101c;background:#ffd23a;color:#16101c}
.b3d .setup .go:disabled{opacity:.4}
.b3d .setup .note{font-size:11px;color:#c8bcd8}
/* 2026-11-02 企画者「手動オート切り替えの位置邪魔」→ 自分の体力の左下 */
.b3d .me{flex:0 1 260px;min-width:0;display:flex;flex-direction:column;align-items:flex-start;gap:5px}
.b3d .me .card{flex:none;width:100%;box-sizing:border-box}
.b3d .mode{pointer-events:auto;font:900 11px ${UI_FONT};padding:3px 10px;border-radius:9px;border:2px solid #16101c;background:#ffffffd8;color:#16101c;opacity:.85}
.b3d .mode.auto{background:#ffd23a}
.b3d .dev{z-index:7;position:absolute;left:calc(env(safe-area-inset-left) + 10px);top:calc(env(safe-area-inset-top) + 100px);font-size:12px;font-weight:900}
.b3d .dev button{font:900 12px ${UI_FONT};border:2px solid #16101c;border-radius:8px;background:#fff;color:#16101c;padding:3px 7px;margin:2px}
.b3d .dev button.on{background:#ffd23a}
.b3d .devPanel{display:none;background:#16101ce8;border-radius:10px;padding:6px 8px;margin-top:4px;max-width:360px}
.b3d .dev.open .devPanel{display:block}
.b3d .devPanel small{display:block;color:#ffd23a;margin-top:4px;font-size:11px}
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
    guard: HTMLElement[];
    num: HTMLElement[];
    chit: HTMLElement[];
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
  /** 自分の MONZ のレベル(技枠の数) */
  private level = 1;
  private started = false;
  /** 覚えている技(試合前のセッティング用) */
  private learned: string[] = [];
  /** 試合前のセッティングが終わったか */
  private setupDone = false;
  /** オート / 手動 */
  private control: 'auto' | 'manual' = 'manual';
  /** スティックの向き(画面の右・下が +。長さ0〜1) */
  private stick = { x: 0, y: 0 };
  private waitT = 0;
  private onResize = () => this.resize();

  private params: RumbleParams = {};
  /** 相手のレベル */
  private foeLevel = 1;

  constructor() {
    super('Battle3D');
  }

  init(data: RumbleParams): void {
    this.params = data && typeof data === 'object' ? { ...data } : {};
  }

  create(): void {
    this.ended = false;
    this.started = false;
    this.setupDone = false;
    this.stick = { x: 0, y: 0 };
    this.slowT = this.zoomT = this.hitStop = this.waitT = 0;
    const seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0;
    const partner = partnerEntrant();
    let level = partner.level;
    let me: AnimeEntrant = { ...partner.entrant, proficiency: { ...START_PROFICIENCY } };
    // 装備している技(Ver.44)。保存データの技(レベルアップで覚えた技)を使う
    const life = loadLife();
    const mon = life.monz.find((m) => m.uid === life.activeMonz) ?? life.monz[0];
    me.techs = mon.techs?.equipped ?? growTechs(me.species, level, me.stats, undefined, me.instinct).state.equipped;
    if (devPick && isPreview()) {
      // 確認用: 選んだレベル・育て方の BUNK(自由ポイントを全部その能力に)
      level = devPick.level;
      // 種族も えらべる(2026-11-03 MOFU の3Dモデルを見るため。MOFU の技は まだないので、パンチだけ)
      const dsp = devPick.species ?? 'bunk';
      const stats = addStats(addStats(speciesStats(dsp).base, autoGrowthAt(dsp, 'dev', level)), { hp: 0, power: 0, tough: 0, speed: 0, tech: 0, [devPick.style]: level - 1 } as StatBlock);
      const inst = instinctFor(dsp, stats);
      me = { ...me, species: dsp, name: dsp === 'bunk' ? me.name : dsp.toUpperCase(), stats, instinct: inst, techs: growTechs(dsp, level, stats, undefined, inst).state.equipped };
    }
    this.level = level;
    // 相手: ストーリーはマスの敵・バトルモードは選んだ強さ(レベルの差と戦いのうまさ)・それ以外は同じレベル
    const stage = this.params.mode === 'story' ? STORY_STAGES[(this.params.stage ?? 1) - 1] : undefined;
    const cpu = this.params.mode === 'free' ? CPU_LEVELS.find((c) => c.id === this.params.cpu) ?? CPU_LEVELS[1] : undefined;
    const foeLevel = stage ? stage.enemy.level : cpu ? Math.max(1, Math.min(100, level + cpu.level)) : level;
    this.foeLevel = foeLevel;
    const rival = rivalEntrant(foeLevel, seed);
    const foe: AnimeEntrant = {
      ...rival,
      name: stage ? stage.enemy.name : rival.name,
      stats: rival.stats as StatBlock,
      proficiency: stage ? profOf(stage.enemy.prof) : cpu ? profOf(cpu.prof) : { ...START_PROFICIENCY },
      techs: growTechs(rival.species, foeLevel, rival.stats as StatBlock, undefined, rival.instinct).state.equipped,
    };
    // 自分で動かす(左のスティック)・技は自分で押す(2026-11-02 企画者)
    if (devPick && isPreview() && devTechs) {
      const keep = devTechs.filter((n) => me.techs!.includes(n) || growTechs(me.species, level, me.stats, undefined, me.instinct).state.learned.includes(n));
      // 種族を切りかえて、前の技が1つも使えない時は、その種族の自動の技にする
      if (keep.length) me.techs = keep;
    }
    this.learned = devPick && isPreview() ? growTechs(me.species, level, me.stats, undefined, me.instinct).state.learned : mon.techs?.learned ?? me.techs ?? [];
    // 形態で通常攻撃が変わる(Lv.30 で4連・Lv.60 で5連)
    me.form = formAt(level);
    foe.form = formAt(foeLevel);
    // マップ: ストーリーはマスのマップ・ほかはランダム(今はロストテンプルだけ)
    // マップ: ストーリーは マスごと・バトルモードは 草原(2026-11-04 企画者「それを基本にしよう」)。マップが増えたら pickFreeMap で えらぶ
    const mapId = stage ? stage.map : DEFAULT_MAP;
    this.battle = newAnimeBattle(me, foe, seed, 'manual', ARENAS[mapId] ?? null);
    // ボス(中ボス・さいごのボス)は HP が多い【仮】
    if (stage?.enemy.boss) {
      const q = this.battle.f[1];
      q.maxHp = Math.round(q.maxHp * BOSS_HP);
      q.hp = q.maxHp;
    }
    this.control = loadControl();
    this.applyControl();
    this.buildDom();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());
    audio.playBgm('battle'); // 2026-11-04 企画者「これは戦闘BGMに」(前は DASH MONZ の曲)
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
    const card = (f: typeof p, cls: string) => `<div class="card ${cls}"><div class="name"><span>${esc(f.name)}</span><small>${f === p ? 'あなた' : 'あいて'}</small></div><div class="bar"><i style="width:100%"></i></div><div class="gbar"><i style="width:100%"></i></div><div class="num">${f.hp}/${f.maxHp}</div><div class="chit"></div></div>`;
    const techBtn = (id: TechId) => {
      const t = getTech(id);
      return `<button data-c="${id}"><span class="el" style="background:${hex(ELEMENT_HEX[t.element])};${t.element === '無' ? 'color:#16101c' : ''}">${t.element}</span><span class="lb">${t.name}</span><span class="cd" style="height:0"></span></button>`;
    };
    // 技のボタン枠は4つ(Ver.44)。まだ開いていない枠は鍵(【調整案】Lv.10・Lv.20)
    const slots = slotsAt(this.level);
    const slot = (i: number) => {
      const id = p.techs[i];
      if (id && i < slots) return techBtn(id);
      if (i < slots) return `<button class="empty" disabled><span class="lb">―</span></button>`;
      return `<button class="lock" disabled><span class="lb">🔒 Lv.${SLOT_LEVELS[i]}</span></button>`;
    };
    root.insertAdjacentHTML(
      'beforeend',
      `<div class="top"><button class="back">◀</button><div class="me">${card(p, '')}<button class="mode"></button></div><div class="timer">90</div>${card(q, 'r')}</div>
       <div class="cutin"><img alt=""><b></b></div>
       <div class="call"></div><div class="pop"></div><div class="big"></div>
       <div class="stickZone"><div class="stickBase"><div class="stickKnob"></div></div></div>
       <div class="stickHint">ここを<br>さわって<br>うごかす</div>
       <div class="pad"><div class="acts"><button class="jump" data-c="jump"><span class="lb">ジャンプ</span><span class="cd" style="height:0"></span></button><button class="dodge" data-c="dodge"><span class="lb">ガード</span><span class="cd" style="height:0"></span></button><button class="atk" data-c="punch"><span class="lb">こうげき</span><span class="cd" style="height:0"></span></button></div><div class="grid"></div></div>
       <div class="setup"></div>
       ${isPreview() ? `<div class="dev"><button class="devOpen">確認用</button><div class="devPanel"><div>レベル ${[1, 10, 20, 25, 30, 60, 70].map((l) => `<button data-lv="${l}" class="${devPick?.level === l ? 'on' : ''}">${l}</button>`).join('')}</div><div>育て方 ${Object.keys(STYLE_LABEL).map((k) => `<button data-st="${k}" class="${devPick?.style === k ? 'on' : ''}">${STYLE_LABEL[k]}</button>`).join('')}</div><div>種族 ${(['bunk', 'mofu', 'zipp', 'puni', 'klak', 'riot', 'snek', 'grit', 'vybe', 'shellz'] as const).map((k) => `<button data-sp="${k}" class="${(devPick?.species ?? 'bunk') === k ? 'on' : ''}">${k.toUpperCase()}</button>`).join('')}</div><small>今の技: ${p.techs.map(esc).join('・')}</small></div></div>` : ''}
       <div class="result"><h1></h1><button class="again">もう一度</button><button class="leave">もどる</button></div>
       <div class="turn"><div>スマホを 横にしてね<small>横にすると バトルが始まります</small></div></div>`,
    );
    document.body.appendChild(root);
    this.root = root;
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    const all = (s: string) => [...root.querySelectorAll(s)] as HTMLElement[];
    const btn = {} as Battle3DScene['ui']['btn'];
    this.bindButton($('.pad .dodge') as HTMLButtonElement, 'dodge', btn);
    this.bindButton($('.pad .jump') as HTMLButtonElement, 'jump', btn);
    this.bindButton($('.pad .atk') as HTMLButtonElement, 'punch', btn);
    // 右の技のボタン4つ(セットした技。開いていない枠は鍵)
    this.techButtons = () => {
      const grid = $('.pad .grid');
      grid.innerHTML = [0, 1, 2, 3].map(slot).join('');
      for (const el of [...grid.querySelectorAll('button[data-c]')] as HTMLButtonElement[]) this.bindButton(el, el.dataset.c as Command, btn);
    };
    this.bindStick($('.stickZone'), $('.stickBase'), $('.stickKnob'), $('.stickHint'));
    this.ui = {
      hp: all('.card .bar > i'),
      guard: all('.card .gbar > i'),
      num: all('.card .num'),
      chit: all('.card .chit'),
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
    this.openSetup($('.setup'));
    const modeBtn = $('.mode');
    const paint = () => {
      modeBtn.textContent = this.control === 'auto' ? 'オート' : '手動';
      modeBtn.classList.toggle('auto', this.control === 'auto');
      ($('.stickZone') as HTMLElement).style.display = this.control === 'auto' ? 'none' : '';
      if (this.control === 'auto') ($('.stickHint') as HTMLElement).style.display = 'none';
    };
    paint();
    modeBtn.addEventListener('click', () => {
      this.control = this.control === 'auto' ? 'manual' : 'auto';
      saveControl(this.control);
      this.applyControl();
      this.stick = { x: 0, y: 0 };
      paint();
      audio.se('tap');
      this.pop(this.control === 'auto' ? 'オート：自分で動いて技も出す' : '手動：スティックで動かす', '#ffffff');
    });
    // 確認用: レベル・育て方を切りかえて、やり直す
    if (isPreview()) {
      $('.devOpen').addEventListener('click', () => $('.dev').classList.toggle('open'));
      for (const el of all('.devPanel button')) {
        el.addEventListener('click', () => {
          devPick = { level: Number(el.dataset.lv ?? devPick?.level ?? 1), style: (el.dataset.st ?? devPick?.style ?? 'power') as StatKey, species: (el.dataset.sp ?? devPick?.species ?? 'bunk') as DevSpecies };
          audio.se('tap');
          this.scene.restart(this.params);
        });
      }
    }
    $('.leave').addEventListener('click', () => this.leave());
    $('.again').addEventListener('click', () => {
      audio.se('tap');
      this.scene.restart(this.params);
    });
    // レベルで形態が変わる(Lv.30 で BUNKER など)。相手も同じレベル
    this.field = new AnimeField(canvas, [modelFor(this.battle.f[0].species, this.level), modelFor(this.battle.f[1].species, this.foeLevel)], this.battle.arena);
    // 確認用ページだけ: 調べるために外から見られるようにする
    if (isPreview()) Object.assign(window, { __b3d: { field: this.field, battle: this.battle, scene: this } });
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  private techButtons: () => void = () => undefined;

  /** オート / 手動 を MONZ に反映 */
  private applyControl(): void {
    const f = this.battle.f[0];
    f.techMode = this.control === 'auto' ? 'auto' : 'manual';
    f.pad = this.control === 'auto' ? null : { x: 0, z: 0 };
  }

  private bindButton(el: HTMLButtonElement, c: Command, btn: Battle3DScene['ui']['btn']): void {
    btn[c] = { el, cd: el.querySelector('.cd') as HTMLElement };
    el.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      audio.unlock();
      // ZIPP の電撃ダッシュ: 押している間 ためる(はなすと走る)
      if (c === 'punch') this.battle.f[0].hold = true;
      // よける: スティックを倒していれば よける・倒していなければ ガード(押している間)(2026-11-04 企画者)
      if (c === 'dodge' && Math.hypot(this.stick.x, this.stick.y) < 0.25 && this.control === 'manual') {
        this.battle.f[0].guardHold = true;
        if (!giveCommand(this.battle, 0, 'guard')) audio.se('beep');
        return;
      }
      if (giveCommand(this.battle, 0, c)) audio.se('select');
      else audio.se('beep');
    });
    if (c === 'dodge') {
      const up = () => {
        this.battle.f[0].guardHold = false;
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    }
    if (c === 'punch') {
      const up = () => {
        this.battle.f[0].hold = false;
      };
      el.addEventListener('pointerup', up);
      el.addEventListener('pointercancel', up);
      el.addEventListener('pointerleave', up);
    }
  }

  /** 左の移動スティック: さわった所に出て、指の向きへ動く(はなすと止まる) */
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
      const k = Math.min(1, d / R);
      this.stick = d > 4 ? { x: (dx / R) * (k > 0.25 ? 1 : k * 4), y: (dy / R) * (k > 0.25 ? 1 : k * 4) } : { x: 0, y: 0 };
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

  /**
   * 試合前の技のセッティング(2026-11-02 企画者「試合前に現在覚えたものを自分で4個セッティング」)。
   * 覚えている技から、開いている枠の数(Lv.1 は2つ・Lv.10 で3つ・Lv.20 で4つ【調整案】)まで えらぶ。次の試合でも同じ(保存する)
   */
  private openSetup(el: HTMLElement): void {
    const me = this.battle.f[0];
    const slots = slotsAt(this.level);
    // 枠ごとに持つ(外しても ほかの技がつめて動かない。空いた枠は空のまま)
    const picked: (string | null)[] = [0, 1, 2, 3].slice(0, slots).map((i) => me.techs[i] ?? null);
    // 2026-11-02 企画者「外すと技の1番最初にもどるのをやめたい」「技を入れ替えられるように」→ 一覧の場所をおぼえておく・枠をえらんで入れかえ
    let sel = -1;
    let scroll = 0;
    const count = () => picked.filter(Boolean).length;
    const draw = () => {
      const old = el.querySelector('.list');
      if (old) scroll = old.scrollTop;
      const slotHtml = [0, 1, 2, 3]
        .map((i) => (i >= slots ? `<div class="slot lock">🔒 Lv.${SLOT_LEVELS[i]}</div>` : `<div class="slot ${picked[i] ? 'on' : ''} ${sel === i ? 'sel' : ''}" data-s="${i}">${picked[i] ? esc(picked[i]!) : `わざ ${i + 1}`}</div>`))
        .join('');
      const list = this.learned
        .map((n) => {
          const t = getTech(n);
          const k = picked.indexOf(n);
          const info = t.kind === 'barrier' ? '守り' : t.power ? `威力 ${t.power.toFixed(1)}` : t.kind === 'debuff' ? (t.effect === '防御ダウン' ? '防御ダウン' : t.effect === '遅くする' ? '遅くする' : t.effect === 'ねむり' ? 'ねむり' : '攻撃ダウン') : '遅くする';
          return `<button class="t ${k >= 0 ? 'on' : ''}" data-n="${esc(n)}">${esc(n)}${k >= 0 ? `<i>${k + 1}</i>` : ''}<small>${t.element}・${t.strength}・${info}・待ち ${t.cooldown.toFixed(1)}秒</small></button>`;
        })
        .join('');
      el.innerHTML = `<h2>わざを セットしよう（${count()}/${slots}）</h2>
        <div class="row"><div><div class="slots">${slotHtml}</div><div class="note">${sel >= 0 ? `わざ ${sel + 1} に入れる わざを さわってね<br>ほかの枠をさわると 入れかえ` : 'わざをさわると入る・もう一度で外れる<br>枠をさわると 入れかえできる'}</div></div><div class="list">${list}</div></div>
        <button class="go" ${count() || !this.learned.length ? '' : 'disabled'}>バトルスタート！</button>`;
      (el.querySelector('.list') as HTMLElement).scrollTop = scroll;
      for (const d of [...el.querySelectorAll('.slot[data-s]')] as HTMLElement[]) {
        d.addEventListener('click', () => {
          const i = Number(d.dataset.s);
          if (sel === i) sel = -1;
          else if (sel >= 0) {
            // 枠どうしを入れかえ
            [picked[sel], picked[i]] = [picked[i], picked[sel]];
            sel = -1;
          } else sel = i;
          audio.se('tap');
          draw();
        });
      }
      for (const b of [...el.querySelectorAll('.t')] as HTMLElement[]) {
        b.addEventListener('click', () => {
          const n = b.dataset.n!;
          const k = picked.indexOf(n);
          if (sel >= 0) {
            // えらんだ枠に入れる(ほかの枠にあった技なら、入れかえ)
            if (k >= 0) picked[k] = picked[sel];
            picked[sel] = n;
            sel = -1;
          } else if (k >= 0) picked[k] = null;
          else if (picked.includes(null)) picked[picked.indexOf(null)] = n;
          else {
            audio.se('beep');
            return;
          }
          audio.se('tap');
          draw();
        });
      }
      (el.querySelector('.go') as HTMLElement).addEventListener('click', () => {
        const set = picked.filter((n): n is string => !!n);
        if (!set.length && this.learned.length) return;
        audio.unlock();
        audio.se('select');
        me.techs = [...set];
        for (const n of set) me.cooldown[n] ??= 0;
        // 保存(確認用ページの「確認用」でえらんだ BUNK は保存しない)
        if (devPick && isPreview()) devTechs = [...set];
        else new LifeRecord(loadLife()).setTechs(set);
        this.techButtons();
        el.style.display = 'none';
        this.setupDone = true;
      });
    };
    draw();
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
    // モデルを読みこむまで待つ(最大5秒)
    if (!this.started && !this.field.ready && (this.waitT += delta) < 5000) {
      this.field.render(this.battle, 0);
      return;
    }
    // 試合前の技のセッティングが終わるまで、試合は始めない
    if (!this.setupDone) {
      this.field.render(this.battle, real0(delta));
      return;
    }
    if (!this.started) {
      this.started = true;
      // 確認用ページ: BUNK のモデルを読めなかったら、理由を出す
      if (isPreview() && this.field.modelError) {
        const note = document.createElement('div');
        note.style.cssText = 'position:absolute;left:8px;bottom:80px;max-width:60%;font-size:11px;color:#fff;background:#c0182acc;padding:4px 8px;border-radius:6px;pointer-events:none';
        note.textContent = `BUNKのモデル: ${this.field.modelError}`;
        this.root.appendChild(note);
      }
      this.big('BATTLE START!');
      audio.se('whistle');
    }
    let dt = Math.min(delta / 1000, 0.1);
    const real = dt;
    // 確認用ページだけ: 動きをゆっくりにして確かめる(window.__b3dSlow。ふだんは使わない)
    if (isPreview()) dt *= (window as unknown as { __b3dSlow?: number }).__b3dSlow ?? 1;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      dt = 0;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      dt *= 0.3;
    }
    const b = this.battle;
    // スティックの向き(画面)→ 床の上の向き(カメラから見て、上 = 奥)。オートのときは AI が動かす
    if (this.control === 'manual') {
      const f = this.field.camForward;
      const sx = this.stick.x;
      const sy = -this.stick.y;
      b.f[0].pad = { x: f.x * sy - f.z * sx, z: f.z * sy + f.x * sx };
    }
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
    if (isPreview()) this.drawFps(real);
    if (animeFinished(b) && !this.ended) this.showResult();
  }

  private fpsEl: HTMLDivElement | null = null;
  private fpsT = 0;
  private fpsN = 0;
  /** 確認用ページだけ: 重さの目安(1秒ごとの こま数・描く回数・三角の数)。目標は30以上 */
  private drawFps(real: number): void {
    this.fpsT += real;
    this.fpsN++;
    if (this.fpsT < 1) return;
    if (!this.fpsEl) {
      this.fpsEl = document.createElement('div');
      this.fpsEl.className = 'fps';
      this.fpsEl.style.cssText = 'position:absolute;left:50%;transform:translateX(-50%);top:46px;font:10px monospace;color:#fff;background:#0008;padding:1px 5px;border-radius:4px;pointer-events:none;z-index:5';
      this.root?.appendChild(this.fpsEl);
    }
    const info = this.field!.renderer.info.render;
    const fps = Math.round(this.fpsN / this.fpsT);
    this.fpsEl.textContent = `${fps}fps  描画${info.calls}  三角${Math.round(info.triangles / 1000)}k`;
    this.fpsEl.style.color = fps >= 30 ? '#fff' : '#ff8';
    (window as unknown as { __fps?: unknown }).__fps = { fps, calls: info.calls, tris: info.triangles };
    this.fpsT = 0;
    this.fpsN = 0;
  }

  private onEvent(e: AnimeEvent): void {
    const F = this.field!;
    const b = this.battle;
    switch (e.kind) {
      case 'call': {
        // 技の名前をさけぶ(アニメ風)。自分の指示 → 「BUNK、○○だ！」
        const t = getTech(e.tech);
        const f = b.f[e.side];
        // 通常攻撃(パンチ)は名前を出さない(何回も出すので)
        if (e.tech === 'punch') {
          audio.se('whoosh', { pitch: 1.4 });
          break;
        }
        // 企画者の音のファイルがある技は、ここで鳴らす(ギガントバースト)
        audio.techSe(e.tech, t.kind, 'call');
        // 大技: 横から顔と技の名前の帯が出る(止めない・じゃまにならない。2026-11-03 企画者)
        if (t.strength === '大技') this.cutin(e.side, t.name, formAt(this.level));
        const text = e.side === 0 ? (e.byCommand ? `${f.name}、${t.name}だ！` : `${f.name}の ${t.name}！`) : `あいての ${t.name}！`;
        this.call(text, hex(ELEMENT_HEX[t.element]), e.side === 0 ? '#3a9cff' : '#ff4a4a', e.side);
        break;
      }
      case 'fire': {
        const k = getTech(e.tech).kind;
        // 突進・回転の出だし: 足もとから砂けむり
        if (k === 'rush' || k === 'spin') {
          const fa = b.f[e.side];
          const fd = fa.act.k === 'tech' ? fa.act.dir : fa.face;
          if (fa.species === 'mofu') F.cotton(fa.x, 0.3, fa.z, 6, 0.8, 1.5);
          else F.launch(fa.x, fa.z, fd);
          F.shake(0.12);
        }
        // 2026-11-03 企画者の演出指示: 撃つ技は発射の光の輪
        if (k === 'shot' || k === 'barrage' || k === 'beam') F.muzzle(e.side, e.tech);
        // 落下: 跳ぶ時に足もとから砂けむり
        if (k === 'drop') {
          const fa = b.f[e.side];
          if (fa.species === 'mofu') F.cotton(fa.x, 0.3, fa.z, 8, 1, 2);
          else {
            F.dust(fa.x, fa.z, true);
            F.launch(fa.x, fa.z, fa.face + Math.PI);
          }
        }
        // 設置(グラビティプレス): 拳を地面にたたきつけた所にヒビと砂けむり・紫の輪
        if (k === 'field') {
          const fa = b.f[e.side];
          const gx = fa.x + Math.cos(fa.face) * 0.6;
          const gz = fa.z + Math.sin(fa.face) * 0.6;
          F.crack(gx, gz, 0.8);
          F.dust(gx, gz, true);
          F.groundRing(gx, gz, 0.8, 0xb060ff, 0.4, 2.5);
          F.shake(0.3);
        }
        // ほえる(ブレイクロア): 画面が ゆれる
        if (k === 'debuff') {
          F.shake(0.35);
          audio.se('koBlast', { pitch: 0.6 });
        }
        if (k === 'beam') F.shake(0.25);
        // 技ごとの音(2026-11-03 企画者「音は技ごとに」)。ない時は型の音
        if (!audio.techSe(e.tech, k, 'fire')) {
          if (k === 'beam') audio.se('mcMagic');
          else if (k === 'shot' || k === 'barrage') audio.se('mcSlash', { pitch: 1.2 });
          else if (k === 'rush' || k === 'spin' || k === 'combo') audio.se('whoosh', { pitch: 0.8 });
          else if (k === 'barrier') audio.se('mcMagic', { pitch: 1.3 });
          else audio.se('hop', { pitch: 0.8 });
        }
        // 大技は画面が大きくゆれる(名前は上の小さい札だけ。試合が見えるように 2026-11-02)
        if (getTech(e.tech).strength === '大技') F.shake(0.3);
        break;
      }
      case 'hit': {
        F.flash(e.target);
        const ht = getTech(e.tech);
        const atk = b.f[e.side];
        const hdir = Math.atan2(b.f[e.target].z - atk.z, b.f[e.target].x - atk.x);
        const hcol = ht.element === '無' ? 0xff8a2a : ELEMENT_HEX[ht.element];
        // 型ごとの命中の光(2026-11-02 企画者の技演出イメージ)
        const mofuHit = atk.species === 'mofu' && ht.kind !== 'jab';
        if (mofuHit) {
          // MOFU の技が当たった: 綿毛と花びらが はじける(岩・火花は出さない)
          F.cotton(e.x, e.y, e.z, e.big ? 12 : 7, 0.8, 3);
          F.petals(e.x, e.y, e.z, e.big ? 10 : 5, 3.5);
        } else if (ht.kind === 'rush') F.rushHit(e.x, e.y, e.z, hdir, hcol, ht.strength === '強' || ht.strength === '大技');
        else if (ht.kind === 'spin') F.spinHit(e.x, e.y, e.z, hcol);
        else if (ht.kind === 'combo') {
          // 連続攻撃: 1発ごとにちがう光、さいごは派手に(2026-11-03 企画者の演出指示)
          const n = atk.act.k === 'tech' ? atk.act.n : 1;
          F.comboHit(e.x, e.y, e.z, hdir, n, n >= ht.hits, ht.strength === '強' || ht.strength === '大技');
        } else if (ht.kind === 'beam') F.explode(e.x, e.y, e.z, e.tech, true);
        // ツルのムチ(MOFU の通常攻撃): 葉っぱがはじける
        if (ht.kind === 'jab' && atk.jab.moves && atk.act.k === 'tech') F.monHit(e.x, e.y, e.z, hdir, atk.jab.moves[atk.act.n - 1] ?? 'clawR', atk.act.n >= atk.jab.parts.length);
        const whip = ht.kind === 'jab' && !!atk.jab.whip;
        if (whip) F.whipHit(e.x, e.y, e.z, atk.act.k === 'tech' && atk.act.n >= atk.jab.parts.length);
        // 雷の技: 短い放電
        if (ht.element === '雷') F.zap(e.x, e.y, e.z);
        if (ht.element === '炎') F.flameBurst(e.x, e.y, e.z);
        // 当たった所から光の輪(技の色)。大きい当たりは画面が白く光る(2026-11-02 企画者「技しょぼい」)
        // 新しい5体の 通常攻撃は 自分の光だけ(ほかの光と まざって 分かりにくくならないように)
        const own = ht.kind === 'jab' && !!atk.jab.moves;
        if (!whip && !own) F.shockRing(e.x, e.y, e.z, ELEMENT_HEX[getTech(e.tech).element] === 0xe0e0f0 ? 0xffd080 : ELEMENT_HEX[getTech(e.tech).element], e.big ? 1.8 : 1.1);
        // 画面の光・ゆれ・止まる時間は、技の強さで決める(弱い技でも迫力は出すが、控えめ)
        const lvS = { 弱: 0, 中: 1, 強: 2, 大技: 3 }[ht.strength];
        if (lvS >= 2) this.screenFlash(0.35 + lvS * 0.1);
        F.shake(0.18 + lvS * 0.1);
        // 通常攻撃のパンチは企画者の音(2026-11-02)
        if (ht.kind === 'jab' && b.f[e.side].jab.whip) audio.techSe('', 'whip', 'hit');
        else if (ht.kind === 'jab') {
          // 打撃(BUNK のパンチ・頭突き・体当たり・甲羅・しっぽ)は 企画者の音(2026-11-05)。爪・かみつき・電気は 前の音
          const mv = atk.jab.moves && atk.act.k === 'tech' ? atk.jab.moves[atk.act.n - 1] : 'punch';
          audio.se(mv === 'clawR' || mv === 'clawL' || mv === 'bite' || mv === 'zap' ? 'b3dPunchHit' : 'b3dStrikeHit');
        }
        else if (!audio.techSe(e.tech, ht.kind, 'hit')) audio.se(e.big ? 'punchHeavy' : 'punch', { pitch: 0.9 + Math.random() * 0.2 });
        this.hitStop = Math.max(this.hitStop, [0.06, 0.08, 0.11, 0.15][lvS]);
        if (!e.big && !whip && !mofuHit && !own) F.explode(e.x, e.y, e.z, e.tech, false);
        this.pop(e.crit ? `クリティカル！ -${e.damage}` : `-${e.damage}`, e.target === 0 ? '#ff8a8a' : '#ffd23a');
        break;
      }
      case 'explode':
        F.explode(e.x, e.y, e.z, e.tech, e.big);
        audio.se('crackBig', { pitch: e.big ? 0.8 : 1.2 });
        break;
      case 'clash':
        F.clash(e.x, e.y, e.z);
        audio.se('koBlast', { pitch: 1.3 });
        this.pop('ぶつかった！', '#ffffff');
        break;
      case 'quake': {
        const qt = getTech(e.tech);
        if (b.f[e.side].species === 'mofu') {
          // MOFU: ふくらんで しぼむ風(岩・ヒビなし)
          F.cotton(e.x, 0.5, e.z, 14, 1.2, 3);
          F.petals(e.x, 0.6, e.z, 10, 3.5);
          F.groundRing(e.x, e.z, 0.8, 0xffffff, 0.35, 3);
          if (qt.strength === '大技') F.lightPillar(e.x, e.z, 0xffb0e0);
          if (!audio.techSe(e.tech, qt.kind, 'land')) audio.se('slam');
          break;
        }
        F.rocks(e.x, e.z);
        F.crack(e.x, e.z, qt.range * 0.35);
        F.groundRing(e.x, e.z, 0.8, 0xffffff, 0.3, 3);
        // 大技(テンチゴウサイ): 紫の光の柱・岩・画面の光(企画者の演出指示)
        if (qt.strength === '大技') {
          F.lightPillar(e.x, e.z, qt.element === '無' ? 0xa040ff : ELEMENT_HEX[qt.element]);
          F.rocks(e.x, e.z);
          this.screenFlash(0.5);
          F.shake(0.7);
        }
        if (!audio.techSe(e.tech, qt.kind, 'land')) audio.se('slam');
        break;
      }
      case 'mark':
        F.mark(e.x, e.z, e.r, e.until);
        break;
      case 'impact': {
        const it = getTech(e.tech);
        // 落下の強さで着地を変える(バウンドプレスは控えめ・バンクブレイカーは強い。企画者の演出指示)
        const lvl = it.kind === 'drop' && it.strength === '中' ? 0 : it.strength === '大技' ? 2 : 1;
        const soft = b.f[e.side].species === 'mofu';
        F.impact(e.x, e.z, e.r, it.strength === '大技', lvl, soft);
        if (it.element === '炎') F.flameBurst(e.x, 0.3, e.z);
        if (lvl > 0 && !soft) {
          F.crack(e.x, e.z, e.r);
          this.screenFlash(0.4);
        }
        if (it.kind !== 'pillar' && !audio.techSe(e.tech, it.kind, 'land')) audio.se('slam');
        break;
      }
      case 'blocked':
        F.explode(e.x, e.y, e.z, null, false);
        F.domeHit(e.x, e.y, e.z);
        audio.se('guard');
        this.pop('ふせいだ！', e.side === 0 ? '#7ad0ff' : '#ffb070');
        break;
      case 'wallHit':
        // 攻撃が柱・壁に当たった
        F.wallHit(e.x, e.y, e.z);
        break;
      case 'comboHit': {
        // ツルのムチ(MOFU の通常攻撃): 1発ごとに ツルがのびる
        const wf = b.f[e.side];
        // 新しい5体: 爪・キバ・頭突き・甲羅・しっぽ・電気(当たらなくても 何をしたか 見えるように。2026-11-05)
        if (wf.jab.moves && wf.act.k === 'tech' && wf.act.id === 'punch') {
          const mv = wf.jab.moves[e.n - 1] ?? 'clawR';
          F.monSwing(wf.x, wf.z, wf.face, mv, wf.jab.range + 0.4, wf.y + 0.8, e.n >= wf.jab.parts.length);
          if (mv === 'clawR' || mv === 'clawL') audio.se('mcSlash', { pitch: 1.3 });
          else if (mv === 'zap') audio.se('mcSlash', { pitch: 1.9 });
          else audio.se('whoosh', { pitch: mv === 'bite' ? 1.5 : mv === 'tail' || mv === 'shell' ? 0.9 : 0.7 });
        }
        if (wf.jab.whip && wf.act.k === 'tech' && wf.act.id === 'punch') {
          F.vineWhip(e.side, wf.face, wf.jab.range + 0.4, e.n);
          audio.techSe('', 'whip', 'fire');
        }
        break;
      }
      case 'heal':
        // 回復(吸収・自分の場も)
        if (e.why === '吸収') F.drainFx(e.side === 0 ? 1 : 0, e.side);
        else if (e.why === '回復') F.healFx(e.side, b.f[e.side].act.k === 'tech' && getTech((b.f[e.side].act as { id: string }).id).strength === '大技');
        this.pop(`+${e.amount}`, '#7dff9a');
        if (e.why !== '場') audio.techSe('', 'heal', 'hit');
        break;
      case 'buff':
        F.buffFx(e.side, e.what);
        this.pop(e.what === 'def' ? 'まもりアップ！' : e.what === 'atk' ? 'こうげきアップ！' : 'すばやさアップ！', '#ffe040');
        break;
      case 'chip':
        // 少しのダメージ(やけど・どく・グラビティプレスの場)。よろけないので、数字だけ小さく
        this.pop(`-${e.damage}`, e.why === 'やけど' ? '#ff9a4a' : e.why === 'どく' ? '#c070ff' : '#b080ff');
        F.flash(e.target);
        break;
      case 'status':
        this.pop(
          e.effect === 'ふらつき' ? 'ふらふら！' : e.effect === 'まひ' ? 'しびれた！' : e.effect === 'やけど' ? 'やけどした！' : e.effect === 'どく' ? 'どくを うけた！' : e.effect === 'ねむり' ? 'ねむった…' : e.effect === '防御ダウン' ? 'まもりが下がった！' : e.effect === 'つかまった' ? 'はさまれた！' : e.effect === 'くっついた' ? 'くっついた！' : e.effect === 'すべる' ? 'つるつる すべる！' : e.effect,
          '#ffe040',
        );
        break;
      case 'dodge':
        audio.se('whoosh', { pitch: 1.5 });
        break;
      case 'zdash':
        // ZIPP の電撃ダッシュ: 走り出しに 放電と音(ためたほど大きい)
        F.zdashStart(e.side, e.x, e.z, e.dir, e.c);
        audio.se('whoosh', { pitch: 1.9 - e.c * 0.5 });
        if (e.c > 0.5) F.shake(0.12 + e.c * 0.12);
        break;
      case 'trapSet':
        audio.se('select', { pitch: 0.7 });
        break;
      case 'trapSnap':
        F.trapSnap(e.x, e.z);
        F.shake(0.18);
        audio.se('punchHeavy', { pitch: 1.6 });
        break;
      case 'blink':
        F.bolt(e.x0, 0.8, e.z0, e.x, 0.8, e.z, 1);
        audio.se('whoosh', { pitch: 2.2 });
        break;
      case 'pillar':
        // 落雷(ZIPP)・光の杭(KLAK)・光の砲撃(終端狙撃陣)(2026-11-03)
        if (e.look === 'bolt') {
          for (let k = 0; k < 3; k++) F.bolt(e.x + (Math.random() - 0.5) * 0.8, 12, e.z + (Math.random() - 0.5) * 0.8, e.x, 0.1, e.z, 2.2, 0.3);
          F.zap(e.x, 0.4, e.z);
          F.shake(0.22);
          audio.se('punchHeavy', { pitch: 1.8 });
          break;
        }
        if (e.look === 'rock') {
          // ヘビークラッシュの地割れ: 岩が つき出る
          F.rocks(e.x, e.z);
          F.crack(e.x, e.z, 1);
          F.dust(e.x, e.z, true);
          F.shake(0.15);
          audio.se('punchHeavy', { pitch: 0.7 });
          break;
        }
        if (e.look === 'stake' || e.look === 'beam') {
          F.shockRing(e.x, 0.3, e.z, e.look === 'beam' ? 0xfff0a0 : 0x80e0ff, e.look === 'beam' ? 2 : 1);
          if (e.look === 'beam') F.impact(e.x, e.z, 1.5, true);
          F.shake(e.look === 'beam' ? 0.3 : 0.15);
          audio.se('punchHeavy', { pitch: e.look === 'beam' ? 0.9 : 1.4 });
          break;
        }
        // 火柱が地面から噴き出す
        F.flameBurst(e.x, 0.4, e.z);
        F.rocks(e.x, e.z);
        F.shake(0.2);
        if (!audio.techSe('レンゴクホウケン', 'pillar', 'land')) audio.se('mcFire', { pitch: 0.8 });
        break;
      case 'domeBurst':
        F.impact(e.x, e.z, 2.2, true);
        this.screenFlash(0.4);
        this.pop(e.side === 0 ? 'ドームはんげき！' : 'あいてのドームはんげき！', '#9ad8ff');
        audio.se('koBlast', { pitch: 1.2 });
        break;
      case 'ukemi':
        // 2026-11-02 企画者「受け身をとった表示いらない」→ 文字は出さない(音だけ)
        audio.se('whoosh', { pitch: 1.6 });
        break;
      case 'guard':
        audio.se('select', { pitch: 0.6 });
        break;
      case 'combo':
        this.showCombo(e.side, e.n);
        break;
      case 'comboBreak':
        break;
      case 'guardHit':
        // ガードで受けた: 青い光の盾が光る。ジャストガードは 白く強く光って すぐ動ける
        F.guardFlash(e.side, e.just);
        audio.se('guard', { pitch: e.just ? 1.5 : 1 });
        // 文字は出さない(2026-11-04 企画者「ジャストガードとかガードって文字もいらない」)。光・音・ゆれだけ
        if (e.just) {
          this.hitStop = Math.max(this.hitStop, 0.1);
          F.shake(0.15);
        }
        break;
      case 'guardBreak':
        F.guardFlash(e.side, false, true);
        F.shake(0.3);
        audio.se('crackBig', { pitch: 0.7 });
        break;
      case 'evaded':
        // 2026-11-04 企画者「避けたとかいらないかな」→ 文字は出さない
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

  /** 画面が白く光る(大きい当たり) */
  private screenFlash(strength: number): void {
    if (!this.root) return;
    const el = document.createElement('div');
    el.style.cssText = `position:absolute;inset:0;background:#fff;opacity:${strength};pointer-events:none;z-index:4`;
    this.root.appendChild(el);
    el.animate([{ opacity: strength }, { opacity: 0 }], { duration: 220 }).onfinish = () => el.remove();
  }

  /** 大技の帯(約1秒。試合は止めない) */
  private cutin(side: 0 | 1, name: string, form: number): void {
    const el = this.root?.querySelector('.cutin') as HTMLElement | null;
    if (!el) return;
    (el.querySelector('img') as HTMLImageElement).src = assetUrl(`assets/battle3d/cutin_bunk_${Math.max(1, Math.min(3, form))}.webp`);
    (el.querySelector('b') as HTMLElement).textContent = name;
    el.className = `cutin ${side === 0 ? 'l' : 'r'}`;
    const out = side === 0 ? 'translateX(-105%)' : 'translateX(105%)';
    el.animate(
      [
        { opacity: 1, transform: out },
        { opacity: 1, transform: 'translateX(0)', offset: 0.15 },
        { opacity: 1, transform: 'translateX(0)', offset: 0.8 },
        { opacity: 0, transform: 'translateX(0)' },
      ],
      { duration: 950, easing: 'ease-out' },
    );
  }

  private call(text: string, color: string, border: string, side: 0 | 1 = 0): void {
    const el = this.ui.call;
    el.textContent = text;
    el.style.color = color;
    el.style.borderColor = border;
    el.className = `call ${side === 0 ? 'l' : 'r'}`;
    el.animate(
      [
        { opacity: 0, transform: 'translateY(-6px)' },
        { opacity: 1, transform: 'translateY(0)', offset: 0.1 },
        { opacity: 1, transform: 'translateY(0)', offset: 0.8 },
        { opacity: 0, transform: 'translateY(0)' },
      ],
      { duration: 1200 },
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

  /** コンボの数を 当てた側の HP の下に 出す(すぐ うすく消える) */
  private showCombo(side: number, n: number): void {
    const el = this.ui.chit[side];
    if (!el) return;
    el.innerHTML = `<b>${n}</b>HIT`;
    el.classList.toggle('big', n >= 10);
    el.getAnimations().forEach((a) => a.cancel());
    el.animate(
      [
        { opacity: 1, transform: 'scale(1.25)' },
        { opacity: 1, transform: 'scale(1)', offset: 0.12 },
        { opacity: 1, transform: 'scale(1)', offset: 0.6 },
        { opacity: 0, transform: 'scale(1)' },
      ],
      { duration: 1300, fill: 'forwards' },
    );
  }

  private drawHud(): void {
    const b = this.battle;
    b.f.forEach((f, i) => {
      const r = f.hp / f.maxHp;
      this.ui.hp[i].style.width = `${r * 100}%`;
      this.ui.hp[i].style.background = r > 0.5 ? '#3ad070' : r > 0.2 ? '#ffc020' : '#ff4a4a';
      this.ui.num[i].textContent = `${f.hp}/${f.maxHp}`;
      // ガードの量(青。少ないと赤)
      const g = f.guardGauge / ANIME.guard.max;
      this.ui.guard[i].style.width = `${g * 100}%`;
      this.ui.guard[i].style.background = g > 0.3 ? '#7ad0ff' : '#ff6a4a';
    });
    this.ui.timer.textContent = String(Math.max(0, Math.ceil(ANIME.timeLimit - b.t)));
    const me = b.f[0];
    for (const c of [...me.techs, 'dodge', 'jump', 'punch'] as Command[]) {
      const s = commandState(b, 0, c);
      const btn = this.ui.btn[c];
      if (!btn) continue;
      btn.el.classList.toggle('queued', s === 'queued');
      // ガードボタンは よけるが 待ち時間でも ガードは 出せるので、暗くしない(待ち時間は 下からの 黒い ぬりで 分かる)
      btn.el.classList.toggle('cool', s === 'cooldown' && c !== 'dodge');
      const total = c === 'dodge' ? ANIME.dodge.cooldown : c === 'jump' ? ANIME.jump.cooldown : getTech(c).cooldown;
      btn.cd.style.height = `${s === 'cooldown' ? (Math.max(0, me.cooldown[c] - b.t) / total) * 100 : 0}%`;
    }
  }

  private showResult(): void {
    this.ended = true;
    const w = this.battle.winner;
    this.ui.resultTitle.textContent = w === 0 ? 'WIN!' : w === 1 ? 'LOSE…' : 'DRAW';
    // ストーリー: 勝ったら そのマスをクリア(保存)
    if (this.params.mode === 'story' && w === 0 && this.params.stage) new LifeRecord(loadLife()).clearStage(this.params.stage);
    const leaveBtn = this.root?.querySelector('.leave') as HTMLElement | null;
    if (leaveBtn) leaveBtn.textContent = this.params.mode === 'story' ? (w === 0 ? 'すすむ' : 'すごろくへ') : 'もどる';
    this.ui.result.style.display = 'flex';
  }

  private leave(): void {
    audio.se('back');
    // ストーリーは すごろくへ・バトルモードは モードえらびへ
    this.scene.start(this.params.mode === 'story' ? 'RumbleStory' : this.params.mode === 'free' ? 'RumbleMode' : 'BattleMenu', this.params.mode === 'story' ? { justPlayed: this.params.stage, won: this.battle.winner === 0 } : undefined);
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
