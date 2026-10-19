import * as Phaser from 'phaser';
import { assetUrl } from '../assetUrl';
import { clearLife } from '../core/lifeSave';
import { clearSave } from '../core/save';
import { loadBunk } from '../render/bunkView';
import { loadBirth } from './BirthScene';
import { REFERENCE_CUTOUT, REFERENCE_FILES, REFERENCE_ORIGINAL } from './CompareScene';
import { HOME_IMAGES, homeImageKey } from './HomeScene';
import type { HomePlace } from '../core/home';
import { TITLE_FILE, TITLE_IMAGE } from './TitleScene';

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
    const { width, height } = this.scale;
    const label = this.add.text(width / 2, height / 2, 'よみこみ中…', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
    this.load.on('progress', (v: number) => label.setText(`よみこみ中… ${Math.round(v * 100)}%`));
    this.load.image(TITLE_IMAGE, assetUrl(TITLE_FILE));
    this.load.image(REFERENCE_ORIGINAL, assetUrl(REFERENCE_FILES.original));
    this.load.image(REFERENCE_CUTOUT, assetUrl(REFERENCE_FILES.cutout));
    loadBunk(this.load);
    loadBirth(this.load);
    for (const [place, file] of Object.entries(HOME_IMAGES)) this.load.image(homeImageKey(place as HomePlace), assetUrl(`assets/home/${file}`));
  }

  create(): void {
    // ?birth のときも、音を出せるように「TAP TO START」を通す
    this.scene.start(START, query.has('birth') ? { next: 'Birth' } : undefined);
  }
}
