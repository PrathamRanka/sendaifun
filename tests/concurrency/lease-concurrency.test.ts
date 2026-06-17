import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { LeaseManager } from "../../apps/api/src/sandbox/lease/lease-manager";
import { LeaseAcquirer } from "../../apps/api/src/sandbox/lease/lease-acquirer";
import { LeaseReleaser } from "../../apps/api/src/sandbox/lease/lease-releaser";
import { LeaseExpiration } from "../../apps/api/src/sandbox/lease/lease-expiration";
import { QueueManager } from "../../apps/api/src/sandbox/queue/queue-manager";
import { V1Lease } from "@kubernetes/client-node";

describe("Lease Concurrency & Queueing Tests", () => {
  let mockLeaseRepo: {
    listLeases: Mock;
    updateLease: Mock;
    getLease: Mock;
    patchLease: Mock;
  };
  let leaseManager: LeaseManager;

  beforeEach(() => {
    // We mock a store of leases in-memory to simulate Kubernetes state
    const leasesDb: V1Lease[] = Array.from({ length: 8 }, (_, i) => ({
      metadata: { name: `sandbox-runner-${i}`, resourceVersion: "1" },
      spec: { leaseDurationSeconds: 45 },
    }));

    mockLeaseRepo = {
      listLeases: vi.fn(async () => {
        return JSON.parse(JSON.stringify(leasesDb));
      }),
      updateLease: vi.fn(async (ns, name, lease) => {
        const idx = leasesDb.findIndex((l) => l.metadata?.name === name);
        if (idx === -1) throw new Error("Not found");
        
        if (leasesDb[idx].metadata?.resourceVersion !== lease.metadata?.resourceVersion) {
          throw { statusCode: 409, message: "Conflict" };
        }
        
        const nextVersion = (
          Number(leasesDb[idx].metadata!.resourceVersion!) + 1
        ).toString();
        lease.metadata.resourceVersion = nextVersion;
        leasesDb[idx] = JSON.parse(JSON.stringify(lease));
        return leasesDb[idx];
      }),
      getLease: vi.fn(async (ns, name) => {
        const idx = leasesDb.findIndex((l) => l.metadata?.name === name);
        if (idx === -1) throw new Error("Not found");
        return JSON.parse(JSON.stringify(leasesDb[idx]));
      }),
      patchLease: vi.fn(),
    };

    const leaseExpiration = new LeaseExpiration();
    const leaseAcquirer = new LeaseAcquirer(mockLeaseRepo, leaseExpiration);
    const leaseReleaser = new LeaseReleaser(mockLeaseRepo);
    const queueManager = new QueueManager();
    leaseManager = new LeaseManager(
      leaseAcquirer,
      leaseReleaser,
      queueManager,
      mockLeaseRepo
    );
  });

  it("should handle 20 parallel requests correctly", async () => {
    const activeAssignments = new Map<string, string>(); // podName -> ownerIdentity
    
    // Spawn 20 parallel requests
    const promises = Array.from({ length: 20 }, async (_, i) => {
      const requestId = `req-${i}`;
      const sessionId = `sess-${i}`;
      const toolCallId = `tool-${i}`;
      
      const podName = await leaseManager.acquireLeaseWithQueue(
        requestId,
        sessionId,
        toolCallId
      );
      
      // Verification: no duplicate assignments!
      expect(activeAssignments.has(podName)).toBe(false);
      activeAssignments.set(podName, `${requestId}:${sessionId}:${toolCallId}`);
      
      return podName;
    });

    // Yield the event loop so that all 20 calls run and block/enqueue
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // 8 should be acquired, 12 enqueued
    expect(leaseManager.getQueueSize()).toBe(12);

    // Release leases one by one to let enqueued requests execute
    for (let k = 0; k < 12; k++) {
      const activePods = Array.from(activeAssignments.keys());
      const podToRelease = activePods[0];
      const owner = activeAssignments.get(podToRelease)!;
      const parts = owner.split(":");
      const req = parts[0];
      const sess = parts[1];
      const tool = parts[2];
      
      activeAssignments.delete(podToRelease);
      
      await leaseManager.releaseLease(podToRelease, req, sess, tool);
      
      // Wait for next request to wake up and acquire it
      await new Promise((resolve) => setTimeout(resolve, 15));
    }

    // Wait for all 20 promises to resolve
    const assignedPods = await Promise.all(promises);

    expect(assignedPods.length).toBe(20);
    expect(leaseManager.getQueueSize()).toBe(0);

    // Clean up remaining 8 active assignments
    for (const [pod, owner] of activeAssignments.entries()) {
      const parts = owner.split(":");
      const req = parts[0];
      const sess = parts[1];
      const tool = parts[2];
      await leaseManager.releaseLease(pod, req, sess, tool);
    }

    expect(leaseManager.getQueueSize()).toBe(0);
  });
});
