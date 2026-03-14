# Stickman Device Events

The Stickman device publishes real-time events to **Ably** channel `stickman` via WebSocket. Subscribe to these events to build interactive web experiences.

## Connection Setup

```javascript
import Ably from 'ably';

const ably = new Ably.Realtime('YOUR_ABLY_API_KEY');
const channel = ably.channels.get('stickman');

// Subscribe to all events
channel.subscribe((msg) => {
  const data = JSON.parse(msg.data);
  console.log(msg.name, data);
});

// Or subscribe to specific event types
channel.subscribe('imu', (msg) => { /* orientation data */ });
channel.subscribe('btn', (msg) => { /* button press/release */ });
channel.subscribe('gesture', (msg) => { /* wand gesture detected */ });
channel.subscribe('toss', (msg) => { /* toss airborne/landed */ });
channel.subscribe('mode', (msg) => { /* mode changed */ });
```

---

## Event Reference

### `imu` — IMU Orientation & Motion

Published at up to 10Hz, only when orientation changes ≥2° or acceleration changes ≥0.05g.

```json
{
  "ax": 0.123,   // Accelerometer X in g (±8G range)
  "ay": -0.456,  // Accelerometer Y in g
  "az": 0.987,   // Accelerometer Z in g
  "gx": 12.3,    // Gyroscope X in degrees/sec (±2000 dps range)
  "gy": -4.5,    // Gyroscope Y in degrees/sec
  "gz": 0.8,     // Gyroscope Z in degrees/sec
  "p": 7.2,      // Pitch in degrees (computed from accelerometer)
  "r": -26.4,    // Roll in degrees (computed from accelerometer)
  "t": 12345     // Device uptime in milliseconds
}
```

**Notes:**
- `ax/ay/az` are raw accelerometer values. At rest, one axis reads ~1g (gravity).
- `gx/gy/gz` are angular velocity. At rest, these are near zero.
- `p` (pitch) and `r` (roll) are tilt angles derived from accelerometer only — accurate when the device is relatively still, noisy during fast motion.
- No events are published when the device is stationary.

---

### `btn` — Button Press & Release

Published instantly on every button state change.

```json
{
  "button": "A",     // "A" (front button) or "B" (side button)
  "state": "down"    // "down" (pressed) or "up" (released)
}
```

**Notes:**
- Button A is the large front button.
- Button B is the small side button (also used to switch modes on the device).
- You get both `down` and `up` events, so you can track hold duration.

---

### `gesture` — Wand Gesture Detected

Published when a wand gesture is recognized (Wand mode only).

```json
{
  "gesture": "Circle Left"   // Gesture name
}
```

**Possible gesture values:**
| Value | Motion |
|-------|--------|
| `"Circle Left"` | Circular wrist rotation counter-clockwise |
| `"Circle Right"` | Circular wrist rotation clockwise |
| `"Tap"` | Sharp flick or tap of the device |
| `"Thrust"` | Forward push/thrust along the device's long axis |

**Notes:**
- 800ms cooldown between gestures (no duplicates).
- Only fires in Wand mode.

---

### `toss` — Toss Detection

Published on airborne and landing events (Toss mode only).

#### Airborne (device is in the air)
```json
{
  "state": "airborne",
  "launchG": 3.2          // Peak launch acceleration in G
}
```

#### Landed (device was caught)
```json
{
  "state": "landed",
  "heightIn": 14.2,       // Estimated apex height in inches
  "heightM": 0.361,       // Estimated apex height in meters
  "freefallMs": 542       // Total freefall duration in milliseconds
}
```

#### Lost (freefall exceeded 3 seconds — dropped?)
```json
{
  "state": "lost"
}
```

**Notes:**
- Height is estimated from freefall duration using `h = ½g(t/2)²`.
- Short tosses (even a few inches) are detected.
- Only fires in Toss mode.

---

### `mode` — Mode Changed

Published when the user switches modes via the side button.

```json
{
  "mode": "toss"     // Current mode
}
```

**Possible mode values:** `"wand"`, `"toss"`, `"debug"`

---

## Event Frequency Summary

| Event | Max Rate | When |
|-------|----------|------|
| `imu` | 10 Hz | Device is moving (orientation ≥2° or accel ≥0.05g change) |
| `btn` | Instant | Any button press or release |
| `gesture` | ~1/sec | Wand gesture detected (800ms cooldown) |
| `toss` | Instant | Airborne / landed / lost transitions |
| `mode` | Instant | Side button pressed |

**When the device is still on a table:** zero events published.

---

## Device Info

- **Client ID:** `stickman`
- **Channel:** `stickman`
- The device auto-reconnects to Ably on WiFi/WebSocket drops.
- The device enters deep sleep after 1 min of no motion or 3 min of no button presses. No events are published during sleep.
