/**
 * Retour sonore de la caisse (POS) — bip court à l'ajout d'un produit au panier,
 * comme sur une caisse/douchette du commerce.
 *
 * Généré via WebAudio : aucun fichier audio à télécharger, donc pas de latence
 * ni de requête réseau (la caisse doit rester utilisable en connexion faible).
 * Toute erreur (API absente, autoplay bloqué) désactive le son en silence : le
 * bip est un confort, jamais un blocage de la vente.
 *
 * Objectif : être entendu dans une boutique bruyante, haut-parleur de téléphone
 * compris. D'où les choix ci-dessous.
 */

type AudioCtor = typeof AudioContext;

/** Fondamentale du bip. 2,1 kHz = zone de sensibilité maximale de l'oreille
 *  (résonance du conduit auditif), et au-dessus de la coupure des petits
 *  haut-parleurs de téléphone qui écrasent les basses. */
const BEEP_HZ = 2100;
/** Harmonique ajoutée à l'octave : enrichit le timbre, donc le volume perçu. */
const BEEP_OCTAVE_HZ = BEEP_HZ * 2;
/** Durée totale, plateau compris. Un bip tenu s'entend bien mieux qu'un « ping »
 *  percussif, tout en restant plus court que la cadence d'un scan à la douchette. */
const BEEP_SECONDS = 0.14;
/** Crête cumulée des deux oscillateurs, marge gardée avant saturation (< 1). */
const BEEP_PEAK = 0.5;
const BEEP_OCTAVE_PEAK = 0.2;
/** Anti-empilement : deux bips simultanés additionnent leurs amplitudes et
 *  saturent (son sale). En scan rapide, un bip par ajout suffit. */
const MIN_GAP_MS = 70;

let ctx: AudioContext | null = null;
let unsupported = false;
let lastBeepAt = 0;

function audioContext(): AudioContext | null {
  if (unsupported || typeof window === "undefined") return null;
  if (ctx) return ctx;
  const Ctor: AudioCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtor }).webkitAudioContext;
  if (!Ctor) {
    unsupported = true;
    return null;
  }
  try {
    ctx = new Ctor();
    return ctx;
  } catch {
    unsupported = true;
    return null;
  }
}

/** Vibration courte : en boutique bruyante (ou téléphone en silencieux), c'est
 *  souvent le seul retour perçu. Ignorée là où l'API n'existe pas (iOS Safari). */
function buzz(): void {
  try {
    navigator.vibrate?.(35);
  } catch {
    /* pas de vibreur : sans effet */
  }
}

function burst(ac: AudioContext): void {
  try {
    const t0 = ac.currentTime;
    const end = t0 + BEEP_SECONDS;
    const master = ac.createGain();
    // Enveloppe : attaque quasi immédiate, PLATEAU tenu (~65 % de la durée) puis
    // extinction rapide mais non brutale — c'est le plateau qui rend le bip franc.
    master.gain.setValueAtTime(0.0001, t0);
    master.gain.exponentialRampToValueAtTime(1, t0 + 0.006);
    master.gain.setValueAtTime(1, t0 + BEEP_SECONDS * 0.65);
    master.gain.exponentialRampToValueAtTime(0.0001, end);
    master.connect(ac.destination);

    // Chaque voix se débranche à sa fin ; `master` part avec la dernière (sinon
    // les nœuds s'accumulent dans le graphe audio à chaque vente).
    let playing = 0;
    const voice = (type: OscillatorType, hz: number, peak: number) => {
      const osc = ac.createOscillator();
      const g = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(hz, t0);
      g.gain.setValueAtTime(peak, t0);
      osc.connect(g);
      g.connect(master);
      osc.start(t0);
      osc.stop(end + 0.01);
      playing += 1;
      osc.onended = () => {
        osc.disconnect();
        g.disconnect();
        playing -= 1;
        if (playing === 0) master.disconnect();
      };
    };
    // Carré = riche en harmoniques, donc « perce » le bruit ambiant bien mieux
    // qu'une sinusoïde à volume égal. L'octave sinus le rend brillant sans crier.
    voice("square", BEEP_HZ, BEEP_PEAK);
    voice("sine", BEEP_OCTAVE_HZ, BEEP_OCTAVE_PEAK);
  } catch {
    /* son indisponible : on continue la vente sans bruit */
  }
}

/**
 * Bip d'ajout au panier. À appeler depuis un geste utilisateur (clic sur une
 * carte produit, scan douchette) : les navigateurs n'autorisent le son qu'à
 * cette condition, d'où le `resume()` sur un contexte suspendu.
 */
export function playPosAddBeep(): void {
  const now = Date.now();
  if (now - lastBeepAt < MIN_GAP_MS) return;
  lastBeepAt = now;
  buzz();
  const ac = audioContext();
  if (!ac) return;
  // Contexte suspendu (1er bip après chargement) : jouer tout de suite serait
  // programmé pendant la suspension, donc perdu. On attend la reprise.
  if (ac.state === "suspended") {
    void ac
      .resume()
      .then(() => burst(ac))
      .catch(() => {
        /* reprise refusée : pas de son */
      });
    return;
  }
  burst(ac);
}
