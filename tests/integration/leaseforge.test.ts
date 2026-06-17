import { describe, it, expect } from "vitest";
import { leaseRepository } from "../../apps/api/src/kubernetes/repositories/lease.repository";
import { env } from "../../apps/api/src/config/env";
import { sandboxService } from "../../apps/api/src/sandbox/sandbox.service";

describe("LeaseForge Cluster Integration Tests", () => {
  const runIntegration = process.env.RUN_INTEGRATION_TESTS === "true";

  it("should list real Lease objects and verify configuration", async () => {
    if (!runIntegration) {
      console.log("Skipping integration test: RUN_INTEGRATION_TESTS is not set to true.");
      return;
    }

    const namespace = env.KUBE_NAMESPACE;
    const leases = await leaseRepository.listLeases(namespace);
    expect(leases).toBeInstanceOf(Array);

    const runnerLeases = leases.filter((l) =>
      l.metadata?.name?.startsWith("sandbox-runner-")
    );
    expect(runnerLeases.length).toBe(8);
  });

  it("should execute tool calls in sandbox pods and get outputs", async () => {
    if (!runIntegration) {
      console.log("Skipping integration test: RUN_INTEGRATION_TESTS is not set to true.");
      return;
    }

    const requestId = "integ-req-1";
    const sessionId = "integ-sess-1";
    const toolCallId = "integ-tool-1";

    const result = (await sandboxService.executeTool(
      requestId,
      sessionId,
      toolCallId,
      {
        id: toolCallId,
        name: "shell_run",
        arguments: { command: "pwd" },
      }
    )) as { stdout: string; exitCode: number };

    expect(result).toBeDefined();
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe("/workspace");
  });
});
