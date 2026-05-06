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
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      cities: {
        Row: {
          created_at: string
          id: number
          name: string
        }
        Insert: {
          created_at?: string
          id?: number
          name: string
        }
        Update: {
          created_at?: string
          id?: number
          name?: string
        }
        Relationships: []
      }
      hub_cities: {
        Row: {
          city_name: string
          hub_id: number
          id: number
        }
        Insert: {
          city_name: string
          hub_id: number
          id?: number
        }
        Update: {
          city_name?: string
          hub_id?: number
          id?: number
        }
        Relationships: [
          {
            foreignKeyName: "hub_cities_city_name_fkey"
            columns: ["city_name"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "hub_cities_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
        ]
      }
      hub_livreur: {
        Row: {
          created_at: string
          hub_id: number
          id: number
          livreur_id: string
        }
        Insert: {
          created_at?: string
          hub_id: number
          id?: number
          livreur_id: string
        }
        Update: {
          created_at?: string
          hub_id?: number
          id?: number
          livreur_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hub_livreur_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: true
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hub_livreur_livreur_id_fkey"
            columns: ["livreur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hubs: {
        Row: {
          created_at: string
          description: string | null
          id: number
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: number
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: number
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      invoice_items: {
        Row: {
          fee_amount: number
          fee_type: string | null
          id: number
          invoice_id: number
          order_id: number | null
          order_value: number
        }
        Insert: {
          fee_amount?: number
          fee_type?: string | null
          id?: number
          invoice_id: number
          order_id?: number | null
          order_value?: number
        }
        Update: {
          fee_amount?: number
          fee_type?: string | null
          id?: number
          invoice_id?: number
          order_id?: number | null
          order_value?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          delivery_fees: number
          id: number
          net_amount: number
          packaging_fees: number
          paid_at: string | null
          period_end: string
          period_start: string
          status: string
          total_annule_fees: number
          total_delivered_amount: number
          total_refused_fees: number
          vendeur_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delivery_fees?: number
          id?: number
          net_amount?: number
          packaging_fees?: number
          paid_at?: string | null
          period_end: string
          period_start: string
          status?: string
          total_annule_fees?: number
          total_delivered_amount?: number
          total_refused_fees?: number
          vendeur_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delivery_fees?: number
          id?: number
          net_amount?: number
          packaging_fees?: number
          paid_at?: string | null
          period_end?: string
          period_start?: string
          status?: string
          total_annule_fees?: number
          total_delivered_amount?: number
          total_refused_fees?: number
          vendeur_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_vendeur_id_fkey"
            columns: ["vendeur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      livreur_api_logs: {
        Row: {
          created_at: string
          details: Json
          event_type: string
          id: number
          livreur_id: string | null
          message: string | null
          order_id: number | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: Json
          event_type: string
          id?: number
          livreur_id?: string | null
          message?: string | null
          order_id?: number | null
          status: string
        }
        Update: {
          created_at?: string
          details?: Json
          event_type?: string
          id?: number
          livreur_id?: string | null
          message?: string | null
          order_id?: number | null
          status?: string
        }
        Relationships: []
      }
      livreur_api_settings: {
        Row: {
          api_operations: Json
          auth_config: Json
          create_package_headers: Json
          create_package_mapping: Json
          create_package_method: string
          create_package_url: string | null
          created_at: string
          is_active: boolean
          livreur_id: string
          polling_actor_field: string
          polling_driver_name_field: string
          polling_driver_phone_field: string
          polling_enabled: boolean
          polling_extra_fields_mapping: Json
          polling_interval_minutes: number
          polling_last_run_at: string | null
          polling_message_field: string
          polling_order_fields_mapping: Json
          polling_reported_date_field: string
          polling_scheduled_date_field: string
          polling_status_field: string
          polling_status_headers: Json
          polling_status_mapping: Json
          polling_status_method: string
          polling_status_payload_mapping: Json
          polling_status_url: string | null
          polling_tracking_field: string
          rate_limit_per_second: number
          status_mapping: Json
          updated_at: string
          validation_rules: Json
          webhook_actor_field: string
          webhook_driver_name_field: string
          webhook_driver_phone_field: string
          webhook_enabled: boolean
          webhook_extra_fields_mapping: Json
          webhook_note_field: string
          webhook_order_fields_mapping: Json
          webhook_reported_date_field: string
          webhook_scheduled_date_field: string
          webhook_status_field: string
          webhook_tracking_field: string
          webhook_updates_current_status: boolean
        }
        Insert: {
          api_operations?: Json
          auth_config?: Json
          create_package_headers?: Json
          create_package_mapping?: Json
          create_package_method?: string
          create_package_url?: string | null
          created_at?: string
          is_active?: boolean
          livreur_id: string
          polling_actor_field?: string
          polling_driver_name_field?: string
          polling_driver_phone_field?: string
          polling_enabled?: boolean
          polling_extra_fields_mapping?: Json
          polling_interval_minutes?: number
          polling_last_run_at?: string | null
          polling_message_field?: string
          polling_order_fields_mapping?: Json
          polling_reported_date_field?: string
          polling_scheduled_date_field?: string
          polling_status_field?: string
          polling_status_headers?: Json
          polling_status_mapping?: Json
          polling_status_method?: string
          polling_status_payload_mapping?: Json
          polling_status_url?: string | null
          polling_tracking_field?: string
          rate_limit_per_second?: number
          status_mapping?: Json
          updated_at?: string
          validation_rules?: Json
          webhook_actor_field?: string
          webhook_driver_name_field?: string
          webhook_driver_phone_field?: string
          webhook_enabled?: boolean
          webhook_extra_fields_mapping?: Json
          webhook_note_field?: string
          webhook_order_fields_mapping?: Json
          webhook_reported_date_field?: string
          webhook_scheduled_date_field?: string
          webhook_status_field?: string
          webhook_tracking_field?: string
          webhook_updates_current_status?: boolean
        }
        Update: {
          api_operations?: Json
          auth_config?: Json
          create_package_headers?: Json
          create_package_mapping?: Json
          create_package_method?: string
          create_package_url?: string | null
          created_at?: string
          is_active?: boolean
          livreur_id?: string
          polling_actor_field?: string
          polling_driver_name_field?: string
          polling_driver_phone_field?: string
          polling_enabled?: boolean
          polling_extra_fields_mapping?: Json
          polling_interval_minutes?: number
          polling_last_run_at?: string | null
          polling_message_field?: string
          polling_order_fields_mapping?: Json
          polling_reported_date_field?: string
          polling_scheduled_date_field?: string
          polling_status_field?: string
          polling_status_headers?: Json
          polling_status_mapping?: Json
          polling_status_method?: string
          polling_status_payload_mapping?: Json
          polling_status_url?: string | null
          polling_tracking_field?: string
          rate_limit_per_second?: number
          status_mapping?: Json
          updated_at?: string
          validation_rules?: Json
          webhook_actor_field?: string
          webhook_driver_name_field?: string
          webhook_driver_phone_field?: string
          webhook_enabled?: boolean
          webhook_extra_fields_mapping?: Json
          webhook_note_field?: string
          webhook_order_fields_mapping?: Json
          webhook_reported_date_field?: string
          webhook_scheduled_date_field?: string
          webhook_status_field?: string
          webhook_tracking_field?: string
          webhook_updates_current_status?: boolean
        }
        Relationships: []
      }
      livreur_scheduled_runs: {
        Row: {
          created_at: string
          id: string
          last_message: string | null
          last_run_at: string | null
          last_status: string | null
          livreur_id: string
          next_run_at: string | null
          operation_key: string
          trigger: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          livreur_id: string
          next_run_at?: string | null
          operation_key: string
          trigger: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          livreur_id?: string
          next_run_at?: string | null
          operation_key?: string
          trigger?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "livreur_scheduled_runs_livreur_id_fkey"
            columns: ["livreur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      livreur_workflow_runs: {
        Row: {
          duration_ms: number | null
          error_message: string | null
          finished_at: string | null
          id: string
          is_test: boolean
          livreur_id: string
          order_id: number | null
          output: Json | null
          started_at: string
          status: string
          step_results: Json
          trigger_payload: Json | null
          trigger_type: string
          workflow_id: string
        }
        Insert: {
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          is_test?: boolean
          livreur_id: string
          order_id?: number | null
          output?: Json | null
          started_at?: string
          status: string
          step_results?: Json
          trigger_payload?: Json | null
          trigger_type: string
          workflow_id: string
        }
        Update: {
          duration_ms?: number | null
          error_message?: string | null
          finished_at?: string | null
          id?: string
          is_test?: boolean
          livreur_id?: string
          order_id?: number | null
          output?: Json | null
          started_at?: string
          status?: string
          step_results?: Json
          trigger_payload?: Json | null
          trigger_type?: string
          workflow_id?: string
        }
        Relationships: []
      }
      livreur_workflow_schedules: {
        Row: {
          id: string
          last_message: string | null
          last_run_at: string | null
          last_status: string | null
          next_run_at: string | null
          trigger_key: string
          updated_at: string
          workflow_id: string
        }
        Insert: {
          id?: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string | null
          trigger_key: string
          updated_at?: string
          workflow_id: string
        }
        Update: {
          id?: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          next_run_at?: string | null
          trigger_key?: string
          updated_at?: string
          workflow_id?: string
        }
        Relationships: []
      }
      livreur_workflows: {
        Row: {
          created_at: string
          description: string | null
          enabled: boolean
          id: string
          is_default: boolean
          livreur_id: string
          name: string
          settings: Json
          steps: Json
          triggers: Json
          updated_at: string
          variables: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          is_default?: boolean
          livreur_id: string
          name: string
          settings?: Json
          steps?: Json
          triggers?: Json
          updated_at?: string
          variables?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          enabled?: boolean
          id?: string
          is_default?: boolean
          livreur_id?: string
          name?: string
          settings?: Json
          steps?: Json
          triggers?: Json
          updated_at?: string
          variables?: Json
        }
        Relationships: []
      }
      order_status_history: {
        Row: {
          actor_label: string | null
          changed_at: string
          changed_by: string | null
          id: number
          new_status: string
          notes: string | null
          old_status: string | null
          order_id: number
          provider_note: string | null
          reported_date: string | null
          scheduled_date: string | null
        }
        Insert: {
          actor_label?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: number
          new_status: string
          notes?: string | null
          old_status?: string | null
          order_id: number
          provider_note?: string | null
          reported_date?: string | null
          scheduled_date?: string | null
        }
        Update: {
          actor_label?: string | null
          changed_at?: string
          changed_by?: string | null
          id?: number
          new_status?: string
          notes?: string | null
          old_status?: string | null
          order_id?: number
          provider_note?: string | null
          reported_date?: string | null
          scheduled_date?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_status_history_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          agent_id: string | null
          api_sync_error: string | null
          api_sync_status: string | null
          assigned_livreur_id: string | null
          barcode: string | null
          comment: string | null
          created_at: string
          customer_address: string
          customer_city: string
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          driver_name: string | null
          driver_phone: string | null
          external_tracking_number: string | null
          hub_id: number | null
          id: number
          open_package: boolean
          order_value: number
          postponed_date: string | null
          product_name: string
          qr_code: string | null
          return_note: string | null
          scheduled_date: string | null
          status: string
          status_note: string | null
          tracking_number: string | null
          updated_at: string
          vendeur_id: string
        }
        Insert: {
          agent_id?: string | null
          api_sync_error?: string | null
          api_sync_status?: string | null
          assigned_livreur_id?: string | null
          barcode?: string | null
          comment?: string | null
          created_at?: string
          customer_address: string
          customer_city: string
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          external_tracking_number?: string | null
          hub_id?: number | null
          id?: number
          open_package?: boolean
          order_value?: number
          postponed_date?: string | null
          product_name: string
          qr_code?: string | null
          return_note?: string | null
          scheduled_date?: string | null
          status?: string
          status_note?: string | null
          tracking_number?: string | null
          updated_at?: string
          vendeur_id: string
        }
        Update: {
          agent_id?: string | null
          api_sync_error?: string | null
          api_sync_status?: string | null
          assigned_livreur_id?: string | null
          barcode?: string | null
          comment?: string | null
          created_at?: string
          customer_address?: string
          customer_city?: string
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          driver_name?: string | null
          driver_phone?: string | null
          external_tracking_number?: string | null
          hub_id?: number | null
          id?: number
          open_package?: boolean
          order_value?: number
          postponed_date?: string | null
          product_name?: string
          qr_code?: string | null
          return_note?: string | null
          scheduled_date?: string | null
          status?: string
          status_note?: string | null
          tracking_number?: string | null
          updated_at?: string
          vendeur_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_assigned_livreur_id_fkey"
            columns: ["assigned_livreur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_hub_id_fkey"
            columns: ["hub_id"]
            isOneToOne: false
            referencedRelation: "hubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_vendeur_id_fkey"
            columns: ["vendeur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      plain_passwords: {
        Row: {
          password: string
          updated_at: string
          user_id: string
        }
        Insert: {
          password: string
          updated_at?: string
          user_id: string
        }
        Update: {
          password?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      pricing_rules: {
        Row: {
          annulation_fee: number
          city: string
          created_at: string
          delivery_fee: number
          id: number
          refusal_fee: number
          updated_at: string
          vendeur_id: string | null
        }
        Insert: {
          annulation_fee?: number
          city: string
          created_at?: string
          delivery_fee?: number
          id?: number
          refusal_fee?: number
          updated_at?: string
          vendeur_id?: string | null
        }
        Update: {
          annulation_fee?: number
          city?: string
          created_at?: string
          delivery_fee?: number
          id?: number
          refusal_fee?: number
          updated_at?: string
          vendeur_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_rules_city_fkey"
            columns: ["city"]
            isOneToOne: false
            referencedRelation: "cities"
            referencedColumns: ["name"]
          },
          {
            foreignKeyName: "pricing_rules_vendeur_id_fkey"
            columns: ["vendeur_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          affiliation_code: string | null
          agent_of: string | null
          agent_pages: Json | null
          api_enabled: boolean
          api_token: string | null
          authentication_config: Json | null
          bank_account_name: string | null
          bank_account_number: string | null
          cin: string | null
          city: string | null
          company_name: string | null
          create_package_config: Json | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: string
          updated_at: string
          username: string
        }
        Insert: {
          affiliation_code?: string | null
          agent_of?: string | null
          agent_pages?: Json | null
          api_enabled?: boolean
          api_token?: string | null
          authentication_config?: Json | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          cin?: string | null
          city?: string | null
          company_name?: string | null
          create_package_config?: Json | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          role?: string
          updated_at?: string
          username: string
        }
        Update: {
          affiliation_code?: string | null
          agent_of?: string | null
          agent_pages?: Json | null
          api_enabled?: boolean
          api_token?: string | null
          authentication_config?: Json | null
          bank_account_name?: string | null
          bank_account_number?: string | null
          cin?: string | null
          city?: string | null
          company_name?: string | null
          create_package_config?: Json | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_agent_of_fkey"
            columns: ["agent_of"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_user_email_by_username: {
        Args: { _username: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role:
        | "superviseur"
        | "administrateur"
        | "vendeur"
        | "agent"
        | "ramassoire"
        | "magasinier"
        | "support"
        | "suivi"
        | "comptable"
        | "livreur"
        | "commercial"
        | "gestion_retour"
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
      app_role: [
        "superviseur",
        "administrateur",
        "vendeur",
        "agent",
        "ramassoire",
        "magasinier",
        "support",
        "suivi",
        "comptable",
        "livreur",
        "commercial",
        "gestion_retour",
      ],
    },
  },
} as const
