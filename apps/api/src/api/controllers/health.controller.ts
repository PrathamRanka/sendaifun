import { sandboxService, SandboxService } from "../../sandbox/sandbox.service";

export class HealthController {
  constructor(private readonly sandboxServ: SandboxService = sandboxService) {}

  async handle(): Promise<{
    ok: boolean;
    kubernetes: "connected" | "disconnected";
    sandboxPodsReady: number;
  }> {
    return this.sandboxServ.getHealth();
  }
}

export const healthController = new HealthController();
