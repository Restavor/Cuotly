// Generado a partir del esquema real del proyecto de Supabase de Cuotly
// (generate_typescript_types, 04/09/2026), con las 51 migraciones del
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
          code: string
          created_at: string
          group_id: string
          id: string
          name: string
          space_id: string
          status: string
        }
        Insert: {
          code?: string
          created_at?: string
          group_id: string
          id?: string
          name: string
          space_id: string
          status?: string
        }
        Update: {
          code?: string
          created_at?: string
          group_id?: string
          id?: string
          name?: string
          space_id?: string
          status?: string
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
          space_id: string
          updated_at: string
        }
        Insert: {
          email?: boolean
          event_type: string
          id?: string
          in_app?: boolean
          profile_id: string
          space_id: string
          updated_at?: string
        }
        Update: {
          email?: boolean
          event_type?: string
          id?: string
          in_app?: boolean
          profile_id?: string
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
      plans: {
        Row: {
          created_at: string
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
      platform_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
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
      services: {
        Row: {
          created_at: string
          id: string
          name: string
          price_cents: number
          price_premium_cents: number | null
          space_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          price_cents: number
          price_premium_cents?: number | null
          space_id: string
        }
        Update: {
          created_at?: string
          id?: string
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
      space_memberships: {
        Row: {
          can_perform_jobs: boolean
          created_at: string
          id: string
          role: Database["public"]["Enums"]["space_role"]
          space_id: string
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Insert: {
          can_perform_jobs?: boolean
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["space_role"]
          space_id: string
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Update: {
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
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string
          tax_rate_percent: number
          timezone: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          slug: string
          tax_rate_percent?: number
          timezone?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          slug?: string
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
      accept_request: { Args: { p_request_id: string }; Returns: undefined }
      accept_revised_request: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      accept_space_invitation: { Args: { p_token: string }; Returns: string }
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
      archive_file: {
        Args: { p_file_id: string; p_reason?: string }
        Returns: undefined
      }
      assert_establishment_service_running: {
        Args: { p_establishment_id: string }
        Returns: undefined
      }
      assign_job: {
        Args: { p_job_id: string; p_reason?: string; p_worker_id: string }
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
      audit_action_capability: { Args: { p_action: string }; Returns: string }
      audit_entity_is_visible: {
        Args: { p_entity_id: string; p_entity_type: string }
        Returns: boolean
      }
      auto_assign_job: { Args: { p_job_id: string }; Returns: string }
      begin_request_analysis: {
        Args: { p_request_id: string }
        Returns: undefined
      }
      block_job: {
        Args: { p_job_id: string; p_note?: string; p_reason_type: string }
        Returns: string
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
      can_read_file: { Args: { p_file_id: string }; Returns: boolean }
      can_read_job: { Args: { p_job_id: string }; Returns: boolean }
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
      cancel_accepted_request: {
        Args: { p_reason?: string; p_request_id: string }
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
      claim_notification_deliveries: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          audience: string
          deep_link: string
          delivery_id: string
          event_type: string
          notification_id: string
          recipient_email: string
          space_name: string
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
      client_can_view_billing: {
        Args: { p_establishment_id: string }
        Returns: boolean
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
      complete_correction: {
        Args: { p_correction_id: string; p_note?: string }
        Returns: undefined
      }
      complete_job: { Args: { p_job_id: string }; Returns: undefined }
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
      create_plan_subscription: {
        Args: { p_establishment_id: string; p_plan_id: string }
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
      decline_request: {
        Args: { p_reason?: string; p_request_id: string }
        Returns: undefined
      }
      detach_file_from_request_draft: {
        Args: { p_file_id: string; p_request_id: string }
        Returns: undefined
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
      enqueue_scheduled_job: {
        Args: {
          p_dedupe_key?: string
          p_kind: string
          p_run_after?: string
          p_space_id: string
        }
        Returns: string
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
      establishment_has_overdue_debt: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      establishment_space_id: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      establishment_status_reason: {
        Args: { p_establishment_id: string }
        Returns: string
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
      group_space_id: { Args: { p_group_id: string }; Returns: string }
      has_capability: {
        Args: { p_capability: string; p_space_id: string }
        Returns: boolean
      }
      has_capability_as: {
        Args: { p_capability: string; p_space_id: string; p_user_id: string }
        Returns: boolean
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
      is_platform_owner: { Args: never; Returns: boolean }
      is_space_member: { Args: { p_space_id: string }; Returns: boolean }
      job_assignee: { Args: { p_job_id: string }; Returns: string }
      job_candidate_ids: { Args: { p_job_id: string }; Returns: string[] }
      job_establishment_id: { Args: { p_job_id: string }; Returns: string }
      job_load_points: { Args: { p_category: string }; Returns: number }
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
      list_task_candidates: {
        Args: { p_job_id: string }
        Returns: {
          active_load_points: number
          worker_id: string
        }[]
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
      mark_notification_read: {
        Args: { p_notification_id: string }
        Returns: undefined
      }
      member_can_perform_jobs: {
        Args: { p_space_id: string; p_user_id: string }
        Returns: boolean
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
      next_request_code: {
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
      notify_establishment_event: {
        Args: { p_establishment_id: string; p_event_type: string }
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
      open_team_error_correction: {
        Args: { p_description: string; p_job_id: string }
        Returns: string
      }
      pause_establishment_counters: {
        Args: { p_establishment_id: string }
        Returns: number
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
      post_message: {
        Args: {
          p_body: string
          p_conversation_id: string
          p_idempotency_key?: string
        }
        Returns: string
      }
      provide_additional_information: {
        Args: { p_message: string; p_request_id: string }
        Returns: undefined
      }
      publish_job: {
        Args: { p_correction_window_ends_at: string; p_job_id: string }
        Returns: undefined
      }
      reactivate_establishment_after_payment: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      record_classification: {
        Args: {
          p_actor_id: string
          p_category: string
          p_estimated_cost_cents?: number
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
      reject_request: {
        Args: { p_reason: string; p_request_id: string }
        Returns: undefined
      }
      release_financial_holds: {
        Args: { p_establishment_id: string }
        Returns: number
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
      request_job_reassignment: {
        Args: { p_job_id: string; p_reason: string }
        Returns: undefined
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
      reschedule_substitute_supervision: {
        Args: { p_ends_at: string; p_supervision_id: string }
        Returns: undefined
      }
      resume_establishment_counters: {
        Args: { p_establishment_id: string }
        Returns: number
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
      revoke_supervision: {
        Args: { p_reason?: string; p_supervision_id: string }
        Returns: undefined
      }
      run_consumption_thresholds: {
        Args: { p_space_id: string }
        Returns: number
      }
      run_dunning_sweep: { Args: { p_space_id: string }; Returns: number }
      run_lifecycle_sweep: { Args: { p_space_id: string }; Returns: number }
      run_monthly_charges: { Args: { p_space_id: string }; Returns: number }
      run_scheduled_job: { Args: { p_job_id: string }; Returns: number }
      schedule_plan_change: {
        Args: { p_new_plan_id: string; p_subscription_id: string }
        Returns: string
      }
      set_admin_can_perform_jobs: {
        Args: { p_space_id: string; p_user_id: string; p_value: boolean }
        Returns: undefined
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
      set_job_required_specialty: {
        Args: { p_job_id: string; p_specialty: string }
        Returns: undefined
      }
      set_notification_preference: {
        Args: {
          p_email: boolean
          p_event_type: string
          p_in_app: boolean
          p_space_id: string
        }
        Returns: undefined
      }
      set_principal_supervisor: {
        Args: { p_admin_id: string; p_space_id: string; p_worker_id: string }
        Returns: string
      }
      set_space_name: {
        Args: { p_name: string; p_space_id: string }
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
        Args: { p_from: string; p_space_id: string; p_to: string }
        Returns: {
          entity_id: string
          entity_type: string
          event_date: string
          kind: string
          state: string
          title: string
        }[]
      }
      space_slug: { Args: { p_space_id: string }; Returns: string }
      start_correction: {
        Args: { p_correction_id: string }
        Returns: undefined
      }
      start_job: { Args: { p_job_id: string }; Returns: undefined }
      submit_request: { Args: { p_request_id: string }; Returns: undefined }
      task_load_points: { Args: { p_weight: string }; Returns: number }
      task_weight_for_minutes: { Args: { p_minutes: number }; Returns: string }
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
      upcoming_renewals: {
        Args: { p_days?: number; p_space_id: string }
        Returns: {
          establishment_id: string
          establishment_name: string
          monthly_total_cents: number
          plan_name: string
          renews_at: string
        }[]
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
