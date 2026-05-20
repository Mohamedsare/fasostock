import { LoadingExperience } from "@/components/loading/loading-experience";

/** Transition entre pages de l'espace connecté (shell déjà visible). */
export default function AppLoading() {
  return (
    <LoadingExperience
      variant="embedded"
      message="Chargement de la page…"
      submessage="Récupération des données de votre commerce."
      showTips
    />
  );
}
