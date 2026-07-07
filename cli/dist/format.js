"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.printSkillCard = printSkillCard;
exports.printSkillDetail = printSkillDetail;
exports.printError = printError;
exports.printEmpty = printEmpty;
const chalk_1 = __importDefault(require("chalk"));
// ── palette ───────────────────────────────────────────────────────────────────
const blue = chalk_1.default.hex('#029EE7');
const purple = chalk_1.default.hex('#a78bfa');
const dim = chalk_1.default.dim;
const bold = chalk_1.default.bold;
// ── skill card (used in list / search) ───────────────────────────────────────
function printSkillCard(skill, index) {
    const prefix = index !== undefined ? dim(`${String(index + 1).padStart(2)}. `) : '   ';
    console.log(prefix + bold(skill.name) + dim(` · ${skill.id}`));
    console.log('    ' + dim(skill.category) + '  ' + formatTags(skill.tags));
    const desc = skill.description?.replace(/\[ARSENAL-HOSTED ✓\]\s*/g, '').replace(/\[DEMO MODE\]\s*/g, '').trim();
    if (desc) {
        const preview = desc.length > 120 ? desc.slice(0, 117) + '…' : desc;
        console.log('    ' + dim(preview));
    }
    console.log();
}
// ── full skill detail ─────────────────────────────────────────────────────────
function printSkillDetail(skill) {
    console.log();
    console.log(bold(blue('▸ ' + skill.name)));
    console.log(dim('  ' + skill.id));
    console.log();
    // meta row
    const meta = [
        skill.category && dim('Category: ') + skill.category,
        skill.version && dim('Version: ') + skill.version,
        skill.author_type === 'official' && chalk_1.default.green('✓ Official'),
    ].filter(Boolean).join('   ');
    if (meta)
        console.log('  ' + meta);
    if (skill.tags?.length)
        console.log('  ' + formatTags(skill.tags));
    console.log();
    // description (strip badges)
    const desc = skill.description
        ?.replace(/\[ARSENAL-HOSTED ✓\]\s*/g, '')
        .replace(/\[DEMO MODE\]\s*/g, '')
        .split('\n')[0]
        .trim();
    if (desc) {
        console.log('  ' + desc);
        console.log();
    }
    // schema actions
    const schema = skill.schema;
    const actionEnum = schema?.properties?.action?.enum;
    if (actionEnum?.length) {
        console.log(bold('  Actions'));
        for (const action of actionEnum) {
            console.log('    ' + blue('·') + ' ' + action);
        }
        console.log();
    }
    // parameters
    const props = schema?.properties;
    if (props) {
        const required = schema?.required ?? [];
        const params = Object.entries(props).filter(([k]) => k !== 'action');
        if (params.length) {
            console.log(bold('  Parameters'));
            for (const [name, def] of params) {
                const req = required.includes(name) ? chalk_1.default.yellow(' required') : '';
                const type = def.type ? dim(` (${def.type})`) : '';
                console.log(`    ${purple(name)}${type}${req}`);
                if (def.description) {
                    const descLine = def.description.length > 100
                        ? def.description.slice(0, 97) + '…'
                        : def.description;
                    console.log(`      ${dim(descLine)}`);
                }
            }
            console.log();
        }
    }
    // examples
    if (skill.usage_examples?.length) {
        console.log(bold('  Examples'));
        for (const ex of skill.usage_examples.slice(0, 2)) {
            console.log('    ' + dim('· ' + ex.title));
            console.log('      ' + dim(JSON.stringify(ex.input)));
        }
        console.log();
    }
}
// ── helpers ───────────────────────────────────────────────────────────────────
function formatTags(tags) {
    if (!tags?.length)
        return '';
    return tags.slice(0, 6).map(t => chalk_1.default.bgHex('#1e293b').hex('#94a3b8')(` ${t} `)).join(' ');
}
function printError(msg) {
    console.error(chalk_1.default.red('✗ ' + msg));
}
function printEmpty(msg) {
    console.log(chalk_1.default.dim(msg));
}
