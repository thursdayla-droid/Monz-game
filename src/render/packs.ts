import * as Phaser from 'phaser';
import { assetUrl } from '../assetUrl';
import { BIRTH_FILES, birthKey } from '../scenes/BirthScene';
import { REFERENCE_FILES, REFERENCE_ORIGINAL } from '../scenes/CompareScene';
import { BUNK_POSE_IMAGES, bunkPoseKey, HOME_ICONS, HOME_IMAGES, homeIconKey, homeImageKey, homePlace, MEAT_FILE, MEAT_KEY } from '../scenes/HomeScene';
import { TITLE_FILE, TITLE_IMAGE } from '../scenes/TitleScene';
import { loadBunk } from './bunkView';

/**
 * 素材のまとまり(パック)。画面ごとに、必要なパックだけを読み込み、使い終わったら外す。
 * こうすると、起動が速くなり、スマホのメモリも少なくてすむ。新しい画面・ミニゲームは、ここにパックを1つ足す。
 * - title: タイトルの絵
 * - bunk: BUNKのパーツ・表情・元画像の切り抜き(目の反転防止に使う)・6つの姿
 * - birth: 誕生シーンの絵(空・ドラゴン・卵・籠)
 * - home: お世話画面(今の場所の背景・アイコン・肉)
 * - compare: 元画像との比較画面(開発用)
 */
export type PackName = 'title' | 'bunk' | 'birth' | 'home' | 'compare';

interface PackFile {
  key: string;
  url: string;
}

function packFiles(name: Exclude<PackName, 'bunk'>): PackFile[] {
  switch (name) {
    case 'title':
      return [{ key: TITLE_IMAGE, url: TITLE_FILE }];
    case 'birth':
      return Object.entries(BIRTH_FILES).map(([n, file]) => ({ key: birthKey(n as keyof typeof BIRTH_FILES), url: `assets/birth/${file}` }));
    case 'home': {
      const place = homePlace();
      const bg = HOME_IMAGES[place];
      return [
        ...(bg ? [{ key: homeImageKey(place), url: `assets/home/${bg}` }] : []),
        ...HOME_ICONS.map((n) => ({ key: homeIconKey(n), url: `assets/home/icons/${n}.webp` })),
        { key: MEAT_KEY, url: `assets/home/${MEAT_FILE}` },
      ];
    }
    case 'compare':
      return [{ key: REFERENCE_ORIGINAL, url: REFERENCE_FILES.original }];
  }
}

/** BUNKの6つの姿(お世話画面で使う) */
const bunkPoseFiles = (): PackFile[] => Object.keys(BUNK_POSE_IMAGES).map((n) => ({ key: bunkPoseKey(n), url: `assets/bunk/poses/${n}.webp` }));

/** まだ読み込んでいない素材だけを、読み込みの予定に入れる。入れた数を返す(0 なら全部そろっている) */
export function queuePacks(scene: Phaser.Scene, names: PackName[]): number {
  let queued = 0;
  const add = (files: PackFile[]) => {
    for (const f of files) {
      if (scene.textures.exists(f.key)) continue;
      scene.load.image(f.key, assetUrl(f.url));
      queued++;
    }
  };
  for (const name of names) {
    if (name === 'bunk') {
      queued += loadBunk(scene.load);
      add(bunkPoseFiles());
    } else add(packFiles(name));
  }
  return queued;
}

/**
 * 画面を開く前に読み込む(scene の preload から呼ぶ)。読み込みが必要なときだけ「よみこみ中」を出す。
 */
export function preloadPacks(scene: Phaser.Scene, names: PackName[]): void {
  if (queuePacks(scene, names) === 0) return;
  const { width, height } = scene.scale;
  const label = scene.add.text(width / 2, height / 2, 'よみこみ中…', { fontSize: '32px', color: '#ffffff' }).setOrigin(0.5);
  scene.load.on('progress', (v: number) => label.setText(`よみこみ中… ${Math.round(v * 100)}%`));
  scene.load.once('complete', () => label.destroy());
}

/** 次の画面で使う素材を、今の画面を見ている間に先に読んでおく(scene の create から呼ぶ) */
export function prefetchPacks(scene: Phaser.Scene, names: PackName[]): void {
  if (queuePacks(scene, names) > 0) scene.load.start();
}

/** そのパックの絵をメモリから外す(もう使わない画面を離れたとき)。prefix: その画面がその場で作った絵もまとめて外す */
export function releasePack(scene: Phaser.Scene, name: Exclude<PackName, 'bunk'>, prefix?: string): void {
  const keys = new Set(packFiles(name).map((f) => f.key));
  if (prefix) for (const k of scene.textures.getTextureKeys()) if (k.startsWith(prefix)) keys.add(k);
  for (const k of keys) if (scene.textures.exists(k)) scene.textures.remove(k);
}
