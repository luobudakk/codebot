import test from "node:test";
import assert from "node:assert/strict";

const fallback = "http://127.0.0.1:8787/api/v1";

test("api base fallback remains stable", () => {
  const actual = process.env.NEXT_PUBLIC_CSR_API_BASE_URL || fallback;
  assert.equal(actual.endsWith("/api/v1"), true);
});
