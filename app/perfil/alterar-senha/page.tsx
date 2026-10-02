import { redirect } from "next/navigation"
import { getActor } from "@/lib/auth/guards"
import { PasswordForm } from "@/components/auth/password-form"

export default async function ChangePasswordPage() {
  const actor = await getActor()
  if (!actor?.active) redirect("/auth/login")
  if (actor.must_change_password || actor.password_reset_pending) redirect("/auth/reset-password")
  return <PasswordForm own />
}
