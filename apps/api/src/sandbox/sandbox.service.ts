import { leaseManager, LeaseManager } from "./lease-manager";
import { PiToolCall } from "../agent/types/agent.types";
import { ToolTimeoutError } from "../shared/errors/tool-timeout.error";
import { logger } from "../observability/logger/logger";

// We will dynamically import or declare the router to prevent circular dependency
// because tool router might import sandbox service in some architectures.
// We can pass toolRouterService as a dependency or resolve it at runtime.
import { toolRouterService, ToolRouterService } from "../tools/tool-router.service";

export class SandboxService {
  constructor(
    private readonly leaseMgr: LeaseManager = leaseManager,
    private readonly toolRouter: ToolRouterService = toolRouterService
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

      let timeoutId: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          logger.warn(
            { requestId, sessionId, toolCallId, pod: leasedPod },
            "sandbox.execution.timeout"
          );
          reject(new ToolTimeoutError());
        }, 30_000); // Tool Timeout: 30s
      });

      const result = await Promise.race([
        executionPromise,
        timeoutPromise,
      ]).finally(() => {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }
      });

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
}

export const sandboxService = new SandboxService();
