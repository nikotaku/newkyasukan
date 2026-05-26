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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      advertising_costs: {
        Row: {
          clicks: number
          conversions: number
          cost: number
          created_at: string
          date: string
          id: string
          impressions: number
          platform: string
          updated_at: string
        }
        Insert: {
          clicks?: number
          conversions?: number
          cost?: number
          created_at?: string
          date: string
          id?: string
          impressions?: number
          platform?: string
          updated_at?: string
        }
        Update: {
          clicks?: number
          conversions?: number
          cost?: number
          created_at?: string
          date?: string
          id?: string
          impressions?: number
          platform?: string
          updated_at?: string
        }
        Relationships: []
      }
      allowances: {
        Row: {
          allowance_type: string
          amount: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          allowance_type?: string
          amount?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          allowance_type?: string
          amount?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      back_rates: {
        Row: {
          course_type: string
          created_at: string
          customer_price: number
          duration: number
          id: string
          shop_back: number
          therapist_back: number
          updated_at: string
        }
        Insert: {
          course_type: string
          created_at?: string
          customer_price: number
          duration: number
          id?: string
          shop_back: number
          therapist_back: number
          updated_at?: string
        }
        Update: {
          course_type?: string
          created_at?: string
          customer_price?: number
          duration?: number
          id?: string
          shop_back?: number
          therapist_back?: number
          updated_at?: string
        }
        Relationships: []
      }
      banners: {
        Row: {
          created_at: string
          display_order: number
          id: string
          image_url: string
          is_active: boolean
          link_url: string | null
          title: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_order?: number
          id?: string
          image_url: string
          is_active?: boolean
          link_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_order?: number
          id?: string
          image_url?: string
          is_active?: boolean
          link_url?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      board_posts: {
        Row: {
          author_id: string | null
          author_name: string
          content: string
          created_at: string
          id: string
          is_pinned: boolean
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          author_name: string
          content: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          author_name?: string
          content?: string
          created_at?: string
          id?: string
          is_pinned?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      card_sales: {
        Row: {
          amount: number
          card_type: string
          created_at: string
          date: string
          id: string
          transaction_count: number
          updated_at: string
        }
        Insert: {
          amount?: number
          card_type?: string
          created_at?: string
          date: string
          id?: string
          transaction_count?: number
          updated_at?: string
        }
        Update: {
          amount?: number
          card_type?: string
          created_at?: string
          date?: string
          id?: string
          transaction_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      cast_access_tokens: {
        Row: {
          access_token: string
          cast_id: string
          created_at: string
          updated_at: string
        }
        Insert: {
          access_token: string
          cast_id: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          access_token?: string
          cast_id?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cast_access_tokens_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: true
            referencedRelation: "casts"
            referencedColumns: ["id"]
          },
        ]
      }
      cast_messages: {
        Row: {
          cast_id: string
          created_at: string
          id: string
          message: string
          sender_name: string
        }
        Insert: {
          cast_id: string
          created_at?: string
          id?: string
          message: string
          sender_name?: string
        }
        Update: {
          cast_id?: string
          created_at?: string
          id?: string
          message?: string
          sender_name?: string
        }
        Relationships: []
      }
      cast_posts: {
        Row: {
          body: string
          cast_id: string
          created_at: string
          esutama_error: string | null
          esutama_status: string
          id: string
          image_urls: string[] | null
          o2_error: string | null
          o2_status: string
          posted_at: string | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          body: string
          cast_id: string
          created_at?: string
          esutama_error?: string | null
          esutama_status?: string
          id?: string
          image_urls?: string[] | null
          o2_error?: string | null
          o2_status?: string
          posted_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          body?: string
          cast_id?: string
          created_at?: string
          esutama_error?: string | null
          esutama_status?: string
          id?: string
          image_urls?: string[] | null
          o2_error?: string | null
          o2_status?: string
          posted_at?: string | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cast_posts_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "casts"
            referencedColumns: ["id"]
          },
        ]
      }
      cast_site_credentials: {
        Row: {
          cast_id: string
          created_at: string
          id: string
          login_id: string
          password: string
          site: string
          updated_at: string
        }
        Insert: {
          cast_id: string
          created_at?: string
          id?: string
          login_id: string
          password: string
          site: string
          updated_at?: string
        }
        Update: {
          cast_id?: string
          created_at?: string
          id?: string
          login_id?: string
          password?: string
          site?: string
          updated_at?: string
        }
        Relationships: []
      }
      casts: {
        Row: {
          age: number | null
          blood_type: string | null
          body_type: string | null
          bust: number | null
          celebrity_lookalike: string | null
          created_at: string
          cup_size: string | null
          day_off_activities: string | null
          dispatch_status: string | null
          display_order: number
          execution_date_end: string | null
          execution_date_start: string | null
          experience_years: number | null
          favorite_food: string | null
          favorite_techniques: string | null
          files: string[] | null
          follow_list: string | null
          format_type: string | null
          height: number | null
          hip: number | null
          hobbies: string | null
          hp_notice: string | null
          id: string
          ideal_partner: string | null
          ideal_type: string | null
          instagram_url: string | null
          is_active: boolean
          is_visible: boolean
          join_date: string
          line_url: string | null
          litlink_url: string | null
          marks: string[] | null
          media_registration: string[] | null
          memo: string | null
          message: string | null
          name: string
          photo: string | null
          photos: string[] | null
          profile: string | null
          recent_dispatch_details: string | null
          registration_sheet: string | null
          repeat_scheduled: boolean | null
          room: string | null
          specialties: string | null
          status: string
          tags: string[] | null
          therapist_years: number | null
          tiktok_url: string | null
          type: string
          updated_at: string
          upload_check: string | null
          waist: number | null
          x_account: string | null
          x_url: string | null
        }
        Insert: {
          age?: number | null
          blood_type?: string | null
          body_type?: string | null
          bust?: number | null
          celebrity_lookalike?: string | null
          created_at?: string
          cup_size?: string | null
          day_off_activities?: string | null
          dispatch_status?: string | null
          display_order?: number
          execution_date_end?: string | null
          execution_date_start?: string | null
          experience_years?: number | null
          favorite_food?: string | null
          favorite_techniques?: string | null
          files?: string[] | null
          follow_list?: string | null
          format_type?: string | null
          height?: number | null
          hip?: number | null
          hobbies?: string | null
          hp_notice?: string | null
          id?: string
          ideal_partner?: string | null
          ideal_type?: string | null
          instagram_url?: string | null
          is_active?: boolean
          is_visible?: boolean
          join_date?: string
          line_url?: string | null
          litlink_url?: string | null
          marks?: string[] | null
          media_registration?: string[] | null
          memo?: string | null
          message?: string | null
          name: string
          photo?: string | null
          photos?: string[] | null
          profile?: string | null
          recent_dispatch_details?: string | null
          registration_sheet?: string | null
          repeat_scheduled?: boolean | null
          room?: string | null
          specialties?: string | null
          status?: string
          tags?: string[] | null
          therapist_years?: number | null
          tiktok_url?: string | null
          type: string
          updated_at?: string
          upload_check?: string | null
          waist?: number | null
          x_account?: string | null
          x_url?: string | null
        }
        Update: {
          age?: number | null
          blood_type?: string | null
          body_type?: string | null
          bust?: number | null
          celebrity_lookalike?: string | null
          created_at?: string
          cup_size?: string | null
          day_off_activities?: string | null
          dispatch_status?: string | null
          display_order?: number
          execution_date_end?: string | null
          execution_date_start?: string | null
          experience_years?: number | null
          favorite_food?: string | null
          favorite_techniques?: string | null
          files?: string[] | null
          follow_list?: string | null
          format_type?: string | null
          height?: number | null
          hip?: number | null
          hobbies?: string | null
          hp_notice?: string | null
          id?: string
          ideal_partner?: string | null
          ideal_type?: string | null
          instagram_url?: string | null
          is_active?: boolean
          is_visible?: boolean
          join_date?: string
          line_url?: string | null
          litlink_url?: string | null
          marks?: string[] | null
          media_registration?: string[] | null
          memo?: string | null
          message?: string | null
          name?: string
          photo?: string | null
          photos?: string[] | null
          profile?: string | null
          recent_dispatch_details?: string | null
          registration_sheet?: string | null
          repeat_scheduled?: boolean | null
          room?: string | null
          specialties?: string | null
          status?: string
          tags?: string[] | null
          therapist_years?: number | null
          tiktok_url?: string | null
          type?: string
          updated_at?: string
          upload_check?: string | null
          waist?: number | null
          x_account?: string | null
          x_url?: string | null
        }
        Relationships: []
      }
      cleaning_checklists: {
        Row: {
          cast_id: string | null
          created_at: string
          date: string
          details: Json | null
          id: string
          notes: string | null
          submitted_by: string | null
        }
        Insert: {
          cast_id?: string | null
          created_at?: string
          date: string
          details?: Json | null
          id?: string
          notes?: string | null
          submitted_by?: string | null
        }
        Update: {
          cast_id?: string | null
          created_at?: string
          date?: string
          details?: Json | null
          id?: string
          notes?: string | null
          submitted_by?: string | null
        }
        Relationships: []
      }
      closings: {
        Row: {
          closed_at: string
          created_at: string
          id: string
          notes: string | null
          period_date: string
          period_type: string
          total_reservations: number
          total_sales: number
          updated_at: string
        }
        Insert: {
          closed_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          period_date: string
          period_type: string
          total_reservations?: number
          total_sales?: number
          updated_at?: string
        }
        Update: {
          closed_at?: string
          created_at?: string
          id?: string
          notes?: string | null
          period_date?: string
          period_type?: string
          total_reservations?: number
          total_sales?: number
          updated_at?: string
        }
        Relationships: []
      }
      customer_ng_casts: {
        Row: {
          cast_id: string
          created_at: string
          customer_id: string
          id: string
          reason: string | null
        }
        Insert: {
          cast_id: string
          created_at?: string
          customer_id: string
          id?: string
          reason?: string | null
        }
        Update: {
          cast_id?: string
          created_at?: string
          customer_id?: string
          id?: string
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_ng_casts_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          ban_reason: string | null
          created_at: string
          email: string | null
          first_visit_date: string | null
          id: string
          is_banned: boolean
          last_visit_date: string | null
          last_visited: string | null
          name: string
          notes: string | null
          phone: string | null
          tags: string[] | null
          total_spent: number
          updated_at: string
          visit_count: number
        }
        Insert: {
          ban_reason?: string | null
          created_at?: string
          email?: string | null
          first_visit_date?: string | null
          id?: string
          is_banned?: boolean
          last_visit_date?: string | null
          last_visited?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          total_spent?: number
          updated_at?: string
          visit_count?: number
        }
        Update: {
          ban_reason?: string | null
          created_at?: string
          email?: string | null
          first_visit_date?: string | null
          id?: string
          is_banned?: boolean
          last_visit_date?: string | null
          last_visited?: string | null
          name?: string
          notes?: string | null
          phone?: string | null
          tags?: string[] | null
          total_spent?: number
          updated_at?: string
          visit_count?: number
        }
        Relationships: []
      }
      daily_feedback: {
        Row: {
          cast_id: string | null
          created_at: string
          customer_feedback: string | null
          date: string
          details: Json | null
          id: string
          rating: number | null
          submitted_by: string | null
        }
        Insert: {
          cast_id?: string | null
          created_at?: string
          customer_feedback?: string | null
          date: string
          details?: Json | null
          id?: string
          rating?: number | null
          submitted_by?: string | null
        }
        Update: {
          cast_id?: string | null
          created_at?: string
          customer_feedback?: string | null
          date?: string
          details?: Json | null
          id?: string
          rating?: number | null
          submitted_by?: string | null
        }
        Relationships: []
      }
      daily_sales_records: {
        Row: {
          card_amount: number
          cash_amount: number
          created_at: string
          date: string
          id: string
          paypay_amount: number
          submitted_by: string | null
          total_amount: number
        }
        Insert: {
          card_amount?: number
          cash_amount?: number
          created_at?: string
          date: string
          id?: string
          paypay_amount?: number
          submitted_by?: string | null
          total_amount?: number
        }
        Update: {
          card_amount?: number
          cash_amount?: number
          created_at?: string
          date?: string
          id?: string
          paypay_amount?: number
          submitted_by?: string | null
          total_amount?: number
        }
        Relationships: []
      }
      daily_sales_targets: {
        Row: {
          actual_amount: number
          created_at: string
          date: string
          id: string
          target_amount: number
          updated_at: string
        }
        Insert: {
          actual_amount?: number
          created_at?: string
          date: string
          id?: string
          target_amount?: number
          updated_at?: string
        }
        Update: {
          actual_amount?: number
          created_at?: string
          date?: string
          id?: string
          target_amount?: number
          updated_at?: string
        }
        Relationships: []
      }
      deductions: {
        Row: {
          amount: number
          created_at: string
          deduction_type: string
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          amount?: number
          created_at?: string
          deduction_type?: string
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          deduction_type?: string
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      discounts: {
        Row: {
          created_at: string
          discount_type: string
          discount_value: number
          id: string
          is_active: boolean
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          discount_type?: string
          discount_value?: number
          id?: string
          is_active?: boolean
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      expense_rates: {
        Row: {
          created_at: string
          expense_type: string
          id: string
          min_days: number | null
          shop_income: number
          therapist_deduction: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          expense_type: string
          id?: string
          min_days?: number | null
          shop_income: number
          therapist_deduction: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          expense_type?: string
          id?: string
          min_days?: number | null
          shop_income?: number
          therapist_deduction?: number
          updated_at?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          cast_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          expense_date: string
          expense_type: string
          id: string
          payment_method: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          cast_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          expense_type?: string
          id?: string
          payment_method?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          cast_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          expense_date?: string
          expense_type?: string
          id?: string
          payment_method?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "casts"
            referencedColumns: ["id"]
          },
        ]
      }
      facility_contracts: {
        Row: {
          address: string | null
          amount: number | null
          auto_lock: boolean
          contract_holder: string | null
          contract_status: string | null
          contract_terms: string | null
          created_at: string
          end_date: string | null
          floor_plan: string | null
          id: string
          internet_connection: string | null
          key_count: number | null
          login_id: string | null
          login_password: string | null
          mailbox_code: string | null
          management_company: string | null
          management_url: string | null
          name: string
          nominal_holder: string | null
          notes: string | null
          payment_method: string | null
          renewal_fee: number | null
          resident_manager: boolean
          start_date: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          amount?: number | null
          auto_lock?: boolean
          contract_holder?: string | null
          contract_status?: string | null
          contract_terms?: string | null
          created_at?: string
          end_date?: string | null
          floor_plan?: string | null
          id?: string
          internet_connection?: string | null
          key_count?: number | null
          login_id?: string | null
          login_password?: string | null
          mailbox_code?: string | null
          management_company?: string | null
          management_url?: string | null
          name?: string
          nominal_holder?: string | null
          notes?: string | null
          payment_method?: string | null
          renewal_fee?: number | null
          resident_manager?: boolean
          start_date?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          amount?: number | null
          auto_lock?: boolean
          contract_holder?: string | null
          contract_status?: string | null
          contract_terms?: string | null
          created_at?: string
          end_date?: string | null
          floor_plan?: string | null
          id?: string
          internet_connection?: string | null
          key_count?: number | null
          login_id?: string | null
          login_password?: string | null
          mailbox_code?: string | null
          management_company?: string | null
          management_url?: string | null
          name?: string
          nominal_holder?: string | null
          notes?: string | null
          payment_method?: string | null
          renewal_fee?: number | null
          resident_manager?: boolean
          start_date?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      facility_equipment: {
        Row: {
          created_at: string
          id: string
          item_type: string
          name: string
          notes: string | null
          quantity: number
          unit: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_type?: string
          name: string
          notes?: string | null
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_type?: string
          name?: string
          notes?: string | null
          quantity?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      hp_analytics_daily: {
        Row: {
          created_at: string
          date: string
          id: string
          page_views: number
          unique_visitors: number
          updated_at: string
          visits: number
        }
        Insert: {
          created_at?: string
          date: string
          id?: string
          page_views?: number
          unique_visitors?: number
          updated_at?: string
          visits?: number
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          page_views?: number
          unique_visitors?: number
          updated_at?: string
          visits?: number
        }
        Relationships: []
      }
      hp_analytics_hourly: {
        Row: {
          created_at: string
          hour: number
          id: string
          unique_visitors: number
          updated_at: string
          visits: number
        }
        Insert: {
          created_at?: string
          hour: number
          id?: string
          unique_visitors?: number
          updated_at?: string
          visits?: number
        }
        Update: {
          created_at?: string
          hour?: number
          id?: string
          unique_visitors?: number
          updated_at?: string
          visits?: number
        }
        Relationships: []
      }
      hp_analytics_pages: {
        Row: {
          avg_stay_seconds: number
          created_at: string
          id: string
          page_path: string
          page_title: string | null
          updated_at: string
          views: number
          visit_count: number
        }
        Insert: {
          avg_stay_seconds?: number
          created_at?: string
          id?: string
          page_path: string
          page_title?: string | null
          updated_at?: string
          views?: number
          visit_count?: number
        }
        Update: {
          avg_stay_seconds?: number
          created_at?: string
          id?: string
          page_path?: string
          page_title?: string | null
          updated_at?: string
          views?: number
          visit_count?: number
        }
        Relationships: []
      }
      hp_analytics_traffic: {
        Row: {
          conversion_rate: number
          created_at: string
          id: string
          medium: string
          source: string
          unique_visitors: number
          updated_at: string
          visits: number
        }
        Insert: {
          conversion_rate?: number
          created_at?: string
          id?: string
          medium?: string
          source: string
          unique_visitors?: number
          updated_at?: string
          visits?: number
        }
        Update: {
          conversion_rate?: number
          created_at?: string
          id?: string
          medium?: string
          source?: string
          unique_visitors?: number
          updated_at?: string
          visits?: number
        }
        Relationships: []
      }
      hp_articles: {
        Row: {
          category: string
          content: string
          created_at: string
          id: string
          is_published: boolean
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      hp_bulletin: {
        Row: {
          content: string
          created_at: string
          id: string
          is_published: boolean
          title: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_published?: boolean
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_articles: {
        Row: {
          category: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          is_pinned: boolean
          tags: string[] | null
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          tags?: string[] | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_pinned?: boolean
          tags?: string[] | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      knowledge_documents: {
        Row: {
          content: string
          created_at: string
          id: string
          slug: string
          updated_at: string
        }
        Insert: {
          content?: string
          created_at?: string
          id?: string
          slug: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      monthly_reports: {
        Row: {
          created_at: string
          gross_profit: number | null
          id: string
          month_date: string
          revenue: number | null
          target_amount: number | null
          target_revenue: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          gross_profit?: number | null
          id?: string
          month_date: string
          revenue?: number | null
          target_amount?: number | null
          target_revenue?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          gross_profit?: number | null
          id?: string
          month_date?: string
          revenue?: number | null
          target_amount?: number | null
          target_revenue?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      monthly_sales_targets: {
        Row: {
          created_at: string
          id: string
          month_date: string
          target_amount: number
          target_revenue: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          month_date: string
          target_amount?: number
          target_revenue?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          month_date?: string
          target_amount?: number
          target_revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      nomination_rates: {
        Row: {
          created_at: string
          customer_price: number
          id: string
          nomination_type: string
          shop_back: number | null
          therapist_back: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_price: number
          id?: string
          nomination_type: string
          shop_back?: number | null
          therapist_back?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_price?: number
          id?: string
          nomination_type?: string
          shop_back?: number | null
          therapist_back?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      notion_pages: {
        Row: {
          content: Json
          created_at: string
          id: string
          notion_page_id: string
          slug: string
          title: string
          updated_at: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          notion_page_id: string
          slug: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          notion_page_id?: string
          slug?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      option_rates: {
        Row: {
          created_at: string
          customer_price: number
          id: string
          option_name: string
          shop_back: number | null
          therapist_back: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_price: number
          id?: string
          option_name: string
          shop_back?: number | null
          therapist_back: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_price?: number
          id?: string
          option_name?: string
          shop_back?: number | null
          therapist_back?: number
          updated_at?: string
        }
        Relationships: []
      }
      payment_settings: {
        Row: {
          created_at: string
          fee_percentage: number
          id: string
          is_active: boolean
          payment_link: string | null
          payment_method: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          fee_percentage?: number
          id?: string
          is_active?: boolean
          payment_link?: string | null
          payment_method: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          fee_percentage?: number
          id?: string
          is_active?: boolean
          payment_link?: string | null
          payment_method?: string
          updated_at?: string
        }
        Relationships: []
      }
      paypay_sales: {
        Row: {
          amount: number
          created_at: string
          date: string
          id: string
          transaction_count: number
        }
        Insert: {
          amount?: number
          created_at?: string
          date: string
          id?: string
          transaction_count?: number
        }
        Update: {
          amount?: number
          created_at?: string
          date?: string
          id?: string
          transaction_count?: number
        }
        Relationships: []
      }
      price_analysis: {
        Row: {
          created_at: string
          id: string
          percentage: number
          price: number
          sales_count: number
          service_name: string
          total_revenue: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          percentage?: number
          price?: number
          sales_count?: number
          service_name: string
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          percentage?: number
          price?: number
          sales_count?: number
          service_name?: string
          total_revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      pricing: {
        Row: {
          course_type: string
          created_at: string
          duration: number
          id: string
          premium_price: number
          standard_price: number
          updated_at: string
          vip_price: number
        }
        Insert: {
          course_type?: string
          created_at?: string
          duration: number
          id?: string
          premium_price?: number
          standard_price?: number
          updated_at?: string
          vip_price?: number
        }
        Update: {
          course_type?: string
          created_at?: string
          duration?: number
          id?: string
          premium_price?: number
          standard_price?: number
          updated_at?: string
          vip_price?: number
        }
        Relationships: []
      }
      pricing_options: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          price?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          price?: number
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      referral_fees: {
        Row: {
          commission_rate: number
          created_at: string
          customer_name: string
          date: string
          fee: number
          id: string
          referrer_name: string
          sales_amount: number
        }
        Insert: {
          commission_rate?: number
          created_at?: string
          customer_name?: string
          date: string
          fee?: number
          id?: string
          referrer_name?: string
          sales_amount?: number
        }
        Update: {
          commission_rate?: number
          created_at?: string
          customer_name?: string
          date?: string
          fee?: number
          id?: string
          referrer_name?: string
          sales_amount?: number
        }
        Relationships: []
      }
      reservations: {
        Row: {
          cast_id: string
          course_name: string
          course_type: string | null
          created_at: string
          created_by: string | null
          customer_email: string | null
          customer_name: string
          customer_phone: string
          discount_ids: string[] | null
          duration: number
          id: string
          nomination_type: string | null
          notes: string | null
          options: string[] | null
          payment_method: string | null
          payment_status: string
          price: number
          reservation_date: string
          room: string | null
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          cast_id: string
          course_name: string
          course_type?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name: string
          customer_phone: string
          discount_ids?: string[] | null
          duration?: number
          id?: string
          nomination_type?: string | null
          notes?: string | null
          options?: string[] | null
          payment_method?: string | null
          payment_status?: string
          price: number
          reservation_date: string
          room?: string | null
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          cast_id?: string
          course_name?: string
          course_type?: string | null
          created_at?: string
          created_by?: string | null
          customer_email?: string | null
          customer_name?: string
          customer_phone?: string
          discount_ids?: string[] | null
          duration?: number
          id?: string
          nomination_type?: string | null
          notes?: string | null
          options?: string[] | null
          payment_method?: string | null
          payment_status?: string
          price?: number
          reservation_date?: string
          room?: string | null
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "casts"
            referencedColumns: ["id"]
          },
        ]
      }
      room_supplies: {
        Row: {
          category: string
          created_at: string
          id: string
          name: string
          notes: string | null
          quantity: number
          room_id: string
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          id?: string
          name: string
          notes?: string | null
          quantity?: number
          room_id: string
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          id?: string
          name?: string
          notes?: string | null
          quantity?: number
          room_id?: string
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_supplies_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          access: string | null
          address: string | null
          amenities: string[] | null
          capacity: number | null
          cast_guide: string | null
          cleaning_manual: string | null
          created_at: string
          description: string | null
          display_name: string | null
          email_text: string | null
          entry_flow: string | null
          equipment_costumes: string | null
          equipment_placement: string | null
          floor: string | null
          garbage_disposal: string | null
          id: string
          internal_notes: string | null
          is_active: boolean
          key_info: string | null
          map_address: string | null
          map_url: string | null
          name: string
          reset_procedure: string | null
          room_photos: string[] | null
          room_type: string | null
          rules: string | null
          sms_text: string | null
          updated_at: string
        }
        Insert: {
          access?: string | null
          address?: string | null
          amenities?: string[] | null
          capacity?: number | null
          cast_guide?: string | null
          cleaning_manual?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          email_text?: string | null
          entry_flow?: string | null
          equipment_costumes?: string | null
          equipment_placement?: string | null
          floor?: string | null
          garbage_disposal?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          key_info?: string | null
          map_address?: string | null
          map_url?: string | null
          name: string
          reset_procedure?: string | null
          room_photos?: string[] | null
          room_type?: string | null
          rules?: string | null
          sms_text?: string | null
          updated_at?: string
        }
        Update: {
          access?: string | null
          address?: string | null
          amenities?: string[] | null
          capacity?: number | null
          cast_guide?: string | null
          cleaning_manual?: string | null
          created_at?: string
          description?: string | null
          display_name?: string | null
          email_text?: string | null
          entry_flow?: string | null
          equipment_costumes?: string | null
          equipment_placement?: string | null
          floor?: string | null
          garbage_disposal?: string | null
          id?: string
          internal_notes?: string | null
          is_active?: boolean
          key_info?: string | null
          map_address?: string | null
          map_url?: string | null
          name?: string
          reset_procedure?: string | null
          room_photos?: string[] | null
          room_type?: string | null
          rules?: string | null
          sms_text?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      sales_expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          date: string
          description: string | null
          id: string
          payment_method: string | null
        }
        Insert: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          payment_method?: string | null
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          date?: string
          description?: string | null
          id?: string
          payment_method?: string | null
        }
        Relationships: []
      }
      sales_targets: {
        Row: {
          created_at: string
          id: string
          month: number
          target_amount: number
          updated_at: string
          year: number
        }
        Insert: {
          created_at?: string
          id?: string
          month: number
          target_amount?: number
          updated_at?: string
          year: number
        }
        Update: {
          created_at?: string
          id?: string
          month?: number
          target_amount?: number
          updated_at?: string
          year?: number
        }
        Relationships: []
      }
      shifts: {
        Row: {
          cast_id: string
          created_at: string
          created_by: string | null
          end_time: string
          id: string
          notes: string | null
          room: string | null
          shift_date: string
          start_time: string
          status: string
          updated_at: string
        }
        Insert: {
          cast_id: string
          created_at?: string
          created_by?: string | null
          end_time: string
          id?: string
          notes?: string | null
          room?: string | null
          shift_date: string
          start_time: string
          status?: string
          updated_at?: string
        }
        Update: {
          cast_id?: string
          created_at?: string
          created_by?: string | null
          end_time?: string
          id?: string
          notes?: string | null
          room?: string | null
          shift_date?: string
          start_time?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_cast_id_fkey"
            columns: ["cast_id"]
            isOneToOne: false
            referencedRelation: "casts"
            referencedColumns: ["id"]
          },
        ]
      }
      shop_settings: {
        Row: {
          business_hours: string | null
          created_at: string
          description: string | null
          id: string
          logo_url: string | null
          shop_address: string | null
          shop_email: string | null
          shop_name: string
          shop_phone: string | null
          updated_at: string
          updated_by: string
        }
        Insert: {
          business_hours?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          shop_address?: string | null
          shop_email?: string | null
          shop_name: string
          shop_phone?: string | null
          updated_at?: string
          updated_by: string
        }
        Update: {
          business_hours?: string | null
          created_at?: string
          description?: string | null
          id?: string
          logo_url?: string | null
          shop_address?: string | null
          shop_email?: string | null
          shop_name?: string
          shop_phone?: string | null
          updated_at?: string
          updated_by?: string
        }
        Relationships: []
      }
      sms_auto_templates: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          message: string
          name: string
          timing_minutes: number
          trigger: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          message?: string
          name: string
          timing_minutes?: number
          trigger?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          message?: string
          name?: string
          timing_minutes?: number
          trigger?: string
          updated_at?: string
        }
        Relationships: []
      }
      sms_logs: {
        Row: {
          created_at: string
          id: string
          message: string
          phone: string
          sent_at: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          phone: string
          sent_at?: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          phone?: string
          sent_at?: string
          status?: string
        }
        Relationships: []
      }
      sns_accounts: {
        Row: {
          category: string
          created_at: string
          email: string | null
          id: string
          login_id: string | null
          login_password: string | null
          management_url: string | null
          name: string
          profile_link: string | null
          published_to_hp: boolean
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          email?: string | null
          id?: string
          login_id?: string | null
          login_password?: string | null
          management_url?: string | null
          name: string
          profile_link?: string | null
          published_to_hp?: boolean
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          email?: string | null
          id?: string
          login_id?: string | null
          login_password?: string | null
          management_url?: string | null
          name?: string
          profile_link?: string | null
          published_to_hp?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      store_info: {
        Row: {
          address: string | null
          created_at: string
          description: string | null
          email: string | null
          holiday: string | null
          hours: string | null
          id: string
          lat: number | null
          line_url: string | null
          lng: number | null
          name: string
          phone: string | null
          twitter_url: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          holiday?: string | null
          hours?: string | null
          id?: string
          lat?: number | null
          line_url?: string | null
          lng?: number | null
          name?: string
          phone?: string | null
          twitter_url?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          created_at?: string
          description?: string | null
          email?: string | null
          holiday?: string | null
          hours?: string | null
          id?: string
          lat?: number | null
          line_url?: string | null
          lng?: number | null
          name?: string
          phone?: string | null
          twitter_url?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      text_templates: {
        Row: {
          color: string
          content: string | null
          created_at: string
          display_order: number
          id: string
          is_folder: boolean
          label: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string
          content?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_folder?: boolean
          label: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string
          content?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_folder?: boolean
          label?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      therapist_profiles: {
        Row: {
          career_history: string | null
          cast_id: string
          comment: string | null
          created_at: string
          customer_age_range: string | null
          id: string
          love_type: string | null
          massage_skills: string | null
          mbti: string | null
          preferred_type: string | null
          self_introduction: string | null
          sns_operation_notes: string | null
          special_skills: string | null
          tags: string[] | null
          training_count: number | null
          updated_at: string
          weight: number | null
        }
        Insert: {
          career_history?: string | null
          cast_id: string
          comment?: string | null
          created_at?: string
          customer_age_range?: string | null
          id?: string
          love_type?: string | null
          massage_skills?: string | null
          mbti?: string | null
          preferred_type?: string | null
          self_introduction?: string | null
          sns_operation_notes?: string | null
          special_skills?: string | null
          tags?: string[] | null
          training_count?: number | null
          updated_at?: string
          weight?: number | null
        }
        Update: {
          career_history?: string | null
          cast_id?: string
          comment?: string | null
          created_at?: string
          customer_age_range?: string | null
          id?: string
          love_type?: string | null
          massage_skills?: string | null
          mbti?: string | null
          preferred_type?: string | null
          self_introduction?: string | null
          sns_operation_notes?: string | null
          special_skills?: string | null
          tags?: string[] | null
          training_count?: number | null
          updated_at?: string
          weight?: number | null
        }
        Relationships: []
      }
      therapist_sales: {
        Row: {
          average_visit_price: number
          created_at: string
          id: string
          name: string
          total_sales: number
          updated_at: string
          visit_count: number
        }
        Insert: {
          average_visit_price?: number
          created_at?: string
          id?: string
          name: string
          total_sales?: number
          updated_at?: string
          visit_count?: number
        }
        Update: {
          average_visit_price?: number
          created_at?: string
          id?: string
          name?: string
          total_sales?: number
          updated_at?: string
          visit_count?: number
        }
        Relationships: []
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
      get_cast_access_tokens: {
        Args: never
        Returns: {
          access_token: string
          cast_id: string
        }[]
      }
      get_cast_by_access_token: {
        Args: { p_token: string }
        Returns: {
          id: string
          name: string
          photo: string
        }[]
      }
      get_public_back_rates: {
        Args: never
        Returns: {
          course_type: string
          customer_price: number
          duration: number
          id: string
        }[]
      }
      get_reservation_slots: {
        Args: { p_cast_id?: string; p_date: string }
        Returns: {
          cast_id: string
          duration: number
          id: string
          reservation_date: string
          start_time: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      record_page_view: { Args: { p_path: string }; Returns: undefined }
      set_cast_access_token: {
        Args: { p_cast_id: string; p_token: string }
        Returns: undefined
      }
      submit_therapist_shifts: {
        Args: { p_shifts: Json; p_token: string }
        Returns: number
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
