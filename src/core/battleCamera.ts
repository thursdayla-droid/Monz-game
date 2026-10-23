/**
 * バトルの自動ズームカメラ(企画者の仕様 2026-10-23、docs/BATTLE.md 11章)の計算。Phaserに依存しない。
 * - 戦っている全員が映るように、近いとズームイン、離れるとズームアウト
 * - ジャンプ・吹っ飛びに合わせて上下にもついていく
 * - なめらかに動く(smoothCamera)
 * - HP・ボタンなどの表示はズームしない(画面の側で別のカメラに映す)
 * 数字はすべて【仮】。座標はバトルの世界の座標(下が +y)
 */
import { MOVE, type Stage } from './battle';

export interface CameraView {
  /** 映す所のまん中 */
  x: number;
  y: number;
  /** 倍率(1 = 世界の1pxが画面の1px) */
  zoom: number;
}

export const CAMERA = {
  /** いちばん寄ったとき・いちばん引いたとき */
  maxZoom: 1.2,
  minZoom: 0.5,
  /** キャラクターのまわりのゆとり(世界のpx) */
  padX: 230,
  padTop: 200,
  padBottom: 120,
  /**
   * 画面の上の HP の表示と、下のボタン・スティックに キャラクターが隠れにくいように、
   * 画面の上下のこれだけの割合はあけて、その間にキャラクターを入れる
   */
  topReserve: 0.2,
  bottomReserve: 0.25,
  /** 寄る速さ・引く速さ・動く速さ(大きいほど速い)。引くのは速く、寄るのはゆっくり(酔わないように) */
  zoomInRate: 2.2,
  zoomOutRate: 6,
  moveRate: 7,
  /** これより小さい倍率の変化は無視する(小さくゆれないように) */
  zoomDeadband: 0.015,
};

/** カメラが映してよい世界の範囲(場外も少し見える。これより外は映さない) */
export function cameraBounds(stage: Stage): { x0: number; x1: number; y0: number; y1: number } {
  const b = stage.blast;
  return { x0: b.x0 + 80, x1: b.x1 - 80, y0: b.y0 + 60, y1: b.y1 - 120 };
}

/** ステージぜんたいが見える倍率(いちばん引いたときの目安) */
export function stageZoom(stage: Stage, screenW: number, screenH: number): number {
  const xs = stage.platforms.flatMap((p) => [p.x0, p.x1]);
  const w = Math.max(...xs) - Math.min(...xs) + CAMERA.padX * 2;
  const ys = stage.platforms.map((p) => p.y);
  const h = Math.max(...ys) - Math.min(...ys) + CAMERA.padTop + CAMERA.padBottom + MOVE.height;
  return Math.min(screenW / w, screenH / h);
}

/**
 * 映したい所(目標)。points: 場にいるキャラクターの足元。いなければ、ステージ全体
 * screenW/H: 画面の大きさ(ズームしないときの1280×720)
 */
export function cameraTarget(points: { x: number; y: number }[], stage: Stage, screenW: number, screenH: number): CameraView {
  const bounds = cameraBounds(stage);
  const fit = stageZoom(stage, screenW, screenH);
  if (!points.length) {
    const xs = stage.platforms.flatMap((p) => [p.x0, p.x1]);
    const ys = stage.platforms.map((p) => p.y);
    return clampView({ x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, zoom: fit }, bounds, screenW, screenH);
  }
  // 全員を囲む四角(頭の上まで) + ゆとり
  const x0 = Math.min(...points.map((p) => p.x)) - CAMERA.padX;
  const x1 = Math.max(...points.map((p) => p.x)) + CAMERA.padX;
  const y0 = Math.min(...points.map((p) => p.y)) - MOVE.height - CAMERA.padTop;
  const y1 = Math.max(...points.map((p) => p.y)) + CAMERA.padBottom;
  // 画面の形(横長)に合わせて、入りきる倍率
  const band = 1 - CAMERA.topReserve - CAMERA.bottomReserve;
  let zoom = Math.min(screenW / (x1 - x0), (screenH * band) / (y1 - y0));
  zoom = Math.max(CAMERA.minZoom, Math.min(CAMERA.maxZoom, zoom));
  // あけた所の間のまん中に、囲んだ四角のまん中が来るようにする
  const bandMid = CAMERA.topReserve + band / 2;
  const y = (y0 + y1) / 2 - ((bandMid - 0.5) * screenH) / zoom;
  return clampView({ x: (x0 + x1) / 2, y, zoom }, bounds, screenW, screenH);
}

/** 映す所が、映してよい範囲から出ないようにする(範囲より広く映すときは、範囲のまん中) */
function clampView(v: CameraView, b: { x0: number; x1: number; y0: number; y1: number }, screenW: number, screenH: number): CameraView {
  const hw = screenW / v.zoom / 2;
  const hh = screenH / v.zoom / 2;
  const x = b.x1 - b.x0 <= hw * 2 ? (b.x0 + b.x1) / 2 : Math.max(b.x0 + hw, Math.min(b.x1 - hw, v.x));
  const y = b.y1 - b.y0 <= hh * 2 ? (b.y0 + b.y1) / 2 : Math.max(b.y0 + hh, Math.min(b.y1 - hh, v.y));
  return { x, y, zoom: v.zoom };
}

/** 今のカメラを、目標へなめらかに近づける(dt: 秒) */
export function smoothCamera(now: CameraView, target: CameraView, dt: number): CameraView {
  const ease = (rate: number) => 1 - Math.exp(-rate * dt);
  const dz = target.zoom - now.zoom;
  const zoom = Math.abs(dz) < CAMERA.zoomDeadband * now.zoom ? now.zoom : now.zoom + dz * ease(dz < 0 ? CAMERA.zoomOutRate : CAMERA.zoomInRate);
  const k = ease(CAMERA.moveRate);
  return { x: now.x + (target.x - now.x) * k, y: now.y + (target.y - now.y) * k, zoom };
}
