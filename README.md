# SVG Crafter 🎨✨

SVG Crafter is an entirely client-side web application designed to help developers and designers instantly elevate their GitHub profile pages. Effortlessly create custom, animated, and highly interactive SVG banners that render perfectly anywhere — including behind GitHub's strict anonymous image proxy.

## 🚀 Live Showcase

See what you can build with SVG Crafter! Here are a few live examples generated straight from the platform. Drop your exported files into an `assets/` directory in your repository to replicate this visual style:

- [Cyberpunk Vibe](#)
- [Retro Sci-Fi Vibe](#)
- [Ambient Elegance](#)

To link your banner to a profile or website, the platform automatically generates a clickable markdown wrap. This matters because SVG `<a>` tags are inert once GitHub's camo proxy renders your banner as a plain `<img>` — the link only works because the markdown snippet wraps the image, not because of anything inside the SVG itself.

## 🔥 Key Features

- **Multi-Sentence Cycle Engine**: Input up to 6 custom text lines that cycle seamlessly.
- **Typing & Transition Controls**: Choose between fluid smooth reveals or granular letter-by-letter typewriter strokes, complete with toggleable flashing cursors, custom delay weights, and hold durations.
- **Granular Text Motion**: Layer unique micro-animations on top of your transitions — including Float, Bob, Sway, Pulse, Wobble, and Orbit.
- **Pro-Tier Paint Systems**: Build deep solid or linear multi-stop gradient styles. Features real-time color reordering, opacity shifting, variable brightness control, and automated rotating or moving gradient animations.
- **GitHub Proxy Compatibility via Self-Contained Embedding**: External web fonts usually break on GitHub READMEs because of proxy filters. SVG Crafter bypasses this by fetching Google Fonts on the fly, converting the binary text shapes into basic-latin woff2 rules, and hardcoding them directly inside the SVG `<defs>` as a Base64 URI. Your typography stays fully intact.
- **Categorized VFX Layering Matrix**: Mix and match high-fidelity CSS and path effects categorized cleanly into families:
  - **Ambient**: Aurora, Blurry Lights, Shimmer, Scanlines, CRT Vignette, Sparkles
  - **Motion**: Particles, Confetti, Matrix Rain, Sound Waves, Synthwave Grid, Starfield
  - **Accent**: Lightning Bolts, Pulse Rings, Border Comet Beams

## 🛠️ Tech Stack & Architecture

- **Framework**: React 18+ (Functional Hooks, Custom Drag-and-Drop State Engine)
- **Build Tooling**: Vite (Lightning-fast HMR)
- **Design Pattern**: Decoupled functional pipeline. Real-time text dimensional calculations are processed via a DOM canvas layer in the viewport and immediately dispatched to a zero-dependency programmatic SVG markup generator.
- **Environment Constraints**: 100% client-side. No backend, no accounts, no stored user data.

## 💻 Local Development Setup

Get the application running on your local machine in under a minute:

**1. Clone the Repository**

```bash
git clone https://github.com/YOUR_USERNAME/svg-crafter.git
```

**2. Install Dependencies & Launch**

Because the application lives inside the `svgcrafter` subfolder, make sure to navigate into it before running the installation:

```bash
cd svgcrafter
npm install
npm run dev
```

Your local build should now be running smoothly at `http://localhost:5173/`!

## ☁️ Deployment

This project is configured to deploy automatically to GitHub Pages using GitHub Actions. Whenever code is pushed to the `main` branch, the workflow located at `.github/workflows/deploy.yml` triggers automatically. It steps into the `svgcrafter` directory, installs dependencies, builds the production assets via Vite, and pushes the `/dist` output to the live GitHub Pages URL.

## 📋 How to Deploy to Your GitHub Profile

1. **Design**: Load up your local environment or the live URL and fine-tune your settings via the control dashboard.
2. **Export**: Type your preferred output filename and click **Download .svg** (or click **Copy SVG** to grab the raw markup).
3. **Commit**: Place the output file into a folder inside your profile repository (e.g., `assets/banner.svg`).
4. **Markdown Snippet**: Copy the automatically generated snippet directly out of the Export UI block and drop it right at the top of your profile README:

```markdown
[![Welcome Banner](./assets/banner.svg)](https://github.com/YOUR_USERNAME)
```

## ⚠️ Known Limitations

- **GitHub camo proxy support is unverified** for several animation techniques: `animateTransform` translate (used by Scanlines, Shimmer, Particles, Matrix Rain, Confetti), `stroke-dashoffset` animation (Border Comet Beams), gradient `gradientTransform` translate, and CSS `transform` with `transform-box: fill-box` (all text motion presets, plus Slide/Zoom/Blur transitions). Rotate-only gradients and opacity-based effects are confirmed safe. Test a real commit to your profile README before relying on the rest.
- **Google Fonts** only fetch a single weight — the weight slider mainly affects system fonts.
- **Font suggestions** are pulled from a bundled font list, not the live Google Fonts catalogue.
- **Nothing persists across reloads** — panel state, font choice, and your full config reset on refresh.
- **Effects always render below the text layer** — there's no layer-ordering control yet.
- **Touch drag reorder** isn't supported for gradient stops or sentence rows; use the arrow buttons as a fallback on mobile.

## 🤝 Contributing

Issues and PRs are welcome. If you're adding a new VFX effect, keep it CSS/SMIL-only (no `<script>`) so it survives GitHub's camo proxy.

## 📄 License

Distributed under the MIT License. Check out the `LICENSE` file included in the root folder of this project for full details regarding open permissions.