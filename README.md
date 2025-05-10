# Zeiterfassung

Eine moderne Zeiterfassungs- und Urlaubsverwaltung-Anwendung als Progressive Web App (PWA).

## Features

- Tägliche Zeiterfassung
- Urlaubsverwaltung
- Krankheitstage
- Feiertage
- Überstundenberechnung
- CSV- und PDF-Export
- Backup-Funktionalität
- Dunkles/Lichtes Theme
- Offline-Funktionalität (PWA)

## Installation

1. Klonen Sie das Repository:
```bash
git clone https://github.com/IHR-BENUTZERNAME/zeitplan.git
```

2. Öffnen Sie die `index.html` in Ihrem Browser:
```bash
open index.html
```

Alternativ können Sie einen lokalen Webserver verwenden:

```bash
python3 -m http.server 8000
```

Dann öffnen Sie http://localhost:8000 in Ihrem Browser.

## Verwendung

1. Geben Sie Ihre täglichen Sollstunden ein
2. Geben Sie Ihre Urlaubstage pro Jahr ein
3. Geben Sie gegebenenfalls Resturlaub vom Vorjahr ein
4. Füllen Sie für jeden Arbeitstag die Zeiten aus
5. Verwenden Sie die "Zeitraum hinzufügen"-Funktion für Urlaubstage, Krankheitstage oder Feiertage

## Technische Details

- Frontend: Pure HTML, CSS und JavaScript
- Datenbank: IndexedDB
- Export: CSV und PDF (mit jsPDF)
- PWA-fähig mit Offline-Unterstützung
# Zeiterfassung-1.1
