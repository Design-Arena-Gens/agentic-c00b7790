# Imposter Relay Control Center

Host a social deduction party game (inspired by “the imposter” style mobile titles) directly from any browser. This Next.js application lets you seed a lobby, assign secret roles, reveal cards to players one-by-one, track task completion, call emergency meetings, and review post-round summaries without juggling paper notes or companion apps.

## Getting Started

Install dependencies and launch the local dev server:

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) in your browser. The interface is mobile-first, so feel free to test from a phone or a narrow viewport.

## Core Features

- Flexible lobby builder with name management and impostor count selection.
- Private role reveal deck with Crewmate, Impostor, and Analyst specializations.
- Mission control dashboard for tracking player status, task completion, and quick prompts.
- Emergency meeting workflow to record votes, eject suspects, or skip decisions.
- Automatic victory detection with post-round roster recap and fast reset tools.

## Available Scripts

- `npm run dev` – start the development server.
- `npm run build` – create an optimized production build.
- `npm run start` – serve the production build locally.
- `npm run lint` – run ESLint on the project.

## Deployment

The app is optimized for Vercel. Create a production-ready build with `npm run build`, then deploy via `vercel deploy --prod`. The included configuration uses the App Router (Next.js 14+) and TypeScript, so no additional setup is required.
