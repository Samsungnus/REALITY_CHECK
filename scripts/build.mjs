import { cp, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "src");
const destination = join(root, "dist");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });

console.log("Dashboard je pripravený v priečinku dist.");
