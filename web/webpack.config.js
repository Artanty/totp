require('dotenv').config();
const { withModuleFederationPlugin } = require('@angular-architects/module-federation/webpack');
const webpack = require('webpack');

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
      TOTP_GATE_VERSION: JSON.stringify(process.env.TAG_VERSION || '0.0.0.0.0.0'),
      WEB_BACK_URL: JSON.stringify(process.env.BACK_URL || ''),
    }),
  ];
  config.optimization = config.optimization || {};
  config.optimization.runtimeChunk = false;
  config.experiments = { ...config.experiments, outputModule: false };
  return config;
};