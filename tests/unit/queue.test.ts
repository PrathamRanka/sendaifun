import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueueManager } from "../../apps/api/src/sandbox/queue-manager";
import { FifoQueue } from "../../apps/api/src/sandbox/fifo-queue";
import { SandboxCapacityError } from "../../apps/api/src/shared/errors/sandbox-capacity.error";

describe("RequestQueue Unit Tests", () => {
  let queue: QueueManager;

  beforeEach(() => {
    queue = new QueueManager(new FifoQueue());
  });

  it("should maintain strict FIFO ordering", () => {
    const order: string[] = [];
    
    queue.enqueue(
      "req-1",
      "sess-1",
      "tool-1",
      () => order.push("first"),
      () => {},
      5000
    );

    queue.enqueue(
      "req-2",
      "sess-2",
      "tool-2",
      () => order.push("second"),
      () => {},
      5000
    );

    const first = queue.dequeue();
    const second = queue.dequeue();

    first?.callback();
    second?.callback();

    expect(order).toEqual(["first", "second"]);
  });

  it("should trigger SandboxCapacityError when queue timeout is exceeded", async () => {
    vi.useFakeTimers();
    
    let caughtError: Error | null = null;
    
    queue.enqueue(
      "req-1",
      "sess-1",
      "tool-1",
      () => {},
      (err: Error) => {
        caughtError = err;
      },
      1000
    );

    expect(queue.isEmpty()).toBe(false);

    // Fast-forward time
    vi.advanceTimersByTime(1050);

    expect(caughtError).toBeInstanceOf(SandboxCapacityError);
    expect(queue.isEmpty()).toBe(true);

    vi.useRealTimers();
  });

  it("should clean up timeout when item is dequeued", () => {
    vi.useFakeTimers();
    const rejectSpy = vi.fn();

    queue.enqueue("req-1", "sess-1", "tool-1", () => {}, rejectSpy, 1000);
    
    // Dequeue before timeout
    queue.dequeue();

    // Advance time
    vi.advanceTimersByTime(1050);

    expect(rejectSpy).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});
