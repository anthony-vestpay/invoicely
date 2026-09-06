# Invoicely

A small, light-themed invoice tracker proof of concept. Create clients, prepare line-item invoices, and track them through draft, sent, paid, and overdue states.

## Stack

- **Express** for the local web/API server
- **SQLite** (via `better-sqlite3`) for a zero-configuration POC database
- Vanilla HTML, CSS, and JavaScript frontend

SQLite access is deliberately contained in `src/server.js`; a future PostgreSQL migration can replace the data access layer while preserving the API routes/UI.

Invoice totals (subtotal, tax, total) are computed by the billing module in `src/billing.js`.

## Run locally

```bash
npm install
cp .env.example .env # optional, sets TAX_RATE
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

The SQLite database is created automatically at `data/invoicely.db` and is excluded from source control.

## Billing

- The tax rate applied to every invoice comes from the `TAX_RATE` env var (a percent, e.g. `8.5`), not from user input or a hardcoded value — see `.env.example`. Ops can change it and restart the server without a code deploy.
- If `TAX_RATE` is unset, invoices are created with 0% tax. An invalid value (non-numeric or negative) fails the server at startup rather than silently miscalculating totals.
- Currency conversion is out of scope for now; all amounts are treated as a single currency's cents.

## Current capabilities

- Overview totals for paid, outstanding, and overdue revenue
- Client directory with company/contact details
- Line-item invoice creation, tax calculation, and generated invoice IDs
- Filter and search invoices
- Update invoice payment status from the invoice list
