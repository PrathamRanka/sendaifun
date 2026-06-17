import { env } from "../../config/env";
import { LeaseRepository } from "../../kubernetes/repositories/lease.repository";
import { logger } from "../../observability/logger/logger";

export class LeaseReleaser {
  constructor(private readonly leaseRepo: LeaseRepository) {}

  async releaseLease(
    podName: string,
    requestId: string,
    sessionId: string,
    toolCallId: string
  ): Promise<void> {
    const namespace = env.KUBE_NAMESPACE;
    const instanceId = env.INSTANCE_ID;
    const expectedIdentity = `${instanceId}:${requestId}:${sessionId}:${toolCallId}`;

    logger.info({ requestId, sessionId, toolCallId, pod: podName }, "sandbox.lease.release.started");

    try {
      const lease = await this.leaseRepo.getLease(namespace, podName);
      
      // Conditional release: Only release if it belongs to us
      if (lease.spec?.holderIdentity === expectedIdentity) {
        lease.spec.holderIdentity = undefined;
        lease.spec.acquireTime = undefined;
        lease.spec.renewTime = undefined;
        
        await this.leaseRepo.updateLease(namespace, podName, lease);
        logger.info(
          { requestId, sessionId, toolCallId, pod: podName },
          "sandbox.lease.released"
        );
      } else {
        logger.warn(
          {
            requestId,
            sessionId,
            toolCallId,
            pod: podName,
            actualHolder: lease.spec?.holderIdentity,
            expectedHolder: expectedIdentity,
          },
          "sandbox.lease.release.identity_mismatch"
        );
      }
    } catch (error) {
      logger.error(
        { requestId, sessionId, toolCallId, pod: podName, error },
        "sandbox.lease.release.failed"
      );
      throw error;
    }
  }
}
