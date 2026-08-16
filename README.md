# Math Problem Bank · 难题库

English | [中文](README.zh.md)

> **A local-first, image-based math problem library.** Save hard problems and their solution walkthroughs as images, distill them into reusable **methods (招式)**, and let a spaced-repetition engine schedule your reviews — everything stays in your browser (IndexedDB), no backend, no uploads.

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![React](https://img.shields.io/badge/React-19-61dafb?logo=react)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-7-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite)](https://vite.dev)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/h3587729196-cyber/math-problem-bank/pulls)

## Why

You photograph 100 hard problems, understand them once, then forget them all before the exam. This app turns that pile of screenshots into a **method–problem knowledge system**: every problem links to the methods it uses, and every method links back to the problems it solved — so "where I got stuck and how I broke through" becomes reusable technique.

## Features

### Image-first problem bank
Problem images plus **multiple solutions per problem**: each solution can be named, records text steps, and carries a diagram, with a difficulty tag (easy / medium / hard) and a "clever solution" flag. Filter and search by title, source, difficulty, status, tags, solution count and keywords, with a separate "approach notes" search pool.

### Solution theater
From any problem detail, replay a solution step by step like a mini film — animations flow seamlessly with the page and can be interrupted anytime; switch solutions, scrub the timeline, 1×/1.5×/2× speed, and keyboard arrow controls.

### Technique network (3D knowledge graph)
A force-directed graph of methods and problems rendered with three.js: methods as glowing blue nodes (larger = more links), problems as status-colored nodes (green/orange/red), edges by role (core / auxiliary / extension). Click to highlight a neighborhood, **double-click to fly inside a node** and unfold its step chain / solution ring, Esc to return to the overview.

### FSRS-Lite spaced review with forced recall
An FSRS-inspired memory model (difficulty, stability, retrievability; 90% target retention). Each session makes you **think for 20 seconds** before revealing the answer, then grades it (forgot / fuzzy / got it) — collapsing, tuning or doubling the interval accordingly; **3 correct reviews in a row graduates the card**.

### Cognitive growth curve
Hard problems (difficulty 4–5) form their own review pool; every session records "how hard it feels now", drawing a **cognitive curve** (perceived difficulty over time) until the problem graduates.

### Method library & problem↔method links
Methods carry applicability signals, step-by-step procedures, notes and pitfalls (images supported). Explicit links carry a role and remark and are managed from both sides; mastery has 5 levels (aware → mastery) with automatic categorization by usage.

### Clever tricks library
Star any breakthrough step and rate its cleverness (1–5); starred steps flow into a searchable library sortable by level, and every entry traces back to the original problem.

### Analytics report
A professional study report: core KPIs, status trends, time-to-solve, weak spots, mastery / difficulty / cleverness / activity analysis. Filter by month / 90 days / all / custom range with period-over-period comparison; A4-styled, one-click print or PDF export.

### LAN sync
Your phone and computer on the same Wi-Fi stay in sync automatically: data lives on the local server, new devices pull on open, edits push within ~30s; the backup panel also offers manual merge/upload.

### Backup & restore
Local auto-backup (keep the latest N copies), full ZIP export/import (original images + page settings), legacy JSON backup import, and one-click wipe.

## Dynamic particle background

An interactive, physics-driven particle field rendered on a canvas behind the whole app:

- **Elastic particle field** — ~4,500 monochrome particles laid out on a honeycomb grid, each anchored to a home position; at rest they sit still with a faint collective breathing shimmer (batched `Path2D` rendering keeps 4,500+ particles smooth);
- **Triple pointer motion** — moving the cursor triggers three layered effects: a Gaussian force field washes nearby particles aside (wake drag + frontal repulsion + vortex swirl); fast movement spawns expanding circular ripples that push particles outward in waves; and the cursor jets a stream of sand grains that drift and fade along the wake;
- **Snap-back springs** — when the pointer leaves, every particle is pulled back to its anchor with a lively spring bounce;
- **Adaptive & accessible** — dark theme renders pale glowing dots (`lighter` compositing), light theme renders dark-grey dust; particle density scales with the viewport, rendering pauses while the tab is hidden, and `prefers-reduced-motion` falls back to a static frame.

## Tech stack

- **React 19 + TypeScript + Vite** — application core
- **Motion** — spring & gesture animations
- **Three.js** — 3D network graph engine (lazy-loaded, no first-paint cost)
- **IndexedDB** — problems, methods and image blobs stay on-device

## Getting started

```bash
npm install
npm run dev        # dev server, http://localhost:5173
npm run build      # type-check + production build
npm run preview    # preview the production build
npm run serve      # zero-dependency static server, http://localhost:5173
```

On Windows, double-click **`启动本地版.bat`** to build, serve and open the app; if port 5173 is busy it automatically falls back to 5174/5175… with shared data. Phones on the same Wi-Fi can scan the QR code to open the library.

## Data & privacy

- All data (including images) lives in browser IndexedDB (database `math-problem-bank`) — **never sent to any server**;
- Images are compressed on import (max 1920px, quality 0.85); SVG/GIF are kept as-is;
- Text is metadata only (title, source, tags, steps); the problems and solutions themselves are images;
- LAN sync runs through the local server on the **same Wi-Fi** only.

## Automated validation

```bash
npm run check
```

- `scripts/audit.mjs` — headless-Chrome checks for image loading, layout overflow, glassmorphism fallback, dark mode, particle background, mobile layout and 20+ more metrics;
- `scripts/e2e.mjs` — end-to-end walkthrough of create → edit → search → review → theater → knowledge graph → cognitive review → analytics → LAN sync.

## Project structure

```text
src/
  db/            IndexedDB wrapper & seed data
  hooks/         data store, blob URLs, media queries
  components/    library, detail, forms, methods, network, report & more
  components/ui/ shared UI (sheet, lightbox, segmented, tag input…)
  styles/        design system (light/dark themes, glassmorphism, reduced motion)
  utils/         image, compression, zip, review scheduling & more
scripts/         serve / netinfo / bridge / audit / e2e / visual-check
```

## License

[MIT](LICENSE) © 2026 math-problem-bank contributors
