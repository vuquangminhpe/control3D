import { z } from "zod";

export const emailSchema = z.string().trim().email().max(254).toLowerCase();

export const passwordSchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[0-9]/, "Password must include a number");

export const displayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[\p{L}\p{N}_ .-]+$/u, "Display name contains unsupported characters");

export const usernameSchema = z
  .string()
  .trim()
  .min(3)
  .max(32)
  .regex(/^[a-zA-Z0-9_]+$/);

export const userRegisterSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  displayName: displayNameSchema,
  password: passwordSchema,
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const adminLoginSchema = loginSchema;

export const refreshTokenSchema = z.object({
  subjectType: z.enum(["admin", "user"]),
});

export type UserRegisterInput = z.infer<typeof userRegisterSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
