import { GoogleGenAI, Type } from "@google/genai";
import { env } from "../../config/env";
import { PiClient } from "../interfaces/pi-client.interface";
import { PiMessage, PiChatResponse, PiToolCall } from "../types/agent.types";
import { logger } from "../../observability/logger/logger";
import { generateId } from "../../shared/utils/ids";

export class RealPiClient implements PiClient {
  private readonly client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({
      apiKey: env.PI_API_KEY,
      httpOptions: {
        baseUrl: env.PI_BASE_URL,
      },
    });
  }

  async chat(
    history: PiMessage[],
    message: string,
    requestId: string,
    sessionId: string
  ): Promise<PiChatResponse> {
    logger.info(
      { requestId, sessionId },
      "pi.client.chat.started"
    );

    const contents: Array<{
      role: string;
      parts: Array<{
        text?: string;
        functionCall?: {
          name: string;
          args: Record<string, unknown>;
        };
        functionResponse?: {
          name: string;
          response: Record<string, unknown>;
        };
      }>;
    }> = [];

    // Map history to Gemini content parts
    for (const msg of history) {
      if (msg.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === "model") {
        const parts: Array<{
          text?: string;
          functionCall?: {
            name: string;
            args: Record<string, unknown>;
          };
        }> = [];

        if (msg.content) {
          parts.push({ text: msg.content });
        }

        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }

        contents.push({
          role: "model",
          parts,
        });
      } else if (msg.role === "tool" && msg.toolResponse) {
        let responseObj: Record<string, unknown>;
        const rawResponse = msg.toolResponse.response;
        if (rawResponse !== null && typeof rawResponse === "object") {
          responseObj = rawResponse as Record<string, unknown>;
        } else {
          responseObj = { result: rawResponse };
        }

        contents.push({
          role: "tool",
          parts: [
            {
              functionResponse: {
                name: msg.toolResponse.name,
                response: responseObj,
              },
            },
          ],
        });
      }
    }

    // Append new message if present
    if (message) {
      contents.push({
        role: "user",
        parts: [{ text: message }],
      });
    }

    try {
      const response = await this.client.models.generateContent({
        model: "gemini-2.5-flash",
        contents,
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: "shell_run",
                  description:
                    "Execute a safe allowlisted shell command inside the sandbox pod.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      command: {
                        type: Type.STRING,
                        description:
                          "The command to run. Only pwd, ls, cat, whoami, node --version are allowed.",
                      },
                    },
                    required: ["command"],
                  },
                },
                {
                  name: "fs_read",
                  description:
                    "Read a file inside the /workspace directory in the sandbox pod.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      path: {
                        type: Type.STRING,
                        description:
                          "The file path relative to /workspace (e.g. 'src/app.ts' or '/workspace/package.json').",
                      },
                    },
                    required: ["path"],
                  },
                },
                {
                  name: "env_inspect",
                  description:
                    "Inspect the environment of the sandbox pod, including directories, user and runtime information.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {},
                  },
                },
              ],
            },
          ],
        },
      });

      const functionCalls = response.functionCalls;
      const toolCalls: PiToolCall[] = [];

      if (functionCalls && functionCalls.length > 0) {
        for (const fc of functionCalls) {
          if (fc.name) {
            toolCalls.push({
              id: generateId(),
              name: fc.name,
              arguments: (fc.args as Record<string, unknown>) ?? {},
            });
          }
        }
      }

      logger.info(
        {
          requestId,
          sessionId,
          hasToolCalls: toolCalls.length > 0,
        },
        "pi.client.chat.completed"
      );

      return {
        message: response.text ?? "",
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      };
    } catch (error) {
      logger.error(
        { requestId, sessionId, error },
        "pi.client.chat.failed"
      );
      throw error;
    }
  }
}

export const realPiClient = new RealPiClient();
