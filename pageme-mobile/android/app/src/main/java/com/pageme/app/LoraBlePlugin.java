package com.pageme.app;

import android.bluetooth.BluetoothAdapter;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.BluetoothGatt;
import android.bluetooth.BluetoothGattCallback;
import android.bluetooth.BluetoothGattCharacteristic;
import android.bluetooth.BluetoothGattDescriptor;
import android.bluetooth.BluetoothGattService;
import android.bluetooth.BluetoothManager;
import android.bluetooth.BluetoothProfile;
import android.bluetooth.le.BluetoothLeScanner;
import android.bluetooth.le.ScanCallback;
import android.bluetooth.le.ScanResult;
import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.getcapacitor.PermissionState;
import java.util.UUID;

@CapacitorPlugin(
    name = "LoraBlePlugin",
    permissions = {
        @Permission(alias = "nearby", strings = {
            "android.permission.BLUETOOTH_SCAN",
            "android.permission.BLUETOOTH_CONNECT"
        }),
        @Permission(alias = "location", strings = {
            android.Manifest.permission.ACCESS_COARSE_LOCATION,
            android.Manifest.permission.ACCESS_FINE_LOCATION
        })
    }
)
public class LoraBlePlugin extends Plugin {
    private static final String TAG = "LoraBlePlugin";
    private BluetoothAdapter bluetoothAdapter;
    private BluetoothLeScanner bluetoothLeScanner;
    private BluetoothGatt bluetoothGatt;
    private boolean isScanning = false;
    private Handler handler = new Handler(Looper.getMainLooper());
    private static LoraBlePlugin instance;

    private static final UUID SERVICE_UUID = UUID.fromString("cb0a2efc-2402-4053-9f5f-312ce9c32462");
    private static final UUID CHAR_NOTIFY_UUID = UUID.fromString("65a6590d-3372-4bb7-b84c-fd63f3e174fb");
    private static final UUID CCC_DESCRIPTOR_UUID = UUID.fromString("00002902-0000-1000-8000-00805f9b34fb");

    public LoraBlePlugin() {
        instance = this;
    }

    @PluginMethod
    public void startScanAndConnect(PluginCall call) {
        String requiredAlias = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S
            ? "nearby" : "location";
        if (getPermissionState(requiredAlias) != PermissionState.GRANTED) {
            if (getActivity() instanceof MainActivity) {
                ((MainActivity) getActivity()).beginRuntimePermissionFlow();
            }
            requestPermissionForAlias(requiredAlias, call, "bluetoothPermissionCallback");
            return;
        }
        startWithPermission(call);
    }

    @PermissionCallback
    public void bluetoothPermissionCallback(PluginCall call) {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).endRuntimePermissionFlow();
        }
        String requiredAlias = android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.S
            ? "nearby" : "location";
        if (getPermissionState(requiredAlias) != PermissionState.GRANTED) {
            call.reject("Bluetooth permission was not granted");
            return;
        }
        startWithPermission(call);
    }

    private void startWithPermission(PluginCall call) {
        Context context = getContext();
        BluetoothManager bm = (BluetoothManager) context.getSystemService(Context.BLUETOOTH_SERVICE);
        if (bm != null) {
            bluetoothAdapter = bm.getAdapter();
        }

        if (bluetoothAdapter == null || !bluetoothAdapter.isEnabled()) {
            call.reject("Bluetooth is disabled or not supported");
            return;
        }

        bluetoothLeScanner = bluetoothAdapter.getBluetoothLeScanner();
        if (bluetoothLeScanner == null) {
            call.reject("BLE Scanner not available");
            return;
        }

        try {
            startScan();
            JSObject result = new JSObject();
            result.put("scanning", true);
            call.resolve(result);
        } catch (SecurityException e) {
            Log.e(TAG, "Permission error starting scan", e);
            call.reject("Bluetooth permission is unavailable", e);
        }
    }

    @PluginMethod
    public void stopScanAndDisconnect(PluginCall call) {
        stopScan();
        if (bluetoothGatt != null) {
            try {
                bluetoothGatt.disconnect();
                bluetoothGatt.close();
            } catch (SecurityException e) {
                Log.e(TAG, "Gatt disconnect permission error", e);
            }
            bluetoothGatt = null;
        }
        call.resolve();
    }

    @android.annotation.SuppressLint("MissingPermission")
    private void startScan() {
        if (isScanning) return;
        isScanning = true;
        Log.i(TAG, "Starting BLE scan for Meshtastic nodes...");
        handler.postDelayed(new Runnable() {
            @Override
            public void run() {
                stopScan();
            }
        }, 30000);

        bluetoothLeScanner.startScan(scanCallback);
    }

    private void stopScan() {
        if (!isScanning) return;
        isScanning = false;
        Log.i(TAG, "Stopping BLE scan.");
        try {
            if (bluetoothLeScanner != null) {
                bluetoothLeScanner.stopScan(scanCallback);
            }
        } catch (SecurityException e) {
            Log.e(TAG, "Permission error stopping scan", e);
        }
    }

    private final ScanCallback scanCallback = new ScanCallback() {
        @Override
        public void onScanResult(int callbackType, ScanResult result) {
            BluetoothDevice device = result.getDevice();
            try {
                String name = device.getName();
                if (name != null && (name.contains("Mesh") || name.contains("Meshtastic") || name.contains("Heltec"))) {
                    Log.i(TAG, "Found target BLE node: " + name + " (" + device.getAddress() + ")");
                    stopScan();
                    connectToDevice(device);
                }
            } catch (SecurityException e) {
                Log.e(TAG, "Permission error reading device name", e);
            }
        }
    };

    private void connectToDevice(BluetoothDevice device) {
        Log.i(TAG, "Connecting to Gatt server on: " + device.getAddress());
        try {
            bluetoothGatt = device.connectGatt(getContext(), false, gattCallback);
        } catch (SecurityException e) {
            Log.e(TAG, "Permission error connecting Gatt", e);
        }
    }

    @android.annotation.SuppressLint("MissingPermission")
    private final BluetoothGattCallback gattCallback = new BluetoothGattCallback() {
        @Override
        public void onConnectionStateChange(BluetoothGatt gatt, int status, int newState) {
            if (newState == BluetoothProfile.STATE_CONNECTED) {
                Log.i(TAG, "Connected to GATT server. Starting service discovery...");
                try {
                    gatt.discoverServices();
                } catch (SecurityException e) {
                    Log.e(TAG, "Permission error starting discovery", e);
                }
            } else if (newState == BluetoothProfile.STATE_DISCONNECTED) {
                Log.i(TAG, "Disconnected from GATT server.");
                try { gatt.close(); } catch (Exception ignored) {}
                if (bluetoothGatt == gatt) bluetoothGatt = null;
            }
        }

        @Override
        public void onServicesDiscovered(BluetoothGatt gatt, int status) {
            if (status == BluetoothGatt.GATT_SUCCESS) {
                BluetoothGattService service = gatt.getService(SERVICE_UUID);
                if (service != null) {
                    BluetoothGattCharacteristic notifyChar = service.getCharacteristic(CHAR_NOTIFY_UUID);
                    if (notifyChar != null) {
                        try {
                            boolean localEnabled = gatt.setCharacteristicNotification(notifyChar, true);
                            BluetoothGattDescriptor descriptor = notifyChar.getDescriptor(CCC_DESCRIPTOR_UUID);
                            if (!localEnabled || descriptor == null) {
                                Log.e(TAG, "Meshtastic notification descriptor is unavailable.");
                                return;
                            }
                            byte[] descriptorValue = (notifyChar.getProperties() & BluetoothGattCharacteristic.PROPERTY_INDICATE) != 0
                                ? BluetoothGattDescriptor.ENABLE_INDICATION_VALUE
                                : BluetoothGattDescriptor.ENABLE_NOTIFICATION_VALUE;
                            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                                gatt.writeDescriptor(descriptor, descriptorValue);
                            } else {
                                descriptor.setValue(descriptorValue);
                                gatt.writeDescriptor(descriptor);
                            }
                            Log.i(TAG, "Meshtastic notification subscription requested.");
                        } catch (SecurityException e) {
                            Log.e(TAG, "Permission error subscribing notification", e);
                        }
                    }
                }
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic) {
            if (CHAR_NOTIFY_UUID.equals(characteristic.getUuid())) {
                handleCharacteristicValue(characteristic.getValue());
            }
        }

        @Override
        public void onCharacteristicChanged(BluetoothGatt gatt, BluetoothGattCharacteristic characteristic, byte[] value) {
            if (CHAR_NOTIFY_UUID.equals(characteristic.getUuid())) handleCharacteristicValue(value);
        }
    };

    private void handleCharacteristicValue(byte[] value) {
        String msg = parsePayload(value);
        if (msg != null && !msg.trim().isEmpty()) triggerMessageReceived("Lora Node", msg);
    }

    private String parsePayload(byte[] bytes) {
        if (bytes == null || bytes.length == 0) return "";
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            if (b >= 32 && b <= 126) {
                sb.append((char) b);
            }
        }
        return sb.toString();
    }

    public static void triggerMessageReceived(String sender, String message) {
        if (instance != null) {
            JSObject data = new JSObject();
            data.put("sender", sender);
            data.put("message", message);
            boolean isCode = message.matches("^\\d+[\\*#\\d]*$");
            data.put("type", isCode ? "code" : "text");
            instance.notifyListeners("loraMessageReceived", data);
        }
    }
}
