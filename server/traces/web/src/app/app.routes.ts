// The dashboard's sections, each a page loaded when first opened. The server serves the app for each path here
// (`PAGES` in page.mjs) when a browser navigates to it; the same paths asked for as JSON are the API.
import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    title: 'Traces · Last Stand',
    loadComponent: () => import('./traces/traces-page').then((m) => m.TracesPage),
  },
  {
    path: 'players',
    title: 'Players · Last Stand',
    loadComponent: () => import('./players/players-page').then((m) => m.PlayersPage),
  },
  {
    path: 'reports',
    title: 'Bug reports · Last Stand',
    loadComponent: () => import('./reports/reports-page').then((m) => m.ReportsPage),
  },
  { path: '**', redirectTo: '' },
];
