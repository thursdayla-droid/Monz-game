import { NAME_MAX } from '../core/naming';

/**
 * 名前を入力する欄(ゲームの上に重ねる)。iPhone のキーボード(日本語入力も)がそのまま使えるよう、
 * ゲームの絵ではなく、ふつうの入力欄を使う。決定したら onDone に入力された文字を渡して消える。
 */
export function askName(defaultName: string, onDone: (name: string) => void): void {
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'position:fixed;left:0;right:0;bottom:0;top:0;display:flex;align-items:flex-start;justify-content:center;padding-top:14vh;z-index:20;pointer-events:none;';
  const card = document.createElement('div');
  card.style.cssText =
    'pointer-events:auto;width:min(86vw,420px);box-sizing:border-box;padding:18px 18px 16px;background:#fbf1dc;border:6px solid #16101c;border-radius:20px;box-shadow:6px 8px 0 #8a35e0;font-family:"Hiragino Sans","Noto Sans JP",system-ui,sans-serif;text-align:center;transform:rotate(-1.5deg);';
  const title = document.createElement('div');
  title.textContent = '名前をつけよう！';
  title.style.cssText = 'font-weight:900;font-size:24px;color:#16101c;margin-bottom:12px;';
  const input = document.createElement('input');
  input.type = 'text';
  input.value = defaultName;
  input.maxLength = NAME_MAX * 2;
  input.setAttribute('aria-label', '名前');
  input.autocomplete = 'off';
  input.style.cssText =
    'width:100%;box-sizing:border-box;font-size:24px;font-weight:900;padding:10px 12px;border:4px solid #16101c;border-radius:12px;background:#fff;color:#16101c;text-align:center;outline:none;-webkit-user-select:text;user-select:text;';
  const hint = document.createElement('div');
  hint.textContent = `${NAME_MAX}文字まで`;
  hint.style.cssText = 'font-size:13px;color:#5a4a66;margin:6px 0 12px;font-weight:700;';
  const ok = document.createElement('button');
  ok.textContent = 'けってい！';
  ok.style.cssText =
    'font-size:22px;font-weight:900;color:#16101c;background:#ffd23a;border:4px solid #16101c;border-radius:14px;padding:10px 28px;box-shadow:3px 4px 0 #16101c;';
  card.append(title, input, hint, ok);
  wrap.append(card);
  document.body.append(wrap);
  // 入力欄をタップしたときだけ選べるように(ゲーム全体は文字選択できない設定のため)
  input.addEventListener('focus', () => input.select());
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    input.blur();
    wrap.remove();
    onDone(input.value);
  };
  ok.addEventListener('click', finish);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.isComposing) finish();
  });
}
