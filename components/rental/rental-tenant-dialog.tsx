"use client";

import { useEffect, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { MdPersonAdd } from "react-icons/md";
import { fsInputClass } from "@/components/ui/fs-screen-primitives";
import {
  RentalDialogShell,
  RentalField,
  RentalSubmitButton,
} from "@/components/rental/rental-dialog-shell";
import { saveRentalTenant } from "@/lib/features/rental/api";
import type { RentalTenant } from "@/lib/features/rental/types";
import { messageFromUnknownError, toast } from "@/lib/toast";

const ID_TYPES = ["CNIB", "Passeport", "Permis de conduire", "Carte consulaire", "Autre"];

/** Création / modification d'une fiche locataire. */
export function RentalTenantDialog({
  companyId,
  storeId,
  editing,
  onClose,
  onSaved,
}: {
  companyId: string;
  storeId: string;
  editing: RentalTenant | null;
  onClose: () => void;
  onSaved: (tenantId: string, isNew: boolean) => void;
}) {
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [phone2, setPhone2] = useState("");
  const [email, setEmail] = useState("");
  const [idType, setIdType] = useState("CNIB");
  const [idNumber, setIdNumber] = useState("");
  const [profession, setProfession] = useState("");
  const [employer, setEmployer] = useState("");
  const [emergencyName, setEmergencyName] = useState("");
  const [emergencyPhone, setEmergencyPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    setFullName(editing?.fullName ?? "");
    setPhone(editing?.phone ?? "");
    setPhone2(editing?.phone2 ?? "");
    setEmail(editing?.email ?? "");
    setIdType(editing?.idType ?? "CNIB");
    setIdNumber(editing?.idNumber ?? "");
    setProfession(editing?.profession ?? "");
    setEmployer(editing?.employer ?? "");
    setEmergencyName(editing?.emergencyName ?? "");
    setEmergencyPhone(editing?.emergencyPhone ?? "");
    setAddress(editing?.address ?? "");
    setNotes(editing?.notes ?? "");
    setIsActive(editing?.isActive ?? true);
  }, [editing]);

  const mut = useMutation({
    mutationFn: () =>
      saveRentalTenant({
        id: editing?.id ?? null,
        companyId,
        storeId,
        fullName: fullName.trim(),
        phone: phone.trim() || null,
        phone2: phone2.trim() || null,
        email: email.trim() || null,
        idType: idType.trim() || null,
        idNumber: idNumber.trim() || null,
        profession: profession.trim() || null,
        employer: employer.trim() || null,
        emergencyName: emergencyName.trim() || null,
        emergencyPhone: emergencyPhone.trim() || null,
        address: address.trim() || null,
        notes: notes.trim() || null,
        isActive,
      }),
    onSuccess: (id) => {
      toast.success(editing ? "Locataire mis à jour." : "Locataire enregistré.");
      onSaved(id, !editing);
      onClose();
    },
    onError: (e) => toast.error(messageFromUnknownError(e, "Enregistrement impossible.")),
  });

  return (
    <RentalDialogShell
      title={editing ? "Modifier le locataire" : "Nouveau locataire"}
      subtitle={editing?.fullName ?? "Fiche d'identification du locataire"}
      icon={<MdPersonAdd className="h-5 w-5 text-indigo-600" aria-hidden />}
      onClose={onClose}
      busy={mut.isPending}
      footer={
        <RentalSubmitButton
          label={editing ? "Enregistrer les modifications" : "Créer la fiche"}
          disabled={fullName.trim().length === 0}
          busy={mut.isPending}
          onClick={() => mut.mutate()}
        />
      }
    >
      <RentalField label="Nom complet">
        <input
          className={fsInputClass()}
          autoFocus
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Ouédraogo Salif"
        />
      </RentalField>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RentalField label="Téléphone">
          <input
            className={fsInputClass()}
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="70 00 00 00"
          />
        </RentalField>
        <RentalField label="Second téléphone">
          <input
            className={fsInputClass()}
            inputMode="tel"
            value={phone2}
            onChange={(e) => setPhone2(e.target.value)}
          />
        </RentalField>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RentalField label="Type de pièce">
          <select
            className={fsInputClass()}
            value={idType}
            onChange={(e) => setIdType(e.target.value)}
          >
            {ID_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </RentalField>
        <RentalField label="N° de la pièce" hint="Sécurise le dossier en cas de litige">
          <input
            className={fsInputClass()}
            value={idNumber}
            onChange={(e) => setIdNumber(e.target.value)}
            placeholder="B1234567"
          />
        </RentalField>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RentalField label="Profession">
          <input
            className={fsInputClass()}
            value={profession}
            onChange={(e) => setProfession(e.target.value)}
            placeholder="Commerçant"
          />
        </RentalField>
        <RentalField label="Employeur">
          <input
            className={fsInputClass()}
            value={employer}
            onChange={(e) => setEmployer(e.target.value)}
          />
        </RentalField>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RentalField label="Personne à prévenir">
          <input
            className={fsInputClass()}
            value={emergencyName}
            onChange={(e) => setEmergencyName(e.target.value)}
            placeholder="Frère, parent, garant…"
          />
        </RentalField>
        <RentalField label="Téléphone à prévenir">
          <input
            className={fsInputClass()}
            inputMode="tel"
            value={emergencyPhone}
            onChange={(e) => setEmergencyPhone(e.target.value)}
          />
        </RentalField>
      </div>

      <RentalField label="E-mail (optionnel)">
        <input
          className={fsInputClass()}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </RentalField>

      <RentalField label="Adresse précédente / résidence (optionnel)">
        <input
          className={fsInputClass()}
          value={address}
          onChange={(e) => setAddress(e.target.value)}
        />
      </RentalField>

      <RentalField label="Notes internes (optionnel)">
        <textarea
          className={fsInputClass("min-h-16")}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Bon payeur, garant, remarques…"
        />
      </RentalField>

      <label className="flex items-center gap-2 text-sm text-fs-text">
        <input
          type="checkbox"
          className="h-4 w-4 accent-fs-accent"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Fiche active
      </label>
    </RentalDialogShell>
  );
}
