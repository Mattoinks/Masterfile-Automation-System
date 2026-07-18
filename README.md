# RMA Masterfile Automation System

Web application that automates processing of DN PDF files into a single Excel masterfile.

**Full documentation:** [docs/SYSTEM_GUIDE.md](docs/SYSTEM_GUIDE.md) — architecture, step-by-step workflow, API reference, deployment, and troubleshooting.

## Architecture

```
project-root/
├── frontend/          React + TypeScript + Tailwind dashboard
├── backend/           FastAPI API server
├── storage/
│   └── masterfile/    RMA_MASTER.xlsx (single source of truth)
├── uploads/           Incoming PDF files
├── processed/         Archived PDFs after successful insert
└── logs/              Audit trail
```

## Quick Start

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173

## Workflow

1. **Upload** — Drag and drop one or more DN PDF files
2. **Process** — Extract fields, validate, detect duplicates against FY2526
3. **Preview** — Review extracted data in a sortable, searchable table
4. **Save** — Approve and append to `storage/masterfile/RMA_MASTER.xlsx`
5. **Download** — Get the updated master Excel file

## Configuration

Column mapping is defined in `backend/config/column_mapping.json`. Edit this file to change worksheet or column letters without code changes.

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

## PDF Extraction

The extraction service (`extract_dn_data`) uses pdfplumber with PyMuPDF fallback. Regex patterns target common DN document layouts. **Attach sample DN PDFs** to tune field extraction for your actual document format.

## Future Extensions

The architecture supports adding:
- Multiple fiscal year worksheets
- Database storage layer
- User authentication
- Cloud deployment
- OCR for scanned PDFs
- Bulk processing at scale
