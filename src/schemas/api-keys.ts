import { z } from "astro/zod";

export const apiKeyCreateSchema = z.object({
	name: z.string().min(1).max(100),
	permissions: z.array(z.enum(["read", "write", "orders", "products", "customers", "inventory"])).default(["read"]),
});

export const apiKeyRevokeSchema = z.object({
	id: z.string().min(1),
});

export type ApiKeyCreateInput = z.infer<typeof apiKeyCreateSchema>;
export type ApiKeyRevokeInput = z.infer<typeof apiKeyRevokeSchema>;
