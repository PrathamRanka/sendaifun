import { z } from "zod";
import { agentService, AgentService } from "../../agent/services/agent.service";
import { generateRequestId } from "../../shared/utils/ids";
import { PiToolCall } from "../../agent/types/agent.types";

const chatRequestSchema = z.object({
  sessionId: z.string().min(1),
  message: z.string().min(1),
});

export class ChatController {
  constructor(private readonly agentServ: AgentService = agentService) {}

  async handle(body: unknown): Promise<{
    sessionId: string;
    message: string;
    toolCalls: PiToolCall[];
  }> {
    const { sessionId, message } = chatRequestSchema.parse(body);
    const requestId = generateRequestId();

    const result = await this.agentServ.chat(sessionId, message, requestId);

    return {
      sessionId,
      message: result.message,
      toolCalls: result.toolCalls,
    };
  }
}

export const chatController = new ChatController();
