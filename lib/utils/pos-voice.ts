/**
 * Annonce **parlée** de la caisse à deux : « Vente de douze mille cinq cents francs CFA
 * à encaisser. »
 *
 * Pourquoi parler alors qu'un bip existe déjà : le bip dit « quelque chose est arrivé »,
 * il ne dit pas *combien*. Le caissier qui rend la monnaie doit lever la tête et lire
 * l'écran pour le savoir. La phrase lui donne le montant sans qu'il quitte son client des
 * yeux — le bip reste devant elle pour attirer l'attention, la voix suit.
 *
 * Voix du navigateur (`speechSynthesis`) : aucun fichier audio à héberger, aucun service
 * payant, et la qualité suit celle de l'appareil — elle s'améliore toute seule avec les
 * mises à jour du téléphone.
 *
 * **La voix n'est jamais garantie** : sur Android, le français dépend d'un moteur de
 * synthèse et d'un pack de langue installés sur l'appareil ; l'iPhone exige en plus un
 * geste de l'utilisateur avant d'autoriser le son. Toute défaillance est donc silencieuse
 * ici — l'appelant a déjà fait son bip, qui reste le signal fiable.
 */

/** Voix proposée au choix du caissier. On ne sort pas l'objet natif du module : React ne
 *  doit pas garder en état des objets du navigateur qui se recréent à chaque chargement. */
export type VoiceOption = {
  /** Identifiant stable, mémorisé sur l'appareil. */
  uri: string;
  /** Nom court, débarrassé du « - French (France) » que collent les navigateurs. */
  label: string;
  /** Voix de génération récente (neurale / Google / Siri) : nettement plus naturelle. */
  premium: boolean;
};

const VOICE_PREF_KEY = "fs_voice_uri";

let unsupported = false;
let primed = false;

function synth(): SpeechSynthesis | null {
  if (unsupported || typeof window === "undefined") return null;
  const s = window.speechSynthesis;
  if (!s || typeof window.SpeechSynthesisUtterance === "undefined") {
    unsupported = true;
    return null;
  }
  return s;
}

/**
 * Qualité présumée d'une voix, d'après son nom.
 *
 * Il n'existe aucune API pour demander « la meilleure voix » : le navigateur renvoie une
 * liste à plat où la voix robotique d'origine côtoie une voix neurale. Le nom est le seul
 * indice, et il est stable chez tous les éditeurs — d'où ce classement, écrit une fois
 * ici plutôt que laissé au hasard du premier élément de la liste.
 *
 * Le classement prime sur « voix locale ou voix réseau » : sur un PC, la meilleure voix
 * française (« Google français », « Microsoft Denise Online (Natural) ») passe justement
 * par le réseau. La page interroge déjà le serveur toutes les 4 secondes ; et si la voix
 * réseau échoue, {@link speakFr} rebascule sur une voix locale.
 */
function voiceScore(v: SpeechSynthesisVoice): number {
  const name = `${v.name} ${v.voiceURI}`.toLowerCase();
  let score = 0;
  // Voix neurales Microsoft (Edge) : ce qui se fait de mieux gratuitement aujourd'hui.
  if (name.includes("natural") || name.includes("neural")) score += 100;
  // Siri (iPhone récent) et voix Apple « améliorées » à télécharger dans Accessibilité.
  if (name.includes("siri")) score += 90;
  if (name.includes("enhanced") || name.includes("premium")) score += 70;
  // Moteur Google (Android, Chrome) : très correct, et le cas le plus fréquent ici.
  if (name.includes("google")) score += 60;
  // Voix « compactes » d'Apple et eSpeak : intelligibles mais métalliques. En dernier.
  if (name.includes("compact")) score -= 60;
  if (name.includes("espeak") || name.includes("eloquence")) score -= 80;
  // Français de France : l'accent attendu au Burkina, en Guinée, au Mali. Le français
  // canadien reste proposé, mais après.
  if (/^fr[-_]fr/i.test(v.lang)) score += 15;
  if (v.default) score += 5;
  return score;
}

/** Nom lisible : « Microsoft Denise Online (Natural) - French (France) » → « Denise ». */
function shortLabel(v: SpeechSynthesisVoice): string {
  let s = v.name
    .replace(/\s*-\s*(French|Français)\s*\([^)]*\)\s*$/i, "")
    .replace(/^Microsoft\s+/i, "")
    .replace(/\s*Online\s*/i, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^fr[-_]ca/i.test(v.lang)) s += " (Canada)";
  return s || v.name;
}

/** Voix françaises installées, la meilleure d'abord. */
function frenchVoices(s: SpeechSynthesis): SpeechSynthesisVoice[] {
  let all: SpeechSynthesisVoice[] = [];
  try {
    all = s.getVoices();
  } catch {
    return [];
  }
  return all
    .filter((v) => /^fr/i.test(v.lang))
    .sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name, "fr"));
}

function savedVoiceUri(): string | null {
  try {
    return localStorage.getItem(VOICE_PREF_KEY);
  } catch {
    return null;
  }
}

/** Voix retenue : celle choisie par le caissier si elle est toujours là, la mieux classée
 *  sinon. Une voix disparue (mise à jour du système) ne doit pas rendre la caisse muette. */
function chosenVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  const list = frenchVoices(s);
  if (list.length === 0) return null;
  const saved = savedVoiceUri();
  if (saved) {
    const hit = list.find((v) => v.voiceURI === saved || v.name === saved);
    if (hit) return hit;
  }
  return list[0]!;
}

/**
 * Chrome renseigne la liste des voix de façon asynchrone : au premier appel après le
 * chargement, `getVoices()` renvoie un tableau vide et l'annonce serait perdue. On attend
 * l'événement, avec un plafond de temps pour ne pas garder une phrase en suspens.
 */
function whenVoicesReady(s: SpeechSynthesis, run: () => void): void {
  let done = false;
  const fire = () => {
    if (done) return;
    done = true;
    try {
      s.removeEventListener("voiceschanged", fire);
    } catch {
      /* implémentation sans EventTarget : sans conséquence */
    }
    run();
  };
  try {
    s.addEventListener("voiceschanged", fire, { once: true });
  } catch {
    /* pas d'événement : le délai ci-dessous suffit */
  }
  window.setTimeout(fire, 700);
}

/**
 * Liste des voix françaises, pour le sélecteur de la page Encaissement.
 *
 * Rappelle le callback quand le navigateur complète sa liste (Chrome la charge après le
 * premier rendu, Android l'enrichit quand un pack de langue arrive). Retourne le
 * nettoyage attendu par `useEffect`.
 */
export function subscribeVoices(cb: (voices: VoiceOption[]) => void): () => void {
  const s = synth();
  if (!s) {
    cb([]);
    return () => {};
  }
  const publish = () => {
    cb(
      frenchVoices(s).map((v) => ({
        uri: v.voiceURI || v.name,
        label: shortLabel(v),
        premium: voiceScore(v) >= 60,
      })),
    );
  };
  publish();
  try {
    s.addEventListener("voiceschanged", publish);
  } catch {
    /* pas d'événement : la liste initiale fera l'affaire */
  }
  return () => {
    try {
      s.removeEventListener("voiceschanged", publish);
    } catch {
      /* rien à retirer */
    }
  };
}

/** Voix choisie sur CET appareil (chaque poste a ses propres voix installées). */
export function getVoiceUri(): string {
  return savedVoiceUri() ?? "";
}

export function setVoiceUri(uri: string): void {
  try {
    if (uri) localStorage.setItem(VOICE_PREF_KEY, uri);
    else localStorage.removeItem(VOICE_PREF_KEY);
  } catch {
    /* préférence non persistée : la meilleure voix détectée sera reprise */
  }
}

function utter(text: string, voice: SpeechSynthesisVoice): SpeechSynthesisUtterance {
  const u = new window.SpeechSynthesisUtterance(text);
  u.voice = voice;
  u.lang = voice.lang;
  /* Débit à peine sous la normale et hauteur naturelle : une annonce de caisse doit être
     comprise du premier coup, à travers le bruit et sans que le caissier la fasse
     répéter. Accélérer une voix de synthèse est ce qui la fait sonner « robot ». */
  u.rate = 0.97;
  u.pitch = 1;
  u.volume = 1;
  return u;
}

/**
 * Dit une phrase courte en français. Sans effet si l'appareil n'a pas de voix française.
 *
 * Une annonce en cours est coupée : quand deux bons tombent coup sur coup, le caissier a
 * besoin du montant du dernier, pas d'une file de phrases qui se répondent.
 */
export function speakFr(text: string): void {
  const s = synth();
  if (!s) return;
  const say = () => {
    const voice = chosenVoice(s);
    if (!voice) return;
    try {
      s.cancel();
      s.resume(); // iOS met la synthèse en pause dès que la page passe en arrière-plan
      const u = utter(text, voice);
      /* Repli : les meilleures voix passent souvent par le réseau. Si l'une d'elles
         échoue (connexion coupée au mauvais moment), on redit la phrase avec une voix
         installée sur l'appareil plutôt que de laisser le caissier sans montant. */
      u.onerror = () => {
        const local = frenchVoices(s).find((v) => v.localService && v !== voice);
        if (!local) return;
        try {
          s.speak(utter(text, local));
        } catch {
          /* plus rien à tenter : le bip a déjà annoncé le bon */
        }
      };
      s.speak(u);
    } catch {
      /* voix indisponible : le bip a déjà annoncé le bon */
    }
  };
  let ready = false;
  try {
    ready = s.getVoices().length > 0;
  } catch {
    /* traité comme « pas encore prêt » */
  }
  if (!ready) {
    whenVoicesReady(s, say);
    return;
  }
  say();
}

/**
 * Débloque la voix. **À appeler depuis un geste de l'utilisateur** (clic, touche) : les
 * navigateurs — l'iPhone surtout — refusent de parler avant. Sans cette amorce, la
 * première annonce, déclenchée par l'arrivée d'un bon et non par un clic, serait muette.
 *
 * L'énoncé est vide et à volume nul : il ne sert qu'à obtenir l'autorisation.
 */
export function primeVoice(): void {
  if (primed) return;
  const s = synth();
  if (!s) return;
  primed = true;
  try {
    s.resume();
    const u = new window.SpeechSynthesisUtterance(" ");
    u.volume = 0;
    const v = chosenVoice(s);
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    }
    s.speak(u);
  } catch {
    primed = false; // amorce ratée : on retentera au geste suivant
  }
}

/**
 * Amorce la voix au tout premier geste de l'utilisateur sur la page, quel qu'il soit.
 *
 * Le son est actif par défaut : on ne peut pas compter sur un clic du caissier sur le
 * bouton « Son » pour débloquer la parole. Retourne le nettoyage attendu par `useEffect`.
 */
export function armVoicePriming(): () => void {
  if (typeof window === "undefined") return () => {};
  const onGesture = () => primeVoice();
  window.addEventListener("pointerdown", onGesture, { once: true, passive: true });
  window.addEventListener("keydown", onGesture, { once: true, passive: true });
  return () => {
    window.removeEventListener("pointerdown", onGesture);
    window.removeEventListener("keydown", onGesture);
  };
}
