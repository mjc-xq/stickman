# Stickman Device

M5StickC Plus 2 companion device. Always-on gesture + toss detection with Ably streaming. BtnB toggles Active/Debug mode.

## Hardware

- **Board**: M5StickC Plus 2 (ESP32-PICO-V3-02)
- **USB-Serial**: CH9102 at `/dev/cu.usbserial-5B1E0467791`
- **Display**: 1.14" TFT LCD (135x240), portrait (rotation 0)
- **IMU**: MPU6886 (6-axis), direct 14-byte burst register reads at ~100Hz
- **Buttons**: BtnA (GPIO 37, front), BtnB (GPIO 39, side), Power (GPIO 35)

## Build & Upload

```bash
cd device
pio run --target upload
pio device monitor   # 115200 baud
```

## IMU Axis Convention (verified via /calibrate)

```
        +Z (out of screen)
         ↑
         |
    +---------+
    |  +Y ↑   |
    |         |
+X ← SCREEN  |
    |         |
    +---------+
         (USB)
```

- **+X = LEFT edge** (tilt right → ax goes **negative**)
- **+Y = toward TOP** (away from USB; standing upright → ay ≈ +1)
- **+Z = out of screen** (flat on back, screen up → az ≈ +1)

| Orientation | ax | ay | az |
|---|---|---|---|
| Flat on back, screen up | ~0 | ~0 | **+1.0** |
| Standing portrait, USB down | ~0 | **+1.0** | ~0 |
| Tilted right (right edge down) | **-1.0** | ~0 | ~0 |
| Tilted left (left edge down) | **+1.0** | ~0 | ~0 |

**3D viz mapping** (device → Three.js): `-devX→threeX, devZ→threeY(up), devY→threeZ`

**Pitch** = `atan2(ax, sqrt(ay² + az²))` — tilt left/right (note: positive pitch = tilt LEFT)
**Roll** = `atan2(ay, sqrt(ax² + az²))` — tilt forward/back

**3D viz axis mapping** (device → Three.js): `devX→X, devZ→Y(up), devY→Z`

## Modes (BtnB toggles: Active ↔ Debug)

### Active Mode
Simultaneously detects wand gestures AND toss events (no separate mode needed).

**Gestures** (algorithmic, no ML):
- **Circle Left/Right**: total gyro magnitude (all 3 axes) > 30 dps, accumulates to 120°. Direction from dominant gyro axis sign.
- **Thrust**: total accel magnitude > 1.8G sustained for 3+ samples at 2.0G avg. Only fires when toss is idle.
- **Tap**: accel magnitude delta > 1.8G, 400ms debounce. Only fires when thrust isn't accumulating.

Detection priority: Circle → Thrust → Tap (prevents tap from stealing thrust).
Gestures suppressed during active toss (LAUNCHED/FREEFALL).
600ms cooldown between gestures.

**Toss** (runs alongside gestures):
- Launch: accel magnitude > 2.5G
- Freefall: accel < 0.4G (weightless)
- Catch: accel > 1.3G after freefall
- Height: `h = 0.5 * g * (t/2)²` displayed in inches/feet
- 1.5s result display, then auto-reset

### Debug Mode
WiFi status, SSID, signal (dBm + bars), IP, battery %, Ably status, message rate. Refreshes every 500ms.

## Ably Streaming

Connects to WiFi on boot, streams to Ably channel `stickman` (clientId: `stickman`).

### IMU Data (event: `imu`)
Published at max 10Hz, only when orientation changes ≥2° or accel changes ≥0.05g:
```json
{
  "ax": 0.12, "ay": -0.45, "az": 0.98,
  "gx": 12.3, "gy": -4.5, "gz": 0.8,
  "p": 7.2, "r": -26.4, "t": 12345
}
```

### Other Events
- `btn`: `{button: "A"/"B", state: "down"/"up"}`
- `gesture`: `{gesture: "Circle Left"/"Circle Right"/"Tap"/"Thrust"}`
- `toss`: `{state: "airborne"/"landed"/"lost", heightIn, freefallMs, launchG}`
- `mode`: `{mode: "active"/"debug"}`

### Ably Protocol
- Action parsing via `atoi` (not fragile `strstr`)
- `msgSerial` counter on every publish
- Heartbeat (action 0) handled as one-way server signal (no response)
- No WS-level ping/pong (caused disconnects — Ably's own heartbeat suffices)
- Auto-reconnect every 3s, re-attach channel on DETACHED/ERROR

## Power Management
- No motion 1 min → sleep animation → deep sleep
- No button 3 min → deep sleep
- Wake: BtnA (ext1 GPIO 37) or power button (ext0 GPIO 35)
- WiFi + WebSocket disconnected before sleep

## Known Issues
- Use `M5.BtnA`/`M5.BtnB` not `StickCP2.BtnA` (static init order fiasco)
- `DFRobot_GP8XXX` in lib_ignore (compile error in M5Unified dep)
- SensiML library in `lib/sensiml/` unused — can delete
