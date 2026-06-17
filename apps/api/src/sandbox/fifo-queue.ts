export interface QueueNode {
  requestId: string;
  sessionId: string;
  toolCallId: string;
  callback: () => void;
  reject: (err: Error) => void;
  timeoutId?: NodeJS.Timeout;
  next?: QueueNode;
  prev?: QueueNode;
}

export class FifoQueue {
  private head?: QueueNode;
  private tail?: QueueNode;
  private size: number = 0;

  enqueue(node: QueueNode): void {
    if (!this.tail) {
      this.head = node;
      this.tail = node;
    } else {
      this.tail.next = node;
      node.prev = this.tail;
      this.tail = node;
    }
    this.size++;
  }

  dequeue(): QueueNode | undefined {
    if (!this.head) return undefined;
    const node = this.head;
    this.head = node.next;
    if (this.head) {
      this.head.prev = undefined;
    } else {
      this.tail = undefined;
    }
    node.next = undefined;
    node.prev = undefined;
    this.size--;
    return node;
  }

  remove(node: QueueNode): void {
    // Check if node is in the queue
    let current = this.head;
    let found = false;
    while (current) {
      if (current === node) {
        found = true;
        break;
      }
      current = current.next;
    }
    if (!found) return;

    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    node.next = undefined;
    node.prev = undefined;
    this.size--;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  getSize(): number {
    return this.size;
  }

  clear(): QueueNode[] {
    const nodes: QueueNode[] = [];
    let current = this.head;
    while (current) {
      nodes.push(current);
      current = current.next;
    }
    this.head = undefined;
    this.tail = undefined;
    this.size = 0;
    return nodes;
  }
}
