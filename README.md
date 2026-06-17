# LeaseForge

A Kubernetes-Leased Sandbox Runtime for Pi Agents.

## Overview

LeaseForge is a TypeScript backend service that executes Pi Agent tool calls inside a fixed pool of Kubernetes sandbox pods.

The system maintains exactly 8 warm sandbox pods and uses Kubernetes Lease objects as the source of truth for pod ownership.

Sandbox pods are never permanently assigned to users or sessions.

Instead:

1. A tool call arrives.
2. The system acquires an available Lease.
3. The corresponding sandbox pod is leased.
4. The tool executes.
5. The Lease is released immediately.

If all sandbox pods are busy, requests enter a bounded FIFO queue and wait for capacity.

The design prioritizes:

* Correct concurrency control
* Crash recovery
* Kubernetes-native coordination
* Clear observability
* Safe sandbox execution

---

# High Level Architecture

┌───────────────────────┐
│      Client           │
└──────────┬────────────┘
│
▼
┌───────────────────────┐
│      POST /chat       │
└──────────┬────────────┘
│
▼
┌───────────────────────┐
│     Agent Service     │
│     (Pi SDK)          │
└──────────┬────────────┘
│
▼
┌───────────────────────┐
│    Tool Router        │
└──────────┬────────────┘
│
▼
┌───────────────────────┐
│   Sandbox Service     │
└──────────┬────────────┘
│
▼
┌───────────────────────┐
│    Lease Manager      │
└──────────┬────────────┘
│
▼
┌───────────────────────┐
│ Kubernetes Leases     │
└──────────┬────────────┘
│
▼
┌───────────────────────┐
│ Sandbox Pods (8)      │
└───────────────────────┘

---

# Sandbox Pool

The system owns a fixed StatefulSet.

sandbox-runner-0
sandbox-runner-1
sandbox-runner-2
sandbox-runner-3
sandbox-runner-4
sandbox-runner-5
sandbox-runner-6
sandbox-runner-7

Each pod has a matching Lease object.

## Lease Name                  Pod

sandbox-runner-0      ->    sandbox-runner-0
sandbox-runner-1      ->    sandbox-runner-1
sandbox-runner-2      ->    sandbox-runner-2
sandbox-runner-3      ->    sandbox-runner-3
sandbox-runner-4      ->    sandbox-runner-4
sandbox-runner-5      ->    sandbox-runner-5
sandbox-runner-6      ->    sandbox-runner-6
sandbox-runner-7      ->    sandbox-runner-7

---

# Lease Lifecycle

Tool Request
│
▼
Acquire Lease
│
▼
Execute Tool
│
▼
Release Lease

A Lease contains:

* service instance id
* request id
* session id
* tool call id
* expiration timestamp

Example holder identity:

api-1:req-123:session-abc:tool-xyz

---

# Lease Acquisition Algorithm

1. Read all Lease objects.
2. Identify free or expired Leases.
3. Attempt Lease acquisition using optimistic concurrency.
4. Update holderIdentity.
5. Update renewTime.
6. Set leaseDurationSeconds.

If a conflict occurs:

1. Kubernetes returns 409 Conflict.
2. Retry another Lease.
3. Repeat until success or exhaustion.

This guarantees that two tool calls can never lease the same pod simultaneously.

---

# Lease Expiration

Leases automatically recover from API crashes.

A Lease is considered expired when:

currentTime >
renewTime + leaseDurationSeconds

Expired Leases are immediately reusable.

No manual cleanup is required.

---

# Queueing Model

When all 8 pods are leased:

Tool Call
│
▼
FIFO Queue
│
▼
Wait For Capacity

Properties:

* FIFO ordering
* Max wait time = 15 seconds
* Process-local queue
* Automatic wake-up on Lease release

If capacity does not become available:

sandbox_capacity_timeout

is returned.

---

# Tool Execution Model

Tool Request
│
▼
Lease Pod
│
▼
Execute In Pod
│
▼
Collect Output
│
▼
Release Lease

Tool execution timeout:

30 seconds

Lease duration:

45 seconds

---

# Supported Tools

shell.run

Allowed commands:

* pwd
* ls
* cat
* whoami
* node --version

Arbitrary shell execution is prohibited.

---

fs.read

Reads files inside an allowlisted root.

Protected against:

* path traversal
* absolute path escape
* unauthorized reads

---

env.inspect

Returns:

* pod name
* namespace
* user
* cwd
* runtime versions

---

# Concurrency Guarantees

The system guarantees:

✓ No pod double-assignment

✓ Lease conflict safety

✓ Automatic crash recovery

✓ FIFO queue ordering

✓ Timeout cleanup

✓ Lease release on failures

---

# Failure Handling

Tool Failure

Tool throws error
│
▼
Release Lease
│
▼
Return Failure

---

Tool Timeout

Tool exceeds 30 seconds
│
▼
Cancel Execution
│
▼
Release Lease
│
▼
Return Timeout

---

API Crash

Process crashes
│
▼
Lease expires
│
▼
Future request recovers pod

---

# Production Evolution

The current implementation uses a process-local queue.

For multi-replica deployments:

Replace FIFO Queue with:

* Redis Streams
* Kafka
* NATS JetStream
* Temporal

Lease renewals should become heartbeat-based.

Execution history should be persisted to PostgreSQL.

Prometheus metrics should track:

* lease acquisition latency
* lease conflicts
* queue length
* queue wait time
* tool failures
* tool timeouts

Sandbox images should be hardened and network isolated.
