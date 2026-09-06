const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let currentStatus = 'all';
let clients = [];
let taxRate = 0;

const money = (cents = 0) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const dateFormat = (date) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T12:00:00`));
const isoDate = (date) => date.toISOString().slice(0, 10);
const api = async (url, options) => { const res = await fetch(url, options); if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Something went wrong'); return res.status === 204 ? null : res.json(); };

function toast(message) { const el = $('#toast'); el.textContent = message; el.classList.add('show'); setTimeout(() => el.classList.remove('show'), 2800); }
function statusBadge(status) { return `<span class="status ${status}">${status}</span>`; }
function clientInitials(name) { return name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase(); }

async function loadTaxRate() {
  const { taxRate: rate } = await api('/api/billing/tax-rate');
  taxRate = rate;
  $('#taxRateDisplay').textContent = `${rate}%`;
  updateTotal();
}
async function loadDashboard() {
  const { summary, recent } = await api('/api/dashboard');
  $('#paidTotal').textContent = money(summary.paid_cents);
  $('#outstandingTotal').textContent = money(summary.outstanding_cents);
  $('#overdueTotal').textContent = money(summary.overdue_cents);
  $('#paidMeta').textContent = summary.paid_cents ? 'Payments received' : 'No payments yet';
  $('#outstandingMeta').textContent = `${summary.open_count} open invoice${summary.open_count === 1 ? '' : 's'}`;
  $('#overdueMeta').textContent = summary.overdue_cents ? 'Needs your attention' : 'Nothing overdue';
  const body = $('#recentInvoices'); const empty = $('#recentEmpty');
  body.innerHTML = recent.map(invoiceRow).join('');
  body.closest('.table-wrap').style.display = recent.length ? 'block' : 'none'; empty.style.display = recent.length ? 'none' : 'block';
}
function invoiceRow(invoice, detailed = false) {
  return `<tr><td><span class="invoice-number">${invoice.number}</span></td><td class="client-cell"><strong>${invoice.client_name}</strong><small>${invoice.client_company || invoice.client_email || 'Individual'}</small></td>${detailed ? `<td>${dateFormat(invoice.issue_date)}</td>` : ''}<td>${dateFormat(invoice.due_date)}</td><td class="amount">${money(invoice.total_cents)}</td><td>${statusBadge(invoice.status)}</td><td><button class="row-menu" data-menu="${invoice.id}" title="Change invoice status">···</button></td></tr>`;
}
async function loadInvoices() {
  const search = $('#invoiceSearch').value.trim();
  const list = await api(`/api/invoices?status=${currentStatus}&search=${encodeURIComponent(search)}`);
  $('#allInvoices').innerHTML = list.map((i) => invoiceRow(i, true)).join('');
  $('#allInvoices').closest('.table-wrap').style.display = list.length ? 'block' : 'none';
  $('#invoicesEmpty').style.display = list.length ? 'none' : 'block';
  $('#allCount').textContent = currentStatus === 'all' ? list.length : '';
}
async function loadClients() {
  clients = await api('/api/clients');
  $('#clientsList').innerHTML = clients.map(c => `<article class="client-card"><div class="client-avatar">${clientInitials(c.name)}</div><h3>${c.name}</h3><p>${c.company || 'Independent client'}</p><div class="client-email">${c.email || 'No email on file'}</div></article>`).join('');
  $('#clientsEmpty').style.display = clients.length ? 'none' : 'block';
  $('#clientsList').style.display = clients.length ? 'grid' : 'none';
  $('#invoiceClient').innerHTML = `<option value="">Select a client</option>${clients.map(c => `<option value="${c.id}">${c.name}${c.company ? ` — ${c.company}` : ''}</option>`).join('')}`;
}
function switchView(view) { $$('.view').forEach(v => v.classList.toggle('active-view', v.id === view)); $$('.nav-link').forEach(a => a.classList.toggle('active', a.dataset.view === view)); if (view === 'invoices') loadInvoices(); if (view === 'clients') loadClients(); }
function openModal(id) { $(`#${id}`).classList.add('open'); $(`#${id}`).setAttribute('aria-hidden', 'false'); }
function closeModal(id) { $(`#${id}`).classList.remove('open'); $(`#${id}`).setAttribute('aria-hidden', 'true'); }
function addLine(item = {}) { const row = document.createElement('div'); row.className = 'line-item'; row.innerHTML = `<label>Description<input required class="item-description" placeholder="Design consultation" value="${item.description || ''}"></label><label>Qty<input required type="number" min="0.01" step="0.01" class="item-quantity" value="${item.quantity || 1}"></label><label>Rate<input required type="number" min="0" step="0.01" class="item-rate" placeholder="0.00" value="${item.rate || ''}"></label><button type="button" class="remove-line" title="Remove line">×</button>`; $('#lineItems').append(row); row.querySelectorAll('input').forEach(i => i.addEventListener('input', updateTotal)); row.querySelector('.remove-line').addEventListener('click', () => { if ($$('.line-item').length > 1) row.remove(); updateTotal(); }); }
function updateTotal() { const subtotal = $$('.line-item').reduce((sum, row) => sum + (Number(row.querySelector('.item-quantity').value) || 0) * (Number(row.querySelector('.item-rate').value) || 0), 0); const tax = subtotal * (taxRate / 100); $('#formTotal').textContent = money(Math.round((subtotal + tax) * 100)); }
function resetInvoiceForm() { $('#invoiceForm').reset(); $('#lineItems').innerHTML = ''; addLine(); const now = new Date(); $('#issueDate').value = isoDate(now); now.setDate(now.getDate() + 30); $('#dueDate').value = isoDate(now); updateTotal(); }

$('.today').textContent = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date());
$$('.nav-link').forEach(link => link.addEventListener('click', (e) => { e.preventDefault(); switchView(link.dataset.view); }));
$$('[data-go]').forEach(button => button.addEventListener('click', () => switchView(button.dataset.go)));
$$('[data-new-invoice]').forEach(button => button.addEventListener('click', () => { resetInvoiceForm(); openModal('invoiceModal'); }));
$('#new-invoice').addEventListener('click', () => { resetInvoiceForm(); openModal('invoiceModal'); });
$('#new-client').addEventListener('click', () => openModal('clientModal')); $('#empty-new-client').addEventListener('click', () => openModal('clientModal')); $('#quickClient').addEventListener('click', () => openModal('clientModal'));
$$('[data-close]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.close)));
$$('.modal-backdrop').forEach(backdrop => backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(backdrop.id); }));
$('#addLine').addEventListener('click', () => addLine());
$('#invoiceTabs').addEventListener('click', e => { const tab = e.target.closest('.tab'); if (!tab) return; currentStatus = tab.dataset.status; $$('.tab').forEach(t => t.classList.toggle('active', t === tab)); loadInvoices(); });
let searchTimer; $('#invoiceSearch').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(loadInvoices, 180); });
$('#clientForm').addEventListener('submit', async (e) => { e.preventDefault(); try { const created = await api('/api/clients', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: $('#clientName').value, company: $('#clientCompany').value, email: $('#clientEmail').value, address: $('#clientAddress').value }) }); await loadClients(); $('#invoiceClient').value = created.id; e.target.reset(); closeModal('clientModal'); toast('Client added successfully'); } catch (err) { toast(err.message); } });
$('#invoiceForm').addEventListener('submit', async (e) => { e.preventDefault(); const items = $$('.line-item').map(row => ({ description: row.querySelector('.item-description').value, quantity: row.querySelector('.item-quantity').value, rate: row.querySelector('.item-rate').value })); try { await api('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: $('#invoiceClient').value, issueDate: $('#issueDate').value, dueDate: $('#dueDate').value, status: $('#invoiceStatus').value, notes: $('#invoiceNotes').value, items }) }); closeModal('invoiceModal'); await Promise.all([loadDashboard(), loadInvoices()]); toast('Invoice created successfully'); } catch (err) { toast(err.message); } });
document.addEventListener('click', async (e) => { const button = e.target.closest('[data-menu]'); if (!button) return; const next = prompt('Set status: draft, sent, paid, or overdue'); if (!next) return; try { await api(`/api/invoices/${button.dataset.menu}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: next.toLowerCase() }) }); await Promise.all([loadDashboard(), loadInvoices()]); toast('Invoice updated'); } catch (err) { toast(err.message); } });
(async () => { resetInvoiceForm(); await Promise.all([loadTaxRate(), loadDashboard(), loadClients(), loadInvoices()]); })().catch(err => toast(err.message));
