import { execSync } from "child_process";
import { logger } from "../apps/api/src/observability/logger/logger";
import path from "path";

async function main() {
  logger.info("Seeding Kind Kubernetes cluster with LeaseForge manifests...");
  const infraDir = path.resolve(__dirname, "../infra/kubernetes");

  try {
    logger.info("Applying namespace...");
    execSync(`kubectl apply -f "${path.join(infraDir, "namespace.yaml")}"`, { stdio: "inherit" });

    logger.info("Applying ServiceAccount, Role, and RoleBinding...");
    execSync(`kubectl apply -f "${path.join(infraDir, "service-account.yaml")}"`, { stdio: "inherit" });
    execSync(`kubectl apply -f "${path.join(infraDir, "role.yaml")}"`, { stdio: "inherit" });
    execSync(`kubectl apply -f "${path.join(infraDir, "role-binding.yaml")}"`, { stdio: "inherit" });

    logger.info("Applying StatefulSet (warm sandbox runners)...");
    execSync(`kubectl apply -f "${path.join(infraDir, "statefulset.yaml")}"`, { stdio: "inherit" });

    logger.info("Applying Lease objects...");
    execSync(`kubectl apply -f "${path.join(infraDir, "leases.yaml")}"`, { stdio: "inherit" });

    logger.info("Kind Kubernetes cluster seeded successfully.");
  } catch (error) {
    logger.error({ error }, "Failed to seed Kind Kubernetes cluster.");
    process.exit(1);
  }
}

main();
