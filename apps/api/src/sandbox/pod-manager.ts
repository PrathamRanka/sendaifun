import { V1Pod } from "@kubernetes/client-node";
import { PodRepository, podRepository } from "../kubernetes/repositories/pod.repository";

export class PodManager {
  constructor(private readonly podRepo: PodRepository = podRepository) {}

  async getReadyPods(namespace: string): Promise<V1Pod[]> {
    return this.podRepo.getReadyPods(namespace);
  }

  async listPods(namespace: string): Promise<V1Pod[]> {
    return this.podRepo.listPods(namespace);
  }
}

export const podManager = new PodManager();
