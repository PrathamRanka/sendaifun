import { PodExecutor, podExecutor } from "../../kubernetes/repositories/pod-executor";
import { env } from "../../config/env";
import { POD_CONTAINER_NAME } from "../../shared/constants/sandbox.constants";

export class EnvTool {
  constructor(private readonly podExecutorInstance: PodExecutor = podExecutor) {}

  async inspect(podName: string): Promise<{
    podName: string;
    namespace: string;
    cwd: string;
    user: string;
    runtime: { node: string };
  }> {
    const namespace = env.KUBE_NAMESPACE;

    const cwdResult = await this.podExecutorInstance.execute(
      namespace,
      podName,
      POD_CONTAINER_NAME,
      ["pwd"]
    );

    const userResult = await this.podExecutorInstance.execute(
      namespace,
      podName,
      POD_CONTAINER_NAME,
      ["whoami"]
    );

    const nodeResult = await this.podExecutorInstance.execute(
      namespace,
      podName,
      POD_CONTAINER_NAME,
      ["node", "--version"]
    );

    return {
      podName,
      namespace,
      cwd: cwdResult.stdout.trim(),
      user: userResult.stdout.trim(),
      runtime: {
        node: nodeResult.stdout.trim(),
      },
    };
  }
}

export const envTool = new EnvTool();
