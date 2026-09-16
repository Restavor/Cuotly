// Generado a partir del esquema real del proyecto de Supabase de Cuotly
// (generate_typescript_types, 16/09/2026), con las 94 migraciones del
// repositorio aplicadas.
//
// NO se edita a mano. Se regenera contra el proyecto cada vez que se
// aplica una migración nueva.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      absences: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          ends_on: string
          id: string
          reason: string | null
          space_id: string
          starts_on: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          ends_on: string
          id?: string
          reason?: string | null
          space_id: string
          starts_on: string
          state?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          ends_on?: string
          id?: string
          reason?: string | null
          space_id?: string
          starts_on?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "absences_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "absences_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      acceptances: {
        Row: {
          accepted_at: string
          accepted_by: string
          budgeted: boolean
          category: string
          consumption_cycle_id: string | null
          consumption_entry_id: string | null
          establishment_id: string
          id: string
          job_id: string | null
          request_id: string
          space_id: string
        }
        Insert: {
          accepted_at?: string
          accepted_by: string
          budgeted?: boolean
          category: string
          consumption_cycle_id?: string | null
          consumption_entry_id?: string | null
          establishment_id: string
          id?: string
          job_id?: string | null
          request_id: string
          space_id: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string
          budgeted?: boolean
          category?: string
          consumption_cycle_id?: string | null
          consumption_entry_id?: string | null
          establishment_id?: string
          id?: string
          job_id?: string | null
          request_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "acceptances_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acceptances_consumption_cycle_id_fkey"
            columns: ["consumption_cycle_id"]
            isOneToOne: false
            referencedRelation: "consumption_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acceptances_consumption_entry_id_fkey"
            columns: ["consumption_entry_id"]
            isOneToOne: false
            referencedRelation: "consumption_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acceptances_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acceptances_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "client_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acceptances_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acceptances_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "acceptances_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_usage: {
        Row: {
          classification_id: string
          created_at: string
          estimated_cost_cents: number
          estimated_cost_millicents: number
          id: string
          input_tokens: number
          model: string
          output_tokens: number
          request_id: string
          space_id: string
        }
        Insert: {
          classification_id: string
          created_at?: string
          estimated_cost_cents: number
          estimated_cost_millicents?: number
          id?: string
          input_tokens: number
          model: string
          output_tokens: number
          request_id: string
          space_id: string
        }
        Update: {
          classification_id?: string
          created_at?: string
          estimated_cost_cents?: number
          estimated_cost_millicents?: number
          id?: string
          input_tokens?: number
          model?: string
          output_tokens?: number
          request_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_classification_id_fkey"
            columns: ["classification_id"]
            isOneToOne: false
            referencedRelation: "classifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_usage_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_weights: {
        Row: {
          created_at: string
          created_by: string | null
          criterion: string
          id: string
          space_id: string
          weight: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          criterion: string
          id?: string
          space_id: string
          weight: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          criterion?: string
          id?: string
          space_id?: string
          weight?: number
        }
        Relationships: [
          {
            foreignKeyName: "assignment_weights_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_weights_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          assigned_at: string
          assigned_by: string | null
          assignee_id: string
          id: string
          job_id: string
          kind: string
          reason: string | null
          released_at: string | null
          space_id: string
        }
        Insert: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_id: string
          id?: string
          job_id: string
          kind: string
          reason?: string | null
          released_at?: string | null
          space_id: string
        }
        Update: {
          assigned_at?: string
          assigned_by?: string | null
          assignee_id?: string
          id?: string
          job_id?: string
          kind?: string
          reason?: string | null
          released_at?: string | null
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_assigned_by_fkey"
            columns: ["assigned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "client_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          action: string
          actor_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string | null
          space_id: string | null
          support_session_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          space_id?: string | null
          support_session_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string | null
          space_id?: string | null
          support_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_support_session_id_fkey"
            columns: ["support_session_id"]
            isOneToOne: false
            referencedRelation: "support_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      blocks: {
        Row: {
          ended_at: string | null
          ended_by: string | null
          id: string
          job_id: string
          note: string | null
          reason_type: string
          reverted: boolean
          space_id: string
          started_at: string
          started_by: string | null
        }
        Insert: {
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          job_id: string
          note?: string | null
          reason_type: string
          reverted?: boolean
          space_id: string
          started_at?: string
          started_by?: string | null
        }
        Update: {
          ended_at?: string | null
          ended_by?: string | null
          id?: string
          job_id?: string
          note?: string | null
          reason_type?: string
          reverted?: boolean
          space_id?: string
          started_at?: string
          started_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_ended_by_fkey"
            columns: ["ended_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "client_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "blocks_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      charges: {
        Row: {
          base_cents: number
          concept: string
          created_at: string
          due_at: string
          establishment_id: string
          id: string
          issued_at: string
          issued_by: string | null
          period_end: string
          period_start: string
          quote_id: string | null
          space_id: string
          subscription_id: string | null
          tax_cents: number
          tax_rate_percent: number
          total_cents: number
        }
        Insert: {
          base_cents: number
          concept: string
          created_at?: string
          due_at: string
          establishment_id: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          period_end: string
          period_start: string
          quote_id?: string | null
          space_id: string
          subscription_id?: string | null
          tax_cents: number
          tax_rate_percent: number
          total_cents: number
        }
        Update: {
          base_cents?: number
          concept?: string
          created_at?: string
          due_at?: string
          establishment_id?: string
          id?: string
          issued_at?: string
          issued_by?: string | null
          period_end?: string
          period_start?: string
          quote_id?: string | null
          space_id?: string
          subscription_id?: string | null
          tax_cents?: number
          tax_rate_percent?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "charges_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_issued_by_fkey"
            columns: ["issued_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "charges_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      classifications: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decided_category: string | null
          decided_summary: string | null
          fallback_reason: string | null
          id: string
          input_tokens: number | null
          matched_keywords: string[] | null
          model: string | null
          output_tokens: number | null
          proposed_category: string
          proposed_summary: string
          request_id: string
          source: string
          space_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_category?: string | null
          decided_summary?: string | null
          fallback_reason?: string | null
          id?: string
          input_tokens?: number | null
          matched_keywords?: string[] | null
          model?: string | null
          output_tokens?: number | null
          proposed_category: string
          proposed_summary: string
          request_id: string
          source: string
          space_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_category?: string | null
          decided_summary?: string | null
          fallback_reason?: string | null
          id?: string
          input_tokens?: number | null
          matched_keywords?: string[] | null
          model?: string | null
          output_tokens?: number | null
          proposed_category?: string
          proposed_summary?: string
          request_id?: string
          source?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "classifications_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classifications_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "classifications_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_cycles: {
        Row: {
          created_at: string
          cycle_end: string
          cycle_start: string
          establishment_id: string
          id: string
          included_large: number
          included_medium: number
          included_photo: number
          included_small: number
          space_id: string
          subscription_id: string
        }
        Insert: {
          created_at?: string
          cycle_end: string
          cycle_start: string
          establishment_id: string
          id?: string
          included_large: number
          included_medium: number
          included_photo: number
          included_small: number
          space_id: string
          subscription_id: string
        }
        Update: {
          created_at?: string
          cycle_end?: string
          cycle_start?: string
          establishment_id?: string
          id?: string
          included_large?: number
          included_medium?: number
          included_photo?: number
          included_small?: number
          space_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumption_cycles_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_cycles_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_cycles_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      consumption_entries: {
        Row: {
          amount: number
          category: string
          consumption_cycle_id: string
          created_at: string
          created_by: string | null
          entry_type: string
          establishment_id: string
          id: string
          job_id: string | null
          reason: string | null
          related_entry_id: string | null
          request_id: string | null
          space_id: string
        }
        Insert: {
          amount: number
          category: string
          consumption_cycle_id: string
          created_at?: string
          created_by?: string | null
          entry_type: string
          establishment_id: string
          id?: string
          job_id?: string | null
          reason?: string | null
          related_entry_id?: string | null
          request_id?: string | null
          space_id: string
        }
        Update: {
          amount?: number
          category?: string
          consumption_cycle_id?: string
          created_at?: string
          created_by?: string | null
          entry_type?: string
          establishment_id?: string
          id?: string
          job_id?: string | null
          reason?: string | null
          related_entry_id?: string | null
          request_id?: string | null
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "consumption_entries_consumption_cycle_id_fkey"
            columns: ["consumption_cycle_id"]
            isOneToOne: false
            referencedRelation: "consumption_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "client_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_related_entry_id_fkey"
            columns: ["related_entry_id"]
            isOneToOne: false
            referencedRelation: "consumption_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "consumption_entries_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_reads: {
        Row: {
          conversation_id: string
          last_read_at: string
          space_id: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          last_read_at?: string
          space_id: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          last_read_at?: string
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_reads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversation_reads_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string
          establishment_id: string | null
          id: string
          job_id: string | null
          request_id: string | null
          space_id: string
          type: string
        }
        Insert: {
          created_at?: string
          establishment_id?: string | null
          id?: string
          job_id?: string | null
          request_id?: string | null
          space_id: string
          type: string
        }
        Update: {
          created_at?: string
          establishment_id?: string | null
          id?: string
          job_id?: string | null
          request_id?: string | null
          space_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "client_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      corrections: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          description: string
          establishment_id: string
          id: string
          job_id: string
          kind: string
          request_id: string
          requested_at: string
          requested_by: string | null
          space_id: string
          started_at: string | null
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          description: string
          establishment_id: string
          id?: string
          job_id: string
          kind: string
          request_id: string
          requested_at?: string
          requested_by?: string | null
          space_id: string
          started_at?: string | null
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          description?: string
          establishment_id?: string
          id?: string
          job_id?: string
          kind?: string
          request_id?: string
          requested_at?: string
          requested_by?: string | null
          space_id?: string
          started_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "corrections_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "client_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "corrections_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cuotly_charges: {
        Row: {
          base_cents: number
          breakdown: Json
          concept: string
          created_at: string
          due_at: string
          id: string
          issued_at: string
          kind: string
          period_end: string
          period_start: string
          reference: string
          space_id: string
          subscription_id: string
          tax_cents: number
          tax_rate_percent: number
          total_cents: number
        }
        Insert: {
          base_cents: number
          breakdown?: Json
          concept: string
          created_at?: string
          due_at: string
          id?: string
          issued_at?: string
          kind: string
          period_end: string
          period_start: string
          reference: string
          space_id: string
          subscription_id: string
          tax_cents: number
          tax_rate_percent: number
          total_cents: number
        }
        Update: {
          base_cents?: number
          breakdown?: Json
          concept?: string
          created_at?: string
          due_at?: string
          id?: string
          issued_at?: string
          kind?: string
          period_end?: string
          period_start?: string
          reference?: string
          space_id?: string
          subscription_id?: string
          tax_cents?: number
          tax_rate_percent?: number
          total_cents?: number
        }
        Relationships: [
          {
            foreignKeyName: "cuotly_charges_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuotly_charges_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "cuotly_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      cuotly_ledger_entries: {
        Row: {
          amount_cents: number
          charge_id: string
          created_at: string
          created_by: string | null
          entry_type: string
          id: string
          payment_id: string | null
          reason: string | null
          space_id: string
        }
        Insert: {
          amount_cents: number
          charge_id: string
          created_at?: string
          created_by?: string | null
          entry_type: string
          id?: string
          payment_id?: string | null
          reason?: string | null
          space_id: string
        }
        Update: {
          amount_cents?: number
          charge_id?: string
          created_at?: string
          created_by?: string | null
          entry_type?: string
          id?: string
          payment_id?: string | null
          reason?: string | null
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuotly_ledger_entries_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "cuotly_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuotly_ledger_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuotly_ledger_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "cuotly_payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuotly_ledger_entries_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cuotly_payments: {
        Row: {
          amount_cents: number
          charge_id: string
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          declared_at: string
          declared_by: string
          declared_side: string
          id: string
          idempotency_key: string | null
          method: string
          note: string | null
          paid_at: string
          receipt_file_id: string | null
          receipt_reference: string | null
          rejected_at: string | null
          rejected_by: string | null
          rejection_reason: string | null
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          space_id: string
        }
        Insert: {
          amount_cents: number
          charge_id: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          declared_at?: string
          declared_by: string
          declared_side: string
          id?: string
          idempotency_key?: string | null
          method: string
          note?: string | null
          paid_at: string
          receipt_file_id?: string | null
          receipt_reference?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          space_id: string
        }
        Update: {
          amount_cents?: number
          charge_id?: string
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          declared_at?: string
          declared_by?: string
          declared_side?: string
          id?: string
          idempotency_key?: string | null
          method?: string
          note?: string | null
          paid_at?: string
          receipt_file_id?: string | null
          receipt_reference?: string | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejection_reason?: string | null
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuotly_payments_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "cuotly_charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuotly_payments_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuotly_payments_declared_by_fkey"
            columns: ["declared_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuotly_payments_receipt_file_id_fkey"
            columns: ["receipt_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuotly_payments_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuotly_payments_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cuotly_payments_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      cuotly_subscriptions: {
        Row: {
          created_at: string
          current_period_end: string
          current_period_start: string
          extra_establishments: number
          extra_users: number
          id: string
          pending_extra_establishments: number
          pending_extra_users: number
          pending_plan: string | null
          pending_requested_at: string | null
          plan: string
          space_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          current_period_end: string
          current_period_start: string
          extra_establishments?: number
          extra_users?: number
          id?: string
          pending_extra_establishments?: number
          pending_extra_users?: number
          pending_plan?: string | null
          pending_requested_at?: string | null
          plan: string
          space_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          extra_establishments?: number
          extra_users?: number
          id?: string
          pending_extra_establishments?: number
          pending_extra_users?: number
          pending_plan?: string | null
          pending_requested_at?: string | null
          plan?: string
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cuotly_subscriptions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: true
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_memberships: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          revoked_at: string | null
          revoked_by: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_memberships_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_memberships_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_notes: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          archived_reason: string | null
          body: string
          created_at: string
          created_by: string
          establishment_id: string
          id: string
          operational: boolean
          space_id: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          body: string
          created_at?: string
          created_by: string
          establishment_id: string
          id?: string
          operational?: boolean
          space_id: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          archived_reason?: string | null
          body?: string
          created_at?: string
          created_by?: string
          establishment_id?: string
          id?: string
          operational?: boolean
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "establishment_notes_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_notes_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishment_notes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      establishment_permissions: {
        Row: {
          edit_establishment_data: boolean
          establishment_membership_id: string
          view_billing: boolean
        }
        Insert: {
          edit_establishment_data?: boolean
          establishment_membership_id: string
          view_billing?: boolean
        }
        Update: {
          edit_establishment_data?: boolean
          establishment_membership_id?: string
          view_billing?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "establishment_permissions_establishment_membership_id_fkey"
            columns: ["establishment_membership_id"]
            isOneToOne: true
            referencedRelation: "establishment_memberships"
            referencedColumns: ["id"]
          },
        ]
      }
      establishments: {
        Row: {
          address: string | null
          city: string | null
          code: string
          contact_email: string | null
          contact_name: string | null
          created_at: string
          domain: string | null
          facebook_url: string | null
          group_id: string
          id: string
          idempotency_key: string | null
          instagram: string | null
          legal_name: string | null
          name: string
          opening_hours: string | null
          phone_primary: string | null
          phone_secondary: string | null
          postal_code: string | null
          space_id: string
          status: string
          tax_id: string | null
          web_platform: string | null
          website_url: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          code?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          domain?: string | null
          facebook_url?: string | null
          group_id: string
          id?: string
          idempotency_key?: string | null
          instagram?: string | null
          legal_name?: string | null
          name: string
          opening_hours?: string | null
          phone_primary?: string | null
          phone_secondary?: string | null
          postal_code?: string | null
          space_id: string
          status?: string
          tax_id?: string | null
          web_platform?: string | null
          website_url?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          code?: string
          contact_email?: string | null
          contact_name?: string | null
          created_at?: string
          domain?: string | null
          facebook_url?: string | null
          group_id?: string
          id?: string
          idempotency_key?: string | null
          instagram?: string | null
          legal_name?: string | null
          name?: string
          opening_hours?: string | null
          phone_primary?: string | null
          phone_secondary?: string | null
          postal_code?: string | null
          space_id?: string
          status?: string
          tax_id?: string | null
          web_platform?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "establishments_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "establishments_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      file_links: {
        Row: {
          created_at: string
          created_by: string
          entity_id: string
          entity_type: string
          file_id: string
          id: string
          space_id: string
        }
        Insert: {
          created_at?: string
          created_by: string
          entity_id: string
          entity_type: string
          file_id: string
          id?: string
          space_id: string
        }
        Update: {
          created_at?: string
          created_by?: string
          entity_id?: string
          entity_type?: string
          file_id?: string
          id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_links_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_links_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      file_versions: {
        Row: {
          checksum: string | null
          created_at: string
          created_by: string
          file_id: string
          file_name: string
          id: string
          mime_type: string
          size_bytes: number
          space_id: string
          storage_path: string
          variant: string | null
          version_number: number
        }
        Insert: {
          checksum?: string | null
          created_at?: string
          created_by: string
          file_id: string
          file_name: string
          id?: string
          mime_type: string
          size_bytes: number
          space_id: string
          storage_path: string
          variant?: string | null
          version_number: number
        }
        Update: {
          checksum?: string | null
          created_at?: string
          created_by?: string
          file_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          size_bytes?: number
          space_id?: string
          storage_path?: string
          variant?: string | null
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "file_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_versions_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "file_versions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      files: {
        Row: {
          archived_at: string | null
          archived_by: string | null
          category: string
          created_at: string
          created_by: string
          deletion_reason: string | null
          deletion_requested_at: string | null
          deletion_requested_by: string | null
          establishment_id: string
          group_id: string
          id: string
          name: string
          space_id: string
          visibility: string
        }
        Insert: {
          archived_at?: string | null
          archived_by?: string | null
          category: string
          created_at?: string
          created_by: string
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          establishment_id: string
          group_id: string
          id?: string
          name: string
          space_id: string
          visibility?: string
        }
        Update: {
          archived_at?: string | null
          archived_by?: string | null
          category?: string
          created_at?: string
          created_by?: string
          deletion_reason?: string | null
          deletion_requested_at?: string | null
          deletion_requested_by?: string | null
          establishment_id?: string
          group_id?: string
          id?: string
          name?: string
          space_id?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "files_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_deletion_requested_by_fkey"
            columns: ["deletion_requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "files_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_entries: {
        Row: {
          amount_cents: number
          charge_id: string
          created_at: string
          created_by: string | null
          entry_type: string
          establishment_id: string
          id: string
          payment_id: string | null
          reason: string | null
          related_entry_id: string | null
          space_id: string
        }
        Insert: {
          amount_cents: number
          charge_id: string
          created_at?: string
          created_by?: string | null
          entry_type: string
          establishment_id: string
          id?: string
          payment_id?: string | null
          reason?: string | null
          related_entry_id?: string | null
          space_id: string
        }
        Update: {
          amount_cents?: number
          charge_id?: string
          created_at?: string
          created_by?: string | null
          entry_type?: string
          establishment_id?: string
          id?: string
          payment_id?: string | null
          reason?: string | null
          related_entry_id?: string | null
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_entries_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_related_entry_id_fkey"
            columns: ["related_entry_id"]
            isOneToOne: false
            referencedRelation: "financial_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "financial_entries_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      group_memberships: {
        Row: {
          created_at: string
          group_id: string
          id: string
          revoked_at: string | null
          revoked_by: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_memberships_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          created_at: string
          id: string
          name: string
          space_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          space_id: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "groups_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      help_articles: {
        Row: {
          audience: string[]
          body: string
          id: string
          published: boolean
          search: unknown
          slug: string
          title: string
          topic: string
          updated_at: string
          version: number
        }
        Insert: {
          audience: string[]
          body: string
          id?: string
          published?: boolean
          search?: unknown
          slug: string
          title: string
          topic: string
          updated_at?: string
          version?: number
        }
        Update: {
          audience?: string[]
          body?: string
          id?: string
          published?: boolean
          search?: unknown
          slug?: string
          title?: string
          topic?: string
          updated_at?: string
          version?: number
        }
        Relationships: []
      }
      holidays: {
        Row: {
          created_at: string
          created_by: string | null
          holiday_date: string
          id: string
          name: string
          space_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          holiday_date: string
          id?: string
          name: string
          space_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          holiday_date?: string
          id?: string
          name?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holidays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holidays_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_attachments: {
        Row: {
          content_type: string
          created_at: string
          id: string
          incident_id: string
          message_id: string | null
          name: string
          size_bytes: number
          space_id: string
          storage_path: string
          uploaded_by: string
          uploader_side: string
        }
        Insert: {
          content_type: string
          created_at?: string
          id?: string
          incident_id: string
          message_id?: string | null
          name: string
          size_bytes: number
          space_id: string
          storage_path: string
          uploaded_by: string
          uploader_side: string
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          incident_id?: string
          message_id?: string | null
          name?: string
          size_bytes?: number
          space_id?: string
          storage_path?: string
          uploaded_by?: string
          uploader_side?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_attachments_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_attachments_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "incident_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_attachments_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_attachments_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_events: {
        Row: {
          actor_id: string
          actor_side: string
          from_status: string | null
          id: string
          incident_id: string
          occurred_at: string
          reason: string | null
          space_id: string
          to_status: string
        }
        Insert: {
          actor_id: string
          actor_side: string
          from_status?: string | null
          id?: string
          incident_id: string
          occurred_at?: string
          reason?: string | null
          space_id: string
          to_status: string
        }
        Update: {
          actor_id?: string
          actor_side?: string
          from_status?: string | null
          id?: string
          incident_id?: string
          occurred_at?: string
          reason?: string | null
          space_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_events_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_events_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_messages: {
        Row: {
          author_id: string
          author_side: string
          body: string
          created_at: string
          id: string
          incident_id: string
          space_id: string
        }
        Insert: {
          author_id: string
          author_side: string
          body: string
          created_at?: string
          id?: string
          incident_id: string
          space_id: string
        }
        Update: {
          author_id?: string
          author_side?: string
          body?: string
          created_at?: string
          id?: string
          incident_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "incident_messages_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_messages_incident_id_fkey"
            columns: ["incident_id"]
            isOneToOne: false
            referencedRelation: "incidents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incident_messages_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      incidents: {
        Row: {
          app_version: string | null
          category: string
          client_context: Json
          closed_at: string | null
          description: string
          device: string | null
          first_platform_response_at: string | null
          help_query: string | null
          id: string
          idempotency_key: string | null
          impact: string | null
          kind: string
          last_activity_at: string
          opened_at: string
          opened_by: string
          resolved_at: string | null
          space_id: string
          status: string
          status_reason: string | null
        }
        Insert: {
          app_version?: string | null
          category: string
          client_context?: Json
          closed_at?: string | null
          description: string
          device?: string | null
          first_platform_response_at?: string | null
          help_query?: string | null
          id?: string
          idempotency_key?: string | null
          impact?: string | null
          kind: string
          last_activity_at?: string
          opened_at?: string
          opened_by: string
          resolved_at?: string | null
          space_id: string
          status?: string
          status_reason?: string | null
        }
        Update: {
          app_version?: string | null
          category?: string
          client_context?: Json
          closed_at?: string | null
          description?: string
          device?: string | null
          first_platform_response_at?: string | null
          help_query?: string | null
          id?: string
          idempotency_key?: string | null
          impact?: string | null
          kind?: string
          last_activity_at?: string
          opened_at?: string
          opened_by?: string
          resolved_at?: string | null
          space_id?: string
          status?: string
          status_reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "incidents_opened_by_fkey"
            columns: ["opened_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "incidents_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_credentials: {
        Row: {
          ciphertext: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          integration_id: string
          key_version: number
          kind: string
          replaced_at: string | null
          revoked_at: string | null
          space_id: string
        }
        Insert: {
          ciphertext: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          integration_id: string
          key_version: number
          kind: string
          replaced_at?: string | null
          revoked_at?: string | null
          space_id: string
        }
        Update: {
          ciphertext?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          integration_id?: string
          key_version?: number
          kind?: string
          replaced_at?: string | null
          revoked_at?: string | null
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_credentials_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_credentials_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integration_credentials_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          account_label: string | null
          auth_kind: string
          connected_at: string | null
          connected_by: string | null
          consecutive_failures: number
          created_at: string
          created_by: string | null
          disconnect_reason: string | null
          disconnected_at: string | null
          disconnected_by: string | null
          establishment_id: string
          external_property_id: string | null
          external_revocation_attempts: number
          external_revocation_pending: boolean
          id: string
          last_error: string | null
          last_failure_kind: string | null
          last_success_at: string | null
          last_sync_at: string | null
          next_attempt_at: string | null
          provider: string
          space_id: string
          status: string
          updated_at: string
        }
        Insert: {
          account_label?: string | null
          auth_kind: string
          connected_at?: string | null
          connected_by?: string | null
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          disconnect_reason?: string | null
          disconnected_at?: string | null
          disconnected_by?: string | null
          establishment_id: string
          external_property_id?: string | null
          external_revocation_attempts?: number
          external_revocation_pending?: boolean
          id?: string
          last_error?: string | null
          last_failure_kind?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          next_attempt_at?: string | null
          provider: string
          space_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          account_label?: string | null
          auth_kind?: string
          connected_at?: string | null
          connected_by?: string | null
          consecutive_failures?: number
          created_at?: string
          created_by?: string | null
          disconnect_reason?: string | null
          disconnected_at?: string | null
          disconnected_by?: string | null
          establishment_id?: string
          external_property_id?: string | null
          external_revocation_attempts?: number
          external_revocation_pending?: boolean
          id?: string
          last_error?: string | null
          last_failure_kind?: string | null
          last_success_at?: string | null
          last_sync_at?: string | null
          next_attempt_at?: string | null
          provider?: string
          space_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_connected_by_fkey"
            columns: ["connected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_disconnected_by_fkey"
            columns: ["disconnected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      internal_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          establishment_id: string
          id: string
          job_id: string | null
          kind: string
          space_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          establishment_id: string
          id?: string
          job_id?: string | null
          kind?: string
          space_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          establishment_id?: string
          id?: string
          job_id?: string | null
          kind?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "internal_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "client_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "internal_notes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          category: string
          code: string
          completed_at: string | null
          correction_window_ends_at: string | null
          created_at: string
          establishment_id: string
          free_correction_used_at: string | null
          id: string
          published_at: string | null
          published_by: string | null
          quote_id: string | null
          request_id: string
          required_specialty: string | null
          space_id: string
          started_at: string | null
          started_by: string | null
          state: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          category: string
          code: string
          completed_at?: string | null
          correction_window_ends_at?: string | null
          created_at?: string
          establishment_id: string
          free_correction_used_at?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          quote_id?: string | null
          request_id: string
          required_specialty?: string | null
          space_id: string
          started_at?: string | null
          started_by?: string | null
          state?: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          category?: string
          code?: string
          completed_at?: string | null
          correction_window_ends_at?: string | null
          created_at?: string
          establishment_id?: string
          free_correction_used_at?: string | null
          id?: string
          published_at?: string | null
          published_by?: string | null
          quote_id?: string | null
          request_id?: string
          required_specialty?: string | null
          space_id?: string
          started_at?: string | null
          started_by?: string | null
          state?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_started_by_fkey"
            columns: ["started_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_corrections: {
        Row: {
          completed_at: string | null
          completed_by: string | null
          completion_note: string | null
          description: string
          establishment_id: string
          id: string
          kind: string
          menu_id: string
          publication_id: string
          requested_at: string
          requested_before_cutoff: boolean
          requested_by: string
          space_id: string
        }
        Insert: {
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          description: string
          establishment_id: string
          id?: string
          kind: string
          menu_id: string
          publication_id: string
          requested_at?: string
          requested_before_cutoff: boolean
          requested_by: string
          space_id: string
        }
        Update: {
          completed_at?: string | null
          completed_by?: string | null
          completion_note?: string | null
          description?: string
          establishment_id?: string
          id?: string
          kind?: string
          menu_id?: string
          publication_id?: string
          requested_at?: string
          requested_before_cutoff?: boolean
          requested_by?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_corrections_completed_by_fkey"
            columns: ["completed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_corrections_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_corrections_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_corrections_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "menu_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_corrections_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_corrections_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_downloads: {
        Row: {
          by_team: boolean
          downloaded_at: string
          downloaded_by: string
          establishment_id: string
          format: string
          id: string
          menu_id: string
          space_id: string
          template_id: string
          version_id: string
        }
        Insert: {
          by_team: boolean
          downloaded_at?: string
          downloaded_by: string
          establishment_id: string
          format: string
          id?: string
          menu_id: string
          space_id: string
          template_id: string
          version_id: string
        }
        Update: {
          by_team?: boolean
          downloaded_at?: string
          downloaded_by?: string
          establishment_id?: string
          format?: string
          id?: string
          menu_id?: string
          space_id?: string
          template_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_downloads_downloaded_by_fkey"
            columns: ["downloaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_downloads_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_downloads_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_downloads_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_downloads_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "menu_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_downloads_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_events: {
        Row: {
          actor_id: string | null
          from_state: string | null
          id: string
          menu_id: string
          occurred_at: string
          publication_id: string | null
          reason: string | null
          space_id: string
          to_state: string
        }
        Insert: {
          actor_id?: string | null
          from_state?: string | null
          id?: string
          menu_id: string
          occurred_at?: string
          publication_id?: string | null
          reason?: string | null
          space_id: string
          to_state: string
        }
        Update: {
          actor_id?: string | null
          from_state?: string | null
          id?: string
          menu_id?: string
          occurred_at?: string
          publication_id?: string | null
          reason?: string | null
          space_id?: string
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_events_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_events_publication_id_fkey"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "menu_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_events_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_publications: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          assignment_mode: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          cycle_id: string
          debit_entry_id: string
          establishment_id: string
          id: string
          idempotency_key: string | null
          menu_id: string
          published_at: string | null
          published_by: string | null
          published_template_id: string | null
          published_version_id: string | null
          requested_at: string
          requested_before_cutoff: boolean
          requested_by: string
          requested_version_id: string
          space_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          assignment_mode?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          cycle_id: string
          debit_entry_id: string
          establishment_id: string
          id?: string
          idempotency_key?: string | null
          menu_id: string
          published_at?: string | null
          published_by?: string | null
          published_template_id?: string | null
          published_version_id?: string | null
          requested_at?: string
          requested_before_cutoff: boolean
          requested_by: string
          requested_version_id: string
          space_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          assignment_mode?: string | null
          cancel_reason?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          created_at?: string
          cycle_id?: string
          debit_entry_id?: string
          establishment_id?: string
          id?: string
          idempotency_key?: string | null
          menu_id?: string
          published_at?: string | null
          published_by?: string | null
          published_template_id?: string | null
          published_version_id?: string | null
          requested_at?: string
          requested_before_cutoff?: boolean
          requested_by?: string
          requested_version_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_publications_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_publications_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_publications_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "menu_update_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_publications_debit_entry_id_fkey"
            columns: ["debit_entry_id"]
            isOneToOne: false
            referencedRelation: "menu_update_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_publications_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_publications_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_publications_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_publications_published_template_id_fkey"
            columns: ["published_template_id"]
            isOneToOne: false
            referencedRelation: "menu_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_publications_published_version_id_fkey"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_publications_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_publications_requested_version_id_fkey"
            columns: ["requested_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_publications_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_templates: {
        Row: {
          accent_color: string
          archived_at: string | null
          archived_by: string | null
          background_color: string
          created_at: string
          created_by: string
          design_updated_at: string | null
          establishment_id: string
          footer_text: string | null
          heading_text: string | null
          id: string
          layout: string
          name: string
          origin: string
          quote_id: string | null
          show_prices: boolean
          space_id: string
          text_color: string
        }
        Insert: {
          accent_color?: string
          archived_at?: string | null
          archived_by?: string | null
          background_color?: string
          created_at?: string
          created_by: string
          design_updated_at?: string | null
          establishment_id: string
          footer_text?: string | null
          heading_text?: string | null
          id?: string
          layout?: string
          name: string
          origin: string
          quote_id?: string | null
          show_prices?: boolean
          space_id: string
          text_color?: string
        }
        Update: {
          accent_color?: string
          archived_at?: string | null
          archived_by?: string | null
          background_color?: string
          created_at?: string
          created_by?: string
          design_updated_at?: string | null
          establishment_id?: string
          footer_text?: string | null
          heading_text?: string | null
          id?: string
          layout?: string
          name?: string
          origin?: string
          quote_id?: string | null
          show_prices?: boolean
          space_id?: string
          text_color?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_templates_archived_by_fkey"
            columns: ["archived_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_templates_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_templates_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_templates_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_update_cycles: {
        Row: {
          created_at: string
          cycle_end: string
          cycle_start: string
          establishment_id: string
          id: string
          included_updates: number
          space_id: string
          subscription_id: string
        }
        Insert: {
          created_at?: string
          cycle_end: string
          cycle_start: string
          establishment_id: string
          id?: string
          included_updates: number
          space_id: string
          subscription_id: string
        }
        Update: {
          created_at?: string
          cycle_end?: string
          cycle_start?: string
          establishment_id?: string
          id?: string
          included_updates?: number
          space_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_update_cycles_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_update_cycles_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_update_cycles_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_update_entries: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          cycle_id: string
          entry_type: string
          establishment_id: string
          id: string
          menu_id: string | null
          publication_id: string | null
          reason: string | null
          related_entry_id: string | null
          space_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          created_by?: string | null
          cycle_id: string
          entry_type: string
          establishment_id: string
          id?: string
          menu_id?: string | null
          publication_id?: string | null
          reason?: string | null
          related_entry_id?: string | null
          space_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          cycle_id?: string
          entry_type?: string
          establishment_id?: string
          id?: string
          menu_id?: string | null
          publication_id?: string | null
          reason?: string | null
          related_entry_id?: string | null
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_update_entries_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_update_entries_cycle_id_fkey"
            columns: ["cycle_id"]
            isOneToOne: false
            referencedRelation: "menu_update_cycles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_update_entries_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_update_entries_menu_fk"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_update_entries_publication_fk"
            columns: ["publication_id"]
            isOneToOne: false
            referencedRelation: "menu_publications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_update_entries_related_entry_id_fkey"
            columns: ["related_entry_id"]
            isOneToOne: false
            referencedRelation: "menu_update_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_update_entries_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_versions: {
        Row: {
          after_cutoff: boolean
          created_at: string
          created_by: string
          desserts: string[]
          drink: string | null
          id: string
          mains: string[]
          menu_id: string
          note: string | null
          price_cents: number | null
          space_id: string
          starters: string[]
          version: number
        }
        Insert: {
          after_cutoff?: boolean
          created_at?: string
          created_by: string
          desserts?: string[]
          drink?: string | null
          id?: string
          mains?: string[]
          menu_id: string
          note?: string | null
          price_cents?: number | null
          space_id: string
          starters?: string[]
          version: number
        }
        Update: {
          after_cutoff?: boolean
          created_at?: string
          created_by?: string
          desserts?: string[]
          drink?: string | null
          id?: string
          mains?: string[]
          menu_id?: string
          note?: string | null
          price_cents?: number | null
          space_id?: string
          starters?: string[]
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_versions_menu_id_fkey"
            columns: ["menu_id"]
            isOneToOne: false
            referencedRelation: "menus"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_versions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      menus: {
        Row: {
          cancelled_at: string | null
          created_at: string
          created_by: string
          current_version_id: string | null
          establishment_id: string
          id: string
          kind: string
          name: string
          published_at: string | null
          published_template_id: string | null
          published_version_id: string | null
          space_id: string
          state: string
          target_date: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          cancelled_at?: string | null
          created_at?: string
          created_by: string
          current_version_id?: string | null
          establishment_id: string
          id?: string
          kind: string
          name: string
          published_at?: string | null
          published_template_id?: string | null
          published_version_id?: string | null
          space_id: string
          state?: string
          target_date: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          cancelled_at?: string | null
          created_at?: string
          created_by?: string
          current_version_id?: string | null
          establishment_id?: string
          id?: string
          kind?: string
          name?: string
          published_at?: string | null
          published_template_id?: string | null
          published_version_id?: string | null
          space_id?: string
          state?: string
          target_date?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menus_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_current_version_fk"
            columns: ["current_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_published_template_id_fkey"
            columns: ["published_template_id"]
            isOneToOne: false
            referencedRelation: "menu_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_published_version_fk"
            columns: ["published_version_id"]
            isOneToOne: false
            referencedRelation: "menu_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menus_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "menu_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      message_edits: {
        Row: {
          edited_at: string
          edited_by: string
          id: string
          message_id: string
          previous_body: string
          space_id: string
          version: number
        }
        Insert: {
          edited_at?: string
          edited_by: string
          id?: string
          message_id: string
          previous_body: string
          space_id: string
          version: number
        }
        Update: {
          edited_at?: string
          edited_by?: string
          id?: string
          message_id?: string
          previous_body?: string
          space_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "message_edits_edited_by_fkey"
            columns: ["edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_edits_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_edits_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string
          conversation_id: string
          created_at: string
          edit_count: number
          edited_at: string | null
          id: string
          idempotency_key: string | null
          sender_id: string
          sender_role: string
          space_id: string
        }
        Insert: {
          body: string
          conversation_id: string
          created_at?: string
          edit_count?: number
          edited_at?: string | null
          id?: string
          idempotency_key?: string | null
          sender_id: string
          sender_role: string
          space_id: string
        }
        Update: {
          body?: string
          conversation_id?: string
          created_at?: string
          edit_count?: number
          edited_at?: string | null
          id?: string
          idempotency_key?: string | null
          sender_id?: string
          sender_role?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      metric_points: {
        Row: {
          dimension: string
          establishment_id: string
          fetched_at: string
          id: string
          integration_id: string
          metric: string
          period_end: string
          period_start: string
          provider: string
          space_id: string
          sync_run_id: string | null
          unit: string | null
          value: number
        }
        Insert: {
          dimension?: string
          establishment_id: string
          fetched_at?: string
          id?: string
          integration_id: string
          metric: string
          period_end: string
          period_start: string
          provider: string
          space_id: string
          sync_run_id?: string | null
          unit?: string | null
          value: number
        }
        Update: {
          dimension?: string
          establishment_id?: string
          fetched_at?: string
          id?: string
          integration_id?: string
          metric?: string
          period_end?: string
          period_start?: string
          provider?: string
          space_id?: string
          sync_run_id?: string | null
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "metric_points_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_points_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_points_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "metric_points_sync_run_id_fkey"
            columns: ["sync_run_id"]
            isOneToOne: false
            referencedRelation: "sync_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_deliveries: {
        Row: {
          attempts: number
          channel: string
          id: string
          last_error: string | null
          next_attempt_at: string
          notification_id: string
          provider_message_id: string | null
          sent_at: string | null
          space_id: string
          status: string
        }
        Insert: {
          attempts?: number
          channel: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id: string
          provider_message_id?: string | null
          sent_at?: string | null
          space_id: string
          status?: string
        }
        Update: {
          attempts?: number
          channel?: string
          id?: string
          last_error?: string | null
          next_attempt_at?: string
          notification_id?: string
          provider_message_id?: string | null
          sent_at?: string | null
          space_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_deliveries_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: false
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_deliveries_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          email: boolean
          event_type: string
          id: string
          in_app: boolean
          profile_id: string
          push: boolean
          space_id: string
          updated_at: string
        }
        Insert: {
          email?: boolean
          event_type: string
          id?: string
          in_app?: boolean
          profile_id: string
          push?: boolean
          space_id: string
          updated_at?: string
        }
        Update: {
          email?: boolean
          event_type?: string
          id?: string
          in_app?: boolean
          profile_id?: string
          push?: boolean
          space_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notification_preferences_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          amount_cents: number | null
          audience: string
          created_at: string
          dedupe_key: string
          deep_link: string
          entity_id: string
          entity_type: string
          establishment_id: string | null
          event_type: string
          id: string
          read_at: string | null
          recipient_id: string
          space_id: string
          threshold_percent: number | null
        }
        Insert: {
          amount_cents?: number | null
          audience: string
          created_at?: string
          dedupe_key: string
          deep_link: string
          entity_id: string
          entity_type: string
          establishment_id?: string | null
          event_type: string
          id?: string
          read_at?: string | null
          recipient_id: string
          space_id: string
          threshold_percent?: number | null
        }
        Update: {
          amount_cents?: number | null
          audience?: string
          created_at?: string
          dedupe_key?: string
          deep_link?: string
          entity_id?: string
          entity_type?: string
          establishment_id?: string | null
          event_type?: string
          id?: string
          read_at?: string | null
          recipient_id?: string
          space_id?: string
          threshold_percent?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "notifications_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunities: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          category: string
          created_at: string
          created_by: string | null
          description: string | null
          detection_count: number
          discard_reason: string | null
          discarded_at: string | null
          discarded_by: string | null
          discarded_period_end: string | null
          discarded_severity: number | null
          effort_category: string | null
          establishment_id: string
          evidence: Json
          first_detected_at: string | null
          id: string
          impact: string
          include_in_report: boolean
          last_detected_at: string | null
          origin: string
          period_end: string | null
          period_start: string | null
          potential_service_id: string | null
          priority: number
          proposal_edited_at: string | null
          proposal_edited_by: string | null
          recommended_action: string | null
          reopened_at: string | null
          rule_key: string | null
          scope: string
          severity: number
          space_id: string
          status: string
          status_reason: string | null
          subject: string
          title: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          detection_count?: number
          discard_reason?: string | null
          discarded_at?: string | null
          discarded_by?: string | null
          discarded_period_end?: string | null
          discarded_severity?: number | null
          effort_category?: string | null
          establishment_id: string
          evidence?: Json
          first_detected_at?: string | null
          id?: string
          impact: string
          include_in_report?: boolean
          last_detected_at?: string | null
          origin: string
          period_end?: string | null
          period_start?: string | null
          potential_service_id?: string | null
          priority?: number
          proposal_edited_at?: string | null
          proposal_edited_by?: string | null
          recommended_action?: string | null
          reopened_at?: string | null
          rule_key?: string | null
          scope: string
          severity?: number
          space_id: string
          status?: string
          status_reason?: string | null
          subject?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          detection_count?: number
          discard_reason?: string | null
          discarded_at?: string | null
          discarded_by?: string | null
          discarded_period_end?: string | null
          discarded_severity?: number | null
          effort_category?: string | null
          establishment_id?: string
          evidence?: Json
          first_detected_at?: string | null
          id?: string
          impact?: string
          include_in_report?: boolean
          last_detected_at?: string | null
          origin?: string
          period_end?: string | null
          period_start?: string | null
          potential_service_id?: string | null
          priority?: number
          proposal_edited_at?: string | null
          proposal_edited_by?: string | null
          recommended_action?: string | null
          reopened_at?: string | null
          rule_key?: string | null
          scope?: string
          severity?: number
          space_id?: string
          status?: string
          status_reason?: string | null
          subject?: string
          title?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "opportunities_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_discarded_by_fkey"
            columns: ["discarded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_potential_service_id_fkey"
            columns: ["potential_service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_proposal_edited_by_fkey"
            columns: ["proposal_edited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunities_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_detections: {
        Row: {
          detected_at: string
          establishment_id: string
          evidence: Json
          id: string
          opportunity_id: string
          period_end: string
          period_start: string
          severity: number
          space_id: string
        }
        Insert: {
          detected_at?: string
          establishment_id: string
          evidence: Json
          id?: string
          opportunity_id: string
          period_end: string
          period_start: string
          severity: number
          space_id: string
        }
        Update: {
          detected_at?: string
          establishment_id?: string
          evidence?: Json
          id?: string
          opportunity_id?: string
          period_end?: string
          period_start?: string
          severity?: number
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_detections_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_detections_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_detections_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      opportunity_notes: {
        Row: {
          author_id: string
          body: string
          created_at: string
          establishment_id: string
          id: string
          kind: string
          opportunity_id: string
          space_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          establishment_id: string
          id?: string
          kind: string
          opportunity_id: string
          space_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          establishment_id?: string
          id?: string
          kind?: string
          opportunity_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "opportunity_notes_author_id_fkey"
            columns: ["author_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_notes_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_notes_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "opportunity_notes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_confirmations: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          confirmed_role: string
          id: string
          note: string | null
          payment_id: string
          space_id: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          confirmed_role: string
          id?: string
          note?: string | null
          payment_id: string
          space_id: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          confirmed_role?: string
          id?: string
          note?: string | null
          payment_id?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_confirmations_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_confirmations_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: true
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_confirmations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount_cents: number
          charge_id: string
          created_at: string
          establishment_id: string
          id: string
          idempotency_key: string | null
          method: string
          paid_at: string
          receipt_file_id: string | null
          recorded_by: string
          recorded_role: string
          reversal_reason: string | null
          reversed_at: string | null
          reversed_by: string | null
          space_id: string
        }
        Insert: {
          amount_cents: number
          charge_id: string
          created_at?: string
          establishment_id: string
          id?: string
          idempotency_key?: string | null
          method: string
          paid_at: string
          receipt_file_id?: string | null
          recorded_by: string
          recorded_role: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          space_id: string
        }
        Update: {
          amount_cents?: number
          charge_id?: string
          created_at?: string
          establishment_id?: string
          id?: string
          idempotency_key?: string | null
          method?: string
          paid_at?: string
          receipt_file_id?: string | null
          recorded_by?: string
          recorded_role?: string
          reversal_reason?: string | null
          reversed_at?: string | null
          reversed_by?: string | null
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_receipt_file_id_fkey"
            columns: ["receipt_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_reversed_by_fkey"
            columns: ["reversed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_commitments: {
        Row: {
          cause: string
          created_at: string
          created_by: string | null
          ends_at: string
          establishment_id: string
          id: string
          plan_id: string | null
          service_id: string | null
          space_id: string
          started_at: string
          subscription_id: string
        }
        Insert: {
          cause: string
          created_at?: string
          created_by?: string | null
          ends_at: string
          establishment_id: string
          id?: string
          plan_id?: string | null
          service_id?: string | null
          space_id: string
          started_at?: string
          subscription_id: string
        }
        Update: {
          cause?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string
          establishment_id?: string
          id?: string
          plan_id?: string | null
          service_id?: string | null
          space_id?: string
          started_at?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_commitments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_commitments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_commitments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_commitments_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_commitments_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_commitments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_versions: {
        Row: {
          conditions: string
          id: string
          plan_id: string
          published_at: string
          published_by: string
          space_id: string
          version: number
        }
        Insert: {
          conditions: string
          id?: string
          plan_id: string
          published_at?: string
          published_by: string
          space_id: string
          version: number
        }
        Update: {
          conditions?: string
          id?: string
          plan_id?: string
          published_at?: string
          published_by?: string
          space_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "plan_versions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_versions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          grants_priority: boolean
          id: string
          included_large: number
          included_medium: number
          included_photo: number
          included_small: number
          name: string
          price_cents: number
          space_id: string
          start_sla_hours: number
        }
        Insert: {
          created_at?: string
          grants_priority?: boolean
          id?: string
          included_large?: number
          included_medium?: number
          included_photo?: number
          included_small?: number
          name: string
          price_cents: number
          space_id: string
          start_sla_hours: number
        }
        Update: {
          created_at?: string
          grants_priority?: boolean
          id?: string
          included_large?: number
          included_medium?: number
          included_photo?: number
          included_small?: number
          name?: string
          price_cents?: number
          space_id?: string
          start_sla_hours?: number
        }
        Relationships: [
          {
            foreignKeyName: "plans_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_holidays: {
        Row: {
          created_at: string
          created_by: string
          holiday_date: string
          id: string
          name: string
          removal_reason: string | null
          removed_at: string | null
          removed_by: string | null
        }
        Insert: {
          created_at?: string
          created_by: string
          holiday_date: string
          id?: string
          name: string
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string
          holiday_date?: string
          id?: string
          name?: string
          removal_reason?: string | null
          removed_at?: string | null
          removed_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_holidays_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_holidays_removed_by_fkey"
            columns: ["removed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_roles: {
        Row: {
          can_approve_spaces: boolean
          can_manage_subscriptions: boolean
          can_support: boolean
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          can_approve_spaces?: boolean
          can_manage_subscriptions?: boolean
          can_support?: boolean
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          can_approve_spaces?: boolean
          can_manage_subscriptions?: boolean
          can_support?: boolean
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_status_events: {
        Row: {
          body: string | null
          component: string
          created_at: string
          created_by: string
          id: string
          resolution_note: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          started_at: string
          title: string
        }
        Insert: {
          body?: string | null
          component: string
          created_at?: string
          created_by: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          started_at?: string
          title: string
        }
        Update: {
          body?: string | null
          component?: string
          created_at?: string
          created_by?: string
          id?: string
          resolution_note?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          started_at?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_status_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_status_events_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
        }
        Relationships: []
      }
      push_devices: {
        Row: {
          app_version: string | null
          created_at: string
          device_name: string | null
          expo_push_token: string
          id: string
          last_seen_at: string
          platform: string
          revoked_at: string | null
          revoked_reason: string | null
          user_id: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_name?: string | null
          expo_push_token: string
          id?: string
          last_seen_at?: string
          platform: string
          revoked_at?: string | null
          revoked_reason?: string | null
          user_id: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_name?: string | null
          expo_push_token?: string
          id?: string
          last_seen_at?: string
          platform?: string
          revoked_at?: string | null
          revoked_reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_devices_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          base_cents: number
          category: string | null
          code: string
          concept: string
          created_at: string
          created_by: string
          decided_at: string | null
          decided_by: string | null
          decided_by_team: boolean
          decision_reason: string | null
          description: string | null
          establishment_id: string
          id: string
          outcome: string
          request_id: string | null
          requires_payment_before_start: boolean
          sent_at: string | null
          sent_by: string | null
          space_id: string
          start_authorization_reason: string | null
          start_authorized_at: string | null
          start_authorized_by: string | null
          state: string
          tax_cents: number
          tax_rate_percent: number
          total_cents: number
          updated_at: string
        }
        Insert: {
          base_cents: number
          category?: string | null
          code: string
          concept: string
          created_at?: string
          created_by: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_team?: boolean
          decision_reason?: string | null
          description?: string | null
          establishment_id: string
          id?: string
          outcome: string
          request_id?: string | null
          requires_payment_before_start?: boolean
          sent_at?: string | null
          sent_by?: string | null
          space_id: string
          start_authorization_reason?: string | null
          start_authorized_at?: string | null
          start_authorized_by?: string | null
          state?: string
          tax_cents: number
          tax_rate_percent: number
          total_cents: number
          updated_at?: string
        }
        Update: {
          base_cents?: number
          category?: string | null
          code?: string
          concept?: string
          created_at?: string
          created_by?: string
          decided_at?: string | null
          decided_by?: string | null
          decided_by_team?: boolean
          decision_reason?: string | null
          description?: string | null
          establishment_id?: string
          id?: string
          outcome?: string
          request_id?: string | null
          requires_payment_before_start?: boolean
          sent_at?: string | null
          sent_by?: string | null
          space_id?: string
          start_authorization_reason?: string | null
          start_authorized_at?: string | null
          start_authorized_by?: string | null
          state?: string
          tax_cents?: number
          tax_rate_percent?: number
          total_cents?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_sent_by_fkey"
            columns: ["sent_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_start_authorized_by_fkey"
            columns: ["start_authorized_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          charge_id: string
          created_at: string
          establishment_id: string
          file_id: string
          id: string
          note: string | null
          payment_id: string | null
          space_id: string
          uploaded_by: string
          uploaded_side: string
        }
        Insert: {
          charge_id: string
          created_at?: string
          establishment_id: string
          file_id: string
          id?: string
          note?: string | null
          payment_id?: string | null
          space_id: string
          uploaded_by: string
          uploaded_side: string
        }
        Update: {
          charge_id?: string
          created_at?: string
          establishment_id?: string
          file_id?: string
          id?: string
          note?: string | null
          payment_id?: string | null
          space_id?: string
          uploaded_by?: string
          uploaded_side?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_charge_id_fkey"
            columns: ["charge_id"]
            isOneToOne: false
            referencedRelation: "charges"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_file_id_fkey"
            columns: ["file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "receipts_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_deliveries: {
        Row: {
          channel: string
          id: string
          recipient_id: string
          report_id: string
          sent_at: string
          space_id: string
          version_id: string
        }
        Insert: {
          channel: string
          id?: string
          recipient_id: string
          report_id: string
          sent_at?: string
          space_id: string
          version_id: string
        }
        Update: {
          channel?: string
          id?: string
          recipient_id?: string
          report_id?: string
          sent_at?: string
          space_id?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_deliveries_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_deliveries_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_deliveries_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_deliveries_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "report_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      report_sections: {
        Row: {
          id: string
          included: boolean
          note: string | null
          position: number
          report_id: string
          section_key: string
          space_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: string
          included?: boolean
          note?: string | null
          position: number
          report_id: string
          section_key: string
          space_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: string
          included?: boolean
          note?: string | null
          position?: number
          report_id?: string
          section_key?: string
          space_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "report_sections_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_sections_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_sections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      report_versions: {
        Row: {
          generated_at: string
          generated_by: string | null
          id: string
          report_id: string
          snapshot: Json
          space_id: string
          version_number: number
        }
        Insert: {
          generated_at?: string
          generated_by?: string | null
          id?: string
          report_id: string
          snapshot: Json
          space_id: string
          version_number: number
        }
        Update: {
          generated_at?: string
          generated_by?: string | null
          id?: string
          report_id?: string
          snapshot?: Json
          space_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "report_versions_generated_by_fkey"
            columns: ["generated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_versions_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_versions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      reports: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          archived_at: string | null
          category: string
          created_at: string
          created_by: string | null
          delivery_channel: string
          establishment_id: string | null
          filters: Json
          group_id: string | null
          id: string
          idempotency_key: string | null
          include_csv: boolean
          name: string
          period_end: string
          period_start: string
          reminder_sent_at: string | null
          scheduled_for: string | null
          sent_at: string | null
          space_id: string
          status: string
          status_reason: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          category: string
          created_at?: string
          created_by?: string | null
          delivery_channel?: string
          establishment_id?: string | null
          filters?: Json
          group_id?: string | null
          id?: string
          idempotency_key?: string | null
          include_csv?: boolean
          name: string
          period_end: string
          period_start: string
          reminder_sent_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          space_id: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          archived_at?: string | null
          category?: string
          created_at?: string
          created_by?: string | null
          delivery_channel?: string
          establishment_id?: string | null
          filters?: Json
          group_id?: string | null
          id?: string
          idempotency_key?: string | null
          include_csv?: boolean
          name?: string
          period_end?: string
          period_start?: string
          reminder_sent_at?: string | null
          scheduled_for?: string | null
          sent_at?: string | null
          space_id?: string
          status?: string
          status_reason?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_approved_by_fkey"
            columns: ["approved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reports_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      request_attachments: {
        Row: {
          created_at: string
          created_by: string
          establishment_id: string
          file_name: string
          id: string
          mime_type: string
          request_id: string
          size_bytes: number
          space_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by: string
          establishment_id: string
          file_name: string
          id?: string
          mime_type: string
          request_id: string
          size_bytes: number
          space_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string
          establishment_id?: string
          file_name?: string
          id?: string
          mime_type?: string
          request_id?: string
          size_bytes?: number
          space_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "request_attachments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachments_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_attachments_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      request_versions: {
        Row: {
          context: string | null
          created_at: string
          created_by: string
          description: string
          id: string
          request_id: string
          space_id: string
          version_number: number
        }
        Insert: {
          context?: string | null
          created_at?: string
          created_by: string
          description: string
          id?: string
          request_id: string
          space_id: string
          version_number: number
        }
        Update: {
          context?: string | null
          created_at?: string
          created_by?: string
          description?: string
          id?: string
          request_id?: string
          space_id?: string
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "request_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_versions_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "request_versions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      requests: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          accepted_start_sla_hours: number | null
          code: string
          context: string | null
          copied_from_request_id: string | null
          created_at: string
          created_by: string
          description: string
          establishment_id: string
          id: string
          opportunity_action: string | null
          opportunity_id: string | null
          priority_rank: number | null
          rejected_at: string | null
          rejected_by: string | null
          rejected_reason: string | null
          source_conversation_id: string | null
          space_id: string
          state: string
          validated_at: string | null
          validated_by: string | null
          validated_category: string | null
          validated_summary: string | null
        }
        Insert: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_start_sla_hours?: number | null
          code: string
          context?: string | null
          copied_from_request_id?: string | null
          created_at?: string
          created_by: string
          description: string
          establishment_id: string
          id?: string
          opportunity_action?: string | null
          opportunity_id?: string | null
          priority_rank?: number | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          source_conversation_id?: string | null
          space_id: string
          state?: string
          validated_at?: string | null
          validated_by?: string | null
          validated_category?: string | null
          validated_summary?: string | null
        }
        Update: {
          accepted_at?: string | null
          accepted_by?: string | null
          accepted_start_sla_hours?: number | null
          code?: string
          context?: string | null
          copied_from_request_id?: string | null
          created_at?: string
          created_by?: string
          description?: string
          establishment_id?: string
          id?: string
          opportunity_action?: string | null
          opportunity_id?: string | null
          priority_rank?: number | null
          rejected_at?: string | null
          rejected_by?: string | null
          rejected_reason?: string | null
          source_conversation_id?: string | null
          space_id?: string
          state?: string
          validated_at?: string | null
          validated_by?: string | null
          validated_category?: string | null
          validated_summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "requests_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_copied_from_request_id_fkey"
            columns: ["copied_from_request_id"]
            isOneToOne: false
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_opportunity_id_fkey"
            columns: ["opportunity_id"]
            isOneToOne: false
            referencedRelation: "opportunities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_rejected_by_fkey"
            columns: ["rejected_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_source_conversation_id_fkey"
            columns: ["source_conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requests_validated_by_fkey"
            columns: ["validated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_jobs: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          run_after: string
          space_id: string
          status: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          finished_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          run_after?: string
          space_id: string
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          run_after?: string
          space_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_jobs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_plan_changes: {
        Row: {
          applied_at: string | null
          created_at: string
          direction: string
          effective_at: string
          establishment_id: string
          from_plan_id: string
          id: string
          requested_by: string | null
          space_id: string
          state: string
          subscription_id: string
          to_plan_id: string
        }
        Insert: {
          applied_at?: string | null
          created_at?: string
          direction: string
          effective_at: string
          establishment_id: string
          from_plan_id: string
          id?: string
          requested_by?: string | null
          space_id: string
          state?: string
          subscription_id: string
          to_plan_id: string
        }
        Update: {
          applied_at?: string | null
          created_at?: string
          direction?: string
          effective_at?: string
          establishment_id?: string
          from_plan_id?: string
          id?: string
          requested_by?: string | null
          space_id?: string
          state?: string
          subscription_id?: string
          to_plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_plan_changes_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_plan_changes_from_plan_id_fkey"
            columns: ["from_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_plan_changes_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_plan_changes_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_plan_changes_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_plan_changes_to_plan_id_fkey"
            columns: ["to_plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      service_versions: {
        Row: {
          conditions: string
          id: string
          published_at: string
          published_by: string
          service_id: string
          space_id: string
          version: number
        }
        Insert: {
          conditions: string
          id?: string
          published_at?: string
          published_by: string
          service_id: string
          space_id: string
          version: number
        }
        Update: {
          conditions?: string
          id?: string
          published_at?: string
          published_by?: string
          service_id?: string
          space_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "service_versions_published_by_fkey"
            columns: ["published_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_versions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "service_versions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      services: {
        Row: {
          created_at: string
          id: string
          included_updates: number
          kind: string
          name: string
          price_cents: number
          price_premium_cents: number | null
          space_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          included_updates?: number
          kind?: string
          name: string
          price_cents: number
          price_premium_cents?: number | null
          space_id: string
        }
        Update: {
          created_at?: string
          id?: string
          included_updates?: number
          kind?: string
          name?: string
          price_cents?: number
          price_premium_cents?: number | null
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "services_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_exports: {
        Row: {
          establishment_id: string | null
          group_id: string | null
          id: string
          requested_at: string
          requested_by: string
          row_count: number
          scope: string
          space_id: string
          table_count: number
        }
        Insert: {
          establishment_id?: string | null
          group_id?: string | null
          id?: string
          requested_at?: string
          requested_by: string
          row_count?: number
          scope: string
          space_id: string
          table_count?: number
        }
        Update: {
          establishment_id?: string | null
          group_id?: string | null
          id?: string
          requested_at?: string
          requested_by?: string
          row_count?: number
          scope?: string
          space_id?: string
          table_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "space_exports_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_exports_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_exports_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_exports_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_invitations: {
        Row: {
          created_at: string
          email: string
          expires_at: string
          id: string
          invited_by: string
          role: Database["public"]["Enums"]["space_role"]
          space_id: string
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invited_by: string
          role: Database["public"]["Enums"]["space_role"]
          space_id: string
          status?: string
          token?: string
        }
        Update: {
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invited_by?: string
          role?: Database["public"]["Enums"]["space_role"]
          space_id?: string
          status?: string
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_invitations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_lifecycle_operations: {
        Row: {
          actor_id: string
          from_owner_id: string | null
          id: string
          idempotency_key: string | null
          kind: string
          occurred_at: string
          reason: string | null
          space_id: string
          to_owner_id: string | null
        }
        Insert: {
          actor_id: string
          from_owner_id?: string | null
          id?: string
          idempotency_key?: string | null
          kind: string
          occurred_at?: string
          reason?: string | null
          space_id: string
          to_owner_id?: string | null
        }
        Update: {
          actor_id?: string
          from_owner_id?: string | null
          id?: string
          idempotency_key?: string | null
          kind?: string
          occurred_at?: string
          reason?: string | null
          space_id?: string
          to_owner_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "space_lifecycle_operations_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_lifecycle_operations_from_owner_id_fkey"
            columns: ["from_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_lifecycle_operations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_lifecycle_operations_to_owner_id_fkey"
            columns: ["to_owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_memberships: {
        Row: {
          can_approve_reports: boolean
          can_perform_jobs: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["space_role"]
          space_id: string
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Insert: {
          can_approve_reports?: boolean
          can_perform_jobs?: boolean
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["space_role"]
          space_id: string
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Update: {
          can_approve_reports?: boolean
          can_perform_jobs?: boolean
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["space_role"]
          space_id?: string
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_memberships_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_memberships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      space_onboarding_confirmations: {
        Row: {
          confirmed_at: string
          confirmed_by: string
          id: string
          space_id: string
          step: string
        }
        Insert: {
          confirmed_at?: string
          confirmed_by: string
          id?: string
          space_id: string
          step: string
        }
        Update: {
          confirmed_at?: string
          confirmed_by?: string
          id?: string
          space_id?: string
          step?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_onboarding_confirmations_confirmed_by_fkey"
            columns: ["confirmed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_onboarding_confirmations_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_request_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_status: string | null
          id: string
          reason: string | null
          request_id: string
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          request_id: string
          to_status: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_status?: string | null
          id?: string
          reason?: string | null
          request_id?: string
          to_status?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_request_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_request_events_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "space_requests"
            referencedColumns: ["id"]
          },
        ]
      }
      space_requests: {
        Row: {
          business_name: string
          contact_name: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          email: string
          estimated_establishments: number | null
          estimated_users: number | null
          id: string
          idempotency_key: string | null
          intended_use: string | null
          phone: string | null
          plan: string
          requester_id: string
          space_id: string | null
          status: string
          status_reason: string | null
          submitted_at: string | null
          tax_address: string | null
          tax_id: string | null
          tax_name: string | null
          updated_at: string
        }
        Insert: {
          business_name: string
          contact_name: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email: string
          estimated_establishments?: number | null
          estimated_users?: number | null
          id?: string
          idempotency_key?: string | null
          intended_use?: string | null
          phone?: string | null
          plan: string
          requester_id: string
          space_id?: string | null
          status?: string
          status_reason?: string | null
          submitted_at?: string | null
          tax_address?: string | null
          tax_id?: string | null
          tax_name?: string | null
          updated_at?: string
        }
        Update: {
          business_name?: string
          contact_name?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          email?: string
          estimated_establishments?: number | null
          estimated_users?: number | null
          id?: string
          idempotency_key?: string | null
          intended_use?: string | null
          phone?: string | null
          plan?: string
          requester_id?: string
          space_id?: string | null
          status?: string
          status_reason?: string | null
          submitted_at?: string | null
          tax_address?: string | null
          tax_id?: string | null
          tax_name?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_requests_requester_id_fkey"
            columns: ["requester_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_requests_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_sequences: {
        Row: {
          next_value: number
          sequence_name: string
          space_id: string
        }
        Insert: {
          next_value?: number
          sequence_name: string
          space_id: string
        }
        Update: {
          next_value?: number
          sequence_name?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_sequences_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      space_working_hours: {
        Row: {
          calendar_kind: string
          created_at: string
          created_by: string | null
          effective_from: string
          id: string
          space_id: string
          timezone: string
        }
        Insert: {
          calendar_kind: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          space_id: string
          timezone: string
        }
        Update: {
          calendar_kind?: string
          created_at?: string
          created_by?: string | null
          effective_from?: string
          id?: string
          space_id?: string
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "space_working_hours_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "space_working_hours_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      spaces: {
        Row: {
          address: string | null
          created_at: string
          created_by: string
          cuotly_archived_at: string | null
          cuotly_deletion_scheduled_at: string | null
          cuotly_plan: string | null
          cuotly_reactivation_deadline_at: string | null
          cuotly_status: string | null
          cuotly_status_changed_at: string | null
          cuotly_trial_ends_at: string | null
          id: string
          legal_name: string | null
          logo_storage_path: string | null
          name: string
          onboarding_completed_at: string | null
          payment_term_days: number
          slug: string
          tax_id: string | null
          tax_rate_percent: number
          timezone: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by: string
          cuotly_archived_at?: string | null
          cuotly_deletion_scheduled_at?: string | null
          cuotly_plan?: string | null
          cuotly_reactivation_deadline_at?: string | null
          cuotly_status?: string | null
          cuotly_status_changed_at?: string | null
          cuotly_trial_ends_at?: string | null
          id?: string
          legal_name?: string | null
          logo_storage_path?: string | null
          name: string
          onboarding_completed_at?: string | null
          payment_term_days?: number
          slug: string
          tax_id?: string | null
          tax_rate_percent?: number
          timezone?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string
          cuotly_archived_at?: string | null
          cuotly_deletion_scheduled_at?: string | null
          cuotly_plan?: string | null
          cuotly_reactivation_deadline_at?: string | null
          cuotly_status?: string | null
          cuotly_status_changed_at?: string | null
          cuotly_trial_ends_at?: string | null
          id?: string
          legal_name?: string | null
          logo_storage_path?: string | null
          name?: string
          onboarding_completed_at?: string | null
          payment_term_days?: number
          slug?: string
          tax_id?: string | null
          tax_rate_percent?: number
          timezone?: string
        }
        Relationships: [
          {
            foreignKeyName: "spaces_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      state_events: {
        Row: {
          actor_id: string | null
          cause: string | null
          entity_id: string
          entity_type: string
          from_state: string | null
          id: string
          occurred_at: string
          reason: string | null
          space_id: string
          to_state: string
        }
        Insert: {
          actor_id?: string | null
          cause?: string | null
          entity_id: string
          entity_type: string
          from_state?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          space_id: string
          to_state: string
        }
        Update: {
          actor_id?: string | null
          cause?: string | null
          entity_id?: string
          entity_type?: string
          from_state?: string | null
          id?: string
          occurred_at?: string
          reason?: string | null
          space_id?: string
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "state_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "state_events_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string
          created_by: string | null
          establishment_id: string
          id: string
          kind: string
          plan_id: string | null
          service_id: string | null
          space_id: string
          started_at: string
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          establishment_id: string
          id?: string
          kind: string
          plan_id?: string | null
          service_id?: string | null
          space_id: string
          started_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          establishment_id?: string
          id?: string
          kind?: string
          plan_id?: string | null
          service_id?: string | null
          space_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      supervisions: {
        Row: {
          admin_id: string
          created_at: string
          created_by: string | null
          ends_at: string | null
          id: string
          kind: string
          revoked_at: string | null
          space_id: string
          starts_at: string
          worker_id: string
        }
        Insert: {
          admin_id: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind: string
          revoked_at?: string | null
          space_id: string
          starts_at?: string
          worker_id: string
        }
        Update: {
          admin_id?: string
          created_at?: string
          created_by?: string | null
          ends_at?: string | null
          id?: string
          kind?: string
          revoked_at?: string | null
          space_id?: string
          starts_at?: string
          worker_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "supervisions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "supervisions_worker_id_fkey"
            columns: ["worker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      support_sessions: {
        Row: {
          access_level: string
          actor_id: string
          created_at: string
          end_note: string | null
          ended_at: string | null
          expires_at: string
          id: string
          idempotency_key: string | null
          reason: string
          space_id: string
          started_at: string
        }
        Insert: {
          access_level: string
          actor_id: string
          created_at?: string
          end_note?: string | null
          ended_at?: string | null
          expires_at: string
          id?: string
          idempotency_key?: string | null
          reason: string
          space_id: string
          started_at?: string
        }
        Update: {
          access_level?: string
          actor_id?: string
          created_at?: string
          end_note?: string | null
          ended_at?: string | null
          expires_at?: string
          id?: string
          idempotency_key?: string | null
          reason?: string
          space_id?: string
          started_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "support_sessions_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "support_sessions_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_runs: {
        Row: {
          created_at: string
          error: string | null
          establishment_id: string
          failure_kind: string | null
          finished_at: string | null
          id: string
          integration_id: string
          kind: string
          period_end: string | null
          period_start: string | null
          points_written: number
          requested_by: string | null
          space_id: string
          started_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          establishment_id: string
          failure_kind?: string | null
          finished_at?: string | null
          id?: string
          integration_id: string
          kind: string
          period_end?: string | null
          period_start?: string | null
          points_written?: number
          requested_by?: string | null
          space_id: string
          started_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          establishment_id?: string
          failure_kind?: string | null
          finished_at?: string | null
          id?: string
          integration_id?: string
          kind?: string
          period_end?: string | null
          period_start?: string | null
          points_written?: number
          requested_by?: string | null
          space_id?: string
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sync_runs_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sync_runs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      task_reassignment_requests: {
        Row: {
          decided_at: string | null
          decided_by: string | null
          decision_reason: string | null
          id: string
          new_assignee_id: string | null
          reason: string
          requested_at: string
          requested_by: string
          space_id: string
          state: string
          task_id: string
        }
        Insert: {
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          new_assignee_id?: string | null
          reason: string
          requested_at?: string
          requested_by: string
          space_id: string
          state?: string
          task_id: string
        }
        Update: {
          decided_at?: string | null
          decided_by?: string | null
          decision_reason?: string | null
          id?: string
          new_assignee_id?: string | null
          reason?: string
          requested_at?: string
          requested_by?: string
          space_id?: string
          state?: string
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_reassignment_requests_decided_by_fkey"
            columns: ["decided_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_reassignment_requests_new_assignee_id_fkey"
            columns: ["new_assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_reassignment_requests_requested_by_fkey"
            columns: ["requested_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_reassignment_requests_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_reassignment_requests_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assignee_id: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          cancelled_reason: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          description: string | null
          establishment_id: string | null
          estimated_minutes: number
          id: string
          job_id: string | null
          planned_date: string | null
          space_id: string
          started_at: string | null
          state: string
          title: string
          weight: string
        }
        Insert: {
          assignee_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          establishment_id?: string | null
          estimated_minutes: number
          id?: string
          job_id?: string | null
          planned_date?: string | null
          space_id: string
          started_at?: string | null
          state?: string
          title: string
          weight: string
        }
        Update: {
          assignee_id?: string | null
          cancelled_at?: string | null
          cancelled_by?: string | null
          cancelled_reason?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          establishment_id?: string | null
          estimated_minutes?: number
          id?: string
          job_id?: string | null
          planned_date?: string | null
          space_id?: string
          started_at?: string | null
          state?: string
          title?: string
          weight?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_cancelled_by_fkey"
            columns: ["cancelled_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "client_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      terms_acceptances: {
        Row: {
          accepted_at: string
          accepted_by: string | null
          channel: string
          created_at: string
          establishment_id: string
          evidence_file_id: string | null
          id: string
          plan_version_id: string | null
          recorded_by: string | null
          service_version_id: string | null
          space_id: string
          subscription_id: string
        }
        Insert: {
          accepted_at: string
          accepted_by?: string | null
          channel: string
          created_at?: string
          establishment_id: string
          evidence_file_id?: string | null
          id?: string
          plan_version_id?: string | null
          recorded_by?: string | null
          service_version_id?: string | null
          space_id: string
          subscription_id: string
        }
        Update: {
          accepted_at?: string
          accepted_by?: string | null
          channel?: string
          created_at?: string
          establishment_id?: string
          evidence_file_id?: string | null
          id?: string
          plan_version_id?: string | null
          recorded_by?: string | null
          service_version_id?: string | null
          space_id?: string
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "terms_acceptances_accepted_by_fkey"
            columns: ["accepted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_acceptances_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_acceptances_evidence_file_id_fkey"
            columns: ["evidence_file_id"]
            isOneToOne: false
            referencedRelation: "files"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_acceptances_plan_version_id_fkey"
            columns: ["plan_version_id"]
            isOneToOne: false
            referencedRelation: "plan_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_acceptances_recorded_by_fkey"
            columns: ["recorded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_acceptances_service_version_id_fkey"
            columns: ["service_version_id"]
            isOneToOne: false
            referencedRelation: "service_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_acceptances_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "terms_acceptances_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      timer_events: {
        Row: {
          actor_id: string | null
          cause: string | null
          counter_kind: string
          created_at: string
          entity_id: string
          entity_type: string
          event_type: string
          id: string
          occurred_at: string
          space_id: string
        }
        Insert: {
          actor_id?: string | null
          cause?: string | null
          counter_kind: string
          created_at?: string
          entity_id: string
          entity_type: string
          event_type: string
          id?: string
          occurred_at: string
          space_id: string
        }
        Update: {
          actor_id?: string | null
          cause?: string | null
          counter_kind?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          event_type?: string
          id?: string
          occurred_at?: string
          space_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "timer_events_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timer_events_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_availability: {
        Row: {
          available: boolean
          id: string
          note: string | null
          space_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          available: boolean
          id?: string
          note?: string | null
          space_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          available?: boolean
          id?: string
          note?: string | null
          space_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_availability_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_availability_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_establishments: {
        Row: {
          created_at: string
          created_by: string | null
          establishment_id: string
          id: string
          revoked_at: string | null
          revoked_by: string | null
          space_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          establishment_id: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          space_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          establishment_id?: string
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          space_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_establishments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_establishments_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_establishments_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_establishments_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_establishments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      worker_specialties: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          revoked_at: string | null
          revoked_by: string | null
          space_id: string
          specialty: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          space_id: string
          specialty: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          revoked_at?: string | null
          revoked_by?: string | null
          space_id?: string
          specialty?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "worker_specialties_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_specialties_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_specialties_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "worker_specialties_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      client_establishment_status_events: {
        Row: {
          cause: string | null
          establishment_id: string | null
          from_state: string | null
          id: string | null
          occurred_at: string | null
          reason: string | null
          space_id: string | null
          to_state: string | null
        }
        Insert: {
          cause?: string | null
          establishment_id?: string | null
          from_state?: string | null
          id?: string | null
          occurred_at?: string | null
          reason?: string | null
          space_id?: string | null
          to_state?: string | null
        }
        Update: {
          cause?: string | null
          establishment_id?: string | null
          from_state?: string | null
          id?: string | null
          occurred_at?: string | null
          reason?: string | null
          space_id?: string | null
          to_state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "state_events_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
      client_jobs: {
        Row: {
          cancelled_at: string | null
          cancelled_reason: string | null
          category: string | null
          code: string | null
          completed_at: string | null
          correction_window_ends_at: string | null
          created_at: string | null
          establishment_id: string | null
          free_correction_used_at: string | null
          id: string | null
          published_at: string | null
          request_id: string | null
          space_id: string | null
          started_at: string | null
          state: string | null
        }
        Insert: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          category?: string | null
          code?: string | null
          completed_at?: string | null
          correction_window_ends_at?: string | null
          created_at?: string | null
          establishment_id?: string | null
          free_correction_used_at?: string | null
          id?: string | null
          published_at?: string | null
          request_id?: string | null
          space_id?: string | null
          started_at?: string | null
          state?: string | null
        }
        Update: {
          cancelled_at?: string | null
          cancelled_reason?: string | null
          category?: string | null
          code?: string | null
          completed_at?: string | null
          correction_window_ends_at?: string | null
          created_at?: string | null
          establishment_id?: string | null
          free_correction_used_at?: string | null
          id?: string | null
          published_at?: string | null
          request_id?: string | null
          space_id?: string | null
          started_at?: string | null
          state?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "jobs_establishment_id_fkey"
            columns: ["establishment_id"]
            isOneToOne: false
            referencedRelation: "establishments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: true
            referencedRelation: "requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "jobs_space_id_fkey"
            columns: ["space_id"]
            isOneToOne: false
            referencedRelation: "spaces"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_quote: {
        Args: { p_quote_id: string; p_reason?: string }
        Returns: undefined
      }
      accept_request: { Args: { p_request_id: string }; Returns: undefined }
      accept_revised_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      accept_space_invitation: { Args: { p_token: string }; Returns: string }
      accept_subscription_terms: {
        Args: { p_subscription_id: string; p_version_id: string }
        Returns: string
      }
      account_deletion_blockers: {
        Args: never
        Returns: {
          entity_id: string
          entity_name: string
          kind: string
          remedy: string
        }[]
      }
      act_on_opportunity: {
        Args: { p_action: string; p_message: string; p_opportunity_id: string }
        Returns: string
      }
      add_file_version: {
        Args: {
          p_checksum?: string
          p_file_id: string
          p_file_name: string
          p_mime_type: string
          p_size_bytes: number
          p_storage_path: string
          p_variant?: string
        }
        Returns: number
      }
      add_manual_opportunity: {
        Args: {
          p_category: string
          p_description?: string
          p_effort_category?: string
          p_establishment_id: string
          p_impact: string
          p_potential_service_id?: string
          p_recommended_action?: string
          p_title: string
        }
        Returns: string
      }
      add_opportunity_note: {
        Args: { p_body: string; p_kind: string; p_opportunity_id: string }
        Returns: string
      }
      add_platform_holiday: {
        Args: { p_date: string; p_name: string }
        Returns: string
      }
      apply_financial_hold_on_jobs: {
        Args: { p_establishment_id: string }
        Returns: number
      }
      apply_job_assignment: {
        Args: {
          p_job_id: string
          p_kind: string
          p_reason?: string
          p_worker_id: string
        }
        Returns: undefined
      }
      apply_scheduled_plan_change: {
        Args: { p_subscription_id: string }
        Returns: boolean
      }
      apply_scheduled_plan_change_internal: {
        Args: { p_subscription_id: string }
        Returns: boolean
      }
      approve_job_reassignment: {
        Args: { p_job_id: string; p_new_worker_id: string; p_reason?: string }
        Returns: undefined
      }
      approve_space_request: {
        Args: { p_idempotency_key?: string; p_request_id: string }
        Returns: string
      }
      approve_task_reassignment: {
        Args: {
          p_new_assignee_id: string
          p_reason?: string
          p_task_id: string
        }
        Returns: undefined
      }
      archive_establishment_note: {
        Args: { p_note_id: string; p_reason?: string }
        Returns: boolean
      }
      archive_file: {
        Args: { p_file_id: string; p_reason?: string }
        Returns: undefined
      }
      archive_menu_template: {
        Args: { p_reason?: string; p_template_id: string }
        Returns: undefined
      }
      archive_space_by_owner: {
        Args: {
          p_idempotency_key?: string
          p_reason: string
          p_space_id: string
        }
        Returns: string
      }
      assert_can_manage_integrations: {
        Args: { p_establishment_id: string; p_space_id: string }
        Returns: undefined
      }
      assert_can_write_menu_publication: {
        Args: {
          p_menu: Database["public"]["Tables"]["menus"]["Row"]
          p_pub: Database["public"]["Tables"]["menu_publications"]["Row"]
        }
        Returns: undefined
      }
      assert_establishment_service_running: {
        Args: { p_establishment_id: string }
        Returns: undefined
      }
      assert_terms_version_current: {
        Args: { p_subscription_id: string; p_version_id: string }
        Returns: number
      }
      assign_job: {
        Args: { p_job_id: string; p_reason?: string; p_worker_id: string }
        Returns: undefined
      }
      assign_menu_publication: {
        Args: { p_menu_id: string; p_reason?: string; p_worker_id: string }
        Returns: undefined
      }
      assign_task: {
        Args: { p_assignee_id: string; p_task_id: string }
        Returns: undefined
      }
      attach_file_to_message: {
        Args: { p_file_id: string; p_message_id: string }
        Returns: undefined
      }
      attach_file_to_request_draft: {
        Args: { p_file_id: string; p_request_id: string }
        Returns: undefined
      }
      attach_invoice_to_charge: {
        Args: { p_charge_id: string; p_file_id: string }
        Returns: undefined
      }
      attach_job_evidence: {
        Args: { p_file_id: string; p_job_id: string }
        Returns: undefined
      }
      audit_action_capability: { Args: { p_action: string }; Returns: string }
      audit_entity_establishment: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: string
      }
      audit_entity_is_visible: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: boolean
      }
      authorize_quote_start: {
        Args: { p_quote_id: string; p_reason?: string }
        Returns: undefined
      }
      auto_assign_job: { Args: { p_job_id: string }; Returns: string }
      begin_integration_connection: {
        Args: { p_establishment_id: string; p_provider: string }
        Returns: string
      }
      begin_request_analysis: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      block_job: {
        Args: { p_job_id: string; p_note?: string; p_reason_type: string }
        Returns: string
      }
      build_export_payload: {
        Args: {
          p_establishment_id?: string
          p_group_id?: string
          p_scope: string
          p_space_id: string
        }
        Returns: Json
      }
      can_export_scope: {
        Args: {
          p_establishment_id: string
          p_group_id: string
          p_scope: string
          p_space_id: string
        }
        Returns: boolean
      }
      can_read_billing: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      can_read_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      can_read_establishment: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      can_read_establishment_as_client: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      can_read_establishment_finance: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      can_read_establishment_notes: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      can_read_file: { Args: { p_file_id: string }; Returns: boolean }
      can_read_job: { Args: { p_job_id: string }; Returns: boolean }
      can_read_menu_establishment: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      can_read_task: { Args: { p_task_id: string }; Returns: boolean }
      can_write_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      can_write_establishment: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      can_write_establishment_as: {
        Args: { p_actor_id: string; p_establishment_id: string }
        Returns: boolean
      }
      can_write_file: {
        Args: { p_category: string; p_establishment_id: string }
        Returns: boolean
      }
      can_write_menus: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      cancel_accepted_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: undefined
      }
      cancel_cuotly_plan_change: {
        Args: { p_space_id: string }
        Returns: undefined
      }
      cancel_integration_connection: {
        Args: { p_integration_id: string }
        Returns: undefined
      }
      cancel_menu: {
        Args: { p_menu_id: string; p_reason?: string }
        Returns: undefined
      }
      cancel_scheduled_plan_change: {
        Args: { p_reason?: string; p_subscription_id: string }
        Returns: boolean
      }
      cancel_task: {
        Args: { p_reason?: string; p_task_id: string }
        Returns: undefined
      }
      change_cuotly_plan: {
        Args: {
          p_extra_establishments?: number
          p_extra_users?: number
          p_idempotency_key?: string
          p_new_plan: string
          p_space_id: string
        }
        Returns: string
      }
      change_plan_immediately: {
        Args: {
          p_idempotency_key?: string
          p_new_plan_id: string
          p_subscription_id: string
        }
        Returns: string
      }
      charge_collected_cents: { Args: { p_charge_id: string }; Returns: number }
      charge_outstanding_cents: {
        Args: { p_charge_id: string }
        Returns: number
      }
      charge_status: { Args: { p_charge_id: string }; Returns: string }
      claim_integration_runs: {
        Args: { p_limit?: number }
        Returns: {
          establishment_id: string
          external_property_id: string
          integration_id: string
          kind: string
          last_success_at: string
          period_end: string
          period_start: string
          provider: string
          run_id: string
          space_id: string
        }[]
      }
      claim_notification_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          amount_cents: number
          attempts: number
          audience: string
          channel: string
          deep_link: string
          delivery_id: string
          entity_type: string
          establishment_name: string
          event_type: string
          notification_id: string
          push_tokens: string[]
          recipient_email: string
          space_name: string
          subject: string
          threshold_percent: number
        }[]
      }
      claim_scheduled_jobs: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          id: string
          kind: string
          space_id: string
        }[]
      }
      client_can_accept_terms: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      client_can_edit_establishment_data: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      client_can_set_priority: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      client_can_view_billing: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      client_can_view_reports: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      client_opportunity_access: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      client_request_job: {
        Args: { p_request_id: string }
        Returns: {
          correction_window_ends_at: string
          free_correction_used: boolean
          job_id: string
          state: string
        }[]
      }
      client_request_quote: {
        Args: { p_request_id: string }
        Returns: {
          base_cents: number
          code: string
          concept: string
          decided_by_team: boolean
          decision_reason: string
          description: string
          preparing: boolean
          quote_id: string
          requires_payment_before_start: boolean
          start_authorized: boolean
          status: string
          tax_cents: number
          tax_rate_percent: number
          total_cents: number
        }[]
      }
      client_sees_opportunity: {
        Args: { p_establishment_id: string; p_scope: string }
        Returns: boolean
      }
      complete_correction: {
        Args: { p_correction_id: string; p_note?: string }
        Returns: undefined
      }
      complete_job: { Args: { p_job_id: string }; Returns: undefined }
      complete_menu_correction: {
        Args: { p_correction_id: string; p_note?: string }
        Returns: undefined
      }
      conditions_catalogue: {
        Args: { p_space_id: string }
        Returns: {
          conditions: string
          published_at: string
          subject_id: string
          subject_name: string
          subject_type: string
          version: number
          version_id: string
        }[]
      }
      confirm_cuotly_payment: {
        Args: { p_note?: string; p_payment_id: string }
        Returns: string
      }
      confirm_onboarding_step: {
        Args: { p_space_id: string; p_step: string }
        Returns: boolean
      }
      conversation_establishment_id: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      conversation_is_read_only: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      conversation_request_state: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      conversation_space_id: {
        Args: { p_conversation_id: string }
        Returns: string
      }
      convert_conversation_to_request: {
        Args: {
          p_context?: string
          p_conversation_id: string
          p_message_ids: string[]
        }
        Returns: string
      }
      copy_menu: {
        Args: { p_menu_id: string; p_name?: string; p_target_date: string }
        Returns: string
      }
      copy_paste_request: {
        Args: { p_source_request_id: string; p_target_establishment_id: string }
        Returns: string
      }
      counter_is_running: {
        Args: {
          p_counter_kind: string
          p_entity_id: string
          p_entity_type: string
        }
        Returns: boolean
      }
      counter_pause_cause: {
        Args: {
          p_counter_kind: string
          p_entity_id: string
          p_entity_type: string
        }
        Returns: string
      }
      create_establishment_note: {
        Args: {
          p_body: string
          p_establishment_id: string
          p_operational?: boolean
        }
        Returns: string
      }
      create_establishment_with_data: {
        Args: {
          p_address?: string
          p_city?: string
          p_contact_email?: string
          p_contact_name?: string
          p_facebook_url?: string
          p_group_id?: string
          p_group_name?: string
          p_idempotency_key?: string
          p_instagram?: string
          p_legal_name?: string
          p_name: string
          p_phone_primary?: string
          p_plan_id?: string
          p_postal_code?: string
          p_space_id: string
          p_tax_id?: string
          p_website_url?: string
        }
        Returns: string
      }
      create_job_task: {
        Args: {
          p_assignee_id?: string
          p_description?: string
          p_estimated_minutes: number
          p_job_id: string
          p_title: string
        }
        Returns: string
      }
      create_menu: {
        Args: {
          p_establishment_id: string
          p_kind: string
          p_name: string
          p_target_date: string
          p_template_id?: string
        }
        Returns: string
      }
      create_menu_template: {
        Args: {
          p_establishment_id: string
          p_name: string
          p_origin?: string
          p_quote_id?: string
        }
        Returns: string
      }
      create_plan_subscription: {
        Args: { p_establishment_id: string; p_plan_id: string }
        Returns: string
      }
      create_quote: {
        Args: {
          p_base_cents: number
          p_category?: string
          p_concept: string
          p_description?: string
          p_establishment_id: string
          p_outcome: string
          p_request_id?: string
          p_requires_payment_before_start?: boolean
        }
        Returns: string
      }
      create_report_draft: {
        Args: {
          p_category: string
          p_establishment_id?: string
          p_filters?: Json
          p_group_id?: string
          p_idempotency_key?: string
          p_name: string
          p_period_end: string
          p_period_start: string
          p_space_id: string
        }
        Returns: string
      }
      create_request_draft: {
        Args: {
          p_context?: string
          p_description: string
          p_establishment_id: string
        }
        Returns: string
      }
      create_restavor_space: { Args: never; Returns: string }
      create_service_subscription: {
        Args: { p_establishment_id: string; p_service_id: string }
        Returns: string
      }
      credit_menu_update: {
        Args: {
          p_pub: Database["public"]["Tables"]["menu_publications"]["Row"]
          p_reason: string
        }
        Returns: string
      }
      cuotly_after_payment_internal: {
        Args: { p_space_id: string }
        Returns: string
      }
      cuotly_charge_has_pending_declaration: {
        Args: { p_charge_id: string }
        Returns: boolean
      }
      cuotly_charge_outstanding_cents: {
        Args: { p_charge_id: string }
        Returns: number
      }
      cuotly_charge_reference: { Args: { p_space_id: string }; Returns: string }
      cuotly_charge_status: {
        Args: { p_charge_id: string; p_now?: string }
        Returns: string
      }
      cuotly_confirm_payment_internal: {
        Args: { p_note: string; p_payment_id: string }
        Returns: string
      }
      cuotly_constant: { Args: { p_name: string }; Returns: number }
      cuotly_monthly_base_cents: {
        Args: {
          p_extra_establishments: number
          p_extra_users: number
          p_plan: string
        }
        Returns: number
      }
      cuotly_plan_terms: {
        Args: { p_plan: string }
        Returns: {
          extra_establishment_cents: number
          extra_user_cents: number
          included_establishments: number
          included_users: number
          price_cents: number
          storage_gb: number
        }[]
      }
      cuotly_remaining_fraction: {
        Args: { p_end: string; p_now: string; p_start: string }
        Returns: number
      }
      cuotly_reminder_offset_hours: {
        Args: { p_event_type: string }
        Returns: number
      }
      cuotly_space_limits: {
        Args: { p_space_id: string }
        Returns: {
          max_establishments: number
          max_users: number
        }[]
      }
      cuotly_space_usage: {
        Args: { p_space_id: string }
        Returns: {
          active_establishments: number
          internal_users: number
          storage_bytes: number
        }[]
      }
      current_space_id: { Args: never; Returns: string }
      current_supervisors: {
        Args: { p_worker_id: string }
        Returns: {
          admin_id: string
          kind: string
        }[]
      }
      decide_absence: {
        Args: { p_absence_id: string; p_approve: boolean; p_note?: string }
        Returns: undefined
      }
      decide_space_request: {
        Args: { p_reason?: string; p_request_id: string; p_status: string }
        Returns: undefined
      }
      declare_cuotly_payment: {
        Args: {
          p_amount_cents: number
          p_charge_id: string
          p_idempotency_key?: string
          p_method: string
          p_note?: string
          p_paid_at?: string
          p_receipt_file_id?: string
          p_receipt_reference?: string
        }
        Returns: string
      }
      declare_platform_status_event: {
        Args: {
          p_body?: string
          p_component: string
          p_severity: string
          p_started_at?: string
          p_title: string
        }
        Returns: string
      }
      decline_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: undefined
      }
      detach_file_from_request_draft: {
        Args: { p_file_id: string; p_request_id: string }
        Returns: undefined
      }
      disconnect_integration: {
        Args: { p_integration_id: string; p_reason?: string }
        Returns: undefined
      }
      disconnect_integration_internal: {
        Args: { p_actor_id: string; p_integration_id: string; p_reason: string }
        Returns: boolean
      }
      edit_message: {
        Args: { p_body: string; p_message_id: string }
        Returns: undefined
      }
      emit_notification: {
        Args: {
          p_amount_cents?: number
          p_audience: string
          p_dedupe_key: string
          p_deep_link: string
          p_entity_id: string
          p_entity_type: string
          p_establishment_id?: string
          p_event_type: string
          p_recipient_id: string
          p_send_email?: boolean
          p_space_id: string
          p_threshold_percent?: number
        }
        Returns: string
      }
      emit_sla_notification: {
        Args: {
          p_event_type: string
          p_job_id: string
          p_threshold_percent?: number
        }
        Returns: number
      }
      end_support_session: {
        Args: { p_note?: string; p_session_id: string }
        Returns: boolean
      }
      enqueue_due_scheduled_jobs: {
        Args: { p_run_after?: string }
        Returns: number
      }
      enqueue_scheduled_job: {
        Args: {
          p_dedupe_key?: string
          p_kind: string
          p_run_after?: string
          p_space_id: string
        }
        Returns: string
      }
      establishment_audit: {
        Args: {
          p_actor_id?: string
          p_establishment_id: string
          p_family?: string
          p_from?: string
          p_limit?: number
          p_offset?: number
          p_to?: string
        }
        Returns: {
          action: string
          actor_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_value: Json
          old_value: Json
          reason: string
        }[]
      }
      establishment_audit_actors: {
        Args: { p_establishment_id: string }
        Returns: {
          actor_id: string
        }[]
      }
      establishment_client_users: {
        Args: { p_establishment_id: string }
        Returns: {
          display_name: string
          edit_establishment_data: boolean
          email: string
          granted_at: string
          role: string
          source: string
          user_id: string
          view_billing: boolean
        }[]
      }
      establishment_consumption_ledger: {
        Args: { p_establishment_id: string }
        Returns: {
          amount: number
          author_display: string
          author_id: string
          category: string
          entry_id: string
          entry_type: string
          occurred_at: string
          reason: string
          request_code: string
        }[]
      }
      establishment_cycle_allowance: {
        Args: { p_establishment_id: string }
        Returns: {
          category: string
          included: number
          remaining: number
          renews_at: string
        }[]
      }
      establishment_daily_menu_subscription: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      establishment_has_overdue_debt: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      establishment_integrations: {
        Args: { p_establishment_id: string }
        Returns: {
          account_label: string
          auth_kind: string
          check_pending: boolean
          external_property_id: string
          external_revocation_pending: boolean
          integration_id: string
          is_stale: boolean
          last_error: string
          last_failure_kind: string
          last_success_at: string
          last_sync_at: string
          next_attempt_at: string
          provider: string
          status: string
          sync_frequency: string
        }[]
      }
      establishment_space_id: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      establishment_status_reason: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      establishment_timezone: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      establishments_for_opportunity_detection: {
        Args: { p_limit?: number }
        Returns: {
          establishment_id: string
          space_id: string
          timezone: string
        }[]
      }
      establishments_with_nonpayment: {
        Args: { p_space_id: string }
        Returns: {
          establishment_id: string
          establishment_name: string
          oldest_due_at: string
          outstanding_cents: number
          stage: string
          status: string
        }[]
      }
      evaluate_establishment_dunning: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      evaluate_establishment_dunning_internal: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      export_space: {
        Args: {
          p_establishment_id?: string
          p_group_id?: string
          p_scope?: string
          p_space_id: string
        }
        Returns: Json
      }
      exportable_columns: { Args: { p_table: string }; Returns: string[] }
      file_current_version: { Args: { p_file_id: string }; Returns: number }
      financial_dashboard: {
        Args: { p_from: string; p_space_id: string; p_to: string }
        Returns: {
          collected_cents: number
          forecast_base_cents: number
          forecast_total_cents: number
          overdue_cents: number
          pending_cents: number
          recurring_monthly_base_cents: number
          recurring_monthly_total_cents: number
        }[]
      }
      financial_income_by_plan: {
        Args: { p_from: string; p_space_id: string; p_to: string }
        Returns: {
          base_cents: number
          collected_cents: number
          plan_id: string
          plan_name: string
          total_cents: number
        }[]
      }
      finish_integration_run: {
        Args: {
          p_account_label?: string
          p_error?: string
          p_failure_kind?: string
          p_outcome: string
          p_points?: Json
          p_run_id: string
        }
        Returns: number
      }
      finish_scheduled_job: {
        Args: { p_error?: string; p_job_id: string; p_ok: boolean }
        Returns: undefined
      }
      generate_monthly_charge: {
        Args: { p_due_at?: string; p_subscription_id: string }
        Returns: string
      }
      generate_monthly_charge_internal: {
        Args: { p_due_at?: string; p_subscription_id: string }
        Returns: string
      }
      generate_report_version: {
        Args: { p_report_id: string; p_snapshot: Json }
        Returns: string
      }
      get_or_create_consumption_cycle: {
        Args: { p_subscription_id: string }
        Returns: string
      }
      get_or_create_consumption_cycle_internal: {
        Args: { p_subscription_id: string }
        Returns: string
      }
      get_or_create_establishment_conversation: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      get_or_create_job_conversation: {
        Args: { p_job_id: string }
        Returns: string
      }
      get_or_create_menu_update_cycle: {
        Args: { p_subscription_id: string }
        Returns: string
      }
      get_or_create_request_conversation: {
        Args: { p_request_id: string }
        Returns: string
      }
      global_search: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          deep_link: string
          id: string
          kind: string
          state: string
          subtitle: string
          title: string
        }[]
      }
      grant_establishment_access: {
        Args: {
          p_edit_establishment_data?: boolean
          p_email: string
          p_establishment_id: string
          p_role: string
          p_view_billing?: boolean
        }
        Returns: string
      }
      grant_group_current_establishments_access: {
        Args: {
          p_edit_establishment_data?: boolean
          p_email: string
          p_group_id: string
          p_role: string
          p_view_billing?: boolean
        }
        Returns: number
      }
      grant_group_future_establishments_access: {
        Args: { p_email: string; p_group_id: string; p_role?: string }
        Returns: string
      }
      group_space_id: { Args: { p_group_id: string }; Returns: string }
      has_capability: {
        Args: { p_capability: string; p_space_id: string }
        Returns: boolean
      }
      has_capability_as: {
        Args: { p_capability: string; p_space_id: string; p_user_id: string }
        Returns: boolean
      }
      incident_attention: {
        Args: { p_incident_id: string }
        Returns: {
          first_response_minutes: number
          resolution_minutes: number
        }[]
      }
      incident_needs_reason: {
        Args: { p_from: string; p_to: string }
        Returns: boolean
      }
      incident_priority: { Args: { p_incident_id: string }; Returns: string }
      incident_priority_for: {
        Args: { p_impact: string; p_kind: string; p_plan: string }
        Returns: string
      }
      incident_side_of_caller: {
        Args: { p_incident_id: string }
        Returns: string
      }
      incident_transition_allowed: {
        Args: { p_actor: string; p_from: string; p_to: string }
        Returns: boolean
      }
      integration_auth_kind: { Args: { p_provider: string }; Returns: string }
      integration_client_owner_as: {
        Args: { p_establishment_id: string; p_user_id: string }
        Returns: boolean
      }
      integration_data_is_stale: {
        Args: { p_last_success_at: string; p_now?: string; p_provider: string }
        Returns: boolean
      }
      integration_retry_delay: {
        Args: { p_consecutive_failures: number }
        Returns: string
      }
      integration_sync_frequency: {
        Args: { p_provider: string }
        Returns: string
      }
      is_authorized_for_establishment: {
        Args: { p_establishment_id: string; p_user_id: string }
        Returns: boolean
      }
      is_authorized_worker_establishment: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      is_eligible_job_candidate: {
        Args: { p_job_id: string; p_user_id: string }
        Returns: boolean
      }
      is_establishment_client: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      is_establishment_member: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_platform_approver: { Args: never; Returns: boolean }
      is_platform_member: { Args: never; Returns: boolean }
      is_platform_owner: { Args: never; Returns: boolean }
      is_platform_subscription_manager: { Args: never; Returns: boolean }
      is_platform_supporter: { Args: never; Returns: boolean }
      is_space_member: { Args: { p_space_id: string }; Returns: boolean }
      issue_cuotly_charge_internal: {
        Args: {
          p_base_cents: number
          p_breakdown: Json
          p_concept: string
          p_due_at: string
          p_kind: string
          p_period_end: string
          p_period_start: string
          p_subscription_id: string
        }
        Returns: string
      }
      issue_cuotly_period_charge_internal: {
        Args: {
          p_period_end: string
          p_period_start: string
          p_subscription_id: string
        }
        Returns: string
      }
      job_assignee: { Args: { p_job_id: string }; Returns: string }
      job_candidate_ids: { Args: { p_job_id: string }; Returns: string[] }
      job_establishment_id: { Args: { p_job_id: string }; Returns: string }
      job_load_points: { Args: { p_category: string }; Returns: number }
      job_quote_gate: {
        Args: { p_job_id: string }
        Returns: {
          can_start: boolean
          paid: boolean
          quote_code: string
          quote_id: string
          requires_payment_before_start: boolean
          start_authorized: boolean
        }[]
      }
      job_space_id: { Args: { p_job_id: string }; Returns: string }
      link_file: {
        Args: {
          p_actor_id: string
          p_entity_id: string
          p_entity_type: string
          p_file_id: string
        }
        Returns: undefined
      }
      list_conversation_messages: {
        Args: { p_conversation_id: string }
        Returns: {
          body: string
          created_at: string
          edit_count: number
          edited_at: string
          id: string
          is_mine: boolean
          is_unread: boolean
          sender_display: string
          sender_id: string
          sender_role: string
        }[]
      }
      list_conversations: {
        Args: { p_space_id: string }
        Returns: {
          establishment_id: string
          establishment_name: string
          id: string
          is_read_only: boolean
          job_code: string
          job_id: string
          last_message_at: string
          last_message_preview: string
          last_sender_role: string
          request_code: string
          request_id: string
          type: string
          unread_count: number
        }[]
      }
      list_job_candidates: {
        Args: { p_job_id: string }
        Returns: {
          active_job_count: number
          active_load_points: number
          last_assigned_at: string
          worker_id: string
        }[]
      }
      list_menu_candidates: {
        Args: { p_menu_id: string }
        Returns: {
          active_load_points: number
          active_menu_count: number
          last_assigned_at: string
          worker_id: string
        }[]
      }
      list_task_candidates: {
        Args: { p_job_id: string }
        Returns: {
          active_load_points: number
          worker_id: string
        }[]
      }
      lock_active_menu_publication: {
        Args: { p_menu_id: string }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          assignment_mode: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          cycle_id: string
          debit_entry_id: string
          establishment_id: string
          id: string
          idempotency_key: string | null
          menu_id: string
          published_at: string | null
          published_by: string | null
          published_template_id: string | null
          published_version_id: string | null
          requested_at: string
          requested_before_cutoff: boolean
          requested_by: string
          requested_version_id: string
          space_id: string
        }
        SetofOptions: {
          from: "*"
          to: "menu_publications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      lock_published_menu_publication: {
        Args: { p_menu_id: string }
        Returns: {
          assigned_at: string | null
          assigned_to: string | null
          assignment_mode: string | null
          cancel_reason: string | null
          cancelled_at: string | null
          cancelled_by: string | null
          created_at: string
          cycle_id: string
          debit_entry_id: string
          establishment_id: string
          id: string
          idempotency_key: string | null
          menu_id: string
          published_at: string | null
          published_by: string | null
          published_template_id: string | null
          published_version_id: string | null
          requested_at: string
          requested_before_cutoff: boolean
          requested_by: string
          requested_version_id: string
          space_id: string
        }
        SetofOptions: {
          from: "*"
          to: "menu_publications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_delivery_failed: {
        Args: {
          p_dead: boolean
          p_delivery_id: string
          p_error: string
          p_next_attempt_at: string
        }
        Returns: undefined
      }
      mark_delivery_sent: {
        Args: { p_delivery_id: string; p_provider_message_id?: string }
        Returns: undefined
      }
      mark_integration_revocation_done: {
        Args: { p_integration_id: string }
        Returns: undefined
      }
      mark_menu_published: { Args: { p_menu_id: string }; Returns: undefined }
      mark_menu_ready_to_publish: {
        Args: { p_menu_id: string }
        Returns: undefined
      }
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      member_can_perform_jobs: {
        Args: { p_space_id: string; p_user_id: string }
        Returns: boolean
      }
      menu_candidate_ids: { Args: { p_menu_id: string }; Returns: string[] }
      menu_correction_window_ends_at: {
        Args: { p_published_at: string }
        Returns: string
      }
      menu_cutoff_at: {
        Args: { p_space_id: string; p_target_date: string }
        Returns: string
      }
      menu_deadlines: {
        Args: { p_menu_id: string }
        Returns: {
          cutoff_at: string
          guaranteed: boolean
          publish_by_at: string
          requested_at: string
        }[]
      }
      menu_publish_by_at: {
        Args: { p_space_id: string; p_target_date: string }
        Returns: string
      }
      menu_update_balance: {
        Args: { p_establishment_id: string }
        Returns: {
          available: number
          consumed: number
          cycle_end: string
          cycle_id: string
          cycle_start: string
          included_updates: number
        }[]
      }
      menu_update_cycle_window: {
        Args: { p_at?: string; p_subscription_id: string }
        Returns: {
          cycle_end: string
          cycle_start: string
        }[]
      }
      message_conversation_id: {
        Args: { p_message_id: string }
        Returns: string
      }
      my_active_sessions: {
        Args: never
        Returns: {
          created_at: string
          id: string
          ip: string
          is_current: boolean
          refreshed_at: string
          user_agent: string
        }[]
      }
      my_platform_access: { Args: never; Returns: Json }
      my_support_session: {
        Args: { p_space_id: string }
        Returns: {
          access_level: string
          expires_at: string
          id: string
          reason: string
          started_at: string
        }[]
      }
      next_request_code: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      next_request_code_internal: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      next_space_sequence: {
        Args: { p_sequence_name: string; p_space_id: string }
        Returns: number
      }
      notification_event_is_mandatory: {
        Args: { p_event_type: string }
        Returns: boolean
      }
      notification_push_context: {
        Args: { p_notification_id: string }
        Returns: {
          establishment_name: string
          subject: string
        }[]
      }
      notify_cuotly_event: {
        Args: {
          p_amount_cents?: number
          p_dedupe_key: string
          p_entity_id: string
          p_entity_type: string
          p_event_type: string
          p_space_id: string
        }
        Returns: number
      }
      notify_establishment_event: {
        Args: { p_establishment_id: string; p_event_type: string }
        Returns: number
      }
      notify_incident_opener: {
        Args: {
          p_dedupe_key: string
          p_event_type: string
          p_incident_id: string
        }
        Returns: number
      }
      notify_integration_event: {
        Args: {
          p_event_type: string
          p_integration_id: string
          p_run_id: string
        }
        Returns: number
      }
      notify_job_event: {
        Args: {
          p_event_type: string
          p_job_id: string
          p_threshold_percent?: number
        }
        Returns: number
      }
      notify_menu_event: {
        Args: { p_event_type: string; p_menu_id: string }
        Returns: number
      }
      notify_platform_incident: {
        Args: {
          p_dedupe_key: string
          p_event_type: string
          p_incident_id: string
        }
        Returns: number
      }
      notify_quote_event: {
        Args: { p_event_type: string; p_quote_id: string }
        Returns: number
      }
      notify_reassignment_deciders: {
        Args: {
          p_dedupe_key: string
          p_deep_link: string
          p_entity_id: string
          p_entity_type: string
          p_establishment_id?: string
          p_event_type: string
          p_space_id: string
        }
        Returns: number
      }
      notify_report_schedule_due_soon: {
        Args: { p_report_id: string }
        Returns: number
      }
      notify_space_lifecycle_event: {
        Args: { p_dedupe_key: string; p_event_type: string; p_space_id: string }
        Returns: number
      }
      notify_terms_version_published: {
        Args: {
          p_kind: string
          p_space_id: string
          p_subject_id: string
          p_version_id: string
        }
        Returns: number
      }
      onboarding_steps: {
        Args: never
        Returns: {
          derivable: boolean
          ordinal: number
          step: string
        }[]
      }
      open_incident: {
        Args: {
          p_app_version?: string
          p_category: string
          p_client_context?: Json
          p_description: string
          p_device?: string
          p_help_query?: string
          p_idempotency_key?: string
          p_impact?: string
          p_kind: string
          p_space_id: string
        }
        Returns: string
      }
      open_menu_team_error_correction: {
        Args: { p_description: string; p_menu_id: string }
        Returns: string
      }
      open_team_error_correction: {
        Args: { p_description: string; p_job_id: string }
        Returns: string
      }
      opportunity_default_priority: {
        Args: { p_impact: string }
        Returns: number
      }
      opportunity_is_visible_to_client: {
        Args: { p_status: string }
        Returns: boolean
      }
      opportunity_rule_category: { Args: { p_rule: string }; Returns: string }
      opportunity_rule_effort: { Args: { p_rule: string }; Returns: string }
      opportunity_rule_providers: {
        Args: { p_rule: string }
        Returns: string[]
      }
      opportunity_rule_scope: { Args: { p_rule: string }; Returns: string }
      opportunity_transition_allowed: {
        Args: { p_actor: string; p_from: string; p_to: string }
        Returns: boolean
      }
      pause_establishment_counters: {
        Args: { p_establishment_id: string }
        Returns: number
      }
      pending_integration_revocations: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          establishment_id: string
          integration_id: string
          provider: string
          space_id: string
        }[]
      }
      plan_change_preview: {
        Args: { p_new_plan_id: string; p_subscription_id: string }
        Returns: {
          difference_cents: number
          extra_large: number
          extra_medium: number
          extra_photo: number
          extra_small: number
          fraction: number
        }[]
      }
      plan_change_proration: {
        Args: { p_new_plan_id: string; p_subscription_id: string }
        Returns: {
          difference_cents: number
          extra_large: number
          extra_medium: number
          extra_photo: number
          extra_small: number
          fraction: number
        }[]
      }
      platform_audit: {
        Args: { p_limit?: number; p_offset?: number; p_scope?: string }
        Returns: {
          action: string
          actor_email: string
          actor_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_value: Json
          old_value: Json
          reason: string
          space_id: string
          space_name: string
          support_session_id: string
        }[]
      }
      platform_incident_messages: {
        Args: { p_incident_id: string }
        Returns: {
          author_email: string
          author_id: string
          author_name: string
          author_side: string
          body: string
          created_at: string
          id: string
        }[]
      }
      platform_list_charges: {
        Args: { p_open_only?: boolean }
        Returns: {
          concept: string
          due_at: string
          id: string
          issued_at: string
          kind: string
          outstanding_cents: number
          period_end: string
          period_start: string
          reference: string
          space_id: string
          space_name: string
          space_slug: string
          status: string
          total_cents: number
        }[]
      }
      platform_list_incidents: {
        Args: { p_incident_id?: string; p_open_only?: boolean }
        Returns: {
          app_version: string
          attachment_count: number
          category: string
          client_context: Json
          closed_at: string
          description: string
          device: string
          first_platform_response_at: string
          first_response_minutes: number
          help_query: string
          id: string
          impact: string
          kind: string
          last_activity_at: string
          message_count: number
          opened_at: string
          opened_by: string
          opened_by_email: string
          opened_by_name: string
          priority: string
          resolution_minutes: number
          resolved_at: string
          space_id: string
          space_name: string
          space_plan: string
          space_slug: string
          status: string
          status_reason: string
        }[]
      }
      platform_list_pending_payments: {
        Args: never
        Returns: {
          amount_cents: number
          charge_id: string
          charge_reference: string
          declared_at: string
          declared_by_email: string
          declared_side: string
          id: string
          method: string
          note: string
          paid_at: string
          receipt_reference: string
          space_id: string
          space_name: string
        }[]
      }
      platform_list_spaces: {
        Args: never
        Returns: {
          active_establishments: number
          created_at: string
          cuotly_archived_at: string
          cuotly_plan: string
          cuotly_reactivation_deadline_at: string
          cuotly_status: string
          cuotly_trial_ends_at: string
          current_period_end: string
          has_pending_declaration: boolean
          id: string
          internal_users: number
          name: string
          outstanding_cents: number
          overdue_cents: number
          owner_emails: string
          pending_plan: string
          slug: string
          storage_bytes: number
          support_active: boolean
        }[]
      }
      platform_list_support_sessions: {
        Args: { p_limit?: number }
        Returns: {
          access_level: string
          actions_count: number
          actor_email: string
          actor_id: string
          end_note: string
          ended_at: string
          expires_at: string
          id: string
          is_active: boolean
          reason: string
          space_id: string
          space_name: string
          space_slug: string
          started_at: string
        }[]
      }
      platform_list_users: {
        Args: { p_limit?: number; p_offset?: number }
        Returns: {
          can_approve_spaces: boolean
          can_manage_subscriptions: boolean
          can_support: boolean
          created_at: string
          email: string
          full_name: string
          id: string
          is_admin: boolean
          is_owner: boolean
          spaces_count: number
          two_factor_enrolled: boolean
        }[]
      }
      platform_panel_summary: { Args: never; Returns: Json }
      platform_reactivate_space: {
        Args: { p_reason: string; p_space_id: string }
        Returns: undefined
      }
      platform_revenue_by_month: {
        Args: { p_months?: number }
        Returns: {
          month: string
          paid_cents: number
          payments: number
        }[]
      }
      platform_status_snapshot: { Args: never; Returns: Json }
      post_incident_message: {
        Args: { p_body: string; p_incident_id: string }
        Returns: string
      }
      post_message: {
        Args: {
          p_body: string
          p_conversation_id: string
          p_idempotency_key?: string
        }
        Returns: string
      }
      prepare_menu: { Args: { p_menu_id: string }; Returns: undefined }
      provide_additional_information: {
        Args: { p_message: string; p_request_id: string }
        Returns: undefined
      }
      provide_menu_information: {
        Args: { p_answer?: string; p_menu_id: string }
        Returns: undefined
      }
      publish_job: {
        Args: { p_correction_window_ends_at: string; p_job_id: string }
        Returns: undefined
      }
      publish_plan_conditions: {
        Args: { p_conditions: string; p_plan_id: string }
        Returns: string
      }
      publish_service_conditions: {
        Args: { p_conditions: string; p_service_id: string }
        Returns: string
      }
      quote_status: { Args: { p_quote_id: string }; Returns: string }
      reactivate_establishment_after_payment: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      read_integration_credential: {
        Args: { p_integration_id: string }
        Returns: {
          ciphertext: string
          expires_at: string
          key_version: number
          kind: string
        }[]
      }
      read_revoked_integration_token: {
        Args: { p_integration_id: string }
        Returns: {
          ciphertext: string
          key_version: number
        }[]
      }
      record_classification: {
        Args: {
          p_actor_id: string
          p_category: string
          p_estimated_cost_millicents?: number
          p_fallback_reason?: string
          p_input_tokens?: number
          p_matched_keywords?: string[]
          p_model?: string
          p_output_tokens?: number
          p_request_id: string
          p_source: string
          p_summary: string
        }
        Returns: string
      }
      record_cuotly_payment: {
        Args: {
          p_amount_cents: number
          p_charge_id: string
          p_idempotency_key?: string
          p_method: string
          p_note?: string
          p_paid_at?: string
        }
        Returns: string
      }
      record_external_terms_acceptance: {
        Args: {
          p_accepted_on: string
          p_file_id: string
          p_subscription_id: string
          p_version_id: string
        }
        Returns: string
      }
      record_integration_revocation_attempt: {
        Args: { p_error?: string; p_integration_id: string; p_ok: boolean }
        Returns: boolean
      }
      record_menu_event: {
        Args: {
          p_from_state: string
          p_menu_id: string
          p_publication_id: string
          p_reason?: string
          p_to_state: string
        }
        Returns: undefined
      }
      record_state_event: {
        Args: {
          p_entity_id: string
          p_entity_type: string
          p_from_state: string
          p_reason?: string
          p_space_id: string
          p_to_state: string
        }
        Returns: undefined
      }
      refund_charge: {
        Args: { p_amount_cents: number; p_charge_id: string; p_reason: string }
        Returns: undefined
      }
      refund_menu_update: {
        Args: { p_publication_id: string; p_reason: string }
        Returns: string
      }
      register_file: {
        Args: {
          p_category: string
          p_checksum?: string
          p_establishment_id: string
          p_file_name: string
          p_mime_type: string
          p_name: string
          p_size_bytes: number
          p_storage_path: string
          p_variant?: string
          p_visibility?: string
        }
        Returns: string
      }
      register_incident_attachment: {
        Args: {
          p_content_type: string
          p_incident_id: string
          p_message_id?: string
          p_name: string
          p_size_bytes: number
          p_storage_path: string
        }
        Returns: string
      }
      register_menu_download: {
        Args: { p_format: string; p_menu_id: string }
        Returns: string
      }
      register_payment: {
        Args: {
          p_amount_cents: number
          p_charge_id: string
          p_idempotency_key?: string
          p_method: string
          p_note?: string
          p_paid_at?: string
          p_receipt_file_id?: string
        }
        Returns: string
      }
      register_push_device: {
        Args: {
          p_app_version?: string
          p_device_name?: string
          p_expo_push_token: string
          p_platform: string
        }
        Returns: string
      }
      reject_cuotly_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      reject_quote: {
        Args: { p_quote_id: string; p_reason?: string }
        Returns: undefined
      }
      reject_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      reject_task_reassignment: {
        Args: { p_reason?: string; p_task_id: string }
        Returns: undefined
      }
      release_financial_holds: {
        Args: { p_establishment_id: string }
        Returns: number
      }
      rename_report: {
        Args: { p_name: string; p_report_id: string }
        Returns: undefined
      }
      report_actor_role: { Args: { p_space_id: string }; Returns: string }
      report_finance_dataset: {
        Args: {
          p_establishment_id: string
          p_from: string
          p_space_id: string
          p_to: string
        }
        Returns: Json
      }
      report_is_visible_to_client: {
        Args: { p_status: string }
        Returns: boolean
      }
      report_menu_publication_error: {
        Args: { p_menu_id: string; p_reason: string }
        Returns: undefined
      }
      report_operation_dataset: {
        Args: {
          p_establishment_id: string
          p_from: string
          p_space_id: string
          p_to: string
        }
        Returns: Json
      }
      report_pending_opportunities: {
        Args: { p_report_id: string }
        Returns: number
      }
      report_recipients: {
        Args: { p_report_id: string }
        Returns: {
          audience: string
          recipient_id: string
        }[]
      }
      report_section_default_included: {
        Args: { p_category: string; p_section: string }
        Returns: boolean
      }
      report_section_requires_judgement: {
        Args: { p_section: string }
        Returns: boolean
      }
      report_sections_catalogue: { Args: never; Returns: string[] }
      report_transition_allowed: {
        Args: { p_actor: string; p_from: string; p_to: string }
        Returns: boolean
      }
      report_version_was_delivered: {
        Args: { p_version_id: string }
        Returns: boolean
      }
      reports_due_for_reminder: {
        Args: { p_limit?: number }
        Returns: {
          report_id: string
          space_id: string
        }[]
      }
      reports_due_for_send: {
        Args: { p_limit?: number }
        Returns: {
          report_id: string
          space_id: string
        }[]
      }
      request_absence: {
        Args: {
          p_ends_on: string
          p_reason?: string
          p_space_id: string
          p_starts_on: string
        }
        Returns: string
      }
      request_establishment_id: {
        Args: { p_request_id: string }
        Returns: string
      }
      request_file_permanent_deletion: {
        Args: { p_file_id: string; p_reason: string }
        Returns: undefined
      }
      request_free_correction: {
        Args: { p_description: string; p_job_id: string }
        Returns: string
      }
      request_integration_check: {
        Args: { p_integration_id: string }
        Returns: string
      }
      request_is_rankable: { Args: { p_state: string }; Returns: boolean }
      request_job_reassignment: {
        Args: { p_job_id: string; p_reason: string }
        Returns: undefined
      }
      request_menu_correction: {
        Args: { p_description: string; p_menu_id: string }
        Returns: string
      }
      request_menu_information: {
        Args: { p_menu_id: string; p_reason: string }
        Returns: undefined
      }
      request_menu_publication: {
        Args: { p_idempotency_key?: string; p_menu_id: string }
        Returns: string
      }
      request_more_information: {
        Args: { p_message: string; p_request_id: string }
        Returns: undefined
      }
      request_new_client_acceptance: {
        Args: {
          p_job_id: string
          p_new_category: string
          p_reason: string
          p_summary: string
        }
        Returns: undefined
      }
      request_space_id: { Args: { p_request_id: string }; Returns: string }
      request_state: { Args: { p_request_id: string }; Returns: string }
      request_task_reassignment: {
        Args: { p_reason: string; p_task_id: string }
        Returns: undefined
      }
      reschedule_substitute_supervision: {
        Args: { p_ends_at: string; p_supervision_id: string }
        Returns: undefined
      }
      resolve_platform_status_event: {
        Args: { p_id: string; p_note?: string }
        Returns: undefined
      }
      restore_space_by_owner: {
        Args: {
          p_idempotency_key?: string
          p_reason?: string
          p_space_id: string
        }
        Returns: string
      }
      resume_establishment_counters: {
        Args: { p_establishment_id: string }
        Returns: number
      }
      retire_platform_holiday: {
        Args: { p_id: string; p_reason: string }
        Returns: undefined
      }
      reverse_cuotly_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      reverse_payment: {
        Args: { p_payment_id: string; p_reason: string }
        Returns: undefined
      }
      revoke_establishment_access: {
        Args: {
          p_establishment_id: string
          p_reason?: string
          p_user_id: string
        }
        Returns: boolean
      }
      revoke_group_access: {
        Args: { p_group_id: string; p_reason?: string; p_user_id: string }
        Returns: boolean
      }
      revoke_my_session: { Args: { p_session_id: string }; Returns: boolean }
      revoke_platform_admin: { Args: { p_user_id: string }; Returns: boolean }
      revoke_push_token: {
        Args: { p_expo_push_token: string; p_reason?: string }
        Returns: boolean
      }
      revoke_supervision: {
        Args: { p_reason?: string; p_supervision_id: string }
        Returns: undefined
      }
      run_consumption_thresholds: {
        Args: { p_space_id: string }
        Returns: number
      }
      run_cuotly_billing_sweep: {
        Args: { p_now?: string; p_space_id: string }
        Returns: number
      }
      run_daily_menu_sweep: {
        Args: { p_now?: string; p_space_id: string }
        Returns: number
      }
      run_dunning_sweep: { Args: { p_space_id: string }; Returns: number }
      run_lifecycle_sweep: { Args: { p_space_id: string }; Returns: number }
      run_monthly_charges: { Args: { p_space_id: string }; Returns: number }
      run_scheduled_job: { Args: { p_job_id: string }; Returns: number }
      save_menu_version: {
        Args: {
          p_desserts: string[]
          p_drink?: string
          p_mains: string[]
          p_menu_id: string
          p_note?: string
          p_price_cents?: number
          p_starters: string[]
        }
        Returns: string
      }
      save_space_request_draft: {
        Args: {
          p_business_name: string
          p_contact_name: string
          p_email: string
          p_estimated_establishments?: number
          p_estimated_users?: number
          p_intended_use?: string
          p_phone?: string
          p_plan: string
          p_tax_address?: string
          p_tax_id?: string
          p_tax_name?: string
        }
        Returns: string
      }
      schedule_plan_change: {
        Args: { p_new_plan_id: string; p_subscription_id: string }
        Returns: string
      }
      schedule_report: {
        Args: {
          p_channel?: string
          p_include_csv?: boolean
          p_report_id: string
          p_scheduled_for: string
        }
        Returns: undefined
      }
      search_help_articles: {
        Args: { p_limit?: number; p_query: string; p_role?: string }
        Returns: {
          audience: string[]
          excerpt: string
          for_my_role: boolean
          id: string
          rank: number
          slug: string
          title: string
          topic: string
        }[]
      }
      send_quote: { Args: { p_quote_id: string }; Returns: undefined }
      send_report: { Args: { p_report_id: string }; Returns: number }
      service_monthly_price: {
        Args: { p_subscription_id: string }
        Returns: {
          base_cents: number
          premium_applied: boolean
        }[]
      }
      service_monthly_price_internal: {
        Args: { p_subscription_id: string }
        Returns: {
          base_cents: number
          premium_applied: boolean
          service_name: string
        }[]
      }
      session_is_two_factor: { Args: never; Returns: boolean }
      set_admin_can_approve_reports: {
        Args: { p_space_id: string; p_user_id: string; p_value: boolean }
        Returns: undefined
      }
      set_admin_can_perform_jobs: {
        Args: { p_space_id: string; p_user_id: string; p_value: boolean }
        Returns: undefined
      }
      set_cuotly_extras: {
        Args: {
          p_extra_establishments: number
          p_extra_users: number
          p_idempotency_key?: string
          p_space_id: string
        }
        Returns: string
      }
      set_establishment_data: {
        Args: {
          p_address?: string
          p_city?: string
          p_contact_email?: string
          p_contact_name?: string
          p_domain?: string
          p_establishment_id: string
          p_facebook_url?: string
          p_instagram?: string
          p_legal_name?: string
          p_name: string
          p_opening_hours?: string
          p_phone_primary?: string
          p_phone_secondary?: string
          p_postal_code?: string
          p_tax_id?: string
          p_web_platform?: string
          p_website_url?: string
        }
        Returns: boolean
      }
      set_establishment_nonpayment_status: {
        Args: { p_cause: string; p_establishment_id: string; p_status: string }
        Returns: undefined
      }
      set_establishment_status: {
        Args: {
          p_establishment_id: string
          p_reason?: string
          p_status: string
        }
        Returns: undefined
      }
      set_incident_status: {
        Args: { p_incident_id: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      set_job_required_specialty: {
        Args: { p_job_id: string; p_specialty: string }
        Returns: undefined
      }
      set_notification_preference: {
        Args: {
          p_email: boolean
          p_event_type: string
          p_in_app: boolean
          p_push?: boolean
          p_space_id: string
        }
        Returns: undefined
      }
      set_opportunity_status: {
        Args: { p_opportunity_id: string; p_reason?: string; p_status: string }
        Returns: undefined
      }
      set_platform_admin: {
        Args: {
          p_can_approve_spaces?: boolean
          p_can_manage_subscriptions?: boolean
          p_can_support?: boolean
          p_user_id: string
        }
        Returns: undefined
      }
      set_principal_supervisor: {
        Args: { p_admin_id: string; p_space_id: string; p_worker_id: string }
        Returns: string
      }
      set_report_sections: {
        Args: { p_report_id: string; p_sections: Json }
        Returns: undefined
      }
      set_report_status: {
        Args: { p_reason?: string; p_report_id: string; p_status: string }
        Returns: undefined
      }
      set_request_priority_order: {
        Args: { p_establishment_id: string; p_request_ids: string[] }
        Returns: undefined
      }
      set_space_cuotly_status_internal: {
        Args: {
          p_cause: string
          p_reason: string
          p_space_id: string
          p_status: string
        }
        Returns: undefined
      }
      set_space_details: {
        Args: {
          p_address: string
          p_legal_name: string
          p_space_id: string
          p_tax_id: string
        }
        Returns: boolean
      }
      set_space_logo: {
        Args: { p_space_id: string; p_storage_path: string }
        Returns: boolean
      }
      set_space_name: {
        Args: { p_name: string; p_space_id: string }
        Returns: boolean
      }
      set_space_payment_term: {
        Args: { p_days: number; p_space_id: string }
        Returns: boolean
      }
      set_space_timezone: {
        Args: { p_reason: string; p_space_id: string; p_timezone: string }
        Returns: boolean
      }
      set_substitute_supervisor: {
        Args: {
          p_admin_id: string
          p_ends_at: string
          p_space_id: string
          p_starts_at: string
          p_worker_id: string
        }
        Returns: string
      }
      set_task_planned_date: {
        Args: { p_planned_date?: string; p_task_id: string }
        Returns: undefined
      }
      share_file_with_client: {
        Args: { p_file_id: string }
        Returns: undefined
      }
      sla_sweep_counters: {
        Args: { p_space_id: string }
        Returns: {
          category: string
          counter_kind: string
          entity_id: string
          entity_type: string
          events: Json
          job_id: string
          start_sla_hours: number
          timezone: string
        }[]
      }
      space_calendar: {
        Args: {
          p_establishment_id?: string
          p_from: string
          p_kind?: string
          p_space_id: string
          p_to: string
          p_worker_id?: string
        }
        Returns: {
          entity_id: string
          entity_type: string
          establishment_id: string
          event_date: string
          kind: string
          state: string
          title: string
        }[]
      }
      space_job_counters: {
        Args: { p_space_id: string }
        Returns: {
          category: string
          counter_kind: string
          establishment_id: string
          events: Json
          job_code: string
          job_id: string
          job_state: string
          start_sla_hours: number
          timezone: string
        }[]
      }
      space_onboarding_progress: {
        Args: { p_space_id: string }
        Returns: {
          confirmed_at: string
          done: boolean
          ordinal: number
          source: string
          step: string
        }[]
      }
      space_request_transition_allowed: {
        Args: { p_actor: string; p_from: string; p_to: string }
        Returns: boolean
      }
      space_slug: { Args: { p_space_id: string }; Returns: string }
      space_slug_from_name: { Args: { p_name: string }; Returns: string }
      space_status_is_archived: { Args: { p_status: string }; Returns: boolean }
      space_team_load: {
        Args: { p_space_id: string }
        Returns: {
          load_points: number
          role: string
          user_id: string
        }[]
      }
      space_timezone: { Args: { p_space_id: string }; Returns: string }
      start_correction: {
        Args: { p_correction_id: string }
        Returns: undefined
      }
      start_job: { Args: { p_job_id: string }; Returns: undefined }
      start_support_session: {
        Args: {
          p_access_level?: string
          p_idempotency_key?: string
          p_minutes?: number
          p_reason: string
          p_space_id: string
        }
        Returns: string
      }
      store_integration_credential: {
        Args: {
          p_account_label?: string
          p_actor_id: string
          p_ciphertext: string
          p_expires_at?: string
          p_external_property_id?: string
          p_integration_id: string
          p_key_version: number
          p_kind: string
        }
        Returns: string
      }
      submit_request: { Args: { p_request_id: string }; Returns: undefined }
      submit_space_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      subscription_current_period: {
        Args: { p_subscription_id: string }
        Returns: {
          period_end: string
          period_start: string
        }[]
      }
      subscription_terms: {
        Args: { p_subscription_id: string }
        Returns: {
          accepted_at: string
          accepted_channel: string
          accepted_version: number
          accepted_version_id: string
          current_conditions: string
          current_published_at: string
          current_version: number
          current_version_id: string
          evidence_file_id: string
          status: string
          subject_name: string
          subject_type: string
        }[]
      }
      support_access_level: { Args: { p_space_id: string }; Returns: string }
      support_is_open_at: { Args: { p_at?: string }; Returns: boolean }
      support_minutes_between: {
        Args: { p_from: string; p_to: string }
        Returns: number
      }
      support_session_actions: {
        Args: { p_session_id: string }
        Returns: {
          action: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_value: Json
          old_value: Json
          reason: string
        }[]
      }
      task_assignee_is_valid: {
        Args: {
          p_assignee_id: string
          p_establishment_id: string
          p_space_id: string
        }
        Returns: boolean
      }
      task_load_points: { Args: { p_weight: string }; Returns: number }
      task_weight_for_minutes: { Args: { p_minutes: number }; Returns: string }
      team_menu_queue: {
        Args: { p_space_id: string }
        Returns: {
          assigned_to: string
          assignment_mode: string
          cutoff_at: string
          establishment_id: string
          establishment_name: string
          guaranteed: boolean
          is_assigned: boolean
          kind: string
          menu_id: string
          name: string
          pending_corrections: number
          publication_id: string
          publish_by_at: string
          requested_at: string
          state: string
          target_date: string
          updated_at: string
        }[]
      }
      transfer_space_ownership: {
        Args: {
          p_idempotency_key?: string
          p_reason?: string
          p_space_id: string
          p_to_user_id: string
        }
        Returns: string
      }
      unblock_job: {
        Args: { p_job_id: string; p_note?: string; p_reverted?: boolean }
        Returns: undefined
      }
      uncovered_jobs_for_absence: {
        Args: { p_absence_id: string }
        Returns: {
          code: string
          establishment_name: string
          job_id: string
          state: string
        }[]
      }
      unregister_push_device: {
        Args: { p_expo_push_token: string }
        Returns: boolean
      }
      upcoming_renewals: {
        Args: { p_days?: number; p_space_id: string }
        Returns: {
          establishment_id: string
          establishment_name: string
          kind: string
          monthly_total_cents: number
          plan_name: string
          renews_at: string
        }[]
      }
      update_menu_details: {
        Args: {
          p_kind: string
          p_menu_id: string
          p_name: string
          p_target_date: string
          p_template_id: string
        }
        Returns: undefined
      }
      update_menu_template_design: {
        Args: {
          p_accent_color: string
          p_background_color: string
          p_footer_text?: string
          p_heading_text?: string
          p_layout: string
          p_show_prices?: boolean
          p_template_id: string
          p_text_color: string
        }
        Returns: undefined
      }
      update_opportunity_proposal: {
        Args: {
          p_description?: string
          p_effort_category?: string
          p_impact?: string
          p_include_in_report?: boolean
          p_opportunity_id: string
          p_potential_service_id?: string
          p_priority?: number
          p_recommended_action?: string
          p_title?: string
        }
        Returns: undefined
      }
      update_quote_draft: {
        Args: {
          p_base_cents: number
          p_category?: string
          p_concept: string
          p_description?: string
          p_quote_id: string
          p_requires_payment_before_start?: boolean
        }
        Returns: undefined
      }
      update_request_draft: {
        Args: {
          p_context?: string
          p_description: string
          p_request_id: string
        }
        Returns: number
      }
      update_task_state: {
        Args: { p_state: string; p_task_id: string }
        Returns: undefined
      }
      upload_payment_receipt: {
        Args: { p_charge_id: string; p_file_id: string; p_note?: string }
        Returns: string
      }
      upsert_detected_opportunity: {
        Args: {
          p_establishment_id: string
          p_evidence: Json
          p_impact: string
          p_period_end: string
          p_period_start: string
          p_rule: string
          p_severity: number
          p_subject: string
        }
        Returns: string
      }
      validate_classification: {
        Args: { p_category: string; p_request_id: string; p_summary: string }
        Returns: undefined
      }
      waive_charge: {
        Args: { p_charge_id: string; p_reason: string }
        Returns: undefined
      }
      worker_active_load_points: {
        Args: { p_space_id: string; p_user_id: string }
        Returns: number
      }
      worker_load: {
        Args: { p_space_id: string; p_user_id: string }
        Returns: number
      }
      worker_report_dataset: {
        Args: {
          p_from: string
          p_space_id: string
          p_to: string
          p_user_id: string
        }
        Returns: Json
      }
    }
    Enums: {
      member_status:
        | "invited"
        | "active"
        | "temporarily_absent"
        | "inactive"
        | "access_revoked"
      space_role: "owner" | "admin" | "worker"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      member_status: [
        "invited",
        "active",
        "temporarily_absent",
        "inactive",
        "access_revoked",
      ],
      space_role: ["owner", "admin", "worker"],
    },
  },
} as const
