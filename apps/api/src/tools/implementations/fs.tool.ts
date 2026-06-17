import { PodExecutor, podExecutor } from "../../kubernetes/repositories/pod-executor";
import { ShellValidator, shellValidator } from "../validators/shell-validator";
import { env } from "../../config/env";
import { posix } from "path";
import { ALLOWED_FS_ROOT, POD_CONTAINER_NAME } from "../../shared/constants/sandbox.constants";

export class FsTool {
  constructor(
    private readonly podExecutorInstance: PodExecutor = podExecutor,
    private readonly validator: ShellValidator = shellValidator
  ) {}

  async read(podName: string, path: string): Promise<string> {
    if (!this.validator.validatePath(path)) {
      throw new Error(`Unauthorized path access or path traversal: ${path}`);
    }

    let resolved: string;
    if (posix.isAbsolute(path)) {
      resolved = posix.normalize(path);
    } else {
      resolved = posix.resolve(ALLOWED_FS_ROOT, path);
    }

    const result = await this.podExecutorInstance.execute(
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
}

export const fsTool = new FsTool();
