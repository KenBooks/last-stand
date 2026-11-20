// The dashboard's start: zoneless and standalone (Angular 22's defaults), its providers in app.config.ts.
import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';

bootstrapApplication(App, appConfig).catch((error: unknown) => console.error(error));
