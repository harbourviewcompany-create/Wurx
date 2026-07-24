export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      bookings: {
        Row: {
          address_line1: string | null
          city: string | null
          created_at: string
          duration_minutes: number
          id: string
          notes: string | null
          postal_code: string | null
          provider_id: string | null
          scheduled_start: string
          service_id: string
          status: Database["public"]["Enums"]["booking_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          address_line1?: string | null
          city?: string | null
          created_at?: string
          duration_minutes: number
          id?: string
          notes?: string | null
          postal_code?: string | null
          provider_id?: string | null
          scheduled_start: string
          service_id: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          address_line1?: string | null
          city?: string | null
          created_at?: string
          duration_minutes?: number
          id?: string
          notes?: string | null
          postal_code?: string | null
          provider_id?: string | null
          scheduled_start?: string
          service_id?: string
          status?: Database["public"]["Enums"]["booking_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bookings_service_id_fkey"
            columns: ["service_id"]
            isOneToOne: false
            referencedRelation: "services"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bookings_provider_id_fkey"
            columns: ["provider_id"]
            isOneToOne: false
            referencedRelation: "providers"
            referencedColumns: ["id"]
          },
        ]
      }
      hour_holds: {
        Row: {
          booking_id: string
          created_at: string
          hold_minutes: number
          id: string
          settled_at: string | null
          status: Database["public"]["Enums"]["hold_status"]
          user_id: string
        }
        Insert: {
          booking_id: string
          created_at?: string
          hold_minutes: number
          id?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["hold_status"]
          user_id: string
        }
        Update: {
          booking_id?: string
          created_at?: string
          hold_minutes?: number
          id?: string
          settled_at?: string | null
          status?: Database["public"]["Enums"]["hold_status"]
          user_id?: string
        }
        Relationships: []
      }
      hour_ledger: {
        Row: {
          booking_id: string | null
          created_at: string
          delta_minutes: number
          description: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id: string
          stripe_event_id: string | null
          subscription_id: string | null
          user_id: string
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          delta_minutes: number
          description?: string | null
          entry_type: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          stripe_event_id?: string | null
          subscription_id?: string | null
          user_id: string
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          delta_minutes?: number
          description?: string | null
          entry_type?: Database["public"]["Enums"]["ledger_entry_type"]
          id?: string
          stripe_event_id?: string | null
          subscription_id?: string | null
          user_id?: string
        }
        Relationships: []
      }
      job_offers: {
        Row: {
          booking_id: string
          expires_at: string
          id: string
          offered_at: string
          provider_id: string
          responded_at: string | null
          status: Database["public"]["Enums"]["offer_status"]
        }
        Insert: {
          booking_id: string
          expires_at?: string
          id?: string
          offered_at?: string
          provider_id: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Update: {
          booking_id?: string
          expires_at?: string
          id?: string
          offered_at?: string
          provider_id?: string
          responded_at?: string | null
          status?: Database["public"]["Enums"]["offer_status"]
        }
        Relationships: []
      }
      plans: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          monthly_minutes: number
          name: string
          price_cents: number
          slug: string
          sort_order: number
          stripe_price_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_minutes: number
          name: string
          price_cents: number
          slug: string
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          monthly_minutes?: number
          name?: string
          price_cents?: number
          slug?: string
          sort_order?: number
          stripe_price_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          address_line1: string | null
          city: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          phone: string | null
          postal_code: string | null
          province: string | null
          role: Database["public"]["Enums"]["user_role"]
          stripe_customer_id: string | null
          updated_at: string
        }
        Insert: {
          address_line1?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Update: {
          address_line1?: string | null
          city?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          phone?: string | null
          postal_code?: string | null
          province?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          stripe_customer_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      provider_availability: {
        Row: {
          created_at: string
          day_of_week: number
          end_minute: number
          id: string
          provider_id: string
          start_minute: number
        }
        Insert: {
          created_at?: string
          day_of_week: number
          end_minute: number
          id?: string
          provider_id: string
          start_minute: number
        }
        Update: {
          created_at?: string
          day_of_week?: number
          end_minute?: number
          id?: string
          provider_id?: string
          start_minute?: number
        }
        Relationships: []
      }
      provider_blackouts: {
        Row: {
          ends_at: string
          id: string
          provider_id: string
          reason: string | null
          starts_at: string
        }
        Insert: {
          ends_at: string
          id?: string
          provider_id: string
          reason?: string | null
          starts_at: string
        }
        Update: {
          ends_at?: string
          id?: string
          provider_id?: string
          reason?: string | null
          starts_at?: string
        }
        Relationships: []
      }
      provider_earnings: {
        Row: {
          booking_id: string | null
          created_at: string
          gross_cents: number
          id: string
          net_cents: number
          paid_out_at: string | null
          platform_fee_cents: number
          provider_id: string
          worked_minutes: number
        }
        Insert: {
          booking_id?: string | null
          created_at?: string
          gross_cents: number
          id?: string
          net_cents: number
          paid_out_at?: string | null
          platform_fee_cents?: number
          provider_id: string
          worked_minutes: number
        }
        Update: {
          booking_id?: string | null
          created_at?: string
          gross_cents?: number
          id?: string
          net_cents?: number
          paid_out_at?: string | null
          platform_fee_cents?: number
          provider_id?: string
          worked_minutes?: number
        }
        Relationships: []
      }
      providers: {
        Row: {
          background_check_at: string | null
          base_postal_code: string | null
          bio: string | null
          business_name: string
          created_at: string
          date_of_birth: string | null
          guardian_consent_at: string | null
          id: string
          insurance_expires_at: string | null
          is_active: boolean
          is_minor: boolean
          payouts_enabled: boolean
          rating: number | null
          service_areas: string[]
          service_slugs: string[]
          stripe_account_id: string | null
          travel_radius_km: number
          updated_at: string
          user_id: string | null
          verification: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          business_name: string
          user_id?: string | null
        }
        Update: {
          bio?: string | null
          business_name?: string
          is_active?: boolean
          service_areas?: string[]
          service_slugs?: string[]
        }
        Relationships: []
      }
      reviews: {
        Row: {
          author_id: string
          booking_id: string
          comment: string | null
          created_at: string
          id: string
          provider_id: string | null
          rating: number
        }
        Insert: {
          author_id: string
          booking_id: string
          comment?: string | null
          created_at?: string
          id?: string
          provider_id?: string | null
          rating: number
        }
        Update: {
          comment?: string | null
          rating?: number
        }
        Relationships: []
      }
      services: {
        Row: {
          created_at: string
          credit_multiplier: number
          default_duration_minutes: number
          description: string | null
          icon: string | null
          id: string
          is_active: boolean
          name: string
          provider_rate_cents_per_hour: number | null
          requires_licensed_provider: boolean
          slug: string
          sort_order: number
        }
        Insert: {
          name: string
          slug: string
        }
        Update: {
          is_active?: boolean
          name?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          plan_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_price_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          user_id: string
        }
        Update: {
          status?: Database["public"]["Enums"]["subscription_status"]
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      wurx_ottawa_leads: {
        Row: {
          created_at: string | null
          email: string
          id: string
          message: string | null
          name: string
          phone: string | null
          source: string | null
        }
        Insert: {
          email: string
          message?: string | null
          name: string
          phone?: string | null
          source?: string | null
        }
        Update: {
          email?: string
          name?: string
        }
        Relationships: []
      }
    }
    Views: {
      available_balances: {
        Row: {
          available_minutes: number | null
          held_minutes: number | null
          settled_minutes: number | null
          user_id: string | null
        }
        Relationships: []
      }
      dispatchable_providers: {
        Row: {
          base_postal_code: string | null
          business_name: string | null
          id: string | null
          rating: number | null
          service_areas: string[] | null
          service_slugs: string[] | null
          travel_radius_km: number | null
          user_id: string | null
          verification:
            | Database["public"]["Enums"]["verification_status"]
            | null
        }
        Relationships: []
      }
      hour_balances: {
        Row: {
          balance_hours: number | null
          balance_minutes: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      request_booking: {
        Args: {
          p_service_id: string
          p_scheduled_start: string
          p_duration_minutes: number
          p_address_line1: string
          p_city: string
          p_postal_code: string
          p_notes: string
        }
        Returns: string
      }
      cancel_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
      complete_booking: {
        Args: { p_booking_id: string }
        Returns: undefined
      }
    }
    Enums: {
      booking_status:
        | "requested"
        | "confirmed"
        | "in_progress"
        | "completed"
        | "cancelled"
      hold_status: "active" | "captured" | "released"
      ledger_entry_type: "grant" | "consume" | "adjustment" | "refund" | "expiry"
      offer_status: "offered" | "accepted" | "declined" | "expired" | "withdrawn"
      subscription_status:
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete"
        | "incomplete_expired"
        | "unpaid"
        | "paused"
      user_role: "customer" | "provider" | "admin"
      verification_status: "unverified" | "pending" | "verified" | "rejected"
    }
    CompositeTypes: Record<string, never>
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"]
export type Views<T extends keyof PublicSchema["Views"]> =
  PublicSchema["Views"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T]
