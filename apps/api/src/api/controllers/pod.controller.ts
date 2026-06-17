import { sandboxService, SandboxService } from "../../sandbox/sandbox.service";

export class PodController {
  constructor(
    private readonly sandboxServ: SandboxService = sandboxService
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
    return this.sandboxServ.getSandboxStatuses();
  }
}

export const podController = new PodController();
