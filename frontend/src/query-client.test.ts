/**
 * When a failed query is worth trying again.
 *
 * Retrying an answer the server deliberately gave — not enough resources, queue busy — only delays the message the
 * screen is about to show, and multiplies the load exactly when the server is already refusing work.
 */
import { ApiError } from "@/src/api/client";
import { queryClient } from "@/src/query-client";

type RetryFn = (attempt: number, error: unknown) => boolean;

const shouldRetry = queryClient.getDefaultOptions().queries!.retry as RetryFn;

const apiError = (status: number, code: string) => new ApiError(status, { code, message: code });

describe("retry policy", () => {
  it("retries when no answer came back at all", () => {
    expect(shouldRetry(0, apiError(0, "NETWORK_ERROR"))).toBe(true);
    expect(shouldRetry(0, apiError(0, "TIMEOUT"))).toBe(true);
  });

  it("retries a server fault, which is usually transient", () => {
    expect(shouldRetry(0, apiError(500, "INTERNAL_ERROR"))).toBe(true);
    expect(shouldRetry(0, apiError(503, "UNAVAILABLE"))).toBe(true);
  });

  it("accepts a refusal as the answer it is", () => {
    for (const [status, code] of [
      [400, "VALIDATION_ERROR"],
      [401, "UNAUTHORIZED"],
      [403, "FORBIDDEN"],
      [404, "SETTLEMENT_NOT_FOUND"],
      [409, "INSUFFICIENT_RESOURCES"],
      [429, "TOO_MANY_REQUESTS"],
    ] as const) {
      expect(shouldRetry(0, apiError(status, code))).toBe(false);
    }
  });

  it("gives up after two retries instead of hammering a server that keeps failing", () => {
    expect(shouldRetry(1, apiError(0, "TIMEOUT"))).toBe(true);
    expect(shouldRetry(2, apiError(0, "TIMEOUT"))).toBe(false);
  });

  it("retries a plain crash, which carries no verdict from the server", () => {
    expect(shouldRetry(0, new TypeError("undefined is not an object"))).toBe(true);
  });
});
