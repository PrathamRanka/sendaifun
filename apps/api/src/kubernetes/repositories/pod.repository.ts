import { V1Pod } from "@kubernetes/client-node";

import { kubeClient } from "../client/kube-client";

export class PodRepository {
  async getPod(
    namespace: string,
    podName: string
  ): Promise<V1Pod> {
    return await kubeClient.coreApi.readNamespacedPod({
      name: podName,
      namespace,
    });
  }

  async listPods(
    namespace: string
  ): Promise<V1Pod[]> {
    const response =
      await kubeClient.coreApi.listNamespacedPod({
        namespace,
      });

    return response.items ?? [];
  }

  async getReadyPods(
    namespace: string
  ): Promise<V1Pod[]> {
    const pods =
      await this.listPods(namespace);

    return pods.filter((pod) =>
      pod.status?.conditions?.some(
        (condition) =>
          condition.type === "Ready" &&
          condition.status === "True"
      )
    );
  }

  async executeCommand(
    namespace: string,
    podName: string,
    containerName: string,
    command: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { PassThrough } = await import("stream");
    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();

    let stdout = "";
    let stderr = "";

    stdoutStream.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    stderrStream.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    return new Promise((resolve) => {
      kubeClient.exec.exec(
        namespace,
        podName,
        containerName,
        command,
        stdoutStream,
        stderrStream,
        null, // stdin
        false, // tty
        (status) => {
          const exitCode = status?.status === "Success" ? 0 : (status?.code ? Number(status.code) : 1);
          resolve({
            stdout,
            stderr,
            exitCode,
          });
        }
      );
    });
  }
}

export const podRepository =
  new PodRepository();