/**
 * Annonce **parlée** de la caisse à deux : « Vente de douze mille cinq cents francs CFA
 * à encaisser. »
 *
 * Pourquoi parler alors qu'un bip existe déjà : le bip dit « quelque chose est arrivé »,
 * il ne dit pas *combien*. Le caissier qui rend la monnaie doit lever la tête et lire
 * l'écran pour le savoir. La phrase lui donne le montant sans qu'il quitte son client des
 * yeux — le bip reste devant elle pour attirer l'attention, la voix suit.
 *
 * Voix du navigateur (`speechSynthesis`) : aucun fichier audio, aucune requête réseau,
 * donc utilisable en connexion faible comme le reste de la caisse.
 *
 * **La voix n'est jamais garantie** : sur Android, le français dépend d'un moteur de
 * synthèse et d'un pack de langue installés sur l'appareil ; l'iPhone exige en plus un
 * geste de l'utilisateur avant d'autoriser le son. Toute défaillance est donc silencieuse
 * ici — l'appelant a déjà fait son bip, qui reste le signal fiable.
 */

let unsupported = false;
let cachedVoice: SpeechSynthesisVoice | null = null;
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
 * Voix française installée, ou `null`.
 *
 * On refuse de parler avec une voix d'une autre langue : un moteur anglais lit « Vente de
 * douze mille » de façon incompréhensible, ce qui est pire que le silence (le caissier
 * croirait à une panne). Sans voix française, seul le bip annonce le bon.
 *
 * Préférence à une voix *locale* : les voix « serveur » de Chrome passent par le réseau,
 * donc muettes ou en retard sur une connexion faible.
 */
function pickFrenchVoice(s: SpeechSynthesis): SpeechSynthesisVoice | null {
  if (cachedVoice) return cachedVoice;
  let voices: SpeechSynthesisVoice[] = [];
  try {
    voices = s.getVoices();
  } catch {
    return null;
  }
  const fr = voices.filter((v) => /^fr/i.test(v.lang));
  if (fr.length === 0) return null;
  cachedVoice = fr.find((v) => v.localService) ?? fr[0]!;
  return cachedVoice;
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
 * Dit une phrase courte en français. Sans effet si l'appareil n'a pas de voix française.
 *
 * Une annonce en cours est coupée : quand deux bons tombent coup sur coup, le caissier a
 * besoin du montant du dernier, pas d'une file de phrases qui se répondent.
 */
export function speakFr(text: string): void {
  const s = synth();
  if (!s) return;
  const say = () => {
    const voice = pickFrenchVoice(s);
    if (!voice) return;
    try {
      s.cancel();
      s.resume(); // iOS met la synthèse en pause dès que la page passe en arrière-plan
      const u = new window.SpeechSynthesisUtterance(text);
      u.voice = voice;
      u.lang = voice.lang;
      u.rate = 1.05; // à peine plus vif que la lecture par défaut, qui traîne
      u.volume = 1;
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
    const v = pickFrenchVoice(s);
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
