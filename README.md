# Treffpunkt

Videoanalyse für Volleyball: Aktion aufnehmen oder importieren, Bild für Bild durchgehen, einzeichnen, vergleichen.

## Funktionen

- **Aufnehmen oder importieren:** Die Analyse öffnet sich direkt danach. Beim Import bleibt die Originaldatei mit ihrer vollen Bildrate erhalten, z. B. Slo-Mo mit 240 fps.
- **Analyse im Vollbild**
  - Jog-Wheel für Einzelbilder, Zeitlupe von 0,1× bis 1×, A–B-Schleife, Spiegeln
  - Bildrate des Videos immer im Blick
- **Zeichnen:** Freihand, Linie, Pfeil, Kreis und Winkel mit Gradanzeige. Die Zeichnungen werden pro Bild gespeichert.
- **Notizen** mit Zeitstempel
- **Vergleich:** zwei Videos nebeneinander oder untereinander. Erst einzeln ausrichten, dann gemeinsam abspielen.
- **GoPro (HERO9 und neuer):** Aufnahme fernsteuern und Videos mit hoher Bildrate über das Kamera-WLAN übertragen (Open GoPro HTTP API)
- **Export:** Standbild mit Zeichnungen und Originalvideo teilen oder in der Galerie speichern

## Entwicklung

Expo SDK 58, Expo Router, expo-video, expo-sqlite.

```bash
npm install
npx expo start          # mit Expo Go scannen; --tunnel, wenn das WLAN blockiert
npx expo lint
npx tsc --noEmit
```

Neue Pakete immer mit `npx expo install <paket>` hinzufügen.

## Aufbau

| Pfad | Inhalt |
| --- | --- |
| `src/app/` | Screens: Videos, Analyse, Vergleich, GoPro |
| `src/components/` | Jog-Wheel, Zeichenebene, Standbild-Export, Logo, Buttons |
| `src/hooks/use-frame-player.ts` | Videoplayer mit bildgenauem Springen |
| `src/lib/` | Datenbank, GoPro-Schnittstelle, Export, Formatierung |
| `src/constants/theme.ts` | Hallen-Palette, Schriften, Abstände |
| `assets/logo/` | Logo als SVG |

## Design

Die Farben kommen aus der Volleyballhalle: Freizone-Blau `#0F2350`, Spielfeld-Orange `#FF6B1A`, Ball-Gelb `#FFD23F` und Netzband-Weiß `#F3F5FA`. Die Schriften sind Saira für Text und Saira ExtraCondensed für Zahlen und Überschriften. Das Logo zeigt den Ball, wie er Bild für Bild zum Treffpunkt steigt, im Sucherrahmen einer Kamera.

## Grenzen in Expo Go

- Die eigene Kamera der App filmt nicht mit wählbarer Bildrate. Für hohe fps nimmst du in der System-Kamera im Slo-Mo-Modus auf und importierst das Video, oder du nutzt eine GoPro.
- Videos mit eingebrannten Zeichnungen und das GoPro-Livebild brauchen einen eigenen Build (`eas build --profile development`).
