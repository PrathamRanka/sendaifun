import { V1Lease } from "@kubernetes/client-node";
import { env } from "../config/env";
import { leaseRepository, LeaseRepository } from "../kubernetes/repositories/lease.repository";
import { SandboxCapacityError } from "../shared/errors/sandbox-capacity.error";
import { isExpired } from "../shared/utils/time";
import { logger } from "../observability/logger/logger";
import { LEASE_RETRY_COUNT, LEASE_RETRY_DELAY_MS } from "../shared/constants/sandbox.constants";

interface QueueNode {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  callback: () => void;
  reject: (err: Error) => void;
  timeoutId: NodeJS.Timeout;
  next?: QueueNode;
  prev?: QueueNode;
}


export class RequestQueue {
  private head?: QueueNode;
  private tail?: QueueNode;
  private size: number = 0;

  enqueue(
    requestId: string,
    sessionId: string,
    toolCallId: string,
    callback: () => void,
    reject: (err: Error) => void,
    timeoutMs: number
  ): QueueNode {
    const node: QueueNode = {
      requestId,
      sessionId,
      toolCallId,
      callback,
      reject,
      timeoutId: null as any,
    };

    node.timeoutId = setTimeout(() => {
      this.remove(node);
      reject(new SandboxCapacityError());
    }, timeoutMs);

    if (!this.tail) {
      this.head = node;
      this.tail = node;
    } else {
      this.tail.next = node;
      node.prev = this.tail;
      this.tail = node;
    }
    this.size++;
    return node;
  }

  dequeue(): QueueNode | undefined {
    if (!this.head) return undefined;
    const node = this.head;
    clearTimeout(node.timeoutId);
    
    this.head = node.next;
    if (this.head) {
      this.head.prev = undefined;
    } else {
      this.tail = undefined;
    }
    this.size--;
    return node;
  }

  remove(node: QueueNode) {
    // Check if node is in the queue
    let current = this.head;
    let found = false;
    while (current) {
      if (current === node) {
        found = true;
        break;
      }
      current = current.next;
    }
    if (!found) return;

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    this.size--;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  getSize(): number {
    return this.size;
  }

  clear() {
    let current = this.head;
    while (current) {
      clearTimeout(current.timeoutId);
      current = current.next;
    }
    this.head = undefined;
    this.tail = undefined;
    this.size = 0;
  }
}

export class LeaseManager {
  private readonly queue: RequestQueue;

  constructor(private readonly leaseRepo: LeaseRepository = leaseRepository) {
    this.queue = new RequestQueue();
  }

  getQueueSize(): number {
    return this.queue.getSize();
  }

  clearQueue(): void {
    this.queue.clear();
  }

  async acquireLeaseWithQueue(
    requestId: string,
    sessionId: string,
    toolCallId: string
  ): Promise<string> {
    // 1. Polite queueing check: if the queue is not empty, force enqueue
    if (this.queue.isEmpty()) {
      try {
        const podName = await this.acquireLease(requestId, sessionId, toolCallId);
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
      this.queue.enqueue(
        requestId,
        sessionId,
        toolCallId,
        async () => {
          logger.info({ requestId, sessionId, toolCallId }, "sandbox.queue.completed");
          try {
            const podName = await this.acquireLease(requestId, sessionId, toolCallId);
            if (podName) {
              resolve(podName);
            } else {
              reject(new SandboxCapacityError());
            }
          } catch (error) {
            reject(error);
          }
        },
        (err) => {
          reject(err);
        },
        15_000 // Queue Timeout: 15s
      );
    });
  }

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

        const holder = lease.spec?.holderIdentity;
        if (!holder) return true; // Free

        const renewTime = lease.spec?.renewTime;
        if (!renewTime) return true; // Free

        const duration = lease.spec?.leaseDurationSeconds ?? 45;
        const renewTimeStr = typeof renewTime === "string"
          ? renewTime
          : (renewTime as Date).toISOString();

        return isExpired(renewTimeStr, duration);
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
      lease.spec.acquireTime = new Date() as any;
      lease.spec.renewTime = new Date() as any;
      lease.spec.leaseDurationSeconds = 45;

      try {
        await this.leaseRepo.updateLease(namespace, leaseName, lease);
        logger.info(
          { requestId, sessionId, toolCallId, pod: leaseName },
          "sandbox.lease.acquired"
        );
        return leaseName;
      } catch (error: any) {
        const status = error.statusCode ?? error.status ?? error.response?.statusCode;
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
    } finally {
      // Always wake up the oldest waiting request, regardless of update success
      const nextRequest = this.queue.dequeue();
      if (nextRequest) {
        // Execute callback in the next tick to clear stack
        process.nextTick(() => nextRequest.callback());
      }
    }
  }
}

export const leaseManager = new LeaseManager();
