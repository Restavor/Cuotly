// Generado a partir del esquema real del proyecto de Supabase de Cuotly
// (mcp__Supabase__generate_typescript_types, 30/08/2026).
//
// AVISO (01/09/2026): este archivo se quedó en el esquema del Hito 2 y el
// esquema real va por la migración 42. No es un problema mientras la web
// solo use lo que aquí está descrito —el resto del producto vive de
// momento en el servidor— pero cada función nueva que una pantalla llame
// hay que añadirla aquí a mano hasta que se pueda volver a generar el
// archivo entero contra el proyecto real. Las añadidas a mano están
// marcadas con el comentario "(a mano)". Regenerarlo es una tarea
// pendiente anotada en el ROADMAP: no se hace desde esta sesión porque no
// hay CLI de Supabase ni proyecto con estas migraciones aplicadas.
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
      establishment_memberships: {
        Row: {
          created_at: string
          establishment_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          establishment_id: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          establishment_id?: string
          id?: string
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
      // Festivos del espacio: los necesita el cálculo de la ventana de
      // corrección al publicar (RN-COR-02 + RN-CLK-10). A mano.
      holidays: {
        Row: {
          created_at: string
          holiday_date: string
          id: string
          name: string | null
          space_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      // La propuesta de la IA: solo la lee el equipo (RN-CLS-04). A mano.
      classifications: {
        Row: {
          created_at: string
          decided_category: string | null
          decided_summary: string | null
          fallback_reason: string | null
          id: string
          matched_keywords: string[] | null
          model: string | null
          proposed_category: string | null
          proposed_summary: string | null
          request_id: string
          source: string
          space_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      // jobs y charges, también a mano. `charges` tiene privilegios de
      // columna, así que aquí solo están las legibles.
      jobs: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          category: string | null
          code: string
          completed_at: string | null
          correction_window_ends_at: string | null
          created_at: string
          establishment_id: string
          free_correction_used_at: string | null
          id: string
          published_at: string | null
          request_id: string
          required_specialty: string | null
          space_id: string
          started_at: string | null
          state: string
        }
        Insert: never
        Update: never
        Relationships: []
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
          period_end: string
          period_start: string
          space_id: string
          subscription_id: string | null
          tax_cents: number
          tax_rate_percent: number
          total_cents: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      // Solo las columnas que `authenticated` puede leer: `requests` tiene
      // privilegios de columna (CLAUDE.md), así que `select *` devuelve
      // 403 y toda consulta debe enumerar. (a mano, migración 17 y ss.)
      requests: {
        Row: {
          accepted_at: string | null
          accepted_by: string | null
          code: string
          context: string | null
          created_at: string
          created_by: string | null
          description: string
          establishment_id: string
          id: string
          rejected_at: string | null
          rejected_reason: string | null
          space_id: string
          state: string
          validated_at: string | null
          validated_category: string | null
          validated_summary: string | null
        }
        Insert: never
        Update: never
        Relationships: []
      }
      group_memberships: {
        Row: {
          created_at: string
          group_id: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          id?: string
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
          created_at: string
          id: string
          role: Database["public"]["Enums"]["space_role"]
          space_id: string
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["space_role"]
          space_id: string
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Update: {
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
      spaces: {
        Row: {
          created_at: string
          created_by: string
          id: string
          name: string
          slug: string
          timezone: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          name: string
          slug: string
          timezone?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          name?: string
          slug?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_space_invitation: { Args: { p_token: string }; Returns: string }
      // HU-05 (a mano, migración 20260830000042).
      my_active_sessions: {
        Args: never
        Returns: {
          id: string
          created_at: string
          refreshed_at: string | null
          user_agent: string | null
          ip: string | null
          is_current: boolean | null
        }[]
      }
      revoke_my_session: { Args: { p_session_id: string }; Returns: boolean }
      // Área de cliente (a mano, migraciones 17, 19 y 20).
      establishment_cycle_allowance: {
        Args: { p_establishment_id: string }
        Returns: {
          category: string
          included: number
          remaining: number
          renews_at: string
        }[]
      }
      create_request_draft: {
        Args: { p_establishment_id: string; p_description: string; p_context?: string | null }
        Returns: string
      }
      submit_request: { Args: { p_request_id: string }; Returns: undefined }
      accept_request: { Args: { p_request_id: string }; Returns: undefined }
      // Conversación y acciones del cliente (a mano, migraciones 17, 22 y 25).
      get_or_create_request_conversation: {
        Args: { p_request_id: string }
        Returns: string
      }
      list_conversation_messages: {
        Args: { p_conversation_id: string }
        Returns: {
          id: string
          body: string
          sender_role: string
          sender_display: string
          sender_id: string | null
          created_at: string
          edited_at: string | null
          edit_count: number
          is_unread: boolean
        }[]
      }
      post_message: {
        Args: { p_conversation_id: string; p_body: string; p_idempotency_key?: string | null }
        Returns: string
      }
      mark_conversation_read: { Args: { p_conversation_id: string }; Returns: undefined }
      conversation_is_read_only: { Args: { p_conversation_id: string }; Returns: boolean }
      decline_request: {
        Args: { p_request_id: string; p_reason?: string | null }
        Returns: undefined
      }
      provide_additional_information: {
        Args: { p_request_id: string; p_message: string }
        Returns: undefined
      }
      accept_revised_request: { Args: { p_request_id: string }; Returns: undefined }
      request_free_correction: {
        Args: { p_job_id: string; p_description: string }
        Returns: string
      }
      establishment_consumption_ledger: {
        Args: { p_establishment_id: string }
        Returns: {
          entry_id: string
          occurred_at: string
          category: string
          amount: number
          entry_type: string
          reason: string | null
          request_code: string | null
          author_display: string
          author_id: string | null
        }[]
      }
      client_can_view_billing: { Args: { p_establishment_id: string }; Returns: boolean }
      // Lado del equipo (a mano, migraciones 17, 18, 22, 23 y 25).
      begin_request_analysis: { Args: { p_request_id: string }; Returns: undefined }
      validate_classification: {
        Args: { p_request_id: string; p_category: string; p_summary: string }
        Returns: undefined
      }
      request_more_information: {
        Args: { p_request_id: string; p_message: string }
        Returns: undefined
      }
      reject_request: { Args: { p_request_id: string; p_reason: string }; Returns: undefined }
      list_job_candidates: {
        Args: { p_job_id: string }
        Returns: {
          worker_id: string
          active_load_points: number
          active_job_count: number
          last_assigned_at: string | null
        }[]
      }
      apply_job_assignment: {
        Args: { p_job_id: string; p_worker_id: string; p_kind: string; p_reason?: string | null }
        Returns: undefined
      }
      start_job: { Args: { p_job_id: string }; Returns: undefined }
      block_job: {
        Args: { p_job_id: string; p_reason_type: string; p_note?: string | null }
        Returns: undefined
      }
      unblock_job: {
        Args: { p_job_id: string; p_note?: string | null; p_reverted?: boolean }
        Returns: undefined
      }
      publish_job: {
        Args: { p_job_id: string; p_correction_window_ends_at: string }
        Returns: undefined
      }
      financial_dashboard: {
        Args: { p_space_id: string; p_from: string; p_to: string }
        Returns: {
          forecast_base_cents: number
          forecast_total_cents: number
          collected_cents: number
          pending_cents: number
          overdue_cents: number
          recurring_monthly_base_cents: number
          recurring_monthly_total_cents: number
        }[]
      }
      establishments_with_nonpayment: {
        Args: { p_space_id: string }
        Returns: {
          establishment_id: string
          establishment_name: string
          status: string
          oldest_due_at: string
          outstanding_cents: number
          stage: string
        }[]
      }
      charge_status: { Args: { p_charge_id: string }; Returns: string | null }
      charge_outstanding_cents: { Args: { p_charge_id: string }; Returns: number | null }
      register_payment: {
        Args: {
          p_charge_id: string
          p_amount_cents: number
          p_method: string
          p_paid_at?: string
          p_receipt_file_id?: string | null
          p_note?: string | null
          p_idempotency_key?: string | null
        }
        Returns: string
      }
      create_restavor_space: { Args: never; Returns: string }
      current_space_id: { Args: never; Returns: string }
      establishment_space_id: {
        Args: { p_establishment_id: string }
        Returns: string
      }
      group_space_id: { Args: { p_group_id: string }; Returns: string }
      has_capability: {
        Args: { p_capability: string; p_space_id: string }
        Returns: boolean
      }
      is_establishment_member: {
        Args: { p_establishment_id: string }
        Returns: boolean
      }
      is_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_platform_owner: { Args: never; Returns: boolean }
      is_space_member: { Args: { p_space_id: string }; Returns: boolean }
      next_space_sequence: {
        Args: { p_sequence_name: string; p_space_id: string }
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
