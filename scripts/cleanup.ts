import { execSync } from "child_process";
import { logger } from "../apps/api/src/observability/logger/logger";

async function main() {
  logger.info("Starting cleanup of LeaseForge Kubernetes resources...");
  try {
    execSync("kubectl delete namespace leaseforge --ignore-not-found=true", {
      stdio: "inherit",
    });
    logger.info("Kubernetes namespace 'leaseforge' and all children deleted successfully.");
  } catch (error) {
    logger.error({ error }, "Failed to clean up Kubernetes namespace.");
    process.exit(1);
  }
}

main();
