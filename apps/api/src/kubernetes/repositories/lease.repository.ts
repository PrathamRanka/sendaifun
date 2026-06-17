import { V1Lease } from "@kubernetes/client-node";

import { kubeClient } from "../client/kube-client";

export class LeaseRepository {
  async getLease(
    namespace: string,
    leaseName: string
  ): Promise<V1Lease> {
    const response =
      await kubeClient.coordinationApi.readNamespacedLease(
        leaseName,
        namespace
      );

    return response.body;
  }

  async listLeases(
    namespace: string
  ): Promise<V1Lease[]> {
    const response =
      await kubeClient.coordinationApi.listNamespacedLease(
        namespace
      );

    return response.body.items;
  }

  async updateLease(
    namespace: string,
    leaseName: string,
    lease: V1Lease
  ): Promise<V1Lease> {
    const response =
      await kubeClient.coordinationApi.replaceNamespacedLease(
        leaseName,
        namespace,
        lease
      );

    return response.body;
  }

  async patchLease(
    namespace: string,
    leaseName: string,
    patch: unknown
  ): Promise<V1Lease> {
    const response =
      await kubeClient.coordinationApi.patchNamespacedLease(
        leaseName,
        namespace,
        patch,
        undefined,
        undefined,
        undefined,
        undefined,
        {
          headers: {
            "Content-Type":
              "application/merge-patch+json",
          },
        }
      );

    return response.body;
  }
}

export const leaseRepository =
  new LeaseRepository();