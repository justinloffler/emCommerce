/**
 * In-memory doubles for emdash's plugin context, following the documented
 * StorageCollection / KVAccess contracts closely enough for handler tests:
 * indexed where-filters (exact, in, startsWith, ranges), orderBy, cursors,
 * versioned compare-and-set, and updateIf with integer deltas.
 */

type Where = Record<string, unknown>;

interface Row {
	data: unknown;
	revision: number;
}

function matchesValue(actual: unknown, cond: unknown): boolean {
	if (cond !== null && typeof cond === "object" && !Array.isArray(cond)) {
		const c = cond as Record<string, unknown>;
		if ("in" in c) return (c.in as unknown[]).includes(actual);
		if ("startsWith" in c) return typeof actual === "string" && actual.startsWith(c.startsWith as string);
		const a = actual as string | number;
		if ("gt" in c && c.gt !== undefined && !(a > (c.gt as typeof a))) return false;
		if ("gte" in c && c.gte !== undefined && !(a >= (c.gte as typeof a))) return false;
		if ("lt" in c && c.lt !== undefined && !(a < (c.lt as typeof a))) return false;
		if ("lte" in c && c.lte !== undefined && !(a <= (c.lte as typeof a))) return false;
		return true;
	}
	return actual === cond;
}

function matches(data: unknown, where?: Where): boolean {
	if (!where) return true;
	const obj = data as Record<string, unknown>;
	return Object.entries(where).every(([k, v]) => matchesValue(obj?.[k], v));
}

const clone = <T>(v: T): T => (v === undefined ? v : structuredClone(v));

export class MemoryCollection<T = unknown> {
	rows = new Map<string, Row>();
	private rev = 0;
	/** Field names that must be unique (mirrors uniqueIndexes) */
	constructor(private unique: string[] = []) {}

	private checkUnique(id: string, data: unknown) {
		for (const field of this.unique) {
			const value = (data as Record<string, unknown>)[field];
			if (value === null || value === undefined) continue;
			for (const [otherId, row] of this.rows) {
				if (otherId !== id && (row.data as Record<string, unknown>)[field] === value) {
					throw new Error(`UNIQUE constraint failed: ${field}`);
				}
			}
		}
	}

	private write(id: string, data: unknown) {
		this.checkUnique(id, data);
		this.rows.set(id, { data: clone(data), revision: ++this.rev });
	}

	async get(id: string): Promise<T | null> {
		const row = this.rows.get(id);
		return row ? (clone(row.data) as T) : null;
	}
	async put(id: string, data: T): Promise<void> {
		this.write(id, data);
	}
	async delete(id: string): Promise<boolean> {
		return this.rows.delete(id);
	}
	async exists(id: string): Promise<boolean> {
		return this.rows.has(id);
	}
	async getVersioned(id: string) {
		const row = this.rows.get(id);
		return row ? { value: clone(row.data) as T, revision: String(row.revision) } : null;
	}
	async compareAndSet(id: string, expected: string | null, data: T) {
		const row = this.rows.get(id);
		if (expected === null ? row !== undefined : !row || String(row.revision) !== expected) {
			return { applied: false as const };
		}
		this.write(id, data);
		return { applied: true as const, revision: String(this.rev) };
	}
	async compareAndDelete(id: string, expected: string) {
		const row = this.rows.get(id);
		if (!row || String(row.revision) !== expected) return { applied: false };
		this.rows.delete(id);
		return { applied: true };
	}
	async updateIf(
		id: string,
		args: { where: Where; set?: Record<string, unknown>; delta?: Record<string, { inc?: number; dec?: number }> },
	) {
		const row = this.rows.get(id);
		if (!row || !matches(row.data, args.where)) return { applied: false as const };
		const next = { ...(row.data as Record<string, unknown>), ...(args.set ?? {}) };
		for (const [field, d] of Object.entries(args.delta ?? {})) {
			const base = (next[field] as number | null | undefined) ?? 0;
			next[field] = base + (d.inc ?? 0) - (d.dec ?? 0);
		}
		this.write(id, next);
		return { applied: true as const, data: clone(next) as T };
	}
	async getMany(ids: string[]) {
		const out = new Map<string, T>();
		for (const id of ids) {
			const row = this.rows.get(id);
			if (row) out.set(id, clone(row.data) as T);
		}
		return out;
	}
	async putMany(items: Array<{ id: string; data: T }>) {
		for (const { id, data } of items) this.write(id, data);
	}
	async deleteMany(ids: string[]) {
		let n = 0;
		for (const id of ids) if (this.rows.delete(id)) n++;
		return n;
	}
	async query(opts: { where?: Where; orderBy?: Record<string, "asc" | "desc">; limit?: number; cursor?: string } = {}) {
		let items = [...this.rows.entries()]
			.filter(([, r]) => matches(r.data, opts.where))
			.map(([id, r]) => ({ id, data: clone(r.data) as T }));
		if (opts.orderBy) {
			const [[field, dir]] = Object.entries(opts.orderBy);
			items.sort((a, b) => {
				const av = (a.data as Record<string, never>)[field];
				const bv = (b.data as Record<string, never>)[field];
				const cmp = av < bv ? -1 : av > bv ? 1 : a.id.localeCompare(b.id);
				return dir === "desc" ? -cmp : cmp;
			});
		}
		const limit = Math.min(opts.limit ?? 50, 100);
		const offset = opts.cursor ? Number(opts.cursor) : 0;
		const page = items.slice(offset, offset + limit);
		const hasMore = offset + limit < items.length;
		return { items: page, hasMore, cursor: hasMore ? String(offset + limit) : undefined };
	}
	async count(where?: Where) {
		return [...this.rows.values()].filter((r) => matches(r.data, where)).length;
	}
}

export class MemoryKV {
	store = new Map<string, unknown>();
	async get<T>(key: string): Promise<T | null> {
		return this.store.has(key) ? (clone(this.store.get(key)) as T) : null;
	}
	async set(key: string, value: unknown) {
		this.store.set(key, clone(value));
	}
	async delete(key: string) {
		return this.store.delete(key);
	}
	async list(prefix = "") {
		return [...this.store.entries()].filter(([k]) => k.startsWith(prefix)).map(([key, value]) => ({ key, value }));
	}
}

export interface MockHttpCall {
	url: string;
	init: RequestInit;
}

/** Programmable fetch: handlers are matched in order by method + URL substring. */
export class MockHttp {
	calls: MockHttpCall[] = [];
	private routes: Array<{ method: string; match: string; respond: (call: MockHttpCall) => Response | Promise<Response> }> = [];

	on(method: string, match: string, respond: (call: MockHttpCall) => Response | Promise<Response> | unknown) {
		this.routes.unshift({
			method,
			match,
			respond: async (call) => {
				const r = await respond(call);
				return r instanceof Response ? r : jsonResponse(r);
			},
		});
		return this;
	}

	fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
		const call = { url, init };
		this.calls.push(call);
		const method = (init.method ?? "GET").toUpperCase();
		const route = this.routes.find((r) => r.method === method && url.includes(r.match));
		if (!route) throw new Error(`MockHttp: unexpected ${method} ${url}`);
		return route.respond(call);
	};
}

export function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

const UNIQUE: Record<string, string[]> = {
	products: ["slug"],
	variants: ["sku"],
	categories: ["slug"],
	tags: ["slug"],
	orders: ["orderNumber"],
	customers: ["email"],
	"customer-groups": ["slug"],
	"tax-classes": ["slug"],
	coupons: ["code"],
	currencies: ["code"],
};

export function createMockContext<TInput = unknown>(input?: TInput) {
	const storage = new Proxy({} as Record<string, MemoryCollection>, {
		get(target, prop: string) {
			if (!(prop in target)) target[prop] = new MemoryCollection(UNIQUE[prop] ?? []);
			return target[prop];
		},
	});
	const kv = new MemoryKV();
	const http = new MockHttp();
	const emails: Array<{ to: string; subject: string; text: string }> = [];
	const logs: Array<{ level: string; msg: string; data?: unknown }> = [];

	const ctx = {
		input: input as TInput,
		request: new Request("http://localhost/_emdash/api/plugins/emcommerce/test", { method: "POST" }),
		requestMeta: { ip: "203.0.113.5", userAgent: "vitest", referer: null, geo: null },
		storage,
		kv,
		http: { fetch: http.fetch },
		email: {
			send: async (msg: { to: string; subject: string; text: string }) => {
				emails.push(msg);
			},
		},
		log: {
			info: (msg: string, data?: unknown) => logs.push({ level: "info", msg, data }),
			warn: (msg: string, data?: unknown) => logs.push({ level: "warn", msg, data }),
			error: (msg: string, data?: unknown) => logs.push({ level: "error", msg, data }),
			debug: () => {},
		},
		plugin: { id: "emcommerce", version: "test" },
	};

	/** Same context, different input/request (shares storage, kv, http) */
	function withInput<U>(nextInput: U, request?: Request) {
		return { ...ctx, input: nextInput, request: request ?? ctx.request } as unknown as never;
	}

	return { ctx: ctx as unknown as never, raw: ctx, storage, kv, http, emails, logs, withInput };
}
