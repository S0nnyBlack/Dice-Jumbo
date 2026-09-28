import { randomUUID } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const deployment = {
  id: randomUUID(),
  builtAt: new Date().toISOString()
};
await writeFile(
  path.join(projectRoot, "deployment-version.json"),
  JSON.stringify(deployment, null, 2) + "\n",
  "utf8"
);
console.log("Prepared deployment identity " + deployment.id);
