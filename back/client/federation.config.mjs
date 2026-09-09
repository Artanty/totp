import { withFederation } from '@module-federation/esbuild/build';

export const federationConfig = withFederation({
  name: 'totp',
  filename: 'remoteEntry.js',
  exposes: {
    './totp-core': './src/core.ts',
    './totp-gate': './src/gate.ts',
  },
  shared: {},
});

export default federationConfig;