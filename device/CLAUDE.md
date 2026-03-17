# Stickman Device

M5StickC Plus 2 companion device — a cute sloth named Cece. Tap/toss detection, tilt-reactive sprites, BLE keyboard for Apple TV, and Ably streaming.

## Hardware

- **Board**: M5StickC Plus 2 (ESP32-PICO-V3-02)
- **USB-Serial**: CH9102 at `/dev/cu.usbserial-5B1E0467791`
- **Display**: 1.14" TFT LCD (135x240), portrait (rotation 0), ST7789 driver
- **IMU**: MPU6886 (6-axis), direct 14-byte burst register reads at ~100Hz
- **Buttons**: BtnA (GPIO 37, front), BtnB (GPIO 39, side), Power (GPIO 35)
- **Partition**: Custom 8MB layout (`partitions_8mb.csv`) — 5.8MB app, 2MB SPIFFS

## Build & Upload

```bash
cd device
pio run --target upload
pio device monitor   # 115200 baud
```

## Sprite System

Color sprites stored as RGB565 in `sprites.h` (auto-generated, do not hand-edit). 135x180px each.

**Generation pipeline**:
1. `stickman/scripts/generate-sprite-color.mjs` — Gemini AI generates PNGs on white background
2. ImageMagick removes background, resizes to 3:4 canvas (135x180)
3. `stickman/scripts/convert-sprites-to-header.mjs` — converts PNGs to RGB565 C arrays in `sprites.h`

**Two framing types**:
- **Head close-ups** — face fills the frame, used for expressions (idle, tap, tilt, BLE, sleep, wake, debug)
- **Full body** — action poses showing the whole character (toss air, toss lost, catch, launch, joystick)

**Display layout** (135x240 screen):
- Title bar: y 0-19 (20px)
- Sprite area: y 20-199 (135x180)
- Text area: y 200-239 (40px)

**Important**: `pushImage` requires `setSwapBytes(true)` for correct colors — ST7789 expects big-endian RGB565.

## Sprite States

| State | Sprites | Framing | Notes |
|---|---|---|---|
| Boot/Wake | wake-1, wake-2 | close-up | Played in sequence on startup |
| Sleep | sleep-1, sleep-2 | close-up, full body | sleep-2 is curled up body |
| Tap | tap-annoyed, tap-angry | close-up | Random pick on tap detection |
| Tilt | tilt-left, tilt-right, tilt-up | close-up | Orientation-reactive |
| Toss Launch | launch | full body | Shown on launch detection |
| Toss Air | air-1, air-2 | full body | Cycle every 350ms during freefall |
| Catch | high/high-alt, med/med-alt, low/low-alt | full body | Height-based pick with alt variants |
| Toss Lost | lost-1, lost-2 | full body | Cycle every 350ms after 3s timeout |
| BLE | on/on-alt, off/off-alt, connected | close-up | Shown on BLE mode change |
| Debug | debug, debug-alt | close-up | Magnifying glass |
| Idle | 12 poses (standing, wand-twirl, humming 1/2, hat-adjust, looking-left/right, sitting, glasses-push, spell-practice, yawn, wave) | close-up | Random pick every 5-12s |
| Joystick | joystick, joystick-tilt | full body | Power stance for game mode |

## IMU Axis Convention (verified via /calibrate)

```
        +Z (out of screen)
         ^
         |
    +---------+
    |  +Y ^   |
    |         |
+X < SCREEN  |
    |         |
    +---------+
         (USB)
```

- **+X = LEFT edge** (tilt right -> ax goes **negative**)
- **+Y = toward TOP** (away from USB; standing upright -> ay ~ +1)
- **+Z = out of screen** (flat on back, screen up -> az ~ +1)

| Orientation | ax | ay | az |
|---|---|---|---|
| Flat on back, screen up | ~0 | ~0 | **+1.0** |
| Standing portrait, USB down | ~0 | **+1.0** | ~0 |
| Tilted right (right edge down) | **-1.0** | ~0 | ~0 |
| Tilted left (left edge down) | **+1.0** | ~0 | ~0 |

**Pitch** = `atan2(ax, sqrt(ay^2 + az^2))` — tilt left/right (positive pitch = tilt LEFT)
**Roll** = `atan2(ay, sqrt(ax^2 + az^2))` — tilt forward/back
**3D viz mapping** (device -> Three.js): `-devX -> threeX, devZ -> threeY(up), devY -> threeZ`

## Buttons & BLE Modes

**BtnA** cycles through 3 BLE modes (persisted in NVS):

| Mode | BLE | Title Bar | Dot | Behavior |
|---|---|---|---|---|
| OFF | disabled | "~ Cece ~" | none | No BLE, normal companion mode |
| Wand | enabled | "~ Wand ~" | blue | Tap sends KEY_RETURN (Apple TV select) |
| Game | enabled + tilt | "~ Game ~" | green | Tap sends KEY_RETURN + tilt sends arrow keys |

**BtnB**: single tap toggles Active/Debug mode.

## Tilt Detection

Accelerometer-driven orientation reactions (only during TOSS_IDLE):
- `imuAx > 0.5` = tilted left -> shows tilt-right sprite (character leans opposite)
- `imuAx < -0.5` = tilted right -> shows tilt-left sprite
- `imuAy < -0.3` = upside down -> shows tilt-up sprite (overrides L/R)

In Game BLE mode, tilt also sends arrow keys via BLE HID keyboard at 180ms repeat rate.

## Modes (BtnB toggles: Active <-> Debug)

### Active Mode
Simultaneously detects taps and toss events.

**Tap**: Spike-shape detection on accel magnitude — rise > 0.8g, peak > 1.8g, fall > 0.3g, 500ms cooldown. Disabled during joystick mode and active toss. Sends BLE KEY_RETURN when BLE is on.

**Toss** (runs alongside tap detection):
- Launch: accel magnitude > 2.5g
- Freefall: accel < 0.4g (weightless)
- Catch: accel > 1.3g after freefall (min 1 sample)
- Height: `h = 0.5 * g * (t/2)^2` displayed in inches/feet
- Lost: 3s freefall timeout
- 1.5s result display, then auto-reset

### Debug Mode
WiFi status, SSID, signal (dBm + bars), IP, battery %, Ably status, message rate, BLE status. Refreshes every 500ms.

## Ably Streaming

Connects to WiFi on boot, streams to Ably channel `stickman` (clientId: `stickman`).

### IMU Data (event: `imu`)
Published at max 20Hz, only when orientation changes >=2 deg or accel changes >=0.05g:
```json
{
  "ax": 0.12, "ay": -0.45, "az": 0.98,
  "gx": 12.3, "gy": -4.5, "gz": 0.8,
  "p": 7.2, "r": -26.4, "t": 12345
}
```

### Other Events
- `btn`: `{button: "A"/"B", state: "down"/"up"}`
- `gesture`: `{gesture: "Tap"}`
- `toss`: `{state: "airborne"/"landed"/"lost", heightIn, freefallMs, launchG}`
- `mode`: `{mode: "active"/"debug"}`

### Ably Protocol
- Action parsing via `atoi` (not fragile `strstr`)
- `msgSerial` counter on every publish
- Heartbeat (action 0) handled as one-way server signal (no response)
- Auto-reconnect every 3s, re-attach channel on DETACHED/ERROR

## Power Management

- No motion 5 min (`MOTION_SLEEP_MS = 300000`) -> sleep animation -> deep sleep
- No button 10 min (`BUTTON_SLEEP_MS = 600000`) -> deep sleep
- Wake: BtnA (ext1 GPIO 37) or power button (ext0 GPIO 35)
- WiFi + WebSocket disconnected before sleep

## Known Issues
- Use `M5.BtnA`/`M5.BtnB` not `StickCP2.BtnA` (static init order fiasco)
- `DFRobot_GP8XXX` in lib_ignore (compile error in M5Unified dep)
