import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { assetUrl } from '../assetUrl';
import { canPlay, CPU_LEVELS, ENDINGS, nextStage, SPECIAL_NO, STORY_COUNT, STORY_NAME, STORY_STAGES, STORY_TOTAL } from '../core/rumble';
import { loadLife } from '../core/lifeSave';
import { UI_FONT } from '../ui/paint';
import type { RumbleParams } from './Battle3DScene';

/**
 * MONZ RUMBLE のモードえらび と ストーリー(2026-11-03 企画者。2026-11-05 すごろくを やめて 一枚絵で 進める)。
 * 見た目は仮(企画者が さいごに背景・セレクト画面の絵を作る)。画面は HTML で作る(3Dバトルと同じ)
 */
const CSS = `
.rmb{position:fixed;inset:0;z-index:50;background:radial-gradient(circle at 50% 20%,#3a1460,#120818 70%);color:#fff;font-family:${UI_FONT};user-select:none;-webkit-user-select:none;overflow:auto;-webkit-overflow-scrolling:touch}
.rmb .in{min-height:100%;box-sizing:border-box;padding:calc(env(safe-area-inset-top) + 14px) calc(env(safe-area-inset-right) + 16px) calc(env(safe-area-inset-bottom) + 20px) calc(env(safe-area-inset-left) + 16px);display:flex;flex-direction:column;gap:14px;align-items:center}
/* 2026-11-07 企画者のモードえらびの絵(左＝ストリート・右＝王冠のバトルステージ) */
.rmb .modebg{position:fixed;inset:0;z-index:-1;background:#120818 center/cover no-repeat}
.rmb .modebg::after{content:'';position:absolute;inset:0;background:linear-gradient(#0000 40%,#0006)}
.rmb .back{align-self:flex-start;background:#16101ccc;border:0;color:#fff;font:900 15px ${UI_FONT};padding:8px 12px;border-radius:10px}
.rmb h1{margin:0;font-size:34px;letter-spacing:.04em;color:#ffd23a;-webkit-text-stroke:2px #16101c;text-shadow:0 4px 0 #16101c;text-align:center}
.rmb h2{margin:0;font-size:20px;color:#fff;text-align:center}
.rmb .big{width:min(100%,460px);border:4px solid #16101c;border-radius:18px;padding:16px 18px;text-align:left;font:900 24px ${UI_FONT};color:#16101c;box-shadow:0 6px 0 #16101c;display:flex;flex-direction:column;gap:2px}
.rmb .big small{font-size:13px;font-weight:700;opacity:.8}
.rmb .story{background:#ffd23a}
.rmb .free{background:#7ad0ff}
.rmb .cpus{width:min(100%,760px);display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:10px}
.rmb .cpu{white-space:nowrap;border:3px solid #16101c;border-radius:14px;padding:10px 14px;font:900 18px ${UI_FONT};color:#16101c;background:#fff;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 0 #16101c}
.rmb .cpu small{font-size:12px;font-weight:700;color:#5a4a66}
.rmb .cpu .stars{color:#ff8a1f;font-size:16px;letter-spacing:2px}
.rmb .note{font-size:12px;color:#c8bcd8;text-align:center}
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
/* ストーリー: 一枚絵で 進める(2026-11-05 企画者) */
.rmb .stl{position:fixed;inset:0;display:flex;flex-direction:column;justify-content:flex-end}
.rmb .stl.in2{animation:rmbIn .45s ease}
@keyframes rmbIn{from{opacity:0}to{opacity:1}}
.rmb .spic{position:absolute;inset:0;background:#2a1a3a;display:flex;align-items:center;justify-content:center;color:#a898b8;font-size:15px;font-weight:700}
.rmb .spic img{width:100%;height:100%;object-fit:cover;object-position:50% 8%}
.rmb .stop{position:absolute;top:0;left:0;right:0;display:flex;align-items:center;gap:10px;padding:calc(env(safe-area-inset-top) + 10px) calc(env(safe-area-inset-right) + 14px) 10px calc(env(safe-area-inset-left) + 14px);background:linear-gradient(#000c,#0000)}
.rmb .stop .back{align-self:center}
.rmb .sno{flex:1;text-align:center;font:900 18px ${UI_FONT};color:#ffd23a;text-shadow:0 2px 0 #16101c,0 0 6px #000}
.rmb .sname{display:block;font-size:11px;letter-spacing:.2em;color:#fff;-webkit-text-stroke:0;opacity:.85}
.rmb .stitle{display:block;font-size:13px;color:#fff;margin-top:1px}
.rmb .sfoe{display:block;font-size:11px;color:#e8dcf4;font-weight:700;text-shadow:0 1px 2px #000}
.rmb .sfoe .stars{color:#ffb03a}
.rmb .nav .jump{height:36px;border:2px solid #16101c;border-radius:10px;background:#ffd23a;color:#16101c;font:900 13px ${UI_FONT};padding:0 4px}
.rmb .nav .skip{width:auto;padding:0 10px;font-size:12px}
/* 2026-11-05 企画者「文字の枠と被ってキャラが見えない」→ 下は 細い 半とうめいの 帯だけ(題名・あいては 上へ) */
.rmb .stext{position:relative;display:flex;align-items:center;gap:12px;padding:8px calc(env(safe-area-inset-right) + 14px) calc(env(safe-area-inset-bottom) + 8px) calc(env(safe-area-inset-left) + 14px);background:linear-gradient(#0000,#000b 35%,#000d);color:#fff;min-height:52px}
.rmb .stext .tx{flex:1;display:flex;flex-direction:column;gap:2px;min-width:0}
.rmb .stext .who{align-self:flex-start;background:#ffd23a;color:#16101c;font-weight:900;font-size:12px;border-radius:7px;padding:1px 9px}
.rmb .stext .line{margin:0;font-size:15px;line-height:1.45;font-weight:700;text-shadow:0 1px 3px #000}
.rmb .stext .line.narr{font-style:italic;color:#e0d4ee;font-weight:500}
.rmb .stext .go{flex:0 0 auto;padding:6px 18px;font-size:16px}
.rmb .stext .go.fight{background:#ffd23a;color:#16101c}
.rmb .sno small{font-size:13px;color:#fff}
.rmb .sno em{font-style:normal;font-size:12px;background:#3ad070;color:#16101c;border-radius:8px;padding:2px 8px;margin-left:8px;-webkit-text-stroke:0}
.rmb .nav{display:flex;gap:6px}
.rmb .nav button{width:40px;height:36px;border:2px solid #16101c;border-radius:10px;background:#fff;color:#16101c;font:900 16px ${UI_FONT}}
.rmb .nav button:disabled{opacity:.3}
.rmb .sclear{position:absolute;top:calc(env(safe-area-inset-top) + 58px);left:50%;transform:translateX(-50%);white-space:nowrap}
.rmb .bstart{position:absolute;left:0;right:0;top:38%;text-align:center;font:900 min(54px,5.6vw) ${UI_FONT};white-space:nowrap;color:#ffd23a;-webkit-text-stroke:3px #16101c;text-shadow:0 6px 0 #16101c;opacity:0;transform:scale(2);pointer-events:none;z-index:3}
.rmb .stl.starting .bstart{animation:rmbStart .7s ease-out forwards}
@keyframes rmbStart{0%{opacity:0;transform:scale(2.2)}40%{opacity:1;transform:scale(1)}100%{opacity:1;transform:scale(1.05)}}
.rmb .rot{position:fixed;inset:0;z-index:40;display:none;align-items:center;justify-content:center;background:#0d0614f5}
.rmb .rot div{border:4px solid #ffd23a;border-radius:18px;background:#16101c;color:#ffd23a;font-weight:900;font-size:26px;padding:22px 30px;text-align:center}
.rmb .rot small{display:block;color:#fff;font-size:14px;margin-top:8px}
@media (orientation:portrait){.rmb .rot{display:flex}}
.rmb .clear{background:#ffd23a;color:#16101c;border:3px solid #16101c;border-radius:12px;padding:6px 14px;font-weight:900}
`;

/** 確認用ページ(3Dバトル・STREET KING の 確認用)か。ふつうの ゲームでは 出さない */
const isPreview = () => ['Battle3D', 'RumbleMode'].includes((window as { __MONZ_START?: string }).__MONZ_START ?? '');

function mount(scene: Phaser.Scene, html: string): HTMLDivElement {
  if (!document.getElementById('rmb-css')) {
    const st = document.createElement('style');
    st.id = 'rmb-css';
    st.textContent = CSS;
    document.head.appendChild(st);
  }
  const root = document.createElement('div');
  root.className = 'rmb';
  // MONZ RUMBLE は スマホ横だけ(2026-11-05 企画者)。縦の あいだは「横にしてね」で おおう
  root.innerHTML = `<div class="in">${html}</div><div class="rot"><div>スマホを 横にしてね<small>MONZ RUMBLE は 横画面で あそびます</small></div></div>`;
  document.body.appendChild(root);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => root.remove());
  return root;
}

/** モードえらび: ストーリーモード / バトルモード(CPU の強さをえらぶ) */
/** モードえらびの背景(2026-11-07 企画者の絵。元は design/rumble_ui/sel_mode.png) */
const MODE_BG = 'assets/story/sel_mode.webp';

export class RumbleModeScene extends Phaser.Scene {
  constructor() {
    super('RumbleMode');
  }

  create(): void {
    audio.playBgm('home');
    const root = mount(
      this,
      `<div class="modebg" style="background-image:url('${assetUrl(MODE_BG)}')"></div><button class="back">◀ もどる</button>
       <h1>MONZ RUMBLE</h1>
       <button class="big story">${STORY_NAME}<small>ストーリー・一枚絵で 話が すすむ・ぜんぶで${STORY_COUNT}ステージ</small></button>
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

/** ストーリー(30ステージ・一枚絵で 進める)。クリアした所は何度でも遊べる */
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
    // 確認用ページ: 全部の ステージを 遊べる(2026-11-07 企画者「各テストやりたいから出して」)
    const cleared = isPreview() ? STORY_TOTAL : loadLife().rumble?.cleared ?? 0;
    const next = nextStage(cleared);
    const allClear = cleared >= STORY_TOTAL;
    // 2026-11-05 企画者「すごろく風はやめて、1枚絵でストーリーを進めていく感じに」:
    // 今の ステージの 一枚絵と 話を 大きく 出す → バトル。勝つと 次の 話へ。◀ ▶ で 前の 話も 見られる(もう一度 遊べる)
    let no = this.from.justPlayed && !this.from.won ? this.from.justPlayed : allClear ? STORY_TOTAL : next;
    // 確認用: はじめは 1話から・勝ったら 次の話へ
    if (isPreview()) no = this.from.justPlayed ? Math.min(STORY_TOTAL, this.from.justPlayed + (this.from.won ? 1 : 0)) : 1;
    const root = mount(this, '<div class="stl"></div>');
    const box = root.querySelector('.stl') as HTMLDivElement;
    // エンディング: 勝ったあと、その話に エンディングが あれば 先に 流す(一枚絵と 話。さわると 次へ)
    const ending = this.from.won && this.from.justPlayed ? ENDINGS[this.from.justPlayed] : undefined;
    if (ending?.length) {
      // エンディングの 曲(2026-11-07 企画者)。おわったら いつもの 曲に もどす
      audio.playBgm('ending');
      let si = 0;
      let li = 0;
      const show = () => {
        const sc = ending[si];
        const L = sc.lines[li];
        box.innerHTML = `<div class="spic">${sc.image ? `<img src="${assetUrl(sc.image)}" alt="">` : '<span>一枚絵（企画者が作ります）</span>'}</div>
          <div class="stop"><div class="sno"><span class="sname">${STORY_NAME}</span>ENDING<span class="stitle">${sc.title}</span></div><div class="nav"><button class="skip">とばす ▶▶</button></div></div>
          <div class="stext"><div class="tx"><div class="who" style="display:${L?.who ? 'inline-block' : 'none'}">${L?.who ?? ''}</div><p class="line ${L?.who ? '' : 'narr'}">${L?.text ?? ''}</p></div><button class="go">▼ つぎへ</button></div>`;
        if (li === 0) {
          box.classList.remove('in2');
          void box.offsetWidth;
          box.classList.add('in2');
        }
        const next = () => {
          audio.se('tap');
          if (li < sc.lines.length - 1) li++;
          else if (si < ending.length - 1) {
            si++;
            li = 0;
          } else {
            this.from = { justPlayed: this.from.justPlayed, won: true };
            audio.playBgm('home');
            draw(true);
            return;
          }
          show();
        };
        (box.querySelector('.go') as HTMLElement).addEventListener('click', (ev) => {
          ev.stopPropagation();
          next();
        });
        (box.querySelector('.skip') as HTMLElement).addEventListener('click', (ev) => {
          ev.stopPropagation();
          audio.se('tap');
          audio.playBgm('home');
          draw(true);
        });
        (box.querySelector('.stext') as HTMLElement).addEventListener('click', next);
        (box.querySelector('.spic') as HTMLElement).addEventListener('click', next);
      };
      // draw は 下で 作るので、作ってから 流す
      window.setTimeout(show, 0);
    }
    const draw = (fade: boolean) => {
      const st = STORY_STAGES[no - 1];
      const done = no <= cleared;
      // 話を 1行ずつ(2026-11-05 企画者の 第1話)。さわると 次の行・さいごは BATTLE START!
      let li = 0;
      const lines = st.lines.length ? st.lines : [{ who: null, text: st.text }];
      box.innerHTML = `<div class="spic">${st.image ? `<img src="${assetUrl(st.image)}" alt="">` : '<span>一枚絵（企画者が作ります）</span>'}</div>
        <div class="stop"><button class="back">◀ もどる</button><div class="sno"><span class="sname">${STORY_NAME}</span>${st.no === SPECIAL_NO ? '特別編　STAGE ' + st.no : `第${st.chapter}章　STAGE ${st.no} <small>/ ${STORY_COUNT}</small>`}${done ? '<em>クリア</em>' : ''}<span class="stitle">${st.title}</span><span class="sfoe">あいて：${st.enemy.name}　Lv.${st.enemy.level}　<span class="stars">${'★'.repeat(st.enemy.prof)}${'☆'.repeat(5 - st.enemy.prof)}</span>${st.enemy.boss ? '　ボス' : ''}</span></div>
          <div class="nav">${isPreview() ? `<select class="jump" title="確認用: ステージへ とぶ">${STORY_STAGES.map((x) => `<option value="${x.no}" ${x.no === no ? 'selected' : ''}>確認 ${x.no}</option>`).join('')}</select>` : ''}<button class="prev" ${no <= 1 ? 'disabled' : ''}>◀</button><button class="nxt" ${!canPlay(no + 1, cleared) ? 'disabled' : ''}>▶</button><button class="skip">とばす ▶▶</button></div></div>
        ${allClear && !isPreview() && no === STORY_TOTAL ? '<div class="clear sclear">ストーリー クリア！ ◀ で 前の話も 遊べます</div>' : ''}
        <div class="bstart">${st.start ?? 'BATTLE START!'}</div>
        <div class="stext">
          <div class="tx"><div class="who"></div><p class="line"></p></div>
          <button class="go"></button>
        </div>`;
      if (fade) {
        box.classList.remove('in2');
        void box.offsetWidth;
        box.classList.add('in2');
      }
      const $ = (q: string) => box.querySelector(q) as HTMLButtonElement;
      const showLine = () => {
        const L = lines[li];
        $('.who').textContent = L.who ?? '';
        $('.who').style.display = L.who ? 'inline-block' : 'none';
        const p = $('.line');
        p.textContent = L.text;
        p.classList.toggle('narr', !L.who);
        const last = li >= lines.length - 1;
        $('.go').textContent = last ? st.start ?? 'BATTLE START!' : '▼ つぎへ';
        $('.go').classList.toggle('fight', last);
      };
      const start = () => {
        audio.unlock();
        audio.se('select');
        box.classList.add('starting');
        window.setTimeout(() => this.scene.start('Battle3D', { mode: 'story', stage: no } satisfies RumbleParams), 750);
      };
      const advance = () => {
        if (box.classList.contains('starting')) return;
        if (li < lines.length - 1) {
          audio.se('tap');
          li++;
          showLine();
        } else start();
      };
      showLine();
      $('.back').addEventListener('click', () => {
        audio.se('back');
        this.scene.start('RumbleMode');
      });
      const jump = box.querySelector('.jump') as HTMLSelectElement | null;
      jump?.addEventListener('click', (ev) => ev.stopPropagation());
      jump?.addEventListener('change', () => {
        audio.se('tap');
        no = Number(jump.value);
        draw(true);
      });
      $('.prev').addEventListener('click', () => {
        if (no <= 1) return;
        audio.se('tap');
        no--;
        draw(true);
      });
      $('.nxt').addEventListener('click', () => {
        if (!canPlay(no + 1, cleared)) return audio.se('beep');
        audio.se('tap');
        no++;
        draw(true);
      });
      $('.go').addEventListener('click', (ev) => {
        ev.stopPropagation();
        advance();
      });
      $('.skip').addEventListener('click', (ev) => {
        ev.stopPropagation();
        li = lines.length - 1;
        showLine();
        start();
      });
      // 文の 枠・絵を さわっても 次へ
      $('.stext').addEventListener('click', advance);
      $('.spic').addEventListener('click', advance);
    };
    if (!ending?.length) draw(true);
  }
}
