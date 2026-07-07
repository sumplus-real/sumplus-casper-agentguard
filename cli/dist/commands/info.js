"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.infoCommand = void 0;
const commander_1 = require("commander");
const api_1 = require("../api");
const format_1 = require("../format");
exports.infoCommand = new commander_1.Command('info')
    .description('Show full schema and details for a skill')
    .argument('<skill-id>', 'Skill UUID')
    .action(async (skillId) => {
    try {
        const skill = await (0, api_1.fetchSkill)(skillId);
        (0, format_1.printSkillDetail)(skill);
    }
    catch (err) {
        (0, format_1.printError)(err.message);
        process.exit(1);
    }
});
