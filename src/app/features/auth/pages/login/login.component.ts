import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterNextRender,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../../../core/auth/services/auth.service';
import { ToastService } from '../../../../core/services/toast.service';
import { ApiError } from '../../../../core/models/api-response.model';
import { FormErrorComponent } from '../../../../shared/components/form-error/form-error.component';
import { PasswordInputComponent } from '../../../../shared/components/password-input/password-input.component';
import { DEFAULT_AUTHENTICATED_ROUTE } from '../../../../core/auth/auth.config';

@Component({
  selector: 'app-login',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, FormErrorComponent, PasswordInputComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly toast = inject(ToastService);

  private readonly emailInput = viewChild<ElementRef<HTMLInputElement>>('emailInput');

  /** Drives the in-button spinner — independent of the global page loader. */
  protected readonly isSubmitting = signal(false);
  /** Inline error displayed inside the form (no global toast for credential errors). */
  protected readonly serverError = signal<string | null>(null);
  /** Plays the card's shake animation once per failed attempt. */
  protected readonly shake = signal(false);
  protected readonly capsLockOn = signal(false);
  /** No self-service reset yet — reveals the "contact your admin" hint instead. */
  protected readonly showResetHint = signal(false);

  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(6)]],
    rememberMe: [true],
  });

  constructor() {
    // Focus the first field on pointer devices only — on touch screens it
    // would pop the virtual keyboard over the layout before the user asks.
    afterNextRender(() => {
      if (window.matchMedia('(pointer: fine)').matches) {
        this.emailInput()?.nativeElement.focus();
      }
    });
  }

  protected isInvalid(field: 'email' | 'password'): boolean {
    const ctrl = this.form.controls[field];
    return ctrl.invalid && ctrl.touched;
  }

  protected onPasswordKey(event: KeyboardEvent): void {
    if (typeof event.getModifierState === 'function') {
      this.capsLockOn.set(event.getModifierState('CapsLock'));
    }
  }

  /** Child entrance animations bubble here too — only the card's own shake counts. */
  protected onShakeEnd(event: AnimationEvent): void {
    if (event.target === event.currentTarget) this.shake.set(false);
  }

  protected toggleResetHint(): void {
    this.showResetHint.update((v) => !v);
  }

  protected onSubmit(): void {
    if (this.isSubmitting()) return;
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.triggerShake();
      return;
    }

    const { email, password, rememberMe } = this.form.getRawValue();

    this.serverError.set(null);
    this.isSubmitting.set(true);

    this.auth.login({ email, password, rememberMe }).subscribe({
      next: (user) => {
        this.isSubmitting.set(false);
        this.toast.success(`مرحبًا بعودتك، ${user.name}`);
        this.router.navigateByUrl(this.resolveReturnUrl());
      },
      error: (err: ApiError) => {
        this.isSubmitting.set(false);
        this.serverError.set(this.describeError(err));
        this.triggerShake();
      },
    });
  }

  private describeError(err: ApiError): string {
    if (!err || err.status === 0) {
      return 'تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت وحاول مرة أخرى.';
    }
    if (err.status === 401) {
      return err.message?.trim() || 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
    }
    return err.message?.trim() || 'حدث خطأ ما، يرجى المحاولة مرة أخرى.';
  }

  private triggerShake(): void {
    // Restart the animation even if the previous shake is still running.
    this.shake.set(false);
    requestAnimationFrame(() => this.shake.set(true));
  }

  private resolveReturnUrl(): string {
    const target = this.route.snapshot.queryParamMap.get('returnUrl');
    if (target && target.startsWith('/') && !target.startsWith('//')) {
      return target;
    }
    return DEFAULT_AUTHENTICATED_ROUTE;
  }
}
