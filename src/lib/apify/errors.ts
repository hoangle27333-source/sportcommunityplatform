export class ScoutError extends Error {
  constructor(message: string, public code = 'PROVIDER_ERROR', public status = 502, public approvalUrl?: string) { super(message); }
}
export class PendingScout extends ScoutError {
  constructor() { super('Scout is still running', 'PENDING', 202); }
}
