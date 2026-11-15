import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./server";
import { pool } from "./db";

type Method = "GET" | "POST" | "PATCH" | "DELETE";
const call = (method: Method, url: string, token?: string, payload?: unknown) =>
  app.inject({ method, url, headers: token ? { authorization: `Bearer ${token}` } : undefined, payload });

describe("Taskdesk API (PostgreSQL integration)", () => {
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const adminEmail = `admin-${stamp}@example.test`;
  const employeeEmail = `employee-${stamp}@example.test`;
  const otherFirmEmail = `other-${stamp}@example.test`;
  const branchOnlyEmail = `branch-only-${stamp}@example.test`;
  let firmId = "", otherFirmId = "", adminId = "", employeeId = "";
  let adminToken = "", employeeToken = "", otherFirmToken = "";
  let assignedClientId = "", hiddenClientId = "", queryClientId = "";
  let assignedTaskId = "", adminTaskId = "", otherFirmTaskId = "";
  let queryTaskIds: string[] = [];

  beforeAll(async () => {
    await app.ready();
    await pool.query("SELECT 1");

    let response = await call("POST", "/firms", undefined, {
      firmName: `Test Firm ${stamp}`, name: "Admin User", email: adminEmail, password: "StrongPass123!"
    });
    expect(response.statusCode).toBe(201);
    ({ firmId, userId: adminId } = response.json());
    response = await call("POST", "/auth/login", undefined, { email: adminEmail, password: "StrongPass123!" });
    expect(response.statusCode).toBe(200);
    adminToken = response.json().accessToken;

    response = await call("POST", "/staff", adminToken, {
      name: "Employee User", email: employeeEmail, password: "AnotherPass123!", role: "employee"
    });
    expect(response.statusCode).toBe(201);
    employeeId = response.json().userId;
    response = await call("POST", "/auth/login", undefined, { email: employeeEmail, password: "AnotherPass123!" });
    expect(response.statusCode).toBe(200);
    employeeToken = response.json().accessToken;

    assignedClientId = (await call("POST", "/clients", adminToken, { name: "Assigned Client" })).json().id;
    hiddenClientId = (await call("POST", "/clients", adminToken, { name: "Admin-only Client" })).json().id;
    assignedTaskId = (await call("POST", "/tasks", adminToken, {
      clientId: assignedClientId, title: "Employee work", status: 1, assigneeId: employeeId, dueDate: 2000
    })).json().id;
    adminTaskId = (await call("POST", "/tasks", adminToken, {
      clientId: hiddenClientId, title: "Admin work", status: 0, assigneeId: adminId, dueDate: 1000
    })).json().id;

    queryClientId = (await call("POST", "/clients", adminToken, { name: "Query Client" })).json().id;
    for (const task of [
      { title: "Alpha work", status: 0, dueDate: 1000 },
      { title: "Bravo work", status: 1, dueDate: 2000 },
      { title: "Charlie work", status: 1, dueDate: 3000 },
      { title: "Done work", status: 2, dueDate: 2500 }
    ]) {
      const created = await call("POST", "/tasks", adminToken, { ...task, clientId: queryClientId, assigneeId: adminId });
      expect(created.statusCode).toBe(201);
      queryTaskIds.push(created.json().id);
    }

    response = await call("POST", "/firms", undefined, {
      firmName: `Other Firm ${stamp}`, name: "Other Admin", email: otherFirmEmail, password: "OtherPass123!"
    });
    expect(response.statusCode).toBe(201);
    otherFirmId = response.json().firmId;
    response = await call("POST", "/auth/login", undefined, { email: otherFirmEmail, password: "OtherPass123!" });
    expect(response.statusCode).toBe(200);
    otherFirmToken = response.json().accessToken;
    const otherClientId = (await call("POST", "/clients", otherFirmToken, { name: "Other Firm Client" })).json().id;
    otherFirmTaskId = (await call("POST", "/tasks", otherFirmToken, {
      clientId: otherClientId, title: "Other firm work", status: 0
    })).json().id;
  }, 30000);

  afterAll(async () => {
    try {
      if (firmId) await pool.query("DELETE FROM firms WHERE id=$1", [firmId]);
      if (otherFirmId) await pool.query("DELETE FROM firms WHERE id=$1", [otherFirmId]);
      await pool.query("DELETE FROM users WHERE email=ANY($1::text[])", [[adminEmail, employeeEmail, otherFirmEmail, branchOnlyEmail]]);
    } finally {
      await app.close();
      await pool.end();
    }
  });

  it("reports readiness when PostgreSQL is reachable", async () => {
    const response = await call("GET", "/health");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "ok" });
  });

  it("returns field-level validation details for malformed signup input", async () => {
    const response = await call("POST", "/firms", undefined, {
      firmName: "Example Firm", name: "Test Person", email: "not-an-email", password: "short"
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().fields).toMatchObject({ email: expect.any(Array), password: expect.any(Array) });
  });

  it("creates a firm/admin, authenticates, and revokes the bearer session on logout", async () => {
    const logout = await call("POST", "/auth/logout", adminToken);
    expect(logout.statusCode).toBe(204);
    expect((await call("GET", "/me", adminToken)).statusCode).toBe(401);
    const login = await call("POST", "/auth/login", undefined, { email: adminEmail, password: "StrongPass123!" });
    expect(login.statusCode).toBe(200);
    adminToken = login.json().accessToken;
    expect((await call("GET", "/me", adminToken)).json()).toMatchObject({ userId: adminId, role: "admin", firmId });
  });

  it("returns 409 for an email already registered in the staff flow", async () => {
    const response = await call("POST", "/staff", adminToken, {
      name: "Duplicate", email: employeeEmail, password: "AnotherPass123!", role: "employee"
    });
    expect(response.statusCode).toBe(409);
  });

  it("returns 409 when signup reuses an existing email", async () => {
    const response = await call("POST", "/firms", undefined, {
      firmName: "Duplicate Firm", name: "Duplicate User", email: adminEmail, password: "StrongPass123!"
    });
    expect(response.statusCode).toBe(409);
  });

  it("rate limits repeated invalid sign-ins by client address", async () => {
    const remoteAddress = `198.51.100.${1 + (Date.now() % 200)}`;
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const response = await app.inject({
        method: "POST", url: "/auth/login", remoteAddress,
        payload: { email: `missing-${stamp}@example.test`, password: "incorrect" }
      });
      expect(response.statusCode, `failed sign-in ${attempt + 1}`).toBe(401);
    }
    const limited = await app.inject({
      method: "POST", url: "/auth/login", remoteAddress,
      payload: { email: `missing-${stamp}@example.test`, password: "incorrect" }
    });
    expect(limited.statusCode).toBe(429);
  });

  it("refuses an admin changing their own role with 403", async () => {
    const response = await call("PATCH", `/staff/${adminId}/role`, adminToken, { role: "employee" });
    expect(response.statusCode).toBe(403);
  });

  it("scopes employee task and client reads, and returns 404 for invisible/cross-firm tasks", async () => {
    const tasks = await call("GET", "/tasks", employeeToken);
    expect(tasks.statusCode).toBe(200);
    expect(tasks.json().data.map((task: { id: string }) => task.id)).toContain(assignedTaskId);
    expect(tasks.json().data.map((task: { id: string }) => task.id)).not.toContain(adminTaskId);

    const clients = await call("GET", "/clients", employeeToken);
    expect(clients.statusCode).toBe(200);
    expect(clients.json().data.map((client: { id: string }) => client.id)).toContain(assignedClientId);
    expect(clients.json().data.map((client: { id: string }) => client.id)).not.toContain(hiddenClientId);

    expect((await call("GET", `/tasks/${adminTaskId}`, employeeToken)).statusCode).toBe(404);
    expect((await call("GET", `/tasks/${otherFirmTaskId}`, adminToken)).statusCode).toBe(404);
  });

  it("enforces employee write permissions but allows status/notes updates", async () => {
    expect((await call("POST", "/clients", employeeToken, { name: "Forbidden" })).statusCode).toBe(403);
    expect((await call("PATCH", `/tasks/${assignedTaskId}`, employeeToken, { fee: 99 })).statusCode).toBe(403);
    const patch = await call("PATCH", `/tasks/${assignedTaskId}`, employeeToken, {
      title: "Ignored mobile field", status: 2, notes: "Filed"
    });
    expect(patch.statusCode).toBe(200);
    expect(patch.json()).toMatchObject({ title: "Employee work", status: 2, notes: "Filed" });
  });

  it("rejects invalid paging, status, date bounds, sort and order with 400", async () => {
    const invalidQueries = [
      "?page=0", "?limit=101", "?status=8", "?dueFrom=yesterday", "?dueTo=NaN",
      "?dueFrom=3000&dueTo=1000", "?sort=assigneeName", "?order=sideways"
    ];
    for (const query of invalidQueries) {
      const response = await call("GET", `/tasks${query}`, adminToken);
      expect(response.statusCode, query).toBe(400);
    }
  });

  it("filters, sorts, and pages task results, and omits done tasks by default", async () => {
    const query = new URLSearchParams();
    query.set("clientId", queryClientId);
    query.set("dueFrom", "1000");
    query.set("dueTo", "3000");
    query.append("status", "0");
    query.append("status", "1");
    query.set("sort", "title");
    query.set("order", "asc");
    query.set("page", "1");
    query.set("limit", "2");
    const first = await call("GET", `/tasks?${query}`, adminToken);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ page: 1, limit: 2, total: 3 });
    expect(first.json().data.map((task: { title: string }) => task.title)).toEqual(["Alpha work", "Bravo work"]);
    query.set("page", "2");
    expect((await call("GET", `/tasks?${query}`, adminToken)).json().data.map((task: { title: string }) => task.title)).toEqual(["Charlie work"]);

    const done = await call("GET", `/tasks?clientId=${queryClientId}&status=2`, adminToken);
    expect(done.json().data.map((task: { id: string }) => task.id)).toContain(queryTaskIds[3]);
    const defaults = await call("GET", `/tasks?clientId=${queryClientId}`, adminToken);
    expect(defaults.json().data.map((task: { id: string }) => task.id)).not.toContain(queryTaskIds[3]);

    const byAssignee = await call("GET", `/tasks?assigneeId=${employeeId}&status=2`, adminToken);
    expect(byAssignee.statusCode).toBe(200);
    expect(byAssignee.json().data.map((task: { id: string }) => task.id)).toContain(assignedTaskId);
    expect(byAssignee.json().data.map((task: { id: string }) => task.id)).not.toContain(adminTaskId);
  });

  it("returns 413 for a request body over 100 KB", async () => {
    const response = await app.inject({
      method: "POST", url: "/firms", headers: { "content-type": "application/json" },
      payload: JSON.stringify({ name: "x".repeat(1024 * 101) })
    });
    expect(response.statusCode).toBe(413);
  });

  it("deletes an admin task with 204 and returns 404 afterwards", async () => {
    expect((await call("DELETE", `/tasks/${adminTaskId}`, adminToken)).statusCode).toBe(204);
    expect((await call("GET", `/tasks/${adminTaskId}`, adminToken)).statusCode).toBe(404);
    expect((await call("DELETE", `/tasks/${adminTaskId}`, adminToken)).statusCode).toBe(404);
  });

  it("supports one-level branches, explicit organization selection, inherited access, and invitations", async () => {
    const branch=await call("POST","/branches",adminToken,{name:`Branch ${stamp}`});
    expect(branch.statusCode).toBe(201);const branchId=branch.json().firmId;
    expect((await call("GET","/me",adminToken)).statusCode).toBe(400);
    const me=await call("GET",`/me?organizationId=${branchId}`,adminToken);
    expect(me.statusCode).toBe(200);expect(me.json().firms).toEqual(expect.arrayContaining([
      expect.objectContaining({firmId,parentFirmId:null}),expect.objectContaining({firmId:branchId,parentFirmId:firmId})
    ]));
    expect((await call("GET",`/clients?organizationId=${otherFirmId}`,adminToken)).statusCode).toBe(403);
    expect((await call("POST",`/branches?organizationId=${branchId}`,adminToken,{name:"Nested"})).statusCode).toBe(400);
    expect((await call("PATCH",`/staff/${employeeId}/role?organizationId=${branchId}`,adminToken,{role:"admin"})).statusCode).toBe(403);
    const branchClient=await call("POST",`/clients?organizationId=${branchId}`,adminToken,{name:"Branch client"});
    expect(branchClient.statusCode).toBe(201);
    const inheritedTask=await call("POST",`/tasks?organizationId=${branchId}`,adminToken,{clientId:branchClient.json().id,title:"HQ assigned in branch",assigneeId:employeeId});
    expect(inheritedTask.statusCode).toBe(201);
    expect((await call("GET",`/tasks?organizationId=${branchId}`,employeeToken)).json().data.map((t:any)=>t.id)).toContain(inheritedTask.json().id);
    const invite=await call("POST",`/invites?organizationId=${branchId}`,adminToken,{email:employeeEmail,role:"admin"});
    expect(invite.statusCode).toBe(201);
    expect((await call("POST","/invites/accept",undefined,{token:invite.json().inviteToken,password:"wrong",name:"Employee"})).statusCode).toBe(401);
    expect((await call("POST","/invites/accept",undefined,{token:invite.json().inviteToken,password:"AnotherPass123!",name:"Employee"})).statusCode).toBe(201);
    expect((await call("POST","/invites/accept",undefined,{token:invite.json().inviteToken,password:"AnotherPass123!",name:"Employee"})).statusCode).toBe(404);
    const inheritedRole=await call("GET",`/me?organizationId=${branchId}`,employeeToken);
    expect(inheritedRole.json().role).toBe("employee");

    const branchOnlyInvite=await call("POST",`/invites?organizationId=${branchId}`,adminToken,{email:branchOnlyEmail,role:"employee"});
    const branchOnlyAccepted=await call("POST","/invites/accept",undefined,{token:branchOnlyInvite.json().inviteToken,password:"BranchPass123!",name:"Branch Only"});
    expect(branchOnlyAccepted.statusCode).toBe(201);
    const branchOnlyLogin=await call("POST","/auth/login",undefined,{email:branchOnlyEmail,password:"BranchPass123!"});
    const branchOnlyToken=branchOnlyLogin.json().accessToken;
    expect((await call("GET",`/me?organizationId=${firmId}`,branchOnlyToken)).statusCode).toBe(403);
    expect((await call("GET",`/me?organizationId=${branchId}`,branchOnlyToken)).json().role).toBe("employee");

    const otherFirmInvite=await call("POST",`/invites?organizationId=${otherFirmId}`,otherFirmToken,{email:employeeEmail,role:"admin"});
    expect(otherFirmInvite.statusCode).toBe(201);
    expect((await call("POST","/invites/accept",undefined,{token:otherFirmInvite.json().inviteToken,password:"AnotherPass123!",name:"Employee"})).statusCode).toBe(201);
    expect((await call("GET","/me",employeeToken)).statusCode).toBe(400);
    expect((await call("GET",`/me?organizationId=${otherFirmId}`,employeeToken)).json().role).toBe("admin");
    expect((await call("POST","/auth/logout",employeeToken)).statusCode).toBe(400);
    const storedToken=await pool.query("SELECT token_hash FROM firm_invites WHERE email=$1",[branchOnlyEmail]);
    expect(storedToken.rows[0].token_hash).not.toBe(branchOnlyInvite.json().inviteToken);
    await expect(pool.query("INSERT INTO firms(id,name,parent_firm_id) VALUES($1,$2,$3)",[randomBranchId(),"Invalid nested branch",branchId])).rejects.toMatchObject({code:"23514"});
  });
});

function randomBranchId(){return `test-${Date.now()}-${Math.random().toString(36).slice(2)}`}
