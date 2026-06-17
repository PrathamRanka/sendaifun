import { ToolCallId } from "../../shared/types/common.types";

export interface PiToolCall {
  id: ToolCallId;
  name: string;
  arguments: Record<string, unknown>;
}

export interface PiMessage {
  role: "user" | "model" | "tool";
  content: string;
  toolCalls?: PiToolCall[];
  toolResponse?: {
    id: ToolCallId;
    name: string;
    response: unknown;
  };
}

export interface PiChatResponse {
  message: string;
  toolCalls?: PiToolCall[];
}
