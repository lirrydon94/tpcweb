# Skift

Ett mobilvänligt arbetsschema med personligt schema, teamöversikt och verktyg för administratören. Gränssnittet är på svenska. Exemplet använder den angivna rotationen på 11 veckor, med sju exempelmedarbetare som börjar på olika positioner. Måndag 12 oktober 2026 är **exemplets** referensdatum. Byt ut namnen och ange er verkliga referensmåndag innan ni börjar använda schemat.

## Prova lokalt

Installera Node.js och kör:

```sh
npm run dev
```

Öppna adressen som servern visar. Du behöver inte installera några beroenden eller bygga projektet. Låt servern vara igång medan du använder förhandsvisningen. `npm test` kontrollerar schemaberäkningarna och `npm run check` kontrollerar JavaScript-syntaxen.

När `config.js` är tom används schemat i `src/default-data.js`. Ändringar sparas först i webbläsaren. Med `npm run dev` igång sparas de även automatiskt till projektfilen. Hantera visar om sparningen till filen lyckades. Git kan bara skicka filer; webbläsarens lagring följer inte med en push.

### Om du använder Live Server på port 5500

1. Starta `npm run dev` i projektmappen och låt den köra som synkserver på port 5173.
2. Fortsätt i **samma webbläsare på samma adress**, exempelvis `http://127.0.0.1:5500/index.html`. Olika portar och `localhost`/`127.0.0.1` har separata webbläsarkopior.
3. Ladda om sidan. Under **Hantera**, välj **Spara till projektet** för att föra över redan sparade ändringar. Nya ändringar synkas automatiskt medan servern körs.
4. Kontrollera att statusen säger **Sparat i projektfilen**. Ta med `src/default-data.js` i din commit och push till `main`. Därefter publicerar GitHub Actions filen på GitHub Pages.

Om statusen säger **Sparat endast i webbläsaren** följer ändringarna ännu inte med din push. Exportera en säkerhetskopia innan du rensar webbläsaren eller byter adress. Vid versionskonflikt behålls båda kopiorna: exportera webbläsarens schema och jämför med projektfilen. Om säkerhetskopian är den version du vill använda, kör `npm run sync -- "sökväg/till/säkerhetskopia.json"` för att ersätta projektets schema. Kommandot läser bara den valda filen och bevarar även tomma grupper.

## Så fungerar schemat

- Varje team har en gemensam lista med passkoder, arbetstider och färger. Alla teamets grupper väljer från samma lista, medan varje grupp har egna medarbetare och ett eget grundschema. Nya grupper får teamets pass automatiskt. Antalet medarbetare och rotationens längd kan ändras oberoende av varandra.
- Under **Passtider** gäller tillägg och ändringar i teamets alla grupper och schemaversioner, även tidigare versioner och dolda grupper. Ett namnbyte uppdaterar också personliga scheman. Andra team påverkas inte. Befintliga passlistor samlas automatiskt när schemat öppnas: om samma kod har olika tider får den äldre varianten en egen kod med siffersuffix så att arbetstiderna bevaras. Vid enbart färgskillnader används den senaste schemaversionens färg.
- Grundscheman och personliga återkommande anpassningar loopar utan start- eller slutdatum, både framåt och bakåt i kalendern. En vecka upprepas varje vecka; flera veckor rullar i ordning. Under **Stäm av mot jobbets schema** väljer du vilken rotationsvecka varje person är på. En intern referensmåndag håller ordning på rotationen men begränsar inte när den gäller.
- Personen följer sin nuvarande grupp i hela kalendern. Ett gruppbyte byter därför grundschema för alla visade veckor, även tidigare veckor. Det senast sparade gruppschemat används; äldre versioner och placeringsdatum behålls i säkerhetskopian men styr inte veckovyn. Ordinarie personals registreringsdatum begränsar inte loopen. Ett uttryckligt avslutsdatum gäller fortfarande; timvikariers tillgänglighet följer deras anställningsdatum.
- Semester och sjukfrånvaro registreras bara på schemalagda arbetsdagar; lediga dagar hoppas över. Pensionsdagar, ändrade arbetstider och ersättare registreras på bestämda datum. Rotationens veckor fortsätter att gå framåt under frånvaron.
- Tomma rutor i den ursprungliga tabellen betyder ledigt. Visade arbetstimmar är tiden mellan start och slut. Den här versionen räknar inte bort obetalda raster och beräknar inte lön.
- En ersättare kan täcka hela eller delar av ett pass. Kontroller av täckning och överlappning använder de faktiska arbetstiderna. Ersättaren kan tillhöra ett annat team.
- Varje giltig ändring publiceras automatiskt när den sparas. Administratörens privata anteckningar och frånvaroorsaker finns bara i administrationsvyn; kollegorna ser den rensade schemaversionen.

Veckovyn öppnas som en samlad teamtabell med medarbetare på rader och måndag–söndag i kolumner. Passkod, arbetstid, status och ersättare visas tillsammans. På mobilen rullas tabellen i sidled med namnkolumnen låst. Håll inne ett namn för att visa bara den personen och tryck på samma namn igen för att visa alla. Filtret följer med vid veckobyte och återställs vid byte av team. **Redigera veckan** öppnar schemat för redigering. Sparade ändringar av status och ersättare publiceras direkt.

Under **Schema** kan du välja datum och se kalenderveckor och rotationsveckor. En teamlänk öppnar rätt team direkt. QR-koder innehåller en länk och ger ingen behörighet att se privata uppgifter.

Under **Hantera → Personal → välj en timmis** kan du markera personens **Kunskaper**, till exempel Beställning och Avfall. Valen följer avdelningens team, även team som är dolda i schemat. Flera eller inga kunskaper kan väljas. De sparas med personen och visas på personkortet i kolumnen Timmisar. Kunskaperna är information för bemanningen och begränsar inte vilka ersättningspass som kan bokas.

Under **Hantera → Personal → välj en person → Redigera personligt schema** kan du anpassa en ordinarie medarbetares återkommande pass, till exempel vid 80 % anställning. Tabellen visar samma pass och veckor som **Det återkommande grundschemat** och markerar personens rotationsvecka för det valda visningsdatumet. Byt en dags pass till exempelvis **Tjänstledig**, **Semester**, **Ledig**, en annan passkod eller **Egna tider**. Det första alternativet i varje passlista följer gruppschemat. Visningsdatumet flyttar bara markeringen. Personliga ändringar loopar tillsammans med gruppschemat, utan startdatum. Anställningsgraden beräknas automatiskt som personens arbetstid delad med gruppens arbetstid över hela rotationen, utan rastavdrag, avrundat till en decimal. Frånvaro ger noll arbetstid; egna tider och bytta pass räknas med, även över midnatt. Alla dagar lediga ger 0 % och fler timmar än grundschemat kan ge över 100 %. Saknar grundschemat arbetstimmar visas inget procenttal. Personen behåller sin rotationsposition och övriga medarbetare påverkas inte. Anpassningarna hör till gruppens återkommande schema. Återställning till gruppschemat gäller hela loopen. Semester och annan datumstyrd frånvaro gäller ovanpå personens anpassade schema.

## Använd en gemensam, privat arbetsyta

Molnläget använder Supabase-konton med e-post och lösenord samt en skyddad databas. GitHub lagrar webbplatsens publika programfiler. Supabase lagrar uppgifterna om medarbetarna. Läs Supabases dokumentation om [inloggning med lösenord](https://supabase.com/docs/guides/auth/passwords) och [databasens behörigheter](https://supabase.com/docs/guides/database/postgres/row-level-security).

1. Skapa ett Supabase-projekt.
2. Öppna projektets SQL-redigerare och kör hela innehållet i `supabase/schema.sql`.
3. Under **Authentication → Users** skapar du ditt konto med e-post och lösenord. Använd ett bekräftat konto så att du kan logga in. Skapa kollegornas konton på samma sätt. Stäng av offentlig registrering i Supabases inloggningsinställningar: appen ger alla inloggade konton i projektet läsbehörighet till arbetsytan.
4. Ge ditt konto administratörsbehörighet i SQL-redigeraren:

   ```sql
   update public.profiles set role = 'admin'
   where id = (select id from auth.users where email = 'din-riktiga-epost@example.com');
   ```

   Övriga konton behåller rollen `viewer`. Kontoroller kan inte ändras genom appen eller med en användares inloggningstoken i webbläsaren.

5. Lägg in projektets adress och dess publika **publishable/anon-nyckel** i `config.js`:

   ```js
   export const config = {
     supabaseUrl: 'https://DITT-PROJEKT.supabase.co',
     supabaseAnonKey: 'DIN-PUBLIKA-WEBBLASARNYCKEL',
   };
   ```

   Den publika nyckeln är avsedd att synas i webbplatsens källkod. Lägg aldrig en hemlig nyckel eller `service-role`-nyckel, databaslösenord, inloggningstoken, medarbetarexport eller medicinska anteckningar på GitHub. Databasfunktionerna kontrollerar användarens roll innan utkast läses eller ändras.

6. Öppna webbplatsen och logga in som administratör. En ny molnarbetsyta är tom. Under **Hantera** lägger du till ett team eller importerar en JSON-säkerhetskopia från demon. Byt ut exempelnamnen och referensdatumet och spara. Alla sparade ändringar publiceras automatiskt. Även en bekräftad import publiceras direkt.
7. Logga in med ett kollegakonto och kontrollera att det publicerade schemat visas och att kontot inte kan redigera. Kollegor väljer sitt eget namn för att se sitt personliga schema.

Inloggningstoken sparas i flikens sessionslagring. Inloggningen kan förnyas medan fliken är öppen. Den första versionen har ingen egen vy för lösenordsåterställning eller kontoinbjudningar. Hantera konton och lösenordsåterställning i Supabase.

Utkast innehåller frånvarotyper och administratörens anteckningar. Servern tar bort privata anteckningar och orsaker. Sjukfrånvaro, semester och pensionsdagar visas som ledigt eller ändrade arbetstider i det publicerade schemat. Konton med läsbehörighet kan inte läsa utkasttabellen direkt. Privata uppgifter tas bort **innan** svaret skickas till kollegans webbläsare.

Databasen avvisar gamla versionsnummer om två administratörer redigerar samtidigt. Ladda om sidan innan du försöker igen efter en sådan konflikt. Den här versionen använder en gemensam arbetsyta. Alla godkända kollegakonton kan se alla team i den. Separata behörigheter för olika arbetsplatser kräver ytterligare medlemskapsregler.

## Publicera på GitHub Pages

1. Skapa ett publikt GitHub-arkiv och lägg upp programfilerna, inklusive `.github/workflows/pages.yml`.
2. Använd `main` som standardgren eller ändra grenens namn i arbetsflödet så att det stämmer med ditt arkiv.
3. Öppna **Settings → Pages** i arkivet och välj **GitHub Actions** som källa.
4. Skicka ändringarna till `main` eller kör arbetsflödet **Publish schedule to GitHub Pages** manuellt.
5. Öppna adressen som publiceringen visar. Den är vanligtvis `https://DITT-NAMN.github.io/DITT-ARKIV/`.
6. Använd appens delningsverktyg för att skapa en QR-kod för teamet med den publicerade adressen. En QR-kod som pekar på `localhost` fungerar inte på kollegornas telefoner.

När du använder den lokala sidan med `npm run dev` igång sparas hela arbetsytan i `src/default-data.js`: utkast, publicerat schema, personal, team, grupper, personliga scheman, ledigheter och anteckningar. Servern gör ingen automatisk commit eller push. Du tar själv med datafilen i din commit och push till `main`; GitHub Actions publicerar sedan den nya versionen. GitHub Pages och arkivet är publika, så alla som hittar adressen kan se hela arbetsytan. Ändringar direkt på GitHub Pages sparas endast i den aktuella webbläsaren och uppdaterar inte arkivet.

Arbetsflödet publicerar bara webbplatsens filer. SQL-schema, tester, README och säkerhetskopior publiceras inte. Relativa länkar fungerar även när webbplatsen ligger i en undermapp för GitHub-arkivet. GitHub Pages är [tillgängligt för publika arkiv med GitHub Free](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Supabase har en [gratisnivå med begränsningar](https://supabase.com/pricing). Gratisprojekt kan pausas efter inaktivitet. Det här är en möjlig start för ett litet team, inom tjänsternas aktuella gränser. Den lokala installationen skapar inga externa konton och publicerar ingen webbplats.

## Säkerhetskopiera och underhåll

Exportera schemat som en JSON-fil via **Säkerhetskopia** innan större ändringar. När en import bekräftas ersätts och publiceras det aktuella schemat direkt. Förvara säkerhetskopior med medarbetaruppgifter privat. Supabase-projektets säkerhetskopior och lagringstid hanteras separat från exporterna i webbläsaren.

Exporter med `schemaVersion: 1` innehåller schemats data direkt: `teams`, `exceptions` och `publishedAt`. Importen accepterar dessa data, inte webbläsarlagringens omslag med utkast och publicerat schema. Anslutningsfel och behörighetsfel i molnläget visas som felmeddelanden. Molnläget byter aldrig automatiskt till lokal demodata.

För återkommande pensionsdagar väljer du ett datumintervall och de veckodagar där kortare arbetstid eller frånvaro ska gälla. Det skapar individuella datumändringar som kan redigeras senare. Aviseringar, löneberäkning, återkommande frånvaroregler utan slutdatum och koppling mellan inloggning och person ingår ännu inte.

Grundschemat kan redigeras under **Hantera** och varje sparad ändring publiceras direkt. Välj **Ny rotation** för en ny startmåndag och rotationslängd. Den nya versionen publiceras när den skapas. Referensmåndagen och startpositionerna kan sedan ändras i grundschemat. Timanställda kan anges som **Endast ersättare** för att stå utanför den ordinarie rotationen.

### Avdelningar, team och schemagrupper

Hantera börjar med avdelningens gemensamma personallista. En medarbetare kan registreras utan team eller grupp. Team samlar arbetsuppgifter; varje grupp har egna schemaversioner, passtider och rotation. Placeringar har ett startdatum och behåller tidigare grupptillhörighet för historiska scheman.

Äldre arbetsytor anpassas automatiskt i appen: befintliga scheman blir grupper under motsvarande team i ”Min avdelning”. Befintliga ID, arbetstider, startpositioner och individuella ändringar behålls. Anpassningen sparas med nästa ändring eller export. För kompatibilitet med befintliga säkerhetskopior och Supabase ligger schemagrupper fortfarande i JSON-fältet `teams`; organisationen lagras i `departments`, `workTeams` och `employees`. Medarbetarnas `placements` avgör vilken grupp som gäller ett visst datum. Gruppens medlemslista behåller historiska medlemmar.

Administratörs- och läsbehörigheter fungerar som tidigare. Separata avdelningsbehörigheter för chefer och teamledare ingår inte i denna organisationsmodell.
