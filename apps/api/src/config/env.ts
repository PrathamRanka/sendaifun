import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum([
    "development",
    "test",
    "production",
  ]),

  PORT: z.coerce.number(),

  /**
   * API key for the Pi SDK provider.
   * Passed to AuthStorage.setRuntimeApiKey(PI_PROVIDER, PI_API_KEY).
   */
  PI_API_KEY: z.string().min(1),

  /**
   * Pi SDK provider name (e.g. "google", "anthropic", "openai").
   * Defaults to "google" to preserve backward-compatibility with the
   * previous Gemini-based configuration.
   */
  PI_PROVIDER: z.string().default("google"),

  KUBE_NAMESPACE: z.string(),

  INSTANCE_ID: z.string(),
});

export const env = envSchema.parse(process.env);