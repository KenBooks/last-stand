// The dashboard's providers: the router (route params as inputs, a title per page) and fetch-based HTTP that
// reloads the page when the session is gone (the server then says to open it from Dokci).
import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { routes } from './app.routes';
import { signedOutInterceptor } from './core/api';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([signedOutInterceptor])),
  ],
};
