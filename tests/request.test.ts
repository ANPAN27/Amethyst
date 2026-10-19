import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { NextRequest } from "next/server";
import { getPagination, parseJson } from "@/lib/api/request";

function fakeRequest(body: string, headers: Record<string, string> = {}): NextRequest {
  return {
    headers: new Headers({ "content-type": "application/json", ...headers }),
    body: new Response(body).body,
  } as unknown as NextRequest;
}

const schema = z.object({ value: z.number() });

describe("JSON request parsing", () => {
  it("parses a valid JSON body", async () => {
    await expect(parseJson(fakeRequest('{"value":1}'), schema)).resolves.toEqual({ value: 1 });
  });

  it("rejects an oversized stream even without a content-length header", async () => {
    await expect(parseJson(fakeRequest('{"value":12345}'), schema, 10)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("rejects an oversized declared content-length early", async () => {
    await expect(
      parseJson(fakeRequest('{"value":1}', { "content-length": "100" }), schema, 10),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("rejects the wrong content type and malformed JSON", async () => {
    await expect(
      parseJson(fakeRequest('{"value":1}', { "content-type": "text/plain" }), schema),
    ).rejects.toMatchObject({ status: 415 });
    await expect(parseJson(fakeRequest("{"), schema)).rejects.toMatchObject({ status: 400 });
  });
});

describe("pagination parsing", () => {
  it("uses defaults and accepts integers", () => {
    expect(getPagination(new URLSearchParams())).toEqual({ limit: 50, offset: 0 });
    expect(getPagination(new URLSearchParams("limit=10&offset=5"))).toEqual({ limit: 10, offset: 5 });
  });

  it("rejects non-integer and out-of-range values", () => {
    expect(() => getPagination(new URLSearchParams("limit=10x"))).toThrow();
    expect(() => getPagination(new URLSearchParams("limit=0"))).toThrow();
    expect(() => getPagination(new URLSearchParams("offset=-1"))).toThrow();
    expect(() => getPagination(new URLSearchParams("limit=201"))).toThrow();
  });
});
