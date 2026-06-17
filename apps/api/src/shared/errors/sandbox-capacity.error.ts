export class SandboxCapacityError extends Error {
  constructor(
    message = "No sandbox pod became available within 15 seconds."
  ) {
    super(message);

    this.name = "SandboxCapacityError";
  }

  get code() {
    return "sandbox_capacity_timeout";
  }
}