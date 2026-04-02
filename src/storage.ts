/**
 * Storage collection configuration for emCommerce.
 *
 * Declares all collections and their indexes for the plugin storage system.
 * Composite indexes use tuples. Unique indexes enforce uniqueness.
 */

import type { PluginStorageConfig } from "emdash";

// ─── Storage Type ───────────────────────────────────────────────

export type EmCommerceStorage = PluginStorageConfig & {
	products: {
		indexes: [
			"status",
			"type",
			"featured",
			"createdAt",
			["status", "createdAt"],
			["status", "featured"],
		];
		uniqueIndexes: ["slug"];
	};
	variants: {
		indexes: ["productId", ["productId", "enabled"]];
		uniqueIndexes: ["sku"];
	};
	categories: {
		indexes: ["parentId", "sortOrder"];
		uniqueIndexes: ["slug"];
	};
	tags: {
		indexes: ["createdAt"];
		uniqueIndexes: ["slug"];
	};
	"specific-prices": {
		indexes: [
			"productId",
			"variantId",
			"customerGroupId",
			"priority",
			"startDate",
			"endDate",
			["productId", "priority"],
			["productId", "customerGroupId"],
		];
	};
	"catalog-price-rules": {
		indexes: ["enabled", "priority", "startDate", "endDate"];
	};
	carts: {
		indexes: ["sessionId", "userId", "expiresAt", "updatedAt"];
	};
	orders: {
		indexes: [
			"status",
			"customerId",
			"customerEmail",
			"paymentStatus",
			"createdAt",
			["status", "createdAt"],
			["customerId", "createdAt"],
		];
		uniqueIndexes: ["orderNumber"];
	};
	customers: {
		indexes: ["userId", "groupId", "createdAt"];
		uniqueIndexes: ["email"];
	};
	"customer-groups": {
		indexes: ["isDefault"];
		uniqueIndexes: ["slug"];
	};
	"shipping-zones": {
		indexes: ["sortOrder"];
	};
	"tax-classes": {
		indexes: ["isDefault"];
		uniqueIndexes: ["slug"];
	};
	"tax-rules": {
		indexes: [
			"taxClassId",
			"countryCode",
			["taxClassId", "countryCode"],
			["taxClassId", "countryCode", "stateCode"],
		];
	};
	coupons: {
		indexes: ["enabled", "startDate", "endDate", ["enabled", "startDate"]];
		uniqueIndexes: ["code"];
	};
	currencies: {
		indexes: ["isDefault", "enabled"];
		uniqueIndexes: ["code"];
	};
};

// ─── Storage Config ─────────────────────────────────────────────

export const EMCOMMERCE_STORAGE_CONFIG = {
	products: {
		indexes: [
			"status",
			"type",
			"featured",
			"createdAt",
			["status", "createdAt"],
			["status", "featured"],
		] as const,
		uniqueIndexes: ["slug"] as const,
	},
	variants: {
		indexes: ["productId", ["productId", "enabled"]] as const,
		uniqueIndexes: ["sku"] as const,
	},
	categories: {
		indexes: ["parentId", "sortOrder"] as const,
		uniqueIndexes: ["slug"] as const,
	},
	tags: {
		indexes: ["createdAt"] as const,
		uniqueIndexes: ["slug"] as const,
	},
	"specific-prices": {
		indexes: [
			"productId",
			"variantId",
			"customerGroupId",
			"priority",
			"startDate",
			"endDate",
			["productId", "priority"],
			["productId", "customerGroupId"],
		] as const,
	},
	"catalog-price-rules": {
		indexes: ["enabled", "priority", "startDate", "endDate"] as const,
	},
	carts: {
		indexes: ["sessionId", "userId", "expiresAt", "updatedAt"] as const,
	},
	orders: {
		indexes: [
			"status",
			"customerId",
			"customerEmail",
			"paymentStatus",
			"createdAt",
			["status", "createdAt"],
			["customerId", "createdAt"],
		] as const,
		uniqueIndexes: ["orderNumber"] as const,
	},
	customers: {
		indexes: ["userId", "groupId", "createdAt"] as const,
		uniqueIndexes: ["email"] as const,
	},
	"customer-groups": {
		indexes: ["isDefault"] as const,
		uniqueIndexes: ["slug"] as const,
	},
	"shipping-zones": {
		indexes: ["sortOrder"] as const,
	},
	"tax-classes": {
		indexes: ["isDefault"] as const,
		uniqueIndexes: ["slug"] as const,
	},
	"tax-rules": {
		indexes: [
			"taxClassId",
			"countryCode",
			["taxClassId", "countryCode"],
			["taxClassId", "countryCode", "stateCode"],
		] as const,
	},
	coupons: {
		indexes: ["enabled", "startDate", "endDate", ["enabled", "startDate"]] as const,
		uniqueIndexes: ["code"] as const,
	},
	currencies: {
		indexes: ["isDefault", "enabled"] as const,
		uniqueIndexes: ["code"] as const,
	},
	"custom-field-definitions": {
		indexes: ["entityType", "sortOrder", ["entityType", "sortOrder"]] as const,
		uniqueIndexes: [["entityType", "key"]] as const,
	},
} satisfies PluginStorageConfig;
