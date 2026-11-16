import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { DELETE } from "../../web/app/api/[...path]/route";

afterEach(() => vi.unstubAllGlobals());

describe("web API proxy task deletion", () => {
  it("forwards 204 without constructing a response body", async () => {
    const upstream = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", upstream);
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/tasks/task-1", {
        method: "DELETE",
        headers: { cookie: "taskdesk_session=test-token; taskdesk_organization=firm-1" },
      }),
      { params: Promise.resolve({ path: ["tasks", "task-1"] }) },
    );
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(await response.text()).toBe("");
    const [url, options] = upstream.mock.calls[0];
    expect(url.pathname).toBe("/tasks/task-1");
    expect(url.searchParams.get("organizationId")).toBe("firm-1");
    expect(options.method).toBe("DELETE");
    expect(options.headers.get("authorization")).toBe("Bearer test-token");
  });

  it("preserves deletion error status and JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      Response.json({ error: "Task not found" }, { status: 404 }),
    ));
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/tasks/missing", { method: "DELETE" }),
      { params: Promise.resolve({ path: ["tasks", "missing"] }) },
    );
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Task not found" });
  });
});
