import * as Phaser from 'phaser';
import { clearLife } from '../core/lifeSave';
import { clearSave } from '../core/save';
import { preloadPacks } from '../render/packs';

/** ふだんは「TAP TO START」→タイトル画面から始める。?parts でBUNKの動きのテスト画面、?compare で元画像との比較画面(開発用)を直接開く */
const query = new URLSearchParams(location.search);
/** ?reset を付けると、保存した回答を消して最初(質問)からやり直す(テスト用) */
if (query.has('reset')) {
  clearSave();
  clearLife();
}
/** ?birth を付けると、誕生の演出を直接見られる(テスト用。保存データは変えない) */
const START = query.has('compare') ? 'Compare' : query.has('parts') ? 'BunkParts' : 'Splash';

export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    // 起動時はタイトルの絵だけ。ほかの素材は、それぞれの画面を開くとき(または前の画面を見ている間)に読む
    preloadPacks(this, START === 'Splash' ? ['title'] : []);
  }

  create(): void {
    // ?birth のときも、音を出せるように「TAP TO START」を通す
    this.scene.start(START, query.has('birth') ? { next: 'Birth' } : undefined);
  }
}
