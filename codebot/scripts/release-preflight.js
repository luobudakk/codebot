#!/usr/bin/env node
const { spawnSync } = require("node:child_process");

function run(cmd, args) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  const res = spawnSync(cmd, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (res.status !== 0) {
    console.error(`Preflight failed at: ${cmd} ${args.join(" ")}`);
    process.exit(res.status || 1);
  }
}

run("npm", ["run", "build"]);
run("npm", ["run", "test"]);
console.log("\nPreflight passed.");
