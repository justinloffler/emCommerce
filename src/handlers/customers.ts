/**
 * Customer and customer group CRUD route handlers.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import type { WhereClause } from "../types.js";
import { ulid } from "ulidx";

import type {
	CustomerCreateInput, CustomerUpdateInput, CustomerDeleteInput,
	CustomerListInput, CustomerGetInput,
	CustomerGroupCreateInput, CustomerGroupUpdateInput,
	CustomerGroupDeleteInput, CustomerGroupListInput,
} from "../schemas/customers.js";
import type { Customer, CustomerGroup } from "../types.js";

function customers(ctx: RouteContext): StorageCollection<Customer> {
	return ctx.storage.customers as StorageCollection<Customer>;
}
function groups(ctx: RouteContext): StorageCollection<CustomerGroup> {
	return ctx.storage["customer-groups"] as StorageCollection<CustomerGroup>;
}

// ─── Customers ──────────────────────────────────────────────────

export async function customerListHandler(ctx: RouteContext<CustomerListInput>) {
	const input = ctx.input;
	const where: WhereClause = {};
	if (input.groupId) where.groupId = input.groupId;

	const result = await customers(ctx).query({
		where: Object.keys(where).length > 0 ? where : undefined,
		orderBy: { createdAt: "desc" },
		limit: input.limit, cursor: input.cursor,
	});

	let items = result.items.map((i) => ({ id: i.id, ...i.data }));
	if (input.search) {
		const term = input.search.toLowerCase();
		items = items.filter((c) =>
			c.email.toLowerCase().includes(term) ||
			c.firstName.toLowerCase().includes(term) ||
			c.lastName.toLowerCase().includes(term),
		);
	}

	return { items, hasMore: result.hasMore, cursor: result.cursor };
}

export async function customerGetHandler(ctx: RouteContext<CustomerGetInput>) {
	const c = await customers(ctx).get(ctx.input.id);
	if (!c) throw PluginRouteError.notFound("Customer not found");
	return { id: ctx.input.id, ...c };
}

export async function customerCreateHandler(ctx: RouteContext<CustomerCreateInput>) {
	const input = ctx.input;
	const existing = await customers(ctx).query({ where: { email: input.email }, limit: 1 });
	if (existing.items.length > 0) throw PluginRouteError.conflict("Customer with this email already exists");

	// Resolve groupId: use provided value, or fall back to the group marked isDefault
	let groupId = input.groupId;
	if (!groupId) {
		const allGroups = await groups(ctx).query({ limit: 100 });
		const defaultGroup = allGroups.items.find((i) => i.data.isDefault);
		groupId = defaultGroup?.id;
	}

	const now = new Date().toISOString();
	const id = ulid();
	const customer: Customer = {
		userId: null, email: input.email, firstName: input.firstName, lastName: input.lastName,
		phone: input.phone ?? null, groupId: groupId ?? null,
		addresses: input.addresses ?? [],
		defaultBillingAddressId: null, defaultShippingAddressId: null,
		totalOrders: 0, totalSpent: 0, note: input.note ?? null,
		customFields: input.customFields ?? {},
		createdAt: now, updatedAt: now,
	};
	await customers(ctx).put(id, customer);
	return { id, ...customer };
}

export async function customerUpdateHandler(ctx: RouteContext<CustomerUpdateInput>) {
	const input = ctx.input;
	const existing = await customers(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Customer not found");

	if (input.email && input.email !== existing.email) {
		const check = await customers(ctx).query({ where: { email: input.email }, limit: 1 });
		if (check.items.length > 0) throw PluginRouteError.conflict("Email already in use");
	}

	const updated: Customer = {
		...existing,
		email: input.email ?? existing.email,
		firstName: input.firstName ?? existing.firstName,
		lastName: input.lastName ?? existing.lastName,
		phone: input.phone !== undefined ? input.phone : existing.phone,
		groupId: input.groupId ?? existing.groupId,
		addresses: input.addresses ?? existing.addresses,
		defaultBillingAddressId: input.defaultBillingAddressId !== undefined ? input.defaultBillingAddressId : existing.defaultBillingAddressId,
		defaultShippingAddressId: input.defaultShippingAddressId !== undefined ? input.defaultShippingAddressId : existing.defaultShippingAddressId,
		note: input.note !== undefined ? input.note : existing.note,
		customFields: input.customFields !== undefined ? input.customFields : (existing.customFields ?? {}),
		updatedAt: new Date().toISOString(),
	};
	await customers(ctx).put(input.id, updated);
	return { id: input.id, ...updated };
}

export async function customerDeleteHandler(ctx: RouteContext<CustomerDeleteInput>) {
	const existing = await customers(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Customer not found");
	await customers(ctx).delete(ctx.input.id);
	return { deleted: true };
}

// ─── Customer Groups ────────────────────────────────────────────

export async function customerGroupListHandler(ctx: RouteContext<CustomerGroupListInput>) {
	let result = await groups(ctx).query({
		orderBy: { slug: "asc" },
		limit: ctx.input.limit, cursor: ctx.input.cursor,
	});

	// Ensure the Default group always exists — seed it if the collection is empty
	if (result.items.length === 0) {
		const now = new Date().toISOString();
		const id = ulid();
		const defaultGroup = {
			name: "Default",
			slug: "default",
			description: "Default customer group",
			isDefault: true,
			createdAt: now,
			updatedAt: now,
		};
		await groups(ctx).put(id, defaultGroup);
		return { items: [{ id, ...defaultGroup }], hasMore: false, cursor: undefined };
	}

	// Sort in-memory so the default group always appears first
	const items = result.items.map((i) => ({ id: i.id, ...i.data })).sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0));
	return { items, hasMore: result.hasMore, cursor: result.cursor };
}

export async function customerGroupCreateHandler(ctx: RouteContext<CustomerGroupCreateInput>) {
	const input = ctx.input;
	const existing = await groups(ctx).query({ where: { slug: input.slug }, limit: 1 });
	if (existing.items.length > 0) throw PluginRouteError.conflict(`Group "${input.slug}" exists`);

	const now = new Date().toISOString();
	const id = ulid();
	const group: CustomerGroup = {
		name: input.name, slug: input.slug, description: input.description ?? "",
		isDefault: input.isDefault ?? false, createdAt: now, updatedAt: now,
	};
	await groups(ctx).put(id, group);
	return { id, ...group };
}

export async function customerGroupUpdateHandler(ctx: RouteContext<CustomerGroupUpdateInput>) {
	const input = ctx.input;
	const existing = await groups(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Customer group not found");

	const updated: CustomerGroup = {
		...existing,
		name: input.name ?? existing.name,
		slug: input.slug ?? existing.slug,
		description: input.description ?? existing.description,
		isDefault: input.isDefault ?? existing.isDefault,
		updatedAt: new Date().toISOString(),
	};
	await groups(ctx).put(input.id, updated);
	return { id: input.id, ...updated };
}

export async function customerGroupDeleteHandler(ctx: RouteContext<CustomerGroupDeleteInput>) {
	const existing = await groups(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Customer group not found");
	if (existing.isDefault) throw PluginRouteError.badRequest("Cannot delete the default customer group");
	await groups(ctx).delete(ctx.input.id);
	return { deleted: true };
}
