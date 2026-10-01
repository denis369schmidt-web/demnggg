# Outbreak Hero – Zombie-Roguelite (Android / PWA)

Room-Clearing-Shooter: Laufen = ausweichen, **Stehenbleiben = automatisch schießen**.
Räume säubern, durch die Tür nach oben, bei jedem Level-Up 1 von 3 Skills wählen.

## Inhalt
- **7 Waffen** (Pistole, Schrotflinte, MP, Armbrust, Flammenwerfer, Scharfschützengewehr, Granatwerfer) – kaufen & bis Stufe 10 upgraden
- **24 Skills** pro Run (Mehrfachschuss, Doppellauf, Diagonal-/Seiten-/Rückenschüsse, Durchschlag, Querschläger, Abpraller, Brand/Kryo/Toxin, Kreissägen, Kampfdrohne, Exekution, Zweites Leben, …)
- **6 Zombie-Typen** + **2 Bosse** (Abscheulichkeit mit Sturmangriff/Projektil-Ring, Brutmutter mit Brut-Spawns), beide mit Phase 2 ab 50% HP
- **Kapitel à 20 Räume**, Versorgungsräume (5, 15), Bosse (10, 20), danach endlos skalierend
- **Talente** (HP, Schaden, Tempo, Münzbonus) – permanente Meta-Progression, gespeichert in `localStorage`
- Schwebender Touch-Joystick, Tastatur (WASD/Pfeile, P = Pause), Vibration, synthetischer Sound, offline-fähig

## Lokal starten
```
python3 -m http.server 8080
# http://localhost:8080/zombie/
```

## Auf Android bringen
1. **Sofort (PWA):** Ordner auf HTTPS hosten (z. B. GitHub Pages) → in Chrome öffnen → „Zum Startbildschirm hinzufügen“. Läuft im Vollbild & offline.
2. **Play Store (TWA):** `npx @bubblewrap/cli init --manifest https://<domain>/zombie/manifest.webmanifest` → `bubblewrap build` → signierte `.aab` hochladen.
3. **Alternative (Capacitor):** `npm i @capacitor/core @capacitor/cli @capacitor/android` → `npx cap init` mit `webDir: "zombie"` → `npx cap add android` → in Android Studio bauen.

Für den Store werden zusätzlich PNG-Icons (192/512 px) benötigt.
