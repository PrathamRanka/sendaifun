import { podRepository, PodRepository } from "../../kubernetes/repositories/pod.repository";
import { leaseRepository, LeaseRepository } from "../../kubernetes/repositories/lease.repository";
import { env } from "../../config/env";
import { isExpired } from "../../shared/utils/time";

export class PodController {
  constructor(
    private readonly podRepo: PodRepository = podRepository,
    private readonly leaseRepo: LeaseRepository = leaseRepository
  ) {}

  async handle(): Promise<
    Array<{
      podName: string;
      ready: boolean;
      leaseStatus: "free" | "leased" | "expired";
      holderIdentity: string | null;
      expiration: string | null;
    }>
  > {
    const namespace = env.KUBE_NAMESPACE;

    const [pods, leases] = await Promise.all([
      this.podRepo.listPods(namespace),
      this.leaseRepo.listLeases(namespace),
    ]);

    const results: Array<{
      podName: string;
      ready: boolean;
      leaseStatus: "free" | "leased" | "expired";
      holderIdentity: string | null;
      expiration: string | null;
    }> = [];

    for (let i = 0; i < 8; i++) {
      const podName = `sandbox-runner-${i}`;
      const pod = pods.find((p) => p.metadata?.name === podName);
      const lease = leases.find((l) => l.metadata?.name === podName);

      const ready =
        pod?.status?.conditions?.some(
          (c) => c.type === "Ready" && c.status === "True"
        ) ?? false;

      let leaseStatus: "free" | "leased" | "expired" = "free";
      let holderIdentity: string | null = null;
      let expiration: string | null = null;

      if (lease?.spec) {
        holderIdentity = lease.spec.holderIdentity ?? null;
        if (holderIdentity) {
          const renewTime = lease.spec.renewTime;
          const duration = lease.spec.leaseDurationSeconds ?? 45;

          if (renewTime) {
            const renewTimeStr =
              typeof renewTime === "string"
                ? renewTime
                : (renewTime as Date).toISOString();

            const expired = isExpired(renewTimeStr, duration);
            leaseStatus = expired ? "expired" : "leased";

            const expiresAt = new Date(
              new Date(renewTimeStr).getTime() + duration * 1000
            );
            expiration = expiresAt.toISOString();
          } else {
            leaseStatus = "expired";
          }
        }
      }

      results.push({
        podName,
        ready,
        leaseStatus,
        holderIdentity,
        expiration,
      });
    }

    return results;
  }
}

export const podController = new PodController();
