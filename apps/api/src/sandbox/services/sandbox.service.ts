import { leaseManager, LeaseManager } from "../lease/lease-manager";
import { PiToolCall } from "../../agent/types/agent.types";
import { logger } from "../../observability/logger/logger";
import { toolRouterService, ToolRouterService } from "../../tools/tool-router.service";
import { TimeoutRunner } from "../executor/timeout-runner";
import { podManager, PodManager } from "../lease/pod-manager";
import { env } from "../../config/env";

export class SandboxService {
  constructor(
    private readonly leaseMgr: LeaseManager = leaseManager,
    private readonly toolRouter: ToolRouterService = toolRouterService,
    private readonly timeoutRunner: TimeoutRunner = new TimeoutRunner(),
    private readonly podMgr: PodManager = podManager
  ) {}

  async executeTool(
    requestId: string,
    sessionId: string,
    toolCallId: string,
    toolCall: PiToolCall
  ): Promise<unknown> {
    let leasedPod: string | null = null;
    try {
      leasedPod = await this.leaseMgr.acquireLeaseWithQueue(
        requestId,
        sessionId,
        toolCallId
      );

      logger.info(
        { requestId, sessionId, toolCallId, pod: leasedPod },
        "sandbox.execution.started"
      );

      const executionPromise = this.toolRouter.route(
        leasedPod,
        toolCall,
        requestId,
        sessionId
      );

      const result = await this.timeoutRunner.runWithTimeout(
        executionPromise,
        30_000,
        () => {
          logger.warn(
            { requestId, sessionId, toolCallId, pod: leasedPod },
            "sandbox.execution.timeout"
          );
        }
      );

      logger.info(
        { requestId, sessionId, toolCallId, pod: leasedPod },
        "sandbox.execution.completed"
      );
      
      return result;
    } catch (error) {
      logger.error(
        { requestId, sessionId, toolCallId, pod: leasedPod, error },
        "sandbox.execution.failed"
      );
      throw error;
    } finally {
      if (leasedPod) {
        await this.leaseMgr.releaseLease(
          leasedPod,
          requestId,
          sessionId,
          toolCallId
        );
      }
    }
  }

  async getHealth(): Promise<{
    ok: boolean;
    kubernetes: "connected" | "disconnected";
    sandboxPodsReady: number;
  }> {
    try {
      const namespace = env.KUBE_NAMESPACE;
      const readyPods = await this.podMgr.getReadyPods(namespace);

      const sandboxPods = readyPods.filter((p) =>
        p.metadata?.name?.startsWith("sandbox-runner-")
      );

      return {
        ok: true,
        kubernetes: "connected",
        sandboxPodsReady: sandboxPods.length,
      };
    } catch {
      return {
        ok: false,
        kubernetes: "disconnected",
        sandboxPodsReady: 0,
      };
    }
  }

  async getSandboxStatuses(): Promise<
    Array<{
      podName: string;
      ready: boolean;
      leaseStatus: "free" | "leased" | "expired";
      holderIdentity: string | null;
      expiration: string | null;
    }>
  > {
    const namespace = env.KUBE_NAMESPACE;

    const [pods, leases] = await Promise.all([
      this.podMgr.listPods(namespace),
      this.leaseMgr.listLeases(namespace),
    ]);

    const results: Array<{
      podName: string;
      ready: boolean;
      leaseStatus: "free" | "leased" | "expired";
      holderIdentity: string | null;
      expiration: string | null;
    }> = [];

    const { isExpired } = await import("../../shared/utils/time");

    for (let i = 0; i < 8; i++) {
      const podName = `sandbox-runner-${i}`;
      const pod = pods.find((p) => p.metadata?.name === podName);
      const lease = leases.find((l) => l.metadata?.name === podName);

      const ready =
        pod?.status?.conditions?.some(
          (c) => c.type === "Ready" && c.status === "True"
        ) ?? false;

      let leaseStatus: "free" | "leased" | "expired" = "free";
      let holderIdentity: string | null = null;
      let expiration: string | null = null;

      if (lease?.spec) {
        holderIdentity = lease.spec.holderIdentity ?? null;
        if (holderIdentity) {
          const renewTime = lease.spec.renewTime;
          const duration = lease.spec.leaseDurationSeconds ?? 45;

          if (renewTime) {
            const renewTimeStr =
              typeof renewTime === "string"
                ? renewTime
                : (renewTime as Date).toISOString();

            const expired = isExpired(renewTimeStr, duration);
            leaseStatus = expired ? "expired" : "leased";

            const expiresAt = new Date(
              new Date(renewTimeStr).getTime() + duration * 1000
            );
            expiration = expiresAt.toISOString();
          } else {
            leaseStatus = "expired";
          }
        }
      }

      results.push({
        podName,
        ready,
        leaseStatus,
        holderIdentity,
        expiration,
      });
    }

    return results;
  }
}

export const sandboxService = new SandboxService();
