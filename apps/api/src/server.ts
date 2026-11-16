import Fastify, { FastifyRequest } from "fastify";
import rateLimit from "@fastify/rate-limit";
import argon2 from "argon2";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { pool } from "./db";
import { z } from "zod";
import "dotenv/config";

const app = Fastify({ bodyLimit: 100 * 1024 });
app.register(rateLimit, { global: false });
const hash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type FirmAccess = {
  firmId: string;
  name: string;
  parentFirmId: string | null;
  role: "admin" | "employee";
};
type Identity = {
  userId: string;
  firmId: string;
  role: "admin" | "employee";
  name: string;
  email: string;
  firmName: string;
  sessionId: string;
  firms: FirmAccess[];
};
declare module "fastify" {
  interface FastifyRequest {
    identity?: Identity;
  }
}

app.addHook("preHandler", async (req, reply) => {
  if (
    ["/health", "/firms", "/auth/login", "/invites/accept"].includes(
      req.routeOptions.url ?? "",
    )
  )
    return;
  const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
  if (!token) return reply.code(401).send({ error: "Authentication required" });
  const result = await pool.query(
    `SELECT s.id session_id,u.id user_id,u.name,u.email
    FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`,
    [hash(token)],
  );
  if (!result.rowCount) return reply.code(401).send({ error: "Session ended" });
  const row = result.rows[0];
  const access = await pool.query(
    `SELECT DISTINCT ON (f.id) f.id "firmId",f.name,f.parent_firm_id "parentFirmId",
      CASE WHEN pm.role IS NOT NULL THEN pm.role ELSE dm.role END role
    FROM firms f
    JOIN firm_memberships dm ON dm.user_id=$1 AND (dm.firm_id=f.id OR dm.firm_id=f.parent_firm_id)
    LEFT JOIN firm_memberships pm ON pm.user_id=$1 AND pm.firm_id=f.parent_firm_id
    ORDER BY f.id`,
    [row.user_id],
  );
  const firms: FirmAccess[] = access.rows;
  const requested = (req.query as any)?.organizationId;
  if (requested !== undefined)
    ensure(
      typeof requested === "string" && requested.length > 0,
      400,
      "Invalid organizationId",
    );
  if (!requested && firms.length > 1)
    return reply.code(400).send({ error: "Select an organization", firms });
  const selected = requested
    ? firms.find((f) => f.firmId === requested)
    : firms[0];
  if (requested && !selected)
    return reply.code(403).send({ error: "Organization is not accessible" });
  if (!selected)
    return reply.code(403).send({ error: "No organization access" });
  req.identity = {
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: selected.role,
    firmId: selected.firmId,
    firmName: selected.name,
    sessionId: row.session_id,
    firms,
  };
});
function input<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data);
}
const firmSignup = z.object({
  firmName: z.string().trim().min(1),
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});
const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
const staffSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["admin", "employee"]),
});
const taskCreate = z.object({
  clientId: z.string().min(1),
  title: z.string().trim().min(1),
  status: z.number().int().min(0).max(2).optional(),
  dueDate: z.number().int().nullable().optional(),
  fee: z.number().min(0).optional(),
  assigneeId: z.string().optional(),
  notes: z.string().nullable().optional(),
});
const taskPatch = z
  .object({
    title: z.string().trim().min(1).optional(),
    status: z.number().int().min(0).max(2).optional(),
    assigneeId: z.string().optional(),
    dueDate: z.number().int().nullable().optional(),
    fee: z.number().min(0).optional(),
    notes: z.string().nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0);
const clientSchema = z.object({
  name: z.string().trim().min(1),
  email: z.string().email().optional().nullable(),
});
const branchSchema = z.object({ name: z.string().trim().min(1) });
const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["admin", "employee"]),
});
const acceptInviteSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(1),
  name: z.string().trim().min(1),
});
const ensure = (condition: boolean, status: number, message: string) => {
  if (!condition) {
    const error = new Error(message) as Error & { statusCode: number };
    error.statusCode = status;
    throw error;
  }
};
app.setErrorHandler((error: any, _req, reply) => {
  if (error.statusCode === 413)
    return reply.code(413).send({ error: "Request body exceeds 100 KB" });
  if (error instanceof z.ZodError)
    return reply
      .code(400)
      .send({ error: "Invalid input", fields: error.flatten().fieldErrors });
  if (error.statusCode)
    return reply.code(error.statusCode).send({ error: error.message });
  app.log.error(error);
  return reply.code(500).send({ error: "Internal server error" });
});
const adminOnly = (req: FastifyRequest) =>
  ensure(req.identity?.role === "admin", 403, "Admin role required");
const sessionResponse = async (userId: string) => {
  const token = randomBytes(32).toString("base64url");
  await pool.query(
    "INSERT INTO sessions(id,user_id,token_hash,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')",
    [randomUUID(), userId, hash(token)],
  );
  return token;
};

app.get("/health", async (_req, reply) => {
  await pool.query("SELECT 1");
  return reply.code(200).send({ status: "ok" });
});
app.post("/firms", async (req, reply) => {
  const data = input(firmSignup, req.body);
  const email = data.email.trim().toLowerCase();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    ensure(
      !(await client.query("SELECT 1 FROM users WHERE email=$1", [email]))
        .rowCount,
      409,
      "Email already registered",
    );
    const firmId = randomUUID(),
      userId = randomUUID();
    await client.query("INSERT INTO firms(id,name) VALUES($1,$2)", [
      firmId,
      data.firmName,
    ]);
    await client.query(
      "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
      [userId, data.name, email, await argon2.hash(data.password)],
    );
    await client.query(
      "INSERT INTO firm_memberships(firm_id,user_id,role) VALUES($1,$2,'admin')",
      [firmId, userId],
    );
    await client.query("COMMIT");
    return reply.code(201).send({ firmId, userId });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
app.register(async function authRoutes(authApp) {
  await authApp.register(rateLimit, { global: false });
  authApp.post(
    "/auth/login",
    { config: { rateLimit: { max: 8, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const data = input(loginSchema, req.body),
        email = data.email.trim().toLowerCase();
      const user = await pool.query(
        "SELECT id,password_hash FROM users WHERE email=$1",
        [email],
      );
      const valid =
        !!user.rowCount &&
        (await argon2.verify(user.rows[0].password_hash, data.password));
      ensure(valid, 401, "Invalid email or password");
      return reply.send({
        accessToken: await sessionResponse(user.rows[0].id),
        userId: user.rows[0].id,
      });
    },
  );
});
app.post("/auth/logout", async (req, reply) => {
  await pool.query("UPDATE sessions SET revoked_at=now() WHERE id=$1", [
    req.identity!.sessionId,
  ]);
  return reply.code(204).send();
});
app.get("/me", async (req) => {
  const i = req.identity!;
  return {
    userId: i.userId,
    name: i.name,
    email: i.email,
    role: i.role,
    firmId: i.firmId,
    firmName: i.firmName,
    firms: i.firms,
  };
});
app.post("/branches", async (req, reply) => {
  adminOnly(req);
  const { name } = input(branchSchema, req.body),
    p = req.identity!;
  const parent = await pool.query(
    "SELECT parent_firm_id FROM firms WHERE id=$1",
    [p.firmId],
  );
  ensure(
    parent.rows[0]?.parent_firm_id === null,
    400,
    "Branches cannot have branches",
  );
  const firmId = randomUUID();
  await pool.query(
    "INSERT INTO firms(id,name,parent_firm_id) VALUES($1,$2,$3)",
    [firmId, name, p.firmId],
  );
  return reply.code(201).send({ firmId });
});
app.post("/invites", async (req, reply) => {
  adminOnly(req);
  const d = input(inviteSchema, req.body),
    email = d.email.trim().toLowerCase(),
    inviteToken = randomBytes(32).toString("base64url");
  const id = randomUUID();
  await pool.query(
    "INSERT INTO firm_invites(id,firm_id,email,role,token_hash) VALUES($1,$2,$3,$4,$5)",
    [id, req.identity!.firmId, email, d.role, hash(inviteToken)],
  );
  return reply.code(201).send({ inviteToken });
});
app.post("/invites/accept", async (req, reply) => {
  const d = input(acceptInviteSchema, req.body),
    client = await pool.connect();
  try {
    await client.query("BEGIN");
    const invite = await client.query(
      "SELECT id,firm_id,email,role FROM firm_invites WHERE token_hash=$1 AND accepted_at IS NULL FOR UPDATE",
      [hash(d.token)],
    );
    ensure(!!invite.rowCount, 404, "Invite is invalid or already used");
    const row = invite.rows[0],
      existing = await client.query(
        "SELECT id,password_hash FROM users WHERE email=$1",
        [row.email],
      );
    let userId: string;
    if (existing.rowCount) {
      const valid = await argon2.verify(
        existing.rows[0].password_hash,
        d.password,
      );
      ensure(valid, 401, "Current password is incorrect");
      userId = existing.rows[0].id;
      ensure(
        !(
          await client.query(
            "SELECT 1 FROM firm_memberships WHERE firm_id=$1 AND user_id=$2",
            [row.firm_id, userId],
          )
        ).rowCount,
        409,
        "Already a member of this firm",
      );
    } else {
      ensure(
        d.password.length >= 8,
        400,
        "Password must be at least 8 characters",
      );
      userId = randomUUID();
      await client.query(
        "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
        [userId, d.name, row.email, await argon2.hash(d.password)],
      );
    }
    await client.query(
      "INSERT INTO firm_memberships(firm_id,user_id,role) VALUES($1,$2,$3)",
      [row.firm_id, userId, row.role],
    );
    await client.query(
      "UPDATE firm_invites SET accepted_at=now() WHERE id=$1",
      [row.id],
    );
    await client.query("COMMIT");
    return reply.code(201).send({ userId, firmId: row.firm_id });
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
});
app.get("/staff", async (req) => {
  adminOnly(req);
  const r = await pool.query(
    `SELECT DISTINCT ON (u.id) u.id "userId",u.name,u.email,m.role,
  (m.firm_id<>$1) inherited FROM firm_memberships m JOIN users u ON u.id=m.user_id
  JOIN firms f ON f.id=$1 WHERE m.firm_id=$1 OR (f.parent_firm_id IS NOT NULL AND m.firm_id=f.parent_firm_id)
  ORDER BY u.id,(m.firm_id<>$1) DESC,u.name`,
    [req.identity!.firmId],
  );
  return { data: r.rows };
});
app.post("/staff", async (req, reply) => {
  adminOnly(req);
  const d = input(staffSchema, req.body),
    id = randomUUID(),
    c = await pool.connect();
  try {
    await c.query("BEGIN");
    ensure(
      !(
        await c.query("SELECT 1 FROM users WHERE email=$1", [
          d.email.toLowerCase(),
        ])
      ).rowCount,
      409,
      "Email already registered",
    );
    await c.query(
      "INSERT INTO users(id,name,email,password_hash) VALUES($1,$2,$3,$4)",
      [id, d.name, d.email.toLowerCase(), await argon2.hash(d.password)],
    );
    await c.query(
      "INSERT INTO firm_memberships(firm_id,user_id,role) VALUES($1,$2,$3)",
      [req.identity!.firmId, id, d.role],
    );
    await c.query("COMMIT");
    return reply.code(201).send({ userId: id });
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
});
app.patch("/staff/:userId/role", async (req, reply) => {
  adminOnly(req);
  const { role } = input(
      z.object({ role: z.enum(["admin", "employee"]) }),
      req.body,
    ),
    id = (req.params as any).userId;
  ensure(id !== req.identity!.userId, 403, "Cannot change your own role");
  const office = await pool.query(
    "SELECT parent_firm_id FROM firms WHERE id=$1",
    [req.identity!.firmId],
  );
  if (office.rows[0]?.parent_firm_id)
    ensure(
      !(
        await pool.query(
          "SELECT 1 FROM firm_memberships WHERE firm_id=$1 AND user_id=$2",
          [office.rows[0].parent_firm_id, id],
        )
      ).rowCount,
      403,
      "Head-office roles cannot be changed from a branch",
    );
  const r = await pool.query(
    "UPDATE firm_memberships SET role=$1 WHERE firm_id=$2 AND user_id=$3 RETURNING user_id",
    [role, req.identity!.firmId, id],
  );
  ensure(!!r.rowCount, 404, "Staff member not found");
  return reply.send({ userId: id, role });
});

async function list(req: FastifyRequest, entity: "clients" | "tasks") {
  const q = req.query as Record<string, any>;
  const page = Number(q.page ?? 1),
    limit = Number(q.limit ?? 25);
  ensure(
    Number.isInteger(page) &&
      page >= 1 &&
      Number.isInteger(limit) &&
      limit >= 1 &&
      limit <= 100,
    400,
    "Invalid page or limit",
  );
  const epochQuery = (key: string): number | undefined => {
    if (q[key] === undefined) return undefined;
    ensure(
      typeof q[key] === "string" && /^-?\d+$/.test(q[key]),
      400,
      `Invalid ${key}`,
    );
    const value = Number(q[key]);
    ensure(Number.isSafeInteger(value), 400, `Invalid ${key}`);
    return value;
  };
  const vals: any[] = [req.identity!.firmId],
    where = ["x.firm_id=$1"];
  const add = (sql: string, v: any) => {
    vals.push(v);
    where.push(sql.replace("?", `$${vals.length}`));
  };
  if (entity === "tasks") {
    const allowedSorts = [
      "title",
      "dueDate",
      "status",
      "createdOn",
      "clientName",
    ];
    if (q.sort !== undefined)
      ensure(
        typeof q.sort === "string" && allowedSorts.includes(q.sort),
        400,
        "Invalid sort",
      );
    if (q.order !== undefined)
      ensure(q.order === "asc" || q.order === "desc", 400, "Invalid order");
    const dueFromValue = epochQuery("dueFrom"),
      dueToValue = epochQuery("dueTo");
    if (dueFromValue !== undefined && dueToValue !== undefined)
      ensure(
        dueFromValue <= dueToValue,
        400,
        "dueFrom must not be later than dueTo",
      );
    const statuses = Array.isArray(q.status)
      ? q.status
      : q.status === undefined
        ? []
        : [q.status];
    if (statuses.length) {
      const parsed = statuses.map(Number);
      ensure(
        parsed.every((v: number) => Number.isInteger(v) && v >= 0 && v <= 2),
        400,
        "Invalid status",
      );
      vals.push(parsed);
      where.push(`x.status=ANY($${vals.length}::int[])`);
    } else where.push("x.status<>2");
    if (q.assigneeId) add("x.assignee_id=?", q.assigneeId);
    if (q.clientId) add("x.client_id=?", q.clientId);
    if (q.q) {
      vals.push(`%${q.q}%`);
      where.push(
        `(x.title ILIKE $${vals.length} OR c.name ILIKE $${vals.length})`,
      );
    }
    if (dueFromValue !== undefined) add("x.due_date>=?", dueFromValue);
    if (dueToValue !== undefined) add("x.due_date<=?", dueToValue);
    if (req.identity!.role === "employee")
      add("x.assignee_id=?", req.identity!.userId);
  } else {
    if (req.identity!.role === "employee") {
      vals.push(req.identity!.userId);
      where.push(
        `EXISTS(SELECT 1 FROM tasks assigned WHERE assigned.firm_id=x.firm_id AND assigned.client_id=x.id AND assigned.assignee_id=$${vals.length})`,
      );
    }
    if (q.q) add("x.name ILIKE ?", `%${q.q}%`);
  }
  const sortMap: any = {
    title: "x.title",
    dueDate: "x.due_date",
    status: "x.status",
    createdOn: "x.created_on",
    clientName: "c.name",
  };
  const sort =
      entity === "tasks" ? (sortMap[q.sort] ?? "x.created_on") : "x.name",
    order = q.order === "asc" ? "ASC" : "DESC";
  const joins =
    entity === "tasks"
      ? "JOIN clients c ON c.id=x.client_id JOIN users u ON u.id=x.assignee_id"
      : "";
  const count = await pool.query(
    `SELECT count(*)::int total FROM ${entity} x ${joins} WHERE ${where.join(" AND ")}`,
    vals,
  );
  vals.push(limit, (page - 1) * limit);
  const select =
    entity === "tasks"
      ? `x.id,x.title,x.status,x.due_date \"dueDate\",x.fee::float fee,x.notes,x.client_id \"clientId\",c.name \"clientName\",x.assignee_id \"assigneeId\",u.name \"assigneeName\",x.created_on \"createdOn\"`
      : `x.id,x.name,x.email`;
  const result = await pool.query(
    `SELECT ${select} FROM ${entity} x ${joins} WHERE ${where.join(" AND ")} ORDER BY ${sort} ${order} LIMIT $${vals.length - 1} OFFSET $${vals.length}`,
    vals,
  );
  return { data: result.rows, page, limit, total: count.rows[0].total };
}
app.get("/clients", async (req) => list(req, "clients"));
app.post("/clients", async (req, reply) => {
  adminOnly(req);
  const d = input(clientSchema, req.body),
    id = randomUUID();
  const r = await pool.query(
    "INSERT INTO clients(id,firm_id,name,email) VALUES($1,$2,$3,$4) RETURNING id,name,email",
    [id, req.identity!.firmId, d.name, d.email ?? null],
  );
  return reply.code(201).send(r.rows[0]);
});
app.get("/tasks", async (req) => list(req, "tasks"));
async function taskVisible(req: FastifyRequest, id: string) {
  const p = req.identity!;
  const r = await pool.query(
    `SELECT x.id,x.title,x.status,x.due_date \"dueDate\",x.fee::float fee,x.notes,x.client_id \"clientId\",c.name \"clientName\",x.assignee_id \"assigneeId\",u.name \"assigneeName\",x.created_on \"createdOn\" FROM tasks x JOIN clients c ON c.id=x.client_id JOIN users u ON u.id=x.assignee_id WHERE x.id=$1 AND x.firm_id=$2 AND ($3='admin' OR x.assignee_id=$4)`,
    [id, p.firmId, p.role, p.userId],
  );
  ensure(!!r.rowCount, 404, "Task not found");
  return r.rows[0];
}
app.get("/tasks/:id", async (req) => taskVisible(req, (req.params as any).id));
app.post("/tasks", async (req, reply) => {
  adminOnly(req);
  const d = input(taskCreate, req.body),
    p = req.identity!,
    assignee = d.assigneeId ?? p.userId;
  const valid = await pool.query(
    `SELECT
      EXISTS(SELECT 1 FROM clients WHERE firm_id=$1 AND id=$2) AS client_valid,
      EXISTS(
        SELECT 1 FROM firm_memberships m JOIN firms f ON f.id=$1
        WHERE m.user_id=$3 AND (m.firm_id=$1 OR m.firm_id=f.parent_firm_id)
      ) AS assignee_valid`,
    [p.firmId, d.clientId, assignee],
  );
  ensure(
    valid.rows[0].client_valid && valid.rows[0].assignee_valid,
    400,
    "Client or assignee is not in this firm",
  );
  const id = randomUUID();
  await pool.query(
    "INSERT INTO tasks(id,firm_id,client_id,assignee_id,title,status,due_date,fee,notes,created_on) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
    [
      id,
      p.firmId,
      d.clientId,
      assignee,
      d.title,
      d.status ?? 0,
      d.dueDate ?? null,
      d.fee ?? 0,
      d.notes ?? null,
      Date.now(),
    ],
  );
  return reply.code(201).send(await taskVisible(req, id));
});
app.patch("/tasks/:id", async (req, reply) => {
  const p = req.identity!,
    id = (req.params as any).id,
    d = input(taskPatch, req.body);
  await taskVisible(req, id);
  if (p.role === "employee")
    ensure(
      Object.keys(d).some((k) => k === "status" || k === "notes"),
      403,
      "Employees may only change status and notes",
    );
  if (d.assigneeId && p.role === "admin")
    ensure(
      !!(
        await pool.query(
          "SELECT 1 FROM firm_memberships m JOIN firms f ON f.id=$1 WHERE m.user_id=$2 AND (m.firm_id=$1 OR m.firm_id=f.parent_firm_id)",
          [p.firmId, d.assigneeId],
        )
      ).rowCount,
      400,
      "Assignee is not in this firm",
    );
  const fields: any = {
    title: "title",
    status: "status",
    assigneeId: "assignee_id",
    dueDate: "due_date",
    fee: "fee",
    notes: "notes",
  };
  const allowed = p.role === "employee" ? ["status", "notes"] : Object.keys(d);
  const sets: string[] = [],
    vals: any[] = [];
  for (const [k, v] of Object.entries(d)) {
    if (!allowed.includes(k)) continue;
    vals.push(v);
    sets.push(`${fields[k]}=$${vals.length}`);
  }
  if (sets.length) {
    vals.push(id, p.firmId);
    await pool.query(
      `UPDATE tasks SET ${sets.join(",")} WHERE id=$${vals.length - 1} AND firm_id=$${vals.length}`,
      vals,
    );
  }
  return reply.send(await taskVisible(req, id));
});
app.delete("/tasks/:id", async (req, reply) => {
  adminOnly(req);
  const r = await pool.query("DELETE FROM tasks WHERE id=$1 AND firm_id=$2", [
    (req.params as any).id,
    req.identity!.firmId,
  ]);
  ensure(!!r.rowCount, 404, "Task not found");
  return reply.code(204).send();
});

const port = Number(process.env.PORT ?? 4000);
if (require.main === module)
  app.listen({ port, host: "0.0.0.0" }).catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
export { app };
