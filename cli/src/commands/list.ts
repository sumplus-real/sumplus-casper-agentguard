import { Command } from 'commander';
import { fetchSkills } from '../api';
import { printSkillCard, printError, printEmpty } from '../format';
import chalk from 'chalk';

export const listCommand = new Command('list')
  .description('List all available skills')
  .option('-c, --category <category>', 'Filter by category')
  .option('-l, --limit <n>', 'Max results', '50')
  .action(async (opts: { category?: string; limit: string }) => {
    try {
      const skills = await fetchSkills({
        category: opts.category,
        limit: parseInt(opts.limit, 10),
      });

      if (!skills.length) {
        printEmpty('No skills found.');
        return;
      }

      // Group by category
      const groups = new Map<string, typeof skills>();
      for (const skill of skills) {
        const cat = skill.category ?? 'Other';
        if (!groups.has(cat)) groups.set(cat, []);
        groups.get(cat)!.push(skill);
      }

      console.log();
      if (opts.category) {
        console.log(chalk.bold(`  ${skills.length} skill${skills.length !== 1 ? 's' : ''} · ${opts.category}`));
        console.log();
        skills.forEach((s, i) => printSkillCard(s, i));
      } else {
        for (const [category, catSkills] of groups) {
          console.log(chalk.bold(`  ${category}`) + chalk.dim(`  (${catSkills.length})`));
          console.log();
          catSkills.forEach((s, i) => printSkillCard(s, i));
        }
      }
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
