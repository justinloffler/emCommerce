/**
 * Custom field definition CRUD handlers.
 */

import type { RouteContext, StorageCollection } from "emdash";
import { PluginRouteError } from "emdash";
import { ulid } from "ulidx";

import type {
	CustomFieldCreateInput, CustomFieldUpdateInput,
	CustomFieldDeleteInput, CustomFieldListInput,
} from "../schemas/custom-fields.js";
import type { CustomFieldDefinition } from "../types.js";

function defs(ctx: RouteContext): StorageCollection<CustomFieldDefinition> {
	return ctx.storage["custom-field-definitions"] as StorageCollection<CustomFieldDefinition>;
}

export async function customFieldListHandler(ctx: RouteContext<CustomFieldListInput>) {
	const result = await defs(ctx).query({
		where: { entityType: ctx.input.entityType },
		orderBy: { sortOrder: "asc" },
		limit: 100,
	});
	return { items: result.items.map((i) => ({ id: i.id, ...i.data })) };
}

export async function customFieldCreateHandler(ctx: RouteContext<CustomFieldCreateInput>) {
	const input = ctx.input;

	// Check key uniqueness within entity type
	const existing = await defs(ctx).query({
		where: { entityType: input.entityType },
		limit: 100,
	});
	if (existing.items.some((i) => i.data.key === input.key)) {
		throw PluginRouteError.conflict(`Custom field "${input.key}" already exists for ${input.entityType}`);
	}

	const now = new Date().toISOString();
	const id = ulid();
	const def: CustomFieldDefinition = {
		entityType: input.entityType,
		key: input.key,
		label: input.label,
		fieldType: input.fieldType,
		options: input.options ?? null,
		placeholder: input.placeholder ?? null,
		required: input.required ?? false,
		defaultValue: input.defaultValue ?? null,
		sortOrder: input.sortOrder ?? 0,
		createdAt: now,
		updatedAt: now,
	};
	await defs(ctx).put(id, def);
	return { id, ...def };
}

export async function customFieldUpdateHandler(ctx: RouteContext<CustomFieldUpdateInput>) {
	const input = ctx.input;
	const existing = await defs(ctx).get(input.id);
	if (!existing) throw PluginRouteError.notFound("Custom field not found");

	const updated: CustomFieldDefinition = {
		...existing,
		label: input.label ?? existing.label,
		fieldType: input.fieldType ?? existing.fieldType,
		options: input.options !== undefined ? input.options : existing.options,
		placeholder: input.placeholder !== undefined ? input.placeholder : existing.placeholder,
		required: input.required ?? existing.required,
		defaultValue: input.defaultValue !== undefined ? input.defaultValue : existing.defaultValue,
		sortOrder: input.sortOrder ?? existing.sortOrder,
		updatedAt: new Date().toISOString(),
	};
	await defs(ctx).put(input.id, updated);
	return { id: input.id, ...updated };
}

export async function customFieldDeleteHandler(ctx: RouteContext<CustomFieldDeleteInput>) {
	const existing = await defs(ctx).get(ctx.input.id);
	if (!existing) throw PluginRouteError.notFound("Custom field not found");
	await defs(ctx).delete(ctx.input.id);
	return { deleted: true };
}
