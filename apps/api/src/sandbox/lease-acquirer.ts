import { V1Lease } from "@kubernetes/client-node";
import { env } from "../config/env";
import { LeaseRepository } from "../kubernetes/repositories/lease.repository";
import { LeaseExpiration } from "./lease-expiration";
import { logger } from "../observability/logger/logger";
import { LEASE_RETRY_COUNT, LEASE_RETRY_DELAY_MS } from "../shared/constants/sandbox.constants";

export class LeaseAcquirer {
  constructor(
    private readonly leaseRepo: LeaseRepository,
    private readonly leaseExpiration: LeaseExpiration
  ) {}

  async acquireLease(
    requestId: string,
    sessionId: string,
    toolCallId: string
  ): Promise<string | null> {
    const namespace = env.KUBE_NAMESPACE;
    const instanceId = env.INSTANCE_ID;
    const expectedIdentity = `${instanceId}:${requestId}:${sessionId}:${toolCallId}`;

    logger.info({ requestId, sessionId, toolCallId }, "sandbox.lease.acquire.started");

    // Attempt to acquire
    for (let attempt = 0; attempt < LEASE_RETRY_COUNT; attempt++) {
      let leases: V1Lease[] = [];
      try {
        leases = await this.leaseRepo.listLeases(namespace);
      } catch (err) {
        logger.error({ requestId, sessionId, toolCallId, err }, "sandbox.lease.list.failed");
        throw err;
      }

      // Filter and find free/expired leases
      const availableLeases = leases.filter((lease) => {
        const name = lease.metadata?.name;
        if (!name || !name.startsWith("sandbox-runner-")) return false;
        return this.leaseExpiration.isLeaseExpired(lease);
      });

      if (availableLeases.length === 0) {
        return null; // All busy
      }

      // Try the first available lease
      // Clone to avoid mutating shared mock database references in memory
      const lease = JSON.parse(JSON.stringify(availableLeases[0])) as V1Lease;
      const leaseName = lease.metadata!.name!;

      // Update lease spec for acquisition
      lease.spec = lease.spec ?? {};
      lease.spec.holderIdentity = expectedIdentity;
      lease.spec.acquireTime = new Date() as unknown as Date;
      lease.spec.renewTime = new Date() as unknown as Date;
      lease.spec.leaseDurationSeconds = 45;

      try {
        await this.leaseRepo.updateLease(namespace, leaseName, lease);
        logger.info(
          { requestId, sessionId, toolCallId, pod: leaseName },
          "sandbox.lease.acquired"
        );
        return leaseName;
      } catch (error: unknown) {
        const err = error as { statusCode?: number; status?: number; response?: { statusCode?: number } };
        const status = err.statusCode ?? err.status ?? err.response?.statusCode;
        if (status === 409) {
          logger.info(
            { requestId, sessionId, toolCallId, lease: leaseName },
            "sandbox.lease.conflict"
          );
          // Wait briefly before retrying
          await new Promise((resolve) => setTimeout(resolve, LEASE_RETRY_DELAY_MS));
          continue;
        }
        throw error;
      }
    }

    return null;
  }
}
