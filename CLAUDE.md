# Stickman

ESP32 project for M5StickC Plus 2 using PlatformIO + Arduino framework.

## Hardware

- **Board**: M5StickC Plus 2 (ESP32-PICO-V3-02, 240MHz, 320KB RAM, 4MB Flash)
- **USB-Serial**: CH9102 at `/dev/cu.usbserial-5B1E0467791`
- **Display**: 1.14" TFT LCD (135x240)
- **IMU**: MPU6886 (6-axis)
- **Power**: AXP2101

## Build & Upload

```bash
pio run                  # Build
pio run --target upload  # Build + upload to board
pio device monitor       # Serial monitor (115200 baud)
```

## Project Structure

- `src/main.cpp` — Main application code
- `platformio.ini` — PlatformIO config (board, libs, ports)
- `lib/` — Project-specific libraries
- `include/` — Project header files
- `test/` — Test files

## Libraries

- **M5StickCPlus2** (via M5Unified) — Board support, display, buttons, IMU, power
- `DFRobot_GP8XXX` is in `lib_ignore` due to a compile error with this ESP32 framework version

## API Reference

```cpp
auto cfg = M5.config();
StickCP2.begin(cfg);          // Initialize board
StickCP2.Display              // LCD (LGFX-based)
StickCP2.BtnA / StickCP2.BtnB // Buttons
StickCP2.Imu                  // IMU sensor
StickCP2.Speaker              // Buzzer
StickCP2.Power                // Power management
```
