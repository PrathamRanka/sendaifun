import {
  AuthStorage,
  createAgentSession,
  defineTool,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { env } from "../../config/env";
import { PiClient } from "../interfaces/pi-client.interface";
import { PiMessage, PiChatResponse, PiToolCall } from "../types/agent.types";
import { logger } from "../../observability/logger/logger";
import { sandboxService } from "../../sandbox/services/sandbox.service";
import { Type } from "@sinclair/typebox";



// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SdkMessage = any;

function buildAssistantMessage(
  content: string,
  toolCalls?: PiToolCall[]
): SdkMessage {

  const contentBlocks: unknown[] = [];

  if (content) {
    contentBlocks.push({ type: "text", text: content });
  }

  if (toolCalls) {
    for (const tc of toolCalls) {
      contentBlocks.push({
        type: "toolCall",
        id: tc.id,
        name: tc.name,
        arguments: tc.arguments,
      });
    }
  }

  return {
    role: "assistant",
    content: contentBlocks,
    api: "google-generative-ai",
    provider: "google",
    model: "unknown",
    usage: {
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 0,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason: "stop",
    timestamp: Date.now(),
  };
}

function buildUserMessage(content: string): SdkMessage {
  return { role: "user", content, timestamp: Date.now() };
}

function buildToolResultMessage(
  toolCallId: string,
  toolName: string,
  response: unknown
): SdkMessage {
  let text: string;
  if (response === null || response === undefined) {
    text = "";
  } else if (typeof response === "string") {
    text = response;
  } else {
    text = JSON.stringify(response);
  }
  return {
    role: "toolResult",
    toolCallId,
    toolName,
    content: [{ type: "text", text }],
    isError: false,
    timestamp: Date.now(),
  };
}

export class RealPiClient implements PiClient {
  private readonly authStorage: AuthStorage;
  private readonly modelRegistry: ModelRegistry;

  constructor() {
    this.authStorage = AuthStorage.inMemory();
    this.authStorage.setRuntimeApiKey(env.PI_PROVIDER, env.PI_API_KEY);

    this.modelRegistry = ModelRegistry.inMemory(this.authStorage);
  }

  async chat(
    history: PiMessage[],
    message: string,
    requestId: string,
    sessionId: string
  ): Promise<PiChatResponse> {
    logger.info({ requestId, sessionId }, "pi.client.chat.started");

    const executedToolCalls: PiToolCall[] = [];
    const shellRunTool = defineTool({
      name: "shell_run",
      label: "Shell Run",
      description:
        "Execute a safe allowlisted shell command inside the sandbox pod.",
      parameters: Type.Object({
        command: Type.String({
          description:
            "The command to run. Only pwd, ls, cat, whoami, node --version are allowed.",
        }),
      }),
      execute: async (toolCallId, params) => {
        const piToolCall: PiToolCall = {
          id: toolCallId,
          name: "shell_run",
          arguments: { command: (params as { command: string }).command },
        };
        executedToolCalls.push(piToolCall);

        const result = await sandboxService.executeTool(
          requestId,
          sessionId,
          toolCallId,
          piToolCall
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: result,
        };
      },
    });

    const fsReadTool = defineTool({
      name: "fs_read",
      label: "Filesystem Read",
      description:
        "Read a file inside the /workspace directory in the sandbox pod.",
      parameters: Type.Object({
        path: Type.String({
          description:
            "The file path relative to /workspace (e.g. 'src/app.ts' or '/workspace/package.json').",
        }),
      }),
      execute: async (toolCallId, params) => {
        const piToolCall: PiToolCall = {
          id: toolCallId,
          name: "fs_read",
          arguments: { path: (params as { path: string }).path },
        };
        executedToolCalls.push(piToolCall);

        const result = await sandboxService.executeTool(
          requestId,
          sessionId,
          toolCallId,
          piToolCall
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: result,
        };
      },
    });

    const envInspectTool = defineTool({
      name: "env_inspect",
      label: "Environment Inspect",
      description:
        "Inspect the environment of the sandbox pod, including directories, user and runtime information.",
      parameters: Type.Object({}),
      execute: async (toolCallId) => {
        const piToolCall: PiToolCall = {
          id: toolCallId,
          name: "env_inspect",
          arguments: {},
        };
        executedToolCalls.push(piToolCall);

        const result = await sandboxService.executeTool(
          requestId,
          sessionId,
          toolCallId,
          piToolCall
        );
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          details: result,
        };
      },
    });

    const { session } = await createAgentSession({
      authStorage: this.authStorage,
      modelRegistry: this.modelRegistry,
      sessionManager: SessionManager.inMemory(),
      noTools: "builtin",
      customTools: [shellRunTool, fsReadTool, envInspectTool],
    });

    try {
      if (history.length > 0) {
        const sdkMessages: SdkMessage[] = [];

        for (const msg of history) {
          if (msg.role === "user") {
            sdkMessages.push(buildUserMessage(msg.content));
          } else if (msg.role === "model") {
            sdkMessages.push(
              buildAssistantMessage(msg.content, msg.toolCalls)
            );
          } else if (msg.role === "tool" && msg.toolResponse) {
            sdkMessages.push(
              buildToolResultMessage(
                msg.toolResponse.id,
                msg.toolResponse.name,
                msg.toolResponse.response
              )
            );
          }
        }

        session.state.messages = sdkMessages;
      }


      await session.prompt(message);

      const finalText = session.getLastAssistantText() ?? "";

      logger.info(
        {
          requestId,
          sessionId,
          hasToolCalls: executedToolCalls.length > 0,
          toolCallCount: executedToolCalls.length,
        },
        "pi.client.chat.completed"
      );

      return {
        message: finalText,
        // Preserve AgentService contract: toolCalls is undefined when empty.
        toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
      };
    } catch (error) {
      logger.error({ requestId, sessionId, error }, "pi.client.chat.failed");
      throw error;
    } finally {
      // Always dispose the session to release subscriptions and memory.
      session.dispose();
    }
  }
}

export const realPiClient = new RealPiClient();
