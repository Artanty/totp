import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { AppComponent } from './app/app.component';
import { setTotpGateInjector } from './app/gate/gate.module';

bootstrapApplication(AppComponent, appConfig)
  .then((appRef) => setTotpGateInjector(appRef.injector))
  .catch((err) => console.error(err));