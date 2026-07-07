import { Command } from 'commander';
import { fetchSkill } from '../api';
import { printSkillDetail, printError } from '../format';

export const infoCommand = new Command('info')
  .description('Show full schema and details for a skill')
  .argument('<skill-id>', 'Skill UUID')
  .action(async (skillId: string) => {
    try {
      const skill = await fetchSkill(skillId);
      printSkillDetail(skill);
    } catch (err: any) {
      printError(err.message);
      process.exit(1);
    }
  });
