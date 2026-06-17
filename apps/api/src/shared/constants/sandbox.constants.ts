export const SANDBOX_NAMESPACE = "leaseforge";

export const SANDBOX_POOL_SIZE = 8;

export const LEASE_DURATION_SECONDS = 45;

export const TOOL_EXECUTION_TIMEOUT_MS = 30_000;

export const QUEUE_WAIT_TIMEOUT_MS = 15_000;

export const LEASE_RETRY_COUNT = 3;

export const LEASE_RETRY_DELAY_MS = 200;

export const SANDBOX_POD_PREFIX = "sandbox-runner";

export const ALLOWED_SHELL_COMMANDS = [
  "pwd",
  "ls",
  "cat",
  "whoami",
  "node --version",
] as const;

export const ALLOWED_FS_ROOT = "/workspace";

export const POD_CONTAINER_NAME = "sandbox";

export const LEASE_API_GROUP =
  "coordination.k8s.io/v1";