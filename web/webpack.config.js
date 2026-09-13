require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { withModuleFederationPlugin } = require('@angular-architects/module-federation/webpack');
const webpack = require('webpack');

const isDev = process.argv.includes('serve') || process.argv.includes('development');

function devTagVersion() {
  if (!isDev) return undefined;
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'build', '.env'), 'utf8');
    const match = raw.match(/^\s*TAG_VERSION\s*=\s*(.*)$/m);
    if (!match) return undefined;
    let version = match[1].trim();
    if (version.length >= 2 && ((version.startsWith('"') && version.endsWith('"')) || (version.startsWith("'") && version.endsWith("'")))) {
      version = version.slice(1, -1);
    }
    return version || undefined;
  } catch {
    return undefined;
  }
}

const mfConfig = withModuleFederationPlugin({
  name: 'totp',
  exposes: {
    './totp-core': './src/app/core/totp-session.service.ts',
    './totp-gate': './src/app/gate/gate.module.ts',
  },
  library: { type: 'var', name: 'totp' },
  shared: {},
});

module.exports = (config) => {
  config.output = { ...config.output, ...mfConfig.output };
  config.output.publicPath = 'auto';
  config.output.module = false;
  config.output.scriptType = 'text/javascript';
  config.plugins = [
    ...(config.plugins || []),
    ...mfConfig.plugins,
    new webpack.DefinePlugin({
      TOTP_GATE_VERSION: JSON.stringify(devTagVersion() ?? (process.env.TAG_VERSION || '0.0.0.0.0.0')),
      WEB_BACK_URL: JSON.stringify(process.env.BACK_URL || ''),
      TOTP_URL: JSON.stringify(process.env.TOTP_URL || ''),
    }),
  ];
  config.optimization = config.optimization || {};
  config.optimization.runtimeChunk = false;
  config.experiments = { ...config.experiments, outputModule: false };
  return config;
};