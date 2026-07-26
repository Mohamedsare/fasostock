"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdMeetingRoom } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  RentalDialogShell,
  RentalField,
  RentalSubmitButton,
} from "@/components/rental/rental-dialog-shell";
import { saveRentalUnit } from "@/lib/features/rental/api";
import type { RentalProperty, RentalUnit } from "@/lib/features/rental/types";
import { formatCurrency, toNumber } from "@/lib/utils/currency";
import { messageFromUnknownError, toast } from "@/lib/toast";

/**
 * Création / modification d'un lot louable. Un bien « maison simple » n'a qu'un
 * seul lot (« Maison entière ») — c'est la valeur proposée par défaut.
 */
export function RentalUnitDialog({
  property,
  editing,
  onClose,
  onSaved,
}: {
  property: RentalProperty;
  editing: RentalUnit | null;
  onClose: () => void;
  onSaved: (unitId: string, isNew: boolean) => void;
}) {
  const [label, setLabel] = useState("");
  const [baseRent, setBaseRent] = useState("");
  const [baseDeposit, setBaseDeposit] = useState("");
  const [floor, setFloor] = useState("");
  const [rooms, setRooms] = useState("");
  const [bathrooms, setBathrooms] = useState("");
  const [surface, setSurface] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    setLabel(editing?.label ?? "Maison entière");
    setBaseRent(editing ? String(Math.round(editing.baseRent)) : "");
    setBaseDeposit(editing ? String(Math.round(editing.baseDeposit)) : "");
    setFloor(editing?.floor ?? "");
    setRooms(editing?.rooms != null ? String(editing.rooms) : "");
    setBathrooms(editing?.bathrooms != null ? String(editing.bathrooms) : "");
    setSurface(editing?.surfaceM2 != null ? String(editing.surfaceM2) : "");
    setDescription(editing?.description ?? "");
    setIsActive(editing?.isActive ?? true);
  }, [editing]);

  const rent = Math.round(toNumber(baseRent));

  const mut = useMutation({
    mutationFn: () =>
      saveRentalUnit({
        id: editing?.id ?? null,
        propertyId: property.id,
        label: label.trim(),
        baseRent: rent,
        baseDeposit: Math.round(toNumber(baseDeposit)),
        floor: floor.trim() || null,
        rooms: rooms.trim() ? Math.trunc(toNumber(rooms)) : null,
        bathrooms: bathrooms.trim() ? Math.trunc(toNumber(bathrooms)) : null,
        surfaceM2: surface.trim() ? toNumber(surface) : null,
        description: description.trim() || null,
        isActive,
      }),
    onSuccess: (id) => {
      toast.success(editing ? "Lot mis à jour." : "Lot ajouté.");
      onSaved(id, !editing);
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  return (
    <RentalDialogShell
      title={editing ? "Modifier le lot" : "Ajouter un lot"}
      subtitle={property.name}
      icon={<MdMeetingRoom className="h-5 w-5 text-indigo-600" aria-hidden />}
      onClose={onClose}
      busy={mut.isPending}
      footer={
        <RentalSubmitButton
          label={editing ? "Enregistrer" : "Ajouter le lot"}
          disabled={label.trim().length === 0 || rent < 0}
          busy={mut.isPending}
          onClick={() => mut.mutate()}
        />
      }
    >
      <RentalField
        label="Libellé du lot"
        hint="Ex. « Maison entière », « Appartement A1 », « Chambre 3 », « Magasin 2 »"
      >
        <input
          className={fsInputClass()}
          autoFocus
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Appartement A1"
        />
      </RentalField>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RentalField
          label="Loyer de référence (FCFA / mois)"
          hint="Proposé à la création d'un bail — le bail reste modifiable"
        >
          <input
            className={fsInputClass("text-lg font-bold tabular-nums")}
            inputMode="numeric"
            value={baseRent}
            onChange={(e) => setBaseRent(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="50000"
          />
        </RentalField>
        <RentalField label="Caution de référence (FCFA)" hint="Souvent 2 à 3 mois de loyer">
          <input
            className={fsInputClass("tabular-nums")}
            inputMode="numeric"
            value={baseDeposit}
            onChange={(e) => setBaseDeposit(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="100000"
          />
        </RentalField>
      </div>

      {rent > 0 ? (
        <p className="-mt-2 text-[11px] text-neutral-500">
          Soit {formatCurrency(rent * 12)} par an si le lot reste occupé toute l&apos;année.
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <RentalField label="Étage">
          <input
            className={fsInputClass()}
            value={floor}
            onChange={(e) => setFloor(e.target.value)}
            placeholder="RDC"
          />
        </RentalField>
        <RentalField label="Pièces">
          <input
            className={fsInputClass("tabular-nums")}
            inputMode="numeric"
            value={rooms}
            onChange={(e) => setRooms(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="3"
          />
        </RentalField>
        <RentalField label="Douches">
          <input
            className={fsInputClass("tabular-nums")}
            inputMode="numeric"
            value={bathrooms}
            onChange={(e) => setBathrooms(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="1"
          />
        </RentalField>
        <RentalField label="Surface (m²)">
          <input
            className={fsInputClass("tabular-nums")}
            inputMode="decimal"
            value={surface}
            onChange={(e) => setSurface(e.target.value.replace(/[^\d.,]/g, ""))}
            placeholder="45"
          />
        </RentalField>
      </div>

      <RentalField label="Description (optionnel)">
        <textarea
          className={fsInputClass("min-h-16")}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Salon + 2 chambres, cuisine intérieure, compteur individuel…"
        />
      </RentalField>

      <label className="flex items-center gap-2 text-sm text-fs-text">
        <input
          type="checkbox"
          className="h-4 w-4 accent-fs-accent"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Lot disponible à la location
      </label>
    </RentalDialogShell>
  );
}
