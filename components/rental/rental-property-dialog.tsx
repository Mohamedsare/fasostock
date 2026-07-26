"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdHomeWork } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  RentalDialogShell,
  RentalField,
  RentalSubmitButton,
} from "@/components/rental/rental-dialog-shell";
import { saveRentalProperty } from "@/lib/features/rental/api";
import {
  RENTAL_PROPERTY_KINDS,
  RENTAL_PROPERTY_KIND_LABELS,
  type RentalProperty,
  type RentalPropertyKind,
} from "@/lib/features/rental/types";
import { messageFromUnknownError, toast } from "@/lib/toast";

/** Création / modification d'un bien immobilier. */
export function RentalPropertyDialog({
  companyId,
  storeId,
  editing,
  onClose,
  onSaved,
}: {
  companyId: string;
  storeId: string;
  editing: RentalProperty | null;
  onClose: () => void;
  onSaved: (propertyId: string, isNew: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<RentalPropertyKind>("house");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [district, setDistrict] = useState("");
  const [description, setDescription] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    setName(editing?.name ?? "");
    setKind(editing?.kind ?? "house");
    setAddress(editing?.address ?? "");
    setCity(editing?.city ?? "");
    setDistrict(editing?.district ?? "");
    setDescription(editing?.description ?? "");
    setNotes(editing?.notes ?? "");
    setIsActive(editing?.isActive ?? true);
  }, [editing]);

  const mut = useMutation({
    mutationFn: () =>
      saveRentalProperty({
        id: editing?.id ?? null,
        companyId,
        storeId,
        name: name.trim(),
        kind,
        address: address.trim() || null,
        city: city.trim() || null,
        district: district.trim() || null,
        description: description.trim() || null,
        notes: notes.trim() || null,
        isActive,
      }),
    onSuccess: (id) => {
      toast.success(editing ? "Bien mis à jour." : "Bien enregistré.");
      onSaved(id, !editing);
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  return (
    <RentalDialogShell
      title={editing ? "Modifier le bien" : "Nouveau bien"}
      subtitle={editing ? editing.name : "Maison, villa, immeuble, magasin…"}
      icon={<MdHomeWork className="h-5 w-5 text-indigo-600" aria-hidden />}
      onClose={onClose}
      busy={mut.isPending}
      footer={
        <RentalSubmitButton
          label={editing ? "Enregistrer les modifications" : "Créer le bien"}
          disabled={name.trim().length === 0}
          busy={mut.isPending}
          onClick={() => mut.mutate()}
        />
      }
    >
      <RentalField label="Nom du bien" hint="Ex. « Maison Karpala », « Immeuble Zone 1 »">
        <input
          className={fsInputClass()}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Maison Karpala"
        />
      </RentalField>

      <RentalField label="Type de bien">
        <select
          className={fsInputClass()}
          value={kind}
          onChange={(e) => setKind(e.target.value as RentalPropertyKind)}
        >
          {RENTAL_PROPERTY_KINDS.map((k) => (
            <option key={k} value={k}>
              {RENTAL_PROPERTY_KIND_LABELS[k]}
            </option>
          ))}
        </select>
      </RentalField>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RentalField label="Ville">
          <input
            className={fsInputClass()}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Ouagadougou"
          />
        </RentalField>
        <RentalField label="Quartier / secteur">
          <input
            className={fsInputClass()}
            value={district}
            onChange={(e) => setDistrict(e.target.value)}
            placeholder="Karpala, secteur 52"
          />
        </RentalField>
      </div>

      <RentalField label="Adresse" hint="Imprimée sur les quittances remises aux locataires">
        <input
          className={fsInputClass()}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder="Rue 12.34, porte 567"
        />
      </RentalField>

      <RentalField label="Description (optionnel)">
        <textarea
          className={fsInputClass("min-h-20")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Cour commune de 4 chambres, forage, mur clôturé…"
        />
      </RentalField>

      <RentalField label="Notes internes (optionnel)">
        <textarea
          className={fsInputClass("min-h-16")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Titre foncier, contacts du gardien…"
        />
      </RentalField>

      <label className="flex items-center gap-2 text-sm text-fs-text">
        <input
          type="checkbox"
          className="h-4 w-4 accent-fs-accent"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Bien actif (décochez pour archiver sans supprimer l&apos;historique)
      </label>
    </RentalDialogShell>
  );
}
