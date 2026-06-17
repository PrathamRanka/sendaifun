import { V1Lease } from "@kubernetes/client-node";
import { LeaseAcquirer } from "./lease-acquirer";
import { LeaseReleaser } from "./lease-releaser";
import { QueueManager } from "../queue/queue-manager";
import { LeaseRepository, leaseRepository } from "../../kubernetes/repositories/lease.repository";
import { SandboxCapacityError } from "../../shared/errors/sandbox-capacity.error";
import { logger } from "../../observability/logger/logger";
import { LeaseExpiration } from "./lease-expiration";

export class LeaseManager {
  constructor(
    private readonly leaseAcquirer: LeaseAcquirer,
    private readonly leaseReleaser: LeaseReleaser,
    private readonly queueManager: QueueManager,
    private readonly leaseRepo: LeaseRepository
  ) {}

  getQueueSize(): number {
    return this.queueManager.getSize();
  }

  clearQueue(): void {
    this.queueManager.clear();
  }

  async listLeases(namespace: string): Promise<V1Lease[]> {
    return this.leaseRepo.listLeases(namespace);
  }

  private wakeNext(): void {
    // Wake up the oldest waiting request in the queue to keep queue progression moving forward
    const nextRequest = this.queueManager.dequeue();
    if (nextRequest) {
      process.nextTick(() => nextRequest.callback());
    }
  }

  async acquireLeaseWithQueue(
    requestId: string,
    sessionId: string,
    toolCallId: string
  ): Promise<string> {
    // 1. Polite queueing check: if the queue is not empty, force enqueue
    if (this.queueManager.isEmpty()) {
      try {
        const podName = await this.leaseAcquirer.acquireLease(requestId, sessionId, toolCallId);
        if (podName) {
          return podName;
        }
      } catch (error) {
        logger.warn(
          { requestId, sessionId, toolCallId, error },
          "sandbox.lease.acquire.immediate_failed"
        );
      }
    }

    // 2. Queue the request if no lease available or queue not empty
    logger.info({ requestId, sessionId, toolCallId }, "sandbox.queue.started");
    
    return new Promise<string>((resolve, reject) => {
      this.queueManager.enqueue(
        requestId,
        sessionId,
        toolCallId,
        async () => {
          logger.info({ requestId, sessionId, toolCallId }, "sandbox.queue.completed");
          try {
            const podName = await this.leaseAcquirer.acquireLease(requestId, sessionId, toolCallId);
            if (podName) {
              resolve(podName);
            } else {
              reject(new SandboxCapacityError());
              // Crucial Fix: If woken-up request fails to acquire, wake the next request
              this.wakeNext();
            }
          } catch (error) {
            reject(error);
            // Crucial Fix: If woken-up request encounters an error, wake the next request
            this.wakeNext();
          }
        },
        (err) => {
          reject(err);
        },
        15_000 // Queue Timeout: 15s
      );
    });
  }

  async releaseLease(
    podName: string,
    requestId: string,
    sessionId: string,
    toolCallId: string
  ): Promise<void> {
    try {
      await this.leaseReleaser.releaseLease(podName, requestId, sessionId, toolCallId);
    } finally {
      // Always wake up the oldest waiting request, regardless of update success
      this.wakeNext();
    }
  }
}

// Wired singleton default instance
const leaseExpirationInstance = new LeaseExpiration();
const leaseAcquirerInstance = new LeaseAcquirer(leaseRepository, leaseExpirationInstance);
const leaseReleaserInstance = new LeaseReleaser(leaseRepository);
const queueManagerInstance = new QueueManager();

export const leaseManager = new LeaseManager(
  leaseAcquirerInstance,
  leaseReleaserInstance,
  queueManagerInstance,
  leaseRepository
);
