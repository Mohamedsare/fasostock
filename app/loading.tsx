import { LoadingExperience } from "@/components/loading/loading-experience";

export default function RootLoading() {
  return (
    <LoadingExperience
      variant="fullscreen"
      message="Chargement de FasoStock…"
      submessage="Préparation de l'application. Merci de patienter quelques instants."
    />
  );
}
