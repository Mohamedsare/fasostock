"use client";

import { AdminCard, AdminPageHeader } from "@/components/admin/admin-page-header";
import {
  adminCreatePublicPartner,
  adminDeletePublicPartner,
  adminListPublicPartners,
  adminListPublicLandingMedia,
  adminListPublicLandingSettings,
  adminSetPublicLandingMediaImage,
  adminSetPublicLandingSettings,
  adminUploadLandingImage,
} from "@/lib/features/admin/api";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { MdAdd, MdDeleteOutline, MdUpload } from "react-icons/md";

export function AdminGPubliqueScreen() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [supportImageDataUrl, setSupportImageDataUrl] = useState("");
  const [heroBannerImageDataUrl, setHeroBannerImageDataUrl] = useState("");
  const [landingSettings, setLandingSettings] = useState<Record<string, string>>({
    hero_banner_image_url: "",
    footer_whatsapp_url:
      "https://wa.me/212771668079?text=Bonjour%2C%20je%20suis%20int%C3%A9ress%C3%A9(e)%20par%20FasoStock.%20Pouvez-vous%20m%27aider%20%3F",
    footer_facebook_url: "https://facebook.com",
    footer_youtube_url: "https://youtube.com",
    footer_tiktok_url: "https://tiktok.com",
    footer_linkedin_url: "https://linkedin.com",
    pricing_trial_days: "7",
    pricing_monthly_amount: "15000",
    pricing_yearly_amount: "125000",
    pricing_yearly_savings: "55000",
    support_whatsapp_url:
      "https://wa.me/212771668079?text=Bonjour%2C%20je%20suis%20int%C3%A9ress%C3%A9(e)%20par%20FasoStock.%20Pouvez-vous%20m%27aider%20%3F",
    support_demo_url: "/help",
    testimonials_stat_1_value: "500+",
    testimonials_stat_1_label: "Commerçants utilisent déjà FasoStock",
    testimonials_stat_2_value: "30+",
    testimonials_stat_2_label: "Types de commerces accompagnés",
    testimonials_stat_3_value: "98%",
    testimonials_stat_3_label: "De clients satisfaits selon nos retours",
    testimonials_stat_4_value: "+25%",
    testimonials_stat_4_label: "D'augmentation moyenne de performance",
    testimonials_cta_title: "La confiance de centaines de commerçants comme vous",
    testimonials_cta_subtitle:
      "Rejoignez la communauté FasoStock et faites passer votre commerce au niveau supérieur.",
  });

  const q = useQuery({
    queryKey: ["admin-public-partners"] as const,
    queryFn: adminListPublicPartners,
  });
  const mediaQ = useQuery({
    queryKey: ["admin-public-landing-media"] as const,
    queryFn: adminListPublicLandingMedia,
  });
  const settingsQ = useQuery({
    queryKey: ["admin-public-landing-settings"] as const,
    queryFn: adminListPublicLandingSettings,
  });

  const addMut = useMutation({
    mutationFn: adminCreatePublicPartner,
    onSuccess: async () => {
      toast.success("Partenaire ajouté.");
      setName("");
      setSortOrder("0");
      setLogoDataUrl("");
      await qc.invalidateQueries({ queryKey: ["admin-public-partners"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const delMut = useMutation({
    mutationFn: adminDeletePublicPartner,
    onSuccess: async () => {
      toast.success("Partenaire supprimé.");
      await qc.invalidateQueries({ queryKey: ["admin-public-partners"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const mediaMut = useMutation({
    mutationFn: ({ key, imageUrl }: { key: string; imageUrl: string }) =>
      adminSetPublicLandingMediaImage(key, imageUrl),
    onSuccess: async () => {
      toast.success("Image landing mise à jour.");
      setSupportImageDataUrl("");
      await qc.invalidateQueries({ queryKey: ["admin-public-landing-media"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const settingsMut = useMutation({
    mutationFn: adminSetPublicLandingSettings,
    onSuccess: async () => {
      toast.success("Réglages landing enregistrés.");
      await qc.invalidateQueries({ queryKey: ["admin-public-landing-settings"] });
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const canAdd = useMemo(
    () => name.trim().length >= 2 && logoDataUrl.trim().length > 0 && !addMut.isPending,
    [name, logoDataUrl, addMut.isPending],
  );

  const [uploadingHero, setUploadingHero] = useState(false);
  const [uploadingSupport, setUploadingSupport] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  async function onPickLogo(file: File | null) {
    if (!file) return;
    setUploadingLogo(true);
    try {
      const url = await adminUploadLandingImage(file, "partners");
      setLogoDataUrl(url);
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    } finally {
      setUploadingLogo(false);
    }
  }

  async function onPickSupportImage(file: File | null) {
    if (!file) return;
    setUploadingSupport(true);
    try {
      const url = await adminUploadLandingImage(file, "support");
      setSupportImageDataUrl(url);
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    } finally {
      setUploadingSupport(false);
    }
  }

  async function onPickHeroBannerImage(file: File | null) {
    if (!file) return;
    setUploadingHero(true);
    try {
      const url = await adminUploadLandingImage(file, "hero");
      setHeroBannerImageDataUrl(url);
      setSetting("hero_banner_image_url", url);
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    } finally {
      setUploadingHero(false);
    }
  }

  const supportMedia = (mediaQ.data ?? []).find((m) => m.key === "support_section_image");
  useEffect(() => {
    if (!settingsQ.data) return;
    const next = { ...landingSettings };
    for (const item of settingsQ.data) next[item.key] = item.value;
    setLandingSettings(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsQ.data]);

  function setSetting(key: string, value: string) {
    setLandingSettings((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <div className="space-y-6 p-5 md:p-8">
      <AdminPageHeader
        title="GPublique"
        description="Gestion complète du contenu public de la landing (images, liens, tarifs, partenaires)."
      />

      <AdminCard>
        <h3 className="text-base font-bold text-slate-900">Paramètres globaux de la landing</h3>
        <p className="mt-1 text-xs text-slate-500">
          Gérez ici l&apos;image de bannière, les liens sociaux du footer, les tarifs et les liens CTA.
        </p>
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <strong>Astuce performance :</strong> ne collez plus de Data URL (base64) — utilisez l&apos;upload qui envoie l&apos;image vers Storage et stocke seulement l&apos;URL. Toute valeur Data URL sera ignorée à l&apos;affichage pour préserver la rapidité de la landing.
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">URL image bannière</span>
            <input
              value={landingSettings.hero_banner_image_url ?? ""}
              onChange={(e) => setSetting("hero_banner_image_url", e.target.value)}
              placeholder="https://..."
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Uploader image bannière</span>
            <label className="inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
              <MdUpload className="h-4 w-4" aria-hidden />
              {uploadingHero ? "Upload en cours…" : "Choisir une image"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={uploadingHero}
                onChange={(e) => void onPickHeroBannerImage(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Lien démo section accompagnement</span>
            <input
              value={landingSettings.support_demo_url ?? ""}
              onChange={(e) => setSetting("support_demo_url", e.target.value)}
              placeholder="/help"
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Lien WhatsApp section accompagnement</span>
            <input
              value={landingSettings.support_whatsapp_url ?? ""}
              onChange={(e) => setSetting("support_whatsapp_url", e.target.value)}
              placeholder="https://wa.me/..."
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">WhatsApp footer</span>
            <input
              value={landingSettings.footer_whatsapp_url ?? ""}
              onChange={(e) => setSetting("footer_whatsapp_url", e.target.value)}
              placeholder="https://wa.me/..."
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Facebook footer</span>
            <input
              value={landingSettings.footer_facebook_url ?? ""}
              onChange={(e) => setSetting("footer_facebook_url", e.target.value)}
              placeholder="https://facebook.com/..."
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">YouTube footer</span>
            <input
              value={landingSettings.footer_youtube_url ?? ""}
              onChange={(e) => setSetting("footer_youtube_url", e.target.value)}
              placeholder="https://youtube.com/..."
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">TikTok footer</span>
            <input
              value={landingSettings.footer_tiktok_url ?? ""}
              onChange={(e) => setSetting("footer_tiktok_url", e.target.value)}
              placeholder="https://tiktok.com/@..."
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">LinkedIn footer</span>
            <input
              value={landingSettings.footer_linkedin_url ?? ""}
              onChange={(e) => setSetting("footer_linkedin_url", e.target.value)}
              placeholder="https://linkedin.com/company/..."
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <p className="mb-2 text-xs font-semibold text-slate-600">Bannière actuelle</p>
            {landingSettings.hero_banner_image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={landingSettings.hero_banner_image_url}
                alt="Bannière actuelle"
                className="h-44 w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-500">
                Aucune image bannière définie
              </div>
            )}
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <p className="mb-2 text-xs font-semibold text-slate-600">Aperçu nouvel upload</p>
            {heroBannerImageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={heroBannerImageDataUrl}
                alt="Aperçu image bannière"
                className="h-44 w-full rounded-xl object-cover"
              />
            ) : (
              <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-500">
                Aucun upload en attente
              </div>
            )}
          </article>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Essai (jours)</span>
            <input
              value={landingSettings.pricing_trial_days ?? ""}
              onChange={(e) => setSetting("pricing_trial_days", e.target.value.replace(/[^\d]/g, ""))}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Prix mensuel (FCFA)</span>
            <input
              value={landingSettings.pricing_monthly_amount ?? ""}
              onChange={(e) => setSetting("pricing_monthly_amount", e.target.value.replace(/[^\d]/g, ""))}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Prix annuel (FCFA)</span>
            <input
              value={landingSettings.pricing_yearly_amount ?? ""}
              onChange={(e) => setSetting("pricing_yearly_amount", e.target.value.replace(/[^\d]/g, ""))}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
          <label className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Économie annuelle (FCFA)</span>
            <input
              value={landingSettings.pricing_yearly_savings ?? ""}
              onChange={(e) => setSetting("pricing_yearly_savings", e.target.value.replace(/[^\d]/g, ""))}
              className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
            />
          </label>
        </div>
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-xs font-semibold text-slate-700">Statistiques section Témoignages (landing)</p>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Stat 1 — Valeur</span>
              <input
                value={landingSettings.testimonials_stat_1_value ?? ""}
                onChange={(e) => setSetting("testimonials_stat_1_value", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Stat 1 — Libellé</span>
              <input
                value={landingSettings.testimonials_stat_1_label ?? ""}
                onChange={(e) => setSetting("testimonials_stat_1_label", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Stat 2 — Valeur</span>
              <input
                value={landingSettings.testimonials_stat_2_value ?? ""}
                onChange={(e) => setSetting("testimonials_stat_2_value", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Stat 2 — Libellé</span>
              <input
                value={landingSettings.testimonials_stat_2_label ?? ""}
                onChange={(e) => setSetting("testimonials_stat_2_label", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Stat 3 — Valeur</span>
              <input
                value={landingSettings.testimonials_stat_3_value ?? ""}
                onChange={(e) => setSetting("testimonials_stat_3_value", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Stat 3 — Libellé</span>
              <input
                value={landingSettings.testimonials_stat_3_label ?? ""}
                onChange={(e) => setSetting("testimonials_stat_3_label", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Stat 4 — Valeur</span>
              <input
                value={landingSettings.testimonials_stat_4_value ?? ""}
                onChange={(e) => setSetting("testimonials_stat_4_value", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Stat 4 — Libellé</span>
              <input
                value={landingSettings.testimonials_stat_4_label ?? ""}
                onChange={(e) => setSetting("testimonials_stat_4_label", e.target.value)}
                className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
              />
            </label>
          </div>
          <div className="mt-4 border-t border-slate-200 pt-4">
            <p className="text-xs font-semibold text-slate-700">Bloc CTA sous les statistiques</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">CTA — Titre</span>
                <input
                  value={landingSettings.testimonials_cta_title ?? ""}
                  onChange={(e) => setSetting("testimonials_cta_title", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
                />
              </label>
              <label className="space-y-1.5">
                <span className="text-xs font-semibold text-slate-600">CTA — Sous-titre</span>
                <input
                  value={landingSettings.testimonials_cta_subtitle ?? ""}
                  onChange={(e) => setSetting("testimonials_cta_subtitle", e.target.value)}
                  className="h-11 w-full rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
                />
              </label>
            </div>
          </div>
        </div>
        <div className="mt-4">
          <button
            type="button"
            disabled={settingsMut.isPending}
            onClick={() => settingsMut.mutate(landingSettings)}
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            <MdAdd className="h-4 w-4" aria-hidden />
            Enregistrer les paramètres
          </button>
        </div>
      </AdminCard>

      <AdminCard>
        <h3 className="text-base font-bold text-slate-900">Image section Accompagnement</h3>
        <p className="mt-1 text-xs text-slate-500">
          Cette image pilote la section publique "Un expert vous accompagne" sur la landing.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[220px_auto] md:items-center">
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
            <MdUpload className="h-4 w-4" aria-hidden />
            {uploadingSupport ? "Upload en cours…" : "Uploader image"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploadingSupport}
              onChange={(e) => void onPickSupportImage(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            disabled={!supportImageDataUrl || mediaMut.isPending}
            onClick={() =>
              mediaMut.mutate({
                key: "support_section_image",
                imageUrl: supportImageDataUrl,
              })
            }
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white disabled:opacity-50 md:w-fit"
          >
            <MdAdd className="h-4 w-4" aria-hidden />
            Enregistrer l'image
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {supportImageDataUrl ? "Image prête pour enregistrement." : "Choisissez une image (.png/.jpg/.webp)."}
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <p className="mb-2 text-xs font-semibold text-slate-600">Image actuellement publiée</p>
            {supportMedia?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={supportMedia.imageUrl} alt="Image accompagnement actuelle" className="h-44 w-full rounded-xl object-cover" />
            ) : (
              <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-500">
                Aucune image publiée
              </div>
            )}
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-2">
            <p className="mb-2 text-xs font-semibold text-slate-600">Aperçu nouvel upload</p>
            {supportImageDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={supportImageDataUrl} alt="Aperçu nouvel upload" className="h-44 w-full rounded-xl object-cover" />
            ) : (
              <div className="flex h-44 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-xs text-slate-500">
                Aucun upload en attente
              </div>
            )}
          </article>
        </div>
      </AdminCard>

      <AdminCard>
        <h3 className="text-base font-bold text-slate-900">Ajouter un partenaire</h3>
        <p className="mt-1 text-xs text-slate-500">
          Nom + logo. Le logo uploadé est stocké en base et affiché sur la landing.
        </p>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_170px_170px_auto] md:items-center">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nom partenaire"
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
          />
          <input
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Ordre"
            className="h-11 rounded-xl border border-slate-300 px-3 text-sm outline-none focus:border-orange-400"
          />
          <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700">
            <MdUpload className="h-4 w-4" aria-hidden />
            {uploadingLogo ? "Upload en cours…" : "Uploader logo"}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={uploadingLogo}
              onChange={(e) => void onPickLogo(e.target.files?.[0] ?? null)}
            />
          </label>
          <button
            type="button"
            disabled={!canAdd}
            onClick={() =>
              addMut.mutate({
                name,
                logoUrl: logoDataUrl,
                sortOrder: Number(sortOrder || "0"),
              })
            }
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-orange-600 px-4 text-sm font-bold text-white disabled:opacity-50"
          >
            <MdAdd className="h-4 w-4" aria-hidden />
            Ajouter
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          {logoDataUrl ? "Logo prêt pour enregistrement." : "Choisissez une image (.png/.jpg/.webp)."}
        </p>
      </AdminCard>

      <AdminCard>
        <h3 className="text-base font-bold text-slate-900">Partenaires publiés</h3>
        {q.isLoading ? (
          <p className="mt-3 text-sm text-slate-500">Chargement…</p>
        ) : q.isError ? (
          <p className="mt-3 text-sm font-semibold text-red-600">
            {(q.error as Error)?.message ?? "Erreur de chargement"}
          </p>
        ) : (q.data ?? []).length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">Aucun partenaire.</p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(q.data ?? []).map((p) => (
              <article key={p.id} className="rounded-2xl border border-slate-200 bg-white p-3">
                <div className="flex h-16 items-center justify-center rounded-xl bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.logoUrl} alt={p.name} className="h-10 w-auto max-w-[160px] object-contain" />
                </div>
                <div className="mt-2 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-500">Ordre: {p.sortOrder}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => delMut.mutate(p.id)}
                    disabled={delMut.isPending}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-red-600 disabled:opacity-50"
                    title="Supprimer"
                    aria-label={`Supprimer ${p.name}`}
                  >
                    <MdDeleteOutline className="h-4 w-4" aria-hidden />
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </AdminCard>
    </div>
  );
}
