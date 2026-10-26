import * as Phaser from 'phaser';

/** ゲームを表示している所(ブラウザの画面)の 横÷縦 */
export function viewRatio(scene: Phaser.Scene): number {
  const p = scene.scale.parentSize;
  const w = p?.width || globalThis.innerWidth || 720;
  const h = p?.height || globalThis.innerHeight || 1280;
  return w / h;
}

/**
 * 画面いっぱいに出すための、ゲームの大きさ(企画者 2026-10-26: MYTHCLASH のタイトル・バトルを全画面に)。
 * base の片方の長さはそのままにして、もう片方を画面の形に合わせてのばす(黒い帯が出ない)。
 * min・max で、のばしすぎ・ちぢめすぎを止める(その外は、これまでどおり帯が出る)
 */
export function fillSize(scene: Phaser.Scene, base: { w: number; h: number }, limit: { minRatio: number; maxRatio: number }): { w: number; h: number } {
  const r = Math.min(limit.maxRatio, Math.max(limit.minRatio, viewRatio(scene)));
  return r > base.w / base.h ? { w: Math.round(base.h * r), h: base.h } : { w: base.w, h: Math.round(base.w / r) };
}

/**
 * 画面の形が変わったら(スマホを回したなど) onChange を呼ぶ。画面を閉じたら止める
 */
export function watchViewport(scene: Phaser.Scene, onChange: () => void): void {
  let last = viewRatio(scene);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const handler = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      const r = viewRatio(scene);
      if (Math.abs(r - last) < 0.01) return;
      last = r;
      onChange();
    }, 200);
  };
  globalThis.addEventListener?.('resize', handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    clearTimeout(timer);
    globalThis.removeEventListener?.('resize', handler);
  });
}
