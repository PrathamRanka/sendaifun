# LeaseForge

A production-grade Kubernetes-Leased Sandbox Runtime for Pi Agents.

---

## 1. Project Overview

LeaseForge is a highly concurrent, layered TypeScript backend service designed to execute Pi Agent tool calls inside a fixed pool of Kubernetes sandbox pods. Rather than permanently assigning pods to users or chat sessions, LeaseForge treats pods as ephemeral, leaseable resources. 

The system coordinates a warm pool of **8 sandbox pods** and uses Kubernetes `Lease` objects as the distributed state mechanism for pod ownership. When a tool call is invoked, the runtime dynamically leases an available pod, runs the tool call securely inside the container namespace, terminates any orphaned processes, and immediately releases the lease back to the pool.

---

## 2. High-Level Architecture Diagram

The system adheres to a strict layered dependency structure flowing downwards:

```text
       ┌────────────────────────────────────────────────────────┐
       │                       Client / UI                      │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼ POST /api/chat
       ┌────────────────────────────────────────────────────────┐
       │                   Controller Layer                     │
       │  (chat.controller.ts, pod.controller.ts, etc.)         │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                    Agent Service                       │
       │  (Session history serialization, Pi Client SDK calls)   │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                    Tool Router                         │
       │  (Routes model tool calls to specific tool runtimes)   │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                   Sandbox Service                      │
       │  (Orchestrates lease lifecycle & timeout cleanups)    │
       └───────────────────────────┬────────────────────────────┘
                                   │
                                   ▼
       ┌────────────────────────────────────────────────────────┐
       │                    Lease Manager                       │
       │  (Coordinates lease acquisition & queue progression)   │
       └─────────────────┬───────────────────┬──────────────────┘
                         │                   │
                         ▼                   ▼
       ┌────────────────────┐     ┌─────────────────────┐
       │ Lease Acquirer     │     │ FIFO Queue Manager  │
       │ (Optimistic lock)  │     │ (In-memory backoff) │
       └─────────┬──────────┘     └─────────────────────┘
                 │
                 ▼
       ┌────────────────────────────────────────────────────────┐
       │               Kubernetes Repositories                  │
       │  (Direct read/writes to pods and coordination.k8s.io)   │
       └────────────────────────────────────────────────────────┐
```

---

## 3. Local Setup

### Prerequisites
* **Node.js**: `v20.x` or higher
* **npm**: `v10.x` or higher
* **Kubernetes Client**: Valid `kubeconfig` configured on your host machines.

### Installation
1. Clone the repository and navigate to the project directory:
   ```bash
   cd e:/sendaifun
   ```
2. Install the local project dependencies:
   ```bash
   npm install
   ```
3. Copy the template configuration environment file and update with your actual API key:
   ```bash
   cp .env.example .env
   ```

---

## 4. Kind Cluster Setup

If you are running and testing in a local developer sandbox environment, configure Kubernetes using **Kind** (Kubernetes in Docker):

1. **Create Kind Cluster**:
   ```bash
   kind create cluster --name leaseforge
   ```
2. **Ensure your context is configured**:
   ```bash
   kubectl cluster-info --context kind-leaseforge
   ```
3. **Verify docker images can be loaded**:
   To test deployment, build your API docker image locally and load it into the kind registry:
   ```bash
   docker build -t leaseforge-api:latest .
   kind load docker-image leaseforge-api:latest --name leaseforge
   ```

---

## 5. Kubernetes Deployment

To deploy LeaseForge into your cluster, apply the manifests in order from the `infra/kubernetes/` directory:

1. **Apply the Namespace**:
   ```bash
   kubectl apply -f infra/kubernetes/namespace.yaml
   ```
2. **Apply Security Account, Roles and Bindings**:
   ```bash
   kubectl apply -f infra/kubernetes/service-account.yaml
   kubectl apply -f infra/kubernetes/role.yaml
   kubectl apply -f infra/kubernetes/role-binding.yaml
   ```
3. **Apply Warm Pod pool and associated Leases**:
   ```bash
   kubectl apply -f infra/kubernetes/statefulset.yaml
   kubectl apply -f infra/kubernetes/leases.yaml
   ```
4. **Deploy the API Service and Secrets**:
   Create a Kubernetes secret containing your API Key:
   ```bash
   kubectl create secret generic leaseforge-secrets \
     --namespace=leaseforge \
     --from-literal=PI_API_KEY="your-gemini-api-key"
   ```
   Apply the API deployment and service:
   ```bash
   kubectl apply -f infra/kubernetes/deployment.yaml
   kubectl apply -f infra/kubernetes/service.yaml
   ```
5. **Access the API**:
   To access the API from your local host machine, forward port 3000:
   ```bash
   kubectl port-forward svc/leaseforge-api-service 3000:3000 -n leaseforge
   ```

---

## 6. Environment Variables

The application is configured using variables in `.env` or container environment contexts:

| Variable | Description | Default | Required |
| :--- | :--- | :--- | :--- |
| `NODE_ENV` | Application environment (`development`, `production`, `test`) | `development` | Yes |
| `PORT` | Local network port the server listens on | `3000` | Yes |
| `PI_API_KEY` | Your Pi SDK/Gemini API key | (None) | Yes |
| `PI_BASE_URL` | Base API target URL for the Pi SDK runtime | `https://generativelanguage.googleapis.com` | Yes |
| `KUBE_NAMESPACE` | Target namespace sandbox pods and leases reside in | `leaseforge` | Yes |
| `INSTANCE_ID` | Identity string of the API server instance | `api-1` | Yes |

*Note: The application will fail startup with a clear configuration validation schema exception if `PI_API_KEY` is empty or missing.*

---

## 7. Running the API

* **Development (Next.js Turbopack)**:
  ```bash
  npm run dev
  ```
* **Production Build**:
  ```bash
  npm run build
  ```
* **Production Start**:
  ```bash
  npm run start
  ```

---

## 8. Running Tests

LeaseForge uses **Vitest** for testing and **ESLint** for code checks.

* **Linting & Code Quality**:
  ```bash
  npm run lint
  ```
* **TypeScript Check**:
  ```bash
  npm run typecheck
  ```
* **Unit & Concurrency Tests**:
  ```bash
  npm test
  ```
* **Live Integration Tests**:
  ```bash
  cross-env RUN_INTEGRATION_TESTS=true npm run test:integration
  ```

---

## 9. Conceptual Models

### Lease Model
We map each of the 8 sandbox pods to a matching `Lease` object in Kubernetes (namespaced as `sandbox-runner-0` through `sandbox-runner-7`).
A lease is "acquired" when its `spec.holderIdentity` is set to a specific client requester sequence: `${instanceId}:${requestId}:${sessionId}:${toolCallId}`.

To guarantee that two concurrent threads never lease the same pod simultaneously, we use **Optimistic Concurrency Control (OCC)**. Every lease update includes the object's `metadata.resourceVersion`. If two requests compete for the same pod lease, the first update succeeds, and the second receives a `409 Conflict` from Kubernetes. The second request catches this conflict, discards the state, and immediately attempts to lock the next available pod.

### Queue Model
If all 8 sandbox pods are actively leased, requests are politely enqueued in an in-memory double-linked FIFO queue.
* **Wait Time limit**: Max queue wait duration is 15 seconds. If no lease becomes free in that window, the request is rejected with `SandboxCapacityError` (status code `503`).
* **Progressive Wakeups**: Upon a lease release, or if a dequeued/woken request fails to acquire the lease, the system automatically triggers the next queued entry. This guarantees the queue never deadlocks.

### Crash Recovery Model
If an API replica crashes while holding a lease, the lease will naturally expire. A lease is expired when:
`currentTime > spec.renewTime + spec.leaseDurationSeconds`
The system is entirely self-healing: any subsequent lease acquisition scan automatically identifies expired leases as "free" and reclaims/resets them on the fly.

### Tool Execution Flow
1. **Chat Request**: Client posts to `/api/chat`.
2. **Mutex Lock**: `SessionLockManager` locks the request per `sessionId` to prevent concurrent mutations of the session history array.
3. **Reasoning Loop**: The Pi SDK evaluates history and determines if tool execution is required.
4. **Lease Allocation**: If `shell_run` or other tools are called, the system obtains a sandbox pod lease (retrying or queueing as needed).
5. **Execution**: The command is executed inside the pod container.
6. **Timeout Guard**: Execution is bounded by a 30s timeout. If it times out, the service executes `kill -9 -1` inside the container namespace to kill any orphaned/leaked processes before releasing the lease.
7. **Release**: The lease is conditionally released back to the pool, and the next queued request is woken.

---

## 10. Example API Curl Commands

### 1. Execute Chat Message (POST /api/chat)
```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"sessionId": "test-session-1", "message": "List files in the current folder using tool calls."}'
```
**Response Output Example**:
```json
{
  "sessionId": "test-session-1",
  "message": "I found the following files in the directory...",
  "toolCalls": [
    {
      "id": "tc-12345",
      "name": "shell_run",
      "arguments": {
        "command": "ls -l"
      }
    }
  ]
}
```

### 2. Check Sandbox Pod Statuses (GET /api/pods)
```bash
curl http://localhost:3000/api/pods
```
**Response Output Example**:
```json
[
  {
    "podName": "sandbox-runner-0",
    "ready": true,
    "leaseStatus": "leased",
    "holderIdentity": "api-1:req-a:sess-a:tool-a",
    "expiration": "2026-06-17T18:20:45.000Z"
  },
  {
    "podName": "sandbox-runner-1",
    "ready": true,
    "leaseStatus": "free",
    "holderIdentity": null,
    "expiration": null
  }
]
```

### 3. Service Health (GET /api/health)
```bash
curl http://localhost:3000/api/health
```
**Response Output Example**:
```json
{
  "ok": true,
  "kubernetes": "connected",
  "sandboxPodsReady": 8
}
```

---

## 11. Concurrency Scenario: 9 Parallel Requests
If 9 requests are dispatched concurrently to the runtime:
1. Pods `sandbox-runner-0` through `sandbox-runner-7` are successfully locked by the first 8 requests.
2. The 9th request fails immediate acquisition, log logs `sandbox.queue.started`, and is pushed into the FIFO queue.
3. As soon as any of the first 8 requests completes its tool execution and runs `releaseLease`, its `wakeNext()` callback wakes the 9th request.
4. The 9th request grabs the newly freed pod lease and continues execution.
