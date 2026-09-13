# Fixuri și verificare locală fără Docker

Modificările corectează atribuirea grupelor din endpointul de personal, accesul
la prezență, starea păstrată între conturi, încărcarea paginii de prezență,
salvarea câmpurilor contractului și totalurile financiare.

Migrația `20260909000002_attendance_financial_integrity.sql` limitează educatorii
la grupele proprii active și verifică apartenența copilului. Administratorii
rămân limitați la grădinițele atribuite, iar Super Admin are acces fără o
apartenență explicită. Relațiile factură–copil, plată–factură și
prezență–copil/grupă verifică acum și grădinița prin chei externe compuse.
Numele cheilor externe existente sunt păstrate pentru relațiile PostgREST.

Migrația `20260909000003_invoice_aggregates.sql` adaugă agregări SQL pentru
facturi și plăți confirmate. Funcțiile rulează cu privilegiile apelantului;
RLS se aplică și totalurilor. Sunt incluse și facturile cu starea explicită
`overdue` în totalul restant și numărul facturilor în așteptare.

Fluxul de personal validează grupa înainte de crearea contului și folosește
drepturile apelantului pentru atribuire. Crearea contului Auth și operațiile
SQL rămân apeluri separate: un eșec ulterior poate lăsa contul creat, dar
eșecul atribuirii nu mai este raportat ca succes.

Testele SQL rulează cu [PGlite și pgTAP](https://pglite.dev/extensions/),
direct în Node, într-o bază PostgreSQL temporară în memorie:

```sh
npm run test
npm run test:db
npm run db:types:sync -- --check
npm run typecheck
npm run lint
npm run build
```

Pentru un singur fișier SQL: `npm run test:db -- --filter invoice_aggregates`.
Runnerul aplică migrațiile din repository și datele fictive din `seed.sql`.
Cele patru migrații de import/demo din 8 septembrie (09, 13, 14, 16) sunt
excluse explicit, astfel registrul real nu este încărcat în teste.
Scenariile rulează în tranzacții anulate după verificare. Orice aserțiune TAP
eșuată sau diferență între numărul planificat și cel executat oprește comanda.

Schema minimă `auth`/`storage` din bootstrap reproduce suprafața SQL necesară
politicilor. Aceste teste verifică migrații, RLS și constrângeri PostgreSQL;
nu pornesc serviciile HTTP Supabase Auth/Storage și nu înlocuiesc testele E2E.
Nu folosesc `.env`, acces la baza găzduită sau Docker.

`db:types:sync` regenerează din catalogul migrat cele patru relații modificate
și cele două funcții noi. Păstrează celelalte câmpuri generate existente;
nu este un generator complet pentru întreaga schemă Supabase.

CI include acum testele SQL, verificarea acestor tipuri și buildul de producție.
Migrațiile sunt pregătite în repository, fără aplicare pe baza găzduită.
Validarea cheilor externe oprește aplicarea dacă există deja relații între
grădinițe diferite; nu rescrie sau șterge automat datele respective.
