import { rmSync } from "node:fs";
import { resolve } from "node:path";

const targets = [".next"];

for (const target of targets) {
  const path = resolve(process.cwd(), target);
  try {
    rmSync(path, { recursive: true, force: true });
    console.log(`[clean] removed ${target}`);
  } catch (error) {
    console.warn(`[clean] failed to remove ${target}:`, error);
  }
}
