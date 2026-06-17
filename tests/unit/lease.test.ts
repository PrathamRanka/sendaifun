import { describe, it, expect, vi, beforeEach, Mock } from "vitest";
import { LeaseManager } from "../../apps/api/src/sandbox/lease/lease-manager";
import { LeaseAcquirer } from "../../apps/api/src/sandbox/lease/lease-acquirer";
import { LeaseReleaser } from "../../apps/api/src/sandbox/lease/lease-releaser";
import { LeaseExpiration } from "../../apps/api/src/sandbox/lease/lease-expiration";
import { QueueManager } from "../../apps/api/src/sandbox/queue/queue-manager";
import { V1Lease } from "@kubernetes/client-node";

describe("Lease Acquisition & Lifecycle Unit Tests", () => {
  let mockLeaseRepo: {
    listLeases: Mock;
    updateLease: Mock;
    getLease: Mock;
    patchLease: Mock;
  };
  let leaseAcquirer: LeaseAcquirer;
  let leaseManager: LeaseManager;

  beforeEach(() => {
    mockLeaseRepo = {
      listLeases: vi.fn(),
      updateLease: vi.fn(),
      getLease: vi.fn(),
      patchLease: vi.fn(),
    };
    const leaseExpiration = new LeaseExpiration();
    leaseAcquirer = new LeaseAcquirer(mockLeaseRepo, leaseExpiration);
    const leaseReleaser = new LeaseReleaser(mockLeaseRepo);
    const queueManager = new QueueManager();
    leaseManager = new LeaseManager(
      leaseAcquirer,
      leaseReleaser,
      queueManager,
      mockLeaseRepo
    );
  });

  it("should acquire a lease successfully if free", async () => {
    const mockLeases: V1Lease[] = [
      { metadata: { name: "sandbox-runner-0" }, spec: { leaseDurationSeconds: 45 } },
      { metadata: { name: "sandbox-runner-1" }, spec: { leaseDurationSeconds: 45 } },
    ];
    mockLeaseRepo.listLeases.mockResolvedValue(mockLeases);
    mockLeaseRepo.updateLease.mockResolvedValue({});

    const result = await leaseAcquirer.acquireLease("req-1", "sess-1", "tool-1");
    expect(result).toBe("sandbox-runner-0");
    expect(mockLeaseRepo.updateLease).toHaveBeenCalled();
  });

  it("should detect expired leases and reuse them", async () => {
    const pastTime = new Date(Date.now() - 60 * 1000); // 60s ago
    const mockLeases: V1Lease[] = [
      {
        metadata: { name: "sandbox-runner-0" },
        spec: {
          holderIdentity: "api-1:req-old:sess-old:tool-old",
          renewTime: pastTime,
          leaseDurationSeconds: 45,
        },
      },
    ];
    mockLeaseRepo.listLeases.mockResolvedValue(mockLeases);
    mockLeaseRepo.updateLease.mockResolvedValue({});

    const result = await leaseAcquirer.acquireLease("req-new", "sess-new", "tool-new");
    expect(result).toBe("sandbox-runner-0");
  });

  it("should handle optimistic concurrency conflicts and retry", async () => {
    const mockLeases: V1Lease[] = [
      { metadata: { name: "sandbox-runner-0" }, spec: { leaseDurationSeconds: 45 } },
    ];
    mockLeaseRepo.listLeases.mockResolvedValue(mockLeases);
    
    // First call throws 409, second succeeds
    mockLeaseRepo.updateLease
      .mockRejectedValueOnce({ statusCode: 409 })
      .mockResolvedValueOnce({});

    const result = await leaseAcquirer.acquireLease("req-1", "sess-1", "tool-1");
    expect(result).toBe("sandbox-runner-0");
    expect(mockLeaseRepo.updateLease).toHaveBeenCalledTimes(2);
  });

  it("should release a lease conditionally if owner matches", async () => {
    const mockLease: V1Lease = {
      metadata: { name: "sandbox-runner-0" },
      spec: {
        holderIdentity: "api-1:req-1:sess-1:tool-1",
        leaseDurationSeconds: 45,
      },
    };
    mockLeaseRepo.getLease.mockResolvedValue(mockLease);
    mockLeaseRepo.updateLease.mockResolvedValue({});

    await leaseManager.releaseLease("sandbox-runner-0", "req-1", "sess-1", "tool-1");
    expect(mockLeaseRepo.updateLease).toHaveBeenCalled();
    expect(mockLease.spec?.holderIdentity).toBeUndefined();
  });

  it("should NOT release a lease if owner mismatch", async () => {
    const mockLease: V1Lease = {
      metadata: { name: "sandbox-runner-0" },
      spec: {
        holderIdentity: "api-1:req-other:sess-other:tool-other",
        leaseDurationSeconds: 45,
      },
    };
    mockLeaseRepo.getLease.mockResolvedValue(mockLease);

    await leaseManager.releaseLease("sandbox-runner-0", "req-1", "sess-1", "tool-1");
    expect(mockLeaseRepo.updateLease).not.toHaveBeenCalled();
  });
});
