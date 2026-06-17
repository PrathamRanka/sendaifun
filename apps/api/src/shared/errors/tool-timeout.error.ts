export class ToolTimeoutError extends Error {
  constructor(
    message = "Tool execution timed out."
  ) {
    super(message);

    this.name = "ToolTimeoutError";
  }

  get code() {
    return "tool_timeout";
  }
}