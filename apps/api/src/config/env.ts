import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum([
    "development",
    "test",
    "production",
  ]),

  PORT: z.coerce.number(),

  PI_API_KEY: z.string().min(1),

  PI_BASE_URL: z.string().url(),

  KUBE_NAMESPACE: z.string(),

  INSTANCE_ID: z.string(),
});

export const env = envSchema.parse(process.env);