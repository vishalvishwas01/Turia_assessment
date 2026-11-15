const { spawn } = require("node:child_process");
const path = require("node:path");
require("dotenv").config();
const children = [
  spawn(process.execPath, ["dist/server.js"], { cwd: path.resolve(__dirname, "../apps/api"), stdio: "inherit" }),
  spawn(process.execPath, ["../../scripts/start-web.js"], { cwd: path.resolve(__dirname, "../apps/web"), stdio: "inherit" })
];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) if (child.exitCode === null && !child.killed) child.kill();
  process.exitCode = code;
}
for (const child of children) child.on("exit", code => { if (!stopping) stop(code ?? 1); });
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
