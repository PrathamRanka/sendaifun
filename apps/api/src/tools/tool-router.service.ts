import { ToolRegistry, toolRegistry } from "./tool-registry";
import { PiToolCall } from "../agent/types/agent.types";
import { logger } from "../observability/logger/logger";

export class ToolRouterService {
  constructor(private readonly registry: ToolRegistry = toolRegistry) {}

  async route(
    podName: string,
    toolCall: PiToolCall,
    requestId: string,
    sessionId: string
  ): Promise<unknown> {
    const name = toolCall.name;
    const args = toolCall.arguments ?? {};

    logger.info(
      { requestId, sessionId, toolCallId: toolCall.id, pod: podName, toolName: name },
      "tool.router.route.started"
    );

    try {
      const tool = this.registry.get(name);
      if (!tool) {
        throw new Error(`Unknown tool: ${name}`);
      }

      return await tool.execute(podName, args);
    } catch (error) {
      logger.error(
        { requestId, sessionId, toolCallId: toolCall.id, pod: podName, error },
        "tool.router.route.failed"
      );
      throw error;
    }
  }
}

export const toolRouterService = new ToolRouterService();
