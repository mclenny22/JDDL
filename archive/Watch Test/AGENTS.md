# AppleWatchScroll project notes

- The page is a dependency-free HTML/CSS/JavaScript Apple Watch home-screen motion experiment in `index.html`.
- The image field is a larger, staggered honeycomb plane inside a clipped watch viewport. It supports pointer drag, wheel/trackpad panning, touch, and arrow-key movement.
- Each tile's horizontal and vertical proximity to the viewport edges controls its scale, opacity, and inward bend. This recreates the Apple Watch grid's curved edge compression.
- User-facing sliders control seeded layout randomness, tile-size variance, scatter, edge curvature, and rotation. Keep drag and motion updates inside `requestAnimationFrame` when extending the behavior.
- `index-v2.html` is an independent editorial interpretation on a light full-screen canvas. It uses a vertical center lens, seeded top-and-bottom disorder, endlessly wrapping vertical-only inertial panning, viscous velocity springs, and rotation-aware collision separation with a 10px minimum visible gap.
- V2 deliberately keeps its layout seed stable while moving; only the Shuffle action regenerates it. Its focus tile is comparatively anchored so neighboring tiles absorb more of the collision displacement.
- V2's top bar can copy the reproducible seed, column count, chaos, and viscosity settings as JSON.
- V2's Order–Chaos slider continuously blends from uniform square cards on a clean rectangular grid to maximum seeded aspect, size, stagger, scatter, and rotation variation. The lens and disorder respond only to vertical distance from the viewport center; horizontal position does not change their intensity.
- Tile position, scale, and rotation use low-stiffness, high-friction velocity integration so rearranging feels thick and connected rather than snappy or elastic. Collision corrections still run after integration to preserve the visible gap while the field settles.
- V2's Thin–Thick viscosity slider controls tile stiffness and friction, transform and opacity response, wheel impulse, and camera momentum as one coordinated material setting. Reduced-motion mode bypasses viscosity and resolves immediately.
- The image set deliberately includes 1:1, 4:5, 16:9, and 9:16 ratios. Preserve all four ratios when changing content.
- Respect `prefers-reduced-motion`; any new animation should provide a reduced-motion path.
- Do not run a browser visual check without asking the user first.
