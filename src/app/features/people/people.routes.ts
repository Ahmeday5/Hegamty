import { Routes } from '@angular/router';
import { PersonKind } from './people.models';

/**
 * Same two screens for every people kind. `data.kind` is bound straight into
 * the components' `kind` input (router `withComponentInputBinding`), and
 * `paramsInheritanceStrategy: 'always'` lets the child routes see it.
 */
export function peopleRoutes(kind: PersonKind): Routes {
  return [
    {
      path: '',
      data: { kind },
      children: [
        {
          path: '',
          loadComponent: () =>
            import('./pages/people-list/people-list.component').then((m) => m.PeopleListComponent),
        },
        {
          path: ':id',
          loadComponent: () =>
            import('./pages/person-detail/person-detail.component').then((m) => m.PersonDetailComponent),
        },
      ],
    },
  ];
}
