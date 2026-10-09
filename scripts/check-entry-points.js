#!/usr/bin/env node

/**
 * Checks that every path package.json promises to the outside also exists in the build.
 * Runs after `npm run build`.
 *
 * lint and test import from src/, so nothing else says whether dist/ still matches
 * package.json -- and a consumer is the wrong place to find that out. Only existence is
 * checked, not content.
 */

import { existsSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const errors = [];

const check = (relPath, origin) => {
    if (!existsSync(relPath.replace(/^\.\//, ""))) {
        errors.push(`${origin} -> ${relPath} does not exist`);
    }
};

// main, types: the fields older tools read when they do not evaluate exports.
for (const field of ["main", "types"]) {
    if (pkg[field]) check(pkg[field], field);
}

// files: what actually ends up in the tarball.
for (const entry of pkg.files ?? []) {
    check(entry, "files");
}

// exports: the map modern resolvers use.
const walkExports = (node, path) => {
    if (typeof node === "string") return check(node, `exports${path}`);
    for (const [key, value] of Object.entries(node)) {
        walkExports(value, `${path}["${key}"]`);
    }
};
walkExports(pkg.exports ?? {}, "");

if (errors.length) {
    for (const e of errors) console.error(`::error::${e}`);
    console.error(`\n${errors.length} entry/entries in package.json point nowhere.`);
    process.exit(1);
}

console.log("All entry points resolved: main, types, files, exports.");
