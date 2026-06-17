export class LeaseConflictError extends Error {
  constructor(
    message = "Lease acquisition conflict."
  ) {
    super(message);

    this.name = "LeaseConflictError";
  }

  get code() {
    return "lease_conflict";
  }
}