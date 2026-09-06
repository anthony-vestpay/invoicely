# Invoicely

A small, light-themed invoice tracker proof of concept. Create clients, prepare line-item invoices, and track them through draft, sent, paid, and overdue states.

## Stack

- **Express** for the local web/API server
- **SQLite** (via `better-sqlite3`) for a zero-configuration POC database
- Vanilla HTML, CSS, and JavaScript frontend

SQLite access is deliberately contained in `src/server.js`; a future PostgreSQL migration can replace the data access layer while preserving the API routes/UI.

## Run locally

```bash
npm install
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

The SQLite database is created automatically at `data/invoicely.db` and is excluded from source control.

## Current capabilities

- Overview totals for paid, outstanding, and overdue revenue
- Client directory with company/contact details
- Line-item invoice creation, tax calculation, and generated invoice IDs
- Filter and search invoices
- Update invoice payment status from the invoice list
