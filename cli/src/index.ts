#!/usr/bin/env node

import { Command } from 'commander';
import { searchCommand } from './commands/search';
import { infoCommand } from './commands/info';
import { listCommand } from './commands/list';

const program = new Command();

program
  .name('arsenal')
  .description('Discover and browse Sumplus Arsenal skills')
  .version('1.0.0');

program.addCommand(searchCommand);
program.addCommand(infoCommand);
program.addCommand(listCommand);

program.parse();
