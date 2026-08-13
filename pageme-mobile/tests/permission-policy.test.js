import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const manifestUrl = new URL('../android/app/src/main/AndroidManifest.xml', import.meta.url);

test('Android manifest excludes permissions that are not required by PageMe', async () => {
  const manifest = await readFile(manifestUrl, 'utf8');
  const forbidden = [
    'android.permission.CAMERA',
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

test('LoRa keeps only Android Nearby Devices permissions', async () => {
  const manifest = await readFile(manifestUrl, 'utf8');
  assert.match(manifest, /android\.permission\.BLUETOOTH_SCAN/);
  assert.match(manifest, /android\.permission\.BLUETOOTH_CONNECT/);
  assert.match(manifest, /android:usesPermissionFlags="neverForLocation"/);
});
