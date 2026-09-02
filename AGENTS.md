# FinCommand AI Agent Guide

## Purpose
This repository is a self-contained full-stack finance calculator app with a Node.js backend and static frontend pages. Use this guide to help AI coding agents understand the repository structure, runtime conventions, and the most important edit boundaries.

## Key facts
- Backend: `server.js` is the Express.js server entry point.
- Frontend: `FinCommands.html` and `login.html` are the main UI pages.
- Business logic: `src/calculators.js`, `src/userStore.js`, `src/bankRates.js`, and `src/subscriptions.js` contain the core application logic.
- Data: `data/users.json` stores registered users and `data/bankRates.json` stores bank rate data.
- Environment: the project uses `.env.example` for optional Razorpay and Gemini API configuration.

## Run commands
Use the repository README first. The main commands are:
- `npm install`
- `npm start`
- `npm run dev`
- `npm run start:open`
- `powershell -ExecutionPolicy Bypass -File .\start-server.ps1`

## Important conventions
- The app is Node.js-only for backend startup. Do not add a separate Python backend.
- Static assets are served from the repo root through `express.static` in `server.js`.
- API authentication is based on `x-api-key` or `Authorization: ApiKey ...` headers.
- Calculator APIs are protected routes under `/api/v1/*` and expect numeric request bodies.
- Payment/UPI flows are optional; the server can simulate Razorpay orders when env vars are missing.
- The app uses local JSON storage, so keep changes compatible with `data/users.json` and `data/bankRates.json`.

## Most relevant files
- `server.js` — application backend and route definitions
- `src/calculators.js` — calculator formulas and output structure
- `src/userStore.js` — user registration, login, API key handling, and usage tracking
- `src/bankRates.js` — bank-rate loader and refresh behavior
- `src/subscriptions.js` — subscription tiers and rate-limit gating
- `FinCommands.html`, `login.html` — main pages and frontend form flow
- `auth.js`, `script.js` — frontend auth, calculator submission, and UI updates
- `styles.css` — overall visual style and responsive layout

## Agent behavior guidance
- Prioritize small, safe changes. Preserve the existing UI flow and API contract.
- Link to `README.md` for installation, environment setup, and high-level behavior.
- Keep suggestions aligned with the existing Express + JSON storage architecture.
- Do not assume a build step or transpiler beyond plain Node.js and browser JS.

## Useful references
- `README.md` — project overview, setup, and deployment guidance
- `.env.example` — optional env variables for Razorpay and Gemini
- `package.json` — required Node version, scripts, and dependencies

## Notes for deployments and environment
- The server listens on `PORT` or `3000` and opens the browser automatically unless `NO_BROWSER` is set.
- If `GEMINI_API_KEY` / `GOOGLE_API_KEY` is missing, the `/api/v1/ai` endpoint falls back to a local response.
- Razorpay order creation is optional and can be simulated when live keys are not configured.
