# Cece Sprite Guide

Full-body sprites of Cece, no background. Wizard hat is her signature element — it sparks, glows, flies off, gets smashed down depending on the action.

Display: 135x240 TFT, portrait orientation.

---

## Boot / Wake Up

**wake-1:** Sitting with eyes closed, head drooping to one side, wizard hat slightly askew.
**wake-2:** Eyes popping open wide, one hand pushing up her glasses, hat straightening — big grin.

## Going to Sleep

**sleep-1:** Yawning with mouth wide open, one arm stretching up, hat tilting back. *(frame 1 of 2)*
**sleep-2:** Curled up sitting, head resting on knees, hat pulled down over eyes, a single "Z" floating up. *(frame 2 of 2 — cycle)*

## Tap (bonked)

**tap-annoyed:** Flinching to one side, one eye squinted shut, hand rubbing the top of her hat.
**tap-angry:** Arms crossed, puffed cheeks, hat knocked crooked — feet planted wide in a huff.

## Gentle Movement (picked up, tilted)

**move-1:** Stumbling to one side, arms out for balance, hat flying off slightly — wide surprised eyes. *(frame 1 of 2)*
**move-2:** Same stumble but leaning the opposite direction, catching her hat with one hand. *(frame 2 of 2 — cycle)*

## Toss — Launched (acceleration spike)

**toss-launch:** Crouching low with knees bent, hat smashed down by force, cheeks rippling — bracing for liftoff.

## Toss — Airborne (freefall)

**toss-air-1:** Floating with arms and legs spread like a starfish, hat drifting above her head, hair flowing up — mouth a perfect O. *(frame 1 of 2)*
**toss-air-2:** Same float but limbs pulled in slightly, eyes squeezed shut, hat further away — screaming with joy/terror. *(frame 2 of 2 — cycle)*

## Toss — Caught, High (>4 feet)

**catch-high:** Landed in a superhero pose, one knee down, one fist on the ground, hat with a dramatic trail — jaw-dropped amazed expression.
**catch-high-alt:** Standing with both arms raised triumphantly, hat sparking with little stars around it.

## Toss — Caught, Medium (2-4 feet)

**catch-med:** Standing with a proud fist pump, other hand on hip, hat sitting perfectly — confident closed-eye smile.
**catch-med-alt:** Doing a little hop with one foot kicked back, peace sign, hat bouncing.

## Toss — Caught, Low (<2 feet)

**catch-low:** Giving a small relieved wave, one hand on her chest, gentle smile — hat slightly tilted.
**catch-low-alt:** Thumbs up with a soft grin, hat secure.

## Toss — Lost (not caught, timeout >3s)

**toss-lost-1:** Tumbling/falling, upside down, hat gone, arms reaching out desperately — panicked eyes. *(frame 1 of 2)*
**toss-lost-2:** Same tumble rotated further, spiral-eyes dizzy, one shoe flying off. *(frame 2 of 2 — cycle)*

## Joystick Mode (tilting to send arrow keys)

**joystick:** Wide power stance, hat on backwards, both hands gripping an invisible steering wheel — focused determined expression.
**joystick-tilt:** Same stance but leaning hard in the tilt direction, one foot lifting off the ground — gritting teeth.

## BLE On

**ble-on:** Tapping the brim of her hat with one finger like casting a connection spell — a little lightning bolt zapping from the hat tip.
**ble-on-alt:** Confident wink, hat glowing at the tip.

## BLE Off

**ble-off:** Pulling her hat down over her face with both hands — peeking out from under the brim, sleepy half-lidded eyes.
**ble-off-alt:** Hands cupped around hat tip, snuffing out the glow like a candle.

## BLE Connected

**ble-connected:** Doing a little fist bump toward the viewer, hat sparking at the tip — excited open-mouth smile.

## Debug Mode

**debug:** Peering through a magnifying glass held up to one eye (eye huge through the lens), hat pushed back on her head, serious inspector expression.
**debug-alt:** Same pose but other hand scratching chin thoughtfully.

---

## Idle / Resting (randomly cycled every 4-12s)

1. **idle-standing:** Standing relaxed, hands behind her back, gentle closed-mouth smile, hat sitting neatly.

2. **idle-wand-twirl:** Holding an invisible wand, spinning it between her fingers like a pencil, watching it with amused eyes — hat slightly tilted.

3. **idle-humming:** Eyes closed, swaying slightly side to side, mouth in a little "o" shape mid-hum. *(2 frames — sway left / sway right, cycle)*

4. **idle-hat-adjust:** Both hands reaching up to adjust her wizard hat, tongue poking out in concentration.

5. **idle-looking-around-1:** Leaning to one side, peering off-screen to the left with curious squinted eyes. *(frame 1 of 2)*
   **idle-looking-around-2:** Same but leaning/peering to the right. *(frame 2 of 2 — cycle)*

6. **idle-sitting:** Sitting cross-legged, chin resting on both hands, elbows on knees — dreamy far-off look.

7. **idle-glasses-push:** Pushing glasses up her nose with one finger, slight smirk.

8. **idle-spell-practice:** Hands outstretched, wiggling fingers like casting a tiny spell, little sparkle dots between her hands — concentrating expression.

9. **idle-yawn:** Mid-yawn, one hand covering mouth, hat drooping — sleepy eyes half shut.

10. **idle-wave:** Looking directly at viewer, big smile, one hand waving.

---

## Summary

| Category | Sprites | Notes |
|---|---|---|
| Boot/Wake | 2 | Sequence |
| Sleep | 2 | 2-frame cycle |
| Tap | 2 | Random pick |
| Movement | 2 | 2-frame cycle |
| Toss Launch | 1 | Brief state |
| Toss Airborne | 2 | 2-frame cycle |
| Toss Caught High | 2 | Random pick |
| Toss Caught Med | 2 | Random pick |
| Toss Caught Low | 2 | Random pick |
| Toss Lost | 2 | 2-frame cycle |
| Joystick | 2 | Tilt-reactive |
| BLE On | 2 | Random pick |
| BLE Off | 2 | Random pick |
| BLE Connected | 1 | Reuse ble-on variant |
| Debug | 2 | Random pick |
| Idle | 12 | 10 poses, 2 have alt frames |
| **Total** | **~38** | |
