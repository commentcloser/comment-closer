# COPY-SPEC — Comment Closer redesign V2 ("ULTRAVIOLET ENGINE")
## Authoritative copy + i18n key plan. Ship these strings VERBATIM.

Files: `C:/Users/Elyon/Desktop/comment-closer/app/i18n/locales/en.json` and `el.json`.
Everything below lives under the top-level `"landing"` namespace. **en and el stay mirrored key-for-key. No other namespace is touched.** Greek register for `landing.*` is intentionally informal second-person singular (πλήρωσες / ξεκίνα / σου) for poster punch — this deliberately diverges from the formal plural in dashboard/auth copy, which stays as-is. Greek uppercase strings are authored uppercase here (never CSS `text-transform`).

Winning hero statement (judge's verdict, LAW): **pain-direct #1** — "You paid for the ad. / The comments are undoing it." Statement #2 ("Nobody buys before reading the comments.") leads the hero subline; statement #3 ("Ugly comments kill great ads.") feeds the ticker verdict.

---

# 1. RE-VALUED EXISTING KEYS (names unchanged; old → new)

### 1.1 Hero + global

| Key | Old (en) | NEW en | NEW el |
|---|---|---|---|
| `landing.logo` | AI Comment Replyer | Comment Closer | Comment Closer |
| `landing.badge` | AI-Powered Comment Management | For brands running ads on Facebook · Instagram · TikTok | Για brands που τρέχουν διαφημίσεις σε Facebook · Instagram · TikTok |
| `landing.titleLine1` | Never Miss a | You paid for the ad. | Πλήρωσες τη διαφήμιση. |
| `landing.titleLine2` | Comment Again | The comments are undoing it. | Τα σχόλια την ξηλώνουν. |
| `landing.subtitle` | Automate your social media responses… | Nobody buys before reading the comments. Comment Closer wipes the negativity under your ads and answers everyone else — automatically. | Κανείς δεν αγοράζει πριν διαβάσει τα σχόλια. Το Comment Closer σβήνει την αρνητικότητα κάτω από τις διαφημίσεις σου και απαντά σε όλους τους υπόλοιπους — αυτόματα. |
| `landing.startFreeTrial` | Start Free Trial | Start free — fix my comments | Ξεκίνα δωρεάν — φτιάξε τα σχόλιά μου |
| `landing.watchDemo` | Watch Demo | See it in action | Δες το σε δράση |
| `landing.stats.automated` | Automated Replies | 100% of comments answered | 100% των σχολίων απαντημένα |
| `landing.stats.saved` | Saved Per Week | 0 negatives left visible | 0 αρνητικά σε κοινή θέα |
| `landing.stats.consistent` | Brand Consistent | 24/7 on every ad and post | 24/7 σε κάθε διαφήμιση και post |
| `landing.socialProof.title` | Trusted by Leading Brands | Trusted by teams running paid social | Μας εμπιστεύονται ομάδες που τρέχουν paid social |

(Note: `stats.*` key names are kept even though semantics shift — they are now the three hero proof chips.)

### 1.2 Navigation

| Key | Old (en) | NEW en | NEW el |
|---|---|---|---|
| `landing.navigation.features` | Features | The Problem | Το Πρόβλημα |
| `landing.navigation.pricing` | Pricing | Pricing | Τιμολόγηση |
| `landing.navigation.testimonials` | Testimonials | Results | Αποτελέσματα |

(Anchors change in markup: features→`#problem`, testimonials→`#results` — see DESIGN-SPEC §5.1.)

### 1.3 Pricing (plan names, prices, periods, feature bullets keep their CURRENT factual values — do not touch)

| Key | Old (en) | NEW en | NEW el |
|---|---|---|---|
| `landing.pricing.title` | Simple, Transparent Pricing | Costs less than one wasted day of ads. | Κοστίζει λιγότερο από μία χαμένη μέρα διαφημίσεων. |
| `landing.pricing.subtitle` | Currently free during early access… | Free during early access — zero charges. The paid plans below are what's coming. Every plan covers Facebook, Instagram and TikTok — organic posts and ads. | Δωρεάν όσο διαρκεί το early access — μηδέν χρεώσεις. Τα πληρωμένα πλάνα παρακάτω είναι αυτά που έρχονται. Κάθε πλάνο καλύπτει Facebook, Instagram και TikTok — οργανικά posts και διαφημίσεις. |
| `landing.pricing.mostPopular` | Most Popular | Most chosen | Η πιο συχνή επιλογή |
| `landing.pricing.comingSoon` | Coming soon | Coming soon | Έρχεται σύντομα |
| `landing.pricing.starter.cta` | Start Free | Start Free | Ξεκίνα δωρεάν |
| `landing.pricing.pro.cta` | Get Pro | Get Pro | Πάρε το Pro |
| `landing.pricing.enterprise.cta` | Get Business | Get Business | Πάρε το Business |

### 1.4 Testimonials (quote bodies + names + roles STAY as-is)

| Key | NEW en | NEW el |
|---|---|---|
| `landing.testimonials.title` | Brands that stopped the leak | Brands που σταμάτησαν τη διαρροή |
| `landing.testimonials.subtitle` | What happens after the comment section switches to your side. | Τι γίνεται όταν τα σχόλια περάσουν με το μέρος σου. |

### 1.5 FAQ (all rewritten)

| Key | NEW en | NEW el |
|---|---|---|
| `landing.faq.title` | Questions, answered | Ερωτήσεις, απαντημένες |
| `landing.faq.subtitle` | Exactly what happens to every comment under your ads. | Τι ακριβώς συμβαίνει σε κάθε σχόλιο κάτω από τις διαφημίσεις σου. |
| `landing.faq.q1` | What exactly happens to negative comments? | Τι ακριβώς γίνεται με τα αρνητικά σχόλια; |
| `landing.faq.a1` | The AI reads every incoming comment and scores its sentiment. Anything negative — insults, complaints, troll bait — is hidden or deleted automatically, before your audience sees it. You choose hide or delete, and everything stays logged in your dashboard. | Το AI διαβάζει κάθε εισερχόμενο σχόλιο και το αξιολογεί. Ό,τι είναι αρνητικό — βρισιές, παράπονα, trolling — κρύβεται ή διαγράφεται αυτόματα, πριν το δει το κοινό σου. Εσύ επιλέγεις απόκρυψη ή διαγραφή, και όλα καταγράφονται στο dashboard σου. |
| `landing.faq.q2` | Which platforms do you cover? | Ποιες πλατφόρμες καλύπτετε; |
| `landing.faq.a2` | Facebook, Instagram and TikTok — both organic posts and paid ads. Connect your pages and ad accounts once, and the AI watches every comment across all of them, 24/7. | Facebook, Instagram και TikTok — τόσο τα οργανικά posts όσο και τις πληρωμένες διαφημίσεις. Συνδέεις σελίδες και διαφημιστικούς λογαριασμούς μία φορά, και το AI παρακολουθεί κάθε σχόλιο σε όλα, 24/7. |
| `landing.faq.q3` | Will the replies really sound like my brand? | Θα ακούγονται όντως οι απαντήσεις σαν το brand μου; |
| `landing.faq.a3` | Yes. You set the tone and custom prompts per page, and the AI replies in your voice: questions get answered, compliments get thanked, buyers get nudged. No comment is left unreplied. | Ναι. Ορίζεις τόνο και δικά σου prompts ανά σελίδα, και το AI απαντά με τη φωνή σου: οι ερωτήσεις παίρνουν απάντηση, τα καλά λόγια το ευχαριστώ τους, οι αγοραστές ώθηση. Κανένα σχόλιο δεν μένει αναπάντητο. |
| `landing.faq.q4` | Do comments really affect ad performance? | Επηρεάζουν στ' αλήθεια τα σχόλια την απόδοση των διαφημίσεων; |
| `landing.faq.a4` | Massively. Buyers read the comments before they click. Visible complaints kill trust; answered questions and live engagement build it — and feed the algorithm. Clean, active comments make the same budget perform better. | Καθοριστικά. Ο αγοραστής διαβάζει τα σχόλια πριν κάνει κλικ. Τα ορατά παράπονα σκοτώνουν την εμπιστοσύνη· οι απαντημένες ερωτήσεις και το ζωντανό engagement τη χτίζουν — και ταΐζουν τον αλγόριθμο. Καθαρά, ενεργά σχόλια κάνουν το ίδιο budget να αποδίδει καλύτερα. |
| `landing.faq.q5` | What if the AI gets one wrong? | Κι αν το AI κάνει λάθος σε κάποιο; |
| `landing.faq.a5` | You stay in charge. Turn on manual review to approve replies before they post, edit or replace any reply, and pause automation with one click. Every action is logged so you always know what ran. | Το τιμόνι το κρατάς εσύ. Ενεργοποιείς manual review για να εγκρίνεις απαντήσεις πριν δημοσιευτούν, διορθώνεις ή αντικαθιστάς όποια θες, και παγώνεις τον αυτοματισμό με ένα κλικ. Κάθε ενέργεια καταγράφεται, ώστε να ξέρεις πάντα τι έτρεξε. |

### 1.6 Final CTA + footer

| Key | NEW en | NEW el |
|---|---|---|
| `landing.finalCta.title` | Stop paying for comments that cost you sales. | Σταμάτα να πληρώνεις σχόλια που σου κοστίζουν πωλήσεις. |
| `landing.finalCta.subtitle` | Connect your pages in minutes. From then on: negatives gone, everything answered, no comment left hanging. | Συνδέεις τις σελίδες σου σε λίγα λεπτά. Από εκεί και πέρα: τα αρνητικά φεύγουν, όλα απαντιούνται, κανένα σχόλιο δεν μένει ξεκρέμαστο. |
| `landing.finalCta.button` | Start free now | Ξεκίνα δωρεάν τώρα |
| `landing.footer.description` | AI that cleans your comment section and answers every comment — so your ads sell instead of apologize. | AI που καθαρίζει τα σχόλιά σου και απαντά σε όλα — για να πουλάνε οι διαφημίσεις σου αντί να απολογούνται. |

(`landing.footer.product/company/legal/documentation/api/about/blog/careers` keep current values.)

---

# 2. NEW KEYS — sections (JSON paths under `landing`)

### 2.1 `landing.problem.*` (section 02 — must hurt)

| JSON path | en | el |
|---|---|---|
| `problem.eyebrow` | THE PROBLEM | ΤΟ ΠΡΟΒΛΗΜΑ |
| `problem.title` | The most expensive part of your ad is the part you never look at. | Το πιο ακριβό κομμάτι της διαφήμισής σου είναι αυτό που δεν κοιτάς ποτέ. |
| `problem.point1.title` | One complaint outshouts your whole ad. | Ένα παράπονο φωνάζει πιο δυνατά από όλη τη διαφήμιση. |
| `problem.point1.desc` | A single visible "scam", "never arrived", "don't buy" undoes the creative you paid thousands to run. | Ένα ορατό «απάτη», «δεν ήρθε ποτέ», «μην αγοράσετε» ακυρώνει το creative που πλήρωσες ακριβά για να τρέξει. |
| `problem.point2.title` | Every unanswered question is a lost sale. | Κάθε αναπάντητη ερώτηση είναι μια χαμένη πώληση. |
| `problem.point2.desc` | "How much?" "Do you ship?" Silence reads as "we don't care" — and the buyer scrolls on to someone who answers. | «Πόσο κάνει;» «Στέλνετε;» Η σιωπή διαβάζεται ως αδιαφορία — και ο αγοραστής προσπερνάει σε κάποιον που απαντάει. |
| `problem.point3.title` | You're paying to promote your own bad press. | Πληρώνεις για να προωθείς την ίδια σου την κακή φήμη. |
| `problem.point3.desc` | Every euro of ad spend pushes those comments in front of more people. The more you scale, the more it costs you. | Κάθε ευρώ διαφήμισης σπρώχνει αυτά τα σχόλια μπροστά σε περισσότερο κόσμο. Όσο ανεβάζεις budget, τόσο πιο ακριβά το πληρώνεις. |
| `problem.counterLabel` | burned while you read this (demo) | καίγονται όσο διαβάζεις (demo) |
| `problem.punchline1` | Your budget doesn't leak in Ads Manager. | Το budget σου δεν χάνεται στο Ads Manager. |
| `problem.punchline2` | It leaks in the comments. | Χάνεται στα σχόλια. |
| `problem.anatomy.title` | Anatomy of a dying ad | Ανατομία μιας διαφήμισης που πεθαίνει |
| `problem.anatomy.c1` | Total scam, don't waste your money!! | Απάτη, μην πετάτε τα λεφτά σας!! |
| `problem.anatomy.c2` | How much is shipping to Thessaloniki? | Πόσο πάνε τα μεταφορικά για Θεσσαλονίκη; |
| `problem.anatomy.c3` | dm me for the same thing way cheaper | στείλτε dm για το ίδιο πολύ πιο φτηνά |
| `problem.anatomy.label1` | the algorithm feeds it oxygen | ο αλγόριθμος του δίνει οξυγόνο |
| `problem.anatomy.label2` | the question that was a sale | η ερώτηση που ήταν πώληση |
| `problem.anatomy.label3` | your budget pays to show it | το budget σου πληρώνει για να φαίνεται |

(Punchline is split into punchline1 [ink] + punchline2 [danger gradient] — DESIGN-SPEC §5.5.)

### 2.2 `landing.flip.*` (section 03 — the hinge)

| JSON path | en | el |
|---|---|---|
| `flip.eyebrow` | THE FLIP | Η ΑΝΑΤΡΟΠΗ |
| `flip.title1` | A clean comment section is a second ad. | Καθαρά σχόλια = δεύτερη διαφήμιση. |
| `flip.title2` | And it runs for free. | Και τρέχει δωρεάν. |
| `flip.point1` | Comments are social proof. Buyers trust them more than your creative. | Τα σχόλια είναι κοινωνική απόδειξη. Ο αγοραστής τα εμπιστεύεται περισσότερο από το creative σου. |
| `flip.point2` | Answered questions close sales on the spot. A brand that replies looks alive — and safe to buy from. | Οι απαντημένες ερωτήσεις κλείνουν πωλήσεις επιτόπου. Ένα brand που απαντάει δείχνει ζωντανό — και ασφαλές για αγορά. |
| `flip.point3` | Engagement feeds the algorithm. Live comments make the same budget buy more. | Το engagement ταΐζει τον αλγόριθμο. Ζωντανά σχόλια κάνουν το ίδιο budget να αποδίδει περισσότερο. |
| `flip.punchline` | Same ad. Same budget. Better comments. More sales. | Ίδια διαφήμιση. Ίδιο budget. Καλύτερα σχόλια. Περισσότερες πωλήσεις. |
| `flip.toggleBefore` | Before | Πριν |
| `flip.toggleAfter` | After | Μετά |
| `flip.toggleHint` | Flip it yourself | Γύρνα τον διακόπτη μόνος σου |

(flip.point3 uses the judge-approved fix — «Ζωντανά σχόλια», no «ενότητα σχολίων» calque.)

### 2.3 `landing.how.*` (section 04 — FOUR beats, never three)

| JSON path | en | el |
|---|---|---|
| `how.eyebrow` | HOW IT WORKS | ΠΩΣ ΔΟΥΛΕΥΕΙ |
| `how.title` | Every comment. Read, judged, handled. In seconds. | Κάθε σχόλιο. Διαβάζεται, κρίνεται, τακτοποιείται. Σε δευτερόλεπτα. |
| `how.step1.title` | AI reads every new comment | Το AI διαβάζει κάθε νέο σχόλιο |
| `how.step1.desc` | The moment a comment lands on your ad or post — Facebook, Instagram or TikTok — the AI reads it and scores its sentiment. | Μόλις πέσει σχόλιο στη διαφήμιση ή στο post σου — Facebook, Instagram ή TikTok — το AI το διαβάζει και το αξιολογεί. |
| `how.step2.title` | Negative? Gone. Automatically. | Αρνητικό; Εξαφανίζεται. Αυτόματα. |
| `how.step2.desc` | Insults, complaints, troll bait: hidden or deleted before your audience ever sees them. You choose which. | Βρισιές, παράπονα, trolling: κρύβονται ή διαγράφονται πριν προλάβει να τα δει το κοινό σου. Εσύ διαλέγεις τι από τα δύο. |
| `how.step3.title` | Everything else gets a reply — in your voice | Όλα τα υπόλοιπα παίρνουν απάντηση — με τη δική σου φωνή |
| `how.step3.desc` | Questions answered, compliments thanked, buyers nudged toward checkout. Instantly, in your brand's tone. | Οι ερωτήσεις απαντιούνται, τα καλά λόγια παίρνουν το ευχαριστώ τους, οι αγοραστές παίρνουν ώθηση προς το ταμείο. Άμεσα, στο ύφος του brand σου. |
| `how.step4.title` | No comment left unreplied. Ever. | Κανένα σχόλιο αναπάντητο. Ποτέ. |
| `how.step4.desc` | The result: a comment section that looks great and sells for you — 24/7, even while you sleep. | Το αποτέλεσμα: ένα comment section που δείχνει άψογο και πουλάει για σένα — 24/7, ακόμα κι όσο κοιμάσαι. |

(step3.desc and step4.desc carry the judge's Greek fixes verbatim: «παίρνουν το ευχαριστώ τους», «comment section» loanword — no «ενότητα σχολίων».)

### 2.4 `landing.results.*` (section 05 — capability absolutes, split at em-dash: value / label)

| JSON path | en | el |
|---|---|---|
| `results.eyebrow` | RESULTS | ΑΠΟΤΕΛΕΣΜΑΤΑ |
| `results.title` | What changes when the comments work for you | Τι αλλάζει όταν τα σχόλια δουλεύουν για σένα |
| `results.stat1.value` | 100% | 100% |
| `results.stat1.label` | of comments answered | των σχολίων απαντημένα |
| `results.stat2.value` | Seconds | Δευτερόλεπτα |
| `results.stat2.label` | from comment to reply | από το σχόλιο στην απάντηση |
| `results.stat3.value` | 0 | 0 |
| `results.stat3.label` | negatives left in sight | αρνητικά σε κοινή θέα |
| `results.stat4.value` | 10+ hrs | 10+ ώρες |
| `results.stat4.label` | of moderation saved every week | moderation που γλιτώνεις κάθε εβδομάδα |

### 2.5 `landing.finalCta.microline` + `landing.hero.platforms` (new single keys)

| JSON path | en | el |
|---|---|---|
| `finalCta.microline` | Free during early access — no card required. | Δωρεάν στο early access — χωρίς κάρτα. |
| `hero.platforms` | Facebook · Instagram · TikTok — posts and ads | Facebook · Instagram · TikTok — posts και διαφημίσεις |

### 2.6 `landing.ticker.*` (stat ticker strip)

| JSON path | en | el |
|---|---|---|
| `ticker.stat1` | 142 comments hidden | 142 σχόλια κρύφτηκαν |
| `ticker.stat2` | 1,038 replies sent | 1.038 απαντήσεις στάλθηκαν |
| `ticker.stat3` | 0 left unanswered | 0 έμειναν αναπάντητα |
| `ticker.stat4` | every question answered in seconds | κάθε ερώτηση απαντήθηκε σε δευτερόλεπτα |
| `ticker.verdict` | Ugly comments kill great ads. | Τα άσχημα σχόλια σκοτώνουν τις καλές διαφημίσεις. |

---

# 3. NEW KEYS — `landing.hero.demo.*` (TakeoverDemo — NO hardcoded strings in JSX)

The component is `aria-hidden` decorative, but every visible string comes from these keys so the Greek visitor sees a Greek feed. Native-register Greek, matching real FB/IG comment tone.

| JSON path | en | el |
|---|---|---|
| `hero.demo.brandName` | Your Brand | Το Brand σου |
| `hero.demo.sponsored` | Sponsored | Χορηγούμενη |
| `hero.demo.statusUnmanaged` | UNMANAGED | ΧΩΡΙΣ ΔΙΑΧΕΙΡΙΣΗ |
| `hero.demo.statusActive` | COMMENT CLOSER ACTIVE | COMMENT CLOSER ΕΝΕΡΓΟ |
| `hero.demo.captionBleeding` | BLEEDING. | ΑΙΜΟΡΡΑΓΕΙ. |
| `hero.demo.captionClosing` | CLOSING. | ΚΛΕΙΝΕΙ. |
| `hero.demo.captionPrinting` | PRINTING. | ΤΥΠΩΝΕΙ. |
| `hero.demo.meterLabel` | ROAS | ROAS |
| `hero.demo.simulation` | simulation | προσομοίωση |
| `hero.demo.wastedLabel` | wasted today | χαμένα σήμερα |
| `hero.demo.recoveredLabel` | recovered today | ανακτήθηκαν σήμερα |
| `hero.demo.c1` | Total scam, avoid. | Απάτη, μην αγοράσετε. |
| `hero.demo.c2` | Ordered 3 weeks ago. Nothing. | Παρήγγειλα πριν 3 βδομάδες. Τίποτα. |
| `hero.demo.c3` | dm me for a cheaper version of this | στείλτε dm για πιο φτηνή εκδοχή |
| `hero.demo.c4` | Do you ship to Cyprus? | Στέλνετε Κύπρο; |
| `hero.demo.c5` | Best thing I've bought this year | Ό,τι καλύτερο έχω πάρει φέτος |
| `hero.demo.r4` | We do — free shipping over €40. Link in bio. | Στέλνουμε — δωρεάν μεταφορικά άνω των 40€. Link στο bio. |
| `hero.demo.r5` | Thank you! You made our day. 💜 | Σ' ευχαριστούμε! Μας έφτιαξες τη μέρα. 💜 |
| `hero.demo.chipNegative` | NEGATIVE | ΑΡΝΗΤΙΚΟ |
| `hero.demo.chipQuestion` | QUESTION | ΕΡΩΤΗΣΗ |
| `hero.demo.chipPositive` | POSITIVE | ΘΕΤΙΚΟ |
| `hero.demo.chipHidden` | hidden · 0.4s | κρύφτηκε · 0.4s |
| `hero.demo.chipReplied` | Replied | Απαντήθηκε |
| `hero.demo.unansweredLabel` | unanswered | αναπάντητα |
| `hero.demo.hiddenLabel` | hidden | κρυμμένα |
| `hero.demo.repliedLabel` | replied | απαντημένα |
| `hero.demo.cleanLabel` | feed: CLEAN | feed: ΚΑΘΑΡΟ |
| `hero.demo.scoreLose` | This feed loses money | Αυτό το feed χάνει λεφτά |
| `hero.demo.scorePrint` | This feed prints money | Αυτό το feed βγάζει λεφτά |
| `hero.demo.flipBefore` | Before | Πριν |
| `hero.demo.flipAfter` | After | Μετά |

Demo behavior notes bound to these keys: c1–c3 classify NEGATIVE and get HIDDEN (hide, not delete — matches faq.a1); c4 = QUESTION → reply r4; c5 = POSITIVE → reply r5; the `simulation` chip is always visible (fabricated-numbers guard); verdict bar composes "0 {unansweredLabel} · 3 {hiddenLabel} · 2 {repliedLabel} · {cleanLabel}".

---

# 4. `.ledger-rule` data-label sources (no extra keys)

| Section | data-label value |
|---|---|
| Problem | `t('landing.problem.eyebrow')` |
| Flip | `t('landing.flip.eyebrow')` |
| How | `t('landing.how.eyebrow')` |
| Results | `t('landing.results.eyebrow')` |
| Pricing | `t('landing.navigation.pricing')` |
| FAQ | `t('landing.faq.title')` |

---

# 5. ORPHANED-BUT-KEPT KEYS (leave in BOTH files, values untouched, no tsx references may remain)

- `landing.features.*` — entire block (title, subtitle, all six cards) — superseded by problem/flip/how.
- `landing.metrics.*` — all four labels — superseded by `landing.results.*`.
- `landing.pricing.starter/pro/enterprise` `.name/.price/.period/.feature1–5` — NOT orphaned, still used, still factual — listed here only to stress: **do not edit them**.
- Legacy top-level namespaces `hero`, `howItWorks`, `benefits`, `trust`, `cta` (if present) — untouched, unread.
- `header.*`, `footer.*` (top-level), `auth`, `dashboard`, `admin`, `onboarding` namespaces — byte-identical.

---

# 6. RULES (hard gates before merge)

1. **Key parity:** flattened key sets of `en.json` and `el.json` are IDENTICAL after the change (write a 5-line node script; run it).
2. **Valid JSON:** both files parse (`node -e "require('./app/i18n/locales/en.json')"` etc.).
3. **Scope:** only the `landing` namespace gains/changes keys. Nothing deleted. No other namespace touched.
4. **Greek quality:** ship the Greek strings above verbatim — they encode the judge's native-register fixes («παίρνουν το ευχαριστώ τους», no «ενότητα σχολίων», informal singular). Do not machine-translate, do not "correct" register to formal plural.
5. **No CSS uppercase on Greek:** ΤΟ ΠΡΟΒΛΗΜΑ / Η ΑΝΑΤΡΟΠΗ / ΠΩΣ ΔΟΥΛΕΥΕΙ / ΑΠΟΤΕΛΕΣΜΑΤΑ / demo chips are authored uppercase here; the rendering elements must NOT apply `uppercase` when showing el (safest: never apply the `uppercase` utility to any element rendering these keys — the strings already carry their case in both languages; EN values for those keys are authored uppercase too).
6. **Interpolation:** none of the new keys use i18next interpolation — plain strings only; the verdict bar and stat composites are assembled in JSX with the label keys above.
7. **Em-dash split contract:** results stats render `statN.value` and `statN.label` as separate elements (value = mono display numeral, label = muted caption) — never re-joined into one string.
