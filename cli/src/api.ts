const BASE = 'https://arsenal.sumplus.xyz';

export interface Skill {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  schema?: object;
  usage_examples?: Array<{ title: string; input: object }>;
  author_type?: string;
  version?: string;
}

export async function fetchSkills(params: {
  search?: string;
  category?: string;
  limit?: number;
}): Promise<Skill[]> {
  const qs = new URLSearchParams();
  if (params.search)   qs.set('search', params.search);
  if (params.category) qs.set('category', params.category);
  if (params.limit)    qs.set('limit', String(params.limit));
  qs.set('status', 'approved');

  const res = await fetch(`${BASE}/api/skills?${qs}`);
  if (!res.ok) throw new Error(`API error ${res.status}`);
  const data = await res.json() as { skills?: Skill[] } | Skill[];
  return (Array.isArray(data) ? data : data.skills) ?? [];
}

export async function fetchSkill(id: string): Promise<Skill> {
  const res = await fetch(`${BASE}/api/skills/${id}`);
  if (!res.ok) throw new Error(res.status === 404 ? `Skill not found: ${id}` : `API error ${res.status}`);
  const data = await res.json() as { skill?: Skill } | Skill;
  return ('skill' in data && data.skill ? data.skill : data) as Skill;
}
