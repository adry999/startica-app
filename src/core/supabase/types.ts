export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          kindergarten_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          kindergarten_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          kindergarten_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_kindergarten_id_fkey"
            columns: ["kindergarten_id"]
            isOneToOne: false
            referencedRelation: "kindergartens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      children: {
        Row: {
          allergies: string | null
          birth_date: string
          blood_group: string | null
          consent: Json
          created_at: string
          created_by: string | null
          deleted_at: string | null
          first_name: string
          group_id: string | null
          id: string
          id_type: Database["public"]["Enums"]["national_id_type"] | null
          kindergarten_id: string
          last_name: string
          medical_notes: string | null
          national_id: string | null
          retention_until: string | null
          status: Database["public"]["Enums"]["child_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          allergies?: string | null
          birth_date: string
          blood_group?: string | null
          consent?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          first_name: string
          group_id?: string | null
          id?: string
          id_type?: Database["public"]["Enums"]["national_id_type"] | null
          kindergarten_id: string
          last_name: string
          medical_notes?: string | null
          national_id?: string | null
          retention_until?: string | null
          status?: Database["public"]["Enums"]["child_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          allergies?: string | null
          birth_date?: string
          blood_group?: string | null
          consent?: Json
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          first_name?: string
          group_id?: string | null
          id?: string
          id_type?: Database["public"]["Enums"]["national_id_type"] | null
          kindergarten_id?: string
          last_name?: string
          medical_notes?: string | null
          national_id?: string | null
          retention_until?: string | null
          status?: Database["public"]["Enums"]["child_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "children_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "children_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "children_kindergarten_id_fkey"
            columns: ["kindergarten_id"]
            isOneToOne: false
            referencedRelation: "kindergartens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "children_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      groups: {
        Row: {
          age_range: string | null
          capacity: number | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          educator_id: string | null
          id: string
          kindergarten_id: string
          name: string
          status: Database["public"]["Enums"]["group_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          age_range?: string | null
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          educator_id?: string | null
          id?: string
          kindergarten_id: string
          name: string
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          age_range?: string | null
          capacity?: number | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          educator_id?: string | null
          id?: string
          kindergarten_id?: string
          name?: string
          status?: Database["public"]["Enums"]["group_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "groups_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_educator_id_fkey"
            columns: ["educator_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_kindergarten_id_fkey"
            columns: ["kindergarten_id"]
            isOneToOne: false
            referencedRelation: "kindergartens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "groups_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      guardians: {
        Row: {
          child_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string
          id: string
          is_primary: boolean
          kindergarten_id: string
          last_name: string
          notes: string | null
          phone: string | null
          relationship: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          child_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name: string
          id?: string
          is_primary?: boolean
          kindergarten_id: string
          last_name: string
          notes?: string | null
          phone?: string | null
          relationship?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_primary?: boolean
          kindergarten_id?: string
          last_name?: string
          notes?: string | null
          phone?: string | null
          relationship?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "guardians_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_kindergarten_id_fkey"
            columns: ["kindergarten_id"]
            isOneToOne: false
            referencedRelation: "kindergartens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guardians_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      kindergartens: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          settings: Json
          status: Database["public"]["Enums"]["kindergarten_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          settings?: Json
          status?: Database["public"]["Enums"]["kindergarten_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          settings?: Json
          status?: Database["public"]["Enums"]["kindergarten_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "kindergartens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kindergartens_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      parents: {
        Row: {
          child_id: string
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          full_name: string
          id: string
          kindergarten_id: string
          phone: string | null
          relationship: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          child_id: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name: string
          id?: string
          kindergarten_id: string
          phone?: string | null
          relationship?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          child_id?: string
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          full_name?: string
          id?: string
          kindergarten_id?: string
          phone?: string | null
          relationship?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "parents_child_id_fkey"
            columns: ["child_id"]
            isOneToOne: false
            referencedRelation: "children"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_kindergarten_id_fkey"
            columns: ["kindergarten_id"]
            isOneToOne: false
            referencedRelation: "kindergartens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "parents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_kindergartens: {
        Row: {
          created_at: string
          created_by: string | null
          kindergarten_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          kindergarten_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          kindergarten_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_kindergartens_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_kindergartens_kindergarten_id_fkey"
            columns: ["kindergarten_id"]
            isOneToOne: false
            referencedRelation: "kindergartens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_kindergartens_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      user_modules: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          granted_at: string
          granted_by: string
          id: string
          kindergarten_id: string
          module_key: string
          updated_at: string
          updated_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          granted_at?: string
          granted_by: string
          id?: string
          kindergarten_id: string
          module_key: string
          updated_at?: string
          updated_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          granted_at?: string
          granted_by?: string
          id?: string
          kindergarten_id?: string
          module_key?: string
          updated_at?: string
          updated_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_modules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_modules_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_modules_kindergarten_id_fkey"
            columns: ["kindergarten_id"]
            isOneToOne: false
            referencedRelation: "kindergartens"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_modules_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_modules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["user_role"]
          status: Database["public"]["Enums"]["user_status"]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email: string
          full_name: string
          id: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string
          full_name?: string
          id?: string
          role?: Database["public"]["Enums"]["user_role"]
          status?: Database["public"]["Enums"]["user_status"]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "users_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "users_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_super_admin: { Args: never; Returns: boolean }
      user_kindergarten_ids: { Args: never; Returns: string[] }
    }
    Enums: {
      child_status: "enrolled" | "withdrawn" | "graduated"
      group_status: "active" | "archived"
      kindergarten_status: "active" | "suspended"
      national_id_type: "CNP" | "IDNP"
      user_role: "super_admin" | "admin" | "educator" | "parent" | "child"
      user_status: "active" | "inactive"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      child_status: ["enrolled", "withdrawn", "graduated"],
      group_status: ["active", "archived"],
      kindergarten_status: ["active", "suspended"],
      national_id_type: ["CNP", "IDNP"],
      user_role: ["super_admin", "admin", "educator", "parent", "child"],
      user_status: ["active", "inactive"],
    },
  },
} as const

