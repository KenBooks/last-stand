// The traces page: two views, the one the address's hash names shown (`#reports`: the bug reports; else the traces).
import './style.css';
import { byId } from './dom';
import { showList } from './list';
import { showReports } from './reports';
import { showSummary } from './summary';

/** The view the address asks for, shown, its link in the bar marked. */
function showView(): void {
  const view = location.hash === '#reports' ? 'reports' : 'traces';
  byId('view-traces').hidden = view !== 'traces';
  byId('view-reports').hidden = view !== 'reports';
  for (const link of document.querySelectorAll<HTMLElement>('.views a')) {
    link.classList.toggle('on', link.dataset.view === view);
  }
}

addEventListener('hashchange', showView);
showView();
void showSummary();
showList();
showReports();
