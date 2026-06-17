import { PiClient } from "../interfaces/pi-client.interface";
import { realPiClient } from "../clients/real-pi.client";
import { sandboxService, SandboxService } from "../../sandbox/services/sandbox.service";
import { PiMessage, PiToolCall } from "../types/agent.types";
import { logger } from "../../observability/logger/logger";
export class SessionLockManager {
  private readonly locks = new Map<string, Promise<unknown>>();

  async acquire<T>(sessionId: string, fn: () => Promise<T>): Promise<T> {
    const existing = this.locks.get(sessionId) ?? Promise.resolve();

    const nextPromise = (async () => {
      try {
        await existing;
      } catch {
        // Ignore previous execution failures to let subsequent queued requests run
      }
      return fn();
    })();

    this.locks.set(sessionId, nextPromise);

    try {
      return await nextPromise;
    } finally {
      // Clean up mapping if we are still the latest promise in the chain to avoid memory leaks
      if (this.locks.get(sessionId) === nextPromise) {
        this.locks.delete(sessionId);
      }
    }
  }
}

export class AgentService {
  private readonly historyMap = new Map<string, PiMessage[]>();

  constructor(
    private readonly piClient: PiClient = realPiClient,
    private readonly sandbox: SandboxService = sandboxService,
    private readonly sessionLocks: SessionLockManager = new SessionLockManager()
  ) {}

  getHistory(sessionId: string): PiMessage[] {
    return this.historyMap.get(sessionId) ?? [];
  }

  clearHistory(sessionId: string): void {
    this.historyMap.delete(sessionId);
  }

  async chat(
    sessionId: string,
    message: string,
    requestId: string
  ): Promise<{ message: string; toolCalls: PiToolCall[] }> {
    return this.sessionLocks.acquire(sessionId, async () => {
      logger.info(
        { requestId, sessionId },
        "chat.request.started"
      );

      const history = this.historyMap.get(sessionId) ?? [];
      const executedToolCalls: PiToolCall[] = [];
      let turnCount = 0;
      let currentInput: string | undefined = message;

      try {
        while (turnCount < 5) {
          // Send to Pi Client
          const response = await this.piClient.chat(
            history,
            currentInput ?? "",
            requestId,
            sessionId
          );

          if (currentInput) {
            history.push({ role: "user", content: currentInput });
            currentInput = undefined; // Clear so we don't repeat user message
          }

          if (!response.toolCalls || response.toolCalls.length === 0) {
            // Final response from the agent
            history.push({ role: "model", content: response.message });
            this.historyMap.set(sessionId, history);

            logger.info(
              { requestId, sessionId },
              "chat.request.completed"
            );

            return {
              message: response.message,
              toolCalls: executedToolCalls,
            };
          }

          // Model requested one or more tool calls
          history.push({
            role: "model",
            content: response.message,
            toolCalls: response.toolCalls,
          });

          executedToolCalls.push(...response.toolCalls);

          // Execute tool calls in parallel
          const toolResponses = await Promise.all(
            response.toolCalls.map(async (tc) => {
              try {
                const result = await this.sandbox.executeTool(
                  requestId,
                  sessionId,
                  tc.id,
                  tc
                );
                return {
                  id: tc.id,
                  name: tc.name,
                  response: result,
                  error: null,
                };
              } catch (error) {
                const err = error as { message?: string };
                return {
                  id: tc.id,
                  name: tc.name,
                  response: null,
                  error: err.message ?? String(error),
                };
              }
            })
          );

          // Append tool results to history
          for (const res of toolResponses) {
            history.push({
              role: "tool",
              content: "",
              toolResponse: {
                id: res.id,
                name: res.name,
                response: res.error ? { error: res.error } : res.response,
              },
            });
          }

          turnCount++;
        }

        throw new Error("Exceeded maximum agent reasoning turns limit.");
      } catch (error) {
        logger.error(
          { requestId, sessionId, error },
          "chat.request.failed"
        );
        throw error;
      }
    });
  }
}

export const agentService = new AgentService();
