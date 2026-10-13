# Skift

Ett mobilvänligt arbetsschema med personligt schema, teamöversikt och verktyg för administratören. Gränssnittet är på svenska. Exemplet använder den angivna rotationen på 11 veckor, med sju exempelmedarbetare som börjar på olika positioner. Måndag 12 oktober 2026 är **exemplets** referensdatum. Byt ut namnen och ange er verkliga referensmåndag innan ni börjar använda schemat.

## Prova lokalt

Installera Node.js och kör:

```sh
npm run dev
```

Öppna adressen som servern visar. Du behöver inte installera några beroenden eller bygga projektet. Låt servern vara igång medan du använder förhandsvisningen. `npm test` kontrollerar schemaberäkningarna och `npm run check` kontrollerar JavaScript-syntaxen.

När `config.js` är tom används det förkonfigurerade schemat i `src/default-data.js`. När du gör ändringar lokalt med `npm run dev` sparas de automatiskt till `src/default-data.js`. Om du redigerar i en separat webbläsare eller Live Server kan du köra `npm run sync` för att synka dina senaste ändringar direkt till projektfilen innan du pushar till Git. Alla medarbetare och inställningar följer då med till GitHub och GitHub Pages! Exportera även gärna en JSON-fil via **Säkerhetskopia** som extra backup.

## Så fungerar schemat

- Varje team har egna passkoder, arbetstider, medarbetare och rotationsversioner. Antalet medarbetare och rotationens längd kan ändras oberoende av varandra.
- En rotationsversion har en startmåndag, en referensmåndag, en återkommande tabell med veckor och en startposition för varje medarbetare.
- När rotationen ändras skapas en ny version från den valda måndagen. Tidigare datum använder fortfarande den äldre versionen. En medarbetare tas bort från ett valt slutdatum, så att tidigare arbetspass finns kvar.
- Semester, sjukfrånvaro, pensionsdagar, ändrade arbetstider och ersättare registreras på bestämda datum. Rotationens veckor fortsätter att gå framåt under frånvaron.
- Tomma rutor i den ursprungliga tabellen betyder ledigt. Visade arbetstimmar är tiden mellan start och slut. Den här versionen räknar inte bort obetalda raster och beräknar inte lön.
- En ersättare kan täcka hela eller delar av ett pass. Kontroller av täckning och överlappning använder de faktiska arbetstiderna. Ersättaren kan tillhöra ett annat team.
- Sparade utkast och publicerade scheman hålls isär. Kollegorna ser det senast publicerade schemat. Administratören kan förhandsgranska det innan det delas.

Veckovyn öppnas som en samlad teamtabell med medarbetare på rader och måndag–söndag i kolumner. Passkod, arbetstid, status och ersättare visas tillsammans. På mobilen rullas tabellen i sidled med namnkolumnen låst. Schemat visar alltid hela teamet. **Redigera veckan** öppnar utkastet där status och ersättare kan ändras och sedan publiceras.

Under **Schema** kan du välja datum och se kalenderveckor och rotationsveckor. En teamlänk öppnar rätt team direkt. QR-koder innehåller en länk och ger ingen behörighet att se privata uppgifter.

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

6. Öppna webbplatsen och logga in som administratör. En ny molnarbetsyta är tom. Under **Hantera** lägger du till ett team eller importerar en JSON-säkerhetskopia från demon. Byt ut exempelnamnen och referensdatumet, spara utkastet och välj sedan **Publicera ändringar**. Import ändrar bara utkastet.
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

Arbetsflödet publicerar bara webbplatsens filer. SQL-schema, tester, README och säkerhetskopior publiceras inte. Relativa länkar fungerar även när webbplatsen ligger i en undermapp för GitHub-arkivet. GitHub Pages är [tillgängligt för publika arkiv med GitHub Free](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages).

Supabase har en [gratisnivå med begränsningar](https://supabase.com/pricing). Gratisprojekt kan pausas efter inaktivitet. Det här är en möjlig start för ett litet team, inom tjänsternas aktuella gränser. Den lokala installationen skapar inga externa konton och publicerar ingen webbplats.

## Säkerhetskopiera och underhåll

Exportera administratörens utkast som en JSON-fil via **Säkerhetskopia** innan större ändringar. När en säkerhetskopia importeras ersätts det aktuella utkastet. Granska det och välj **Publicera ändringar** när det är klart. Förvara säkerhetskopior med medarbetaruppgifter privat. Supabase-projektets säkerhetskopior och lagringstid hanteras separat från exporterna i webbläsaren.

Exporter med `schemaVersion: 1` innehåller schemats data direkt: `teams`, `exceptions` och `publishedAt`. Importen accepterar dessa data, inte webbläsarlagringens omslag med utkast och publicerat schema. Anslutningsfel och behörighetsfel i molnläget visas som felmeddelanden. Molnläget byter aldrig automatiskt till lokal demodata.

För återkommande pensionsdagar väljer du ett datumintervall och de veckodagar där kortare arbetstid eller frånvaro ska gälla. Det skapar individuella datumändringar som kan redigeras senare. Aviseringar, löneberäkning, återkommande frånvaroregler utan slutdatum och koppling mellan inloggning och person ingår ännu inte.

Publicerade rotationsversioner är låsta för redigering. Välj **Ny rotation** under **Hantera** för att ange en ny startmåndag och rotationslängd. Granska sedan det kopierade mönstret och medarbetarnas startpositioner. I ett opublicerat utkast kan du använda **Redigera startdatum** för att ändra referensmåndagen. Timanställda kan anges som **Endast ersättare** för att stå utanför den ordinarie rotationen.
