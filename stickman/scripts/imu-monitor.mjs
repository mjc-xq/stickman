/**
 * Live IMU monitor — prints axis values from Ably for calibration.
 * Run for N seconds (default 30), prints a reading every 500ms.
 *
 * Usage: node scripts/imu-monitor.mjs [seconds]
 */

import Ably from "ably";
import { config } from "dotenv";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, "..", ".env.local") });

const ABLY_KEY = process.env.NEXT_PUBLIC_ABLY_API_KEY;
if (!ABLY_KEY) { console.error("Missing NEXT_PUBLIC_ABLY_API_KEY"); process.exit(1); }

const duration = (parseInt(process.argv[2]) || 30) * 1000;
const client = new Ably.Realtime({ key: ABLY_KEY, clientId: "monitor" });
const channel = client.channels.get("stickman");

let latest = null;
let count = 0;

client.connection.on("connected", () => {
  console.log("Connected to Ably. Monitoring IMU...\n");
  console.log("  #  |    ax    |    ay    |    az    |    gx    |    gy    |    gz    | pitch  | roll");
  console.log("─────┼──────────┼──────────┼──────────┼──────────┼──────────┼──────────┼────────┼────────");
});

channel.subscribe("imu", (msg) => {
  try {
    latest = typeof msg.data === "string" ? JSON.parse(msg.data) : msg.data;
  } catch {}
});

const start = Date.now();
const interval = setInterval(() => {
  if (Date.now() - start > duration) {
    clearInterval(interval);
    client.close();
    console.log("\nDone.");
    process.exit(0);
  }
  if (!latest) return;
  count++;
  const d = latest;
  const f = (v) => (v >= 0 ? " " : "") + v.toFixed(3);
  console.log(
    `${String(count).padStart(4)} | ${f(d.ax).padStart(8)} | ${f(d.ay).padStart(8)} | ${f(d.az).padStart(8)} | ${f(d.gx).padStart(8)} | ${f(d.gy).padStart(8)} | ${f(d.gz).padStart(8)} | ${f(d.p).padStart(6)} | ${f(d.r).padStart(6)}`
  );
}, 500);
