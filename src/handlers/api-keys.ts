/**
 * API key management handlers.
 *
 * Keys are stored in KV:
 *   apikey:index      → string[] of IDs
 *   apikey:{id}       → ApiKeyRecord (no plaintext secret)
 *
 * The plaintext key is returned ONCE at creation and never stored.
 * Authentication against these keys is the responsibility of the
 * emdash host (or a middleware wrapper around the api/v1/* routes).
 */

import type { RouteContext } from "emdash";
import { PluginRouteError } from "emdash";
import { ulid } from "ulidx";
import type { ApiKeyCreateInput, ApiKeyRevokeInput } from "../schemas/api-keys.js";

export interface ApiKeyRecord {
	id: string;
	name: string;
	prefix: string;          // first 12 chars of key — safe to display
	keyHash: string;         // SHA-256 hex of the full key
	permissions: string[];
	createdAt: string;
	lastUsed: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────

async function sha256(text: string): Promise<string> {
	const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
	return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomHex(bytes: number): string {
	const arr = new Uint8Array(bytes);
	crypto.getRandomValues(arr);
	return Array.from(arr).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function getIndex(ctx: RouteContext): Promise<string[]> {
	return (await ctx.kv.get<string[]>("apikey:index")) ?? [];
}

// ─── Handlers ───────────────────────────────────────────────────

export async function apiKeyListHandler(ctx: RouteContext) {
	const index = await getIndex(ctx);
	const records = await Promise.all(
		index.map((id) => ctx.kv.get<ApiKeyRecord>(`apikey:${id}`)),
	);
	const items = records
		.filter((r): r is ApiKeyRecord => r !== null)
		.map(({ keyHash: _kh, ...safe }) => safe); // strip hash from response
	return { items };
}

export async function apiKeyCreateHandler(ctx: RouteContext<ApiKeyCreateInput>) {
	const { name, permissions } = ctx.input;
	const id = ulid();

	// Generate key: emck_{random32hex}
	const secret = `emck_${randomHex(20)}`;
	const prefix = secret.slice(0, 12); // "emck_" + 7 chars
	const keyHash = await sha256(secret);

	const record: ApiKeyRecord = {
		id,
		name,
		prefix,
		keyHash,
		permissions,
		createdAt: new Date().toISOString(),
		lastUsed: null,
	};

	await ctx.kv.set(`apikey:${id}`, record);

	// Add to index
	const index = await getIndex(ctx);
	index.push(id);
	await ctx.kv.set("apikey:index", index);

	// Return the plaintext key ONCE — caller must save it
	return {
		id,
		name,
		prefix,
		permissions,
		createdAt: record.createdAt,
		key: secret, // only returned here, never again
	};
}

export async function apiKeyRevokeHandler(ctx: RouteContext<ApiKeyRevokeInput>) {
	const { id } = ctx.input;
	const existing = await ctx.kv.get<ApiKeyRecord>(`apikey:${id}`);
	if (!existing) throw PluginRouteError.notFound("API key not found");

	await ctx.kv.delete(`apikey:${id}`);

	const index = await getIndex(ctx);
	await ctx.kv.set("apikey:index", index.filter((i) => i !== id));

	return { id, revoked: true };
}
