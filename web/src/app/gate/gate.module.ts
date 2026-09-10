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

export async function registerTotpGate(): Promise<void> {
  if (elementDefined) return;
  let injector = stashedInjector;
  if (!injector) {
    if (!pendingInjector) {
      pendingInjector = createApplication().then((appRef) => appRef.injector);
    }
    injector = await pendingInjector;
  }
  if (elementDefined) return;
  customElements.define(ELEMENT_TAG, createCustomElement(GateComponent, { injector }));
  elementDefined = true;
}

export { GateComponent };