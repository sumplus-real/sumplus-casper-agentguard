"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchCommand = void 0;
const commander_1 = require("commander");
const api_1 = require("../api");
const format_1 = require("../format");
const chalk_1 = __importDefault(require("chalk"));
exports.searchCommand = new commander_1.Command('search')
    .description('Search skills by keyword')
    .argument('[query]', 'Search query')
    .option('-c, --category <category>', 'Filter by category (e.g. DeFi, Blockchain)')
    .option('-l, --limit <n>', 'Max results', '20')
    .action(async (query, opts) => {
    try {
        const skills = await (0, api_1.fetchSkills)({
            search: query,
            category: opts.category,
            limit: parseInt(opts.limit, 10),
        });
        if (!skills.length) {
            (0, format_1.printEmpty)(query ? `No skills found for "${query}"` : 'No skills found.');
            return;
        }
        const label = [
            query && `"${query}"`,
            opts.category && `category: ${opts.category}`,
        ].filter(Boolean).join(', ');
        console.log();
        console.log(chalk_1.default.bold(`  ${skills.length} skill${skills.length !== 1 ? 's' : ''}${label ? ` for ${label}` : ''}`));
        console.log();
        skills.forEach((s, i) => (0, format_1.printSkillCard)(s, i));
    }
    catch (err) {
        (0, format_1.printError)(err.message);
        process.exit(1);
    }
});
