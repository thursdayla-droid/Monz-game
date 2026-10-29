/**
 * 画像などの場所。ページの中に画像を埋め込んで配る確認用ページでは、
 * window.__MONZ_ASSETS に「ファイルの場所 → 埋め込んだ画像」が入っているので、そちらを使う。
 */
declare global {
  interface Window {
    __MONZ_ASSETS?: Record<string, string>;
    __MONZ_JSON?: Record<string, unknown>;
    /** 確認用ページで、最初に開く画面(MYTHCLASH の確認用ページは 'MythTitle'。2026-10-29) */
    __MONZ_START?: string;
    /** 確認用ページで、カードの絵を入れていない(ゲームの確認用ページ。カードの絵は MYTHCLASH の確認用ページに入れる。2026-10-29) */
    __MONZ_NO_CARD_ART?: boolean;
  }
}

export const assetUrl = (path: string): string => window.__MONZ_ASSETS?.[path] ?? path;
/** MYTHCLASH だけの確認用ページか(企画者 2026-10-29: 確認用ページを分ける) */
export const mythPreviewOnly = (): boolean => window.__MONZ_START === 'MythTitle';
export const embeddedJson = (path: string): unknown => window.__MONZ_JSON?.[path];
