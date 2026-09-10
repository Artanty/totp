import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  createTotpSession,
  type TotpSession,
  type TotpSessionState,
} from '../core/totp-session.service';
import { getLogoUrl } from '../shared/logo.service';

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

declare const TOTP_GATE_VERSION: string | undefined;

@Component({
  selector: 'safe-totp-gate',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="gate">
      <div class="card">
        <img class="logo" [src]="logoUrl" alt="" *ngIf="logoUrl">
        <p class="subtitle">{{ mergedTexts.subtitle }}</p>

        <div class="boxes" *ngIf="inputVisible">
          <input
            *ngFor="let d of digits; let i = index; trackBy: trackByIndex"
            class="digit"
            [class.filled]="d !== ''"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            spellcheck="false"
            maxlength="1"
            [attr.aria-label]="'Digit ' + (i + 1)"
            [value]="d"
            [disabled]="loading"
            (input)="onInput(i, $event)"
            (keydown)="onKeyDown(i, $event)"
            (paste)="onPaste($event)"
          />
        </div>

        <div class="refresh" *ngIf="sessionState.ready && sessionState.stateFailed">
          <p>{{ mergedTexts.refreshMessage }}</p>
          <button class="refresh-btn" type="button" (click)="onRetry()">{{ mergedTexts.refreshButton }}</button>
        </div>

        <p class="error" *ngIf="errorText">{{ errorText }}</p>

        <div class="version">{{ gateVersion }}</div>
      </div>
    </div>
  `,
  styles: `
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
    .version {
      position: absolute;
      bottom: 4px;
      right: 4px;
      color: var(--text-muted, #8b93a7);
      font-size: 10px;
      line-height: 1.4;
      font-family: var(--font, inherit);
      user-select: none;
    }
  `,
  encapsulation: ViewEncapsulation.ShadowDom,
})
export class GateComponent implements OnChanges, OnDestroy {
  @Input() baseUrl = '';
  @Input() logo = '';
  @Input() texts: Partial<TotpGateTexts> = {};
  @Input() session: TotpSession | null = null;
  @Output() totpUnlocked = new EventEmitter<{ nonce?: string }>();

  digits: string[] = Array(DIGIT_COUNT).fill('');
  trackByIndex = (index: number): number => index;
  loading = false;
  errorText: string | null = null;
  sessionState: TotpSessionState = { ready: false, unlocked: false, stateFailed: false };
  logoUrl = '';
  gateVersion = TOTP_GATE_VERSION ?? '0.0.0.0.0.0';

  private internalSession: TotpSession | null = null;
  private activeSession: TotpSession | null = null;
  private unsubscribe: (() => void) | null = null;
  mergedTexts: TotpGateTexts = { ...DEFAULT_TEXTS };

  constructor(private el: ElementRef) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['texts']) {
      this.mergedTexts = { ...DEFAULT_TEXTS, ...this.texts };
      this.sessionState = this.activeSession?.getState() ?? this.sessionState;
    }
    if (changes['logo']) {
      this.logoUrl = this.logo || getLogoUrl();
    }
    if (changes['session']) {
      this.setupSession();
    }
    if (changes['baseUrl'] && this.baseUrl && !this.session) {
      this.setupSession();
    }
  }

  ngOnDestroy(): void {
    this.activeSession?.dispose();
    this.unsubscribe?.();
  }

  get inputVisible(): boolean {
    return this.sessionState.ready && !this.sessionState.unlocked && !this.sessionState.stateFailed;
  }

  get ready(): boolean {
    return this.sessionState.ready;
  }

  get unlocked(): boolean {
    return this.sessionState.unlocked;
  }

  get stateFailed(): boolean {
    return this.sessionState.stateFailed;
  }

  onInput(index: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const digits = input.value.replace(/\D/g, '').slice(0, 1);
    if (input.value !== digits) input.value = digits;
    this.digits[index] = digits;
    input.classList.toggle('filled', digits !== '');
    this.errorText = null;

    if (digits && index < DIGIT_COUNT - 1) {
      this.focusDigit(index + 1);
    }

    if (this.value.length === DIGIT_COUNT) {
      void this.onSubmit();
    }
  }

  onKeyDown(index: number, event: KeyboardEvent): void {
    if (event.key === 'Backspace' && !this.digits[index] && index > 0) {
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

  onPaste(event: ClipboardEvent): void {
    const text = event.clipboardData?.getData('text') ?? '';
    const parsed = (text.match(/\d/g) ?? []).slice(0, DIGIT_COUNT);
    if (!parsed.length) return;
    event.preventDefault();
    parsed.forEach((digit, i) => {
      this.digits[i] = digit;
    });
    const inputs = this.el.nativeElement.shadowRoot?.querySelectorAll('input.digit');
    inputs?.forEach((box: Element, i: number) => {
      const input = box as HTMLInputElement;
      input.value = this.digits[i];
      input.classList.toggle('filled', this.digits[i] !== '');
    });
    this.focusDigit(Math.min(DIGIT_COUNT - 1, parsed.length - 1));
    if (this.value.length === DIGIT_COUNT) {
      void this.onSubmit();
    }
  }

  onRetry(): void {
    this.activeSession?.retry();
  }

  retry(): void {
    this.onRetry();
  }

  lock(): void {
    this.activeSession?.lock();
  }

  private get value(): string {
    return this.digits.join('');
  }

  private focusDigit(index: number): void {
    const root = this.el.nativeElement.shadowRoot as ShadowRoot | undefined;
    if (!root) return;
    const inputs = root.querySelectorAll('input.digit');
    const input = inputs[index] as HTMLInputElement | undefined;
    input?.focus();
    input?.select();
  }

  private setupSession(): void {
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.internalSession?.dispose();
    this.internalSession = null;

    if (this.session) {
      this.activeSession = this.session;
    } else if (this.baseUrl) {
      const internal = createTotpSession({ baseUrl: this.baseUrl });
      this.internalSession = internal;
      this.activeSession = internal;
      void internal.init();
    } else {
      this.activeSession = null;
    }

    if (this.activeSession) {
      this.sessionState = this.activeSession.getState();
      this.unsubscribe = this.activeSession.onStateChange((state) => {
        this.sessionState = { ...state };
        if (state.unlocked) this.dispatchUnlocked();
      });
    } else {
      this.sessionState = { ready: false, unlocked: false, stateFailed: false };
    }
  }

  private dispatchUnlocked(): void {
    let nonce: string | undefined;
    try {
      nonce = localStorage.getItem('safe_totp_unlocked_nonce') ?? undefined;
    } catch {
      /* ignore */
    }
    this.totpUnlocked.emit({ nonce });
  }

  private async onSubmit(): Promise<void> {
    if (this.loading) return;
    if (!/^\d{6}$/.test(this.value)) {
      this.errorText = this.mergedTexts.invalid;
      return;
    }
    if (!this.activeSession) {
      this.errorText = this.mergedTexts.noConnection;
      return;
    }
    this.loading = true;
    this.errorText = null;
    try {
      const res = await this.activeSession.verify(this.value);
      if (res.valid) this.activeSession.unlock(res.nonce);
    } catch (err: unknown) {
      this.errorText = this.mapError(err);
    } finally {
      this.loading = false;
    }
  }

  private mapError(err: unknown): string {
    const e = err as { status?: number; error?: { code?: string } | null };
    const status = e?.status;
    const code = e?.error?.code;
    if (status === 401) return this.mergedTexts.wrongCode;
    if (status === 502) {
      if (code === 'TOTP_UNREACHABLE') return this.mergedTexts.totpUnreachable;
      if (code === 'TOTP_SERVER_ERROR') return this.mergedTexts.totpError;
      return this.mergedTexts.serverError;
    }
    if (status === 500) return this.mergedTexts.serverError;
    if (!status) return this.mergedTexts.noConnection;
    return this.mergedTexts.generic;
  }
}