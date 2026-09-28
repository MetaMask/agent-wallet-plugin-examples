import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PluginManifestSchema } from "@metamask/agent-wallet/plugin";

const packageJson = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
const result = PluginManifestSchema.safeParse(packageJson.mm);
assert.equal(result.success, true, result.success ? "" : JSON.stringify(result.error.issues));

assert.deepEqual(packageJson.mm.capabilities, []);
assert.equal(packageJson.oclif.hooks, undefined);
assert.equal(packageJson.oclif.plugins, undefined);
assert.deepEqual(
  packageJson.mm.commands.map((command) => command.id).sort(),
  ["assetfare:capabilities", "assetfare:quote"],
);
for (const command of packageJson.mm.commands) {
  assert.deepEqual(command.capabilities, []);
  assert.deepEqual(command.dataAccess, []);
}

const oclifManifest = JSON.parse(await readFile(new URL("../oclif.manifest.json", import.meta.url), "utf8"));
assert.deepEqual(Object.keys(oclifManifest.commands).sort(), ["assetfare:capabilities", "assetfare:quote"]);
for (const command of Object.values(oclifManifest.commands)) {
  assert.equal(command.requiresAuth, false);
  assert.equal(command.requiresInit, false);
  assert.equal(command.requiresFees, false);
}

console.log("assetfare manifest valid: 2 read-only commands, 0 wallet permissions");
