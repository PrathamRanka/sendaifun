import * as k8s from "@kubernetes/client-node";

class KubernetesClient {
  private readonly kubeConfig: k8s.KubeConfig;

  public readonly coreApi: k8s.CoreV1Api;

  public readonly coordinationApi: k8s.CoordinationV1Api;

  public readonly exec: k8s.Exec;

  constructor() {
    this.kubeConfig = new k8s.KubeConfig();

    this.kubeConfig.loadFromDefault();

    this.coreApi =
      this.kubeConfig.makeApiClient(
        k8s.CoreV1Api
      );

    this.coordinationApi =
      this.kubeConfig.makeApiClient(
        k8s.CoordinationV1Api
      );

    this.exec = new k8s.Exec(
      this.kubeConfig
    );
  }
}

export const kubeClient =
  new KubernetesClient();