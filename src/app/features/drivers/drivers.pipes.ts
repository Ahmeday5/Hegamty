import { Pipe, PipeTransform } from '@angular/core';
import { DriverVehicle, vehicleColorLabel, vehicleSummary } from './drivers.models';

/** `{{ d.vehicle | vehicle }}` — "Toyota Corolla · أبيض". */
@Pipe({ name: 'vehicle', standalone: true })
export class VehiclePipe implements PipeTransform {
  transform(v: DriverVehicle): string {
    return vehicleSummary(v);
  }
}

/** `{{ d.vehicle.color | vehicleColor }}` — "grey" → "رمادي". */
@Pipe({ name: 'vehicleColor', standalone: true })
export class VehicleColorPipe implements PipeTransform {
  transform(color: string | null | undefined): string {
    return color ? vehicleColorLabel(color) : '—';
  }
}

export const DRIVER_PIPES = [VehiclePipe, VehicleColorPipe] as const;
