"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCommand = void 0;
const commander_1 = require("commander");
const api_1 = require("../api");
const format_1 = require("../format");
const chalk_1 = __importDefault(require("chalk"));
exports.listCommand = new commander_1.Command('list')
    .description('List all available skills')
    .option('-c, --category <category>', 'Filter by category')
    .option('-l, --limit <n>', 'Max results', '50')
    .action(async (opts) => {
    try {
        const skills = await (0, api_1.fetchSkills)({
            category: opts.category,
            limit: parseInt(opts.limit, 10),
        });
        if (!skills.length) {
            (0, format_1.printEmpty)('No skills found.');
            return;
        }
        // Group by category
        const groups = new Map();
        for (const skill of skills) {
            const cat = skill.category ?? 'Other';
            if (!groups.has(cat))
                groups.set(cat, []);
            groups.get(cat).push(skill);
        }
        console.log();
        if (opts.category) {
            console.log(chalk_1.default.bold(`  ${skills.length} skill${skills.length !== 1 ? 's' : ''} · ${opts.category}`));
            console.log();
            skills.forEach((s, i) => (0, format_1.printSkillCard)(s, i));
        }
        else {
            for (const [category, catSkills] of groups) {
                console.log(chalk_1.default.bold(`  ${category}`) + chalk_1.default.dim(`  (${catSkills.length})`));
                console.log();
                catSkills.forEach((s, i) => (0, format_1.printSkillCard)(s, i));
            }
        }
    }
    catch (err) {
        (0, format_1.printError)(err.message);
        process.exit(1);
    }
});
