import { describe, it, expect, vi } from "vitest";
import { QueueManager } from "../../apps/api/src/sandbox/queue/queue-manager";
import { LeaseManager } from "../../apps/api/src/sandbox/lease/lease-manager";
import { LeaseAcquirer } from "../../apps/api/src/sandbox/lease/lease-acquirer";
import { LeaseReleaser } from "../../apps/api/src/sandbox/lease/lease-releaser";
import { LeaseExpiration } from "../../apps/api/src/sandbox/lease/lease-expiration";
import { SandboxService } from "../../apps/api/src/sandbox/services/sandbox.service";
import { AgentService, SessionLockManager } from "../../apps/api/src/agent/services/agent.service";
import { PiClient } from "../../apps/api/src/agent/interfaces/pi-client.interface";
import { env } from "../../apps/api/src/config/env";
import { PodManager } from "../../apps/api/src/sandbox/lease/pod-manager";
import { TimeoutRunner } from "../../apps/api/src/sandbox/executor/timeout-runner";
import { PodExecutor } from "../../apps/api/src/sandbox/executor/pod-executor";
import { ToolRouterService } from "../../apps/api/src/tools/tool-router.service";

describe("Queue, Timeout, and Session Concurrency Fixes Audit Tests", () => {
  describe("Queue Wakeup Deadlock (CRITICAL-01)", () => {
    it("should continue processing subsequent queued requests if a dequeued request fails acquisition", async () => {
      const mockLeaseRepo = {
        listLeases: vi.fn(),
        updateLease: vi.fn().mockResolvedValue({}),
        getLease: vi.fn().mockResolvedValue({
          metadata: { name: "sandbox-runner-0" },
          spec: { holderIdentity: `${env.INSTANCE_ID}:req-a:sess-a:tool-a` }
        }),
        patchLease: vi.fn(),
      };

      const leaseExpiration = new LeaseExpiration();
      const leaseAcquirer = new LeaseAcquirer(mockLeaseRepo, leaseExpiration);
      const leaseReleaser = new LeaseReleaser(mockLeaseRepo);
      const queueManager = new QueueManager();

      const leaseManager = new LeaseManager(
        leaseAcquirer,
        leaseReleaser,
        queueManager,
        mockLeaseRepo
      );

      // Force immediate acquisition failure to enqueue requests
      vi.spyOn(leaseAcquirer, "acquireLease").mockResolvedValue(null);

      // Enqueue two requests: Request B and Request C
      const order: string[] = [];
      let bRejected = false;
      let cCalled = false;

      const pB = leaseManager.acquireLeaseWithQueue("req-b", "sess-b", "tool-b")
        .catch(() => { bRejected = true; });

      const pC = leaseManager.acquireLeaseWithQueue("req-c", "sess-c", "tool-c")
        .then(() => { order.push("C success"); })
        .catch(() => { order.push("C reject"); cCalled = true; });

      // Now we configure leaseAcquirer for the queue callbacks
      // The first callback (B) will fail to acquire (returns null)
      // The second callback (C) will succeed to acquire (returns "sandbox-runner-1")
      vi.spyOn(leaseAcquirer, "acquireLease")
        .mockResolvedValueOnce(null) // Request B's attempt
        .mockResolvedValueOnce("sandbox-runner-1"); // Request C's attempt

      // Trigger lease release, which wakes up Request B
      await leaseManager.releaseLease("sandbox-runner-0", "req-a", "sess-a", "tool-a");

      // Yield event loop
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Wait for promises to settle
      await Promise.all([pB, pC]);

      // Request B must have failed/rejected
      expect(bRejected).toBe(true);
      // Request C must have been woken up successfully and processed
      expect(cCalled).toBe(false);
      expect(order).toEqual(["C success"]);
    });
  });

  describe("Concurrent Execution Leak on Timeout (HIGH-01)", () => {
    it("should execute cleanup process-killing command inside container before releasing lease on timeout", async () => {
      const releaseLeaseMock = vi.fn().mockResolvedValue(undefined);
      const mockLeaseMgr = {
        acquireLeaseWithQueue: vi.fn().mockResolvedValue("sandbox-runner-0"),
        releaseLease: releaseLeaseMock,
        listLeases: vi.fn(),
        clearQueue: vi.fn(),
        getQueueSize: vi.fn(),
      } as unknown as LeaseManager;

      const mockToolRouter = {
        route: vi.fn().mockImplementation(() => new Promise((resolve) => setTimeout(resolve, 500))),
      } as unknown as ToolRouterService;

      const mockPodMgr = {} as unknown as PodManager;
      const executeMock = vi.fn().mockResolvedValue({ stdout: "", stderr: "", exitCode: 0 });
      const mockPodExecutor = {
        execute: executeMock,
      } as unknown as PodExecutor;

      // Mock TimeoutRunner to immediately invoke the timeout callback and throw error
      const mockTimeoutRunner = {
        runWithTimeout: vi.fn().mockImplementation(async (promise, timeoutMs, onTimeout) => {
          if (onTimeout) onTimeout();
          throw new Error("Timeout simulated");
        }),
      } as unknown as TimeoutRunner;

      const sandboxService = new SandboxService(
        mockLeaseMgr,
        mockToolRouter,
        mockTimeoutRunner,
        mockPodMgr,
        mockPodExecutor
      );

      await expect(
        sandboxService.executeTool("req-1", "sess-1", "tool-1", { id: "tool-1", name: "shell_run", arguments: { command: "sleep 10" } })
      ).rejects.toThrow("Timeout simulated");

      // Verify that cleanup command kill -9 -1 was sent
      expect(executeMock).toHaveBeenCalledWith(
        expect.any(String),
        "sandbox-runner-0",
        expect.any(String),
        ["sh", "-c", "kill -9 -1"]
      );

      // Verify that cleanup happened BEFORE lease release
      const executorCallOrder = executeMock.mock.invocationCallOrder[0];
      const releaseCallOrder = releaseLeaseMock.mock.invocationCallOrder[0];
      expect(executorCallOrder).toBeLessThan(releaseCallOrder);
    });
  });

  describe("Session History Concurrency Race (HIGH-02)", () => {
    it("should serialize concurrent chat requests for the same sessionId but process different sessionIds concurrently", async () => {
      const activeCalls: string[] = [];
      const finishOrder: string[] = [];

      const mockPiClient: PiClient = {
        chat: vi.fn().mockImplementation(async (_hist, msg, reqId) => {
          activeCalls.push(reqId);
          // Simulate latency
          await new Promise((resolve) => setTimeout(resolve, 100));
          finishOrder.push(reqId);
          return { message: `Response for ${msg}` };
        }),
      };

      const mockSandbox = {
        executeTool: vi.fn(),
        getHealth: vi.fn(),
        getSandboxStatuses: vi.fn(),
      } as unknown as SandboxService;

      const agentService = new AgentService(
        mockPiClient,
        mockSandbox,
        new SessionLockManager()
      );

      // Trigger two concurrent requests for the SAME sessionId
      const p1 = agentService.chat("sess-same", "Msg A", "req-A");
      const p2 = agentService.chat("sess-same", "Msg B", "req-B");

      // Trigger another request for a DIFFERENT sessionId
      const pDiff = agentService.chat("sess-diff", "Msg C", "req-C");

      // Wait for all to finish
      await Promise.all([p1, p2, pDiff]);

      // Since Msg A and Msg B are for the same session, they must be serialized.
      // Msg C is on a different session, so it executes concurrently.
      // Therefore, req-C can finish earlier or concurrent, but req-A and req-B must be sequential (A then B).
      
      const posA = finishOrder.indexOf("req-A");
      const posB = finishOrder.indexOf("req-B");

      // A must finish before B starts, ensuring strict serialization
      expect(posA).toBeLessThan(posB);

      // Check history in AgentService
      const history = agentService.getHistory("sess-same");
      expect(history.length).toBe(4);
      expect(history[0]).toEqual({ role: "user", content: "Msg A" });
      expect(history[1]).toEqual({ role: "model", content: "Response for Msg A" });
      expect(history[2]).toEqual({ role: "user", content: "Msg B" });
      expect(history[3]).toEqual({ role: "model", content: "Response for Msg B" });
    });
  });
});
