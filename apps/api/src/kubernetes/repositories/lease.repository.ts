import { V1Lease } from "@kubernetes/client-node";

import { kubeClient } from "../client/kube-client";

export class LeaseRepository {
  async getLease(
    namespace: string,
    leaseName: string
  ): Promise<V1Lease> {
    return await kubeClient.coordinationApi.readNamespacedLease({
      name: leaseName,
      namespace,
    });
  }

  async listLeases(
    namespace: string
  ): Promise<V1Lease[]> {
    const response =
      await kubeClient.coordinationApi.listNamespacedLease({
        namespace,
      });

    return response.items;
  }

  async updateLease(
    namespace: string,
    leaseName: string,
    lease: V1Lease
  ): Promise<V1Lease> {
    return await kubeClient.coordinationApi.replaceNamespacedLease({
      name: leaseName,
      namespace,
      body: lease,
    });
  }

  async patchLease(
    namespace: string,
    leaseName: string,
    patch: unknown
  ): Promise<V1Lease> {
    return await kubeClient.coordinationApi.patchNamespacedLease({
      name: leaseName,
      namespace,
      body: patch,
    });
  }
}

export const leaseRepository =
  new LeaseRepository();