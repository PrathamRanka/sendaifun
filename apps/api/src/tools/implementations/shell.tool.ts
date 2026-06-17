import { PodExecutor, podExecutor } from "../../kubernetes/repositories/pod-executor";
import { ShellValidator, shellValidator } from "../validators/shell-validator";
import { env } from "../../config/env";
import { POD_CONTAINER_NAME } from "../../shared/constants/sandbox.constants";

export class ShellTool {
  constructor(
    private readonly podExecutorInstance: PodExecutor = podExecutor,
    private readonly validator: ShellValidator = shellValidator
  ) {}

  async run(
    podName: string,
    command: string
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const parts = this.validator.validateCommand(command);
    return this.podExecutorInstance.execute(
      env.KUBE_NAMESPACE,
      podName,
      POD_CONTAINER_NAME,
      parts
    );
  }
}

export const shellTool = new ShellTool();
