#!/usr/bin/env node
import { main } from "../src/cli/main.js";

process.exitCode = await main();
