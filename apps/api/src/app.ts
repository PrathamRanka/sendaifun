import { logger } from "./observability/logger/logger";
import { env } from "./config/env";

export function startup() {
  logger.info(
    {
      env: env.NODE_ENV,
      port: env.PORT,
      namespace: env.KUBE_NAMESPACE,
      instanceId: env.INSTANCE_ID,
    },
    "leaseforge.startup"
  );
}
