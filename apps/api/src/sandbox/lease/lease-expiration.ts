import { V1Lease } from "@kubernetes/client-node";
import { isExpired } from "../../shared/utils/time";

export class LeaseExpiration {
  isLeaseExpired(lease: V1Lease): boolean {
    const holder = lease.spec?.holderIdentity;
    if (!holder) return true; // Free

    const renewTime = lease.spec?.renewTime;
    if (!renewTime) return true; // Free

    const duration = lease.spec?.leaseDurationSeconds ?? 45;
    const renewTimeStr =
      typeof renewTime === "string"
        ? renewTime
        : (renewTime as Date).toISOString();

    return isExpired(renewTimeStr, duration);
  }
}
