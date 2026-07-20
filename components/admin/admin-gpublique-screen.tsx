"use client";

import { revalidateLandingCache } from "@/app/(admin)/admin/gpublique/actions";
import { AdminCard } from "@/components/admin/admin-page-header";
import { FsHorizontalScroll } from "@/components/ui/fs-horizontal-scroll";
import {
  adminCreatePublicPartner,
  adminDeletePublicPartner,
  adminListPublicPartners,
  adminListPublicLandingMedia,
  adminListPublicLandingSettings,
  adminSetPublicLandingMediaImage,
  adminSetPublicLandingSettings,
  adminUpdatePublicPartner,
  adminUploadLandingImage,
} from "@/lib/features/admin/api";
import type { AdminPublicPartner } from "@/lib/features/admin/types";
import { messageFromUnknownError, toast } from "@/lib/toast";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  MdAdd,
  MdArrowDownward,
  MdArrowUpward,
  MdCheck,
  MdClose,
  MdDeleteOutline,
  MdEdit,
  MdGroups,
  MdImage,
  MdOpenInNew,
  MdPublic,
  MdSettings,
  MdToggleOff,
  MdToggleOn,
  MdUpload,
  MdVideocam,
} from "react-icons/md";

type GPubTab = "general" | "media" | "partners";

const FIELD =
  "min-h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-400/25";
const LABEL = "text-[11px] font-bold uppercase tracking-wide text-slate-500";
const BTN_PRIMARY =
  "inline-flex min-h-12 w-full shrink-0 items-center justify-center gap-2 rounded-2xl bg-orange-600 px-5 text-base font-bold text-white shadow-lg shadow-orange-600/20 transition active:scale-[0.98] disabled:opacity-50 sm:w-auto";

export function AdminGPubliqueScreen() {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [logoDataUrl, setLogoDataUrl] = useState("");
  const [heroBannerImageDataUrl, setHeroBannerImageDataUrl] = useState("");
  const [landingSettings, setLandingSettings] = useState<Record<string, string>>({
    hero_banner_image_url: "",
    hero_banner_media_type: "image",
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
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-public-partners"] }),
        revalidateLandingCache(),
      ]);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const delMut = useMutation({
    mutationFn: adminDeletePublicPartner,
    onSuccess: async () => {
      toast.success("Partenaire supprimé.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-public-partners"] }),
        revalidateLandingCache(),
      ]);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });

  const updateMut = useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: { name?: string; logoUrl?: string; sortOrder?: number; isActive?: boolean };
    }) => adminUpdatePublicPartner(id, patch),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-public-partners"] }),
        revalidateLandingCache(),
      ]);
    },
    onError: (e) => toast.error(messageFromUnknownError(e)),
  });
  const settingsMut = useMutation({
    mutationFn: adminSetPublicLandingSettings,
    onSuccess: async () => {
      toast.success("Réglages landing enregistrés.");
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-public-landing-settings"] }),
        revalidateLandingCache(),
      ]);
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
      // Auto-save : on persiste tout de suite l'URL Storage (la Data URL géante en base est écrasée).
      await adminSetPublicLandingMediaImage("support_section_image", url);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-public-landing-media"] }),
        revalidateLandingCache(),
      ]);
      toast.success("Image accompagnement publiée.");
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    } finally {
      setUploadingSupport(false);
    }
  }

  async function onPickHeroBanner(file: File | null) {
    if (!file) return;
    const mediaType = file.type.startsWith("video/") ? "video" : "image";
    setUploadingHero(true);
    try {
      const url = await adminUploadLandingImage(file, "hero");
      setHeroBannerImageDataUrl(url);
      // Auto-save : remplace immédiatement la valeur en base (sinon les anciennes Data URLs filtrées restent).
      const merged = { ...landingSettings, hero_banner_image_url: url, hero_banner_media_type: mediaType };
      setLandingSettings(merged);
      await adminSetPublicLandingSettings({
        hero_banner_image_url: url,
        hero_banner_media_type: mediaType,
      });
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-public-landing-settings"] }),
        revalidateLandingCache(),
      ]);
      toast.success(mediaType === "video" ? "Bannière vidéo publiée." : "Bannière publiée.");
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

  /**
   * Renumérote toute la liste de partenaires avec des sortOrder propres
   * (10, 20, 30, ...). Permet aux flèches ↑/↓ de toujours produire un
   * mouvement visible, même quand plusieurs partenaires partagent le
   * même sort_order initial (ex. tous à 0).
   */
  async function renumberPartners(newOrder: AdminPublicPartner[]) {
    try {
      await Promise.all(
        newOrder.map((p, i) =>
          adminUpdatePublicPartner(p.id, { sortOrder: (i + 1) * 10 }),
        ),
      );
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["admin-public-partners"] }),
        revalidateLandingCache(),
      ]);
      toast.success("Ordre des partenaires mis à jour.");
    } catch (e) {
      toast.error(messageFromUnknownError(e));
    }
  }

  /** Détecte si la valeur stockée actuellement est une Data URL géante (héritée d'avant la migration). */
  const heroSettingRaw = (settingsQ.data ?? []).find((s) => s.key === "hero_banner_image_url")?.value ?? "";
  const heroSettingIsLegacyDataUrl = heroSettingRaw.startsWith("data:") && heroSettingRaw.length > 200_000;
  const supportMediaRaw = (mediaQ.data ?? []).find((m) => m.key === "support_section_image")?.imageUrl ?? "";
  const supportMediaIsLegacyDataUrl = supportMediaRaw.startsWith("data:") && supportMediaRaw.length > 200_000;
  const hasLegacyData = heroSettingIsLegacyDataUrl || supportMediaIsLegacyDataUrl;

  const [activeTab, setActiveTab] = useState<GPubTab>("general");

  const serverSettingsMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const item of settingsQ.data ?? []) m[item.key] = item.value;
    return m;
  }, [settingsQ.data]);

  const settingsDirty = useMemo(() => {
    const keys = new Set([...Object.keys(landingSettings), ...Object.keys(serverSettingsMap)]);
    for (const k of keys) {
      const a = (landingSettings[k] ?? "").trim();
      const b = (serverSettingsMap[k] ?? "").trim();
      if (a !== b) return true;
    }
    return false;
  }, [landingSettings, serverSettingsMap]);

  const activePartners = (q.data ?? []).filter((x) => x.isActive).length;

  // Type de bannière courant : piloté par le réglage, avec repli sur l'extension de l'URL.
  const heroMediaTypeSetting = (landingSettings.hero_banner_media_type ?? "").trim().toLowerCase();
  const heroBannerIsVideo =
    heroMediaTypeSetting === "video" ||
    (heroMediaTypeSetting !== "image" &&
      /\.(mp4|webm|ogg|ogv|mov|m4v)(\?.*)?$/i.test(landingSettings.hero_banner_image_url ?? ""));

  return (
    <div className="min-h-0 space-y-4 px-4 pb-28 pt-4 sm:px-5 sm:pb-10 sm:pt-5 md:space-y-6 md:px-6 md:pt-6 lg:px-8">
      <header className="overflow-hidden rounded-2xl border border-white/20 bg-linear-to-br from-[#c2410c] via-orange-500 to-amber-400 p-4 text-white shadow-lg shadow-orange-900/15 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-white/70">Landing publique</p>
            <h1 className="mt-1 text-2xl font-black leading-tight tracking-tight sm:text-3xl">GPublique</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/90">
              Bannière, liens, tarifs, témoignages, images et partenaires — tout ce qui apparaît sur la page d&apos;accueil.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                {settingsQ.isSuccess ? "Réglages chargés" : "Chargement…"}
              </span>
              {activePartners > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold backdrop-blur-sm">
                  <MdPublic className="h-3.5 w-3.5" aria-hidden />
                  {activePartners} partenaire{activePartners > 1 ? "s" : ""} en ligne
                </span>
              ) : null}
            </div>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[200px]">
            <Link
              href="/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-white px-4 text-sm font-bold text-orange-600 shadow-md transition active:scale-[0.98]"
            >
              Voir la landing
              <MdOpenInNew className="h-4 w-4 shrink-0" aria-hidden />
            </Link>
            {settingsDirty ? (
              <p className="text-center text-xs font-semibold text-amber-100 sm:text-left">
                Modifications non enregistrées (onglet Général)
              </p>
            ) : null}
          </div>
        </div>
      </header>

      <FsHorizontalScroll
        role="tablist"
        aria-label="Sections GPublique"
        className="sticky top-0 z-20 -mx-4 flex gap-1.5 border-b border-slate-200/90 bg-slate-50/95 px-4 py-2 backdrop-blur-md sm:static sm:mx-0 sm:mb-1 sm:flex-wrap sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
      >
        {(
          [
            { id: "general" as const, label: "Général", sub: "Liens & tarifs", Icon: MdSettings },
            { id: "media" as const, label: "Images", sub: "Hero & accompagnement", Icon: MdImage },
            { id: "partners" as const, label: "Partenaires", sub: "Logos landing", Icon: MdGroups },
          ] as const
        ).map(({ id, label, sub, Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={activeTab === id}
            id={`gpub-tab-${id}`}
            aria-controls={`gpub-panel-${id}`}
            onClick={() => setActiveTab(id)}
            className={`flex min-h-13 min-w-[min(100%,8.5rem)] shrink-0 flex-col items-start justify-center rounded-2xl border-2 px-3.5 py-2 text-left transition sm:min-w-0 sm:flex-row sm:items-center sm:gap-2 sm:px-4 ${
              activeTab === id
                ? "border-orange-500 bg-white text-orange-700 shadow-md shadow-orange-500/10"
                : "border-transparent bg-white/60 text-slate-600 active:bg-white sm:bg-slate-100/80"
            }`}
          >
            <span className="flex items-center gap-2">
              <Icon className="h-5 w-5 shrink-0 opacity-90" aria-hidden />
              <span className="text-sm font-extrabold leading-none">{label}</span>
            </span>
            <span className="mt-0.5 hidden text-[11px] font-medium text-slate-500 sm:mt-0 sm:ml-7 sm:inline sm:text-xs">
              {sub}
            </span>
          </button>
        ))}
      </FsHorizontalScroll>

      <div className="space-y-4 md:space-y-5">
        {activeTab === "general" && (
          <AdminCard padding="p-4 sm:p-5" className="shadow-md shadow-slate-200/50 ring-1 ring-slate-100">
        <h3 className="text-lg font-black text-slate-900 sm:text-xl">Général & tarifs</h3>
        <p className="mt-1 text-sm text-slate-600">
          Bannière hero, réseaux sociaux, liens CTA, prix affichés sur la landing et textes des statistiques témoignages.
        </p>
        <div className="mt-4 rounded-2xl border border-amber-200/80 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
          <strong className="font-bold">Performance :</strong> ne collez pas de images en base64 — uploadez vers Storage. Les grosses Data URL sont ignorées sur la landing.
        </div>
        {hasLegacyData ? (
          <div className="mt-4 flex flex-col gap-3 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm text-red-900 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 leading-relaxed">
              <strong className="font-bold">Anciennes images base64 détectées</strong> (
              {heroSettingIsLegacyDataUrl ? "bannière hero" : null}
              {heroSettingIsLegacyDataUrl && supportMediaIsLegacyDataUrl ? ", " : null}
              {supportMediaIsLegacyDataUrl ? "image accompagnement" : null}). Elles sont ignorées par la landing. Nettoyez puis ré-uploadez.
            </div>
            <button
              type="button"
              onClick={async () => {
                try {
                  if (heroSettingIsLegacyDataUrl) {
                    await adminSetPublicLandingSettings({ hero_banner_image_url: "" });
                    setSetting("hero_banner_image_url", "");
                  }
                  if (supportMediaIsLegacyDataUrl) {
                    await adminSetPublicLandingMediaImage("support_section_image", "");
                  }
                  await Promise.all([
                    qc.invalidateQueries({ queryKey: ["admin-public-landing-settings"] }),
                    qc.invalidateQueries({ queryKey: ["admin-public-landing-media"] }),
                    revalidateLandingCache(),
                  ]);
                  toast.success("Anciennes Data URL supprimées.");
                } catch (e) {
                  toast.error(messageFromUnknownError(e));
                }
              }}
              className="inline-flex min-h-12 w-full shrink-0 items-center justify-center rounded-2xl bg-red-600 px-4 text-sm font-bold text-white sm:w-auto"
            >
              Nettoyer
            </button>
          </div>
        ) : null}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-2">
            <span className={LABEL}>URL bannière hero (image ou vidéo)</span>
            <input
              value={landingSettings.hero_banner_image_url ?? ""}
              onChange={(e) => setSetting("hero_banner_image_url", e.target.value)}
              placeholder="https://..."
              autoComplete="off"
              className={FIELD}
            />
          </label>
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Uploader bannière (image ou vidéo)</span>
            <label className="inline-flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-orange-200 bg-orange-50/40 px-4 text-base font-bold text-orange-900 transition active:scale-[0.99]">
              <MdUpload className="h-5 w-5 shrink-0" aria-hidden />
              {uploadingHero ? "Envoi…" : "Choisir une image ou une vidéo (publie la bannière)"}
              <input
                type="file"
                accept="image/*,video/*"
                className="sr-only"
                disabled={uploadingHero}
                onChange={(e) => void onPickHeroBanner(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
          <div className="flex flex-col gap-2">
            <span className={LABEL}>Type de bannière</span>
            <div className="inline-flex rounded-2xl border border-slate-200 bg-slate-100 p-1">
              {(
                [
                  { id: "image", label: "Image", Icon: MdImage },
                  { id: "video", label: "Vidéo", Icon: MdVideocam },
                ] as const
              ).map(({ id, label, Icon }) => {
                const active = (landingSettings.hero_banner_media_type ?? "image") === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setSetting("hero_banner_media_type", id)}
                    className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-bold transition ${
                      active ? "bg-white text-orange-700 shadow-sm" : "text-slate-500"
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden />
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-slate-500">
              Réglé automatiquement à l&apos;upload. Ajustez si vous collez une URL manuellement.
            </p>
          </div>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Lien démo section accompagnement</span>
            <input
              value={landingSettings.support_demo_url ?? ""}
              onChange={(e) => setSetting("support_demo_url", e.target.value)}
              placeholder="/help"
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Lien WhatsApp section accompagnement</span>
            <input
              value={landingSettings.support_whatsapp_url ?? ""}
              onChange={(e) => setSetting("support_whatsapp_url", e.target.value)}
              placeholder="https://wa.me/..."
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>WhatsApp footer</span>
            <input
              value={landingSettings.footer_whatsapp_url ?? ""}
              onChange={(e) => setSetting("footer_whatsapp_url", e.target.value)}
              placeholder="https://wa.me/..."
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Facebook footer</span>
            <input
              value={landingSettings.footer_facebook_url ?? ""}
              onChange={(e) => setSetting("footer_facebook_url", e.target.value)}
              placeholder="https://facebook.com/..."
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>YouTube footer</span>
            <input
              value={landingSettings.footer_youtube_url ?? ""}
              onChange={(e) => setSetting("footer_youtube_url", e.target.value)}
              placeholder="https://youtube.com/..."
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>TikTok footer</span>
            <input
              value={landingSettings.footer_tiktok_url ?? ""}
              onChange={(e) => setSetting("footer_tiktok_url", e.target.value)}
              placeholder="https://tiktok.com/@..."
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>LinkedIn footer</span>
            <input
              value={landingSettings.footer_linkedin_url ?? ""}
              onChange={(e) => setSetting("footer_linkedin_url", e.target.value)}
              placeholder="https://linkedin.com/company/..."
              className={FIELD}
            />
          </label>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <p className={`mb-3 ${LABEL}`}>Bannière actuelle</p>
            {landingSettings.hero_banner_image_url ? (
              heroBannerIsVideo ? (
                <video
                  src={landingSettings.hero_banner_image_url}
                  className="max-h-56 w-full rounded-xl object-cover sm:max-h-64"
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={landingSettings.hero_banner_image_url}
                  alt="Bannière actuelle"
                  className="max-h-56 w-full rounded-xl object-cover sm:max-h-64"
                />
              )
            ) : (
              <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm text-slate-500">
                Aucune bannière
              </div>
            )}
          </article>
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3 sm:p-4">
            <p className={`mb-3 ${LABEL}`}>Dernier fichier choisi (aperçu local)</p>
            {heroBannerImageDataUrl ? (
              heroBannerIsVideo ? (
                <video
                  src={heroBannerImageDataUrl}
                  className="max-h-56 w-full rounded-xl object-cover sm:max-h-64"
                  autoPlay
                  muted
                  loop
                  playsInline
                  controls
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={heroBannerImageDataUrl}
                  alt="Aperçu bannière"
                  className="max-h-56 w-full rounded-xl object-cover sm:max-h-64"
                />
              )
            ) : (
              <div className="flex min-h-48 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center text-sm text-slate-500">
                L&apos;upload remplace tout de suite la bannière en ligne
              </div>
            )}
          </article>
        </div>
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Essai (jours)</span>
            <input
              value={landingSettings.pricing_trial_days ?? ""}
              onChange={(e) => setSetting("pricing_trial_days", e.target.value.replace(/[^\d]/g, ""))}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Prix mensuel (FCFA)</span>
            <input
              value={landingSettings.pricing_monthly_amount ?? ""}
              onChange={(e) => setSetting("pricing_monthly_amount", e.target.value.replace(/[^\d]/g, ""))}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Prix annuel (FCFA)</span>
            <input
              value={landingSettings.pricing_yearly_amount ?? ""}
              onChange={(e) => setSetting("pricing_yearly_amount", e.target.value.replace(/[^\d]/g, ""))}
              className={FIELD}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className={LABEL}>Économie annuelle (FCFA)</span>
            <input
              value={landingSettings.pricing_yearly_savings ?? ""}
              onChange={(e) => setSetting("pricing_yearly_savings", e.target.value.replace(/[^\d]/g, ""))}
              className={FIELD}
            />
          </label>
        </div>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
          <p className="text-sm font-bold text-slate-800">Statistiques — section Témoignages</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Stat 1 — Valeur</span>
              <input
                value={landingSettings.testimonials_stat_1_value ?? ""}
                onChange={(e) => setSetting("testimonials_stat_1_value", e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Stat 1 — Libellé</span>
              <input
                value={landingSettings.testimonials_stat_1_label ?? ""}
                onChange={(e) => setSetting("testimonials_stat_1_label", e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Stat 2 — Valeur</span>
              <input
                value={landingSettings.testimonials_stat_2_value ?? ""}
                onChange={(e) => setSetting("testimonials_stat_2_value", e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Stat 2 — Libellé</span>
              <input
                value={landingSettings.testimonials_stat_2_label ?? ""}
                onChange={(e) => setSetting("testimonials_stat_2_label", e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Stat 3 — Valeur</span>
              <input
                value={landingSettings.testimonials_stat_3_value ?? ""}
                onChange={(e) => setSetting("testimonials_stat_3_value", e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Stat 3 — Libellé</span>
              <input
                value={landingSettings.testimonials_stat_3_label ?? ""}
                onChange={(e) => setSetting("testimonials_stat_3_label", e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Stat 4 — Valeur</span>
              <input
                value={landingSettings.testimonials_stat_4_value ?? ""}
                onChange={(e) => setSetting("testimonials_stat_4_value", e.target.value)}
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Stat 4 — Libellé</span>
              <input
                value={landingSettings.testimonials_stat_4_label ?? ""}
                onChange={(e) => setSetting("testimonials_stat_4_label", e.target.value)}
                className={FIELD}
              />
            </label>
          </div>
          <div className="mt-5 border-t border-slate-200 pt-5">
            <p className="text-sm font-bold text-slate-800">Texte sous les statistiques</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="flex flex-col gap-2">
                <span className={LABEL}>CTA — Titre</span>
                <input
                  value={landingSettings.testimonials_cta_title ?? ""}
                  onChange={(e) => setSetting("testimonials_cta_title", e.target.value)}
                  className={FIELD}
                />
              </label>
              <label className="flex flex-col gap-2">
                <span className={LABEL}>CTA — Sous-titre</span>
                <input
                  value={landingSettings.testimonials_cta_subtitle ?? ""}
                  onChange={(e) => setSetting("testimonials_cta_subtitle", e.target.value)}
                  className={FIELD}
                />
              </label>
            </div>
          </div>
        </div>
        <div className="mt-6 hidden sm:block">
          <button
            type="button"
            disabled={settingsMut.isPending || !settingsDirty}
            onClick={() => settingsMut.mutate(landingSettings)}
            className={BTN_PRIMARY}
          >
            <MdCheck className="h-5 w-5 shrink-0" aria-hidden />
            Enregistrer les paramètres
          </button>
        </div>
      </AdminCard>
        )}

        {activeTab === "media" && (
      <AdminCard padding="p-4 sm:p-5" className="shadow-md shadow-slate-200/50 ring-1 ring-slate-100">
        <h3 className="text-lg font-black text-slate-900 sm:text-xl">Images landing</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Photo de la section <strong className="font-bold text-slate-800">« Un expert vous accompagne »</strong>.
          L&apos;upload est <strong className="text-orange-600">publié immédiatement</strong> sur la landing.
        </p>
        <label className="mt-5 inline-flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50/50 px-4 text-base font-bold text-orange-800 transition active:scale-[0.99]">
          <MdUpload className="h-6 w-6 shrink-0" aria-hidden />
          {uploadingSupport ? "Envoi en cours…" : "Choisir une image (publiée tout de suite)"}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            disabled={uploadingSupport}
            onChange={(e) => void onPickSupportImage(e.target.files?.[0] ?? null)}
          />
        </label>
        <p className="mt-3 text-center text-xs text-slate-500 sm:text-left">
          PNG, JPG ou WebP — idéalement paysage, bonne lumière.
        </p>
        <div className="mt-5">
          <article className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
            <p className={`mb-3 ${LABEL}`}>Image actuelle sur la landing</p>
            {supportMedia?.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={supportMedia.imageUrl} alt="Accompagnement actuel" className="max-h-80 w-full rounded-xl object-cover" />
            ) : (
              <div className="flex min-h-52 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white px-4 text-center text-sm text-slate-500">
                Aucune image — uploadez ci-dessus
              </div>
            )}
          </article>
        </div>
      </AdminCard>
        )}

        {activeTab === "partners" && (
        <>
      <AdminCard padding="p-4 sm:p-5" className="shadow-md shadow-slate-200/50 ring-1 ring-slate-100">
        <h3 className="text-lg font-black text-slate-900 sm:text-xl">Nouveau partenaire</h3>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">
          Logo hébergé sur Storage (<code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">landing-images</code>
          ). PNG transparent recommandé.
        </p>
        <div className="mt-5 flex flex-col gap-4">
          <article className="flex min-h-36 items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 sm:min-h-40">
            {logoDataUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={logoDataUrl}
                alt="Aperçu logo"
                className="max-h-32 w-full object-contain sm:max-h-36"
              />
            ) : (
              <p className="text-center text-sm text-slate-400">
                Aperçu du logo après upload
              </p>
            )}
          </article>
          <div className="grid gap-3">
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Nom du partenaire</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex. Orange Burkina"
                autoComplete="organization"
                className={FIELD}
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className={LABEL}>Ordre d&apos;affichage</span>
              <input
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value.replace(/[^\d]/g, ""))}
                placeholder="0, 10, 20…"
                title="Plus petit = affiché en premier"
                inputMode="numeric"
                className={FIELD}
              />
            </label>
            <label className="inline-flex min-h-14 w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-slate-200 bg-white px-4 text-base font-bold text-slate-800 transition active:scale-[0.99]">
              <MdUpload className="h-6 w-6 shrink-0 text-orange-600" aria-hidden />
              {uploadingLogo ? "Envoi…" : logoDataUrl ? "Changer le logo" : "Choisir le logo"}
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
              className={BTN_PRIMARY}
            >
              <MdAdd className="h-5 w-5 shrink-0" aria-hidden />
              {addMut.isPending ? "Ajout en cours…" : "Ajouter le partenaire"}
            </button>
          </div>
        </div>
        <p className="mt-4 text-center text-xs text-slate-500 sm:text-left">
          {logoDataUrl
            ? "Prêt — touchez « Ajouter le partenaire »."
            : "Formats : PNG, JPG, WebP — hauteur idéale 120–200 px."}
        </p>
      </AdminCard>

      <AdminCard padding="p-4 sm:p-5" className="shadow-md shadow-slate-200/50 ring-1 ring-slate-100">
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h3 className="text-lg font-black text-slate-900 sm:text-xl">Partenaires sur la landing</h3>
            <p className="mt-1 text-sm text-slate-600">
              Ordre croissant sur la page. Masquer sans supprimer, réorganiser avec les flèches.
            </p>
          </div>
          {q.data && q.data.length > 0 ? (
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />{" "}
                {q.data.filter((x) => x.isActive).length} actif·s
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />{" "}
                {q.data.filter((x) => !x.isActive).length} masqué·s
              </span>
            </div>
          ) : null}
        </div>
        {q.isLoading ? (
          <p className="mt-3 text-sm text-slate-500">Chargement…</p>
        ) : q.isError ? (
          <p className="mt-3 text-sm font-semibold text-red-600">
            {(q.error as Error)?.message ?? "Erreur de chargement"}
          </p>
        ) : (q.data ?? []).length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <p className="text-sm font-semibold text-slate-700">Aucun partenaire pour le moment.</p>
            <p className="mt-1 text-xs text-slate-500">
              Ajoutez votre premier partenaire dans le formulaire ci-dessus —
              il apparaîtra immédiatement sur la landing.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {(q.data ?? []).map((p, idx, arr) => (
              <PartnerCard
                key={p.id}
                partner={p}
                index={idx}
                total={arr.length}
                onUpdate={(patch) => updateMut.mutate({ id: p.id, patch })}
                onReorder={(direction) => {
                  const targetIdx = direction === "up" ? idx - 1 : idx + 1;
                  if (targetIdx < 0 || targetIdx >= arr.length) return;
                  const newOrder = [...arr];
                  [newOrder[idx], newOrder[targetIdx]] = [newOrder[targetIdx], newOrder[idx]];
                  void renumberPartners(newOrder);
                }}
                onDelete={() => {
                  if (window.confirm(`Supprimer définitivement "${p.name}" ?`)) {
                    delMut.mutate(p.id);
                  }
                }}
                onReplaceLogo={async (file) => {
                  try {
                    const url = await adminUploadLandingImage(file, "partners");
                    updateMut.mutate({ id: p.id, patch: { logoUrl: url } });
                    toast.success("Logo remplacé.");
                  } catch (e) {
                    toast.error(messageFromUnknownError(e));
                  }
                }}
                disabled={delMut.isPending || updateMut.isPending}
              />
            ))}
          </div>
        )}

        {/* Aperçu live de la landing : marquee horizontale identique à la
         * landing publique. Permet à l'admin de voir le rendu réel sans
         * quitter la page de gestion. */}
        {q.data && q.data.filter((x) => x.isActive).length > 0 ? (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-[#eef1d7] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-700">
              Aperçu landing — section &quot;Nos partenaires&quot;
            </p>
            <div className="relative mt-3 overflow-hidden">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-12 bg-linear-to-r from-[#eef1d7] to-transparent" />
              <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-12 bg-linear-to-l from-[#eef1d7] to-transparent" />
              <div className="partners-marquee-track flex w-max items-center gap-8">
                {[...q.data.filter((x) => x.isActive), ...q.data.filter((x) => x.isActive)].map(
                  (p, idx) => (
                    <div
                      key={`preview-${p.id}-${idx}`}
                      className="flex min-w-[170px] flex-col items-center gap-2"
                    >
                      <div className="flex h-16 w-full items-center justify-center">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={p.logoUrl}
                          alt={p.name}
                          className="h-12 w-auto max-w-[160px] object-contain"
                        />
                      </div>
                      <p className="max-w-[95%] truncate text-center text-xs font-semibold text-slate-600">
                        {p.name}
                      </p>
                    </div>
                  ),
                )}
              </div>
            </div>
          </div>
        ) : null}
      </AdminCard>
        </>
        )}
      </div>

      {settingsDirty && activeTab === "general" ? (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-12px_40px_-16px_rgba(15,23,42,0.18)] backdrop-blur-md supports-backdrop-filter:bg-white/85 sm:hidden">
          <button
            type="button"
            disabled={settingsMut.isPending}
            onClick={() => settingsMut.mutate(landingSettings)}
            className={`${BTN_PRIMARY} w-full shadow-orange-600/25`}
          >
            <MdCheck className="h-5 w-5 shrink-0" aria-hidden />
            {settingsMut.isPending ? "Enregistrement…" : "Enregistrer les réglages"}
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Carte de gestion d'un partenaire — édition inline, toggle actif,
 * réordonnancement et remplacement du logo. */
function PartnerCard({
  partner,
  index,
  total,
  onUpdate,
  onReorder,
  onDelete,
  onReplaceLogo,
  disabled,
}: {
  partner: AdminPublicPartner;
  index: number;
  total: number;
  onUpdate: (patch: { name?: string; sortOrder?: number; isActive?: boolean }) => void;
  onReorder: (direction: "up" | "down") => void;
  onDelete: () => void;
  onReplaceLogo: (file: File) => void | Promise<void>;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(partner.name);
  const [draftSort, setDraftSort] = useState(String(partner.sortOrder));
  const [replacing, setReplacing] = useState(false);

  const isFirst = index === 0;
  const isLast = index === total - 1;

  function startEdit() {
    setDraftName(partner.name);
    setDraftSort(String(partner.sortOrder));
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
  }

  function saveEdit() {
    const patch: { name?: string; sortOrder?: number } = {};
    const trimmedName = draftName.trim();
    if (trimmedName !== partner.name) patch.name = trimmedName;
    const newSort = Math.max(0, Math.floor(Number(draftSort || "0")));
    if (newSort !== partner.sortOrder) patch.sortOrder = newSort;
    if (Object.keys(patch).length === 0) {
      setEditing(false);
      return;
    }
    onUpdate(patch);
    setEditing(false);
  }

  return (
    <article
      className={`rounded-2xl border p-4 transition ${
        partner.isActive
          ? "border-slate-200 bg-white shadow-sm"
          : "border-slate-200 bg-slate-50 opacity-80"
      }`}
    >
      <div className="relative flex min-h-22 items-center justify-center rounded-xl bg-slate-50 px-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={partner.logoUrl}
          alt={partner.name}
          className="h-12 w-auto max-w-[180px] object-contain"
          onError={(e) => {
            e.currentTarget.style.opacity = "0.3";
          }}
        />
        <span
          className={`absolute right-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
            partner.isActive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-slate-200 text-slate-600"
          }`}
        >
          <span
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              partner.isActive ? "bg-emerald-500" : "bg-slate-400"
            }`}
          />
          {partner.isActive ? "Actif" : "Masqué"}
        </span>
      </div>

      {editing ? (
        <div className="mt-4 space-y-3">
          <input
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            className={FIELD}
            placeholder="Nom"
          />
          <input
            value={draftSort}
            onChange={(e) => setDraftSort(e.target.value.replace(/[^\d]/g, ""))}
            className={FIELD}
            placeholder="Ordre"
            inputMode="numeric"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={saveEdit}
              disabled={disabled || draftName.trim().length < 2}
              className={`${BTN_PRIMARY} flex-1`}
            >
              <MdCheck className="h-5 w-5" aria-hidden /> Enregistrer
            </button>
            <button
              type="button"
              onClick={cancelEdit}
              className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border-2 border-slate-200 bg-white text-slate-600 active:scale-95"
              title="Annuler"
              aria-label="Annuler"
            >
              <MdClose className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="mt-3 min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{partner.name}</p>
            <p className="text-sm text-slate-500">Ordre : {partner.sortOrder}</p>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onReorder("up")}
              disabled={disabled || isFirst}
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl border-2 border-slate-200 bg-white text-slate-800 disabled:opacity-35 active:scale-95"
              title="Monter"
              aria-label="Monter dans l'ordre"
            >
              <MdArrowUpward className="h-5 w-5" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => onReorder("down")}
              disabled={disabled || isLast}
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl border-2 border-slate-200 bg-white text-slate-800 disabled:opacity-35 active:scale-95"
              title="Descendre"
              aria-label="Descendre dans l'ordre"
            >
              <MdArrowDownward className="h-5 w-5" aria-hidden />
            </button>

            <button
              type="button"
              onClick={() => onUpdate({ isActive: !partner.isActive })}
              disabled={disabled}
              className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border-2 px-3 text-sm font-bold disabled:opacity-50 active:scale-[0.98] ${
                partner.isActive
                  ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
              title={partner.isActive ? "Masquer sur la landing" : "Afficher sur la landing"}
            >
              {partner.isActive ? (
                <>
                  <MdToggleOn className="h-6 w-6 shrink-0" aria-hidden />{" "}
                  <span className="hidden sm:inline">Visible</span>
                </>
              ) : (
                <>
                  <MdToggleOff className="h-6 w-6 shrink-0" aria-hidden />{" "}
                  <span className="hidden sm:inline">Masqué</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={startEdit}
              disabled={disabled}
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-xl border-2 border-slate-200 bg-white text-slate-800 active:scale-95 disabled:opacity-50"
              title="Éditer"
              aria-label={`Éditer ${partner.name}`}
            >
              <MdEdit className="h-5 w-5" aria-hidden />
            </button>

            <label
              className={`inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border-2 px-3 text-sm font-bold active:scale-[0.98] ${
                replacing
                  ? "border-slate-200 bg-slate-100 text-slate-500"
                  : "border-slate-200 bg-white text-slate-800"
              }`}
              title="Remplacer le logo"
            >
              <MdUpload className="h-5 w-5 shrink-0" aria-hidden />
              {replacing ? "…" : "Logo"}
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                disabled={replacing || disabled}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setReplacing(true);
                  try {
                    await onReplaceLogo(file);
                  } finally {
                    setReplacing(false);
                    e.target.value = "";
                  }
                }}
              />
            </label>

            <button
              type="button"
              onClick={onDelete}
              disabled={disabled}
              className="ml-auto inline-flex h-11 min-w-11 items-center justify-center rounded-xl border-2 border-red-200 bg-white text-red-600 active:scale-95 disabled:opacity-50"
              title="Supprimer"
              aria-label={`Supprimer ${partner.name}`}
            >
              <MdDeleteOutline className="h-5 w-5" aria-hidden />
            </button>
          </div>
        </>
      )}
    </article>
  );
}
