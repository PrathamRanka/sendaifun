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
}

export const podRepository = new PodRepository();