import { ToolTimeoutError } from "../errors/tool-timeout.error";

export class TimeoutRunner {
  async runWithTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    onTimeout?: () => void
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        if (onTimeout) {
          onTimeout();
        }
        reject(new ToolTimeoutError());
      }, timeoutMs);
    });

    try {
      return await Promise.race([promise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
