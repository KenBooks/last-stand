import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

/** The dashboard's frame: its name, a link to each section, and the section open. */
@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <header>
      <h1>Last Stand <span>dashboard</span></h1>
      <nav aria-label="Sections">
        @for (s of sections; track s.path) {
          <a [routerLink]="s.path" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }"
            ariaCurrentWhenActive="page">{{ s.label }}</a>
        }
      </nav>
    </header>
    <main><router-outlet /></main>
  `,
  styles: `
    header { max-width: 1240px; margin: 0 auto; padding: 20px 20px 0; display: flex; flex-wrap: wrap; gap: 8px 24px;
      align-items: baseline; }
    h1 { font-size: 20px; margin: 0; font-weight: 600; }
    h1 span { color: var(--accent); }
    nav { display: flex; gap: 4px; flex-wrap: wrap; }
    nav a { color: var(--dim); padding: 6px 12px; border-radius: 6px; border: 1px solid transparent; }
    nav a:hover { color: var(--text); text-decoration: none; border-color: var(--line); }
    nav a.on { color: var(--text); background: var(--panel); border-color: var(--line); }
    main { display: block; max-width: 1240px; margin: 0 auto; padding: 16px 20px 48px; }
    @media (max-width: 760px) {
      header { padding: 14px 12px 0; }
      main { padding: 12px 12px 40px; }
    }
  `,
})
export class App {
  protected readonly sections = [
    { path: '/', label: 'Traces' },
    { path: '/players', label: 'Players' },
    { path: '/reports', label: 'Bug reports' },
  ];
}
