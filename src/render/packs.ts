import * as Phaser from 'phaser';
import { assetUrl } from '../assetUrl';
import { BIRTH_FILES, birthKey } from '../scenes/BirthScene';
import { REFERENCE_FILES, REFERENCE_ORIGINAL } from '../scenes/CompareScene';
import { BUNK_POSE_IMAGES, bunkPoseKey, HAND_FILE, HAND_KEY, HOME_ICONS, homeIconKey, homeImageFile, homeImageKey, homePlace, MEAT_FILE, MEAT_KEY } from '../scenes/HomeScene';
import { TITLE_FILE, TITLE_IMAGE } from '../scenes/TitleScene';
import { MYTH_TITLE_FILE, MYTH_TITLE_IMAGE } from '../scenes/MythTitleScene';
import { OPPONENT_ART, opponentArtFile, opponentArtKey } from '../ui/opponentFace';
import { MYTH_FLOOR_FILE, MYTH_FLOOR_IMAGE, MYTH_FLOOR_ORB, MYTH_FLOOR_ORB_FILE } from '../scenes/MythFloorScene';
import { MYTH_TOWER_FILE, MYTH_TOWER_IMAGE, MYTH_TOWER_PARTS, MYTH_TOWER_PARTS_FILE } from '../scenes/MythTowerScene';
import { MYTH_PACK_FILE, MYTH_PACK_IMAGE } from '../ui/packBuy';
import { SELECT_CARD_ART, SELECT_IMAGE } from '../scenes/MinigameSelectScene';
import { CARD_IMAGES } from '../ui/cardArt';
import { SLUG_BATTER_ART, slugBatterKey, SLUG_PITCHER_ART, slugPitcherKey, SLUGGER_BG_FILE, SLUGGER_BG_KEY, SLUGGER_LOGO_FILE, SLUGGER_LOGO_KEY } from '../scenes/SluggerScene';
import { DASH_BG_FILE, DASH_BG_KEY, DASH_LOGO_FILE, DASH_LOGO_KEY, DASH_JUMP_FILE, DASH_JUMP_KEY, DASH_RUN_FILE, DASH_RUN_KEY, DASH_PLAT_FILE, DASH_PLAT_KEY, DASH_SPIKE_FILE, DASH_SPIKE_KEY } from '../scenes/DashScene';
import { loadBunk } from './bunkView';
import { HOME_PLACES } from '../core/home';

/**
 * 素材のまとまり(パック)。画面ごとに、必要なパックだけを読み込み、使い終わったら外す。
 * こうすると、起動が速くなり、スマホのメモリも少なくてすむ。新しい画面・ミニゲームは、ここにパックを1つ足す。
 * - title: タイトルの絵
 * - bunk: BUNKのパーツ・表情・元画像の切り抜き(目の反転防止に使う)・6つの姿
 * - birth: 誕生シーンの絵(空・ドラゴン・卵・籠)
 * - home: お世話画面(今の部屋の背景・アイコン・肉)
 * - rooms: 部屋を選ぶ画面(3つの部屋の絵と小さい絵)
 * - compare: 元画像との比較画面(開発用)
 * - minigame: ミニゲームのセレクト画面
 * - card: MONZ CARD(タイトル・ロゴ・カードの裏・山札)
 * - dash: DASH MONZ(背景・足場・トゲ・走るモンズ・ロゴ)
 * - slugger: MONZ SLUGGER(球場の背景・バッター5ポーズ・ピッチャー3ポーズ・ロゴ)
 * - mythclash: MYTHCLASH(タイトルの絵・パックの絵・タワーの絵)
 */
export type PackName = 'title' | 'bunk' | 'birth' | 'home' | 'rooms' | 'compare' | 'minigame' | 'card' | 'dash' | 'slugger' | 'mythclash';

interface PackFile {
  key: string;
  url: string;
}

function packFiles(name: Exclude<PackName, 'bunk'>): PackFile[] {
  switch (name) {
    case 'mythclash':
      return [
        { key: MYTH_TITLE_IMAGE, url: MYTH_TITLE_FILE },
        { key: MYTH_PACK_IMAGE, url: MYTH_PACK_FILE },
        { key: MYTH_TOWER_IMAGE, url: MYTH_TOWER_FILE },
        { key: MYTH_TOWER_PARTS, url: MYTH_TOWER_PARTS_FILE },
        { key: MYTH_FLOOR_IMAGE, url: MYTH_FLOOR_FILE },
        { key: MYTH_FLOOR_ORB, url: MYTH_FLOOR_ORB_FILE },
        ...OPPONENT_ART.map((id) => ({ key: opponentArtKey(id), url: opponentArtFile(id) })),
      ];
    case 'title':
      return [{ key: TITLE_IMAGE, url: TITLE_FILE }];
    case 'birth':
      return Object.entries(BIRTH_FILES).map(([n, file]) => ({ key: birthKey(n as keyof typeof BIRTH_FILES), url: `assets/birth/${file}` }));
    case 'home': {
      const place = homePlace();
      return [
        ...(place ? [{ key: homeImageKey(place), url: homeImageFile(place) }] : []),
        ...HOME_ICONS.map((n) => ({ key: homeIconKey(n), url: `assets/home/icons/${n}.webp` })),
        { key: MEAT_KEY, url: `assets/home/${MEAT_FILE}` },
        { key: HAND_KEY, url: `assets/home/${HAND_FILE}` },
      ];
    }
    case 'rooms':
      return HOME_PLACES.flatMap((p) => [
        { key: homeImageKey(p), url: homeImageFile(p) },
        { key: homeImageKey(p, true), url: homeImageFile(p, true) },
      ]);
    case 'compare':
      return [{ key: REFERENCE_ORIGINAL, url: REFERENCE_FILES.original }];
    case 'minigame':
      return [{ key: SELECT_IMAGE, url: 'assets/minigame/select.webp' }, ...Object.values(SELECT_CARD_ART).map((a) => ({ key: a.key, url: a.file }))];
    case 'card':
      return Object.entries(CARD_IMAGES).map(([key, file]) => ({ key, url: `assets/minigame/${file}` }));
    case 'dash':
      return [
        { key: DASH_BG_KEY, url: DASH_BG_FILE },
        { key: DASH_PLAT_KEY, url: DASH_PLAT_FILE },
        { key: DASH_SPIKE_KEY, url: DASH_SPIKE_FILE },
        { key: DASH_RUN_KEY, url: DASH_RUN_FILE },
        { key: DASH_JUMP_KEY, url: DASH_JUMP_FILE },
        { key: DASH_LOGO_KEY, url: DASH_LOGO_FILE },
      ];
    case 'slugger':
      return [
        { key: SLUGGER_BG_KEY, url: SLUGGER_BG_FILE },
        { key: SLUGGER_LOGO_KEY, url: SLUGGER_LOGO_FILE },
        ...Object.keys(SLUG_BATTER_ART).map((p) => ({ key: slugBatterKey(p as keyof typeof SLUG_BATTER_ART), url: `assets/minigame/slug_batter_${p}.webp` })),
        ...Object.keys(SLUG_PITCHER_ART).map((p) => ({ key: slugPitcherKey(p as keyof typeof SLUG_PITCHER_ART), url: `assets/minigame/slug_pitcher_${p}.webp` })),
      ];
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
