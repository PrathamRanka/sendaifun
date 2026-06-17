import {
  AuthStorage,
  createAgentSession,
  defineTool,
  ModelRegistry,
  SessionManager,
} from "@earendil-works/pi-coding-agent";
import { Type } from "@sinclair/typebox";
import { env } from "../../config/env";
import { PiClient } from "../interfaces/pi-client.interface";
import { PiChatResponse, PiMessage, PiToolCall } from "../types/agent.types";
import { logger } from "../../observability/logger/logger";
import { sandboxService } from "../../sandbox/services/sandbox.service";

function buildTranscript(history: PiMessage[], currentMessage: string): string {
  const lines: string[] = [];

  for (const msg of history) {
    if (msg.role === "user") {
      lines.push(`User: ${msg.content}`);
    } else if (msg.role === "model") {
      lines.push(`Assistant: ${msg.content}`);
    } else if (msg.role === "tool" && msg.toolResponse) {
      const responseText =
        msg.toolResponse.response === null ||
        msg.toolResponse.response === undefined
          ? ""
          : typeof msg.toolResponse.response === "string"
            ? msg.toolResponse.response
            : JSON.stringify(msg.toolResponse.response);
      lines.push(
        `Tool ${msg.toolResponse.name} Result:\n${responseText}`
      );
    }
  }

  lines.push(`User: ${currentMessage}`);
  return lines.join("\n\n");
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
          arguments: { command: params.command },
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
          arguments: { path: params.path },
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
      const prompt = buildTranscript(history, message);


      await session.prompt(prompt);

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
        toolCalls: executedToolCalls.length > 0 ? executedToolCalls : undefined,
      };
    } catch (error) {
      logger.error({ requestId, sessionId, error }, "pi.client.chat.failed");
      throw error;
    } finally {
      session.dispose();
    }
  }
}

export const realPiClient = new RealPiClient();
