# NilsServer GitHub Pages Website

Statische GitHub-Pages-Version für **NilsServer.net**.

## Wichtig: Statusdaten

GitHub Pages kann im Browser keinen Minecraft-TCP-Ping ausführen. Diese Version nutzt deshalb **GitHub Actions**:

1. GitHub Action pingt `nilsserver.net` direkt per Minecraft-Server-Ping-Protokoll.
2. Die Action schreibt daraus `status.json`.
3. GitHub Pages veröffentlicht die Website inklusive aktueller `status.json`.
4. Die Website liest nur diese lokale Datei.

Dadurch gibt es keinen Drittanbieter-Statusdienst und kein separates Backend. Der Status ist nicht sekunden-live, wird aber automatisch per Workflow aktualisiert.

## GitHub Pages richtig einstellen

In deinem Repository:

1. Dateien aus diesem ZIP hochladen.
2. GitHub öffnen: `Settings -> Pages`.
3. Bei **Build and deployment** als Source **GitHub Actions** auswählen.
4. `Actions -> Deploy GitHub Pages with Minecraft Status -> Run workflow` einmal manuell starten.

Wenn danach noch `Warte auf Update` angezeigt wird, ist der Workflow noch nicht durchgelaufen oder fehlgeschlagen. Dann unter `Actions` die Logs öffnen.

## Mode-Bilder

Die Karten laden exakt diese Dateien:

```text
assets/pngs/voidsmp.png
assets/pngs/citybuild.png
assets/pngs/freebuild.png
assets/pngs/duels.png
assets/pngs/nilssmp.png
assets/pngs/citys.png
```

GitHub Pages ist bei Dateinamen case-sensitive. Die Namen müssen exakt klein geschrieben sein.

Fehlt eine Datei, wird automatisch ein Fallback angezeigt.

## Lokal testen

```bash
python3 -m http.server 8000
```

Dann öffnen:

```text
http://localhost:8000
```

Der lokale Test zeigt erst echte Serverdaten, wenn `status.json` durch `scripts/update-status.mjs` erzeugt wurde.
