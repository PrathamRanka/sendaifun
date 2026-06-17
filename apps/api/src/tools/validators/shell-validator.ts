import { posix } from "path";
import { ALLOWED_FS_ROOT } from "../../shared/constants/sandbox.constants";
import { InvalidCommandError } from "../../shared/errors/invalid-command.error";

export class ShellValidator {
  validatePath(filePath: string): boolean {
    // Container OS is always Linux, so resolve and normalize path using posix rules
    let resolved: string;
    if (posix.isAbsolute(filePath)) {
      resolved = posix.normalize(filePath);
    } else {
      resolved = posix.resolve(ALLOWED_FS_ROOT, filePath);
    }

    // Prevent traversal escape
    const relative = posix.relative(ALLOWED_FS_ROOT, resolved);
    return !relative.startsWith("..") && !posix.isAbsolute(relative);
  }

  validateCommand(command: string): string[] {
    const trimmed = command.trim();
    if (trimmed === "pwd") {
      return ["pwd"];
    }
    if (trimmed === "whoami") {
      return ["whoami"];
    }
    if (trimmed === "node --version") {
      return ["node", "--version"];
    }

    const parts = trimmed.split(/\s+/);
    const baseCmd = parts[0];

    if (baseCmd === "ls") {
      // Validate all non-flag arguments as safe paths within ALLOWED_FS_ROOT
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (!part.startsWith("-")) {
          if (!this.validatePath(part)) {
            throw new InvalidCommandError(command);
          }
        }
      }
      return parts;
    }

    if (baseCmd === "cat") {
      if (parts.length < 2) {
        throw new InvalidCommandError(command);
      }
      // Validate file paths
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (!part.startsWith("-")) {
          if (!this.validatePath(part)) {
            throw new InvalidCommandError(command);
          }
        }
      }
      return parts;
    }

    throw new InvalidCommandError(command);
  }
}

export const shellValidator = new ShellValidator();
