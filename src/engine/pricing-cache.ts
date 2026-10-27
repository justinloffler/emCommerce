/**
 * Two-tier pricing cache.
 *
 * L1: In-memory Map scoped to a single request — zero-cost for repeated
 *     lookups during cart calculation.
 * L2: KV-backed with 5-minute TTL. A generation counter in KV
 *     (`state:priceGeneration`) is embedded in the cache key so that
 *     any write to specific-prices or catalog-rules invalidates all entries.
 */

import type { KVAccess } from "emdash";
import type { PriceResolutionContext, ResolvedPrice } from "../types.js";

const L2_TTL_SECONDS = 300; // 5 minutes

interface CachedEntry {
	price: ResolvedPrice;
	expiresAt: number;
}

/** Build a deterministic cache key from resolution context + generation. */
function buildKey(ctx: PriceResolutionContext, generation: number): string {
	return `price:g${generation}:${ctx.productId}:${ctx.variantId ?? "_"}:${ctx.quantity}:${ctx.customerGroupId ?? "_"}:${ctx.countryCode ?? "_"}:${ctx.currencyCode}`;
}

/**
 * Request-scoped pricing cache.
 *
 * Create one instance per incoming request. It wraps an L1 Map and
 * delegates misses to KV (L2).
 */
export class PricingCache {
	private l1 = new Map<string, ResolvedPrice>();
	private generation: number | null = null;
	private kv: KVAccess;

	constructor(kv: KVAccess) {
		this.kv = kv;
	}

	/** Ensure the generation counter is loaded (once per request). */
	private async ensureGeneration(): Promise<number> {
		if (this.generation === null) {
			this.generation = (await this.kv.get<number>("state:priceGeneration")) ?? 0;
		}
		return this.generation;
	}

	/**
	 * Look up a cached price. Returns null on miss.
	 */
	async get(ctx: PriceResolutionContext): Promise<ResolvedPrice | null> {
		const gen = await this.ensureGeneration();
		const key = buildKey(ctx, gen);

		// L1
		const l1Hit = this.l1.get(key);
		if (l1Hit) return l1Hit;

		// L2 — emdash KV has no native TTL, so entries carry their own expiry.
		const l2Hit = await this.kv.get<CachedEntry>(key);
		if (l2Hit && typeof l2Hit === "object" && "expiresAt" in l2Hit) {
			if (l2Hit.expiresAt > Date.now()) {
				this.l1.set(key, l2Hit.price);
				return l2Hit.price;
			}
			await this.kv.delete(key);
		}

		return null;
	}

	/**
	 * Store a resolved price in both L1 and L2.
	 */
	async set(ctx: PriceResolutionContext, price: ResolvedPrice): Promise<void> {
		const gen = await this.ensureGeneration();
		const key = buildKey(ctx, gen);

		this.l1.set(key, price);
		const entry: CachedEntry = { price, expiresAt: Date.now() + L2_TTL_SECONDS * 1000 };
		await this.kv.set(key, entry);
	}
}
