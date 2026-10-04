import { Pipe, PipeTransform } from '@angular/core';
import { durationMeta } from './packages.models';

/** `{{ p.durationDays | packageDuration }}` — "ربع سنوية" · "سنوية" · "45 يوم". */
@Pipe({ name: 'packageDuration', standalone: true })
export class PackageDurationPipe implements PipeTransform {
  transform(days: number | null | undefined): string {
    return days ? durationMeta(days).label : '—';
  }
}

export const PACKAGE_PIPES = [PackageDurationPipe] as const;
