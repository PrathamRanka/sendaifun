export class InvalidCommandError extends Error {
  constructor(
    command: string
  ) {
    super(`Command '${command}' is not allowlisted.`);

    this.name = "InvalidCommandError";
  }

  get code() {
    return "invalid_command";
  }
}