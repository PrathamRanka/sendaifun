import { leaseRepository } from "../apps/api/src/kubernetes/repositories/lease.repository";
import { env } from "../apps/api/src/config/env";
import { logger } from "../apps/api/src/observability/logger/logger";
import { kubeClient } from "../apps/api/src/kubernetes/client/kube-client";

async function main() {
  const namespace = env.KUBE_NAMESPACE;
  logger.info({ namespace }, "Initializing Lease objects in Kubernetes...");

  // Ensure namespace exists first (or logs warning if we can't create it)
  try {
    await kubeClient.coreApi.readNamespace({ name: namespace });
  } catch (err: any) {
    const status = err.statusCode ?? err.status ?? err.response?.statusCode;
    if (status === 404) {
      logger.info({ namespace }, "Namespace not found. Creating namespace...");
      await kubeClient.coreApi.createNamespace({
        body: {
          metadata: { name: namespace },
        },
      });
    } else {
      logger.warn({ err }, "Could not check/create namespace. Proceeding anyway.");
    }
  }

  for (let i = 0; i < 8; i++) {
    const leaseName = `sandbox-runner-${i}`;
    try {
      await leaseRepository.getLease(namespace, leaseName);
      logger.info({ leaseName }, "Lease object already exists.");
    } catch (error: any) {
      const status = error.statusCode ?? error.status ?? error.response?.statusCode;
      if (status === 404) {
        logger.info({ leaseName }, "Lease object not found. Creating it...");
        await kubeClient.coordinationApi.createNamespacedLease({
          namespace,
          body: {
            metadata: {
              name: leaseName,
              namespace,
            },
            spec: {
              leaseDurationSeconds: 45,
            },
          },
        });
        logger.info({ leaseName }, "Lease object created.");
      } else {
        logger.error({ leaseName, error }, "Error checking/creating lease.");
      }
    }
  }
  logger.info("Lease initialization complete.");
}

main().catch((err) => {
  logger.error({ err }, "Lease initialization failed.");
  process.exit(1);
});
