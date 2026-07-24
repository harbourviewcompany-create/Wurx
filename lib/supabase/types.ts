export type UserRole = 'customer' | 'provider' | 'admin';
export type JobStatus = 'pending' | 'matched' | 'in_progress' | 'completed' | 'cancelled';
export type ServiceType = 'cleaning' | 'snow_removal' | 'landscaping' | 'handyman';
export type LedgerEntryType = 'credit' | 'debit' | 'refund' | 'adjustment';
export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'incomplete';

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: UserRole;
  stripe_customer_id: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string;
}

export type ProviderProfile = {
  id: string;
  skills: ServiceType[];
  hourly_rate: number;
  rating: number;
  rating_count: number;
  service_radius_km: number;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export type Subscription = {
  id: string;
  user_id: string;
  stripe_subscription_id: string | null;
  plan_name: string;
  hours_included: number;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  updated_at: string;
}

export type HourLedgerEntry = {
  id: string;
  user_id: string;
  job_id: string | null;
  subscription_id: string | null;
  amount: number;
  type: LedgerEntryType;
  description: string | null;
  created_at: string;
}

export type Job = {
  id: string;
  customer_id: string;
  provider_id: string | null;
  service_type: ServiceType;
  title: string;
  description: string | null;
  status: JobStatus;
  hours_required: number;
  address: string | null;
  lat: number | null;
  lng: number | null;
  scheduled_at: string | null;
  matched_at: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  created_at: string;
  updated_at: string;
}

// Minimal Database shape so `createClient<Database>()` gives typed
// `.from('table')` calls without requiring the full Supabase CLI codegen.
export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: Profile;
        Insert: Partial<Profile>;
        Update: Partial<Profile>;
        Relationships: [];
      };
      provider_profiles: {
        Row: ProviderProfile;
        Insert: Partial<ProviderProfile>;
        Update: Partial<ProviderProfile>;
        Relationships: [
          {
            foreignKeyName: 'provider_profiles_id_fkey';
            columns: ['id'];
            isOneToOne: true;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      subscriptions: {
        Row: Subscription;
        Insert: Partial<Subscription>;
        Update: Partial<Subscription>;
        Relationships: [];
      };
      hour_ledger: {
        Row: HourLedgerEntry;
        Insert: Partial<HourLedgerEntry>;
        Update: Partial<HourLedgerEntry>;
        Relationships: [];
      };
      jobs: {
        Row: Job;
        Insert: Partial<Job>;
        Update: Partial<Job>;
        Relationships: [];
      };
    };
    Views: {
      hour_balances: {
        Row: { user_id: string; balance: number };
        Relationships: [];
      };
    };
    Functions: {
      complete_job: { Args: { p_job_id: string }; Returns: Job };
    };
    Enums: {
      user_role: UserRole;
      job_status: JobStatus;
      service_type: ServiceType;
      ledger_entry_type: LedgerEntryType;
      subscription_status: SubscriptionStatus;
    };
    CompositeTypes: Record<string, never>;
  };
}
