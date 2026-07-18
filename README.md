# RMA Masterfile Automation System

Web application that automates processing of DN PDF files into a single Excel masterfile.

**Full documentation:** [docs/SYSTEM_GUIDE.md](docs/SYSTEM_GUIDE.md)

## Architecture

```
project-root/
├── frontend/          React + TypeScript + Tailwind dashboard
├── backend/           FastAPI API server (also serves the built UI in production)
├── storage/           Excel masterfile, SQLite indexes, backups
├── uploads/           Incoming PDF files
├── processed/         Archived PDFs after successful insert
└── logs/              Audit trail
```

## Deploy (one service = full app)

One Docker image serves **both** the React UI and the FastAPI API. No separate Vercel + backend setup.

### Option A — Render (recommended)

1. Push this repo to GitHub.
2. In [Render](https://render.com): **New → Blueprint** → select the repo (`render.yaml`).
3. Wait for the build. Open the service URL.
4. Login: `admin` / `admin123`

That’s it. Persistent disk stores Excel, uploads, and databases.

### Option B — Railway

1. New project → Deploy from GitHub.
2. Railway detects `Dockerfile` / `railway.json`.
3. Add a **volume** mounted at `/data` and set `DATA_DIR=/data`.
4. Open the public URL.

### Option C — Any Docker host

```bash
docker compose up --build
```

Open http://localhost:8000

---

## Local development (hot reload)

```bash
# terminal 1 — API
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# terminal 2 — UI (proxies /api → :8000)
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 — login `admin` / `admin123`.

## Workflow

1. **Upload** — Drag and drop one or more DN PDF files
2. **Process** — Extract fields, validate, detect duplicates against FY2526
3. **Preview** — Review extracted data in a sortable, searchable table
4. **Save** — Approve and append to `storage/masterfile/RMA_MASTER.xlsx`
5. **Download** — Get the updated master Excel file

## API Endpoints

| Method | Endpoint        | Description              |
|--------|-----------------|--------------------------|
| GET    | /api/health     | Health check             |
| GET    | /api/stats      | Dashboard statistics     |
| GET    | /api/logs       | Processing audit log     |
| POST   | /api/upload     | Upload PDF files         |
| POST   | /api/process    | Extract and validate PDFs|
| POST   | /api/save       | Save approved records    |
| GET    | /api/download   | Download master Excel    |

## Notes

- Do **not** deploy this stack to Vercel serverless — OCR/Excel/SQLite need a persistent server. The root `vercel.json` is only for an optional frontend-only preview and is incomplete without an API host.
- On first boot, `backend/assets/master-template.xlsx` is copied into `$DATA_DIR/storage/masterfile/` automatically.
