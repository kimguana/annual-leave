# Repository Guidelines

## Project Structure & Module Organization

This repository contains a small Node.js annual leave tracker. `server.js` is the CommonJS HTTP server and API entry point. Browser-facing files live in `public/`: `index.html`, `styles.css`, `app.js`, `leave-logic.js`, `holidays.js`, and `vendor/exceljs.min.js`. Shared leave calculation logic is in `public/leave-logic.js` so it can run in both the browser and Node tests. Tests are in `test/`, with unit coverage in `leave-logic.test.js` and scenario/integration checks in `integration.test.js`. Project notes and design plans are under `docs/superpowers/`. Runtime data files such as `data.json` and `holiday-cache.json` are local state; avoid committing private employee data.

## Build, Test, and Development Commands

- `npm start`: runs `node server.js` for local use.
- `npm run dev`: runs `node --watch server.js --dev` and injects live reload support.
- `npm test`: runs all tests with Node's built-in test runner.
- Root-level `.bat` launcher: Windows convenience launcher for non-terminal users.

No build step is required; static assets are served directly from `public/`.

## Coding Style & Naming Conventions

Use CommonJS (`require`, `module.exports`) for server and test code. Keep JavaScript indentation at two spaces, use semicolons, and prefer `const`/`let` over `var`. Use descriptive camelCase names for functions and variables, for example `annualGrant`, `monthlyAccrual`, and `buildReportMatrix`. Keep domain rules in `public/leave-logic.js`; keep DOM rendering and user interaction in `public/app.js`. Avoid introducing dependencies unless they clearly simplify the project.

## Testing Guidelines

Use `node:test` and `node:assert`. Place tests in `test/` and name files with the `.test.js` suffix. Add focused tests for any change to leave accrual, carryover, usage summing, fiscal year handling, or report matrix output. Run `npm test` before submitting changes.

## Commit & Pull Request Guidelines

Recent history uses short, direct commit subjects, often as brief Korean summaries or merge messages. Keep commit messages concise and action oriented. Pull requests should include a brief description, test results such as `npm test`, linked issues when applicable, and screenshots for visible UI changes.

## Security & Configuration Tips

Do not hard-code personal employee records, credentials, or private company data. Treat spreadsheet files and local JSON state as potentially sensitive. When changing file serving logic, preserve path traversal protections in `server.js`.
