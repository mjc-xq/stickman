# Stickman

Monorepo with two components:

- **`device/`** — M5StickC Plus 2 firmware (PlatformIO/Arduino). Cute sloth companion with wand gesture detection and toss height measurement. See `device/CLAUDE.md` for details.
- **`stickman/`** — Next.js web app.

## Quick Start

### Device firmware
```bash
cd device
pio run --target upload   # Build + flash to board
pio device monitor        # Serial monitor (115200 baud)
```

### Web app
```bash
cd stickman
npm install
npm run dev
```
