import { Command } from 'commander';
import { fetchSkills } from '../api';
import { printSkillCard, printError, printEmpty } from '../format';
import chalk from 'chalk';

export const searchCommand = new Command('search')
  .description('Search skills by keyword')
  .argument('[query]', 'Search query')
  .option('-c, --category <category>', 'Filter by category (e.g. DeFi, Blockchain)')
  .option('-l, --limit <n>', 'Max results', '20')
  .action(async (query: string | undefined, opts: { category?: string; limit: string }) => {
    try {
      const skills = await fetchSkills({
        search: query,
        category: opts.category,
        limit: parseInt(opts.limit, 10),
      });

      if (!skills.length) {
        printEmpty(query ? `No skills found for "${query}"` : 'No skills found.');
        return;
      }

      const label = [
        query && `"${query}"`,
        opts.category && `category: ${opts.category}`,
      ].filter(Boolean).join(', ');

      console.log();
      console.log(chalk.bold(`  ${skills.length} skill${skills.length !== 1 ? 's' : ''}${label ? ` for ${label}` : ''}`));
      console.log();
      skills.forEach((s, i) => printSkillCard(s, i));
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
