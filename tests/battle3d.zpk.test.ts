import { describe, expect, it } from 'vitest';
import { instinctFor } from '../src/core/autobattle/engine';
import { ANIME } from '../src/core/battle3d/animeConfig';
import { animeFinished, giveCommand, newAnimeBattle, stepAnime, type AnimeEntrant, type AnimeEvent } from '../src/core/battle3d/anime';
import { getTech, learnset } from '../src/core/battle3d/techTable';
import { growTechs } from '../src/core/battle3d/techLearn';
import { LOST_TEMPLE } from '../src/core/battle3d/arena';

// ZIPP・PUNI・KLAK の技(2026-11-03 企画者「送ったモンスターも技をつけてほしい」。中身は技リスト案から【仮】)
const st = { hp: 30, power: 30, tough: 30, speed: 12, tech: 16 };
const e = (species: string, techs: string[], form = 1): AnimeEntrant => ({ name: species, species, stats: st, instinct: instinctFor('bunk', st), proficiency: { attack: 2, defense: 2, evasion: 2, counter: 2, spacing: 2 }, techs, form } as AnimeEntrant);
const run = (b: ReturnType<typeof newAnimeBattle>, sec: number) => {
  const ev: AnimeEvent[] = [];
  for (let i = 0; i < sec / ANIME.dt && !animeFinished(b); i++) { b.events = []; stepAnime(b, ANIME.dt); ev.push(...b.events); }
  return ev;
};

describe('ZIPP・PUNI・KLAK の技', () => {
  for (const sp of ['zipp', 'puni', 'klak']) {
    it(`${sp}: 17技・どの技も使える`, () => {
      const rows = learnset(sp);
      expect(rows).toHaveLength(17);
      for (const r of rows) {
        const b = newAnimeBattle(e(sp, [r.name], 3), e('bunk', [], 1), 3, 'manual');
        b.f[0].x = -3; b.f[1].x = 3;
        b.f[1].thinkT = 1e9;
        b.f[1].cooldown.dodge = 1e9;
        giveCommand(b, 0, r.name);
        const ev = run(b, 3);
        expect(ev.some((x) => x.kind === 'call' || x.kind === 'hit' || x.kind === 'heal' || x.kind === 'buff'), r.name).toBe(true);
        expect(getTech(r.name).power).toBeGreaterThanOrEqual(0);
      }
    });
    it(`${sp}: Lv.1・30・60 で自動の技えらび → 試合が終わる`, () => {
      for (const lv of [1, 30, 60]) {
        const form = lv >= 60 ? 3 : lv >= 30 ? 2 : 1;
        const g = growTechs(sp, lv, st as never, undefined, instinctFor('bunk', st)).state.equipped;
        expect(g.length).toBeGreaterThan(0);
        const b = newAnimeBattle(e(sp, g, form), e('bunk', growTechs('bunk', lv, st as never, undefined, instinctFor('bunk', st)).state.equipped, form), lv, 'auto', LOST_TEMPLE);
        run(b, 200);
        expect(animeFinished(b)).toBe(true);
      }
    });
  }
  it('防御ダウン: 受けるダメージが上がる(装甲砕き音波)', () => {
    expect(getTech('装甲砕き音波').effect).toBe('防御ダウン');
    const b = newAnimeBattle(e('klak', ['装甲砕き音波'], 2), e('bunk', [], 1), 5, 'manual');
    b.f[0].x = -2; b.f[1].x = 2;
    b.f[1].thinkT = 1e9; b.f[1].cooldown.dodge = 1e9;
    giveCommand(b, 0, '装甲砕き音波');
    const ev = run(b, 3);
    expect(ev.some((x) => x.kind === 'status' && x.effect === '防御ダウン')).toBe(true);
    expect(b.f[1].defDownUntil).toBeGreaterThan(b.t);
  });
});

describe('ZIPP らしい動き (2026-11-03 企画者)', () => {
  const setup = (form = 1) => {
    const b = newAnimeBattle(e('zipp', ['ジップタックル', '閃走ラッシュ', 'ジグザグスピン'], form), e('bunk', [], 1), 7, 'manual');
    b.f[0].pad = { x: 0, z: 0 };
    b.f[0].techMode = 'manual';
    b.f[1].thinkT = 1e9; b.f[1].cooldown.dodge = 1e9; b.f[1].pad = { x: 0, z: 0 };
    return b;
  };
  it('電撃ダッシュ: ためた分 遠くへ走る・ためるほど強い', () => {
    const go = (hold: number) => {
      const b = setup();
      b.f[0].x = -12; b.f[1].x = 12; b.f[0].z = b.f[1].z = 0;
      b.f[0].hold = true;
      giveCommand(b, 0, 'punch');
      run(b, hold);
      b.f[0].hold = false;
      const x0 = b.f[0].x;
      run(b, 1);
      return b.f[0].x - x0;
    };
    const tap = go(0.05);
    const full = go(1.2);
    expect(tap).toBeGreaterThan(2);
    expect(tap).toBeLessThan(3.5);
    expect(full).toBeGreaterThan(5.5);
  });
  it('電撃ダッシュ: 当たる・ためたほうがダメージが大きい', () => {
    const dmg = (hold: number) => {
      const b = setup();
      b.f[0].x = -1.6; b.f[1].x = 1.6; b.f[0].z = b.f[1].z = 0; b.f[0].z = b.f[1].z = 0;
      b.f[0].hold = true;
      giveCommand(b, 0, 'punch');
      run(b, hold);
      b.f[0].hold = false;
      const ev = run(b, 1);
      const h = ev.find((x) => x.kind === 'hit');
      return h && h.kind === 'hit' ? h.damage : 0;
    };
    const a = dmg(0.05);
    const c = dmg(1.2);
    expect(a).toBeGreaterThan(0);
    expect(c).toBeGreaterThan(a);
  });
  it('ジグザグ: 回転は 左右にぶれながら進む', () => {
    const b = setup();
    b.f[0].x = -6; b.f[1].x = 6; b.f[0].z = b.f[1].z = 0;
    giveCommand(b, 0, 'ジグザグスピン');
    let maxZ = 0, minZ = 0;
    for (let i = 0; i < 1.2 / ANIME.dt; i++) { b.events = []; stepAnime(b, ANIME.dt); maxZ = Math.max(maxZ, b.f[0].z); minZ = Math.min(minZ, b.f[0].z); }
    expect(maxZ).toBeGreaterThan(0.3);
    expect(minZ).toBeLessThan(-0.3);
  });
  it('連続攻撃: 1発ごとに 相手のまわりへ 回りこむ', () => {
    const b = setup();
    b.f[0].x = -1.6; b.f[1].x = 1.6; b.f[0].z = b.f[1].z = 0;
    giveCommand(b, 0, '閃走ラッシュ');
    const ev = run(b, 2.5);
    expect(ev.filter((x) => x.kind === 'blink').length).toBeGreaterThanOrEqual(2);
    expect(ev.filter((x) => x.kind === 'hit').length).toBeGreaterThanOrEqual(2);
  });
});

describe('PUNI・KLAK の通常攻撃 (2026-11-03 企画者)', () => {
  const setup = (sp: string, form = 1) => {
    const b = newAnimeBattle(e(sp, [], form), e('bunk', [], 1), 9, 'manual');
    b.f[0].pad = { x: 0, z: 0 }; b.f[0].techMode = 'manual';
    b.f[1].thinkT = 1e9; b.f[1].cooldown.dodge = 1e9; b.f[1].pad = { x: 0, z: 0 }; b.f[1].techMode = 'manual';
    b.f[0].z = b.f[1].z = 0;
    return b;
  };
  it('PUNI: 水の玉は1発だけ・進化するほど遠くまで とどく', () => {
    const reach = (form: number, gap: number) => {
      const b = setup('puni', form);
      b.f[0].x = -gap / 2; b.f[1].x = gap / 2;
      giveCommand(b, 0, 'punch');
      const ev = run(b, 2);
      return ev.filter((x) => x.kind === 'hit').length;
    };
    expect(reach(1, 6)).toBe(1);
    expect(reach(1, 10)).toBe(0);
    expect(reach(2, 10)).toBe(1);
    expect(reach(3, 13)).toBe(1);
  });
  it('KLAK: 前に置いた罠を ふむと はさまれて 動けない', () => {
    const b = setup('klak', 1);
    b.f[0].x = -3; b.f[1].x = 3;
    giveCommand(b, 0, 'punch');
    run(b, 0.8);
    expect(b.traps.length).toBe(1);
    const tp = b.traps[0];
    expect(tp.x).toBeGreaterThan(-2);
    // 相手が 罠の上へ歩いてくる
    b.f[1].pad = { x: -1, z: 0 };
    let snapped = false;
    for (let i = 0; i < 3 / ANIME.dt && !snapped; i++) { b.events = []; stepAnime(b, ANIME.dt); snapped = b.events.some((x) => x.kind === 'trapSnap'); }
    expect(snapped).toBe(true);
    const f1 = b.f[1];
    const x0 = f1.x;
    b.f[1].pad = { x: 1, z: 0 };
    // 少しのあいだ 動けない
    run(b, 0.5);
    expect(Math.abs(f1.x - x0)).toBeLessThan(0.3);
  });
  it('KLAK: 待ち時間は長め(パンチより長い)・進化すると たくさん置ける', () => {
    const b = setup('klak', 3);
    b.f[0].x = -6; b.f[1].x = 8;
    giveCommand(b, 0, 'punch');
    run(b, 0.6);
    expect(b.f[0].cooldown.punch - b.t).toBeGreaterThan(1.5);
    for (let i = 0; i < 3; i++) { b.f[0].cooldown.punch = 0; b.f[0].x -= 2.5; giveCommand(b, 0, 'punch'); run(b, 0.6); }
    expect(b.traps.filter((t) => t.owner === 0).length).toBe(3);
  });
});

describe('ZIPP: 電撃ダッシュの とちゅうで やられても また使える(2026-11-03 企画者「ジップ攻撃打てなくなった」)', () => {
  it('ためている間に攻撃を受けても、あとで また出せる', () => {
    const b = newAnimeBattle(e('zipp', [], 1), e('bunk', ['バンクバッシュ'], 1), 11, 'manual');
    b.f[0].pad = { x: 0, z: 0 }; b.f[0].techMode = 'manual';
    b.f[1].thinkT = 1e9; b.f[1].cooldown.dodge = 1e9; b.f[1].pad = { x: 0, z: 0 }; b.f[1].techMode = 'manual';
    b.f[0].x = -3; b.f[1].x = 3; b.f[0].z = b.f[1].z = 0;
    b.f[0].hold = true;
    giveCommand(b, 0, 'punch');
    run(b, 0.2);
    giveCommand(b, 1, 'バンクバッシュ');
    run(b, 3);
    b.f[0].hold = false;
    run(b, 1);
    expect(giveCommand(b, 0, 'punch')).toBe(true);
  });
});

describe('技ごとの とくべつな動き (2026-11-03 企画者「そのキャラにあった技を」)', () => {
  const duel = (sp: string, techs: string[], foeTechs: string[] = [], gap = 6) => {
    const b = newAnimeBattle(e(sp, techs, 3), e('bunk', foeTechs, 1), 13, 'manual');
    for (const f of b.f) { f.pad = { x: 0, z: 0 }; f.techMode = 'manual'; f.thinkT = 1e9; f.cooldown.dodge = 1e9; f.z = 0; }
    b.f[0].x = -gap / 2; b.f[1].x = gap / 2;
    b.f[1].maxHp = b.f[1].hp = 999;
    return b;
  };
  const use = (b: ReturnType<typeof duel>, side: 0 | 1, id: string, sec: number) => { giveCommand(b, side, id); return run(b, sec); };
  const hits = (ev: AnimeEvent[], side = 0) => ev.filter((x) => x.kind === 'hit' && x.side === side).length;

  it('稲妻マーキング: 予告のあと落雷。動かなければ当たる', () => {
    const b = duel('zipp', ['稲妻マーキング']);
    const ev = use(b, 0, '稲妻マーキング', 2);
    expect(ev.some((x) => x.kind === 'pillar' && x.look === 'bolt')).toBe(true);
    expect(hits(ev)).toBe(1);
  });
  it('天網雷獄: 何度も落雷', () => {
    const b = duel('zipp', ['天網雷獄']);
    const ev = use(b, 0, '天網雷獄', 3);
    expect(ev.filter((x) => x.kind === 'pillar').length).toBe(6);
  });
  it('千閃雷走: 相手を つきぬけて 何回も当たる', () => {
    const b = duel('zipp', ['千閃雷走']);
    const ev = use(b, 0, '千閃雷走', 4);
    expect(hits(ev)).toBeGreaterThanOrEqual(2);
  });
  it('雷走ブレイカー: 走ったあとに 電気の線', () => {
    const b = duel('zipp', ['雷走ブレイカー'], [], 14);
    use(b, 0, '雷走ブレイカー', 1.5);
    expect(b.fields.some((fl) => fl.shape === 'line')).toBe(true);
  });
  it('閃電三連・雷針スパーク: 3つ いっせいに出る', () => {
    for (const id of ['閃電三連', '雷針スパーク']) {
      const b = duel('zipp', [id], [], 12);
      giveCommand(b, 0, id);
      let most = 0;
      for (let i = 0; i < 0.8 / ANIME.dt; i++) { b.events = []; stepAnime(b, ANIME.dt); most = Math.max(most, b.shots.filter((s) => s.owner === 0).length); }
      expect(most, id).toBe(3);
    }
  });
  it('ぷにタッチ: のびて つつく(近くだけ)', () => {
    expect(hits(use(duel('puni', ['ぷにタッチ'], [], 3.6), 0, 'ぷにタッチ', 1))).toBe(1);
    expect(hits(use(duel('puni', ['ぷにタッチ'], [], 10), 0, 'ぷにタッチ', 1))).toBe(0);
  });
  it('ぷにバウンド: 何回もはねて着地する', () => {
    const ev = use(duel('puni', ['ぷにバウンド'], [], 4), 0, 'ぷにバウンド', 4);
    expect(ev.filter((x) => x.kind === 'impact').length).toBe(3);
  });
  it('ぽよん三重波: 波の輪が3つ', () => {
    const b = duel('puni', ['ぽよん三重波'], [], 4);
    giveCommand(b, 0, 'ぽよん三重波');
    let most = 0;
    for (let i = 0; i < 2 / ANIME.dt; i++) { b.events = []; stepAnime(b, ANIME.dt); most = Math.max(most, b.quakes.length); }
    expect(most).toBe(3);
  });
  it('ぷにぷに防壁: 弾を はね返す', () => {
    const b = duel('puni', ['ぷにぷに防壁'], ['ポンポンショット'], 10);
    use(b, 0, 'ぷにぷに防壁', 0.3);
    giveCommand(b, 1, 'ポンポンショット');
    run(b, 1.5);
    expect(b.f[1].hp).toBeLessThan(999);
  });
  it('万象ねむりぷに玉(2026-11-05 万象ぷにドーム から): 相手へ 撃つ 玉・当たると 必ず ねむる', () => {
    const b = duel('puni', ['万象ねむりぷに玉'], [], 6);
    use(b, 0, '万象ねむりぷに玉', 2);
    expect(b.f[1].hp).toBeLessThan(999);
    expect(b.f[1].sleepUntil).toBeGreaterThan(0);
  });
  it('ぷにっと吸引: 当たると 引きよせる', () => {
    const b = duel('puni', ['ぷにっと吸引'], [], 6);
    const d0 = Math.abs(b.f[1].x - b.f[0].x);
    use(b, 0, 'ぷにっと吸引', 1.5);
    expect(Math.abs(b.f[1].x - b.f[0].x)).toBeLessThan(d0 - 1);
  });
  it('ぽよん玉: 山なりに飛んで はねる', () => {
    const b = duel('puni', ['ぽよん玉'], [], 14);
    giveCommand(b, 0, 'ぽよん玉');
    let top = 0;
    for (let i = 0; i < 1 / ANIME.dt; i++) { b.events = []; stepAnime(b, ANIME.dt); for (const s of b.shots) top = Math.max(top, s.y); }
    expect(top).toBeGreaterThan(1.3);
  });
  it('時限ボム: 止まって 少しあとに 爆発', () => {
    const b = duel('klak', ['時限ボム'], [], 7);
    const ev = use(b, 0, '時限ボム', 3);
    expect(hits(ev)).toBe(1);
  });
  it('千機包囲網: まわりの砲台から 何発も', () => {
    const ev = use(duel('klak', ['千機包囲網'], [], 6), 0, '千機包囲網', 3);
    expect(hits(ev)).toBeGreaterThanOrEqual(3);
  });
  it('連鎖トラップ: 1つ ふむと 全部作動', () => {
    const b = duel('klak', ['連鎖トラップ'], [], 8);
    use(b, 0, '連鎖トラップ', 0.8);
    expect(b.traps.length).toBe(3);
    b.f[1].pad = { x: -1, z: 0 };
    const ev = run(b, 3);
    expect(ev.filter((x) => x.kind === 'trapSnap').length).toBe(1);
    expect(ev.filter((x) => x.kind === 'pillar' && x.look === 'stake').length).toBe(2);
  });
  it('精密包囲陣・終端狙撃陣: 予告のあと 当たる', () => {
    expect(hits(use(duel('klak', ['精密包囲陣']), 0, '精密包囲陣', 2.5))).toBe(1);
    expect(hits(use(duel('klak', ['終端狙撃陣']), 0, '終端狙撃陣', 3))).toBe(1);
  });
  it('十字ワイヤー: 十字の場', () => {
    const b = duel('klak', ['十字ワイヤー']);
    use(b, 0, '十字ワイヤー', 1);
    expect(b.fields.some((fl) => fl.shape === 'cross')).toBe(true);
  });
});

describe('のこりの技も それぞれ ちがう動き (2026-11-04 企画者「今の17技を全部ちがうように」)', () => {
  const duel = (sp: string, techs: string[], foeTechs: string[] = [], gap = 6) => {
    const b = newAnimeBattle(e(sp, techs, 3), e('bunk', foeTechs, 1), 17, 'manual');
    for (const f of b.f) { f.pad = { x: 0, z: 0 }; f.techMode = 'manual'; f.thinkT = 1e9; f.cooldown.dodge = 1e9; f.z = 0; }
    b.f[0].x = -gap / 2; b.f[1].x = gap / 2;
    b.f[1].maxHp = b.f[1].hp = 999;
    return b;
  };
  const use = (b: ReturnType<typeof duel>, side: 0 | 1, id: string, sec: number) => { giveCommand(b, side, id); return run(b, sec); };
  const hits = (ev: AnimeEvent[], side = 0) => ev.filter((x) => x.kind === 'hit' && x.side === side).length;

  it('ジップタックル: 消えて 目の前に あらわれて 当たる', () => {
    const ev = use(duel('zipp', ['ジップタックル'], [], 9), 0, 'ジップタックル', 1.2);
    expect(ev.some((x) => x.kind === 'blink')).toBe(true);
    expect(hits(ev)).toBe(1);
  });
  it('迅雷乱舞: 残像が 何回も当たる', () => {
    const ev = use(duel('zipp', ['迅雷乱舞'], [], 5), 0, '迅雷乱舞', 2);
    expect(hits(ev)).toBeGreaterThanOrEqual(3);
  });
  it('残光ステップ: よけるのが速くなる', () => {
    const b = duel('zipp', ['残光ステップ']);
    use(b, 0, '残光ステップ', 0.8);
    expect(b.f[0].blinkUntil ?? 0).toBeGreaterThan(b.t);
  });
  it('ぽよぽよ連弾: 何回も はねる', () => {
    const ev = use(duel('puni', ['ぽよぽよ連弾'], [], 30), 0, 'ぽよぽよ連弾', 2.5);
    expect(ev.filter((x) => x.kind === 'explode').length).toBeGreaterThanOrEqual(6);
  });
  it('ぷに分裂弾: とちゅうで 3つに分かれる', () => {
    const b = duel('puni', ['ぷに分裂弾'], [], 12);
    giveCommand(b, 0, 'ぷに分裂弾');
    let most = 0;
    for (let i = 0; i < 1.5 / ANIME.dt; i++) { b.events = []; stepAnime(b, ANIME.dt); most = Math.max(most, b.shots.filter((s) => s.owner === 0).length); }
    expect(most).toBe(3);
  });
  it('ぷるんガード: 攻撃してきた相手を はね飛ばす', () => {
    const b = duel('puni', ['ぷるんガード'], ['バンクバッシュ'], 4);
    use(b, 0, 'ぷるんガード', 0.3);
    const x0 = b.f[1].x;
    giveCommand(b, 1, 'バンクバッシュ');
    run(b, 1.2);
    expect(b.f[1].x).toBeGreaterThan(x0 - 1);
  });
  it('ぷにトラップ: ふむと くっつく', () => {
    const b = duel('puni', ['ぷにトラップ'], [], 6);
    const ev = use(b, 0, 'ぷにトラップ', 1.5);
    expect(ev.some((x) => x.kind === 'status' && x.effect === 'くっついた')).toBe(true);
  });
  it('ぐにゃりスリップ: すべる', () => {
    const b = duel('puni', ['ぐにゃりスリップ'], [], 4);
    const ev = use(b, 0, 'ぐにゃりスリップ', 1.5);
    expect(ev.some((x) => x.kind === 'status' && x.effect === 'すべる')).toBe(true);
  });
  it('ぷに触手ドレイン: つないで 何回も吸う', () => {
    const b = duel('puni', ['ぷに触手ドレイン'], [], 5);
    b.f[0].hp = 50;
    const ev = use(b, 0, 'ぷに触手ドレイン', 2.5);
    expect(hits(ev)).toBeGreaterThanOrEqual(3);
    expect(b.f[0].hp).toBeGreaterThan(50);
  });
  it('挟撃スナップ: さいごに 前へ 放り上げる(2026-11-06 企画者「変なとこに飛ぶのやめて」→ うしろへ 移さない)', () => {
    const b = duel('klak', ['挟撃スナップ'], [], 2.4);
    const ev = use(b, 0, '挟撃スナップ', 2.5);
    expect(ev.some((x) => x.kind === 'impact')).toBe(true);
    // 相手は 前の 方に いる(うしろへ 一瞬で 移らない)・とびすぎない
    expect(b.f[1].x).toBeGreaterThan(b.f[0].x);
    expect(b.f[1].x - b.f[0].x).toBeLessThan(8);
  });
  it('重甲クラッシュ: 着地で 前へ 地割れ', () => {
    const ev = use(duel('klak', ['重甲クラッシュ'], [], 6), 0, '重甲クラッシュ', 2.5);
    expect(ev.filter((x) => x.kind === 'pillar' && x.look === 'rock').length).toBe(3);
  });
  it('鋏盾クランプ: 受けて はさみ返す', () => {
    const b = duel('klak', ['鋏盾クランプ'], ['バンクバッシュ'], 4);
    use(b, 0, '鋏盾クランプ', 0.3);
    giveCommand(b, 1, 'バンクバッシュ');
    const ev = run(b, 1.2);
    expect(hits(ev, 0)).toBe(1);
  });
  it('背面クランプ: うしろへ 回りこんで はさむ', () => {
    const b = duel('klak', ['背面クランプ'], [], 4);
    const ev = use(b, 0, '背面クランプ', 1);
    expect(hits(ev)).toBe(1);
    expect(b.f[0].x).toBeGreaterThan(b.f[1].x - 0.5);
  });
  it('装甲砕き音波: 守りを こわす', () => {
    const b = duel('klak', ['装甲砕き音波'], ['頑丈ドーム'], 4);
    use(b, 1, '頑丈ドーム', 0.3);
    use(b, 0, '装甲砕き音波', 1.5);
    expect(b.f[1].barrierUntil).toBeLessThanOrEqual(b.t);
  });
  it('照準ライン: 撃っている間も 追いかける', () => {
    const b = duel('klak', ['照準ライン'], [], 8);
    giveCommand(b, 0, '照準ライン');
    let tracked = false;
    for (let i = 0; i < 1.5 / ANIME.dt; i++) { b.events = []; stepAnime(b, ANIME.dt); if (b.beams[0]?.track) tracked = true; }
    expect(tracked).toBe(true);
  });
});

describe('どの技も 出したあと また動ける (2026-11-04 企画者「背面クランプ使ったら動かなくなる」)', () => {
  for (const sp of ['zipp', 'puni', 'klak', 'bunk', 'mofu']) {
    it(`${sp}: 17技 すべて 8秒以内に 技が終わる`, () => {
      for (const r of learnset(sp)) {
        for (const gap of [3, 8]) {
          const b = newAnimeBattle(e(sp, [r.name], 3), e('bunk', [], 1), 21, 'manual');
          for (const f of b.f) { f.pad = { x: 0, z: 0 }; f.techMode = 'manual'; f.thinkT = 1e9; f.cooldown.dodge = 1e9; f.z = 0; }
          b.f[0].x = -gap / 2; b.f[1].x = gap / 2;
          b.f[1].maxHp = b.f[1].hp = 999;
          giveCommand(b, 0, r.name);
          run(b, 0.2);
          let free = false;
          for (let i = 0; i < 8 / ANIME.dt && !free; i++) { b.events = []; stepAnime(b, ANIME.dt); free = b.f[0].act.k === 'free'; }
          expect(free, `${r.name} (${gap}m)`).toBe(true);
        }
      }
    });
  }
});
