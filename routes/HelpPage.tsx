import React from 'react';
import { InformationCircleIcon, PageTitle } from '../components/ui';

export const HelpPage: React.FC = () => {
  const sections = [
    {
      title: 'Über diese Anwendung',
      body: 'RATISA ist eine auf Basis der Stadt-APIs und der OParl-Schnittstellen der Stadt Köln erstellte Anwendung. Ziel ist es, Ratsinformationen verständlicher, strukturierter und leichter zugänglich zu machen.',
    },
    {
      title: 'Projektstatus und Haftung',
      body: 'Die Anwendung befindet sich in der Testphase. Trotz sorgfältiger Entwicklung wird keine Gewähr für Vollständigkeit, Aktualität oder Fehlerfreiheit übernommen. Für Folgen aus fehlerhaften, unvollständigen oder missverstandenen Inhalten wird keine Haftung übernommen. Verbindlich bleiben die offiziellen Veröffentlichungen der Stadt Köln.',
    },
    {
      title: 'Hinweis KI',
      body: 'Für KI-gestützte Funktionen wird derzeit Gemini 2.5 Flash verwendet. KI-Ausgaben können unvollständig oder fehlerhaft sein und müssen vor jeder Weiterverwendung geprüft werden. Im Sinne der Transparenzanforderungen des EU AI Act wird der Einsatz generativer KI ausdrücklich offengelegt; KI-Ergebnisse dienen nur der Unterstützung und ersetzen keine amtliche, fachliche oder rechtliche Prüfung.',
    },
    {
      title: 'So nutzen Sie RATISA',
      body: 'Am schnellsten funktioniert die Anwendung, wenn Sie mit einer klaren Frage oder einem konkreten Thema starten und danach die Filter auf der jeweiligen Seite schrittweise verengen.',
      bullets: [
        'Suche: Freitext für Sitzungen, Vorlagen, Personen und Gremien.',
        'Sitzungen / Vorlagen: Nutzen Sie Suchfeld, Datum und Seitennavigation zur Eingrenzung.',
        'Themenatlas: Erst Datenquelle und Treffergenauigkeit wählen, dann Bezirke auf der Karte oder über die Bezirkschips filtern.',
      ],
    },
    {
      title: 'Themenatlas lesen',
      body: 'Der Themenatlas ordnet Sitzungen anhand von Orts-, Bezirks- und Stadtteilbegriffen räumlich zu. Die Karte zeigt daher keine exakte Geoposition einer Sitzung, sondern eine textbasierte Zuordnung zu Bezirken.',
      bullets: [
        '"Alle" kombiniert aktuelle Sitzungen mit dem Archiv.',
        '"Aktuell" zeigt nur laufende Daten aus der OParl-Abfrage, "Archiv" nur vorberechnete Archivtreffer.',
        '"Eher sicher" blendet schwächere Zuordnungen aus, "Nur sicher" zeigt nur klare Bezirksbezüge.',
      ],
    },
  ];

  return (
    <div className="animate-in fade-in duration-300 max-w-4xl mx-auto py-8">
      <PageTitle
        title="Hilfe / Informationen"
        subtitle="Hinweise zur Anwendung, Datenquelle und KI-Nutzung"
      />

      <div className="grid grid-cols-1 gap-6">
        {sections.map((section) => (
          <section
            key={section.title}
            className="app-surface p-8"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-app-info/10 p-3 text-app-info">
                <InformationCircleIcon />
              </div>
              <div>
                <h2 className="mb-3 text-xl font-semibold text-app-text">{section.title}</h2>
                <p className="leading-relaxed text-app-text">{section.body}</p>
                {'bullets' in section && section.bullets ? (
                  <ul className="mt-4 space-y-2 text-sm leading-relaxed text-app-muted">
                    {section.bullets.map((bullet) => (
                      <li key={bullet}>{bullet}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default HelpPage;
