const fs = require('fs');
const path = require('path');
const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');

function ensureUsesPermission(manifest, permission) {
  const usesPermissions = manifest['uses-permission'] ?? [];
  const exists = usesPermissions.some((p) => p?.$?.['android:name'] === permission);
  if (!exists) {
    usesPermissions.push({ $: { 'android:name': permission } });
  }
  manifest['uses-permission'] = usesPermissions;
}

function ensureService(manifest, serviceName, serviceAttrs) {
  const app = manifest.manifest?.application?.[0];
  if (!app) return;
  const services = app.service ?? [];
  const exists = services.some((s) => s?.$?.['android:name'] === serviceName);
  if (!exists) {
    services.push({ $: { 'android:name': serviceName, ...serviceAttrs } });
  }
  app.service = services;
}

module.exports = function withAndroidOverlay(config) {
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;

    // Permissions
    ensureUsesPermission(androidManifest.manifest, 'android.permission.SYSTEM_ALERT_WINDOW');
    ensureUsesPermission(androidManifest.manifest, 'android.permission.FOREGROUND_SERVICE');
    ensureUsesPermission(androidManifest.manifest, 'android.permission.FOREGROUND_SERVICE_MICROPHONE');

    // Foreground service that hosts the overlay window
    ensureService(androidManifest, 'com.signo38.codiApp.overlay.OverlayService', {
      'android:enabled': 'true',
      'android:exported': 'false',
      'android:stopWithTask': 'false',
      'android:foregroundServiceType': 'microphone',
    });

    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const srcRoot = path.join(projectRoot, 'native-android-overlay');
      const overlayKt = path.join(
        srcRoot,
        'java',
        'com',
        'signo38',
        'codiApp',
        'overlay',
        'OverlayService.kt',
      );
      const destKtDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'signo38',
        'codiApp',
        'overlay',
      );
      const destKt = path.join(destKtDir, 'OverlayService.kt');
      const pinchKt = path.join(
        srcRoot,
        'java',
        'com',
        'signo38',
        'codiApp',
        'overlay',
        'PinchHostFrameLayout.kt',
      );
      const destPinchKt = path.join(destKtDir, 'PinchHostFrameLayout.kt');
      const srcXml = path.join(srcRoot, 'res', 'layout', 'overlay_panel.xml');
      const destXmlDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'layout');
      const destXml = path.join(destXmlDir, 'overlay_panel.xml');
      const srcPanelBg = path.join(srcRoot, 'res', 'drawable', 'overlay_panel_bg.xml');
      const destDrawableDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res', 'drawable');
      const destPanelBg = path.join(destDrawableDir, 'overlay_panel_bg.xml');

      if (fs.existsSync(overlayKt)) {
        await fs.promises.mkdir(destKtDir, { recursive: true });
        await fs.promises.copyFile(overlayKt, destKt);
      }
      if (fs.existsSync(pinchKt)) {
        await fs.promises.mkdir(destKtDir, { recursive: true });
        await fs.promises.copyFile(pinchKt, destPinchKt);
      }
      if (fs.existsSync(srcXml)) {
        await fs.promises.mkdir(destXmlDir, { recursive: true });
        await fs.promises.copyFile(srcXml, destXml);
      }
      if (fs.existsSync(srcPanelBg)) {
        await fs.promises.mkdir(destDrawableDir, { recursive: true });
        await fs.promises.copyFile(srcPanelBg, destPanelBg);
      }

      const srcBridgeDir = path.join(srcRoot, 'java', 'com', 'signo38', 'codiApp');
      const destBridgeDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        'com',
        'signo38',
        'codiApp',
      );
      for (const name of ['CodiOverlayModule.kt', 'CodiOverlayPackage.kt']) {
        const srcBridge = path.join(srcBridgeDir, name);
        const destBridge = path.join(destBridgeDir, name);
        if (fs.existsSync(srcBridge)) {
          await fs.promises.mkdir(destBridgeDir, { recursive: true });
          await fs.promises.copyFile(srcBridge, destBridge);
        }
      }

      const appGradlePath = path.join(projectRoot, 'android', 'app', 'build.gradle');
      if (fs.existsSync(appGradlePath)) {
        const zxingCoords = 'com.google.zxing:core:3.5.3';
        let gradleText = await fs.promises.readFile(appGradlePath, 'utf8');
        if (!gradleText.includes(zxingCoords)) {
          gradleText = gradleText.replace(
            /^dependencies\s*\{/m,
            `dependencies {\n    implementation("${zxingCoords}")\n`,
          );
          await fs.promises.writeFile(appGradlePath, gradleText, 'utf8');
        }
      }

      return cfg;
    },
  ]);

  return config;
};
