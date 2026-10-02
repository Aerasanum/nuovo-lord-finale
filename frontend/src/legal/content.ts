/**
 * Privacy policy and account-erasure notice, served by `app/legal/*` so the web build gives Play Console a public
 * URL for both (the Console demands a reachable privacy policy, and the User Data policy demands a deletion route
 * a person can follow without installing anything).
 *
 * `PUBLISHER` and `CONTACT_EMAIL` are what the policy names as data controller and contact, so they have to match
 * the developer identity on Play Console and an inbox somebody reads: the erasure notice promises an answer within
 * 30 days. Everything else is written against what the server actually stores, so if the data model changes this
 * text has to change with it.
 *
 * The text exists in Italian and English only. Translating a legal document is not the same job as translating a
 * button, and a bad translation of this one is worse than reading it in English.
 */
export const PUBLISHER = "Empire Lords Dragon";
export const CONTACT_EMAIL = "manueltait@hotmail.it";

export type LegalSection = { title: string; body: string[] };
type LegalDoc = { updated: string; intro: string; sections: LegalSection[] };

export const POLICY_UPDATED = "2026-10-01";

const privacyIt: LegalDoc = {
  updated: POLICY_UPDATED,
  intro: `Questa informativa spiega quali dati raccoglie Empire Lords Dragon, perché, per quanto tempo li conserva e come puoi farli cancellare. Il titolare del trattamento è ${PUBLISHER}, contattabile a ${CONTACT_EMAIL}.`,
  sections: [
    {
      title: "Che cosa raccogliamo",
      body: [
        "Per creare un account: il tuo indirizzo email e un nome visualizzato. Se usi la password, ne conserviamo soltanto un'impronta crittografica (bcrypt): la password in chiaro non viene mai salvata e non possiamo leggerla.",
        "Se accedi con Google: email, nome e immagine del profilo forniti da Google. Non riceviamo né conserviamo la tua password Google.",
        "Mentre giochi: i dati di gioco legati al tuo Casato, cioè insediamenti, risorse, eserciti, marce, alleanze, messaggi di chat e cronaca degli eventi. Sono dati del gioco, ma restano collegati al tuo account finché esiste.",
        "Se acquisti: l'identificativo della transazione, il prodotto e l'esito, comunicati dal canale di pagamento. I dati della carta non passano mai dai nostri server: li tratta Google.",
        "Tecnici: indirizzo IP e orari delle richieste, usati per sicurezza e per limitare gli abusi.",
      ],
    },
    {
      title: "Perché li trattiamo e con quale base giuridica",
      body: [
        "Per erogare il gioco e tenere il tuo account: esecuzione del contratto (art. 6.1.b GDPR).",
        "Per impedire imbrogli, automazioni e accessi non autorizzati: legittimo interesse a mantenere il gioco equo (art. 6.1.f GDPR).",
        "Per gestire acquisti, rimborsi e contestazioni e per tenere le scritture contabili: obbligo legale (art. 6.1.c GDPR).",
      ],
    },
    {
      title: "Con chi li condividiamo",
      body: [
        "Google Play e RevenueCat trattano i pagamenti e ci comunicano l'esito delle transazioni.",
        "Se accedi con Google, l'autenticazione passa dai servizi di Emergent, che ci restituiscono la tua email per riconoscerti.",
        "Il fornitore di hosting che ospita il server e il database.",
        "Non vendiamo i tuoi dati e non li cediamo a inserzionisti.",
      ],
    },
    {
      title: "Per quanto tempo",
      body: [
        "I dati dell'account restano finché tieni l'account. Quando lo elimini, email, nome, immagine e credenziali vengono rimossi subito.",
        "I dati di gioco sopravvivono in forma anonima: il tuo Casato viene sciolto e rinominato, così le battaglie, le cronache e le conversazioni in cui compariva restano leggibili senza più indicare una persona.",
        "Le ricevute d'acquisto vengono conservate anche dopo la cancellazione, perché la legge fiscale lo impone e perché un rimborso può arrivare mesi dopo. Non contengono dati di pagamento e non sono più collegate a te.",
      ],
    },
    {
      title: "I tuoi diritti",
      body: [
        `Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità e opposizione scrivendo a ${CONTACT_EMAIL}.`,
        "La cancellazione puoi eseguirla da solo e immediatamente: Impostazioni, poi «Elimina account». La stessa procedura è descritta alla pagina di eliminazione raggiungibile da questa app anche senza accedere.",
        "Se ritieni che il trattamento violi il GDPR puoi rivolgerti al Garante per la protezione dei dati personali.",
      ],
    },
    {
      title: "Minori",
      body: ["Il gioco non è rivolto a chi ha meno di 13 anni e non raccogliamo consapevolmente i loro dati. Se ci accorgiamo di un account del genere, lo rimuoviamo."],
    },
  ],
};

const privacyEn: LegalDoc = {
  updated: POLICY_UPDATED,
  intro: `This notice explains what Empire Lords Dragon collects, why, how long it is kept and how you can have it erased. The data controller is ${PUBLISHER}, reachable at ${CONTACT_EMAIL}.`,
  sections: [
    {
      title: "What we collect",
      body: [
        "To create an account: your email address and a display name. If you use a password we store only a cryptographic hash of it (bcrypt); the password itself is never saved and we cannot read it.",
        "If you sign in with Google: the email, name and profile picture Google gives us. We never receive or store your Google password.",
        "While you play: the game data attached to your House — settlements, resources, armies, marches, alliances, chat messages and the chronicle of events. It is game data, but it stays linked to your account for as long as the account exists.",
        "If you buy something: the transaction id, the product and the outcome, as reported by the payment channel. Card details never touch our servers; Google handles them.",
        "Technical: your IP address and request timestamps, used for security and to throttle abuse.",
      ],
    },
    {
      title: "Why, and on what legal basis",
      body: [
        "To run the game and keep your account: performance of the contract (GDPR art. 6.1.b).",
        "To stop cheating, automation and unauthorised access: our legitimate interest in keeping the game fair (GDPR art. 6.1.f).",
        "To handle purchases, refunds and chargebacks, and to keep accounting records: legal obligation (GDPR art. 6.1.c).",
      ],
    },
    {
      title: "Who we share it with",
      body: [
        "Google Play and RevenueCat process payments and report the outcome of transactions to us.",
        "If you sign in with Google, authentication goes through Emergent's services, which return your email so we can recognise you.",
        "The hosting provider that runs the server and the database.",
        "We do not sell your data and we do not pass it to advertisers.",
      ],
    },
    {
      title: "How long we keep it",
      body: [
        "Account data lasts as long as the account. When you delete it, the email, name, picture and credentials are removed immediately.",
        "Game data survives anonymously: your House is dissolved and renamed, so the battles, chronicles and conversations it appears in stay readable without pointing at a person.",
        "Purchase receipts are kept after deletion, because tax law requires it and because a refund can arrive months later. They hold no payment details and are no longer linked to you.",
      ],
    },
    {
      title: "Your rights",
      body: [
        `You can request access, rectification, erasure, restriction, portability and objection by writing to ${CONTACT_EMAIL}.`,
        "You can carry out the erasure yourself, immediately: Settings, then “Delete account”. The same procedure is described on the deletion page, which this app serves without signing in.",
        "If you believe the processing breaches the GDPR you may lodge a complaint with your national supervisory authority.",
      ],
    },
    {
      title: "Children",
      body: ["The game is not directed at anyone under 13 and we do not knowingly collect their data. If we find such an account we remove it."],
    },
  ],
};

const deletionIt: LegalDoc = {
  updated: POLICY_UPDATED,
  intro: "Puoi eliminare il tuo account di Empire Lords Dragon quando vuoi. L'operazione è immediata e non è reversibile: non esiste un periodo di ripensamento e non possiamo ripristinare un account eliminato.",
  sections: [
    {
      title: "Come eliminarlo dall'app",
      body: [
        "Apri Empire Lords Dragon e accedi.",
        "Vai in Impostazioni e tocca «Elimina account».",
        "Conferma. Se il tuo account ha una password, dovrai digitarla.",
      ],
    },
    {
      title: "Come eliminarlo senza installare l'app",
      body: [
        `Scrivi a ${CONTACT_EMAIL} dall'indirizzo email con cui ti sei registrato, chiedendo la cancellazione dell'account. Procediamo entro 30 giorni dopo aver verificato che l'indirizzo sia il tuo.`,
      ],
    },
    {
      title: "Che cosa viene eliminato",
      body: [
        "L'indirizzo email, il nome visualizzato, l'immagine del profilo, l'impronta della password e il collegamento con Google.",
        "Tutte le sessioni attive: l'accesso smette di funzionare su ogni dispositivo.",
        "Il tuo Casato si ritira da ogni regno con le stesse regole con cui il regno ritira un Signore assente, e il suo nome viene sostituito ovunque compaia, chat comprese.",
      ],
    },
    {
      title: "Che cosa resta, e perché",
      body: [
        "Le ricevute degli acquisti: la legge fiscale impone di conservarle e un rimborso può arrivare mesi dopo. Non contengono dati di pagamento e non sono più collegate a una persona.",
        "Gli eventi storici del regno, come battaglie e cronache, restano con il nome del Casato sciolto al posto del tuo.",
        "I rubini e gli oggetti acquistati vengono persi senza rimborso: l'eliminazione è una tua scelta, non un difetto del servizio.",
      ],
    },
  ],
};

const deletionEn: LegalDoc = {
  updated: POLICY_UPDATED,
  intro: "You can delete your Empire Lords Dragon account whenever you want. It happens immediately and it cannot be undone: there is no grace period and we cannot restore a deleted account.",
  sections: [
    {
      title: "How to delete it from the app",
      body: ["Open Empire Lords Dragon and sign in.", "Go to Settings and tap “Delete account”.", "Confirm. If your account has a password you will be asked to type it."],
    },
    {
      title: "How to delete it without installing the app",
      body: [
        `Write to ${CONTACT_EMAIL} from the email address you registered with, asking for your account to be deleted. We act within 30 days, once we have verified that the address is yours.`,
      ],
    },
    {
      title: "What is deleted",
      body: [
        "The email address, display name, profile picture, password hash and the link to Google.",
        "Every active session: signing in stops working on all devices.",
        "Your House retires from every realm under the same rule the realm uses to retire an absent Lord, and its name is replaced everywhere it appears, chat included.",
      ],
    },
    {
      title: "What stays, and why",
      body: [
        "Purchase receipts: tax law requires us to keep them and a refund can arrive months later. They hold no payment details and no longer point at a person.",
        "The realm's historical events, such as battles and chronicles, remain with the dissolved House name in place of yours.",
        "Rubies and purchased items are lost without refund: deleting is your choice, not a failure of the service.",
      ],
    },
  ],
};

/** Italian for Italian readers, English for everyone else: the two languages the document was actually written in. */
export function privacyPolicy(lang: string): LegalDoc {
  return lang === "it" ? privacyIt : privacyEn;
}

export function deletionNotice(lang: string): LegalDoc {
  return lang === "it" ? deletionIt : deletionEn;
}
