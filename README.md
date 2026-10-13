# Readme Kit

A frontend-only tool for building animated, custom SVG banners for your GitHub profile. 

GitHub’s image proxy (camo) makes it difficult to get fonts and animations working in READMEs. Readme Kit handles the messy parts like embedding Google Fonts as Base64 so you can focus on making your profile look good without fighting the proxy.

## Examples
Here are a few designs you can easily create!

| Terminal | Arcade | Clean |
| :---: | :---: | :---: |
| [![Terminal](./assets/terminal.svg)](https://mohabhindawy.github.io/readme-kit/) | [![Arcade](./assets/sci-fi.svg)](https://mohabhindawy.github.io/readme-kit/) | [![Clean](./assets/ambient.svg)](https://mohabhindawy.github.io/readme-kit/) |

*Note: The links only work because the markdown wraps the image; GitHub's proxy strips `<a>` tags inside raw SVG files.*

## What it can do
- **Multi-Sentence:** Cycles through up to 6 custom text lines.
- **Animations:** Supports typewriter effects (smooth or character-by-character), plus motion presets like Float, Bob, Sway, and Orbit.
- **Paint Engine:** Create solid colors or multi-stop gradients with control over opacity, brightness, and basic animation (rotation/movement).
- **GitHub-Friendly:** It bakes Google Fonts into the SVG markup as Base64 strings. This is the only way to get custom fonts to actually render on GitHub's READMEs.
- **VFX Layers:** Includes common effects like Scanlines, Matrix Rain, Border Beams, and Aurora glows.

## Tech Stack
- **Framework:** React 18+ (Hooks-based state).
- **Build Tooling:** Vite.
- **Approach:** Everything is calculated in the browser and dispatched to a programmatic SVG generator. There is no backend, no database, and nothing is stored—it's just static HTML/JS/SVG.

## Local Development
Clone the repo and run it locally:

```bash
git clone https://github.com/MohabHindawy/readme-kit.git
cd readme-kit
npm install
npm run dev
```

## Deployment
This is set up to deploy to GitHub Pages automatically via Actions. Pushing to `main` triggers a build (via the workflow in `.github/workflows/deploy.yml`) which runs the production build in the `readme-kit/` folder and pushes the `dist/` output to your Pages site.

## How to use it
1. Use the [Live App](https://mohabhindawy.github.io/readme-kit/) to design your banner.
2. Click **Download .svg** (or copy the raw SVG code).
3. Save the file in your repo (e.g., `assets/banner.svg`).
4. Add the README snippet you copied:
   ```markdown
   ![Banner Name](./assets/banner.svg)
   ```

## Known Limitations
* **GitHub's Proxy (Camo):** Some animations don't play nice with GitHub's image proxy. `animateTransform`, `stroke-dashoffset`, and some CSS transforms are hit-or-miss. Simple rotate/opacity effects are generally safe. Always push to your profile and check if it animates before relying on it.
* **Fonts:** It only fetches the Latin subset of Google Fonts. The font weight slider is largely for system fonts; custom fonts are currently locked to their standard weight.
* **State:** Everything is local to your browser session. If you refresh, your configuration resets.
* **Layout:** Effects render behind the text layer. There's no Z-index control yet.
* **Mobile:** Drag-and-drop reordering for sentence rows and gradient stops isn't fully touch-optimized; use the arrow buttons as a fallback.

## Contributing
Issues and PRs are welcome. If you want to add a new effect, try to keep it CSS or SMIL-only (no `<script>` tags) so it stands a chance of passing the GitHub proxy.

## License
Distributed under the MIT License. See `LICENSE` for details.
