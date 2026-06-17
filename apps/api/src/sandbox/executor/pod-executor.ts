import { ExecClient, execClient } from "./exec-client";

export class PodExecutor {
  constructor(private readonly client: ExecClient = execClient) {}

  async execute(
    namespace: string,
    podName: string,
    containerName: string,
    command: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    return this.client.exec(namespace, podName, containerName, command);
  }
}

export const podExecutor = new PodExecutor();
