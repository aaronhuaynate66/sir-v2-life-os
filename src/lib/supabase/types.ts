// SIR V2 — Supabase database types (Sesión 20c)
//
// Hand-derived from supabase/migrations/0001_initial_schema.sql + 0002_text_ids.sql.
// Equivalente a `supabase gen types typescript --project-id rzdtlkfeuswhdbmwivsy`
// pero escrito a mano para evitar la dependencia de `supabase login` en CI.
//
// Si el schema cambia: actualizar este archivo manualmente o correr `supabase gen types`.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string | null
          full_name: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email?: string | null
          full_name?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['profiles']['Insert']>
      }
      self_metrics: {
        Row: {
          id: string
          user_id: string
          category: 'energy' | 'mood' | 'stress' | 'focus' | 'motivation' | 'confidence'
          value: number
          note: string | null
          measured_at: string
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          category: 'energy' | 'mood' | 'stress' | 'focus' | 'motivation' | 'confidence'
          value: number
          note?: string | null
          measured_at: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['self_metrics']['Insert']>
      }
      health_metrics: {
        Row: {
          id: string
          user_id: string
          type: 'weight' | 'blood_pressure' | 'heart_rate' | 'steps' | 'calories' | 'hydration' | 'custom'
          value: number
          unit: string
          note: string | null
          measured_at: string
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          type: 'weight' | 'blood_pressure' | 'heart_rate' | 'steps' | 'calories' | 'hydration' | 'custom'
          value: number
          unit: string
          note?: string | null
          measured_at: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['health_metrics']['Insert']>
      }
      sleep_records: {
        Row: {
          id: string
          user_id: string
          date: string
          bedtime: string
          wake_time: string
          duration: number
          quality: number
          dreams: string | null
          notes: string | null
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          date: string
          bedtime: string
          wake_time: string
          duration: number
          quality: number
          dreams?: string | null
          notes?: string | null
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['sleep_records']['Insert']>
      }
      self_diagnosis: {
        Row: {
          id: string
          user_id: string
          emotional_state: string
          anxieties: string[]
          blocks: string[]
          stopped_tolerating: string[]
          understandings: string[]
          anchors: string[]
          ideal_life_vision: string
          future_self: string
          updated_at: string
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          emotional_state?: string
          anxieties?: string[]
          blocks?: string[]
          stopped_tolerating?: string[]
          understandings?: string[]
          anchors?: string[]
          ideal_life_vision?: string
          future_self?: string
          updated_at?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['self_diagnosis']['Insert']>
      }
      person_links: {
        Row: {
          id: string
          user_id: string
          person_a_id: string
          person_b_id: string
          kind: string
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          person_a_id: string
          person_b_id: string
          kind: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['person_links']['Insert']>
      }
      finance_movements: {
        Row: {
          id: string
          user_id: string
          type: 'income' | 'expense' | 'investment' | 'transfer' | 'debt'
          amount: number
          currency: 'PEN' | 'USD'
          exchange_rate: number
          amount_pen: number
          category: 'housing' | 'food' | 'transport' | 'health' | 'entertainment' | 'investment' | 'business' | 'personal' | 'debt' | 'other'
          intent: 'obligatorio' | 'necesario' | 'no_esencial' | null
          description: string
          date: string
          recurrent: boolean
          recurrent_period: string | null
          related_goal: string | null
          tags: string[]
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          type: 'income' | 'expense' | 'investment' | 'transfer' | 'debt'
          amount: number
          currency?: 'PEN' | 'USD'
          exchange_rate?: number
          amount_pen: number
          category: 'housing' | 'food' | 'transport' | 'health' | 'entertainment' | 'investment' | 'business' | 'personal' | 'debt' | 'other'
          intent?: 'obligatorio' | 'necesario' | 'no_esencial' | null
          description: string
          date: string
          recurrent?: boolean
          recurrent_period?: string | null
          related_goal?: string | null
          tags?: string[]
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['finance_movements']['Insert']>
      }
      goals: {
        Row: {
          id: string
          user_id: string
          title: string
          description: string
          category: 'financial' | 'personal' | 'relational' | 'health' | 'career' | 'spiritual' | 'creative'
          priority: 'critical' | 'high' | 'medium' | 'low'
          status: 'active' | 'paused' | 'completed' | 'abandoned'
          target_date: string | null
          progress: number
          milestones: Json
          related_goals: string[]
          related_persons: string[]
          peace_impact: number
          obstacles: string[]
          next_action: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          title: string
          description?: string
          category: 'financial' | 'personal' | 'relational' | 'health' | 'career' | 'spiritual' | 'creative'
          priority: 'critical' | 'high' | 'medium' | 'low'
          status: 'active' | 'paused' | 'completed' | 'abandoned'
          target_date?: string | null
          progress?: number
          milestones?: Json
          related_goals?: string[]
          related_persons?: string[]
          peace_impact?: number
          obstacles?: string[]
          next_action?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['goals']['Insert']>
      }
      objective_steps: {
        Row: {
          id: string
          user_id: string
          objective_id: string
          title: string
          description: string
          target_date: string | null
          status: 'pendiente' | 'en_progreso' | 'hecho'
          sort_order: number
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          objective_id: string
          title: string
          description?: string
          target_date?: string | null
          status?: 'pendiente' | 'en_progreso' | 'hecho'
          sort_order?: number
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['objective_steps']['Insert']>
      }
      signals: {
        Row: {
          id: string
          user_id: string
          source: 'linkedin' | 'instagram' | 'calendar' | 'biological' | 'financial' | 'relational' | 'manual'
          type: 'opportunity' | 'warning' | 'pattern' | 'timing' | 'emotional' | 'relational' | 'biological' | 'financial'
          content: string
          strength: number
          urgency: 'immediate' | 'soon' | 'monitor' | 'archive'
          related_persons: string[]
          related_goals: string[]
          meaning: string | null
          action_required: boolean
          suggested_action: string | null
          detected_at: string
          expires_at: string | null
          resolved: boolean
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          source: 'linkedin' | 'instagram' | 'calendar' | 'biological' | 'financial' | 'relational' | 'manual'
          type: 'opportunity' | 'warning' | 'pattern' | 'timing' | 'emotional' | 'relational' | 'biological' | 'financial'
          content: string
          strength?: number
          urgency: 'immediate' | 'soon' | 'monitor' | 'archive'
          related_persons?: string[]
          related_goals?: string[]
          meaning?: string | null
          action_required?: boolean
          suggested_action?: string | null
          detected_at: string
          expires_at?: string | null
          resolved?: boolean
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['signals']['Insert']>
      }
      people: {
        Row: {
          id: string
          user_id: string
          name: string
          alias: string | null
          relationship: 'family' | 'friend' | 'romantic' | 'professional' | 'mentor' | 'mentee' | 'acquaintance'
          category: 'inner_circle' | 'close' | 'network' | 'peripheral'
          importance_score: number
          energy_impact: 'energizing' | 'draining' | 'neutral'
          trust_level: number
          last_contact: string | null
          contact_frequency: string
          location: string | null
          tags: string[]
          notes: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          name: string
          alias?: string | null
          relationship: 'family' | 'friend' | 'romantic' | 'professional' | 'mentor' | 'mentee' | 'acquaintance'
          category: 'inner_circle' | 'close' | 'network' | 'peripheral'
          importance_score: number
          energy_impact: 'energizing' | 'draining' | 'neutral'
          trust_level: number
          last_contact?: string | null
          contact_frequency?: string
          location?: string | null
          tags?: string[]
          notes?: string
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['people']['Insert']>
      }
      relationships: {
        Row: {
          id: string
          user_id: string
          person_id: string
          type: 'family' | 'friend' | 'romantic' | 'professional' | 'mentor' | 'mentee' | 'acquaintance'
          status: 'active' | 'dormant' | 'strained' | 'ended'
          depth: number
          reciprocity: number
          history: Json
          shared_goals: string[]
          tensions: string[]
          strengths: string[]
          next_action: string | null
          next_action_date: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          user_id: string
          person_id: string
          type: 'family' | 'friend' | 'romantic' | 'professional' | 'mentor' | 'mentee' | 'acquaintance'
          status: 'active' | 'dormant' | 'strained' | 'ended'
          depth?: number
          reciprocity?: number
          history?: Json
          shared_goals?: string[]
          tensions?: string[]
          strengths?: string[]
          next_action?: string | null
          next_action_date?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['relationships']['Insert']>
      }
      memories: {
        Row: {
          id: string
          user_id: string
          type: 'episodic' | 'semantic' | 'emotional' | 'relational' | 'temporal' | 'predictive'
          title: string
          content: string
          entities: string[]
          emotional_charge: number
          importance: number
          decay_rate: number
          tags: string[]
          related_memories: string[]
          occurred_at: string
          last_accessed: string
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          type: 'episodic' | 'semantic' | 'emotional' | 'relational' | 'temporal' | 'predictive'
          title: string
          content: string
          entities?: string[]
          emotional_charge?: number
          importance?: number
          decay_rate?: number
          tags?: string[]
          related_memories?: string[]
          occurred_at: string
          last_accessed?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['memories']['Insert']>
      }
      snapshots: {
        Row: {
          id: string
          user_id: string
          trigger_reason: string
          peace_score: number
          peace_mode: 'normal' | 'focused' | 'recovery' | 'strategic'
          summary: string[]
          risks: string[]
          opportunities: string[]
          context_json: Json | null
          captured_at: string
          created_at: string
        }
        Insert: {
          id: string
          user_id: string
          trigger_reason: string
          peace_score: number
          peace_mode: 'normal' | 'focused' | 'recovery' | 'strategic'
          summary?: string[]
          risks?: string[]
          opportunities?: string[]
          context_json?: Json | null
          captured_at: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['snapshots']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
  }
}

export type TableName = keyof Database['public']['Tables']
export type Row<T extends TableName> = Database['public']['Tables'][T]['Row']
export type InsertRow<T extends TableName> = Database['public']['Tables'][T]['Insert']
