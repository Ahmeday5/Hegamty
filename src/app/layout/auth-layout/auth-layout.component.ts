import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { environment } from '../../../environments/environment';

interface BrandFeature {
  title: string;
  text: string;
  /** SVG path data, drawn on a 24×24 stroke grid. */
  paths: readonly string[];
}

/**
 * Chrome-less split-screen layout for /auth/* pages: animated brand
 * showcase on the inline-start side, the routed form on the other.
 * The brand panel collapses away below the `lg` breakpoint.
 */
@Component({
  selector: 'app-auth-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet],
  templateUrl: './auth-layout.component.html',
  styleUrl: './auth-layout.component.scss',
})
export class AuthLayoutComponent {
  protected readonly year = new Date().getFullYear();
  protected readonly version = environment.appVersion;

  protected readonly features: readonly BrandFeature[] = [
    {
      title: 'جدولة ذكية',
      text: 'حجوزات ومواعيد المعالجين متزامنة دائمًا.',
      paths: ['M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z', 'M16 3v4M8 3v4M4 11h16', 'm9 16 2 2 4-4'],
    },
    {
      title: 'ملفات المرضى',
      text: 'سجل كامل وملاحظات الجلسات والمتابعات.',
      paths: ['M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z', 'M14 3v5h5', 'M12 17.5s-3-1.8-3-3.9a1.6 1.6 0 0 1 3-.8 1.6 1.6 0 0 1 3 .8c0 2.1-3 3.9-3 3.9Z'],
    },
    {
      title: 'مؤشرات لحظية',
      text: 'الإيرادات والطاقة الاستيعابية والأداء في لمحة واحدة.',
      paths: ['M3 3v18h18', 'm7 14 4-4 3 3 5-6'],
    },
  ];
}
