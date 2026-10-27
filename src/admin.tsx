/**
 * emCommerce Plugin — Admin UI
 *
 * React components for admin pages and dashboard widgets.
 */

import type { PluginAdminExports } from "emdash";
import { apiFetch as baseFetch, parseApiResponse } from "emdash/plugin-utils";
import * as React from "react";

// ─── API ────────────────────────────────────────────────────────

const API = "/_emdash/api/plugins/emcommerce";

function apiFetch(route: string, body?: unknown): Promise<Response> {
	return baseFetch(`${API}/${route}`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(body ?? {}),
	});
}

async function api<T = unknown>(route: string, body?: unknown): Promise<T> {
	const res = await apiFetch(route, body);
	const json = await res.json();
	if (!res.ok) throw new Error((json as any).error?.message ?? res.statusText);
	return (json as any).data as T;
}

// ─── Shared Styles ──────────────────────────────────────────────

const card: React.CSSProperties = {
	background: "white",
	border: "1px solid #e5e7eb",
	borderRadius: "0.5rem",
	padding: "1.25rem",
};

const heading: React.CSSProperties = {
	fontSize: "1.5rem",
	fontWeight: 700,
	margin: "0 0 1.5rem",
};

const subheading: React.CSSProperties = {
	fontSize: "1rem",
	fontWeight: 600,
	margin: "0 0 0.75rem",
};

const statGrid: React.CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(4, 1fr)",
	gap: "1rem",
	marginBottom: "1.5rem",
};

const statValue: React.CSSProperties = {
	fontSize: "1.75rem",
	fontWeight: 700,
	margin: 0,
};

const statLabel: React.CSSProperties = {
	fontSize: "0.8125rem",
	color: "#6b7280",
	margin: "0.25rem 0 0",
};

const table: React.CSSProperties = {
	width: "100%",
	borderCollapse: "collapse",
	fontSize: "0.875rem",
};

const th: React.CSSProperties = {
	textAlign: "left",
	padding: "0.5rem 0.75rem",
	borderBottom: "2px solid #e5e7eb",
	fontSize: "0.75rem",
	textTransform: "uppercase",
	letterSpacing: "0.05em",
	color: "#6b7280",
};

const td: React.CSSProperties = {
	padding: "0.625rem 0.75rem",
	borderBottom: "1px solid #f3f4f6",
};

const badge = (color: string): React.CSSProperties => ({
	display: "inline-block",
	padding: "0.125rem 0.5rem",
	borderRadius: "9999px",
	fontSize: "0.75rem",
	fontWeight: 500,
	background: color === "green" ? "#dcfce7" : color === "yellow" ? "#fef9c3" : color === "red" ? "#fee2e2" : "#f3f4f6",
	color: color === "green" ? "#166534" : color === "yellow" ? "#854d0e" : color === "red" ? "#991b1b" : "#374151",
});

const btn: React.CSSProperties = {
	padding: "0.5rem 1rem",
	background: "#2563eb",
	color: "white",
	border: "none",
	borderRadius: "0.375rem",
	fontSize: "0.875rem",
	fontWeight: 500,
	cursor: "pointer",
};

/** Display cents as dollars */
const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
/** Convert dollar input string to cents for storage */
const toCents = (dollars: string | number): number => Math.round(Number(dollars) * 100);
/** Convert cents to dollar string for form inputs */
const toDollars = (cents: number): string => (cents / 100).toFixed(2);

// ─── Dashboard Page ─────────────────────────────────────────────

function DashboardPage() {
	const [stats, setStats] = React.useState<any>(null);
	const [orders, setOrders] = React.useState<any[]>([]);
	const [loading, setLoading] = React.useState(true);

	React.useEffect(() => {
		Promise.all([
			api("dashboard/stats"),
			api<{ items: any[] }>("dashboard/recent-orders"),
		]).then(([s, o]) => {
			setStats(s);
			setOrders(o.items);
		}).catch(console.error).finally(() => setLoading(false));
	}, []);

	if (loading) return <p>Loading dashboard...</p>;

	return (
		<div>
			<h1 style={heading}>Dashboard</h1>
			{stats && (
				<div style={statGrid}>
					<div style={card}>
						<p style={statValue}>{fmt(stats.totalRevenue)}</p>
						<p style={statLabel}>Total Revenue</p>
					</div>
					<div style={card}>
						<p style={statValue}>{stats.totalOrders}</p>
						<p style={statLabel}>Orders</p>
					</div>
					<div style={card}>
						<p style={statValue}>{fmt(stats.averageOrderValue)}</p>
						<p style={statLabel}>Avg Order Value</p>
					</div>
					<div style={card}>
						<p style={statValue}>{stats.pendingOrderCount}</p>
						<p style={statLabel}>Pending Orders</p>
					</div>
				</div>
			)}
			<div style={card}>
				<h2 style={subheading}>Recent Orders</h2>
				{orders.length === 0 ? (
					<p style={{ color: "#6b7280" }}>No orders yet.</p>
				) : (
					<table style={table}>
						<thead>
							<tr>
								<th style={th}>Order</th>
								<th style={th}>Customer</th>
								<th style={th}>Status</th>
								<th style={th}>Total</th>
								<th style={th}>Date</th>
							</tr>
						</thead>
						<tbody>
							{orders.map((o: any) => (
								<tr key={o.id}>
									<td style={td}>{o.orderNumber}</td>
									<td style={td}>{o.customerEmail}</td>
									<td style={td}><span style={badge(o.status === "completed" ? "green" : o.status === "cancelled" ? "red" : "yellow")}>{o.status}</span></td>
									<td style={td}>{fmt(o.total)}</td>
									<td style={td}>{new Date(o.createdAt).toLocaleDateString()}</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>
		</div>
	);
}

// ─── Shared Form Components ─────────────────────────────────────

const formGroup: React.CSSProperties = { display: "flex", flexDirection: "column", gap: "0.25rem", marginBottom: "0.75rem" };
const formLabel: React.CSSProperties = { fontSize: "0.8125rem", fontWeight: 500, color: "#374151" };
const formInput: React.CSSProperties = { padding: "0.5rem 0.75rem", border: "1px solid #d1d5db", borderRadius: "0.375rem", fontSize: "0.875rem", width: "100%" };
const formSelect: React.CSSProperties = { ...formInput, background: "white" };
const formRow: React.CSSProperties = { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" };
const formActions: React.CSSProperties = { display: "flex", gap: "0.5rem", marginTop: "1rem" };
const btnSecondary: React.CSSProperties = { ...btn, background: "#6b7280" };
const btnDanger: React.CSSProperties = { ...btn, background: "#dc2626" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
	return <div style={formGroup}><label style={formLabel}>{label}</label>{children}</div>;
}

// ─── Custom Fields Editor (reusable) ────────────────────────────

function CustomFieldsEditor({ entityType, values, onChange }: {
	entityType: "product" | "order" | "customer";
	values: Record<string, unknown>;
	onChange: (values: Record<string, unknown>) => void;
}) {
	const [defs, setDefs] = React.useState<any[]>([]);
	React.useEffect(() => {
		api<{ items: any[] }>("custom-fields/list", { entityType }).then((r) => setDefs(r.items)).catch(() => {});
	}, [entityType]);

	if (defs.length === 0) return null;

	function upd(key: string, value: unknown) {
		onChange({ ...values, [key]: value });
	}

	return (
		<div style={{ borderTop: "1px solid #e5e7eb", paddingTop: "1rem", marginTop: "0.75rem" }}>
			<p style={{ fontSize: "0.75rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "#6b7280", marginBottom: "0.75rem" }}>Custom Fields</p>
			{defs.map((d: any) => (
				<Field key={d.key} label={d.label + (d.required ? " *" : "")}>
					{d.fieldType === "textarea" ? (
						<textarea style={{ ...formInput, minHeight: "3rem" }} value={String(values[d.key] ?? d.defaultValue ?? "")} onChange={(e) => upd(d.key, e.target.value)} placeholder={d.placeholder || ""} />
					) : d.fieldType === "select" ? (
						<select style={formSelect} value={String(values[d.key] ?? d.defaultValue ?? "")} onChange={(e) => upd(d.key, e.target.value)}>
							<option value="">Select...</option>
							{(d.options || []).map((opt: string) => <option key={opt} value={opt}>{opt}</option>)}
						</select>
					) : d.fieldType === "boolean" ? (
						<label style={{ display: "flex", alignItems: "center", gap: "0.375rem" }}>
							<input type="checkbox" checked={Boolean(values[d.key] ?? d.defaultValue === "true")} onChange={(e) => upd(d.key, e.target.checked)} />
							{d.label}
						</label>
					) : (
						<input style={formInput} type={d.fieldType === "number" ? "number" : d.fieldType === "date" ? "date" : d.fieldType === "url" ? "url" : d.fieldType === "email" ? "email" : "text"} value={String(values[d.key] ?? d.defaultValue ?? "")} onChange={(e) => upd(d.key, d.fieldType === "number" ? Number(e.target.value) : e.target.value)} placeholder={d.placeholder || ""} />
					)}
				</Field>
			))}
		</div>
	);
}

// ─── Custom Fields Manager (for Settings page) ─────────────────

function CustomFieldsManager() {
	const [entityType, setEntityType] = React.useState<"product" | "order" | "customer">("product");
	const [defs, setDefs] = React.useState<any[]>([]);
	const [showForm, setShowForm] = React.useState(false);
	const [saving, setSaving] = React.useState(false);
	const [form, setForm] = React.useState({ key: "", label: "", fieldType: "text" as string, options: "", placeholder: "", required: false, defaultValue: "" });

	function load() { api<{ items: any[] }>("custom-fields/list", { entityType }).then((r) => setDefs(r.items)).catch(console.error); }
	React.useEffect(load, [entityType]);

	async function save() {
		setSaving(true);
		try {
			await api("custom-fields/create", {
				entityType,
				key: form.key,
				label: form.label,
				fieldType: form.fieldType,
				options: form.fieldType === "select" && form.options ? form.options.split(",").map((s: string) => s.trim()) : null,
				placeholder: form.placeholder || null,
				required: form.required,
				defaultValue: form.defaultValue || null,
				sortOrder: defs.length,
			});
			setForm({ key: "", label: "", fieldType: "text", options: "", placeholder: "", required: false, defaultValue: "" });
			setShowForm(false);
			load();
		} catch (e: any) { alert(e.message); } finally { setSaving(false); }
	}

	async function del(id: string) { await api("custom-fields/delete", { id }).catch((e: any) => alert(e.message)); load(); }

	const tabStyle2 = (active: boolean): React.CSSProperties => ({
		padding: "0.375rem 0.75rem", border: "1px solid " + (active ? "#2563eb" : "#d1d5db"),
		borderRadius: "0.375rem", background: active ? "#eff6ff" : "white",
		color: active ? "#2563eb" : "#374151", fontWeight: active ? 600 : 400,
		cursor: "pointer", fontSize: "0.8125rem",
	});

	return (
		<div style={{ ...card, marginTop: "1.5rem" }}>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
				<h2 style={{ ...subheading, margin: 0 }}>Custom Fields</h2>
				<button style={btn} onClick={() => setShowForm(!showForm)}>+ Add Field</button>
			</div>
			<div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
				{(["product", "order", "customer"] as const).map((t) => (
					<button key={t} style={tabStyle2(entityType === t)} onClick={() => setEntityType(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}s</button>
				))}
			</div>
			{showForm && (
				<div style={{ background: "#f9fafb", padding: "1rem", borderRadius: "0.375rem", marginBottom: "1rem" }}>
					<div style={formRow}>
						<Field label="Key"><input style={formInput} value={form.key} onChange={(e) => setForm((f) => ({ ...f, key: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "") }))} placeholder="warehouse_code" /></Field>
						<Field label="Label"><input style={formInput} value={form.label} onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))} placeholder="Warehouse Code" /></Field>
					</div>
					<div style={formRow}>
						<Field label="Type">
							<select style={formSelect} value={form.fieldType} onChange={(e) => setForm((f) => ({ ...f, fieldType: e.target.value }))}>
								<option value="text">Text</option><option value="number">Number</option><option value="boolean">Boolean</option>
								<option value="select">Select</option><option value="date">Date</option><option value="url">URL</option>
								<option value="email">Email</option><option value="textarea">Textarea</option>
							</select>
						</Field>
						{form.fieldType === "select" && <Field label="Options (comma-separated)"><input style={formInput} value={form.options} onChange={(e) => setForm((f) => ({ ...f, options: e.target.value }))} placeholder="Option A, Option B, Option C" /></Field>}
					</div>
					<div style={formRow}>
						<Field label="Placeholder"><input style={formInput} value={form.placeholder} onChange={(e) => setForm((f) => ({ ...f, placeholder: e.target.value }))} /></Field>
						<Field label="Default Value"><input style={formInput} value={form.defaultValue} onChange={(e) => setForm((f) => ({ ...f, defaultValue: e.target.value }))} /></Field>
					</div>
					<label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem", margin: "0.5rem 0" }}>
						<input type="checkbox" checked={form.required} onChange={(e) => setForm((f) => ({ ...f, required: e.target.checked }))} /> Required
					</label>
					<div style={formActions}><button style={btn} onClick={save} disabled={saving}>{saving ? "Saving..." : "Add Field"}</button><button style={btnSecondary} onClick={() => setShowForm(false)}>Cancel</button></div>
				</div>
			)}
			{defs.length === 0 ? <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No custom fields for {entityType}s. Add one to extend the data model.</p> : (
				<table style={table}><thead><tr><th style={th}>Key</th><th style={th}>Label</th><th style={th}>Type</th><th style={th}>Required</th><th style={th}></th></tr></thead>
					<tbody>{defs.map((d: any) => <tr key={d.id}><td style={{ ...td, fontFamily: "monospace" }}>{d.key}</td><td style={td}>{d.label}</td><td style={td}>{d.fieldType}</td><td style={td}>{d.required ? "Yes" : "—"}</td><td style={td}><button style={{ ...btnDanger, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => del(d.id)}>Del</button></td></tr>)}</tbody></table>
			)}
		</div>
	);
}

// ─── Products Page ──────────────────────────────────────────────

// ─── Multi-select helpers ────────────────────────────────────────

/** Pill-style multi-select for categories or tags */
function MultiSelect({ options, value, onChange, placeholder }: {
	options: { id: string; name: string }[];
	value: string[];
	onChange: (v: string[]) => void;
	placeholder?: string;
}) {
	const toggle = (id: string) => onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
	const pillStyle = (active: boolean): React.CSSProperties => ({
		display: "inline-flex", alignItems: "center", gap: "0.25rem",
		padding: "0.25rem 0.625rem", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 500,
		cursor: "pointer", border: "1px solid", userSelect: "none",
		background: active ? "#eff6ff" : "white", color: active ? "#1d4ed8" : "#6b7280",
		borderColor: active ? "#bfdbfe" : "#e5e7eb",
	});
	if (options.length === 0) return <span style={{ fontSize: "0.8125rem", color: "#9ca3af" }}>{placeholder ?? "None available"}</span>;
	return (
		<div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
			{options.map((o) => (
				<span key={o.id} style={pillStyle(value.includes(o.id))} onClick={() => toggle(o.id)}>
					{value.includes(o.id) && "✓ "}{o.name}
				</span>
			))}
		</div>
	);
}

function ProductsPage() {
	const [products, setProducts] = React.useState<any[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [view, setView] = React.useState<"list" | "create" | "edit">("list");
	const [editing, setEditing] = React.useState<any>(null);
	const [saving, setSaving] = React.useState(false);
	const [form, setForm] = React.useState(defaultProduct());
	const [categories, setCategories] = React.useState<any[]>([]);
	const [tags, setTags] = React.useState<any[]>([]);
	const [taxClasses, setTaxClasses] = React.useState<any[]>([]);

	function defaultProduct() {
		return { name: "", slug: "", type: "simple", status: "active", shortDescription: "", description: "", sku: "", price: "0.00", compareAtPrice: "0.00", costPrice: "0.00", taxClassId: "", manageStock: false, stockQuantity: 0, lowStockThreshold: 5, backordersAllowed: false, weight: 0, featured: false, customFields: {} as Record<string, string>, categoryIds: [] as string[], tagIds: [] as string[] };
	}

	function loadProducts() {
		setLoading(true);
		Promise.all([
			api<{ items: any[] }>("products/list", { limit: 100 }),
			api<{ items: any[] }>("categories/list", { limit: 100 }),
			api<{ items: any[] }>("tags/list", { limit: 100 }),
			api<{ items: any[] }>("tax-classes/list", { limit: 50 }),
		]).then(([p, c, t, tc]) => {
			setProducts(p.items);
			setCategories(c.items);
			setTags(t.items);
			setTaxClasses(tc.items);
		}).catch(console.error).finally(() => setLoading(false));
	}

	React.useEffect(loadProducts, []);

	function openCreate() { setForm(defaultProduct()); setEditing(null); setView("create"); }
	function openEdit(p: any) {
		setForm({ ...p, price: toDollars(p.price), compareAtPrice: toDollars(p.compareAtPrice || 0), costPrice: toDollars(p.costPrice || 0), weight: p.weight || 0, customFields: p.customFields || {} });
		setEditing(p); setView("edit");
	}
	function back() { setView("list"); setEditing(null); }

	async function handleSave() {
		setSaving(true);
		try {
			const slug = form.slug || form.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
			const payload = {
				...form,
				slug,
				price: toCents(form.price),
				compareAtPrice: toCents(form.compareAtPrice) || null,
				costPrice: toCents(form.costPrice) || null,
				weight: Number(form.weight) || null,
				sku: form.sku || null,
			};
			if (view === "edit" && editing) {
				await api("products/update", { id: editing.id, ...payload });
			} else {
				await api("products/create", payload);
			}
			loadProducts();
			back();
		} catch (e: any) { alert(e.message); }
		finally { setSaving(false); }
	}

	async function handleDelete(id: string) {
		if (!confirm("Delete this product?")) return;
		await api("products/delete", { id }).catch((e: any) => alert(e.message));
		loadProducts();
	}

	function upd(field: string, value: any) { setForm((f: any) => ({ ...f, [field]: value })); }

	if (loading && view === "list") return <p>Loading products...</p>;

	if (view === "create" || view === "edit") {
		return (
			<div>
				<h1 style={heading}>{view === "edit" ? "Edit Product" : "Create Product"}</h1>
				<div style={card}>
					<div style={formRow}>
						<Field label="Name"><input style={formInput} value={form.name} onChange={(e) => upd("name", e.target.value)} placeholder="Product name" /></Field>
						<Field label="Slug"><input style={formInput} value={form.slug} onChange={(e) => upd("slug", e.target.value)} placeholder="auto-generated" /></Field>
					</div>
					<div style={formRow}>
						<Field label="Type">
							<select style={formSelect} value={form.type} onChange={(e) => upd("type", e.target.value)}>
								<option value="simple">Simple</option>
								<option value="variable">Variable</option>
								<option value="grouped">Grouped</option>
								<option value="virtual">Virtual</option>
								<option value="downloadable">Downloadable</option>
								<option value="external">External</option>
							</select>
						</Field>
						<Field label="Status">
							<select style={formSelect} value={form.status} onChange={(e) => upd("status", e.target.value)}>
								<option value="draft">Draft</option>
								<option value="active">Active</option>
								<option value="archived">Archived</option>
							</select>
						</Field>
					</div>
					<Field label="Short Description"><input style={formInput} value={form.shortDescription} onChange={(e) => upd("shortDescription", e.target.value)} placeholder="Brief summary" /></Field>
					<Field label="Description"><textarea style={{ ...formInput, minHeight: "5rem" }} value={form.description} onChange={(e) => upd("description", e.target.value)} placeholder="Full product description" /></Field>
					<div style={formRow}>
						<Field label="Price ($)"><input style={formInput} type="number" step="0.01" min="0" value={form.price} onChange={(e) => upd("price", e.target.value)} placeholder="19.99" /></Field>
						<Field label="Compare-at Price ($)"><input style={formInput} type="number" step="0.01" min="0" value={form.compareAtPrice} onChange={(e) => upd("compareAtPrice", e.target.value)} placeholder="0.00" /></Field>
					</div>
					<div style={formRow}>
						<Field label="Cost Price ($)"><input style={formInput} type="number" step="0.01" min="0" value={form.costPrice} onChange={(e) => upd("costPrice", e.target.value)} placeholder="0.00" /></Field>
						<Field label="SKU"><input style={formInput} value={form.sku} onChange={(e) => upd("sku", e.target.value)} placeholder="Optional" /></Field>
					</div>
					<div style={formRow}>
						<Field label="Weight (grams)"><input style={formInput} type="number" value={form.weight} onChange={(e) => upd("weight", e.target.value)} /></Field>
						<Field label="Low Stock Threshold"><input style={formInput} type="number" value={form.lowStockThreshold} onChange={(e) => upd("lowStockThreshold", Number(e.target.value))} /></Field>
					</div>
					<div style={{ display: "flex", gap: "1.5rem", margin: "0.75rem 0" }}>
						<label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem" }}>
							<input type="checkbox" checked={form.manageStock} onChange={(e) => upd("manageStock", e.target.checked)} /> Manage stock
						</label>
						{form.manageStock && (
							<Field label="Stock Qty"><input style={{ ...formInput, width: "6rem" }} type="number" value={form.stockQuantity} onChange={(e) => upd("stockQuantity", Number(e.target.value))} /></Field>
						)}
						<label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem" }}>
							<input type="checkbox" checked={form.featured} onChange={(e) => upd("featured", e.target.checked)} /> Featured
						</label>
					</div>

					{/* Tax class */}
					<div style={formRow}>
						<Field label="Tax Class">
							<select style={formSelect} value={form.taxClassId} onChange={(e) => upd("taxClassId", e.target.value)}>
								<option value="">— None —</option>
								{taxClasses.map((tc: any) => <option key={tc.id} value={tc.id}>{tc.name}{tc.isDefault ? " (default)" : ""}</option>)}
							</select>
						</Field>
					</div>

					{/* Categories */}
					<Field label="Categories">
						<div style={{ padding: "0.5rem 0" }}>
							<MultiSelect
								options={categories.map((c: any) => ({ id: c.id, name: c.name }))}
								value={form.categoryIds}
								onChange={(v) => upd("categoryIds", v)}
								placeholder="No categories yet — create them in Categories"
							/>
						</div>
					</Field>

					{/* Tags */}
					<Field label="Tags">
						<div style={{ padding: "0.5rem 0" }}>
							<MultiSelect
								options={tags.map((t: any) => ({ id: t.id, name: t.name }))}
								value={form.tagIds}
								onChange={(v) => upd("tagIds", v)}
								placeholder="No tags yet — create them in Tags"
							/>
						</div>
					</Field>

					<CustomFieldsEditor entityType="product" values={form.customFields || {}} onChange={(v) => upd("customFields", v)} />
					<div style={formActions}>
						<button style={btn} onClick={handleSave} disabled={saving}>{saving ? "Saving..." : view === "edit" ? "Update Product" : "Create Product"}</button>
						<button style={btnSecondary} onClick={back}>Cancel</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
				<h1 style={{ ...heading, margin: 0 }}>Products</h1>
				<button style={btn} onClick={openCreate}>+ New Product</button>
			</div>
			{products.length === 0 ? (
				<div style={{ ...card, textAlign: "center", padding: "3rem" }}>
					<p style={{ color: "#6b7280", margin: "0 0 1rem" }}>No products yet.</p>
					<button style={btn} onClick={openCreate}>Create your first product</button>
				</div>
			) : (
				<div style={card}>
					<table style={table}>
						<thead><tr><th style={th}>Name</th><th style={th}>SKU</th><th style={th}>Type</th><th style={th}>Price</th><th style={th}>Stock</th><th style={th}>Status</th><th style={th}></th></tr></thead>
						<tbody>
							{products.map((p: any) => (
								<tr key={p.id}>
									<td style={{ ...td, fontWeight: 500, cursor: "pointer", color: "#2563eb" }} onClick={() => openEdit(p)}>{p.name}</td>
									<td style={td}>{p.sku || "—"}</td>
									<td style={td}>{p.type}</td>
									<td style={td}>{fmt(p.price)}</td>
									<td style={td}>{p.manageStock ? p.stockQuantity : "—"}</td>
									<td style={td}><span style={badge(p.status === "active" ? "green" : p.status === "draft" ? "yellow" : "red")}>{p.status}</span></td>
									<td style={td}>
										<button style={{ ...btnDanger, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => handleDelete(p.id)}>Delete</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			)}
		</div>
	);
}

// ─── Orders Page (list + detail with status transitions + notes) ─

function OrdersPage() {
	const [orders, setOrders] = React.useState<any[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [selected, setSelected] = React.useState<any>(null);
	const [note, setNote] = React.useState("");

	function load() { api<{ items: any[] }>("orders/list", { limit: 50 }).then((r) => setOrders(r.items)).catch(console.error).finally(() => setLoading(false)); }
	React.useEffect(load, []);

	async function changeStatus(id: string, status: string) {
		await api("orders/update-status", { id, status }).catch((e: any) => alert(e.message));
		load(); if (selected?.id === id) { const o = await api<any>("orders/get", { id }); setSelected({ id, ...o }); }
	}
	async function addNote(id: string) {
		if (!note.trim()) return;
		await api("orders/add-note", { id, content: note }).catch((e: any) => alert(e.message));
		setNote(""); const o = await api<any>("orders/get", { id }); setSelected({ id, ...o });
	}
	async function refund(id: string) {
		const amt = prompt("Refund amount in cents:");
		if (!amt) return;
		await api("orders/refund", { id, amount: Number(amt), reason: "Admin refund" }).catch((e: any) => alert(e.message));
		load(); const o = await api<any>("orders/get", { id }); setSelected({ id, ...o });
	}

	if (loading) return <p>Loading orders...</p>;

	if (selected) {
		const o = selected;
		const nextStatuses: any = { pending_payment: ["processing", "cancelled"], processing: ["on_hold", "shipped", "completed", "cancelled"], on_hold: ["processing", "cancelled"], shipped: ["completed"], completed: ["refunded"], cancelled: [], refunded: [] };
		return (
			<div>
				<button style={{ ...btnSecondary, marginBottom: "1rem" }} onClick={() => setSelected(null)}>Back to Orders</button>
				<h1 style={heading}>Order {o.orderNumber}</h1>
				<div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem", marginBottom: "1.5rem" }}>
					<div style={card}><p style={statLabel}>Status</p><p><span style={badge(o.status === "completed" ? "green" : o.status === "cancelled" ? "red" : "yellow")}>{o.status}</span></p>
						{(nextStatuses[o.status] || []).length > 0 && <div style={{ marginTop: "0.5rem", display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>{(nextStatuses[o.status] as string[]).map((s: string) => <button key={s} style={{ ...btn, padding: "0.25rem 0.625rem", fontSize: "0.75rem" }} onClick={() => changeStatus(o.id, s)}>→ {s}</button>)}</div>}
					</div>
					<div style={card}><p style={statLabel}>Total</p><p style={statValue}>{fmt(o.total)}</p><p style={statLabel}>Payment: {o.paymentStatus} ({o.paymentMethod})</p>
						{o.paymentIntentId && <button style={{ ...btnDanger, padding: "0.25rem 0.625rem", fontSize: "0.75rem", marginTop: "0.5rem" }} onClick={() => refund(o.id)}>Issue Refund</button>}
					</div>
				</div>
				<div style={{ ...card, marginBottom: "1rem" }}>
					<h2 style={subheading}>Items</h2>
					<table style={table}><thead><tr><th style={th}>Product</th><th style={th}>Qty</th><th style={th}>Unit Price</th><th style={th}>Total</th></tr></thead>
						<tbody>{(o.items || []).map((i: any, idx: number) => <tr key={idx}><td style={td}>{i.name}</td><td style={td}>{i.quantity}</td><td style={td}>{fmt(i.unitPrice)}</td><td style={td}>{fmt(i.total)}</td></tr>)}</tbody>
					</table>
				</div>
				<div style={{ ...card, marginBottom: "1rem" }}>
					<h2 style={subheading}>Customer</h2>
					<p>{o.customerEmail}</p>
					{o.billingAddress && <p style={{ fontSize: "0.8125rem", color: "#6b7280" }}>{o.billingAddress.firstName} {o.billingAddress.lastName}, {o.billingAddress.city}, {o.billingAddress.countryCode}</p>}
				</div>
				<div style={card}>
					<h2 style={subheading}>Notes</h2>
					{(o.adminNotes || []).map((n: any) => <div key={n.id} style={{ padding: "0.375rem 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.8125rem" }}><span style={{ color: n.isSystem ? "#6b7280" : "#111827" }}>{n.content}</span><span style={{ color: "#9ca3af", marginLeft: "0.5rem" }}>{new Date(n.createdAt).toLocaleString()}</span></div>)}
					<div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
						<input style={{ ...formInput, flex: 1 }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note..." />
						<button style={btn} onClick={() => addNote(o.id)}>Add</button>
					</div>
				</div>
			</div>
		);
	}

	return (
		<div>
			<h1 style={heading}>Orders</h1>
			{orders.length === 0 ? <div style={{ ...card, textAlign: "center", padding: "3rem" }}><p style={{ color: "#6b7280" }}>No orders yet. Orders appear here after checkout.</p></div> : (
				<div style={card}><table style={table}><thead><tr><th style={th}>Order</th><th style={th}>Customer</th><th style={th}>Status</th><th style={th}>Payment</th><th style={th}>Total</th><th style={th}>Date</th></tr></thead>
					<tbody>{orders.map((o: any) => <tr key={o.id} style={{ cursor: "pointer" }} onClick={() => { api<any>("orders/get", { id: o.id }).then((d) => setSelected({ id: o.id, ...d })); }}>
						<td style={{ ...td, fontWeight: 500, color: "#2563eb" }}>{o.orderNumber}</td><td style={td}>{o.customerEmail}</td><td style={td}><span style={badge(o.status === "completed" ? "green" : o.status === "cancelled" ? "red" : "yellow")}>{o.status}</span></td><td style={td}><span style={badge(o.paymentStatus === "captured" ? "green" : "yellow")}>{o.paymentStatus}</span></td><td style={td}>{fmt(o.total)}</td><td style={td}>{new Date(o.createdAt).toLocaleDateString()}</td>
					</tr>)}</tbody></table></div>
			)}
		</div>
	);
}

// ─── Customers Page (CRUD) ──────────────────────────────────────

function CustomersPage() {
	const [customers, setCustomers] = React.useState<any[]>([]);
	const [customerGroups, setCustomerGroups] = React.useState<any[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [view, setView] = React.useState<"list" | "form">("list");
	const [editing, setEditing] = React.useState<any>(null);
	const [saving, setSaving] = React.useState(false);
	const [form, setForm] = React.useState({ email: "", firstName: "", lastName: "", phone: "", groupId: "", note: "", customFields: {} as Record<string, unknown> });

	function load() {
		Promise.all([
			api<{ items: any[] }>("customers/list", { limit: 50 }),
			api<{ items: any[] }>("customer-groups/list", { limit: 50 }),
		]).then(([cr, gr]) => { setCustomers(cr.items); setCustomerGroups(gr.items); }).catch(console.error).finally(() => setLoading(false));
	}
	React.useEffect(load, []);
	// When groups load, backfill groupId if form is open and groupId is empty
	React.useEffect(() => {
		if (view === "form" && !form.groupId && customerGroups.length > 0) {
			const def = customerGroups.find((g) => g.isDefault) ?? customerGroups[0];
			setForm((p) => ({ ...p, groupId: def.id }));
		}
	}, [customerGroups, view]);
	function upd(f: string, v: any) { setForm((p: any) => ({ ...p, [f]: v })); }
	function defaultGroupId() { return customerGroups.find((g: any) => g.isDefault)?.id ?? customerGroups[0]?.id ?? ""; }
	function openCreate() { setForm({ email: "", firstName: "", lastName: "", phone: "", groupId: defaultGroupId(), note: "", customFields: {} }); setEditing(null); setView("form"); }
	function openEdit(c: any) { setForm({ email: c.email, firstName: c.firstName, lastName: c.lastName, phone: c.phone || "", groupId: c.groupId || defaultGroupId(), note: c.note || "", customFields: c.customFields || {} }); setEditing(c); setView("form"); }
	async function save() {
		setSaving(true);
		try {
			const payload = { ...form, phone: form.phone || null, note: form.note || null };
			if (editing) await api("customers/update", { id: editing.id, ...payload });
			else await api("customers/create", payload);
			load(); setView("list");
		} catch (e: any) { alert(e.message); } finally { setSaving(false); }
	}
	async function del(id: string) { if (confirm("Delete customer?")) { await api("customers/delete", { id }).catch((e: any) => alert(e.message)); load(); } }

	const groupName = (id: string) => customerGroups.find((g) => g.id === id)?.name ?? id;

	if (loading && view === "list") return <p>Loading customers...</p>;
	if (view === "form") return (
		<div><h1 style={heading}>{editing ? "Edit" : "New"} Customer</h1><div style={card}>
			<div style={formRow}><Field label="First Name"><input style={formInput} value={form.firstName} onChange={(e) => upd("firstName", e.target.value)} /></Field><Field label="Last Name"><input style={formInput} value={form.lastName} onChange={(e) => upd("lastName", e.target.value)} /></Field></div>
			<div style={formRow}><Field label="Email"><input style={formInput} type="email" value={form.email} onChange={(e) => upd("email", e.target.value)} /></Field><Field label="Phone"><input style={formInput} value={form.phone} onChange={(e) => upd("phone", e.target.value)} /></Field></div>
			<Field label="Customer Group">
				<select style={formSelect} value={form.groupId} onChange={(e) => upd("groupId", e.target.value)}>
					{customerGroups.map((g) => <option key={g.id} value={g.id}>{g.name}{g.isDefault ? " (default)" : ""}</option>)}
				</select>
			</Field>
			<Field label="Note"><textarea style={{ ...formInput, minHeight: "3rem" }} value={form.note} onChange={(e) => upd("note", e.target.value)} /></Field>
			<CustomFieldsEditor entityType="customer" values={form.customFields} onChange={(v) => upd("customFields", v)} />
			<div style={formActions}><button style={btn} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button><button style={btnSecondary} onClick={() => setView("list")}>Cancel</button></div>
		</div></div>
	);
	return (
		<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}><h1 style={{ ...heading, margin: 0 }}>Customers</h1><button style={btn} onClick={openCreate}>+ New Customer</button></div>
			{customers.length === 0 ? <div style={{ ...card, textAlign: "center", padding: "3rem" }}><p style={{ color: "#6b7280" }}>No customers yet.</p><button style={btn} onClick={openCreate}>Add first customer</button></div> : (
				<div style={card}><table style={table}><thead><tr><th style={th}>Name</th><th style={th}>Email</th><th style={th}>Group</th><th style={th}>Orders</th><th style={th}>Spent</th><th style={th}></th></tr></thead>
					<tbody>{customers.map((c: any) => <tr key={c.id}><td style={{ ...td, fontWeight: 500, cursor: "pointer", color: "#2563eb" }} onClick={() => openEdit(c)}>{c.firstName} {c.lastName}</td><td style={td}>{c.email}</td><td style={td}><span style={badge("blue")}>{groupName(c.groupId)}</span></td><td style={td}>{c.totalOrders}</td><td style={td}>{fmt(c.totalSpent)}</td><td style={td}><button style={{ ...btnDanger, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => del(c.id)}>Del</button></td></tr>)}</tbody></table></div>
			)}
		</div>
	);
}

// ─── Coupons Page (CRUD) ────────────────────────────────────────

function CouponsPage() {
	const [coupons, setCoupons] = React.useState<any[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [view, setView] = React.useState<"list" | "form">("list");
	const [editing, setEditing] = React.useState<any>(null);
	const [saving, setSaving] = React.useState(false);
	const [form, setForm] = React.useState(dfltCoupon());
	function dfltCoupon() { return { code: "", description: "", type: "percentage", value: 0, minimumAmount: 0, maximumDiscount: 0, usageLimit: 0, allowStacking: true, enabled: true, startDate: "", endDate: "" }; }

	function load() { api<{ items: any[] }>("coupons/list", { limit: 50 }).then((r) => setCoupons(r.items)).catch(console.error).finally(() => setLoading(false)); }
	React.useEffect(load, []);
	function upd(f: string, v: any) { setForm((p: any) => ({ ...p, [f]: v })); }
	function openCreate() { setForm(dfltCoupon()); setEditing(null); setView("form"); }
	function openEdit(c: any) { setForm({ code: c.code, description: c.description, type: c.type, value: c.value, minimumAmount: c.minimumAmount || 0, maximumDiscount: c.maximumDiscount || 0, usageLimit: c.usageLimit || 0, allowStacking: c.allowStacking, enabled: c.enabled, startDate: c.startDate || "", endDate: c.endDate || "" }); setEditing(c); setView("form"); }
	async function save() {
		setSaving(true);
		try {
			const payload = { ...form, value: Number(form.value), minimumAmount: Number(form.minimumAmount) || null, maximumDiscount: Number(form.maximumDiscount) || null, usageLimit: Number(form.usageLimit) || null, startDate: form.startDate || null, endDate: form.endDate || null };
			if (editing) await api("coupons/update", { id: editing.id, ...payload });
			else await api("coupons/create", payload);
			load(); setView("list");
		} catch (e: any) { alert(e.message); } finally { setSaving(false); }
	}
	async function del(id: string) { if (confirm("Delete coupon?")) { await api("coupons/delete", { id }).catch((e: any) => alert(e.message)); load(); } }

	if (loading && view === "list") return <p>Loading coupons...</p>;
	if (view === "form") return (
		<div><h1 style={heading}>{editing ? "Edit" : "New"} Coupon</h1><div style={card}>
			<div style={formRow}><Field label="Code"><input style={formInput} value={form.code} onChange={(e) => upd("code", e.target.value.toUpperCase())} placeholder="SUMMER20" /></Field>
				<Field label="Type"><select style={formSelect} value={form.type} onChange={(e) => upd("type", e.target.value)}><option value="percentage">Percentage</option><option value="fixed_cart">Fixed (Cart)</option><option value="fixed_product">Fixed (Product)</option><option value="free_shipping">Free Shipping</option><option value="bogo">Buy One Get One</option></select></Field></div>
			<div style={formRow}><Field label={form.type === "percentage" ? "Discount %" : "Discount ($)"}><input style={formInput} type="number" step={form.type === "percentage" ? "1" : "0.01"} min="0" value={form.type === "percentage" ? Number(form.value) / 100 : toDollars(Number(form.value))} onChange={(e) => upd("value", form.type === "percentage" ? Number(e.target.value) * 100 : toCents(e.target.value))} placeholder={form.type === "percentage" ? "10" : "5.00"} /></Field>
				<Field label="Min Order ($)"><input style={formInput} type="number" step="0.01" min="0" value={toDollars(Number(form.minimumAmount))} onChange={(e) => upd("minimumAmount", toCents(e.target.value))} /></Field></div>
			<div style={formRow}><Field label="Max Discount ($, 0=none)"><input style={formInput} type="number" step="0.01" min="0" value={toDollars(Number(form.maximumDiscount))} onChange={(e) => upd("maximumDiscount", toCents(e.target.value))} /></Field>
				<Field label="Usage Limit (0=unlimited)"><input style={formInput} type="number" value={form.usageLimit} onChange={(e) => upd("usageLimit", e.target.value)} /></Field></div>
			<div style={formRow}><Field label="Start Date"><input style={formInput} type="datetime-local" value={form.startDate?.slice(0, 16) || ""} onChange={(e) => upd("startDate", e.target.value ? new Date(e.target.value).toISOString() : "")} /></Field>
				<Field label="End Date"><input style={formInput} type="datetime-local" value={form.endDate?.slice(0, 16) || ""} onChange={(e) => upd("endDate", e.target.value ? new Date(e.target.value).toISOString() : "")} /></Field></div>
			<Field label="Description"><input style={formInput} value={form.description} onChange={(e) => upd("description", e.target.value)} /></Field>
			<div style={{ display: "flex", gap: "1.5rem", margin: "0.75rem 0" }}>
				<label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem" }}><input type="checkbox" checked={form.enabled} onChange={(e) => upd("enabled", e.target.checked)} /> Enabled</label>
				<label style={{ display: "flex", alignItems: "center", gap: "0.375rem", fontSize: "0.875rem" }}><input type="checkbox" checked={form.allowStacking} onChange={(e) => upd("allowStacking", e.target.checked)} /> Allow stacking</label>
			</div>
			<div style={formActions}><button style={btn} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button><button style={btnSecondary} onClick={() => setView("list")}>Cancel</button></div>
		</div></div>
	);
	return (
		<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}><h1 style={{ ...heading, margin: 0 }}>Coupons</h1><button style={btn} onClick={openCreate}>+ New Coupon</button></div>
			{coupons.length === 0 ? <div style={{ ...card, textAlign: "center", padding: "3rem" }}><p style={{ color: "#6b7280" }}>No coupons yet.</p><button style={btn} onClick={openCreate}>Create first coupon</button></div> : (
				<div style={card}><table style={table}><thead><tr><th style={th}>Code</th><th style={th}>Type</th><th style={th}>Value</th><th style={th}>Usage</th><th style={th}>Status</th><th style={th}></th></tr></thead>
					<tbody>{coupons.map((c: any) => <tr key={c.id}><td style={{ ...td, fontWeight: 500, fontFamily: "monospace", cursor: "pointer", color: "#2563eb" }} onClick={() => openEdit(c)}>{c.code}</td><td style={td}>{c.type}</td><td style={td}>{c.type === "percentage" ? `${(c.value / 100).toFixed(0)}%` : fmt(c.value)}</td><td style={td}>{c.usageCount}{c.usageLimit ? ` / ${c.usageLimit}` : ""}</td><td style={td}><span style={badge(c.enabled ? "green" : "red")}>{c.enabled ? "Active" : "Off"}</span></td><td style={td}><button style={{ ...btnDanger, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => del(c.id)}>Del</button></td></tr>)}</tbody></table></div>
			)}
		</div>
	);
}

// ─── Pricing Page (CRUD for specific + catalog rules) ───────────

// ─── Catalog Rule Condition Builder ────────────────────────────

type ConditionDraft = {
	type: "category" | "tag" | "attribute" | "price_range";
	categoryIds: string[];
	tagIds: string[];
	attributeName: string;
	attributeValues: string; // comma-separated
	priceMin: string;
	priceMax: string;
};

function newCondition(): ConditionDraft {
	return { type: "category", categoryIds: [], tagIds: [], attributeName: "", attributeValues: "", priceMin: "", priceMax: "" };
}

function conditionToApi(c: ConditionDraft): any {
	switch (c.type) {
		case "category": return { type: "category", categoryIds: c.categoryIds };
		case "tag": return { type: "tag", tagIds: c.tagIds };
		case "attribute": return { type: "attribute", attributeName: c.attributeName, values: c.attributeValues.split(",").map((s) => s.trim()).filter(Boolean) };
		case "price_range": return { type: "price_range", min: Math.round(Number(c.priceMin || 0) * 100), max: Math.round(Number(c.priceMax || 0) * 100) };
	}
}

function ConditionBuilder({ conditions, onChange, categories, tags }: {
	conditions: ConditionDraft[];
	onChange: (cs: ConditionDraft[]) => void;
	categories: any[];
	tags: any[];
}) {
	function upd(i: number, patch: Partial<ConditionDraft>) {
		const next = conditions.map((c, idx) => idx === i ? { ...c, ...patch } : c);
		onChange(next);
	}
	function remove(i: number) { onChange(conditions.filter((_, idx) => idx !== i)); }
	function add() { onChange([...conditions, newCondition()]); }

	const condBox: React.CSSProperties = { border: "1px solid #e5e7eb", borderRadius: "0.5rem", padding: "1rem", marginBottom: "0.75rem", background: "#fafafa" };
	const orLabel: React.CSSProperties = { display: "block", textAlign: "center", fontSize: "0.75rem", fontWeight: 700, color: "#9ca3af", margin: "0.25rem 0", letterSpacing: "0.05em" };

	return (
		<div>
			{conditions.map((c, i) => (
				<div key={i}>
					{i > 0 && <span style={orLabel}>OR</span>}
					<div style={condBox}>
						<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
							<Field label="Condition type">
								<select style={{ ...formSelect, width: "auto" }} value={c.type} onChange={(e) => upd(i, { type: e.target.value as any })}>
									<option value="category">Category</option>
									<option value="tag">Tag</option>
									<option value="attribute">Attribute</option>
									<option value="price_range">Price Range</option>
								</select>
							</Field>
							{conditions.length > 1 && (
								<button style={{ ...btnDanger, padding: "0.25rem 0.5rem", fontSize: "0.75rem", marginTop: "1.25rem" }} onClick={() => remove(i)}>Remove</button>
							)}
						</div>
						{c.type === "category" && (
							<Field label="Categories (product must belong to one of these)">
								<div style={{ padding: "0.375rem 0" }}>
									<MultiSelect
										options={categories.map((cat: any) => ({ id: cat.id, name: cat.name }))}
										value={c.categoryIds}
										onChange={(v) => upd(i, { categoryIds: v })}
										placeholder="No categories yet"
									/>
								</div>
							</Field>
						)}
						{c.type === "tag" && (
							<Field label="Tags (product must have at least one of these)">
								<div style={{ padding: "0.375rem 0" }}>
									<MultiSelect
										options={tags.map((t: any) => ({ id: t.id, name: t.name }))}
										value={c.tagIds}
										onChange={(v) => upd(i, { tagIds: v })}
										placeholder="No tags yet"
									/>
								</div>
							</Field>
						)}
						{c.type === "attribute" && (
							<div style={formRow}>
								<Field label="Attribute name"><input style={formInput} value={c.attributeName} onChange={(e) => upd(i, { attributeName: e.target.value })} placeholder='e.g. "color"' /></Field>
								<Field label="Values (comma-separated)"><input style={formInput} value={c.attributeValues} onChange={(e) => upd(i, { attributeValues: e.target.value })} placeholder='e.g. "red, blue"' /></Field>
							</div>
						)}
						{c.type === "price_range" && (
							<div style={formRow}>
								<Field label="Min price ($)"><input style={formInput} type="number" step="0.01" min="0" value={c.priceMin} onChange={(e) => upd(i, { priceMin: e.target.value })} placeholder="0.00" /></Field>
								<Field label="Max price ($)"><input style={formInput} type="number" step="0.01" min="0" value={c.priceMax} onChange={(e) => upd(i, { priceMax: e.target.value })} placeholder="999999.99" /></Field>
							</div>
						)}
					</div>
				</div>
			))}
			<button style={{ ...btnSecondary, fontSize: "0.8125rem" }} onClick={add} type="button">+ Add condition (OR)</button>
			<p style={{ fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.5rem" }}>
				Within a condition group, conditions are OR'd — a product matches if it satisfies <em>any</em> of them.
			</p>
		</div>
	);
}

function PricingPage() {
	const [tab, setTab] = React.useState<"specific" | "catalog" | "groups">("specific");
	const [specific, setSpecific] = React.useState<any[]>([]);
	const [catalog, setCatalog] = React.useState<any[]>([]);
	const [customerGroups, setCustomerGroups] = React.useState<any[]>([]);
	const [categories, setCategories] = React.useState<any[]>([]);
	const [tags, setTags] = React.useState<any[]>([]);
	const [products, setProducts] = React.useState<any[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [view, setView] = React.useState<"list" | "form">("list");
	const [saving, setSaving] = React.useState(false);

	// Customer group form state
	const defaultCgForm = () => ({ name: "", slug: "", description: "", isDefault: false });
	const [cgForm, setCgForm] = React.useState(defaultCgForm());
	const [cgEditing, setCgEditing] = React.useState<any>(null);
	const [cgView, setCgView] = React.useState<"list" | "form">("list");

	const defaultSp = () => ({ productId: "", reductionType: "percentage", reductionValue: 0, price: "", fromQuantity: 1, priority: 0, customerGroupId: "", countryCode: "", startDate: "", endDate: "" });
	const defaultCr = () => ({ name: "", description: "", reductionType: "percentage", reductionValue: 0, reductionTaxIncluded: false, priority: 0, enabled: true, startDate: "", endDate: "", conditions: [newCondition()] });

	const [spForm, setSpForm] = React.useState(defaultSp());
	const [crForm, setCrForm] = React.useState(defaultCr());

	function load() {
		Promise.all([
			api<{ items: any[] }>("pricing/specific/list", { limit: 50 }),
			api<{ items: any[] }>("pricing/catalog/list", { limit: 50 }),
			api<{ items: any[] }>("customer-groups/list", { limit: 50 }),
			api<{ items: any[] }>("categories/list", { limit: 100 }),
			api<{ items: any[] }>("tags/list", { limit: 100 }),
			api<{ items: any[] }>("products/list", { limit: 100 }),
		]).then(([s, c, cg, cats, ts, ps]) => {
			setSpecific(s.items); setCatalog(c.items);
			setCustomerGroups(cg.items); setCategories(cats.items);
			setTags(ts.items); setProducts(ps.items);
		}).catch(console.error).finally(() => setLoading(false));
	}
	React.useEffect(load, []);

	const tabStyle = (active: boolean): React.CSSProperties => ({ padding: "0.5rem 1rem", border: "none", borderBottom: active ? "2px solid #2563eb" : "2px solid transparent", background: "none", fontWeight: active ? 600 : 400, color: active ? "#2563eb" : "#6b7280", cursor: "pointer", fontSize: "0.875rem" });

	async function saveSp() {
		setSaving(true);
		try {
			await api("pricing/specific/create", {
				...spForm,
				reductionValue: Number(spForm.reductionValue),
				fromQuantity: Number(spForm.fromQuantity),
				priority: Number(spForm.priority),
				productId: spForm.productId || null,
				customerGroupId: spForm.customerGroupId || null,
				countryCode: spForm.countryCode || null,
				price: spForm.price ? Number(spForm.price) : null,
				startDate: spForm.startDate ? new Date(spForm.startDate).toISOString() : null,
				endDate: spForm.endDate ? new Date(spForm.endDate).toISOString() : null,
			});
			setSpForm(defaultSp()); load(); setView("list");
		} catch (e: any) { alert(e.message); } finally { setSaving(false); }
	}

	async function saveCr() {
		setSaving(true);
		try {
			// Build conditionGroups — one group, conditions are OR'd within it
			const conditions = crForm.conditions.map(conditionToApi).filter((c: any) => {
				if (c.type === "category") return c.categoryIds.length > 0;
				if (c.type === "tag") return c.tagIds.length > 0;
				if (c.type === "attribute") return c.attributeName.trim();
				return true; // price_range always valid
			});
			// If no conditions specified, apply to all products (empty conditionGroups)
			const conditionGroups = conditions.length > 0 ? [{ conditions }] : [];
			await api("pricing/catalog/create", {
				name: crForm.name,
				description: crForm.description,
				reductionType: crForm.reductionType,
				reductionValue: Number(crForm.reductionValue),
				reductionTaxIncluded: crForm.reductionTaxIncluded,
				priority: Number(crForm.priority),
				enabled: crForm.enabled,
				conditionGroups,
				startDate: crForm.startDate ? new Date(crForm.startDate).toISOString() : null,
				endDate: crForm.endDate ? new Date(crForm.endDate).toISOString() : null,
			});
			setCrForm(defaultCr()); load(); setView("list");
		} catch (e: any) { alert(e.message); } finally { setSaving(false); }
	}

	async function delSp(id: string) { await api("pricing/specific/delete", { id }).catch((e: any) => alert(e.message)); load(); }
	async function delCr(id: string) { if (confirm("Delete rule?")) { await api("pricing/catalog/delete", { id }).catch((e: any) => alert(e.message)); load(); } }

	async function saveCg() {
		setSaving(true);
		try {
			const payload = { ...cgForm, slug: cgForm.slug || cgForm.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") };
			if (cgEditing) await api("customer-groups/update", { id: cgEditing.id, ...payload });
			else await api("customer-groups/create", payload);
			setCgForm(defaultCgForm()); setCgEditing(null); setCgView("list"); load();
		} catch (e: any) { alert(e.message); } finally { setSaving(false); }
	}
	async function delCg(g: any) {
		if (g.isDefault) { alert("Cannot delete the default group. Mark another group as default first."); return; }
		if (confirm(`Delete group "${g.name}"?`)) { await api("customer-groups/delete", { id: g.id }).catch((e: any) => alert(e.message)); load(); }
	}
	function openEditCg(g: any) { setCgForm({ name: g.name, slug: g.slug, description: g.description || "", isDefault: g.isDefault }); setCgEditing(g); setCgView("form"); }

	const productName = (id: string) => products.find((p: any) => p.id === id)?.name ?? id;
	const groupName = (id: string) => customerGroups.find((g: any) => g.id === id)?.name ?? id;

	if (loading) return <p>Loading pricing rules...</p>;

	// ── Specific Price Form ─────────────────────────────────────
	if (view === "form" && tab === "specific") return (
		<div>
			<h1 style={heading}>New Specific Price</h1>
			<div style={card}>
				<p style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "1rem" }}>
					Specific prices target individual products with optional customer group, quantity, country, and date filters.
					Lower priority number = higher precedence. Ties broken by specificity (customer &gt; group &gt; country &gt; currency).
				</p>
				<div style={formRow}>
					<Field label="Product (blank = all products)">
						<select style={formSelect} value={spForm.productId} onChange={(e) => setSpForm((f) => ({ ...f, productId: e.target.value }))}>
							<option value="">All products</option>
							{products.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
						</select>
					</Field>
					<Field label="Customer Group (blank = all customers)">
						<select style={formSelect} value={spForm.customerGroupId} onChange={(e) => setSpForm((f) => ({ ...f, customerGroupId: e.target.value }))}>
							<option value="">All customers</option>
							{customerGroups.map((g: any) => <option key={g.id} value={g.id}>{g.name}{g.isDefault ? " (default)" : ""}</option>)}
						</select>
					</Field>
				</div>
				<div style={formRow}>
					<Field label="Reduction Type">
						<select style={formSelect} value={spForm.reductionType} onChange={(e) => setSpForm((f) => ({ ...f, reductionType: e.target.value }))}>
							<option value="percentage">Percentage (%)</option>
							<option value="amount">Fixed Amount ($)</option>
						</select>
					</Field>
					<Field label={spForm.reductionType === "percentage" ? "Discount %" : "Discount Amount ($)"}>
						<input style={formInput} type="number" step={spForm.reductionType === "percentage" ? "1" : "0.01"} min="0" value={spForm.reductionValue} onChange={(e) => setSpForm((f) => ({ ...f, reductionValue: Number(e.target.value) }))} />
					</Field>
				</div>
				<div style={formRow}>
					<Field label="Fixed Price Override ($, blank = apply reduction)">
						<input style={formInput} type="number" step="0.01" min="0" value={spForm.price} onChange={(e) => setSpForm((f) => ({ ...f, price: e.target.value }))} placeholder="Leave blank to use reduction" />
					</Field>
					<Field label="Min Quantity (for volume pricing)">
						<input style={formInput} type="number" min="1" value={spForm.fromQuantity} onChange={(e) => setSpForm((f) => ({ ...f, fromQuantity: Number(e.target.value) }))} />
					</Field>
				</div>
				<div style={formRow}>
					<Field label="Country Code (blank = all countries)">
						<input style={formInput} value={spForm.countryCode} onChange={(e) => setSpForm((f) => ({ ...f, countryCode: e.target.value.toUpperCase() }))} placeholder="US, GB, DE…" maxLength={2} />
					</Field>
					<Field label="Priority (0 = highest, 4 = lowest)">
						<input style={formInput} type="number" min={0} max={4} value={spForm.priority} onChange={(e) => setSpForm((f) => ({ ...f, priority: Number(e.target.value) }))} />
					</Field>
				</div>
				<div style={formRow}>
					<Field label="Active From"><input style={formInput} type="datetime-local" value={spForm.startDate} onChange={(e) => setSpForm((f) => ({ ...f, startDate: e.target.value }))} /></Field>
					<Field label="Active Until"><input style={formInput} type="datetime-local" value={spForm.endDate} onChange={(e) => setSpForm((f) => ({ ...f, endDate: e.target.value }))} /></Field>
				</div>
				<div style={formActions}>
					<button style={btn} onClick={saveSp} disabled={saving}>{saving ? "Saving..." : "Create Rule"}</button>
					<button style={btnSecondary} onClick={() => setView("list")}>Cancel</button>
				</div>
			</div>
		</div>
	);

	// ── Catalog Rule Form ───────────────────────────────────────
	if (view === "form" && tab === "catalog") return (
		<div>
			<h1 style={heading}>New Catalog Price Rule</h1>
			<div style={card}>
				<p style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "1rem" }}>
					Catalog rules apply bulk discounts to products matching the conditions below.
					Leave conditions empty to apply to all products. Multiple condition groups are AND'd together.
				</p>
				<div style={formRow}>
					<Field label="Rule Name"><input style={formInput} value={crForm.name} onChange={(e) => setCrForm((f) => ({ ...f, name: e.target.value }))} placeholder="Summer Sale, Members Discount…" /></Field>
					<Field label="Description (optional)"><input style={formInput} value={crForm.description} onChange={(e) => setCrForm((f) => ({ ...f, description: e.target.value }))} placeholder="Internal note" /></Field>
				</div>
				<div style={formRow}>
					<Field label="Reduction Type">
						<select style={formSelect} value={crForm.reductionType} onChange={(e) => setCrForm((f) => ({ ...f, reductionType: e.target.value }))}>
							<option value="percentage">Percentage (%)</option>
							<option value="amount">Fixed Amount ($)</option>
						</select>
					</Field>
					<Field label={crForm.reductionType === "percentage" ? "Discount %" : "Discount Amount ($)"}>
						<input style={formInput} type="number" step={crForm.reductionType === "percentage" ? "1" : "0.01"} min="0" value={crForm.reductionValue} onChange={(e) => setCrForm((f) => ({ ...f, reductionValue: Number(e.target.value) }))} />
					</Field>
				</div>
				<div style={formRow}>
					<Field label="Priority (0 = highest)">
						<input style={formInput} type="number" min={0} max={4} value={crForm.priority} onChange={(e) => setCrForm((f) => ({ ...f, priority: Number(e.target.value) }))} />
					</Field>
					<Field label="Status">
						<select style={formSelect} value={String(crForm.enabled)} onChange={(e) => setCrForm((f) => ({ ...f, enabled: e.target.value === "true" }))}>
							<option value="true">Active</option>
							<option value="false">Disabled</option>
						</select>
					</Field>
				</div>
				<div style={formRow}>
					<label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem" }}>
						<input type="checkbox" checked={crForm.reductionTaxIncluded} onChange={(e) => setCrForm((f) => ({ ...f, reductionTaxIncluded: e.target.checked })) } />
						Reduction is tax-inclusive
					</label>
				</div>
				<div style={formRow}>
					<Field label="Active From"><input style={formInput} type="datetime-local" value={crForm.startDate} onChange={(e) => setCrForm((f) => ({ ...f, startDate: e.target.value }))} /></Field>
					<Field label="Active Until"><input style={formInput} type="datetime-local" value={crForm.endDate} onChange={(e) => setCrForm((f) => ({ ...f, endDate: e.target.value }))} /></Field>
				</div>

				{/* Condition builder */}
				<div style={{ marginTop: "1.25rem" }}>
					<p style={{ ...subheading, margin: "0 0 0.75rem" }}>Product Conditions</p>
					<p style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "1rem" }}>
						Only products matching these conditions will receive the discount.
						Leave empty to apply to ALL products.
					</p>
					<ConditionBuilder
						conditions={crForm.conditions}
						onChange={(cs) => setCrForm((f) => ({ ...f, conditions: cs }))}
						categories={categories}
						tags={tags}
					/>
				</div>

				<div style={formActions}>
					<button style={btn} onClick={saveCr} disabled={saving}>{saving ? "Saving..." : "Create Rule"}</button>
					<button style={btnSecondary} onClick={() => setView("list")}>Cancel</button>
				</div>
			</div>
		</div>
	);

	// ── Customer Groups form ────────────────────────────────────
	if (tab === "groups" && cgView === "form") return (
		<div><h1 style={heading}>{cgEditing ? "Edit" : "New"} Customer Group</h1><div style={card}>
			<p style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "1rem" }}>
				Customer groups let you apply group-specific pricing via Specific Prices. All new customers are automatically assigned to the default group.
			</p>
			<div style={formRow}>
				<Field label="Name"><input style={formInput} value={cgForm.name} onChange={(e) => setCgForm((f) => ({ ...f, name: e.target.value }))} placeholder="Wholesale, VIP, Staff…" /></Field>
				<Field label="Slug (auto-generated if blank)"><input style={formInput} value={cgForm.slug} onChange={(e) => setCgForm((f) => ({ ...f, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} placeholder="wholesale" /></Field>
			</div>
			<Field label="Description (optional)"><input style={formInput} value={cgForm.description} onChange={(e) => setCgForm((f) => ({ ...f, description: e.target.value }))} /></Field>
			<label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.875rem", marginTop: "0.75rem" }}>
				<input type="checkbox" checked={cgForm.isDefault} onChange={(e) => setCgForm((f) => ({ ...f, isDefault: e.target.checked }))} />
				Default group — new customers are assigned here automatically
			</label>
			<div style={formActions}>
				<button style={btn} onClick={saveCg} disabled={saving}>{saving ? "Saving..." : cgEditing ? "Save Changes" : "Create Group"}</button>
				<button style={btnSecondary} onClick={() => { setCgView("list"); setCgEditing(null); setCgForm(defaultCgForm()); }}>Cancel</button>
			</div>
		</div></div>
	);

	// ── List view ───────────────────────────────────────────────
	return (
		<div>
			<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
				<h1 style={{ ...heading, margin: 0 }}>Pricing Rules</h1>
				{tab !== "groups" && <button style={btn} onClick={() => setView("form")}>+ New {tab === "specific" ? "Specific Price" : "Catalog Rule"}</button>}
				{tab === "groups" && <button style={btn} onClick={() => { setCgForm(defaultCgForm()); setCgEditing(null); setCgView("form"); }}>+ New Group</button>}
			</div>
			<div style={{ display: "flex", gap: "0.5rem", borderBottom: "1px solid #e5e7eb", marginBottom: "1.5rem" }}>
				<button style={tabStyle(tab === "specific")} onClick={() => setTab("specific")}>Specific Prices ({specific.length})</button>
				<button style={tabStyle(tab === "catalog")} onClick={() => setTab("catalog")}>Catalog Rules ({catalog.length})</button>
				<button style={tabStyle(tab === "groups")} onClick={() => setTab("groups")}>Customer Groups ({customerGroups.length})</button>
			</div>
			{tab === "specific" && (
				specific.length === 0 ? (
					<div style={{ ...card, textAlign: "center", padding: "3rem" }}>
						<p style={{ color: "#6b7280", margin: "0 0 1rem" }}>No specific prices. Create one to set per-product or per-group pricing.</p>
						<button style={btn} onClick={() => setView("form")}>Create Specific Price</button>
					</div>
				) : (
					<div style={card}>
						<table style={table}>
							<thead><tr>
								<th style={th}>Product</th>
								<th style={th}>Customer Group</th>
								<th style={th}>Reduction</th>
								<th style={th}>Min Qty</th>
								<th style={th}>Priority</th>
								<th style={th}>Country</th>
								<th style={th}></th>
							</tr></thead>
							<tbody>{specific.map((s: any) => (
								<tr key={s.id}>
									<td style={td}>{s.productId ? productName(s.productId) : <em style={{ color: "#9ca3af" }}>All</em>}</td>
									<td style={td}>{s.customerGroupId ? groupName(s.customerGroupId) : <em style={{ color: "#9ca3af" }}>All</em>}</td>
									<td style={td}>
										{s.reductionType === "percentage" ? `${(s.reductionValue / 100).toFixed(0)}%` : fmt(s.reductionValue)}
										{s.price !== null ? <span style={{ color: "#6b7280" }}> (fixed: {fmt(s.price)})</span> : ""}
									</td>
									<td style={td}>{s.fromQuantity}+</td>
									<td style={td}>{s.priority}</td>
									<td style={td}>{s.countryCode || <em style={{ color: "#9ca3af" }}>All</em>}</td>
									<td style={td}><button style={{ ...btnDanger, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => delSp(s.id)}>Delete</button></td>
								</tr>
							))}</tbody>
						</table>
					</div>
				)
			)}
			{tab === "catalog" && (
				catalog.length === 0 ? (
					<div style={{ ...card, textAlign: "center", padding: "3rem" }}>
						<p style={{ color: "#6b7280", margin: "0 0 1rem" }}>No catalog rules. Create one for category, tag, or attribute-based discounts.</p>
						<button style={btn} onClick={() => setView("form")}>Create Catalog Rule</button>
					</div>
				) : (
					<div style={card}>
						<table style={table}>
							<thead><tr>
								<th style={th}>Name</th>
								<th style={th}>Reduction</th>
								<th style={th}>Conditions</th>
								<th style={th}>Priority</th>
								<th style={th}>Status</th>
								<th style={th}></th>
							</tr></thead>
							<tbody>{catalog.map((c: any) => {
								const condCount = (c.conditionGroups ?? []).reduce((s: number, g: any) => s + g.conditions.length, 0);
								return (
									<tr key={c.id}>
										<td style={{ ...td, fontWeight: 500 }}>{c.name}</td>
										<td style={td}>{c.reductionType === "percentage" ? `${(c.reductionValue / 100).toFixed(0)}%` : fmt(c.reductionValue)}</td>
										<td style={td}>{condCount === 0 ? <em style={{ color: "#9ca3af" }}>All products</em> : `${condCount} condition${condCount !== 1 ? "s" : ""}`}</td>
										<td style={td}>{c.priority}</td>
										<td style={td}><span style={badge(c.enabled ? "green" : "red")}>{c.enabled ? "Active" : "Off"}</span></td>
										<td style={td}><button style={{ ...btnDanger, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => delCr(c.id)}>Delete</button></td>
									</tr>
								);
							})}</tbody>
						</table>
					</div>
				)
			)}
			{tab === "groups" && (
				customerGroups.length === 0 ? (
					<div style={{ ...card, textAlign: "center", padding: "3rem" }}>
						<p style={{ color: "#6b7280", margin: "0 0 1rem" }}>No customer groups. Create one to enable group-based pricing.</p>
						<button style={btn} onClick={() => { setCgForm(defaultCgForm()); setCgEditing(null); setCgView("form"); }}>Create Group</button>
					</div>
				) : (
					<div style={card}>
						<table style={table}>
							<thead><tr>
								<th style={th}>Name</th>
								<th style={th}>Slug</th>
								<th style={th}>Description</th>
								<th style={th}>Status</th>
								<th style={th}></th>
							</tr></thead>
							<tbody>{customerGroups.map((g: any) => (
								<tr key={g.id}>
									<td style={{ ...td, fontWeight: 500, cursor: "pointer", color: "#2563eb" }} onClick={() => openEditCg(g)}>{g.name}</td>
									<td style={{ ...td, fontFamily: "monospace", fontSize: "0.8125rem" }}>{g.slug}</td>
									<td style={td}>{g.description || <em style={{ color: "#9ca3af" }}>—</em>}</td>
									<td style={td}>{g.isDefault ? <span style={badge("green")}>Default</span> : <span style={badge("gray")}>Group</span>}</td>
									<td style={td}>
										<button style={{ ...btnSecondary, padding: "0.25rem 0.5rem", fontSize: "0.75rem", marginRight: "0.25rem" }} onClick={() => openEditCg(g)}>Edit</button>
										<button style={{ ...btnDanger, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => delCg(g)} disabled={g.isDefault}>Delete</button>
									</td>
								</tr>
							))}</tbody>
						</table>
						<p style={{ fontSize: "0.75rem", color: "#9ca3af", padding: "0.75rem 1rem 0", borderTop: "1px solid #f3f4f6" }}>
							The default group is automatically assigned to new customers. Mark another group as default before deleting the current one.
						</p>
					</div>
				)
			)}
		</div>
	);
}

// ─── Shipping Page (CRUD) ───────────────────────────────────────

function ShippingPage() {
	const [zones, setZones] = React.useState<any[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [view, setView] = React.useState<"list" | "form">("list");
	const [saving, setSaving] = React.useState(false);
	const [form, setForm] = React.useState({ name: "", methodName: "Flat Rate", methodType: "flat_rate", cost: 500 });

	function load() { api<{ items: any[] }>("shipping-zones/list", { limit: 50 }).then((r) => setZones(r.items)).catch(console.error).finally(() => setLoading(false)); }
	React.useEffect(load, []);

	async function save() {
		setSaving(true);
		try {
			await api("shipping-zones/create", { name: form.name, regions: [], methods: [{ id: crypto.randomUUID(), type: form.methodType, name: form.methodName, enabled: true, cost: Number(form.cost), freeShippingMinimum: null, weightRates: null, priceRates: null, sortOrder: 0 }], sortOrder: zones.length });
			load(); setView("list");
		} catch (e: any) { alert(e.message); } finally { setSaving(false); }
	}
	async function del(id: string) { if (confirm("Delete zone?")) { await api("shipping-zones/delete", { id }).catch((e: any) => alert(e.message)); load(); } }

	if (loading) return <p>Loading shipping zones...</p>;
	if (view === "form") return (
		<div><h1 style={heading}>New Shipping Zone</h1><div style={card}>
			<Field label="Zone Name"><input style={formInput} value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="US Domestic" /></Field>
			<div style={formRow}><Field label="Method Name"><input style={formInput} value={form.methodName} onChange={(e) => setForm((f) => ({ ...f, methodName: e.target.value }))} /></Field>
				<Field label="Method Type"><select style={formSelect} value={form.methodType} onChange={(e) => setForm((f) => ({ ...f, methodType: e.target.value }))}><option value="flat_rate">Flat Rate</option><option value="free_shipping">Free Shipping</option><option value="weight_based">Weight Based</option><option value="price_based">Price Based</option></select></Field></div>
			<Field label="Cost (cents)"><input style={formInput} type="number" value={form.cost} onChange={(e) => setForm((f) => ({ ...f, cost: Number(e.target.value) }))} /></Field>
			<div style={formActions}><button style={btn} onClick={save} disabled={saving}>{saving ? "Saving..." : "Create Zone"}</button><button style={btnSecondary} onClick={() => setView("list")}>Cancel</button></div>
		</div></div>
	);
	return (
		<div><div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}><h1 style={{ ...heading, margin: 0 }}>Shipping</h1><button style={btn} onClick={() => setView("form")}>+ New Zone</button></div>
			{zones.length === 0 ? <div style={{ ...card, textAlign: "center", padding: "3rem" }}><p style={{ color: "#6b7280" }}>No shipping zones.</p></div> : zones.map((z: any) => (
				<div key={z.id} style={{ ...card, marginBottom: "1rem" }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}><h2 style={subheading}>{z.name}</h2><button style={{ ...btnDanger, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => del(z.id)}>Delete</button></div>
					<p style={{ fontSize: "0.8125rem", color: "#6b7280", margin: "0 0 0.75rem" }}>{z.regions.length === 0 ? "All countries (Rest of World)" : z.regions.map((r: any) => r.stateCode ? `${r.countryCode}-${r.stateCode}` : r.countryCode).join(", ")}</p>
					{z.methods.length > 0 && <table style={table}><thead><tr><th style={th}>Method</th><th style={th}>Type</th><th style={th}>Cost</th><th style={th}>Status</th></tr></thead>
						<tbody>{z.methods.map((m: any) => <tr key={m.id}><td style={td}>{m.name}</td><td style={td}>{m.type}</td><td style={td}>{m.cost !== null ? fmt(m.cost) : "—"}</td><td style={td}><span style={badge(m.enabled ? "green" : "red")}>{m.enabled ? "Active" : "Off"}</span></td></tr>)}</tbody></table>}
				</div>
			))}
		</div>
	);
}

// ─── Tax Page (CRUD for classes + rules) ────────────────────────

function TaxPage() {
	const [classes, setClasses] = React.useState<any[]>([]);
	const [rules, setRules] = React.useState<any[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [ruleForm, setRuleForm] = React.useState({ taxClassId: "", name: "", countryCode: "", stateCode: "", rate: 0, compound: false, priority: 0 });
	const [showRuleForm, setShowRuleForm] = React.useState(false);
	const [saving, setSaving] = React.useState(false);

	function load() { Promise.all([api<{ items: any[] }>("tax-classes/list", { limit: 50 }), api<{ items: any[] }>("tax-rules/list", { limit: 50 })]).then(([c, r]) => { setClasses(c.items); setRules(r.items); }).catch(console.error).finally(() => setLoading(false)); }
	React.useEffect(load, []);

	async function saveRule() {
		setSaving(true);
		try {
			await api("tax-rules/create", { ...ruleForm, rate: Number(ruleForm.rate), priority: Number(ruleForm.priority), stateCode: ruleForm.stateCode || null, postalCodePattern: null });
			load(); setShowRuleForm(false);
		} catch (e: any) { alert(e.message); } finally { setSaving(false); }
	}
	async function delRule(id: string) { await api("tax-rules/delete", { id }).catch((e: any) => alert(e.message)); load(); }

	if (loading) return <p>Loading tax configuration...</p>;

	return (
		<div>
			<h1 style={heading}>Tax</h1>
			<div style={{ ...card, marginBottom: "1.5rem" }}>
				<h2 style={subheading}>Tax Classes</h2>
				{classes.length === 0 ? <p style={{ color: "#6b7280" }}>No tax classes (they are created on plugin install).</p> : (
					<table style={table}><thead><tr><th style={th}>Name</th><th style={th}>Slug</th><th style={th}>Default</th></tr></thead>
						<tbody>{classes.map((c: any) => <tr key={c.id}><td style={{ ...td, fontWeight: 500 }}>{c.name}</td><td style={{ ...td, fontFamily: "monospace" }}>{c.slug}</td><td style={td}>{c.isDefault ? "Yes" : "—"}</td></tr>)}</tbody></table>
				)}
			</div>
			<div style={card}>
				<div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}><h2 style={{ ...subheading, margin: 0 }}>Tax Rules ({rules.length})</h2><button style={btn} onClick={() => setShowRuleForm(!showRuleForm)}>+ New Rule</button></div>
				{showRuleForm && (
					<div style={{ background: "#f9fafb", padding: "1rem", borderRadius: "0.375rem", marginBottom: "1rem" }}>
						<div style={formRow}><Field label="Tax Class"><select style={formSelect} value={ruleForm.taxClassId} onChange={(e) => setRuleForm((f) => ({ ...f, taxClassId: e.target.value }))}><option value="">Select...</option>{classes.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
							<Field label="Name"><input style={formInput} value={ruleForm.name} onChange={(e) => setRuleForm((f) => ({ ...f, name: e.target.value }))} placeholder="US Sales Tax" /></Field></div>
						<div style={formRow}><Field label="Country (2-letter)"><input style={formInput} value={ruleForm.countryCode} onChange={(e) => setRuleForm((f) => ({ ...f, countryCode: e.target.value.toUpperCase() }))} maxLength={2} placeholder="US" /></Field>
							<Field label="State (optional)"><input style={formInput} value={ruleForm.stateCode} onChange={(e) => setRuleForm((f) => ({ ...f, stateCode: e.target.value }))} placeholder="CA" /></Field></div>
						<div style={formRow}><Field label="Tax Rate (%)"><input style={formInput} type="number" step="0.01" min="0" value={ruleForm.rate / 100} onChange={(e) => setRuleForm((f) => ({ ...f, rate: Math.round(Number(e.target.value) * 100) }))} placeholder="10" /></Field>
							<Field label="Compound"><select style={formSelect} value={String(ruleForm.compound)} onChange={(e) => setRuleForm((f) => ({ ...f, compound: e.target.value === "true" }))}><option value="false">No</option><option value="true">Yes</option></select></Field></div>
						<div style={formActions}><button style={btn} onClick={saveRule} disabled={saving}>{saving ? "Saving..." : "Add Rule"}</button><button style={btnSecondary} onClick={() => setShowRuleForm(false)}>Cancel</button></div>
					</div>
				)}
				{rules.length === 0 ? <p style={{ color: "#6b7280" }}>No tax rules. Add rules to calculate taxes by country/state.</p> : (
					<table style={table}><thead><tr><th style={th}>Name</th><th style={th}>Country</th><th style={th}>State</th><th style={th}>Rate</th><th style={th}>Compound</th><th style={th}></th></tr></thead>
						<tbody>{rules.map((r: any) => <tr key={r.id}><td style={td}>{r.name}</td><td style={td}>{r.countryCode}</td><td style={td}>{r.stateCode || "All"}</td><td style={td}>{(r.rate / 100).toFixed(2)}%</td><td style={td}>{r.compound ? "Yes" : "—"}</td><td style={td}><button style={{ ...btnDanger, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => delRule(r.id)}>Del</button></td></tr>)}</tbody></table>
				)}
			</div>
		</div>
	);
}

// ─── Settings: General tab ──────────────────────────────────────

function GeneralTab({ settings, upd, save, saving }: { settings: any; upd: (f: string, v: any) => void; save: () => void; saving: boolean }) {
	return (
		<div>
			<div style={{ ...card, marginBottom: "1rem" }}>
				<p style={{ ...subheading, margin: "0 0 1rem" }}>Store</p>
				<div style={formRow}>
					<Field label="Store Name"><input style={formInput} value={settings?.storeName || ""} onChange={(e) => upd("storeName", e.target.value)} /></Field>
					<Field label="Country (2-letter code)"><input style={formInput} value={settings?.storeCountry || ""} onChange={(e) => upd("storeCountry", e.target.value.toUpperCase())} maxLength={2} /></Field>
				</div>
				<div style={formRow}>
					<Field label="Default Currency"><input style={formInput} value={settings?.defaultCurrency || "USD"} onChange={(e) => upd("defaultCurrency", e.target.value.toUpperCase())} maxLength={3} /></Field>
					<Field label="Tax-inclusive Pricing">
						<select style={formSelect} value={String(settings?.taxInclusive)} onChange={(e) => upd("taxInclusive", e.target.value === "true")}>
							<option value="false">No (prices exclude tax)</option>
							<option value="true">Yes (prices include tax, e.g. GST)</option>
						</select>
					</Field>
				</div>
				<div style={formRow}>
					<Field label="Tax on Shipping">
						<select style={formSelect} value={String(settings?.taxShipping ?? false)} onChange={(e) => upd("taxShipping", e.target.value === "true")}>
							<option value="false">No</option>
							<option value="true">Yes (uses the default tax class)</option>
						</select>
					</Field>
					<Field label="Cancel Unpaid Orders After (hours)">
						<input style={formInput} type="number" min={1} max={720} value={settings?.pendingOrderTimeoutHours ?? 24} onChange={(e) => upd("pendingOrderTimeoutHours", Number(e.target.value) || 24)} />
					</Field>
				</div>
				<div style={formRow}>
					<Field label="Store Email (notifications)">
						<input style={formInput} type="email" value={settings?.storeEmail || ""} onChange={(e) => upd("storeEmail", e.target.value)} placeholder="orders@example.com" />
					</Field>
				</div>
				<div style={formActions}><button style={btn} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save"}</button></div>
			</div>
			<CustomFieldsManager />
		</div>
	);
}

// ─── Settings: Payments tab ─────────────────────────────────────

function webhookUrl(path?: string): string {
	if (!path) return "";
	return typeof window === "undefined" ? path : `${window.location.origin}${path}`;
}

function PaymentsTab({ settings, upd, save, saving }: { settings: any; upd: (f: string, v: any) => void; save: () => void; saving: boolean }) {
	const hint: React.CSSProperties = { fontSize: "0.75rem", color: "#9ca3af", marginTop: "0.25rem" };
	const desc: React.CSSProperties = { fontSize: "0.8125rem", color: "#6b7280", marginBottom: "1rem" };
	const link: React.CSSProperties = { color: "#2563eb" };

	return (
		<div>
			{/* Stripe */}
			<div style={{ ...card, marginBottom: "1rem" }}>
				<div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
					<span style={{ fontSize: "1.25rem" }}>💳</span>
					<p style={{ ...subheading, margin: 0 }}>Stripe</p>
					{settings?.stripePublishableKey
						? <span style={badge("green")}>Connected</span>
						: <span style={badge("yellow")}>Not configured</span>}
				</div>
				<p style={desc}>Accept credit and debit cards. Get your keys from <a href="https://dashboard.stripe.com/apikeys" target="_blank" rel="noopener" style={link}>dashboard.stripe.com/apikeys</a>.</p>
				<div style={formRow}>
					<Field label="Publishable Key">
						<input style={formInput} value={settings?.stripePublishableKey || ""} onChange={(e) => upd("stripePublishableKey", e.target.value)} placeholder="pk_test_..." />
						<p style={hint}>Starts with pk_test_ or pk_live_</p>
					</Field>
					<Field label="Secret Key">
						<input style={formInput} type="password" value={settings?.stripeSecretKey || ""} onChange={(e) => upd("stripeSecretKey", e.target.value)} placeholder={settings?.stripeSecretKey?.startsWith("••") ? "leave blank to keep existing" : "sk_test_..."} />
						<p style={hint}>Leave blank to keep existing value</p>
					</Field>
				</div>
				<div style={formRow}>
					<Field label="Webhook Secret">
						<input style={formInput} type="password" value={settings?.stripeWebhookSecret || ""} onChange={(e) => upd("stripeWebhookSecret", e.target.value)} placeholder={settings?.stripeWebhookSecret?.startsWith("••") ? "leave blank to keep existing" : "whsec_..."} />
						<p style={hint}>From Stripe → Developers → Webhooks</p>
					</Field>
					<Field label="Webhook Endpoint">
						<input style={formInput} readOnly value={webhookUrl(settings?.webhookUrls?.stripe)} onFocus={(e) => e.currentTarget.select()} />
						<p style={hint}>Events: payment_intent.succeeded, payment_intent.payment_failed, charge.refunded</p>
					</Field>
				</div>
				<div style={formActions}><button style={btn} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save Stripe"}</button></div>
			</div>

			{/* PayPal */}
			<div style={{ ...card, marginBottom: "1rem" }}>
				<div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
					<span style={{ fontSize: "1.25rem" }}>🅿️</span>
					<p style={{ ...subheading, margin: 0 }}>PayPal</p>
					{settings?.paypalClientId
						? <span style={badge("green")}>Connected</span>
						: <span style={badge("yellow")}>Not configured</span>}
				</div>
				<p style={desc}>Accept PayPal payments. Get credentials from the <a href="https://developer.paypal.com/dashboard/applications" target="_blank" rel="noopener" style={link}>PayPal developer dashboard</a>.</p>
				<div style={formRow}>
					<Field label="Client ID">
						<input style={formInput} value={settings?.paypalClientId || ""} onChange={(e) => upd("paypalClientId", e.target.value)} placeholder="AY..." />
					</Field>
					<Field label="Client Secret">
						<input style={formInput} type="password" value={settings?.paypalClientSecret || ""} onChange={(e) => upd("paypalClientSecret", e.target.value)} placeholder={settings?.paypalClientSecret?.startsWith("••") ? "leave blank to keep existing" : "EG..."} />
						<p style={hint}>Leave blank to keep existing value</p>
					</Field>
				</div>
				<div style={formRow}>
					<Field label="Mode">
						<select style={formSelect} value={String(settings?.paypalSandbox ?? true)} onChange={(e) => upd("paypalSandbox", e.target.value === "true")}>
							<option value="true">Sandbox (test)</option>
							<option value="false">Live</option>
						</select>
					</Field>
					<Field label="Webhook ID">
						<input style={formInput} value={settings?.paypalWebhookId || ""} onChange={(e) => upd("paypalWebhookId", e.target.value)} placeholder="8PT597110X687430LKGECATA" />
						<p style={hint}>Webhooks are ignored until this is set</p>
					</Field>
				</div>
				<div style={formRow}>
					<Field label="Webhook Endpoint">
						<input style={formInput} readOnly value={webhookUrl(settings?.webhookUrls?.paypal)} onFocus={(e) => e.currentTarget.select()} />
						<p style={hint}>Events: PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.DENIED, PAYMENT.CAPTURE.REFUNDED</p>
					</Field>
				</div>
				<div style={formActions}><button style={btn} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save PayPal"}</button></div>
			</div>

			{/* ShipEngine */}
			<div style={{ ...card, marginBottom: "1rem" }}>
				<div style={{ display: "flex", alignItems: "center", gap: "0.625rem", marginBottom: "1rem" }}>
					<span style={{ fontSize: "1.25rem" }}>🚚</span>
					<p style={{ ...subheading, margin: 0 }}>ShipEngine — Live Carrier Rates</p>
					{settings?.shipEngineApiKey?.startsWith("••")
						? <span style={badge("green")}>Connected</span>
						: <span style={badge("yellow")}>Optional</span>}
				</div>
				<p style={desc}>Adds real-time UPS, USPS, FedEx rates at checkout. Get your key at <a href="https://app.shipengine.com/settings#/api-management" target="_blank" rel="noopener" style={link}>app.shipengine.com</a>. Flat-rate zones work without this.</p>
				<div style={formRow}>
					<Field label="API Key">
						<input style={formInput} type="password" value={settings?.shipEngineApiKey || ""} onChange={(e) => upd("shipEngineApiKey", e.target.value)} placeholder={settings?.shipEngineApiKey?.startsWith("••") ? "leave blank to keep existing" : "TEST_..."} />
						<p style={hint}>Leave blank to keep existing or disable live rates</p>
					</Field>
				</div>
				<div style={formActions}><button style={btn} onClick={save} disabled={saving}>{saving ? "Saving..." : "Save ShipEngine"}</button></div>
			</div>
		</div>
	);
}

// ─── Settings: API Keys tab ─────────────────────────────────────

function ApiKeysTab() {
	const [keys, setKeys] = React.useState<any[]>([]);
	const [loading, setLoading] = React.useState(true);
	const [creating, setCreating] = React.useState(false);
	const [newKeyName, setNewKeyName] = React.useState("");
	const [newKeyPerms, setNewKeyPerms] = React.useState<string[]>(["read"]);
	const [revealed, setRevealed] = React.useState<string | null>(null); // plaintext of just-created key
	const [revoking, setRevoking] = React.useState<string | null>(null);

	function load() {
		api<{ items: any[] }>("api-keys/list").then((r) => setKeys(r.items)).catch(() => {}).finally(() => setLoading(false));
	}
	React.useEffect(load, []);

	const allPerms = ["read", "write", "orders", "products", "customers", "inventory"];

	function togglePerm(p: string) {
		setNewKeyPerms((prev) => prev.includes(p) ? prev.filter((x) => x !== p) : [...prev, p]);
	}

	async function create() {
		if (!newKeyName.trim()) return;
		setCreating(true);
		try {
			const result = await api<any>("api-keys/create", { name: newKeyName.trim(), permissions: newKeyPerms });
			setRevealed(result.key);
			setNewKeyName("");
			setNewKeyPerms(["read"]);
			load();
		} catch (e: any) { alert(e.message); } finally { setCreating(false); }
	}

	async function revoke(id: string) {
		if (!confirm("Revoke this API key? Any integrations using it will stop working immediately.")) return;
		setRevoking(id);
		try {
			await api("api-keys/revoke", { id });
			load();
		} catch (e: any) { alert(e.message); } finally { setRevoking(null); }
	}

	const permBadge: React.CSSProperties = { display: "inline-block", padding: "0.125rem 0.5rem", borderRadius: "9999px", fontSize: "0.6875rem", fontWeight: 600, background: "#eff6ff", color: "#1d4ed8", marginRight: "0.25rem" };
	const keyBox: React.CSSProperties = { fontFamily: "monospace", fontSize: "0.8125rem", background: "#f0fdf4", border: "1px solid #86efac", borderRadius: "0.375rem", padding: "0.625rem 0.875rem", wordBreak: "break-all", color: "#166534", marginBottom: "0.75rem" };
	const permToggle = (active: boolean): React.CSSProperties => ({
		padding: "0.25rem 0.625rem", borderRadius: "9999px", fontSize: "0.75rem", fontWeight: 600, cursor: "pointer", border: "1px solid",
		background: active ? "#eff6ff" : "transparent", color: active ? "#1d4ed8" : "#6b7280", borderColor: active ? "#bfdbfe" : "#d1d5db",
	});

	return (
		<div>
			{/* Revealed key banner */}
			{revealed && (
				<div style={{ ...card, marginBottom: "1rem", borderColor: "#86efac", background: "#f0fdf4" }}>
					<div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
						<p style={{ fontWeight: 700, color: "#166534", fontSize: "0.875rem" }}>✅ Key created — copy it now, it won't be shown again</p>
						<button style={{ ...btnDanger, padding: "0.25rem 0.5rem", fontSize: "0.75rem" }} onClick={() => setRevealed(null)}>Dismiss</button>
					</div>
					<div style={keyBox}>{revealed}</div>
					<button style={{ ...btn, padding: "0.375rem 0.875rem", fontSize: "0.8125rem" }} onClick={() => { navigator.clipboard.writeText(revealed!); }}>Copy to clipboard</button>
				</div>
			)}

			{/* Create new key */}
			<div style={{ ...card, marginBottom: "1rem" }}>
				<p style={{ ...subheading, margin: "0 0 1rem" }}>Create API Key</p>
				<div style={formRow}>
					<Field label="Key Name">
						<input style={formInput} value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g. My Integration, Shopify Sync..." onKeyDown={(e) => e.key === "Enter" && create()} />
					</Field>
				</div>
				<div style={{ marginBottom: "1rem" }}>
					<label style={{ fontSize: "0.8125rem", fontWeight: 500, color: "#374151", display: "block", marginBottom: "0.5rem" }}>Permissions</label>
					<div style={{ display: "flex", gap: "0.375rem", flexWrap: "wrap" }}>
						{allPerms.map((p) => (
							<button key={p} style={permToggle(newKeyPerms.includes(p))} onClick={() => togglePerm(p)} type="button">{p}</button>
						))}
					</div>
				</div>
				<div style={formActions}>
					<button style={btn} onClick={create} disabled={creating || !newKeyName.trim()}>{creating ? "Creating..." : "Create Key"}</button>
				</div>
			</div>

			{/* Key list */}
			<div style={card}>
				<p style={{ ...subheading, margin: "0 0 1rem" }}>Active Keys</p>
				{loading ? (
					<p style={{ color: "#9ca3af", fontSize: "0.875rem" }}>Loading...</p>
				) : keys.length === 0 ? (
					<p style={{ color: "#9ca3af", fontSize: "0.875rem" }}>No API keys yet. Create one above to allow external integrations.</p>
				) : (
					<table style={table}>
						<thead>
							<tr>
								<th style={th}>Name</th>
								<th style={th}>Key Prefix</th>
								<th style={th}>Permissions</th>
								<th style={th}>Created</th>
								<th style={th}>Last Used</th>
								<th style={th}></th>
							</tr>
						</thead>
						<tbody>
							{keys.map((k: any) => (
								<tr key={k.id}>
									<td style={{ ...td, fontWeight: 500 }}>{k.name}</td>
									<td style={{ ...td, fontFamily: "monospace", fontSize: "0.8125rem", color: "#6b7280" }}>{k.prefix}...</td>
									<td style={td}>{(k.permissions as string[]).map((p) => <span key={p} style={permBadge}>{p}</span>)}</td>
									<td style={td}>{new Date(k.createdAt).toLocaleDateString()}</td>
									<td style={td}>{k.lastUsed ? new Date(k.lastUsed).toLocaleDateString() : <span style={{ color: "#9ca3af" }}>Never</span>}</td>
									<td style={td}>
										<button style={{ ...btnDanger, padding: "0.25rem 0.625rem", fontSize: "0.75rem" }} onClick={() => revoke(k.id)} disabled={revoking === k.id}>
											{revoking === k.id ? "Revoking..." : "Revoke"}
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>
				)}
			</div>

			{/* Usage docs */}
			<div style={{ ...card, marginTop: "1rem", background: "#f8fafc" }}>
				<p style={{ ...subheading, margin: "0 0 0.75rem" }}>Using the API</p>
				<p style={{ fontSize: "0.8125rem", color: "#6b7280", marginBottom: "0.75rem" }}>Pass your key in the <code style={{ background: "#e5e7eb", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>Authorization</code> header:</p>
				<pre style={{ background: "#1e293b", color: "#e2e8f0", padding: "0.875rem 1rem", borderRadius: "0.5rem", fontSize: "0.8125rem", overflow: "auto" }}>{`POST /_emdash/api/plugins/emcommerce/api/v1/products
Authorization: Bearer emck_your_key_here
Content-Type: application/json

{ "page": 1, "per_page": 20 }`}</pre>
				<p style={{ fontSize: "0.8125rem", color: "#6b7280", marginTop: "0.75rem" }}>Available endpoints: <code style={{ background: "#e5e7eb", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>api/v1/products</code>, <code style={{ background: "#e5e7eb", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>api/v1/orders</code>, <code style={{ background: "#e5e7eb", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>api/v1/customers</code>, <code style={{ background: "#e5e7eb", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>api/v1/inventory</code>, <code style={{ background: "#e5e7eb", padding: "0.125rem 0.375rem", borderRadius: "0.25rem" }}>api/v1/coupons</code></p>
			</div>
		</div>
	);
}

// ─── Settings Page (tabbed) ─────────────────────────────────────

function SettingsPage() {
	const [activeTab, setActiveTab] = React.useState<"general" | "payments" | "api-keys">("general");
	const [settings, setSettings] = React.useState<any>(null);
	const [loading, setLoading] = React.useState(true);
	const [saving, setSaving] = React.useState(false);

	function load() { api("settings/get").then(setSettings).catch(console.error).finally(() => setLoading(false)); }
	React.useEffect(load, []);
	function upd(f: string, v: any) { setSettings((s: any) => ({ ...s, [f]: v })); }

	async function save() {
		setSaving(true);
		try {
			await api("settings/update", {
				storeName: settings.storeName,
				storeCountry: settings.storeCountry,
				defaultCurrency: settings.defaultCurrency,
				taxInclusive: settings.taxInclusive,
				taxShipping: settings.taxShipping,
				storeEmail: settings.storeEmail,
				pendingOrderTimeoutHours: settings.pendingOrderTimeoutHours,
				paypalWebhookId: settings.paypalWebhookId,
				stripePublishableKey: settings.stripePublishableKey,
				stripeSecretKey: settings.stripeSecretKey,
				stripeWebhookSecret: settings.stripeWebhookSecret,
				paypalClientId: settings.paypalClientId,
				paypalClientSecret: settings.paypalClientSecret,
				paypalSandbox: settings.paypalSandbox,
				shipEngineApiKey: settings.shipEngineApiKey,
			});
			load();
		} catch (e: any) { alert(e.message); } finally { setSaving(false); }
	}

	const tabs = [
		{ key: "general" as const, label: "General" },
		{ key: "payments" as const, label: "Payments" },
		{ key: "api-keys" as const, label: "API Keys" },
	];

	const tabBar: React.CSSProperties = { display: "flex", gap: 0, borderBottom: "2px solid #e5e7eb", marginBottom: "1.5rem" };
	const tabBtn = (active: boolean): React.CSSProperties => ({
		padding: "0.625rem 1.25rem", border: "none", background: "none", cursor: "pointer",
		fontSize: "0.875rem", fontWeight: active ? 600 : 400, color: active ? "#2563eb" : "#6b7280",
		borderBottom: active ? "2px solid #2563eb" : "2px solid transparent", marginBottom: "-2px",
		transition: "color 0.15s",
	});

	return (
		<div>
			<h1 style={heading}>Settings</h1>
			<div style={tabBar}>
				{tabs.map((t) => (
					<button key={t.key} style={tabBtn(activeTab === t.key)} onClick={() => setActiveTab(t.key)}>{t.label}</button>
				))}
			</div>

			{loading && activeTab !== "api-keys" ? (
				<p style={{ color: "#9ca3af" }}>Loading...</p>
			) : activeTab === "general" ? (
				<GeneralTab settings={settings} upd={upd} save={save} saving={saving} />
			) : activeTab === "payments" ? (
				<PaymentsTab settings={settings} upd={upd} save={save} saving={saving} />
			) : (
				<ApiKeysTab />
			)}
		</div>
	);
}

// ─── Dashboard Widgets ──────────────────────────────────────────

function SalesOverviewWidget() {
	const [stats, setStats] = React.useState<any>(null);
	React.useEffect(() => { api("dashboard/stats").then(setStats).catch(() => {}); }, []);
	if (!stats) return <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>Loading...</p>;
	return (
		<div style={{ display: "flex", gap: "1.5rem" }}>
			<div><p style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>{fmt(stats.totalRevenue)}</p><p style={statLabel}>Revenue</p></div>
			<div><p style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>{stats.totalOrders}</p><p style={statLabel}>Orders</p></div>
			<div><p style={{ fontSize: "1.25rem", fontWeight: 700, margin: 0 }}>{fmt(stats.averageOrderValue)}</p><p style={statLabel}>AOV</p></div>
		</div>
	);
}

function RecentOrdersWidget() {
	const [orders, setOrders] = React.useState<any[]>([]);
	React.useEffect(() => { api<{ items: any[] }>("dashboard/recent-orders").then((r) => setOrders(r.items)).catch(() => {}); }, []);
	if (orders.length === 0) return <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>No orders yet.</p>;
	return (
		<div>
			{orders.slice(0, 5).map((o: any) => (
				<div key={o.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.8125rem" }}>
					<span>{o.orderNumber}</span>
					<span style={badge(o.status === "completed" ? "green" : "yellow")}>{o.status}</span>
					<span>{fmt(o.total)}</span>
				</div>
			))}
		</div>
	);
}

function LowStockWidget() {
	const [items, setItems] = React.useState<any[]>([]);
	React.useEffect(() => { api<{ items: any[] }>("dashboard/low-stock").then((r) => setItems(r.items)).catch(() => {}); }, []);
	if (items.length === 0) return <p style={{ color: "#6b7280", fontSize: "0.875rem" }}>All products in stock.</p>;
	return (
		<div>
			{items.slice(0, 5).map((p: any) => (
				<div key={p.id} style={{ display: "flex", justifyContent: "space-between", padding: "0.375rem 0", borderBottom: "1px solid #f3f4f6", fontSize: "0.8125rem" }}>
					<span>{p.name}</span>
					<span style={badge("red")}>{p.stockQuantity} left</span>
				</div>
			))}
		</div>
	);
}

// ─── Internal Navigation Shell ──────────────────────────────────

const NAV_ITEMS = [
	{ key: "dashboard", label: "Dashboard", icon: "📊" },
	{ key: "products", label: "Products", icon: "📦" },
	{ key: "orders", label: "Orders", icon: "🧾" },
	{ key: "customers", label: "Customers", icon: "👥" },
	{ key: "coupons", label: "Coupons", icon: "🎟️" },
	{ key: "pricing", label: "Pricing", icon: "🏷️" },
	{ key: "shipping", label: "Shipping", icon: "🚚" },
	{ key: "tax", label: "Tax", icon: "📋" },
	{ key: "settings", label: "Settings", icon: "⚙️" },
] as const;

type NavKey = (typeof NAV_ITEMS)[number]["key"];

const PAGE_MAP: Record<NavKey, React.FC> = {
	dashboard: DashboardPage,
	products: ProductsPage,
	orders: OrdersPage,
	customers: CustomersPage,
	coupons: CouponsPage,
	pricing: PricingPage,
	shipping: ShippingPage,
	tax: TaxPage,
	settings: SettingsPage,
};

const navContainer: React.CSSProperties = {
	display: "flex",
	gap: "1.5rem",
	minHeight: "calc(100vh - 8rem)",
};

const navSidebar: React.CSSProperties = {
	width: "12rem",
	flexShrink: 0,
	display: "flex",
	flexDirection: "column",
	gap: "0.125rem",
	paddingTop: "0.25rem",
};

const navBtn = (active: boolean): React.CSSProperties => ({
	display: "flex",
	alignItems: "center",
	gap: "0.5rem",
	padding: "0.5rem 0.75rem",
	border: "none",
	borderRadius: "0.375rem",
	background: active ? "#eff6ff" : "transparent",
	color: active ? "#2563eb" : "#374151",
	fontWeight: active ? 600 : 400,
	fontSize: "0.8125rem",
	cursor: "pointer",
	textAlign: "left" as const,
	width: "100%",
	transition: "background 0.1s, color 0.1s",
});

const navContent: React.CSSProperties = {
	flex: 1,
	minWidth: 0,
};

function EmCommerceRoot() {
	const [page, setPage] = React.useState<NavKey>("dashboard");
	const ActivePage = PAGE_MAP[page];

	return (
		<div style={navContainer}>
			<nav style={navSidebar}>
				{NAV_ITEMS.map((item) => (
					<button
						key={item.key}
						style={navBtn(page === item.key)}
						onClick={() => setPage(item.key)}
					>
						<span>{item.icon}</span>
						<span>{item.label}</span>
					</button>
				))}
			</nav>
			<div style={navContent}>
				<ActivePage />
			</div>
		</div>
	);
}

// ─── Exports ────────────────────────────────────────────────────

export const pages: PluginAdminExports["pages"] = {
	"/": EmCommerceRoot,
};

export const widgets: PluginAdminExports["widgets"] = {
	"sales-overview": SalesOverviewWidget,
	"recent-orders": RecentOrdersWidget,
	"low-stock": LowStockWidget,
};
