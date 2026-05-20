import { createServiceRoleClient } from "@/lib/supabase/service-role";

export type EmailLogStatus = "pending" | "sent" | "failed";

export type EmailLogInsert = {
  recipient: string;
  subject: string;
  templateKey?: string | null;
  metadata?: Record<string, unknown>;
  dedupeKey?: string | null;
};

/** true si un envoi « sent » existe déjà pour cette clé. */
export async function hasEmailBeenSent(dedupeKey: string): Promise<boolean> {
  const key = dedupeKey.trim();
  if (!key) return false;
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("email_logs")
      .select("id")
      .eq("dedupe_key", key)
      .eq("status", "sent")
      .maybeSingle();
    if (error) {
      console.error("[email_logs] has sent:", error.message);
      return false;
    }
    return data != null;
  } catch (e) {
    console.error("[email_logs] has sent:", e);
    return false;
  }
}

export async function createEmailLog(row: EmailLogInsert): Promise<string | null> {
  try {
    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("email_logs")
      .insert({
        recipient: row.recipient,
        subject: row.subject,
        template_key: row.templateKey ?? null,
        status: "pending",
        metadata: row.metadata ?? {},
        dedupe_key: row.dedupeKey?.trim() || null,
      })
      .select("id")
      .single();

    if (error) {
      if (error.code === "23505" && row.dedupeKey) {
        return null;
      }
      console.error("[email_logs] insert pending:", error.message);
      return null;
    }
    return data?.id != null ? String(data.id) : null;
  } catch (e) {
    console.error("[email_logs] create:", e);
    return null;
  }
}

export async function markEmailLogSent(logId: string, resendId: string | null): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase
      .from("email_logs")
      .update({
        status: "sent",
        resend_id: resendId,
        sent_at: new Date().toISOString(),
        error_message: null,
      })
      .eq("id", logId);
  } catch (e) {
    console.error("[email_logs] mark sent:", e);
  }
}

export async function markEmailLogFailed(logId: string, errorMessage: string): Promise<void> {
  try {
    const supabase = createServiceRoleClient();
    await supabase
      .from("email_logs")
      .update({
        status: "failed",
        error_message: errorMessage.slice(0, 2000),
      })
      .eq("id", logId);
  } catch (e) {
    console.error("[email_logs] mark failed:", e);
  }
}
