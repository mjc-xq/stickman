# Plan: 3D Orientation Visualization

**Created:** 2026-03-14 01:30
**Status:** implemented
**Experts consulted:** Three.js/R3F, React/Next.js

## Requirements

3D visualization that reacts to incoming IMU orientation data and orients a 3D model to match the physical device's orientation. New visualization mode on the main web page.

## Architecture

- New `Model3DViz` component using React Three Fiber (@react-three/fiber) + drei helpers
- Receives the smoothed IMU ref (`smooth`) from IMUVisualizer — same data flow as other viz modes
- Computes quaternion orientation from accelerometer pitch/roll, smoothed via slerp
- Renders a stylized M5StickC device model (procedural geometry, no external model files)
- Added as "3D" mode alongside Paint, Stars, Bingo in the mode toggle

## Implementation Steps

### Step 1: Install Three.js dependencies
**Files:** `package.json`
**Complexity:** simple
Installed: `three`, `@react-three/fiber`, `@react-three/drei`, `@types/three`

### Step 2: Create Model3DViz component
**Files:** `stickman/app/components/Model3DViz.tsx`
**Complexity:** medium
- Canvas with R3F, camera at [3,2,4] with 45° FOV
- DeviceModel inner component uses `useFrame` to read `imuRef` each frame
- Computes pitch/roll from accelerometer, builds Euler→Quaternion, slerps at 0.15
- Procedural device model: dark box body, blue screen, button, USB port, LED, orientation cone
- Grid floor, night environment, orbit controls for manual inspection

### Step 3: Add "3D" mode to IMUVisualizer
**Files:** `stickman/app/components/IMUVisualizer.tsx`
**Complexity:** simple
- Added `"3d"` to `VizMode` union type
- Added "3D" button to mode toggle bar
- Renders `<Model3DViz imuRef={smooth} />` when mode is "3d"
- Passes the existing `smooth` ref (continuously updated by animation loop)

## Verification Checklist

- [x] `next build` compiles without errors
- [x] 3D mode renders the device model
- [x] Model orientation responds to IMU data via smooth ref
- [x] Orbit controls allow manual camera rotation
- [x] Mode toggle includes "3D" button
- [x] Other modes (Paint, Stars, Bingo) unaffected
