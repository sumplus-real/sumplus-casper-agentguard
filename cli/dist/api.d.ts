export interface Skill {
    id: string;
    name: string;
    description: string;
    category: string;
    tags: string[];
    schema?: object;
    usage_examples?: Array<{
        title: string;
        input: object;
    }>;
    author_type?: string;
    version?: string;
}
export declare function fetchSkills(params: {
    search?: string;
    category?: string;
    limit?: number;
}): Promise<Skill[]>;
export declare function fetchSkill(id: string): Promise<Skill>;
