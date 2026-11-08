// Metro con el cliente HTTP comun de los frontends (packages/api-client, compilado en dist/). Esta app usa npm, fuera del workspace de pnpm.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const apiClient = path.resolve(__dirname, '../../packages/api-client');
config.watchFolders = [...(config.watchFolders ?? []), apiClient];
config.resolver.extraNodeModules = { ...(config.resolver.extraNodeModules ?? {}), '@sigec/api-client': apiClient };
module.exports = config;
