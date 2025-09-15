#!/usr/bin/env node
/*
 *   Copyright (c) 2025 Alexander Neitzel

 *   This program is free software: you can redistribute it and/or modify
 *   it under the terms of the GNU General Public License as published by
 *   the Free Software Foundation, either version 3 of the License, or
 *   (at your option) any later version.

 *   This program is distributed in the hope that it will be useful,
 *   but WITHOUT ANY WARRANTY; without even the implied warranty of
 *   MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *   GNU General Public License for more details.

 *   You should have received a copy of the GNU General Public License
 *   along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { compile, saveToFile } from "@astx/compiler";
import { generateJSCode, loadFromFile, run } from "@astx/runtime";
import { program } from "commander";
import { readFileSync, writeFileSync } from "fs";
import path from "path";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const version = require("../package.json").version;

program

  .command("compile <input> <output>")
  .description("Compile .js to .astx")
  .action((input, output) => {
    console.log("Compiling...");

    const start = performance.now();
    const fileContent = readFileSync(input, "utf-8");

    if (!fileContent) {
      console.error("File not found");
      process.exit(1);
    }

    const compiled = compile(fileContent);

    if (!output.endsWith(".astx")) {
      output += ".astx";
    }

    saveToFile(compiled, output);
    console.log(`Compiled in ${performance.now() - start}ms`);
  });

program

  .command("run <input>")
  .description("Run .astx files")
  .action((input) => {
    console.log("Running...");

    const program = loadFromFile(input);

    const folder = path.dirname(input);

    run(program, {
      mode: "vm",
      inject: {
        __dirname: folder,
        __filename: input,
      },
    });
  });

program

  .command("gen <input> <output>")
  .description(
    "Generate .js code from .astx files (For debugging - code is not optimized or human readable)"
  )
  .action((input, output) => {
    console.log("Loading .astx file...");

    const program = loadFromFile(input);

    console.log("Generating JS Code...");
    const code = generateJSCode(program);

    console.log("Saving to file...");
    writeFileSync(output, code);
  });

program

  .command("version")
  .description(
    "Show the version of the runtime and the astx/lib that includes the compiler"
  )
  .action(() => {
    console.log(`CLI: ${version}`);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    console.log(`Compiler: ${require("@astx/compiler/package.json").version}`);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    console.log(`Runtime: ${require("@astx/runtime/package.json").version}`);
  });

program.showHelpAfterError();
program.version(version);

program.parse(process.argv);
