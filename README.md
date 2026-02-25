# Docjin Wiki

Docjin Wiki is a local Markdown knowledge editor with:
- React + Vite + Vditor frontend (`client/`)
- Express + TypeScript backend (`server/`)
- Variable/reference/embed syntax (`{{var:}}`, `{{ref:}}`, `{{calc:}}`, `{{embed:}}`)

## Workspace Model

The backend now supports isolated workspaces.

- Workspace root: configured by `DOCJIN_WORKSPACES_ROOT`
- Default workspace id: `DOCJIN_DEFAULT_WORKSPACE`
- Workspace template source: `DOCJIN_TEMPLATE_DATA_DIR`
- APIs:
  - `GET /api/workspaces`
  - `POST /api/workspaces`
  - Existing file/git APIs accept `workspace` parameter

Each workspace has its own file tree and Git repo state.

## Configuration

### Backend (`server/.env`)

Copy from `server/.env.example`:

```env
DOCJIN_SERVER_PORT=3001
DOCJIN_WORKSPACES_ROOT=./workspaces
DOCJIN_DEFAULT_WORKSPACE=default
DOCJIN_TEMPLATE_DATA_DIR=./data
DOCJIN_CORS_ORIGINS=
DOCJIN_LOG_REQUESTS=false
```

### Frontend (`client/.env`)

Copy from `client/.env.example`:

```env
VITE_DEV_SERVER_HOST=127.0.0.1
VITE_DEV_SERVER_PORT=5178
VITE_DEV_STRICT_PORT=true
VITE_API_BASE_URL=/api
VITE_API_PROXY_TARGET=http://127.0.0.1:3001
VITE_API_TIMEOUT_MS=5000
```

## Run

```bash
# repo root
npm run dev
```

One-click startup on Windows:

```powershell
.\start-dev.cmd
```

Optional dependency install before launch:

```powershell
.\start-dev.cmd -Install
```

Or run independently:

```bash
npm run dev --prefix server
npm run dev --prefix client
```

## Build

```bash
npm run build
```

Server production entry:

```bash
npm run start:server
```
