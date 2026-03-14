# Stickman Device - Sloth Wand, Toss & Debug

Cute sloth-faced companion for M5StickC Plus 2. Three modes: Wand, Toss, Debug. Streams IMU data to Ably for real-time web visualization.

## Hardware

- **Board**: M5StickC Plus 2 (ESP32-PICO-V3-02)
- **USB-Serial**: CH9102 at `/dev/cu.usbserial-5B1E0467791`
- **Display**: 1.14" TFT LCD (135x240), portrait (rotation 0)
- **IMU**: MPU6886 (6-axis), direct 14-byte burst register reads
- **Buttons**: BtnA (GPIO 37), BtnB (GPIO 39), Power (GPIO 35)

## Build & Upload

```bash
cd device
pio run --target upload
pio device monitor   # 115200 baud
```

## Modes (BtnB cycles: Wand → Toss → Debug)

### Wand Mode
Algorithmic gesture detection (no ML):
- **Tap**: accel magnitude delta > 2G, 500ms debounce
- **Thrust**: sustained Y-axis accel > 2.5G for 4+ samples
- **Circle Left/Right**: gyro Z accumulation > 180 degrees

### Toss Mode
Throw height from freefall duration (h = 0.5*g*(t/2)^2):
- Launch: accel > 2G
- Freefall: accel < 0.4G
- Catch: accel > 1.3G after freefall
- Height displayed in inches/feet

### Debug Mode
Shows WiFi, signal strength (dBm + bars), IP, battery %, voltage, Ably status, and message rate. Refreshes every 500ms.

## WiFi & Ably Streaming

Connects to WiFi on boot. Streams IMU data to Ably WebSocket pubsub.

### Connection Details
- **WiFi**: SSID `Flapjack`
- **Ably channel**: `stickman`
- **Client ID**: `stickman`
- **Protocol**: Ably realtime over WSS to `realtime.ably.io`

### Data Format (published as `imu` event on channel `stickman`)
```json
{
  "ax": 0.123,   // Accelerometer X (g, ±8G range)
  "ay": -0.456,  // Accelerometer Y (g)
  "az": 0.987,   // Accelerometer Z (g)
  "gx": 12.3,    // Gyroscope X (degrees/sec, ±2000dps range)
  "gy": -4.5,    // Gyroscope Y (dps)
  "gz": 0.8,     // Gyroscope Z (dps)
  "p": 7.2,      // Pitch (degrees, computed from accel)
  "r": -26.4,    // Roll (degrees, computed from accel)
  "t": 12345     // Device timestamp (millis since boot)
}
```

### Publishing Rules
- **Change-based**: only publishes when orientation changes ≥1° OR acceleration changes ≥5%
- **Max rate**: 50Hz (20ms minimum interval)
- **Burst-tolerant**: when device is moving, publishes at high rate; when still, publishes rarely

### Ably Protocol Details
- Uses Ably realtime protocol action 15 (MESSAGE) with `msgSerial` counter
- Responds to action 0 (HEARTBEAT) to keep connection alive
- WebSocket keepalive: ping every 15s
- Auto-reconnects every 3s on disconnect

## Power Management
- No motion 1 min → deep sleep
- No button 3 min → deep sleep
- Deep sleep via `StickCP2.Power.deepSleep(0, true)` (GPIO 35 wake)
- WiFi + WebSocket disconnected before sleep

## Known Issues
- Use `M5.BtnA`/`M5.BtnB` not `StickCP2.BtnA` (static init order fiasco)
- `DFRobot_GP8XXX` in lib_ignore (compile error)
- SensiML library in `lib/sensiml/` unused (can delete)
- DNS resolution can fail on first boot; WebSocket auto-retries

## Subscribing to IMU Data (Web Side)

```javascript
import Ably from 'ably';
const ably = new Ably.Realtime('API_KEY');
const channel = ably.channels.get('stickman');
channel.subscribe('imu', (msg) => {
  const data = JSON.parse(msg.data);
  console.log(data.p, data.r); // pitch, roll in degrees
});
```
