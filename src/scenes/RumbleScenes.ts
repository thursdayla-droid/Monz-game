import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { assetUrl } from '../assetUrl';
import { canPlay, CPU_LEVELS, nextStage, STORY_COUNT, STORY_STAGES } from '../core/rumble';
import { loadLife } from '../core/lifeSave';
import { UI_FONT } from '../ui/paint';
import type { RumbleParams } from './Battle3DScene';

/**
 * MONZ RUMBLE のモードえらび と ストーリーのすごろく(2026-11-03 企画者)。
 * 見た目は仮(企画者が さいごに背景・セレクト画面の絵を作る)。画面は HTML で作る(3Dバトルと同じ)
 */
const CSS = `
.rmb{position:fixed;inset:0;z-index:50;background:radial-gradient(circle at 50% 20%,#3a1460,#120818 70%);color:#fff;font-family:${UI_FONT};user-select:none;-webkit-user-select:none;overflow:auto;-webkit-overflow-scrolling:touch}
.rmb .in{min-height:100%;box-sizing:border-box;padding:calc(env(safe-area-inset-top) + 14px) calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 20px) calc(env(safe-area-inset-left) + 16px);display:flex;flex-direction:column;gap:14px;align-items:center}
.rmb .back{align-self:flex-start;background:#16101ccc;border:0;color:#fff;font:900 15px ${UI_FONT};padding:8px 12px;border-radius:10px}
.rmb h1{margin:0;font-size:34px;letter-spacing:.04em;color:#ffd23a;-webkit-text-stroke:2px #16101c;text-shadow:0 4px 0 #16101c;text-align:center}
.rmb h2{margin:0;font-size:20px;color:#fff;text-align:center}
.rmb .big{width:min(100%,460px);border:4px solid #16101c;border-radius:18px;padding:16px 18px;text-align:left;font:900 24px ${UI_FONT};color:#16101c;box-shadow:0 6px 0 #16101c;display:flex;flex-direction:column;gap:2px}
.rmb .big small{font-size:13px;font-weight:700;opacity:.8}
.rmb .story{background:#ffd23a}
.rmb .free{background:#7ad0ff}
.rmb .cpus{width:min(100%,460px);display:flex;flex-direction:column;gap:10px}
.rmb .cpu{border:3px solid #16101c;border-radius:14px;padding:10px 14px;font:900 20px ${UI_FONT};color:#16101c;background:#fff;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 0 #16101c}
.rmb .cpu small{font-size:12px;font-weight:700;color:#5a4a66}
.rmb .cpu .stars{color:#ff8a1f;font-size:16px;letter-spacing:2px}
.rmb .note{font-size:12px;color:#c8bcd8;text-align:center}
.rmb .board{width:min(100%,520px);display:grid;grid-template-columns:repeat(5,1fr);gap:10px;position:relative}
.rmb .sq{aspect-ratio:1;border-radius:14px;border:3px solid #16101c;background:#4a3a5a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;font:900 18px ${UI_FONT};position:relative;box-shadow:0 4px 0 #16101c;padding:0}
.rmb .sq small{font-size:10px;font-weight:700}
.rmb .sq.done{background:#3ad070;color:#16101c}
.rmb .sq.next{background:#ffd23a;color:#16101c;animation:rmbGlow 1s ease-in-out infinite alternate}
.rmb .sq.lock{background:#2a2033;color:#6a5a7a}
.rmb .sq.boss{border-color:#ff4a6a}
.rmb .sq.final{background:linear-gradient(135deg,#ff4a6a,#a040ff);color:#fff}
.rmb .sq.final.lock{background:#3a1a2a;color:#8a5a7a}
.rmb .me{position:absolute;width:44px;height:44px;border-radius:50%;border:3px solid #fff;background:#16101c center/cover no-repeat;box-shadow:0 3px 8px #0008;transition:left .45s ease,top .45s ease;pointer-events:none;z-index:2}
@keyframes rmbGlow{from{box-shadow:0 4px 0 #16101c,0 0 0 #ffd23a}to{box-shadow:0 4px 0 #16101c,0 0 18px #ffd23a}}
.rmb .panel{position:fixed;inset:0;z-index:3;background:#0d0614e8;display:flex;align-items:center;justify-content:center;padding:calc(env(safe-area-inset-top) + 12px) calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 12px) calc(env(safe-area-inset-left) + 16px)}
.rmb .card{width:min(100%,560px);max-height:100%;overflow:auto;background:#fff;color:#16101c;border:4px solid #16101c;border-radius:18px;padding:14px;display:flex;flex-direction:column;gap:10px;box-sizing:border-box}
.rmb .pic{aspect-ratio:16/9;border-radius:12px;background:#e8e0f0;display:flex;align-items:center;justify-content:center;color:#7a6a8a;font-size:14px;font-weight:700;text-align:center;overflow:hidden}
.rmb .pic img{width:100%;height:100%;object-fit:cover}
.rmb .card h3{margin:0;font-size:20px}
.rmb .card p{margin:0;font-size:15px;line-height:1.6}
.rmb .foe{font-size:13px;font-weight:700;color:#5a4a66}
.rmb .row{display:flex;gap:10px}
.rmb .go{flex:1;border:3px solid #16101c;border-radius:12px;padding:10px;font:900 20px ${UI_FONT};background:#ff4a6a;color:#fff;box-shadow:0 4px 0 #16101c}
.rmb .no{border:3px solid #16101c;border-radius:12px;padding:10px 14px;font:900 16px ${UI_FONT};background:#fff;color:#16101c}
.rmb .clear{background:#ffd23a;color:#16101c;border:3px solid #16101c;border-radius:12px;padding:6px 14px;font-weight:900}
`;

function mount(scene: Phaser.Scene, html: string): HTMLDivElement {
  if (!document.getElementById('rmb-css')) {
    const st = document.createElement('style');
    st.id = 'rmb-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = 'rmb';
  root.innerHTML = `<div class="in">${html}</div>`;
  document.body.appendChild(root);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => root.remove());
  return root;
}

/** モードえらび: ストーリーモード / バトルモード(CPU の強さをえらぶ) */
export class RumbleModeScene extends Phaser.Scene {
  constructor() {
    super('RumbleMode');
  }

  create(): void {
    audio.playBgm('home');
    const root = mount(
      this,
      `<button class="back">◀ もどる</button>
       <h1>MONZ RUMBLE</h1>
       <button class="big story">ストーリーモード<small>すごろくで1マスずつ すすむ・ぜんぶで${STORY_COUNT}バトル</small></button>
       <button class="big free">バトルモード<small>CPU の強さを えらんで たたかう</small></button>`,
    );
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    $('.back').addEventListener('click', () => {
      audio.se('back');
      this.scene.start('BattleMenu');
    });
    $('.story').addEventListener('click', () => {
      audio.unlock();
      audio.se('select');
      this.scene.start('RumbleStory');
    });
    $('.free').addEventListener('click', () => {
      audio.unlock();
      audio.se('select');
      this.showCpu(root);
    });
  }

  private showCpu(root: HTMLDivElement): void {
    const inner = root.querySelector('.in') as HTMLElement;
    inner.innerHTML = `<button class="back">◀ もどる</button>
      <h2>CPU の強さを えらぶ</h2>
      <div class="cpus">${CPU_LEVELS.map(
        (c) => `<button class="cpu" data-id="${c.id}"><span>${c.name}<br><small>${c.level === 0 ? '自分と同じレベル' : c.level > 0 ? `自分より レベル +${c.level}` : `自分より レベル ${c.level}`}</small></span><span class="stars">${'★'.repeat(c.prof)}${'☆'.repeat(5 - c.prof)}</span></button>`,
      ).join('')}</div>
      <div class="note">★ = 戦いのうまさ（よけ方・ねらい）</div>`;
    (inner.querySelector('.back') as HTMLElement).addEventListener('click', () => {
      audio.se('back');
      this.scene.restart();
    });
    for (const b of [...inner.querySelectorAll('.cpu')] as HTMLElement[])
      b.addEventListener('click', () => {
        audio.se('select');
        this.scene.start('Battle3D', { mode: 'free', cpu: Number(b.dataset.id) } satisfies RumbleParams);
      });
  }
}

/** ストーリーのすごろく(20マス)。クリアした所は何度でも遊べる */
export class RumbleStoryScene extends Phaser.Scene {
  private from: { justPlayed?: number; won?: boolean } = {};

  constructor() {
    super('RumbleStory');
  }

  init(data: { justPlayed?: number; won?: boolean }): void {
    this.from = data && typeof data === 'object' ? data : {};
  }

  create(): void {
    audio.playBgm('home');
    const cleared = loadLife().rumble?.cleared ?? 0;
    const next = nextStage(cleared);
    const allClear = cleared >= STORY_COUNT;
    // マスを じぐざぐに ならべる(5マスずつ。2行目は右から左)
    const order: number[] = [];
    for (let row = 0; row < STORY_COUNT / 5; row++) {
      const r = Array.from({ length: 5 }, (_, i) => row * 5 + i + 1);
      order.push(...(row % 2 ? r.reverse() : r));
    }
    const squares = order
      .map((no) => {
        const st = STORY_STAGES[no - 1];
        const cls = [no <= cleared ? 'done' : no === next && !allClear ? 'next' : 'lock', st.enemy.boss ? 'boss' : '', no === STORY_COUNT ? 'final' : ''].join(' ');
        const label = no === STORY_COUNT ? '👑' : st.enemy.boss ? '★' : '';
        return `<button class="sq ${cls}" data-no="${no}">${label || no}<small>${no === STORY_COUNT ? 'ボス' : st.enemy.boss ? '中ボス' : no <= cleared ? 'クリア' : ''}</small></button>`;
      })
      .join('');
    const root = mount(
      this,
      `<button class="back">◀ もどる</button>
       <h2>ストーリー　<span style="color:#ffd23a">${Math.min(cleared, STORY_COUNT)} / ${STORY_COUNT}</span> クリア</h2>
       ${allClear ? '<div class="clear">ストーリー クリア！ 好きなマスを もう一度あそべます</div>' : ''}
       <div class="board">${squares}<div class="me"></div></div>
       <div class="note">光っているマスを さわると すすむ・クリアしたマスは もう一度あそべる</div>`,
    );
    const $ = (s: string) => root.querySelector(s) as HTMLElement;
    $('.back').addEventListener('click', () => {
      audio.se('back');
      this.scene.start('RumbleMode');
    });
    // 自分のコマ(いちばん先のクリアしたマス。まだなら1マスめの手前)
    const me = $('.me');
    me.style.backgroundImage = `url("${assetUrl('assets/battle3d/cutin_bunk_1.webp')}")`;
    const place = (no: number) => {
      const sq = root.querySelector(`.sq[data-no="${Math.max(1, no)}"]`) as HTMLElement | null;
      if (!sq) return;
      me.style.left = `${sq.offsetLeft + sq.offsetWidth / 2 - 22}px`;
      me.style.top = `${sq.offsetTop - (no < 1 ? 26 : 14)}px`;
    };
    // 勝って もどってきた時は、前のマスから1マス進む
    const moved = this.from.won && this.from.justPlayed === cleared;
    place(moved ? cleared - 1 : cleared);
    if (moved) window.setTimeout(() => place(cleared), 350);
    for (const b of [...root.querySelectorAll('.sq')] as HTMLElement[])
      b.addEventListener('click', () => {
        const no = Number(b.dataset.no);
        if (!canPlay(no, cleared)) {
          audio.se('beep');
          return;
        }
        audio.unlock();
        audio.se('tap');
        // 次のマスなら、コマが1マス進んでから話を出す
        if (no === next && !allClear && no > cleared) {
          place(no);
          window.setTimeout(() => this.openStage(root, no), 500);
        } else this.openStage(root, no);
      });
  }

  /** 一枚絵と話 → バトル */
  private openStage(root: HTMLDivElement, no: number): void {
    const st = STORY_STAGES[no - 1];
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.innerHTML = `<div class="card">
      <div class="pic">${st.image ? `<img src="${assetUrl(st.image)}" alt="">` : '一枚絵（企画者が作ります）'}</div>
      <h3>${st.no}. ${st.title}</h3>
      <p>${st.text}</p>
      <div class="foe">あいて：${st.enemy.name}　Lv.${st.enemy.level}　${'★'.repeat(st.enemy.prof)}${'☆'.repeat(5 - st.enemy.prof)}${st.enemy.boss ? '　HP が多い' : ''}</div>
      <div class="row"><button class="no">やめる</button><button class="go">バトル！</button></div>
    </div>`;
    root.appendChild(panel);
    (panel.querySelector('.no') as HTMLElement).addEventListener('click', () => {
      audio.se('back');
      panel.remove();
    });
    (panel.querySelector('.go') as HTMLElement).addEventListener('click', () => {
      audio.se('select');
      this.scene.start('Battle3D', { mode: 'story', stage: no } satisfies RumbleParams);
    });
  }
}
