"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

const RequestBookingSchema = z.object({
  serviceId: z.string().uuid(),
  scheduledStart: z.string().datetime(),
  durationMinutes: z.coerce.number().min(30).max(480),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  postalCode: z.string().regex(/^[A-Za-z]\d[A-Za-z][\s-]?\d[A-Za-z]\d$/),
  notes: z.string().max(1000).optional(),
});

export async function requestBooking(formData: FormData) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const parsed = RequestBookingSchema.safeParse({
    serviceId: formData.get("serviceId"),
    scheduledStart: formData.get("scheduledStart"),
    durationMinutes: formData.get("durationMinutes"),
    addressLine1: formData.get("addressLine1"),
    addressLine2: formData.get("addressLine2"),
    city: formData.get("city"),
    postalCode: formData.get("postalCode"),
    notes: formData.get("notes"),
  });

  if (!parsed.success) {
    return { error: parsed.error.errors.map((e) => e.message).join(", ") };
  }

  const { error, data } = await supabase.rpc("request_booking", {
    p_service_id: parsed.data.serviceId,
    p_scheduled_start: parsed.data.scheduledStart,
    p_duration_minutes: parsed.data.durationMinutes,
    p_address_line1: parsed.data.addressLine1,
    p_address_line2: parsed.data.addressLine2 ?? null,
    p_city: parsed.data.city,
    p_postal_code: parsed.data.postalCode,
    p_notes: parsed.data.notes ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true, bookingId: data };
}

export async function cancelBooking(bookingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.rpc("cancel_booking", { p_booking_id: bookingId });
  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true };
}

export async function claimBooking(bookingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.rpc("claim_booking", { p_booking_id: bookingId });
  if (error) return { error: error.message };
  revalidatePath("/provider");
  return { success: true };
}

export async function completeBooking(bookingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { error } = await supabase.rpc("complete_booking", { p_booking_id: bookingId });
  if (error) return { error: error.message };
  revalidatePath("/provider");
  revalidatePath("/dashboard");
  return { success: true };
}

export async function submitReview(bookingId: string, rating: number, text: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated" };

  const { data: booking } = await supabase
    .from("bookings")
    .select("provider_id")
    .eq("id", bookingId)
    .eq("user_id", user.id)
    .eq("status", "completed")
    .single();

  if (!booking?.provider_id) return { error: "Booking not found or not completed" };

  const { error } = await supabase.from("reviews").insert({
    booking_id: bookingId,
    provider_id: booking.provider_id,
    author_id: user.id,
    rating,
    text: text || null,
  });

  if (error) return { error: error.message };
  revalidatePath("/dashboard");
  return { success: true };
}
