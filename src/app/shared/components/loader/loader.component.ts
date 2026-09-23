import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { LoaderService } from '../../../core/services/loader.service';

/** Global full-screen loading overlay, driven by `LoaderService`. Mount once near the app root. */
@Component({
  selector: 'app-loader',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './loader.component.html',
  styleUrl: './loader.component.scss',
})
export class LoaderComponent {
  protected readonly loader = inject(LoaderService);
}
