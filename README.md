# screenshot-annotator-studio

Palette plugin: upload a screenshot, annotate it with arrows, shapes, text, and highlights, then export as PNG. Runs 100% in the browser.

## Prereqs

- Node.js 18+
- Python 3.12+

## Install

```sh
# 1. Frontend + SDK deps
npm install

# 2. Install the Palette CLI (or use `npx @palettelab/cli` below)
npm install -g @palettelab/cli

# 3. Backend deps in a dedicated venv (kept out of the repo)
python3.12 -m venv .palette/backend-venv
.palette/backend-venv/bin/pip install -e .
```

Optional: configure the hosted sandbox env (token is a secret, from `pltt login`):

```sh
pltt login --env staging --url https://apps-api.pltt.xyz --token <publish-token>
```

## Run the pipeline

```sh
# Local dev loop (frontend + backend simulator, no Docker)
pltt dev

# Preflight checks before shipping
pltt doctor
pltt build
pltt test
pltt package            # bundles dist/annotator-app-<version>.tar.gz

# Publish
pltt publish --env staging
```
