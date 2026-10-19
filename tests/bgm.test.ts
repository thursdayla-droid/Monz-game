import { describe, expect, it } from 'vitest';
import { BGM_FILES } from '../src/audio/bgmFiles';

describe('bgm', () => {
  it('every registered song file exists', () => {
    const present = Object.keys(import.meta.glob('../public/assets/bgm/*.mp3')).map((p) => p.split('/').pop());
    for (const { file } of Object.values(BGM_FILES)) expect(present).toContain(file);
  });
});
