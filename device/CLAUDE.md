# Stickman - Sloth Wand & Toss

Cute sloth-faced companion app for M5StickC Plus 2. Two modes: Wand (gesture detection) and Toss (throw height measurement).

## Hardware

- **Board**: M5StickC Plus 2 (ESP32-PICO-V3-02, 240MHz, 320KB RAM, 4MB Flash)
- **USB-Serial**: CH9102 at `/dev/cu.usbserial-5B1E0467791`
- **Display**: 1.14" TFT LCD (135x240), portrait orientation (rotation 0)
- **IMU**: MPU6886 (6-axis accel + gyro), direct register reads at ~50Hz
- **Buttons**: BtnA (GPIO 37, front), BtnB (GPIO 39, side), Power (GPIO 35)

## Build & Upload

```bash
pio run                  # Build
pio run --target upload  # Build + upload to board
pio device monitor       # Serial monitor (115200 baud)
```

## How It Works

### Boot
Wake-up animation: eyes open, yawn, smile → ready state

### Wand Mode (default)
Wave the device to trigger gestures detected algorithmically (no ML):
- **Tap**: Sharp acceleration spike (flick/tap the device)
- **Thrust**: Sustained strong acceleration along Y axis (push forward)
- **Circle Left/Right**: Gyroscope Z rotation accumulation (>200 degrees)

Each gesture triggers a unique sloth expression + message for 2 seconds.

### Toss Mode (press BtnB to switch)
Throw the device in the air:
1. **Launch**: detected when accel > 3G
2. **Freefall**: detected when accel drops < 0.3G (near weightlessness)
3. **Catch**: detected when accel spikes > 1.5G again
4. Height calculated from freefall duration: `h = 0.5 * g * (t/2)^2`

Sloth shows scared face during freefall, then height result with expression based on height.

### Power Management
- **No motion for 1 min** → sleep (yawn animation → Zzz → deep sleep)
- **No button press for 3 min** → sleep
- **Wake**: press power button (GPIO 35, handled by M5Unified `deepSleep`)

## Known Issues / Quirks

- **Button references**: Use `M5.BtnA`/`M5.BtnB` instead of `StickCP2.BtnA`/`StickCP2.BtnB` due to C++ static initialization order fiasco (StickCP2 wrapper binds references before M5 is constructed → null pointer crash).
- `lib_ignore = DFRobot_GP8XXX` — compile error in M5Unified dependency, unused by our board.
- SensiML library still in `lib/sensiml/` but not linked (removed from build_flags). Can be deleted.

## Project Structure

- `src/main.cpp` — Full application: sloth UI, gesture detection, toss physics, power management
- `lib/sensiml/` — SensiML Knowledge Pack (unused, can delete)
- `platformio.ini` — Board config

## Sloth Expressions

| Expression | Eyes | Used For |
|-----------|------|----------|
| happy | Round with highlight | Default/ready |
| blink | Arcs (closed) | Periodic blink |
| surprised | Big round + highlight | Tap gesture |
| excited | Double highlights | High toss / Circle |
| dizzy | Spiral arcs | Circle gestures |
| determined | Focused + eyebrows | Thrust gesture |
| scared | Wide white sclera | Freefall |
| proud | Closed smile arcs | Medium toss |
| sleepy | Half-closed | Yawn before sleep |
| sleep | Closed arcs | Deep sleep |

## M5Unified API Notes

```cpp
StickCP2.Display     // LCD (LGFX) - use for display
StickCP2.Imu         // IMU access (getImuInstancePtr for raw MPU6886)
StickCP2.Power       // Power management (deepSleep)
M5.BtnA / M5.BtnB   // Buttons (NOT StickCP2.BtnA - see known issues)
```
