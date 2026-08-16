import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifestUrl = new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url);
const notificationPluginUrl = new URL(
  '../android/app/src/main/java/com/pageme/app/NotificationReceiverPlugin.java',
  import.meta.url,
);

test('Android manifest excludes permissions that are not required by PageMe', async () => {
  const manifest = await readFile(manifestUrl, 'utf8');
  const forbidden = [
    'android.permission.READ_CONTACTS',
    'android.permission.ACCESS_COARSE_LOCATION',
    'android.permission.ACCESS_FINE_LOCATION',
    'android.permission.EXPAND_STATUS_BAR',
    'android.permission.BLUETOOTH_ADMIN',
    'android.permission.BLUETOOTH"',
  ];

  for (const permission of forbidden) {
    assert.equal(manifest.includes(permission), false, `${permission} must stay out of the manifest`);
  }
});

test('rear torch uses optional camera hardware and an on-demand runtime permission', async () => {
  const [manifest, plugin] = await Promise.all([
    readFile(manifestUrl, 'utf8'),
    readFile(notificationPluginUrl, 'utf8'),
  ]);

  assert.match(manifest, /android\.permission\.CAMERA/);
  assert.match(manifest, /android\.hardware\.camera\.flash" android:required="false"/);
  assert.match(plugin, /@Permission\(alias = "camera"/);
  assert.match(plugin, /requestPermissionForAlias\("camera"/);
  assert.match(plugin, /cameraManager\.setTorchMode/);
  assert.equal(plugin.includes('setScreenLight'), false);
});

test('LoRa keeps only Android Nearby Devices permissions', async () => {
  const manifest = await readFile(manifestUrl, 'utf8');
  assert.match(manifest, /android\.permission\.BLUETOOTH_SCAN/);
  assert.match(manifest, /android\.permission\.BLUETOOTH_CONNECT/);
  assert.match(manifest, /android:usesPermissionFlags="neverForLocation"/);
});
