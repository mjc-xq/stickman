/**
 * IMU Calibration Tool — reads live data from Ably and guides through
 * 6 standard orientations to empirically map every axis.
 *
 * Usage: node scripts/calibrate-imu.mjs
 *
 * Requires: NEXT_PUBLIC_ABLY_API_KEY in .env.local
 */

import Ably from "ably";
import * as readline from "node:readline";
import { config } from "dotenv";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env.local") });

const ABLY_KEY = process.env.NEXT_PUBLIC_ABLY_API_KEY;
if (!ABLY_KEY) {
  console.error("Missing NEXT_PUBLIC_ABLY_API_KEY in .env.local");
  process.exit(1);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((r) => rl.question(q, r));

// Latest IMU data
let latest = null;
let samples = [];

function fmt(v) { return v >= 0 ? ` ${v.toFixed(3)}` : v.toFixed(3); }

function printIMU(d) {
  process.stdout.write(
    `\r  ax=${fmt(d.ax)}  ay=${fmt(d.ay)}  az=${fmt(d.az)}  |  gx=${fmt(d.gx)}  gy=${fmt(d.gy)}  gz=${fmt(d.gz)}  |  p=${fmt(d.p)}  r=${fmt(d.r)}   `
  );
}

function avg(arr, key) {
  return arr.reduce((s, d) => s + d[key], 0) / arr.length;
}

function captureSamples(ms) {
  return new Promise((resolve) => {
    samples = [];
    const start = Date.now();
    const check = setInterval(() => {
      if (Date.now() - start >= ms) {
        clearInterval(check);
        resolve([...samples]);
      }
    }, 50);
  });
}

async function main() {
  console.log("╔══════════════════════════════════════════════════╗");
  console.log("║       IMU Calibration — M5StickC Plus 2         ║");
  console.log("╚══════════════════════════════════════════════════╝\n");
  console.log("Connecting to Ably...");

  const client = new Ably.Realtime({ key: ABLY_KEY, clientId: "calibrate" });
  const channel = client.channels.get("stickman");

  await new Promise((resolve) => {
    client.connection.on("connected", resolve);
  });
  console.log("Connected! Waiting for device data...\n");

  // Subscribe to IMU events
  let receiving = false;
  channel.subscribe("imu", (msg) => {
    try {
      const d = typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
      latest = d;
      samples.push(d);
      if (!receiving) {
        receiving = true;
        console.log("Receiving IMU data!\n");
      }
      printIMU(d);
    } catch {}
  });

  // Wait for first data
  while (!receiving) {
    await new Promise((r) => setTimeout(r, 200));
  }

  console.log("\n\n── LIVE MONITOR ──────────────────────────────────");
  console.log("Move the device around to see the data update.");
  console.log("When you see it updating, press Enter to start calibration.\n");
  await ask("Press Enter to begin calibration...");

  const poses = [
    {
      name: "FLAT (screen up)",
      instruction: "Lay the device FLAT on a table, SCREEN FACING UP.",
      expect: "az ≈ +1, ax ≈ 0, ay ≈ 0",
    },
    {
      name: "FLAT (screen down)",
      instruction: "Flip it FACE DOWN on the table, screen facing down.",
      expect: "az ≈ -1, ax ≈ 0, ay ≈ 0",
    },
    {
      name: "STANDING (USB down)",
      instruction: "Stand it UPRIGHT with the USB port POINTING DOWN.",
      expect: "ay ≈ +1, ax ≈ 0, az ≈ 0",
    },
    {
      name: "STANDING (USB up)",
      instruction: "Stand it UPSIDE DOWN with USB port POINTING UP.",
      expect: "ay ≈ -1, ax ≈ 0, az ≈ 0",
    },
    {
      name: "TILTED RIGHT (right edge down)",
      instruction: "Tilt so the RIGHT edge points DOWN (like pouring water right).",
      expect: "ax ≈ -1, ay ≈ 0, az ≈ 0",
    },
    {
      name: "TILTED LEFT (left edge down)",
      instruction: "Tilt so the LEFT edge points DOWN (like pouring water left).",
      expect: "ax ≈ +1, ay ≈ 0, az ≈ 0",
    },
    {
      name: "SPIN CW (from screen view)",
      instruction: "Hold FLAT (screen up) and SPIN CLOCKWISE (viewed from screen side). Keep spinning slowly.",
      expect: "gz should be NEGATIVE (CW from screen = negative gyro Z)",
    },
    {
      name: "SPIN CCW (from screen view)",
      instruction: "Hold FLAT (screen up) and SPIN COUNTER-CLOCKWISE. Keep spinning slowly.",
      expect: "gz should be POSITIVE (CCW from screen = positive gyro Z)",
    },
  ];

  const results = [];

  for (let i = 0; i < poses.length; i++) {
    const pose = poses[i];
    console.log(`\n\n── POSE ${i + 1}/${poses.length}: ${pose.name} ──`);
    console.log(`   ${pose.instruction}`);
    console.log(`   Expected: ${pose.expect}\n`);
    await ask("   Hold steady, then press Enter to capture (1.5s)...");

    const captured = await captureSamples(1500);
    if (captured.length === 0) {
      console.log("   ⚠ No samples captured! Is the device sending?");
      results.push({ name: pose.name, samples: 0 });
      continue;
    }

    const r = {
      name: pose.name,
      samples: captured.length,
      ax: avg(captured, "ax"),
      ay: avg(captured, "ay"),
      az: avg(captured, "az"),
      gx: avg(captured, "gx"),
      gy: avg(captured, "gy"),
      gz: avg(captured, "gz"),
    };
    results.push(r);

    console.log(`\n   ✓ Captured ${r.samples} samples:`);
    console.log(`     ax=${r.ax.toFixed(3)}  ay=${r.ay.toFixed(3)}  az=${r.az.toFixed(3)}`);
    console.log(`     gx=${r.gx.toFixed(1)}  gy=${r.gy.toFixed(1)}  gz=${r.gz.toFixed(1)}`);

    // Check dominant axis
    const accelAxes = [
      { name: "ax", val: r.ax },
      { name: "ay", val: r.ay },
      { name: "az", val: r.az },
    ];
    const dominant = accelAxes.reduce((a, b) =>
      Math.abs(a.val) > Math.abs(b.val) ? a : b
    );
    console.log(
      `     Dominant: ${dominant.name} = ${dominant.val.toFixed(3)} (${dominant.val > 0 ? "+" : "-"})`
    );
  }

  // ── Summary ──
  console.log("\n\n╔══════════════════════════════════════════════════╗");
  console.log("║              CALIBRATION RESULTS                 ║");
  console.log("╚══════════════════════════════════════════════════╝\n");

  console.log("Pose                    |   ax    |   ay    |   az    |  gz (dps)");
  console.log("────────────────────────┼─────────┼─────────┼─────────┼──────────");
  for (const r of results) {
    if (r.samples === 0) {
      console.log(`${r.name.padEnd(24)}| (no data)`);
      continue;
    }
    console.log(
      `${r.name.padEnd(24)}| ${fmt(r.ax).padStart(7)} | ${fmt(r.ay).padStart(7)} | ${fmt(r.az).padStart(7)} | ${fmt(r.gz).padStart(8)}`
    );
  }

  // ── Axis derivation ──
  console.log("\n── DERIVED AXIS MAPPING ──\n");

  const flat_up = results[0];
  const flat_down = results[1];
  const usb_down = results[2];
  const usb_up = results[3];
  const right_down = results[4];
  const left_down = results[5];
  const spin_cw = results[6];
  const spin_ccw = results[7];

  if (flat_up?.samples && flat_down?.samples) {
    const zAxis = flat_up.az > 0 ? "+Z = screen OUT" : "-Z = screen OUT";
    console.log(`Screen normal: ${zAxis} (flat up: az=${flat_up.az.toFixed(3)}, flat down: az=${flat_down.az.toFixed(3)})`);
  }
  if (usb_down?.samples && usb_up?.samples) {
    const yAxis = usb_down.ay > 0 ? "+Y = toward TOP (away from USB)" : "-Y = toward TOP";
    console.log(`Vertical:      ${yAxis} (USB down: ay=${usb_down.ay.toFixed(3)}, USB up: ay=${usb_up.ay.toFixed(3)})`);
  }
  if (right_down?.samples && left_down?.samples) {
    const xAxis = left_down.ax > 0 ? "+X = LEFT edge" : "+X = RIGHT edge";
    console.log(`Horizontal:    ${xAxis} (left down: ax=${left_down.ax.toFixed(3)}, right down: ax=${right_down.ax.toFixed(3)})`);
  }
  if (spin_cw?.samples && spin_ccw?.samples) {
    console.log(`Spin CW:       gz=${spin_cw.gz.toFixed(1)} dps`);
    console.log(`Spin CCW:      gz=${spin_ccw.gz.toFixed(1)} dps`);
    console.log(`Gyro Z sign:   ${spin_ccw.gz > spin_cw.gz ? "CCW = positive (right-hand rule)" : "CW = positive (LEFT-hand rule)"}`);
  }

  // ── Zero offsets ──
  if (flat_up?.samples) {
    console.log(`\n── ZERO OFFSETS (at rest, flat screen up) ──`);
    console.log(`  ax offset: ${flat_up.ax.toFixed(4)}g (should be 0)`);
    console.log(`  ay offset: ${flat_up.ay.toFixed(4)}g (should be 0)`);
    console.log(`  az offset: ${(flat_up.az - 1.0).toFixed(4)}g (should be 0, measured-1g)`);
    console.log(`  gx drift:  ${flat_up.gx.toFixed(2)} dps (should be 0)`);
    console.log(`  gy drift:  ${flat_up.gy.toFixed(2)} dps (should be 0)`);
    console.log(`  gz drift:  ${flat_up.gz.toFixed(2)} dps (should be 0)`);
  }

  console.log("\n── DONE ──\n");
  client.close();
  rl.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
