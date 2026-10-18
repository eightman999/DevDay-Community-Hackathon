# Third-party notices

## Three.js 0.180.0 (r180)

The project uses the fixed npm release `three@0.180.0` from the Three.js project, licensed under the MIT License. `npm install` runs `scripts/prepare-vendor.mjs` to copy the renderer into the deployable asset directory. Published builds include those files; the GitHub source recreates them from the locked dependency.

- `dist/vendor/three.module.js` is the release's `build/three.module.min.js`, renamed for a stable local import path.
- `dist/vendor/three.core.min.js` is the release's corresponding core module.
- The complete copyright and permission notice is preserved in [dist/vendor/THREE-LICENSE.txt](dist/vendor/THREE-LICENSE.txt).
- Project: https://github.com/mrdoob/three.js

The game has no runtime CDN dependencies. Its renderer imports the included local modules.

## Original project assets

`dist/assets/concept-gameplay.svg` is a compact JPEG export of the generated concept image requested in the game's design conversation. It is an art reference, not a captured gameplay frame. The original full-resolution generated image remains in that conversation. The octopus geometry, interface, favicon, procedural stripe texture, sound cues, and gameplay code were created for this prototype.

The project does not include assets from the chameleon game mentioned during ideation.

## Image packaging

The concept art and browser screenshot SVG files are image containers with the original compact JPEG bytes embedded unchanged. They contain no scripts or external resources, and require no image decoder build step.
