export type UUID = string;

export type RequestId = string;

export type SessionId = string;

export type ToolCallId = string;

export type PodName = string;

export type LeaseName = string;

export type Timestamp = string;

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ErrorResponse;
}

export interface ErrorResponse {
  code: string;
  message: string;
}

export interface PaginationMeta {
  total: number;
  page: number;
  pageSize: number;
}

export interface BaseMetadata {
  requestId: RequestId;
  timestamp: Timestamp;
}

export interface LeaseOwner {
  instanceId: string;
  requestId: RequestId;
  sessionId: SessionId;
  toolCallId: ToolCallId;
}

export interface QueueItem<T = unknown> {
  id: string;
  payload: T;
  createdAt: number;
}

export interface ToolExecutionResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface TimeoutConfig {
  timeoutMs: number;
}

export interface RetryConfig {
  retries: number;
  delayMs: number;
}

export enum LeaseStatus {
  FREE = "free",
  LEASED = "leased",
  EXPIRED = "expired",
}

export enum ToolExecutionStatus {
  PENDING = "pending",
  RUNNING = "running",
  COMPLETED = "completed",
  FAILED = "failed",
  TIMED_OUT = "timed_out",
}

export enum QueueStatus {
  WAITING = "waiting",
  ACQUIRED = "acquired",
  EXPIRED = "expired",
}