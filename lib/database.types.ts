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
          window_end: string | null
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
          window_end?: string | null
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
          window_end?: string | null
        }
        Relationships: [
          { foreignKeyName: "bookings_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "dispatchable_providers"; referencedColumns: ["id"] },
          { foreignKeyName: "bookings_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "providers"; referencedColumns: ["id"] },
          { foreignKeyName: "bookings_service_id_fkey"; columns: ["service_id"]; isOneToOne: false; referencedRelation: "services"; referencedColumns: ["id"] },
          { foreignKeyName: "bookings_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "available_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "bookings_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "hour_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "bookings_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      booking_photos: {
        Row: {
          id: string
          booking_id: string
          uploaded_by: string
          storage_path: string
          caption: string | null
          created_at: string
        }
        Insert: {
          id?: string
          booking_id: string
          uploaded_by: string
          storage_path: string
          caption?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          booking_id?: string
          uploaded_by?: string
          storage_path?: string
          caption?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "booking_photos_booking_id_fkey"; columns: ["booking_id"]; isOneToOne: false; referencedRelation: "bookings"; referencedColumns: ["id"] },
          { foreignKeyName: "booking_photos_uploaded_by_fkey"; columns: ["uploaded_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
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
        Relationships: [
          { foreignKeyName: "hour_holds_booking_id_fkey"; columns: ["booking_id"]; isOneToOne: false; referencedRelation: "bookings"; referencedColumns: ["id"] },
          { foreignKeyName: "hour_holds_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "available_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "hour_holds_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "hour_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "hour_holds_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
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
        Relationships: [
          { foreignKeyName: "hour_ledger_booking_id_fkey"; columns: ["booking_id"]; isOneToOne: false; referencedRelation: "bookings"; referencedColumns: ["id"] },
          { foreignKeyName: "hour_ledger_subscription_id_fkey"; columns: ["subscription_id"]; isOneToOne: false; referencedRelation: "subscriptions"; referencedColumns: ["id"] },
          { foreignKeyName: "hour_ledger_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "available_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "hour_ledger_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "hour_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "hour_ledger_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
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
        Relationships: [
          { foreignKeyName: "job_offers_booking_id_fkey"; columns: ["booking_id"]; isOneToOne: false; referencedRelation: "bookings"; referencedColumns: ["id"] },
          { foreignKeyName: "job_offers_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "dispatchable_providers"; referencedColumns: ["id"] },
          { foreignKeyName: "job_offers_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "providers"; referencedColumns: ["id"] },
        ]
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
        Relationships: [
          { foreignKeyName: "provider_availability_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "dispatchable_providers"; referencedColumns: ["id"] },
          { foreignKeyName: "provider_availability_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "providers"; referencedColumns: ["id"] },
        ]
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
        Relationships: [
          { foreignKeyName: "provider_blackouts_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "dispatchable_providers"; referencedColumns: ["id"] },
          { foreignKeyName: "provider_blackouts_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "providers"; referencedColumns: ["id"] },
        ]
      }
      provider_earnings: {
        Row: {
          booking_id: string | null
          created_at: string
          gross_cents: number
          id: string
          net_cents: number
          paid_out_at: string | null
          payout_id: string | null
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
          payout_id?: string | null
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
          payout_id?: string | null
          platform_fee_cents?: number
          provider_id?: string
          worked_minutes?: number
        }
        Relationships: [
          { foreignKeyName: "provider_earnings_booking_id_fkey"; columns: ["booking_id"]; isOneToOne: true; referencedRelation: "bookings"; referencedColumns: ["id"] },
          { foreignKeyName: "provider_earnings_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "dispatchable_providers"; referencedColumns: ["id"] },
          { foreignKeyName: "provider_earnings_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "providers"; referencedColumns: ["id"] },
          { foreignKeyName: "provider_earnings_payout_id_fkey"; columns: ["payout_id"]; isOneToOne: false; referencedRelation: "provider_payouts"; referencedColumns: ["id"] },
        ]
      }
      provider_payouts: {
        Row: {
          id: string
          provider_id: string
          amount_cents: number
          stripe_transfer_id: string
          released_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          amount_cents: number
          stripe_transfer_id: string
          released_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          amount_cents?: number
          stripe_transfer_id?: string
          released_by?: string | null
          created_at?: string
        }
        Relationships: [
          { foreignKeyName: "provider_payouts_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "providers"; referencedColumns: ["id"] },
          { foreignKeyName: "provider_payouts_released_by_fkey"; columns: ["released_by"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
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
          background_check_at?: string | null
          base_postal_code?: string | null
          bio?: string | null
          business_name: string
          created_at?: string
          date_of_birth?: string | null
          guardian_consent_at?: string | null
          id?: string
          insurance_expires_at?: string | null
          is_active?: boolean
          is_minor?: boolean
          payouts_enabled?: boolean
          rating?: number | null
          service_areas?: string[]
          service_slugs?: string[]
          stripe_account_id?: string | null
          travel_radius_km?: number
          updated_at?: string
          user_id?: string | null
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          background_check_at?: string | null
          base_postal_code?: string | null
          bio?: string | null
          business_name?: string
          created_at?: string
          date_of_birth?: string | null
          guardian_consent_at?: string | null
          id?: string
          insurance_expires_at?: string | null
          is_active?: boolean
          is_minor?: boolean
          payouts_enabled?: boolean
          rating?: number | null
          service_areas?: string[]
          service_slugs?: string[]
          stripe_account_id?: string | null
          travel_radius_km?: number
          updated_at?: string
          user_id?: string | null
          verification?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: [
          { foreignKeyName: "providers_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "available_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "providers_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "hour_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "providers_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
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
          author_id?: string
          booking_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          provider_id?: string | null
          rating?: number
        }
        Relationships: [
          { foreignKeyName: "reviews_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "available_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "reviews_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "hour_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "reviews_author_id_fkey"; columns: ["author_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
          { foreignKeyName: "reviews_booking_id_fkey"; columns: ["booking_id"]; isOneToOne: false; referencedRelation: "bookings"; referencedColumns: ["id"] },
          { foreignKeyName: "reviews_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "dispatchable_providers"; referencedColumns: ["id"] },
          { foreignKeyName: "reviews_provider_id_fkey"; columns: ["provider_id"]; isOneToOne: false; referencedRelation: "providers"; referencedColumns: ["id"] },
        ]
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
          created_at?: string
          credit_multiplier?: number
          default_duration_minutes?: number
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name: string
          provider_rate_cents_per_hour?: number | null
          requires_licensed_provider?: boolean
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          credit_multiplier?: number
          default_duration_minutes?: number
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          name?: string
          provider_rate_cents_per_hour?: number | null
          requires_licensed_provider?: boolean
          slug?: string
          sort_order?: number
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
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          plan_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_price_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          { foreignKeyName: "subscriptions_plan_id_fkey"; columns: ["plan_id"]; isOneToOne: false; referencedRelation: "plans"; referencedColumns: ["id"] },
          { foreignKeyName: "subscriptions_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "available_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "subscriptions_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "hour_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "subscriptions_user_id_fkey"; columns: ["user_id"]; isOneToOne: false; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
      }
      notifications: {
        Row: {
          id: string
          user_id: string
          kind: string
          title: string
          body: string | null
          booking_id: string | null
          read_at: string | null
          email_pending: boolean
          emailed_at: string | null
          sms_pending: boolean
          sms_sent_at: string | null
          created_at: string
        }
        Insert: {
          user_id: string
          kind: string
          title: string
          body?: string | null
          booking_id?: string | null
          email_pending?: boolean
          sms_pending?: boolean
          sms_sent_at?: string | null
        }
        Update: {
          read_at?: string | null
          email_pending?: boolean
          emailed_at?: string | null
          sms_pending?: boolean
          sms_sent_at?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          value: Json
          description: string | null
          updated_at: string
        }
        Insert: {
          key: string
          value: Json
          description?: string | null
        }
        Update: {
          value?: Json
          description?: string | null
        }
        Relationships: []
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
          created_at?: string | null
          email: string
          id?: string
          message?: string | null
          name: string
          phone?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          message?: string | null
          name?: string
          phone?: string | null
          source?: string | null
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
        Insert: {
          available_minutes?: never
          held_minutes?: never
          settled_minutes?: never
          user_id?: string | null
        }
        Update: {
          available_minutes?: never
          held_minutes?: never
          settled_minutes?: never
          user_id?: string | null
        }
        Relationships: []
      }
      dispatchable_providers: {
        Row: {
          background_check_at: string | null
          base_postal_code: string | null
          bio: string | null
          business_name: string | null
          created_at: string | null
          date_of_birth: string | null
          guardian_consent_at: string | null
          id: string | null
          insurance_expires_at: string | null
          is_active: boolean | null
          is_minor: boolean | null
          payouts_enabled: boolean | null
          rating: number | null
          service_areas: string[] | null
          service_slugs: string[] | null
          stripe_account_id: string | null
          travel_radius_km: number | null
          updated_at: string | null
          user_id: string | null
          verification: Database["public"]["Enums"]["verification_status"] | null
        }
        Insert: {
          background_check_at?: string | null
          base_postal_code?: string | null
          bio?: string | null
          business_name?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          guardian_consent_at?: string | null
          id?: string | null
          insurance_expires_at?: string | null
          is_active?: boolean | null
          is_minor?: boolean | null
          payouts_enabled?: boolean | null
          rating?: number | null
          service_areas?: string[] | null
          service_slugs?: string[] | null
          stripe_account_id?: string | null
          travel_radius_km?: number | null
          updated_at?: string | null
          user_id?: string | null
          verification?: Database["public"]["Enums"]["verification_status"] | null
        }
        Update: {
          background_check_at?: string | null
          base_postal_code?: string | null
          bio?: string | null
          business_name?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          guardian_consent_at?: string | null
          id?: string | null
          insurance_expires_at?: string | null
          is_active?: boolean | null
          is_minor?: boolean | null
          payouts_enabled?: boolean | null
          rating?: number | null
          service_areas?: string[] | null
          service_slugs?: string[] | null
          stripe_account_id?: string | null
          travel_radius_km?: number | null
          updated_at?: string | null
          user_id?: string | null
          verification?: Database["public"]["Enums"]["verification_status"] | null
        }
        Relationships: [
          { foreignKeyName: "providers_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "available_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "providers_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "hour_balances"; referencedColumns: ["user_id"] },
          { foreignKeyName: "providers_user_id_fkey"; columns: ["user_id"]; isOneToOne: true; referencedRelation: "profiles"; referencedColumns: ["id"] },
        ]
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
      admin_assign_booking: {
        Args: { p_booking_id: string; p_provider_id: string; p_force?: boolean }
        Returns: undefined
      }
      admin_cancel_booking: { Args: { p_booking_id: string }; Returns: undefined }
      admin_grant_plan: { Args: { p_user_id: string; p_plan_id: string }; Returns: string }
      admin_redispatch_booking: { Args: { p_booking_id: string }; Returns: number }
      admin_unassign_booking: { Args: { p_booking_id: string }; Returns: undefined }
      admin_set_provider_status: {
        Args: {
          p_is_active: boolean
          p_provider_id: string
          p_verification: Database["public"]["Enums"]["verification_status"]
          p_insurance_expires_at?: string
          p_background_check_at?: string
        }
        Returns: undefined
      }
      cancel_booking: { Args: { p_booking_id: string }; Returns: undefined }
      claim_booking: { Args: { p_booking_id: string }; Returns: undefined }
      complete_booking: { Args: { p_booking_id: string }; Returns: undefined }
      start_booking: { Args: { p_booking_id: string }; Returns: undefined }
      dispatch_booking_offers: { Args: { p_booking_id: string }; Returns: number }
      get_app_secret: { Args: { p_name: string }; Returns: string }
      provider_can_serve_booking: {
        Args: { p_booking_id: string; p_provider_id: string }
        Returns: boolean
      }
      release_booking: { Args: { p_booking_id: string }; Returns: undefined }
      request_booking: {
        Args: {
          p_address_line1: string
          p_city: string
          p_duration_minutes: number
          p_notes: string
          p_postal_code: string
          p_scheduled_start: string
          p_service_id: string
          p_window_end?: string
        }
        Returns: string
      }
      respond_to_offer: {
        Args: { p_offer_id: string; p_accept: boolean }
        Returns: undefined
      }
    }
    Enums: {
      booking_status: "requested" | "confirmed" | "in_progress" | "completed" | "cancelled"
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
      booking_status: ["requested", "confirmed", "in_progress", "completed", "cancelled"],
      hold_status: ["active", "captured", "released"],
      ledger_entry_type: ["grant", "consume", "adjustment", "refund", "expiry"],
      offer_status: ["offered", "accepted", "declined", "expired", "withdrawn"],
      subscription_status: [
        "trialing",
        "active",
        "past_due",
        "canceled",
        "incomplete",
        "incomplete_expired",
        "unpaid",
        "paused",
      ],
      user_role: ["customer", "provider", "admin"],
      verification_status: ["unverified", "pending", "verified", "rejected"],
    },
  },
} as const
