import * as Phaser from 'phaser';
import { audio } from '../audio/engine';
import { openSoundSettings } from './soundButton';
import { UI_FONT } from './paint';

/**
 * MYTHCLASH の設定(企画者 2026-11-01「設定もお願いします」)。タイトルの「設定」から開く。
 * - 音の設定(BGM・効果音。お世話画面と同じ)
 * - バトルの速さ(演出・待ち時間をまとめて速くする)【仮】3段階
 * この端末だけの設定なので、ブラウザに保存する(保存できなくても、ふつうの速さで遊べる)
 */
const KEY = 'monz:myth:settings';
export const BATTLE_SPEEDS = [
  { value: 1, label: 'ふつう' },
  { value: 1.5, label: 'はやい' },
  { value: 2, label: 'とても\nはやい' },
] as const;

interface MythSettings {
  battleSpeed: number;
}

function load(): MythSettings {
  try {
    const d = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? '{}') as Partial<MythSettings>;
    const s = Number(d.battleSpeed);
    return { battleSpeed: BATTLE_SPEEDS.some((x) => x.value === s) ? s : 1 };
  } catch {
    return { battleSpeed: 1 };
  }
}

function save(s: MythSettings): void {
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(s));
  } catch {
    /* 保存できなくても続ける */
  }
}

/** バトルの速さ(1 = ふつう) */
export const battleSpeed = (): number => load().battleSpeed;

export function openMythSettings(scene: Phaser.Scene): void {
  const { width, height } = scene.scale;
  const layer = scene.add.container(0, 0).setDepth(600);
  const stop = (_p: Phaser.Input.Pointer, _x: number, _y: number, ev: Phaser.Types.Input.EventData) => ev.stopPropagation();
  const shade = scene.add.rectangle(0, 0, width, height, 0x0d0614, 0.75).setOrigin(0, 0).setInteractive();
  shade.on('pointerdown', stop);
  layer.add(shade);
  const pw = Math.min(640, width - 40);
  const ph = 560;
  const px = (width - pw) / 2;
  const py = (height - ph) / 2;
  const panel = scene.add.graphics();
  panel.fillStyle(0x16101c, 0.96).fillRoundedRect(px, py, pw, ph, 28);
  panel.lineStyle(6, 0xc0182a, 1).strokeRoundedRect(px, py, pw, ph, 28);
  layer.add(panel);
  const text = (x: number, y: number, s: string, size: number, color = '#ffffff') =>
    scene.add.text(x, y, s, { fontFamily: UI_FONT, fontSize: `${size}px`, fontStyle: '900', color, align: 'center' }).setOrigin(0.5);
  layer.add(text(width / 2, py + 56, '設定', 46, '#ffd23a'));

  // 音の設定(お世話画面と同じ箱を上に開く)
  layer.add(text(width / 2, py + 140, '音', 30, '#d8c8e8'));
  const sound = text(width / 2, py + 200, '  BGM・効果音の音量  ', 32, '#16101c').setBackgroundColor('#ffd23a').setPadding(16, 10, 16, 12).setInteractive({ useHandCursor: true });
  sound.on('pointerdown', (p: Phaser.Input.Pointer, x: number, y: number, ev: Phaser.Types.Input.EventData) => {
    stop(p, x, y, ev);
    audio.unlock();
    audio.se('tap');
    openSoundSettings(scene);
    // 音の箱を、この設定の箱より手前に出す
    const top = scene.children.list[scene.children.list.length - 1] as Phaser.GameObjects.Container | undefined;
    top?.setDepth?.(610);
  });
  layer.add(sound);

  // バトルの速さ
  layer.add(text(width / 2, py + 290, 'バトルの速さ', 30, '#d8c8e8'));
  const chips: Phaser.GameObjects.Text[] = [];
  const paint = () => {
    const cur = battleSpeed();
    chips.forEach((c, i) => {
      const on = BATTLE_SPEEDS[i].value === cur;
      c.setBackgroundColor(on ? '#ffd23a' : '#3a2f45').setColor(on ? '#16101c' : '#ffffff');
    });
  };
  BATTLE_SPEEDS.forEach((sp, i) => {
    const cw = (pw - 60) / BATTLE_SPEEDS.length;
    const c = text(px + 30 + cw * i + cw / 2, py + 370, sp.label.replace('\n', ''), 28).setPadding(14, 12, 14, 14).setFixedSize(cw - 14, 0).setInteractive({ useHandCursor: true });
    c.on('pointerdown', (p: Phaser.Input.Pointer, x: number, y: number, ev: Phaser.Types.Input.EventData) => {
      stop(p, x, y, ev);
      save({ ...load(), battleSpeed: sp.value });
      audio.se('select');
      paint();
    });
    chips.push(c);
    layer.add(c);
  });
  paint();

  const close = text(width / 2, py + ph - 70, '  とじる  ', 36, '#16101c').setBackgroundColor('#ffd23a').setPadding(20, 10, 20, 12).setInteractive({ useHandCursor: true });
  close.on('pointerdown', (p: Phaser.Input.Pointer, x: number, y: number, ev: Phaser.Types.Input.EventData) => {
    stop(p, x, y, ev);
    audio.se('tap');
    layer.destroy();
  });
  layer.add(close);
}
