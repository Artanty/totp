import 'zone.js';
import { EnvironmentInjector } from '@angular/core';
import { createCustomElement } from '@angular/elements';
import { createApplication } from '@angular/platform-browser';
import { GateComponent } from './gate.component';

const ELEMENT_TAG = 'safe-totp-gate';

let stashedInjector: EnvironmentInjector | null = null;
let pendingInjector: Promise<EnvironmentInjector> | null = null;
let elementDefined = false;

export function setTotpGateInjector(injector: EnvironmentInjector): void {
  stashedInjector = injector;
}

async function createFallbackInjector(): Promise<EnvironmentInjector> {
  // createApplication() calls createNgModuleRef(), which NG0909 forbids from
  // inside the Angular zone. Run it in the parent (non-Angular) zone instead.
  const nonAngularZone = Zone.current.parent ?? Zone.current;
  return nonAngularZone.run(() =>
    createApplication().then((appRef) => appRef.injector)
  );
}

export async function registerTotpGate(): Promise<void> {
  if (elementDefined) return;
  let injector = stashedInjector;
  if (!injector) {
    if (!pendingInjector) {
      pendingInjector = createFallbackInjector();
    }
    injector = await pendingInjector;
  }
  if (elementDefined) return;
  customElements.define(ELEMENT_TAG, createCustomElement(GateComponent, { injector }));
  elementDefined = true;
}

export { GateComponent };