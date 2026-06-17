import { FifoQueue, QueueNode } from "./fifo-queue";
import { SandboxCapacityError } from "../../shared/errors/sandbox-capacity.error";

export class QueueManager {
  constructor(private readonly queue: FifoQueue = new FifoQueue()) {}

  enqueue(
    requestId: string,
    sessionId: string,
    toolCallId: string,
    callback: () => void,
    reject: (err: Error) => void,
    timeoutMs: number
  ): QueueNode {
    const node: QueueNode = {
      requestId,
      sessionId,
      toolCallId,
      callback,
      reject,
    };

    node.timeoutId = setTimeout(() => {
      this.queue.remove(node);
      reject(new SandboxCapacityError());
    }, timeoutMs);

    this.queue.enqueue(node);
    return node;
  }

  dequeue(): QueueNode | undefined {
    const node = this.queue.dequeue();
    if (node && node.timeoutId) {
      clearTimeout(node.timeoutId);
    }
    return node;
  }

  isEmpty(): boolean {
    return this.queue.isEmpty();
  }

  getSize(): number {
    return this.queue.getSize();
  }

  clear(): void {
    const nodes = this.queue.clear();
    for (const node of nodes) {
      if (node.timeoutId) {
        clearTimeout(node.timeoutId);
      }
    }
  }
}
