import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TopbarComponent } from './topbar/topbar.component';
import { SidebarComponent } from './sidebar/sidebar.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';
import { LayoutService } from '../../core/services/layout.service';
import { BookingDetailDialogComponent } from '../../features/bookings/components/booking-detail-dialog/booking-detail-dialog.component';
import { BookingSheetService } from '../../features/bookings/booking-sheet.service';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, TopbarComponent, SidebarComponent, ConfirmDialogComponent, BookingDetailDialogComponent],
  templateUrl: './main-layout.component.html',
  styleUrl: './main-layout.component.scss',
})
export class MainLayoutComponent {
  protected readonly layout = inject(LayoutService);
  /** One booking sheet for the whole app — any page opens it through the service. */
  protected readonly bookingSheet = inject(BookingSheetService);
}
