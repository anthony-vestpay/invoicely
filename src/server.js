import express from 'express';
import Database from 'better-sqlite3';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';
import { getTaxRate, calculateInvoiceTotals } from './billing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const dataDir = path.join(root, 'data');
mkdirSync(dataDir, { recursive: true });

const db = new Database(path.join(dataDir, 'invoicely.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT,
    company TEXT,
    address TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    number TEXT NOT NULL UNIQUE,
    client_id INTEGER NOT NULL REFERENCES clients(id),
    issue_date TEXT NOT NULL,
    due_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'sent', 'paid', 'overdue')),
    notes TEXT,
    subtotal_cents INTEGER NOT NULL DEFAULT 0,
    tax_rate REAL NOT NULL DEFAULT 0,
    tax_cents INTEGER NOT NULL DEFAULT 0,
    total_cents INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS invoice_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    quantity REAL NOT NULL DEFAULT 1,
    rate_cents INTEGER NOT NULL DEFAULT 0,
    amount_cents INTEGER NOT NULL DEFAULT 0
  );
`);

// Validated at startup so a bad TAX_RATE fails fast instead of surfacing on the
// first invoice a user tries to create.
console.log(`Invoicely is using a ${getTaxRate()}% tax rate (from TAX_RATE).`);

const app = express();
app.use(express.json());
app.use(express.static(path.join(root, 'public')));

const cents = (value) => Math.round(Number(value || 0) * 100);
const invoiceNumber = () => {
  const year = new Date().getFullYear();
  const count = db.prepare('SELECT COUNT(*) as count FROM invoices').get().count + 1;
  return `INV-${year}-${String(count).padStart(3, '0')}`;
};

function recalculateInvoice(id) {
  const items = db.prepare('SELECT amount_cents FROM invoice_items WHERE invoice_id = ?').all(id);
  const { subtotalCents, taxRate, taxCents, totalCents } = calculateInvoiceTotals(
    items.map((item) => ({ amountCents: item.amount_cents }))
  );
  db.prepare(`UPDATE invoices SET subtotal_cents = ?, tax_rate = ?, tax_cents = ?, total_cents = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(subtotalCents, taxRate, taxCents, totalCents, id);
}

function getInvoice(id) {
  const invoice = db.prepare(`
    SELECT i.*, c.name as client_name, c.email as client_email, c.company as client_company, c.address as client_address
    FROM invoices i JOIN clients c ON c.id = i.client_id WHERE i.id = ?
  `).get(id);
  if (!invoice) return null;
  invoice.items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY id').all(id);
  return invoice;
}

app.get('/api/dashboard', (req, res) => {
  const summary = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN status = 'paid' THEN total_cents ELSE 0 END), 0) AS paid_cents,
      COALESCE(SUM(CASE WHEN status IN ('sent', 'overdue') THEN total_cents ELSE 0 END), 0) AS outstanding_cents,
      COALESCE(SUM(CASE WHEN status = 'overdue' OR (status = 'sent' AND due_date < date('now')) THEN total_cents ELSE 0 END), 0) AS overdue_cents,
      COUNT(CASE WHEN status NOT IN ('paid') THEN 1 END) AS open_count
    FROM invoices
  `).get();
  const recent = db.prepare(`
    SELECT i.*, c.name as client_name, c.company as client_company
    FROM invoices i JOIN clients c ON c.id = i.client_id
    ORDER BY i.updated_at DESC LIMIT 6
  `).all();
  res.json({ summary, recent });
});

app.get('/api/billing/tax-rate', (req, res) => {
  res.json({ taxRate: getTaxRate() });
});

app.get('/api/clients', (req, res) => {
  res.json(db.prepare('SELECT * FROM clients ORDER BY name').all());
});

app.post('/api/clients', (req, res) => {
  const { name, email = '', company = '', address = '' } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Client name is required.' });
  const result = db.prepare('INSERT INTO clients (name, email, company, address) VALUES (?, ?, ?, ?)')
    .run(name.trim(), email.trim(), company.trim(), address.trim());
  res.status(201).json(db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid));
});

app.get('/api/invoices', (req, res) => {
  const { status, search } = req.query;
  let sql = `SELECT i.*, c.name as client_name, c.company as client_company FROM invoices i JOIN clients c ON c.id = i.client_id WHERE 1=1`;
  const values = [];
  if (status && status !== 'all') { sql += ' AND i.status = ?'; values.push(status); }
  if (search) { sql += ' AND (i.number LIKE ? OR c.name LIKE ? OR c.company LIKE ?)'; const term = `%${search}%`; values.push(term, term, term); }
  sql += ' ORDER BY i.due_date ASC, i.created_at DESC';
  res.json(db.prepare(sql).all(...values));
});

const csvField = (value) => {
  const s = String(value ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

app.get('/api/invoices/export', (req, res) => {
  const { status, search } = req.query;
  let sql = `SELECT i.*, c.name as client_name, c.company as client_company FROM invoices i JOIN clients c ON c.id = i.client_id WHERE 1=1`;
  const values = [];
  if (status && status !== 'all') { sql += ' AND i.status = ?'; values.push(status); }
  if (search) { sql += ' AND (i.number LIKE ? OR c.name LIKE ? OR c.company LIKE ?)'; const term = `%${search}%`; values.push(term, term, term); }
  sql += ' ORDER BY i.due_date ASC, i.created_at DESC';
  const invoices = db.prepare(sql).all(...values);

  const header = ['Number', 'Client', 'Company', 'Issue Date', 'Due Date', 'Status', 'Subtotal', 'Tax Rate %', 'Tax', 'Total'];
  const rows = invoices.map((invoice) => [
    invoice.number,
    invoice.client_name,
    invoice.client_company,
    invoice.issue_date,
    invoice.due_date,
    invoice.status,
    (invoice.subtotal_cents / 100).toFixed(2),
    invoice.tax_rate,
    (invoice.tax_cents / 100).toFixed(2),
    (invoice.total_cents / 100).toFixed(2),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvField).join(',')).join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="invoices.csv"');
  res.send(csv);
});

// wkhtmltopdf is required to render invoice HTML into a downloadable PDF. Keep
// this route in place while the host image is updated so API consumers get a
// clear, intentional response instead of a missing-route error.
app.get('/api/invoices/:id/pdf', (req, res) => {
  res.status(501).json({
    error: 'PDF export is not available because wkhtmltopdf is not installed on this server.',
  });
});

app.get('/api/invoices/:id', (req, res) => {
  const invoice = getInvoice(req.params.id);
  if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
  res.json(invoice);
});

app.post('/api/invoices', (req, res) => {
  const { clientId, issueDate, dueDate, status = 'draft', notes = '', items = [] } = req.body;
  if (!clientId || !issueDate || !dueDate || !items.length) return res.status(400).json({ error: 'Client, dates, and at least one line item are required.' });
  const create = db.transaction(() => {
    const result = db.prepare(`INSERT INTO invoices (number, client_id, issue_date, due_date, status, notes)
      VALUES (?, ?, ?, ?, ?, ?)`)
      .run(invoiceNumber(), clientId, issueDate, dueDate, status, notes);
    const id = result.lastInsertRowid;
    const itemStatement = db.prepare('INSERT INTO invoice_items (invoice_id, description, quantity, rate_cents, amount_cents) VALUES (?, ?, ?, ?, ?)');
    items.forEach((item) => {
      const quantity = Number(item.quantity || 0);
      const rate = cents(item.rate);
      itemStatement.run(id, item.description?.trim() || 'Untitled item', quantity, rate, Math.round(quantity * rate));
    });
    recalculateInvoice(id);
    return getInvoice(id);
  });
  res.status(201).json(create());
});

app.patch('/api/invoices/:id', (req, res) => {
  const { status } = req.body;
  if (!['draft', 'sent', 'paid', 'overdue'].includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const result = db.prepare('UPDATE invoices SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Invoice not found.' });
  res.json(getInvoice(req.params.id));
});

app.delete('/api/invoices/:id', (req, res) => {
  const result = db.prepare('DELETE FROM invoices WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Invoice not found.' });
  res.status(204).end();
});

app.get('*', (req, res) => res.sendFile(path.join(root, 'public', 'index.html')));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Invoicely is running at http://localhost:${port}`));
