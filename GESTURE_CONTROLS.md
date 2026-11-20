# Gesture controls

The preview in the corner is mirrored: move your hand right and it moves right on screen. The HUD
shows which gesture is being recognised for each hand in real time.

## The gestures

| Gesture     | How to make it                                    | How it is detected                                              |
| ----------- | ------------------------------------------------- | --------------------------------------------------------------- |
| Open palm   | All fingers straight, hand open toward the camera | Four fingers extended (reach ratio), thumb away from the palm   |
| Closed fist | Curl all fingers into the palm                    | Four fingertips folded back toward the wrist                    |
| Pinch       | Touch thumb tip and index fingertip               | Thumb–index tip distance relative to palm size, with hysteresis |
| Point       | Index finger straight, other fingers curled       | Index extended while middle, ring and little fingers are folded |
| Swipe       | Move the hand quickly left, right, up or down     | Palm travel and speed over a ~300 ms window, one dominant axis  |
| Two hands   | Show both hands, move them apart or together      | Change in distance between the two palm centres                 |
| Move        | Just move a hand                                  | Palm centre position, smoothed                                  |

Poses need to be held for a moment (about a tenth of a second) before they register, and they
survive brief tracking drop-outs. A swipe cannot fire again for about 0.7 s.

## Particle Universe

| Gesture            | Effect                                         | Mouse / keyboard             |
| ------------------ | ---------------------------------------------- | ---------------------------- |
| Move hand          | Particles ripple away from your hand           | Move the mouse               |
| Open palm          | Expand the formation and push particles away   | Hold `Space`                 |
| Closed fist        | Pull particles toward your hand                | Hold right button or `Shift` |
| Pinch and drag     | Grab the nearby group of particles and drag it | Left-button drag             |
| Two hands apart    | Expand the formation                           | Wheel up                     |
| Two hands together | Compress the formation                         | Wheel down                   |
| Swipe left / right | Previous / next formation                      | `←` / `→`                    |

## Object Manipulation Lab

| Gesture             | Effect                                | Mouse / keyboard         |
| ------------------- | ------------------------------------- | ------------------------ |
| Point               | Select the object you point at        | Hover                    |
| Pinch               | Grab the selected (or nearest) object | Left-button press        |
| Move while pinching | Move the object                       | Drag                     |
| Rotate wrist        | Rotate the grabbed object             | `Q` / `E` while dragging |
| Two hands           | Scale the selected object             | Wheel                    |
| Open palm           | Release and deselect                  | `Space`                  |
| Closed fist         | Shockwave from the selected object    | Right button or `Shift`  |

Selection needs the pointer to rest on an object briefly, which prevents objects being picked up
by a hand that is just passing through. Wrist rotation is only applied when the hand is tracked
confidently and the change between frames is plausible.

## Galaxy Explorer

| Gesture            | Effect                               | Mouse / keyboard             |
| ------------------ | ------------------------------------ | ---------------------------- |
| Move hand          | Rotate the galaxy                    | Move the mouse               |
| Open palm          | Expand the galaxy                    | Hold `Space`                 |
| Closed fist        | Contract the galaxy                  | Hold right button or `Shift` |
| Two hands apart    | Zoom in                              | Wheel up                     |
| Two hands together | Zoom out                             | Wheel down                   |
| Swipe              | Next / previous galaxy configuration | `←` / `→`                    |

Every galaxy parameter is also available as a slider or button in the control panel.

## Global keys

| Key         | Action                        |
| ----------- | ----------------------------- |
| `1` `2` `3` | Switch environment            |
| `R`         | Reset the current environment |
| `T`         | Toggle hand tracking          |
| `Esc`       | Close the open panel          |
