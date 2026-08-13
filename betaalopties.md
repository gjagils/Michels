# Automatisch betaalverzoeken sturen — 5 werkbare opties

Doel: zodra de bot weet wie er traint, de €50 splitsen en per persoon een betaalverzoek
sturen — zo veel mogelijk zonder handwerk.

## Rekenvoorbeeld dat overal wordt gebruikt

| | |
|---|---|
| Kosten per training | €50 |
| Trainingen per jaar | ~40 (wekelijks, minus vakanties) |
| Gemiddeld aanwezig | 6 → €8,33 p.p. |
| **Betalingen per jaar** | **~240** (~20 per maand) |

## Het probleem opgeknipt in 4 stukjes

De opties verschillen alleen op stap 1 en 3 — stap 2 en 4 doet de bot al.

1. **Betaallink maken met het juiste bedrag** ← hier zit KvK-ja/nee
2. **Versturen** — WhatsApp groep of DM (bot kan dit al)
3. **Zien wie betaald heeft** ← hier zit het echte gemak
4. **Herinneren wie nog niet betaald heeft** — alleen mogelijk als 3 werkt

## KvK: wat mag wél zonder?

* **Zonder KvK mag:** kosten delen onder vrienden via een *persoonlijk* betaalverzoek —
  Tikkie particulier, bunq.me, betaalverzoek van je eigen bank. Dit is geen omzet, je
  verkoopt niets. Alleen: geen enkele bank biedt hier een API op, behalve bunq.
* **Met KvK verplicht:** élke betaaldienstverlener (Mollie, Stripe, Adyen, Tikkie Zakelijk).
  Ze eisen KvK-nummer + bankrekening op naam van de organisatie. Sinds de aangescherpte
  regels accepteert geen enkele CPSP nog iDEAL zonder KvK.
* **Goedkoopste KvK-route:** *vereniging met beperkte rechtsbevoegdheid*. Geen notaris
  nodig (statuten mag je zelf opstellen en ondertekenen), eenmalig **€85,15** inschrijving.
  Dat is letterlijk gemaakt voor een clubje zoals dit.

---

## De 5 opties naast elkaar

| | **1. bunq privé + API** | **2. Kale betaallinks** | **3. Vereniging + Tikkie Zakelijk** | **4. Vereniging + Mollie/Stripe** | **5. Kas / strippenkaart** |
|---|---|---|---|---|---|
| **KvK nodig** | Nee | Nee | Ja | Ja | Nee |
| **Vaste kosten** | bunq Pro €9,99/mnd | €0 (bunq Free) | €85,15 eenmalig + rekening €7–14/mnd + Tikkie €7,50/mnd | €85,15 eenmalig + rekening €7–14/mnd | €0 |
| **Per betaling** | €0 (iDEAL privé gratis) | €0 | €0 tot 20/mnd, daarna €0,25 | Mollie €0,32 / Stripe €0,29 | €0 |
| **Kosten jaar 1** | **~€120** | **€0** | **~€280–360** | **~€245–330** | **€0** |
| **Kosten jaar 2+** | ~€120 | €0 | ~€195–275 | ~€160–245 | €0 |
| **Link automatisch** | ✅ API | ✅ URL bouwen | ✅ API | ✅ API | n.v.t. |
| **Ziet wie betaald heeft** | ✅ volledig | ❌ handmatig | ✅ per Tikkie | ✅ webhook | ✅ (jij boekt bij) |
| **Automatisch herinneren** | ✅ | ❌ | ✅ | ✅ | ✅ |
| **Bouwtijd** | ~4–6 uur | ~30 min | ~3 uur (+ admin) | ~3 uur (+ admin) | ~2 uur |
| **Betaalgemak deelnemer** | iDEAL, 2 taps | iDEAL, 2 taps | Tikkie, iedereen kent het | iDEAL, 2 taps | 1× per 10 weken |

---

## 1. bunq privé + Open API — *de "geen KvK, tóch volledig automatisch"-route*

Een privérekening bij bunq is de enige Nederlandse consumentenrekening met een echte
open API. Daarmee kun je zonder KvK precies doen wat een PSP doet.

**Wekelijkse flow**

1. Woensdag 21:00 leest de bot de aanwezigheid uit Sheets (staat er al).
2. Per aanwezige: `POST /user/{u}/monetary-account/{a}/bunqme-tab` met
   `amount_inquired: 8.33` en `description: "Squash 13-08 — Mark"`.
3. Bot stuurt iedereen een **DM** met zijn eigen link (nummers staan al in Sheets).
4. Bot pollt elke 10 min de betalingen op de rekening → vinkje in de Sheet.
5. Zondag: DM alleen naar wie nog openstaat. Maandag: lijstje naar jou.

**Kosten**: bunq Pro €9,99/mnd — volgens de helpdocumentatie zit de API op Pro/Elite, maar
bunq-support beweert Free ook. Kan €0 worden; zie de notitie onderaan. Betalingen via bunq.me met iDEAL zijn op privérekeningen **gratis**
(zakelijk: €0,27). Creditcard 2,5% — die kun je beter uitzetten.

**Waarom dit de beste "echte" optie is**: geen KvK, geen boekhouding, geen jaarrekening,
geen btw-vraagstuk, en tóch stap 3 en 4 volledig automatisch. Je betaalt effectief €120/jaar
voor een bankabonnement dat je ook privé gebruikt.

**Nadelen**: bunq Pro is een abonnement dat je anders misschien niet zou nemen. En je moet
je hoofdrekening (of een subrekening) bij bunq hebben, met genoeg saldo/gebruik om het de
moeite waard te maken.

**Techniek**: `BunqMeTab` geeft een `bunqme_tab_share_url` terug. Reconciliatie kan via
callbacks (`notification-filter-url`, HTTPS-endpoint nodig) óf gewoon door elke 10 minuten
de betalingen op te halen — dat laatste is op je Synology veel simpeler, geen inbound poort
nodig.

## 2. Kale betaallinks (bunq.me of open Tikkie) — *€0, 30 minuten werk*

Geen API, geen account-gedoe: de bot bouwt de URL zelf als string.

* **bunq.me met bedrag in de URL**: `https://bunq.me/gerdjan/8.33/Squash%2013-08` — de
  betaler ziet meteen het juiste bedrag en betaalt met iDEAL. Werkt op bunq Free (€0).
* **Open Tikkie** (jouw idee): één Tikkie waarbij "betaler mag het bedrag kiezen" aan staat.
  De bot post het bedrag erbij: *"6 man × €8,33 — Tikkie: [link]"*. Gratis, maar mensen
  typen het bedrag zelf → typefouten en te lage bedragen.

**Kosten**: €0. **Wat je inlevert**: stap 3 en 4. Je ziet in je bankapp wel wat binnenkomt,
maar de bot weet het niet, dus geen automatische herinneringen.

**Let op bij een spaar-only plan (Easy Savings):** bunq.me en iDEAL werken op een
*betaalrekening*, niet op een spaarrekening. Overstappen naar bunq Free geeft je 3
betaal-IBAN's voor €0 — zie de notitie onderaan. Zet de squashkas op een aparte
sub-rekening, dan blijft het gescheiden van je privégeld.

**Slimme tussenvorm**: laat de bot per persoon een unieke omschrijving meesturen
(`Squash 13-08 Mark`) en plak later één keer per maand je bankafschrift-CSV in de Sheet →
dan klopt de administratie alsnog, zonder API.

**Dit is de juiste keuze als** je eerst wilt zien of de groep überhaupt betaalt zonder gezeur.
Bouw dit eerst, upgrade later naar optie 1 of 4 — de rest van de code blijft hetzelfde.

## 3. Vereniging bij de KvK + Tikkie Zakelijk API — *het meest herkenbaar*

Richt de squashgroep op als vereniging met beperkte rechtsbevoegdheid (geen notaris, zelf
statuten opstellen, bestuur = jij + 2), schrijf in bij de KvK, open een verenigingsrekening,
en vraag Tikkie Zakelijk aan. Daarmee heb je legitiem toegang tot de Tikkie API.

**Kosten**: KvK €85,15 eenmalig · verenigingsrekening €7–14/mnd · Tikkie €7,50/mnd
inclusief 20 betaalde Tikkies, daarna €0,25 (21–100), €0,20 (101–500), €0,15 (500+), excl.
btw. Sms-verzending +€0,10. Eerste 3 maanden gratis. Bij ~20 betalingen/mnd zit je precies
in de bundel: ~€109/jaar incl. btw voor Tikkie zelf.

**Voordeel**: Tikkie is wat iedereen in NL kent — de laagste drempel om te betalen, en de
Tikkie Zakelijk-app geeft je een penningmeester-overzicht van wie betaald heeft.

**Nadeel**: verreweg de meeste administratie voor een groepje van 6. Je krijgt een
vereniging met bestuur, ledenadministratie en een bankrekening om te beheren. Online
aanmelden voor Tikkie Zakelijk kan in de praktijk alleen met een **ABN AMRO** zakelijke
rekening; met een andere bank moet je het aanvraagproces in.

**Dit is de juiste keuze als** de groep groeit richting 15–20 man, of als er meer geld
omgaat (zaalhuur, toernooien, kleding) en je het toch van je privérekening af wilt hebben.

## 4. Vereniging + Mollie (of Stripe) payment links — *goedkoopst per transactie, beste API*

Zelfde KvK-stap als optie 3, maar dan met een echte PSP. Mollie: geen vaste kosten,
**€0,32** per iDEAL-betaling, `POST /v2/payment-links` en een webhook die je vertelt wie
betaald heeft. Stripe is met €0,29 iets goedkoper en heeft de betere developer-ervaring,
maar zwaardere onboarding en minder Nederlands.

**Kosten bij 240 betalingen**: Mollie €76,80/jaar, Stripe €69,60/jaar, plus KvK en
verenigingsrekening. Zonder die twee vaste posten zou dit de winnaar zijn — mét die posten
verlies je van optie 1.

**Bonus**: hier kun je later **SEPA-incasso** op zetten. Eén keer een machtiging tekenen en
daarna wordt er automatisch afgeschreven — nul betaalverzoeken, nul wanbetalers. Dat is de
enige optie waarbij "automatisch" ook echt betekent dat er niemand meer op iets hoeft te tikken.

**Nadeel**: verenigingen kunnen bij Mollie langer in de aanvraag zitten (UBO-check bestuur);
stichtingen worden tijdelijk zelfs geweigerd.

## 5. Kas / strippenkaart — *geen betaalverzoeken, maar boekhouding*

De out-of-the-box optie: stop met per training afrekenen.

**Variant A — strippenkaart**: iedereen stort €80 (10 trainingen). De bot trekt na elke
training €8,33 van je saldo af in de Sheet en post in de groep: *"Mark €38,30 · Jan €13,20 ·
Piet €4,90 ⚠️"*. Onder de €15 krijg je een DM met een betaallink voor de volgende 10.
→ **6 betalingen per persoon per jáár in plaats van 40.**

**Variant B — roulerende betaler**: elke week betaalt één iemand de hele €50 aan de trainer.
De bot houdt bij wie hoeveel heeft voorgeschoten en wijst de volgende betaler aan (degene
met het laagste saldo). Bij afwijkingen (iemand stopt, iemand komt erbij) rekent de bot één
keer per kwartaal het verschil uit. → **nul betaalverzoeken.**

**Kosten**: €0. **Nadeel**: jij (of de kas) loopt vooruitbetaling-risico, en het vraagt
vertrouwen in de administratie van de bot. Maar de administratie zit al in de Sheet die je
gebruikt, en dit is precies wat software goed kan.

---

## Wat ik zou doen

**Nu (deze week, €0):** optie 2 + de saldo-logica uit optie 5. De bot berekent het bedrag
per persoon, DM't iedereen een `bunq.me`-link met bedrag, en houdt in de Sheet bij wie
betaald heeft — dat vinkje zet je voorlopig handmatig of vanuit je bankafschrift.

**Daarna (als het bevalt):** zet er optie 1 bovenop. bunq Pro erbij, links via de API, en de
reconciliatie wordt automatisch. Je hoeft alleen `src/payments.js` te vervangen — de
scheduler, Sheets en WhatsApp-kant blijven hetzelfde.

**Optie 3/4 pas** als de groep groeit of als er meer geldstromen bij komen. Voor 6 man is een
vereniging oprichten meer overhead dan het oplevert.

**Wat ik zou skippen:** Revolut (revolut.me kent limieten van ~€250/week via kaart en is in
NL ongebruikelijk), PayPal (vrienden/familie-betalingen zijn rommelig voor NL), en zelfbouw
op iDEAL-QR (heb je een acquirer voor nodig — dus alsnog KvK).

## Let op: iDEAL wordt Wero

Vanaf 2026 gaat iDEAL stapsgewijs over naar het Europese **Wero**. Alle providers hierboven
(bunq, Tikkie, Mollie, Stripe) regelen die migratie voor je — dat is precies de reden om
géén eigen constructie op iDEAL-QR te bouwen.

---

## Aansluiting op de huidige code

De haak zit er al in: `src/scheduler.js` heeft `sendTikkieRequest()`, en `trainingCost` staat
al in `src/settings.js`. Twee dingen om te weten voor je verder bouwt:

1. **`sendTikkieRequest()` crasht nu stilletjes.** Regel 313 roept `tikkie.createPaymentRequest()`
   aan, maar er is geen `tikkie`-import en geen `src/tikkie.js`. Dat geeft een ReferenceError
   binnen de `try`, waardoor de nette fallback-tekst ("Tikkie-koppeling nog niet actief") nooit
   verstuurd wordt en de groep helemaal geen bericht krijgt.
2. **De functie hangt aan geen enkele cron-job** en is niet bereikbaar via `src/web.js`. Er
   staan alleen jobs voor poll (ma 18:00), reminder (di 09:00) en summary (di 22:00).

Bouw het provider-onafhankelijk: één module `src/payments.js` met

```js
export async function createPaymentLink({ amountCents, description, memberName })
export async function listIncomingPayments({ since })   // no-op bij optie 2
```

met een `PAYMENT_PROVIDER`-instelling (`none` | `bunqme` | `bunq` | `tikkie` | `mollie`).
Dan kost wisselen van optie later één bestand.

---

## Notitie: van Easy Savings naar bunq Free

| | Easy Savings (huidig) | bunq Free |
|---|---|---|
| Maandkosten | €0 | €0 |
| Betaalrekening / IBAN | geen (alleen sparen) | **3 betaalrekeningen, eigen IBAN** |
| bunq.me / iDEAL ontvangen | nee | **ja** |
| Pas | geen | 1 digitale kaart (geen fysieke) |
| API | nee | nee — dat is Pro (€9,99) of Elite |

Overstappen kost niets en levert precies op wat je nodig hebt: een betaalrekening om
betaalverzoeken op te ontvangen. Spaargeld en rentestructuur (basis 1,51%, bonus tot 3,01%)
hangen aan de spaarrekening, niet aan het plan.

**Uit de bunq-support (aug 2026), specifiek voor dit account:**

* Er zit een **legacy bunq Free supplement** op het account, met extra functies van het oude
  Free-plan. Upgraden naar Pro en later weer terug naar Free kan dat legacy-voordeel kosten.
  Dus: niet even tijdelijk upgraden om iets te proberen.
* **bunq Free = maximaal 3 rekeningen**, in elke combinatie van betaal- en spaarrekeningen.
  Een aparte "squashkas"-rekening kost dus één van die drie — tel na hoeveel spaarrekeningen
  er al open staan.
* Upgraden naar Pro en later terug naar Free kan zonder spaarrekeningen kwijt te raken,
  **zolang er op het moment van downgraden niet meer dan 3 rekeningen open staan**.
* Support zei dat de API "beschikbaar is voor alle plannen, inclusief Free". Dat spreekt de
  eigen helpdocumentatie tegen (zie hieronder) — eerst testen, niet op vertrouwen.

**Openstaand punt: API op Free of niet?**

| Bron | Zegt |
|---|---|
| bunq Help Center | "bunq Developers is available for our bunq Pro and bunq Elite users" |
| bunq API-docs | Alleen de stappen (app → Developers → API keys), geen woord over plannen |
| bunq 24/7 support (AI) | "beschikbaar voor alle plannen (inclusief Free)" |

Zo beslis je het in 2 minuten, zonder risico: kijk in de app of
**Profiel → Beveiliging & instellingen → Developers → API keys** er staat. Staat het er en
kun je een key aanmaken → optie 1 werkt op Free en kost **€0/mnd** in plaats van €120/jaar.
Staat het er niet → dan had de helpdocumentatie gelijk en is Pro nodig.

## Bronnen

* [Tikkie Zakelijk — FAQ & tarieven](https://www.tikkie.me/faq/zakelijk) · [Tikkie API](https://www.tikkie.me/zakelijk/api) · [Tikkie voor verenigingen en stichtingen](https://www.tikkie.me/zakelijk/verenigingen-en-stichtingen)
* [bunq abonnementen (privé)](https://www.bunq.com/nl-nl/personal/plans) · [welke plannen zijn er](https://help.bunq.com/articles/what-plans-are-available) · [plan wijzigen](https://help.bunq.com/articles/how-do-i-change-my-plan) · [bunq Easy Savings — rente](https://www.spaarinformatie.nl/sparen/rekeningen/info/792-Bunq-Easy-Savings) · [bunq.me limieten en kosten](https://help.bunq.com/articles/what-are-the-bunqme-daily-limits-and-fees) · [bunq Open API docs](https://doc.bunq.com/) · [bunq.me betalingen ontvangen via API](https://doc.bunq.com/tutorials/receiving-payments-on-your-website-using-bunq.me) · [bunq callbacks/webhooks](https://doc.bunq.com/basics/callbacks-webhooks)
* [Mollie-account als vereniging](https://mijnevent.nl/nl/blog/mollie-account-aanmaken-als-vereniging) · [iDEAL zonder KvK-inschrijving](https://www.internetkassa.nu/ideal-acceptatie-zonder-kvk-inschrijving/)
* [Stripe tarieven](https://stripe.com/pricing) · [Stripe iDEAL-tarief NL](https://www.internetkassa.nu/stripe-ideal-tarief-omlaag/)
* [KVK — inschrijven vereniging met beperkte rechtsbevoegdheid](https://www.kvk.nl/inschrijven/inschrijven-vereniging-met-beperkte-rechtsbevoegdheid/) · [KVK-inschrijfvergoeding 2026](https://www.kvk.nl/inschrijven/inschrijfvergoeding/)
* [iDEAL gaat vanaf 2026 over naar Wero](https://ideal.nl/ideal-vanaf-2026-stapsgewijs-over-naar-wero)
* [Bankrekening voor vereniging/stichting vergelijken](https://www.zakelijkbankieren.nl/zakelijke-rekening/vereniging-stichting/)
