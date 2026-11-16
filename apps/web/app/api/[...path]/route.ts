import { NextRequest, NextResponse } from "next/server";

const api = process.env.API_URL ?? "http://localhost:4000";
const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

async function forward(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const route = path.join("/");
  const url = new URL(`${api}/${route}`);
  request.nextUrl.searchParams.forEach((value, key) =>
    url.searchParams.append(key, value),
  );
  const organizationCookie = request.cookies.get(
    "taskdesk_organization",
  )?.value;
  const requestedOrganization = url.searchParams.get("organizationId");
  if (requestedOrganization)
    url.searchParams.set("organizationId", requestedOrganization);
  else if (organizationCookie)
    url.searchParams.set("organizationId", organizationCookie);

  const token = request.cookies.get("taskdesk_session")?.value;
  const headers = new Headers();
  if (token) headers.set("authorization", `Bearer ${token}`);
  if (request.headers.get("content-type"))
    headers.set("content-type", request.headers.get("content-type")!);
  const body = ["GET", "HEAD"].includes(request.method)
    ? undefined
    : await request.text();
  let upstream = await fetch(url, {
    method: request.method,
    headers,
    body,
    cache: "no-store",
  });

  // A deleted or no-longer-accessible saved organization should not strand a valid session.
  let staleOrganization = false;
  if (
    route === "me" &&
    upstream.status === 403 &&
    organizationCookie &&
    !requestedOrganization
  ) {
    url.searchParams.delete("organizationId");
    upstream = await fetch(url, { method: "GET", headers, cache: "no-store" });
    staleOrganization = true;
  }

  if (route === "auth/login" && upstream.ok) {
    const data = await upstream.json();
    const response = NextResponse.json(data, { status: upstream.status });
    response.cookies.set("taskdesk_session", data.accessToken, {
      ...cookieOptions,
      maxAge: 43200,
    });
    response.cookies.set("taskdesk_organization", "", {
      ...cookieOptions,
      maxAge: 0,
    });
    return response;
  }
  if (route === "auth/logout") {
    const response = new NextResponse(null, { status: upstream.status });
    response.cookies.set("taskdesk_session", "", {
      ...cookieOptions,
      maxAge: 0,
    });
    response.cookies.set("taskdesk_organization", "", {
      ...cookieOptions,
      maxAge: 0,
    });
    return response;
  }

  // Fetch forbids a response body for 204/205/304. Keep the API's success
  // status intact instead of turning a completed delete into a BFF 500.
  const noBody = [204, 205, 304].includes(upstream.status);
  const text = noBody ? null : await upstream.text();
  const response = new NextResponse(text, {
    status: upstream.status,
    headers: {
      "content-type":
        upstream.headers.get("content-type") ?? "application/json",
    },
  });
  if (route === "me" && upstream.ok) {
    const chosen = requestedOrganization || organizationCookie;
    if (chosen)
      response.cookies.set("taskdesk_organization", chosen, {
        ...cookieOptions,
        maxAge: 43200,
      });
  } else if (
    route === "me" &&
    organizationCookie &&
    (upstream.status === 403 || staleOrganization)
  ) {
    response.cookies.set("taskdesk_organization", "", {
      ...cookieOptions,
      maxAge: 0,
    });
  }
  return response;
}

export { forward as GET, forward as POST, forward as PATCH, forward as DELETE };
