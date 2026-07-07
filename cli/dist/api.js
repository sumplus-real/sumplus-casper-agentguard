"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchSkills = fetchSkills;
exports.fetchSkill = fetchSkill;
const BASE = 'https://arsenal.sumplus.xyz';
async function fetchSkills(params) {
    const qs = new URLSearchParams();
    if (params.search)
        qs.set('search', params.search);
    if (params.category)
        qs.set('category', params.category);
    if (params.limit)
        qs.set('limit', String(params.limit));
    qs.set('status', 'approved');
    const res = await fetch(`${BASE}/api/skills?${qs}`);
    if (!res.ok)
        throw new Error(`API error ${res.status}`);
    const data = await res.json();
    return (Array.isArray(data) ? data : data.skills) ?? [];
}
async function fetchSkill(id) {
    const res = await fetch(`${BASE}/api/skills/${id}`);
    if (!res.ok)
        throw new Error(res.status === 404 ? `Skill not found: ${id}` : `API error ${res.status}`);
    const data = await res.json();
    return ('skill' in data && data.skill ? data.skill : data);
}
