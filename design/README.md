# design/ — Reference only (NOT shipped)

Where Stitch / Figma outputs live. **Never paste this as production code** — it won't match Nuxt/Vue/Tailwind. It's visual reference.

- `mockups/` — screenshots of each screen (login.png, dashboard.png, groups.png...). Most useful for Claude Code — it reads layout from the image.
- `stitch-export/` — raw HTML/CSS from Stitch (reference, not code).

## How to use with Claude Code
> "Build the login page in Vue/Nuxt using our `Base*` components and the palette from docs/Startica_DesignPrompt.md. Use `design/mockups/login.png` as the visual reference."

Then: run dev → screenshot result → compare to mockup → refine. (Screenshot-compare-refine loop.)

> The Startica **logo** is NOT reference — it ships. Put it in `public/` (e.g. `public/logo.svg`), not here.
