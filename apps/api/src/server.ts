import { startup } from "./app";
import { logger } from "./observability/logger/logger";

try {
  startup();
  logger.info("LeaseForge core modules initialized successfully.");
} catch (error) {
  logger.error({ error }, "Failed to initialize LeaseForge core modules.");
  process.exit(1);
}
