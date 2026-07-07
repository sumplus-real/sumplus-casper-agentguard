#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const commander_1 = require("commander");
const search_1 = require("./commands/search");
const info_1 = require("./commands/info");
const list_1 = require("./commands/list");
const program = new commander_1.Command();
program
    .name('arsenal')
    .description('Discover and browse Sumplus Arsenal skills')
    .version('1.0.0');
program.addCommand(search_1.searchCommand);
program.addCommand(info_1.infoCommand);
program.addCommand(list_1.listCommand);
program.parse();
