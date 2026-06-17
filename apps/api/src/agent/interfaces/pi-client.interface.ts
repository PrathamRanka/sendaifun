import { PiMessage, PiChatResponse } from "../types/agent.types";

export interface PiClient {
  chat(
    history: PiMessage[],
    message: string,
    requestId: string,
    sessionId: string
  ): Promise<PiChatResponse>;
}
