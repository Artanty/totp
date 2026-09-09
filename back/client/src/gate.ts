import { createTotpSession, type TotpSession, type TotpSessionState } from './core';

export type TotpGateTexts = {
  subtitle: string;
  refreshMessage: string;
  refreshButton: string;
  invalid: string;
  wrongCode: string;
  totpUnreachable: string;
  totpError: string;
  serverError: string;
  noConnection: string;
  generic: string;
};

export const DEFAULT_TEXTS: TotpGateTexts = {
  subtitle: 'Введите код из аутентификатора',
  refreshMessage: 'Нет соединения с сервером',
  refreshButton: 'Обновить',
  invalid: 'Введите 6 цифр из аутентификатора',
  wrongCode: 'Неверный код',
  totpUnreachable: 'Сервер TOTP недоступен',
  totpError: 'Ошибка сервера TOTP',
  serverError: 'Ошибка на сервере',
  noConnection: 'Нет связи с сервером',
  generic: 'Не удалось проверить код. Попробуйте позже.',
};

const DIGIT_COUNT = 6;
const ELEMENT_NAME = 'safe-totp-gate';

declare const TOTP_GATE_VERSION: string | undefined;
const GATE_VERSION = TOTP_GATE_VERSION ?? '0.0.0.0.0.0';

const DEFAULT_LOGO = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" fill="none">
  <rect width="64" height="64" rx="14" fill="#2c6df6"/>
  <g transform="translate(10 1.75) scale(0.1833) translate(-60 -70)" fill="#fff">
    <path d="M90 400l180 0q13 0 21-9 9-8 9-21l0-150q0-13-9-21-8-9-21-9l0-30q-1-38-26-64-24-25-62-26-40 1-65 26-26 26-27 64l0 30q-13 0-21 9-9 8-9 21l0 150q0 13 9 21 8 9 21 9l0 0z m40-180l0-60q1-22 15-36 14-14 35-14 22 0 36 14 14 14 14 36l0 60-100 0z"/>
  </g>
</svg>`)}`;

export class TotpGateElement extends HTMLElement {
  static get observedAttributes(): string[] {
    return ['base-url', 'logo'];
  }

  static readonly tagName = ELEMENT_NAME;

  private readonly root: ShadowRoot;
  private boxes: string[] = Array(DIGIT_COUNT).fill('');
  private loading = false;
  private errorText: string | null = null;
  private detached = false;

  private _baseUrl = '';
  private _logo = '';
  private _texts: TotpGateTexts = DEFAULT_TEXTS;
  private _session: TotpSession | null = null;
  private _internalSession: TotpSession | null = null;
  private _sessionState: TotpSessionState = { ready: false, unlocked: false, stateFailed: false };

  private unsubscribe: (() => void) | null = null;
  private inputs: HTMLInputElement[] = [];
  private boxesHost!: HTMLDivElement;
  private refreshBlock!: HTMLDivElement;
  private refreshMsgEl!: HTMLParagraphElement;
  private errorEl!: HTMLParagraphElement;
  private logoEl!: HTMLImageElement;
  private subtitleEl!: HTMLParagraphElement;
  private retryBtn!: HTMLButtonElement;

  constructor() {
    super();
    this.root = this.attachShadow({ mode: 'open' });
    this.root.innerHTML = this.template();
    this.bindElements();
  }

  connectedCallback() {
    this.detached = false;
    if (!this._session && this._baseUrl) this.ensureInternalSession();
    this.render();
  }

  disconnectedCallback() {
    this.detached = true;
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue === newValue) return;
    if (name === 'base-url') this.baseUrl = newValue;
    else if (name === 'logo') this.logo = newValue;
  }

  get baseUrl(): string {
    return this._baseUrl;
  }

  set baseUrl(value: string) {
    this._baseUrl = value;
    this.ensureInternalSession();
    this.render();
  }

  get logo(): string {
    return this._logo;
  }

  set logo(value: string) {
    this._logo = value;
    if (this.logoEl) this.logoEl.src = value || DEFAULT_LOGO;
  }

  get texts(): TotpGateTexts {
    return this._texts;
  }

  set texts(value: TotpGateTexts) {
    this._texts = { ...DEFAULT_TEXTS, ...value };
    if (this.subtitleEl) this.subtitleEl.textContent = this._texts.subtitle;
    if (this.refreshMsgEl) this.refreshMsgEl.textContent = this._texts.refreshMessage;
    if (this.retryBtn) this.retryBtn.textContent = this._texts.refreshButton;
    this.render();
  }

  get session(): TotpSession | null {
    return this._session;
  }

  set session(value: TotpSession | null) {
    this._session = value;
    if (this._internalSession && value) {
      this._internalSession.dispose();
      this._internalSession = null;
    }
    this.setupSession();
    this.render();
  }

  get ready(): boolean {
    return this._sessionState.ready;
  }

  get unlocked(): boolean {
    return this._sessionState.unlocked;
  }

  get stateFailed(): boolean {
    return this._sessionState.stateFailed;
  }

  retry(): void {
    const session = this.getSession();
    if (session) session.retry();
  }

  lock(): void {
    const session = this.getSession();
    if (session) session.lock();
  }

  private getSession(): TotpSession | null {
    return this._session ?? this._internalSession ?? null;
  }

  private ensureInternalSession() {
    if (this._session || this._internalSession || !this._baseUrl) return;
    const internal = createTotpSession({ baseUrl: this._baseUrl });
    if (this._internalSession) return;
    this._internalSession = internal;
    this.setupSession();
    void internal.init();
  }

  private setupSession() {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    const session = this.getSession();
    if (!session) return;
    this.unsubscribe = session.onStateChange((state) => {
      this._sessionState = state;
      if (state.unlocked) this.dispatchUnlocked(session);
      if (!this.detached) this.render();
    });
    this._sessionState = session.getState();
  }

  private dispatchUnlocked(session: TotpSession) {
    const nonce = session.getState().unlocked ? this.readNonce() : undefined;
    this.dispatchEvent(
      new CustomEvent<{ nonce?: string }>('totp-unlocked', {
        bubbles: true,
        composed: true,
        detail: { nonce },
      }),
    );
  }

  private readNonce(): string | undefined {
    try {
      return localStorage.getItem('safe_totp_unlocked_nonce') ?? undefined;
    } catch {
      return undefined;
    }
  }

  private template(): string {
    return `
      <style>
        :host { display: block; height: 100%; }
        .gate {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100%;
          background: var(--bg, #0f1115);
        }
        .card {
          width: 300px;
          padding: 28px;
          border: 1px solid var(--border, #262b36);
          border-radius: 12px;
          background: var(--bg-widget, #141823);
          text-align: center;
          box-sizing: border-box;
          position: relative;
        }
        .logo {
          width: 56px;
          height: 56px;
          margin: 0 auto 8px;
          border-radius: 8px;
          display: block;
        }
        .subtitle {
          color: var(--text-muted, #8b93a7);
          font-size: 13px;
          margin: 0 0 20px;
          font-family: var(--font, inherit);
        }
        .boxes {
          display: flex;
          justify-content: center;
          gap: 8px;
        }
        .digit {
          width: 40px;
          height: 48px;
          font-size: 20px;
          text-align: center;
          border: 1px solid var(--border, #262b36);
          border-radius: 6px;
          background: var(--bg, #0f1115);
          color: var(--text, #e6e9f0);
          box-sizing: border-box;
          font-family: var(--font, inherit);
        }
        .digit.filled {
          border-color: color-mix(in srgb, var(--accent, #2c6df6) 45%, var(--border, #262b36));
        }
        .digit:focus {
          outline: none;
          border-color: var(--accent, #2c6df6);
          box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent, #2c6df6) 25%, transparent);
        }
        .digit:disabled { opacity: 0.5; }
        .error {
          color: #e5484d;
          font-size: 12px;
          margin: 12px 0 0;
          font-family: var(--font, inherit);
        }
        .refresh {
          font-size: 13px;
          color: var(--text-muted, #8b93a7);
          margin: 0;
          font-family: var(--font, inherit);
        }
        .refresh-btn {
          margin-top: 14px;
          padding: 8px 22px;
          font-size: 14px;
          border-radius: 6px;
          border: 1px solid var(--accent, #2c6df6);
          background: var(--bg-widget, #141823);
          color: var(--accent, #2c6df6);
          cursor: pointer;
          font-family: var(--font, inherit);
        }
        .refresh-btn:hover { background: var(--bg-hover, #1b2232); }
        .spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border, #262b36);
          border-top-color: var(--accent, #2c6df6);
          border-radius: 50%;
          margin: 0 auto 12px;
          animation: totp-spin 0.8s linear infinite;
        }
        @keyframes totp-spin { to { transform: rotate(360deg); } }
        .version {
          position: absolute;
          bottom: 8px;
          right: 14px;
          color: var(--text-muted, #8b93a7);
          font-size: 10px;
          line-height: 1.4;
          font-family: var(--font, inherit);
          user-select: none;
        }
        .hidden { display: none; }
      </style>
      <div class="gate">
        <div class="card">
          <img class="logo" alt="" hidden>
          <p class="subtitle"></p>
          <div class="boxes hidden">${Array.from({ length: DIGIT_COUNT }, (_, i) => {
            return `<input class="digit" type="text" inputmode="numeric" autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="1" aria-label="Digit ${i + 1}" data-index="${i}">`;
          }).join('')}</div>
          <div class="refresh hidden">
            <p class="refresh"></p>
            <button class="refresh-btn" type="button"></button>
          </div>
          <p class="error hidden"></p>
          <div class="version">${GATE_VERSION}</div>
        </div>
      </div>
    `;
  }

  private bindElements() {
    this.logoEl = this.root.querySelector<HTMLImageElement>('.logo')!;
    this.subtitleEl = this.root.querySelector<HTMLParagraphElement>('.subtitle')!;
    this.boxesHost = this.root.querySelector<HTMLDivElement>('.boxes')!;
    this.refreshBlock = this.root.querySelector<HTMLDivElement>('.refresh')!;
    this.refreshMsgEl = this.root.querySelector<HTMLParagraphElement>('.refresh')!;
    this.errorEl = this.root.querySelector<HTMLParagraphElement>('.error')!;
    this.retryBtn = this.root.querySelector<HTMLButtonElement>('.refresh-btn')!;
    this.inputs = Array.from(this.boxesHost.querySelectorAll<HTMLInputElement>('.digit'));

    this.logoEl.src = this._logo || DEFAULT_LOGO;
    this.subtitleEl.textContent = this._texts.subtitle;
    this.refreshMsgEl.textContent = this._texts.refreshMessage;
    this.retryBtn.textContent = this._texts.refreshButton;

    this.inputs.forEach((input, index) => {
      input.addEventListener('input', (event) => this.onInput(index, event));
      input.addEventListener('keydown', (event) => this.onKeyDown(index, event));
      input.addEventListener('paste', (event) => this.onPaste(event));
    });
    this.retryBtn.addEventListener('click', () => this.retry());
  }

  private focusDigit(index: number) {
    const input = this.inputs[index];
    input?.focus();
    input?.select();
  }

  private onInput(index: number, event: Event) {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 1);
    if (input.value !== digits) input.value = digits;
    this.boxes[index] = digits;
    this.errorEl.textContent = '';
    this.errorEl.classList.add('hidden');
    input.classList.toggle('filled', digits !== '');

    if (digits && index < DIGIT_COUNT - 1) {
      this.focusDigit(index + 1);
    }

    if (this.value.length === DIGIT_COUNT) {
      void this.onSubmit();
    }
  }

  private onKeyDown(index: number, event: KeyboardEvent) {
    if (event.key === 'Backspace' && !this.boxes[index] && index > 0) {
      event.preventDefault();
      this.focusDigit(index - 1);
    }
    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      this.focusDigit(index - 1);
    }
    if (event.key === 'ArrowRight' && index < DIGIT_COUNT - 1) {
      event.preventDefault();
      this.focusDigit(index + 1);
    }
  }

  private onPaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData('text') ?? '';
    const digits = (text.match(/\d/g) ?? []).slice(0, DIGIT_COUNT);
    if (!digits.length) return;
    event.preventDefault();
    digits.forEach((digit, i) => {
      this.boxes[i] = digit;
      const input = this.inputs[i];
      if (input) {
        input.value = digit;
        input.classList.toggle('filled', digit !== '');
      }
    });
    this.focusDigit(Math.min(DIGIT_COUNT - 1, digits.length - 1));
    if (this.value.length === DIGIT_COUNT) {
      void this.onSubmit();
    }
  }

  private get value(): string {
    return this.boxes.join('');
  }

  private async onSubmit() {
    if (this.loading) return;
    if (!/^\d{6}$/.test(this.value)) {
      this.errorText = this._texts.invalid;
      this.render();
      return;
    }
    const session = this.getSession();
    if (!session) {
      this.errorText = this._texts.noConnection;
      this.render();
      return;
    }
    this.loading = true;
    this.errorText = null;
    this.render();
    try {
      const res = await session.verify(this.value);
      if (res.valid) session.unlock(res.nonce);
    } catch (err: unknown) {
      this.errorText = this.mapError(err);
    } finally {
      this.loading = false;
      this.render();
    }
  }

  private mapError(err: unknown): string {
    const e = err as { status?: number; error?: { code?: string } | null };
    const status = e?.status;
    const code = e?.error?.code;
    if (status === 401) return this._texts.wrongCode;
    if (status === 502) {
      if (code === 'TOTP_UNREACHABLE') return this._texts.totpUnreachable;
      if (code === 'TOTP_SERVER_ERROR') return this._texts.totpError;
      return this._texts.serverError;
    }
    if (status === 500) return this._texts.serverError;
    if (!status) return this._texts.noConnection;
    return this._texts.generic;
  }

  private render() {
    if (this.detached || !this.root) return;
    const s = this._sessionState;
    const inputVisible = s.ready && !s.unlocked && !s.stateFailed;
    this.boxesHost.classList.toggle('hidden', !inputVisible);
    this.refreshBlock.classList.toggle('hidden', !(s.ready && s.stateFailed));
    this.inputs.forEach((input, i) => {
      input.disabled = this.loading;
      input.value = this.boxes[i];
      input.classList.toggle('filled', this.boxes[i] !== '');
    });
    if (this.errorText) {
      this.errorEl.textContent = this.errorText;
      this.errorEl.classList.remove('hidden');
    } else {
      this.errorEl.textContent = '';
      this.errorEl.classList.add('hidden');
    }
    if (inputVisible && !this.loading && !this._focused) {
      this.focusDigit(0);
    }
  }

  private get _focused(): boolean {
    return document.activeElement instanceof HTMLInputElement && this.inputs.includes(document.activeElement);
  }
}

if (typeof customElements !== 'undefined' && !customElements.get(ELEMENT_NAME)) {
  customElements.define(ELEMENT_NAME, TotpGateElement);
}

export function registerTotpGate(): void {
  if (typeof customElements !== 'undefined' && !customElements.get(ELEMENT_NAME)) {
    customElements.define(ELEMENT_NAME, TotpGateElement);
  }
}

export default TotpGateElement;