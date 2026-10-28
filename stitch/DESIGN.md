---
name: Kinetic Volt
colors:
  surface: '#111317'
  surface-dim: '#111317'
  surface-bright: '#37393e'
  surface-container-lowest: '#0c0e12'
  surface-container-low: '#1a1c20'
  surface-container: '#1e2024'
  surface-container-high: '#282a2e'
  surface-container-highest: '#333539'
  on-surface: '#e2e2e8'
  on-surface-variant: '#bbcbb5'
  inverse-surface: '#e2e2e8'
  inverse-on-surface: '#2f3035'
  outline: '#859581'
  outline-variant: '#3c4b39'
  surface-tint: '#21e54e'
  primary: '#73ff7b'
  on-primary: '#00390b'
  primary-container: '#22e54e'
  on-primary-container: '#006119'
  inverse-primary: '#006e1e'
  secondary: '#f5fff3'
  on-secondary: '#003919'
  secondary-container: '#34ff8c'
  on-secondary-container: '#007239'
  tertiary: '#ffdada'
  on-tertiary: '#680017'
  tertiary-container: '#ffb3b4'
  on-tertiary-container: '#a8002b'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#6fff79'
  primary-fixed-dim: '#21e54e'
  on-primary-fixed: '#002204'
  on-primary-fixed-variant: '#005314'
  secondary-fixed: '#60ff98'
  secondary-fixed-dim: '#00e478'
  on-secondary-fixed: '#00210c'
  on-secondary-fixed-variant: '#005227'
  tertiary-fixed: '#ffdad9'
  tertiary-fixed-dim: '#ffb3b4'
  on-tertiary-fixed: '#40000a'
  on-tertiary-fixed-variant: '#920024'
  background: '#111317'
  on-background: '#e2e2e8'
  surface-variant: '#333539'
typography:
  display-hero:
    fontFamily: Space Grotesk
    fontSize: 56px
    fontWeight: '700'
    lineHeight: 60px
    letterSpacing: -0.04em
  display-hero-mobile:
    fontFamily: Space Grotesk
    fontSize: 42px
    fontWeight: '700'
    lineHeight: 46px
    letterSpacing: -0.03em
  headline-lg:
    fontFamily: Space Grotesk
    fontSize: 32px
    fontWeight: '700'
    lineHeight: 38px
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Space Grotesk
    fontSize: 26px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Space Grotesk
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  metric-huge:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 52px
    letterSpacing: -0.03em
  metric-md:
    fontFamily: Space Grotesk
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 32px
    letterSpacing: -0.02em
  body-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 17px
    fontWeight: '500'
    lineHeight: 26px
  body-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 22px
  body-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Space Grotesk
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 18px
    letterSpacing: 0.02em
  label-md:
    fontFamily: Space Grotesk
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.04em
  label-sm:
    fontFamily: Space Grotesk
    fontSize: 10px
    fontWeight: '700'
    lineHeight: 12px
    letterSpacing: 0.06em
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 3rem
---

## Brand & Style

This design system is engineered for a high-intensity, habit-building fitness tracker and workout record mobile web app. Built around the psychology of micro-commitments and relentless kinetic momentum, the visual identity pairs the dark, focused environment of modern performance telemetry with the raw adrenaline of neon athletic gear.

### Brand Personality & Tone
- **Electric & Focused:** High visual contrast strips away cognitive friction, allowing users to log sets, track reps, and assess streaks in split-second intervals during exhausting sessions.
- **Relentless & Encouraging:** Acknowledging the friction of habit retention with cheeky, self-aware wit while maintaining uncompromised athletic rigor.
- **Precision Performance:** Crisp metric displays, ultra-legible readouts, and mechanical precision inspired by elite sports chronometers.

### Visual Style: High-Contrast Cyber-Athletic
The interface relies on deep, non-reflective charcoal canvas layers (`#0C0E12`, `#14181F`, `#1C222B`) punctuated by a singular, piercing blast of **Hyper Volt Neon Green** (`#22E54E`). Heavy typographic weight, punchy numbers, tactile pill buttons, and generous finger-friendly interactive zones deliver an interface that feels like a sports wearable amplified for mobile screens.

## Colors

The palette is tuned specifically for OLED depth, low-light gym conditions, and direct outdoor sunlight legibility. The philosophy strictly limits high-chroma pigmentation to functional alerts, dynamic streaks, and interactive triggers, preserving the potency of the neon accent.

### Color Tiers
- **Primary (`#22E54E` - Hyper Volt):** The core pulse. Used for primary CTAs, active streak nodes, progress rings, completion states, and dominant key metrics.
- **Secondary (`#00FF87` - Kinetic Mint):** A high-vibration gradient anchor paired with Hyper Volt for milestone badges, energy charts, and motivational achievements.
- **Tertiary (`#FF3B56` - Redline Strike):** Reserved strictly for drop-offs, streak break warnings, critical fatigue states, and irreversible destructive actions (e.g., delete log).
- **Neutral Base (`#0F1115` - Pitch Charcoal):** The foundational substrate. Deep enough to optimize contrast and battery usage without the harsh starkness of absolute `#000000`.

### Surface Architecture
- **Canvas Base:** `#0A0C0F`
- **Surface Primary (Cards, Sheets):** `#141820`
- **Surface Elevated (Floating overlays, modal sheets):** `#1C222D`
- **Surface Interactive (Input fields, unselected chips):** `#252D3B`
- **Border Subtle:** `rgba(255, 255, 255, 0.08)`
- **Border Active/Focus:** `rgba(34, 229, 78, 0.6)`
- **Text On Surface (High Emph):** `#FFFFFF`
- **Text Subdued (Secondary metadata):** `#8E9AA8`
- **Text Disabled / Gridlines:** `#485362`

## Typography

The type system blends the energetic, technical geometric curves of **Space Grotesk** with the balanced, humanist legibility of **Plus Jakarta Sans**.

### Roles & Execution
- **Space Grotesk (Display, Headlines, Metrics & Badges):** Delivers a tech-forward, high-octane voice. Numerical glyphs feature tabular-like structural clarity, making sets, reps, timers, and calorie counts pop off the canvas.
- **Plus Jakarta Sans (Body, Microcopy, Guidance):** Handles longer workout notes, system descriptions, and habit coaching with soft readability and reduced eye strain in dark environments.
- **Metrics Styling:** All vital tracking figures must leverage tabular figure variants (`font-variant-numeric: tabular-nums`) to prevent horizontal jitter during live timer ticks and counter updates.
- **Uppercase Labels:** Category badges, day tags (MON, TUE, WED), and workout phases (WARMUP, WORKING SET) use `label-sm` or `label-md` with extended letter-spacing for razor-sharp glanceability.

## Layout & Spacing

Designed mobile-first with strict thumb-zone ergonomics for athletes with sweaty, shaking hands or limited dexterity mid-workout.

### Layout Mechanics
- **Mobile Container:** Fluid single-column layout capped at an optimal maximum width of 480px on desktop or tablet viewports, centered with background masking.
- **Thumb Reach Architecture:** High-frequency workout inputs, rapid "+1" counters, and the primary session completion button are locked into the bottom 40% of the viewport (Bottom Navigation & Floating Action Bars).
- **Rhythm & Grid:** Built upon a 4px/8px modular base. Compact gaps (`space-xs`, `space-sm`) keep modular exercise metrics bundled as single perceptual units, while generous module margins (`space-lg`, `space-xl`) clearly demarcate exercise blocks.
- **Bottom Clearance:** Standard bottom padding of `5.5rem` on all scrollable screens prevents floating action buttons and persistent habit navigation bars from obscuring the final item.

## Elevation & Depth

This design system avoids traditional blurry grey shadows, which produce a muddy aesthetic on dark surfaces. Instead, depth is established through **Tonal Layer Stacking**, **Ghost Outlines**, and **Neon Backlight Diffusion**.

### Elevation Hierarchy
1. **Level 0 (Canvas):** Pure foundation (`#0A0C0F`). Zero elevation. Hosts background ambient mesh glows.
2. **Level 1 (Cards & Tile Surfaces):** `#141820` with a 1px perimeter outline of `rgba(255, 255, 255, 0.06)`. No drop shadow.
3. **Level 2 (Active/Selected Cards):** `#1A202C` bordered by `rgba(34, 229, 78, 0.35)`. Subtle directional top highlight for tactile presence.
4. **Level 3 (Modals, Overlays, Sticky CTAs):** `#202735` with heavy backdrop-filter blur (`backdrop-filter: blur(16px)` at 85% opacity) accompanied by an ambient halo drop: `box-shadow: 0 12px 32px -4px rgba(0, 0, 0, 0.7)`.

### Neon Radiance (The "Ignition" Effect)
Primary interactive controls and 3-day completion milestone badges utilize a focused neon luminescence:
- **Glow Shadow:** `box-shadow: 0 0 24px rgba(34, 229, 78, 0.35), 0 4px 12px rgba(0, 0, 0, 0.5)`
- **Pressed State:** The glow drops in radius (`0 0 12px rgba(34, 229, 78, 0.5)`), visually compressing the component beneath the thumb.

## Shapes

The shape system adopts a bold, curvaceous **pill-forward language** (Roundness level 3). Highly radiused geometric primitives soften the dark aesthetic, delivering an athletic, tech-apparel feel reminiscent of aerodynamic performance equipment.

### Radius Assignments
- **Full Pill (`rounded-full` / `9999px`):** Primary action buttons, day status pills, quick tally badges, and interactive segment tabs.
- **Super-Curve Cards (`rounded-3xl` / `1.75rem` - `2rem`):** Primary tracking containers, weekly streak visualizers, and workout log summaries.
- **Inner Modules (`rounded-2xl` / `1rem` - `1.25rem`):** Nested metric boxes inside exercise cards (e.g., individual Set/Weight/Rep input containers).
- **Micro Elements (`rounded-lg` / `0.5rem`):** Tooltips, numerical steppers, and discrete status pips.

## Components

### Buttons
- **Primary CTA (Full Pill):** Sized at a minimum height of 56px for effortless thumb landing. Background: Solid `#22E54E`; Text: Solid `#0A0C0F` (heavy weight); Box-shadow: Neon glow. Hover/active produces micro-scale compression (`transform: scale(0.98)`).
- **Secondary Action:** Ghost pill with 1.5px border `rgba(255, 255, 255, 0.2)` on surface `#141820`. Text: White.
- **Tally / Increment Buttons:** Circular 48x48px touch targets with embedded high-contrast icons (+ / -) in elevated charcoal containers.

### Streak Tracker ("3-Day Habit" Loop)
- **Trio Node Strip:** A signature component consisting of 3 connected capsule or circular indicator nodes. 
  - *Day 1 & Day 2:* Filled with vibrant Neon Volt once checked off.
  - *Day 3 (The Milestone):* Larger node with an animated pulsing neon ring and crown or flame icon.
  - *Missed State:* Outlined in tertiary `#FF3B56` with a muted slash mark, offering quick-recovery CTAs.

### Cards & Habit Containers
- Surface: `#141820` with `2rem` rounded corners and `1.25rem` internal padding.
- Equipped with a high-contrast top-header row displaying the exercise name in `headline-sm` alongside an exercise category pill tag (`label-sm`).
- Internal sets structured via clean zebra-striped or surface-differentiated nested rows (`#1B222E`).

### Chips & Segmented Controls
- **Filter Chips:** Pill-shaped, height 36px. Unselected state is dark charcoal `#1C222D` with secondary grey text. Selected state inverts directly into Hyper Volt background with pitch-black typography.

### Form Inputs & Steppers
- Input containers feature a minimum height of 52px, heavy monospace or Space Grotesk numerals (`metric-md`), center-aligned for fast rep/weight logging.
- Background: `#12161E`; Active border: `#22E54E`.

### Progress Rings & Chronometers
- SVG stroke meters with dark track background (`rgba(255, 255, 255, 0.08)`) and energetic `#22E54E` to `#00FF87` gradient stroke tips. Rounded line caps emphasize smooth, continuous motion.