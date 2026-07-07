import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type definitions for database tables
export type Skill = {
  id: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  author_id: string;
  author_type: 'official' | 'community';
  version: string;
  schema: any; // JSON schema for the skill
  code: string; // Actual skill implementation
  usage_examples: any[]; // Array of usage examples
  is_paid: boolean;
  price?: number;
  status: 'pending' | 'approved' | 'rejected';
  rating_avg: number;
  rating_count: number;
  usage_count: number;
  created_at: string;
  updated_at: string;
};

export type User = {
  id: string;
  email: string;
  role: 'admin' | 'official' | 'user' | 'agent';
  api_key?: string;
  created_at: string;
  updated_at: string;
};

export type Rating = {
  id: string;
  skill_id: string;
  user_id: string;
  rating: number; // 1-5
  review?: string;
  created_at: string;
  updated_at: string;
};

export type Payment = {
  id: string;
  user_id: string;
  skill_id: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  payment_method: 'x402' | 'other';
  transaction_id?: string;
  created_at: string;
  updated_at: string;
};
