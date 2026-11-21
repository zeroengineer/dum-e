# Gesture controls

The camera preview in the corner is mirrored: move your hand right and it moves right on screen.
The large readout at the bottom of the screen names the gesture being recognised, and the Gestures
panel highlights the matching row.

## The gestures

| Gesture   | How to make it                                    | How it is detected                                                             |
| --------- | ------------------------------------------------- | ------------------------------------------------------------------------------ |
| Move      | Move a hand in view                               | Palm centre position, smoothed                                                 |
| Open palm | All five fingers straight, palm toward the camera | Four fingers straight (knuckle-to-tip distance over bone length), not pinching |
| Fist      | Curl all fingers into the palm                    | Four fingers folded with their tips close to the palm centre                   |
| Pinch     | Touch thumb tip to index fingertip                | Thumb–index tip distance relative to palm length, index finger not folded      |
| Point     | Index finger straight, other fingers curled       | Index straight while middle, ring and little fingers are folded                |
| Swipe     | Flick an open hand left, right, up or down        | Palm travel, speed and straightness over the last ~0.3 s                       |
| Two hands | Show both hands, move them apart or together      | Change in distance between the two palm centres                                |

How recognition behaves:

- A pose must hold for about a tenth of a second before it registers, and only one pose is active
  per hand at a time.
- A gesture releases at a lower confidence than it starts at, so it does not flicker at the edge.
- Gestures survive a tracking drop-out of up to 0.3 s.
- A swipe cannot fire again for 0.75 s, is ignored for the first 0.35 s after a hand appears, and
  never fires while that hand is pinching, pointing or making a fist.
- Two-hand distance changes under about 1% are ignored as jitter.
- Settings → Gesture sensitivity makes all of this stricter or more eager.

All measurements are relative to the size of your palm, so distance from the camera does not matter.

## Mouse and keyboard

The mouse is a virtual right hand and produces the same gestures. It works over the 3D scene, not
over the panels.

| Input                              | Gesture                 |
| ---------------------------------- | ----------------------- |
| Move the mouse                     | Move                    |
| Hold the left button (drag)        | Pinch                   |
| Hold the right button, or hold `F` | Fist                    |
| Hold `O`                           | Open palm               |
| Hold `P`                           | Point                   |
| Mouse wheel                        | Two hands (up = apart)  |
| `Shift` + wheel while dragging     | Wrist roll              |
| Arrow keys                         | Swipe in that direction |

This can be switched off in Settings → Mouse and keyboard control.

## Particle Universe

| Gesture             | Effect                                                                    |
| ------------------- | ------------------------------------------------------------------------- |
| Move                | Particles near your hand are gently pushed aside                          |
| Open palm           | Push particles away and expand the whole cloud                            |
| Fist                | Pull particles toward your hand and tighten the cloud                     |
| Pinch and move      | Grab the clump under your fingers and drag it; it springs back on release |
| Two hands apart     | Expand the formation                                                      |
| Two hands together  | Compress the formation                                                    |
| Swipe left or up    | Next formation                                                            |
| Swipe right or down | Previous formation                                                        |

Formations: sphere, galaxy, heart, DNA, spiral, wave, explosion. The Controls panel sets formation,
particle count, speed, size, spread and colour.

## Object Manipulation Lab

| Gesture                       | Effect                                                                  |
| ----------------------------- | ----------------------------------------------------------------------- |
| Move                          | A ring follows your hand; the object under it is highlighted            |
| Point                         | Select the object you point at (cyan outline)                           |
| Pinch                         | Grab the object under your fingers, or the selected one (amber outline) |
| Move while pinching           | Carry the object                                                        |
| Turn the wrist while pinching | Rotate the object about the line of sight                               |
| Two hands                     | Scale the held or selected object                                       |
| Open palm                     | Let go; with nothing held, clear the selection                          |
| Fist                          | Shockwave: objects are thrown outward and settle back                   |

Each hand can hold its own object. A pinch that just misses still picks the nearest object within a
small margin. Swipe does nothing here on purpose, so carrying an object quickly cannot change the
selection; use the Select next button instead. Scaling needs a held or selected object, so with
the mouse, click an object before using the wheel.

## Galaxy Explorer

| Gesture             | Effect                            |
| ------------------- | --------------------------------- |
| Move                | Turn the galaxy, as if holding it |
| Open palm           | Expand the galaxy                 |
| Fist                | Contract the galaxy               |
| Two hands apart     | Zoom in                           |
| Two hands together  | Zoom out                          |
| Swipe left or up    | Next configuration                |
| Swipe right or down | Previous configuration            |

With the mouse the galaxy turns only while you drag, so crossing the screen to reach a slider does
not spin it. Every parameter (stars, arms, twist, core, spread, thickness, bar, speed, colours,
zoom) is also a slider or button in the Controls panel.

## Holo Globe

The camera picture fills the screen and a holographic globe sits in it, on your hand.

| Gesture             | Effect                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| Show one hand       | The globe rides just beyond your palm, toward your fingers                 |
| Move hand nearer    | The globe grows; farther away, it shrinks                                  |
| Two hands           | The globe sits between your palms and fills the gap                        |
| Two hands apart     | Grow                                                                       |
| Two hands together  | Shrink                                                                     |
| Pinch and move      | The globe stays put and spins under your hand; turn your wrist to twist it |
| Fist                | Fold it up into a small bright ball                                        |
| Open palm           | Send out a pulse                                                           |
| Swipe left or up    | Next effect                                                                |
| Swipe right or down | Previous effect                                                            |
| Take hands away     | The globe stays where you left it, at the size you made it                 |

Looks: Earth (dotted continents) and Grid (latitude and longitude lines).

Effects, one at a time, cross-fading when you change:

- **Hologram scan**: fine bands of light drifting up the globe, a bright line sweeping through it,
  a faint flicker and an occasional glitch where a slice jumps sideways.
- **None**: the plain globe.

The Controls panel sets look, effect, colour, size, spin speed, glow, how much the camera picture
is dimmed, and how tightly the globe follows your hand.

With the camera off the globe floats in a starfield and the mouse carries it: move to carry, drag
to spin, wheel to resize. With the camera on the mouse no longer carries it, so reaching for a
button does not pull it out of your hand; drag and wheel still work.

## Global keys

| Key        | Action                              |
| ---------- | ----------------------------------- |
| `1` to `4` | Switch world                        |
| `R`        | Reset the current world             |
| `T`        | Turn the camera on or off           |
| `Esc`      | Close Settings or skip the tutorial |

## Checking with a real hand

Automated tests cannot put a hand in front of the camera, so these need a person. In good light,
40–80 cm from the camera:

1. Start experience, allow the camera. The preview appears with dots on your hand; the status reads
   Tracking and names the hand in view.
2. Hold up your right hand. The status should say Right hand. If it says Left, set
   `swapHandedness: true` in `src/vision/landmarks/LandmarkProcessor.ts`.
3. Make each pose in turn (open palm, fist, pinch, point). The readout should name it within a
   moment and drop it when you relax.
4. Flick an open hand sideways once: one Swipe, not two.
5. Show both hands and move them apart: Two hands appears and the scene zooms or scales smoothly.
6. Cover the camera for a moment mid-pinch: the pinch should survive a blink and end after a longer loss.
7. In each world, try every row of its table above.
8. In Holo Globe, hold up one open hand: the globe should sit just above your palm and stay on it
   as you move, with no visible offset to one side. If it sits beside your hand, the picture and
   the positions disagree; report the screen and camera shapes.

If poses are missed or trigger too easily, adjust Gesture sensitivity first. The thresholds
themselves live in `src/gestures/recognizers/`.
