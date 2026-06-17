import { posix } from "path";
import { podRepository } from "../kubernetes/repositories/pod.repository";
import { ALLOWED_FS_ROOT, POD_CONTAINER_NAME } from "../shared/constants/sandbox.constants";
import { InvalidCommandError } from "../shared/errors/invalid-command.error";
import { env } from "../config/env";
import { PiToolCall } from "../agent/types/agent.types";
import { logger } from "../observability/logger/logger";

export function validatePath(filePath: string): boolean {
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

export class ToolRouterService {
  async route(
    podName: string,
    toolCall: PiToolCall,
    requestId: string,
    sessionId: string
  ): Promise<unknown> {
    const name = toolCall.name;
    const args = toolCall.arguments;

    logger.info(
      { requestId, sessionId, toolCallId: toolCall.id, pod: podName, toolName: name },
      "tool.router.route.started"
    );

    try {
      if (name === "shell_run" || name === "shell.run") {
        const command = args.command as string;
        if (!command) {
          throw new Error("Missing 'command' argument for shell.run");
        }
        return await this.handleShellRun(podName, command);
      }

      if (name === "fs_read" || name === "fs.read") {
        const path = args.path as string;
        if (!path) {
          throw new Error("Missing 'path' argument for fs.read");
        }
        return await this.handleFsRead(podName, path);
      }

      if (name === "env_inspect" || name === "env.inspect") {
        return await this.handleEnvInspect(podName);
      }

      throw new Error(`Unknown tool: ${name}`);
    } catch (error) {
      logger.error(
        { requestId, sessionId, toolCallId: toolCall.id, pod: podName, error },
        "tool.router.route.failed"
      );
      throw error;
    }
  }

  private async handleShellRun(
    podName: string,
    command: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const trimmed = command.trim();
    if (trimmed === "pwd") {
      return await podRepository.executeCommand(
        env.KUBE_NAMESPACE,
        podName,
        POD_CONTAINER_NAME,
        ["pwd"]
      );
    }
    if (trimmed === "whoami") {
      return await podRepository.executeCommand(
        env.KUBE_NAMESPACE,
        podName,
        POD_CONTAINER_NAME,
        ["whoami"]
      );
    }
    if (trimmed === "node --version") {
      return await podRepository.executeCommand(
        env.KUBE_NAMESPACE,
        podName,
        POD_CONTAINER_NAME,
        ["node", "--version"]
      );
    }

    const parts = trimmed.split(/\s+/);
    const baseCmd = parts[0];

    if (baseCmd === "ls") {
      // Validate all non-flag arguments as safe paths within ALLOWED_FS_ROOT
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (!part.startsWith("-")) {
          if (!validatePath(part)) {
            throw new InvalidCommandError(command);
          }
        }
      }
      return await podRepository.executeCommand(
        env.KUBE_NAMESPACE,
        podName,
        POD_CONTAINER_NAME,
        parts
      );
    }

    if (baseCmd === "cat") {
      if (parts.length < 2) {
        throw new InvalidCommandError(command);
      }
      // Validate file paths
      for (let i = 1; i < parts.length; i++) {
        const part = parts[i];
        if (!part.startsWith("-")) {
          if (!validatePath(part)) {
            throw new InvalidCommandError(command);
          }
        }
      }
      return await podRepository.executeCommand(
        env.KUBE_NAMESPACE,
        podName,
        POD_CONTAINER_NAME,
        parts
      );
    }

    throw new InvalidCommandError(command);
  }

  private async handleFsRead(podName: string, path: string): Promise<string> {
    if (!validatePath(path)) {
      throw new Error(`Unauthorized path access or path traversal: ${path}`);
    }

    let resolved: string;
    if (posix.isAbsolute(path)) {
      resolved = posix.normalize(path);
    } else {
      resolved = posix.resolve(ALLOWED_FS_ROOT, path);
    }

    const result = await podRepository.executeCommand(
      env.KUBE_NAMESPACE,
      podName,
      POD_CONTAINER_NAME,
      ["cat", resolved]
    );

    if (result.exitCode !== 0) {
      throw new Error(`Failed to read file ${path}: ${result.stderr}`);
    }

    return result.stdout;
  }

  private async handleEnvInspect(podName: string): Promise<{
    podName: string;
    namespace: string;
    cwd: string;
    user: string;
    runtime: { node: string };
  }> {
    const cwdResult = await podRepository.executeCommand(
      env.KUBE_NAMESPACE,
      podName,
      POD_CONTAINER_NAME,
      ["pwd"]
    );

    const userResult = await podRepository.executeCommand(
      env.KUBE_NAMESPACE,
      podName,
      POD_CONTAINER_NAME,
      ["whoami"]
    );

    const nodeResult = await podRepository.executeCommand(
      env.KUBE_NAMESPACE,
      podName,
      POD_CONTAINER_NAME,
      ["node", "--version"]
    );

    return {
      podName,
      namespace: env.KUBE_NAMESPACE,
      cwd: cwdResult.stdout.trim(),
      user: userResult.stdout.trim(),
      runtime: {
        node: nodeResult.stdout.trim(),
      },
    };
  }
}

export const toolRouterService = new ToolRouterService();
