const { spawn } = require("node:child_process");
const next = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [next, "start", "-p", process.env.WEB_PORT || "3000"], { stdio: "inherit" });
child.on("exit", code => process.exit(code ?? 0));
process.on("SIGINT", () => child.kill("SIGINT"));
process.on("SIGTERM", () => child.kill("SIGTERM"));
