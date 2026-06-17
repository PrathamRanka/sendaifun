import { podRepository, PodRepository } from "../../kubernetes/repositories/pod.repository";
import { env } from "../../config/env";

export class HealthController {
  constructor(private readonly podRepo: PodRepository = podRepository) {}

  async handle(): Promise<{
    ok: boolean;
    kubernetes: "connected" | "disconnected";
    sandboxPodsReady: number;
  }> {
    try {
      const namespace = env.KUBE_NAMESPACE;
      const readyPods = await this.podRepo.getReadyPods(namespace);

      const sandboxPods = readyPods.filter((p) =>
        p.metadata?.name?.startsWith("sandbox-runner-")
      );

      return {
        ok: true,
        kubernetes: "connected",
        sandboxPodsReady: sandboxPods.length,
      };
    } catch (error) {
      return {
        ok: false,
        kubernetes: "disconnected",
        sandboxPodsReady: 0,
      };
    }
  }
}

export const healthController = new HealthController();
