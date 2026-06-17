import { kubeClient } from "./kube-client";
import { PassThrough } from "stream";

export class ExecClient {
  async exec(
    namespace: string,
    podName: string,
    containerName: string,
    command: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
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
          const exitCode =
            status?.status === "Success"
              ? 0
              : status?.code
              ? Number(status.code)
              : 1;
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

export const execClient = new ExecClient();
