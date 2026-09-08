# Dashboard Page — Design Gaps

Reference mockup: `design/mockups/admin_dashboard_final/screen.png`

---

## Layout general

Mockup-ul are 3 rânduri distincte:
1. **Stat cards** (4 în linie)
2. **Rând mijloc**: Recent Activity (2/3 lățime) + Quick Actions + Facility Reminder (1/3)
3. **Rând jos**: Active Groups table (2/3) + Staff on Duty (1/3)

Implementarea curentă are: stat cards → Quick Actions (1 col) + Active Groups (2 col). Layout greșit și mult mai sărac în conținut.

---

## Diferențe concrete

### 1. Stat cards — cosmetic
**Mockup:** `rounded-2xl` + shadow subtil  
**Current:** `rounded-xl` fără shadow  
**Fix:** Adaugă `rounded-2xl shadow-[0_1px_3px_rgba(16,24,40,0.04)]` (minor, fix rapid)

### 2. Quick Actions — layout și conținut
**Mockup:** Grilă 2×2 de tile-uri cu icon mare centrat + label: "New Student", "Broad Cast", "Inventory", "Schedule"  
**Current:** Listă simplă cu un singur link ("Invite Staff")  
**Fix V1:** Tile-uri 2×2 pentru: "Adaugă copil" → `/children`, "Invită personal" → `/staff`, "Grupe" → `/groups`, "Copii" → `/children` (sau alt shortcut relevant)

### 3. Recent Activity feed — lipsește complet
**Mockup:** Feed cronologic cu avatar, descriere eveniment, timestamp (ex: "Leo Martinez was checked in by parent. Group: Little Explorers • Staff: Emily Chen — 08:12 AM")  
**Current:** Nu există  
**Sursa datelor:** `audit_logs` table (deja există în DB)  
**Fix:** Componenta `RecentActivityFeed.vue` care citește ultimele N intrări din `audit_logs` pentru kindergarten-ul selectat. Necesită query + UI.

### 4. Active Groups table — coloane diferite
**Mockup:** GROUP NAME | STAFF LEAD | RATIO (1:5) | ATTENDANCE | STATUS (Healthy/Check)  
**Current:** Group | Age Range | Educator  
**Fix parțial V1:** Adaugă coloana "Children" (count). RATIO și ATTENDANCE depind de modulul Attendance (deferred). STATUS badge poate fi adăugat (active/archived).

### 5. Staff on Duty panel — lipsește complet
**Mockup:** Panel dreapta jos cu "Staff on Duty • 16 Active", listă staff cu avatar + nume + titlu + număr  
**Current:** Nu există  
**Fix:** Query pe `staff` filtrat după kindergarten, afișat ca listă compactă în sidebar-ul dashboard-ului

### 6. Facility Reminder card — lipsește, posibil out of scope
**Mockup:** Card dark-teal cu titlu "Facility Reminder", text reminder, buton "Acknowledge"  
**Current:** Nu există  
**Decizie:** Probabil out of scope V1 — necesită un sistem de notificări/anunțuri

### 7. Attendance stat card — placeholder în loc de date reale
**Mockup:** Arată "94%" (procent real de prezență)  
**Current:** Text "Modulul prezență vine în curând"  
**Fix:** Rămâne placeholder până se construiește modulul Attendance (deferred)

---

## Prioritate sugerată

| # | Item | Efort | Impact vizual |
|---|------|-------|---------------|
| 1 | Stat cards rounded-2xl + shadow | mic | mic |
| 2 | Quick Actions — grilă 2×2 | mic | mare |
| 3 | Active Groups — coloană status + children count | mic | mediu |
| 4 | Staff on Duty panel | mediu | mare |
| 5 | Recent Activity feed | mare | mare |
| 6 | Facility Reminder | mare | mediu |
