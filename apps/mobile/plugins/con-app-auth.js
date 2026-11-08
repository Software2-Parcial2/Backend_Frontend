// Config plugin (sin dependencias nuevas): deja listo en el proyecto nativo lo que pide react-native-app-auth y el desarrollo local.
//  - Android: manifestPlaceholders.appAuthRedirectScheme = "sigec" (esquema del redirect sigec://callback).
//  - Android: trafico HTTP en claro hacia el gateway local (solo para desarrollo; en produccion el API va por HTTPS).
const { withAppBuildGradle, withAndroidManifest } = require('expo/config-plugins');

module.exports = function conAppAuth(config) {
  config = withAppBuildGradle(config, (c) => {
    if (!c.modResults.contents.includes('appAuthRedirectScheme')) {
      c.modResults.contents = c.modResults.contents.replace(
        /defaultConfig\s*\{/,
        "defaultConfig {\n        manifestPlaceholders = [appAuthRedirectScheme: 'sigec']",
      );
    }
    return c;
  });
  return withAndroidManifest(config, (c) => {
    const app = c.modResults.manifest.application?.[0];
    if (app) app.$['android:usesCleartextTraffic'] = 'true';
    return c;
  });
};
