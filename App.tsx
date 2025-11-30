import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { MemoryRouter as Router, Routes, Route, Link, NavLink, useParams, useNavigate, useLocation } from 'react-router-dom';
import { useOparlList, useOparlItem } from './hooks/useOparl';
import { getList, getItem } from './services/oparlApiService';
import { askGemini, Attachment, parseSearchQuery } from './services/aiService';
import { useFavorites } from './hooks/useFavorites';
import { Meeting, Paper, Person, Organization, AgendaItem, Consultation, File as OparlFile, Location as OparlLocation } from './types';
import { LoadingSpinner, ErrorMessage, Card, Pagination, PageTitle, DetailSection, DetailItem, DownloadLink, CalendarDaysIcon, DocumentTextIcon, HomeIcon, UsersIcon, BuildingLibraryIcon, LinkIcon, GeminiCard, SparklesIcon, TableSkeleton, FavoriteButton, StarIconSolid, ArchiveBoxIcon, MagnifyingGlassIcon, CommandLineIcon } from './components/ui';

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard', icon: <HomeIcon /> },
  { path: '/search', label: 'Suche', icon: <MagnifyingGlassIcon /> },
  { path: '/meetings', label: 'Sitzungen', icon: <CalendarDaysIcon /> },
  { path: '/archive', label: 'Archiv', icon: <ArchiveBoxIcon /> },
  { path: '/papers', label: 'Vorlagen', icon: <DocumentTextIcon /> },
  { path: '/people', label: 'Personen', icon: <UsersIcon /> },
  { path: '/organizations', label: 'Gremien', icon: <BuildingLibraryIcon /> },
  { path: '/mcp', label: 'MCP Server', icon: <CommandLineIcon /> },
];

// Helper to encode URL for router param - URL SAFE BASE64
const encodeUrl = (url: string) => {
    return btoa(encodeURIComponent(url))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
};

const decodeUrl = (encoded: string) => {
    try {
        let str = encoded.replace(/-/g, '+').replace(/_/g, '/');
        while (str.length % 4) str += '=';
        return decodeURIComponent(atob(str));
    } catch (e) {
        console.error("Failed to decode URL:", encoded);
        return "";
    }
};

// Helper for consistent date formatting
const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        if (isNaN(date.getTime())) return `Ungültiges Datum`;

        return new Intl.DateTimeFormat('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }).format(date).replace(',', '');
    } catch (e) {
        return `Formatierungsfehler`;
    }
};

const formatDateOnly = (dateStr?: string) => {
    if (!dateStr) return '';
    try {
        const date = new Date(dateStr);
        return new Intl.DateTimeFormat('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(date);
    } catch (e) { return ''; }
};

// Helper for sorting meetings chronologically
const getMeetingTimestamp = (dateStr?: string) => {
    if (!dateStr) return -1;
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? -1 : date.getTime();
};

const sortMeetingsAsc = (a: Meeting, b: Meeting) => {
    const timeA = getMeetingTimestamp(a.start);
    const timeB = getMeetingTimestamp(b.start);
    
    if (timeA === -1 && timeB === -1) return 0;
    if (timeA === -1) return 1;
    if (timeB === -1) return -1;

    const diff = timeA - timeB;
    if (diff !== 0) return diff;
    return (a.name || '').localeCompare(b.name || '');
};

const sortMeetingsDesc = (a: Meeting, b: Meeting) => {
    const timeA = getMeetingTimestamp(a.start);
    const timeB = getMeetingTimestamp(b.start);
    
    if (timeA === -1 && timeB === -1) return 0;
    if (timeA === -1) return 1;
    if (timeB === -1) return -1;

    const diff = timeB - timeA;
    if (diff !== 0) return diff;
    return (a.name || '').localeCompare(b.name || '');
};

// Stop words for keyword extraction
const STOP_WORDS = new Set([
    'der', 'die', 'das', 'und', 'in', 'von', 'für', 'mit', 'an', 'den', 'im', 'auf', 'des', 'ist', 'eine', 'zu', 'bei', 
    'stadt', 'köln', 'bezirksvertretung', 'ausschuss', 'rat', 'sitzung', 'antrag', 'mitteilung', 'beschlussvorlage', 
    'anfrage', 'änderungsantrag', 'niederschrift', 'betreff', 'vorlage', 'verwaltung', 'top', 'dem', 'zur', 'über', 
    'durch', 'oder', 'sowie', 'sich', 'aus', 'ein', 'einer', 'eines', 'zum', 'als', 'nach', 'vom', 'dass', 'wir', 
    'ihr', 'sie', 'werden', 'wurde', 'diese', 'dieser', 'dieses', 'vor', 'unter', 'hier', 'dort', 'alle', 'einen',
    'koeln', 'gemäß', 'betr', 'wg', 'bzgl', 'anlage', 'anlagen'
]);

// Layout Components
const Header: React.FC = () => {
    const location = useLocation();
    const pathnames = location.pathname.split('/').filter(x => x);
    const [isMenuOpen, setIsMenuOpen] = useState(false);

    const routeNameMap: Record<string, string> = {
        meetings: 'Sitzungen',
        papers: 'Vorlagen',
        people: 'Personen',
        organizations: 'Gremien',
        archive: 'Archiv',
        search: 'Suche',
        mcp: 'MCP Server'
    };

    return (
        <header className="bg-gray-900/80 backdrop-blur-md border-b border-gray-800 p-4 sticky top-0 z-30 h-16 flex items-center justify-between">
            <div className="flex items-center">
                <Link to="/" className="flex items-center space-x-3 group">
                    <span className="text-2xl transform group-hover:scale-110 transition-transform duration-200">🏛️</span>
                    <div>
                        <h1 className="text-lg font-bold text-white tracking-tight">RATISA</h1>
                        <p className="text-[10px] text-gray-400 uppercase tracking-wider font-semibold">Köln Ratinformation System Assistent</p>
                    </div>
                </Link>

                 {/* Breadcrumbs - Desktop */}
                {pathnames.length > 0 && (
                    <nav className="hidden md:flex items-center text-sm text-gray-400 ml-8 pl-8 border-l border-gray-700 h-8">
                        {pathnames.map((value, index) => {
                            const to = `/${pathnames.slice(0, index + 1).join('/')}`;
                            const isLast = index === pathnames.length - 1;
                            const displayName = routeNameMap[value] || 'Details';

                            return (
                                <React.Fragment key={to}>
                                    {index > 0 && <span className="mx-2 text-gray-600">/</span>}
                                    {isLast ? (
                                        <span className="text-white font-medium truncate max-w-[200px] bg-gray-800/50 px-2 py-0.5 rounded">{displayName}</span>
                                    ) : (
                                        <Link to={to} className="hover:text-white transition-colors hover:bg-gray-800 px-2 py-0.5 rounded">
                                            {displayName}
                                        </Link>
                                    )}
                                </React.Fragment>
                            );
                        })}
                    </nav>
                )}
            </div>
            
            {/* Mobile Menu Toggle could go here if sidebar wasn't always visible/bottom on mobile */}
        </header>
    );
};

const Sidebar: React.FC = () => (
    <nav className="p-4 space-y-1 h-full overflow-y-auto">
        <div className="mb-6 px-3">
             <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Menü</p>
        </div>
        {NAV_ITEMS.map(item => (
            <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                    `flex items-center px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 group ${
                        isActive
                            ? 'bg-gradient-to-r from-red-600 to-red-700 text-white shadow-lg shadow-red-900/20'
                            : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                    }`
                }
            >
                {({ isActive }) => (
                    <>
                        <span className={`transition-colors duration-200 ${isActive ? 'text-white' : 'text-gray-500 group-hover:text-white'}`}>
                            {item.icon}
                        </span>
                        <span className="ml-3 hidden md:inline">{item.label}</span>
                        {/* Mobile: Show label only for active item or all if needed. For now sticking to design */}
                        <span className="ml-3 md:hidden inline-block text-xs">{item.label}</span>
                    </>
                )}
            </NavLink>
        ))}
    </nav>
);

const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="h-screen flex flex-col md:flex-row overflow-hidden bg-[#0f111a] text-gray-100 font-sans selection:bg-red-500/30">
        {/* Subtle background mesh */}
        <div className="fixed inset-0 z-0 pointer-events-none opacity-20" style={{
            backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(99, 102, 241, 0.1) 0%, transparent 20%), radial-gradient(circle at 90% 80%, rgba(220, 38, 38, 0.08) 0%, transparent 20%)'
        }}></div>

        <aside className="w-full md:w-64 bg-[#111827]/95 backdrop-blur border-r border-gray-800 flex-shrink-0 flex flex-col md:h-full h-auto z-20 shadow-xl">
             {/* Mobile: Header is separate, but sidebar contains logic */}
            <div className="hidden md:block">
                 {/* Sidebar Header Space if needed, currently main header is top full width */}
            </div>
            <div className="hidden md:block flex-1 py-4">
                <Sidebar />
            </div>
            
            {/* Mobile Bottom Navigation */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 bg-[#161b22]/95 backdrop-blur-lg border-t border-gray-800 flex justify-around p-2 z-50 safe-area-bottom">
                 {NAV_ITEMS.slice(0, 5).map(item => (
                    <NavLink 
                        key={item.path} 
                        to={item.path}
                        className={({isActive}) => `flex flex-col items-center justify-center p-2 rounded-lg ${isActive ? 'text-red-500' : 'text-gray-500'}`}
                    >
                         {item.icon}
                         <span className="text-[10px] mt-1">{item.label}</span>
                    </NavLink>
                 ))}
            </div>
        </aside>

        <div className="flex-1 flex flex-col h-full relative z-10">
            <Header />
            <main className="flex-1 p-4 md:p-8 overflow-y-auto scroll-smooth pb-24 md:pb-8">
                <div className="max-w-7xl mx-auto w-full">
                    {children}
                </div>
            </main>
        </div>
    </div>
);

// --- Charts & Statistics ---

interface PartyStats {
    name: string;
    count: number;
    percentage: number;
}

const PartyActivityChart: React.FC<{ year?: string }> = ({ year: targetYear }) => {
    // ... (Logik bleibt identisch, nur Styling update)
    const [stats, setStats] = useState<PartyStats[]>([]);
    const [year, setYear] = useState<string>(targetYear || '');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryTrigger, setRetryTrigger] = useState(0);

    useEffect(() => {
        const controller = new AbortController();
        const fetchStats = async () => {
            try {
                setLoading(true);
                setError(null);
                const params = new URLSearchParams();
                params.set('limit', '200');
                params.set('sort', '-date');
                const result = await getList<Paper>('papers', params, controller.signal);
                if (controller.signal.aborted) return;

                let activeYear = targetYear;
                if (!activeYear) {
                    const years = new Set<string>();
                    result.data.forEach(p => { if (p.date) years.add(p.date.substring(0, 4)); });
                    activeYear = Array.from(years).sort().reverse()[0] || new Date().getFullYear().toString();
                }
                setYear(activeYear);
                const counts = new Map<string, number>();
                let totalCount = 0;
                result.data.forEach(paper => {
                    if (paper.date && paper.date.startsWith(activeYear)) {
                        const isMotion = (paper.paperType?.toLowerCase().includes('antrag')) || (paper.name?.toLowerCase().includes('antrag'));
                        if (isMotion && paper.originator?.length) {
                            paper.originator.forEach(orgUrl => {
                                counts.set(orgUrl, (counts.get(orgUrl) || 0) + 1);
                                totalCount++;
                            });
                        }
                    }
                });

                if (totalCount === 0) {
                    if (!controller.signal.aborted) { setStats([]); setLoading(false); }
                    return;
                }

                const sortedEntries = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 8);
                const statsPromises = sortedEntries.map(async ([url, count]) => {
                    if (controller.signal.aborted) return null;
                    try {
                        const org = await getItem<Organization>(url, controller.signal);
                        return { name: org.name || org.shortName || 'Unbekannt', count, percentage: (count / totalCount) * 100 };
                    } catch (e) { return { name: 'Unbekannt', count, percentage: (count/totalCount)*100 }; }
                });
                const fetchedStats = await Promise.all(statsPromises);
                if (!controller.signal.aborted) {
                    setStats(fetchedStats.filter((s): s is PartyStats => s !== null));
                    setLoading(false);
                }
            } catch (err) {
                if (err instanceof DOMException && err.name === 'AbortError') return;
                if (!controller.signal.aborted) { setError("Daten konnten nicht geladen werden."); setLoading(false); }
            }
        };
        fetchStats();
        return () => { controller.abort(); };
    }, [targetYear, retryTrigger]);

    if (loading) return <div className="h-48 flex items-center justify-center"><LoadingSpinner /></div>;
    if (error) return <div className="text-red-400 text-sm p-4 bg-red-900/20 rounded-lg">{error}</div>;
    
    return (
        <div>
             <div className="flex justify-between items-end mb-6">
                <p className="text-sm text-gray-400">Anträge pro Fraktion ({year})</p>
                <span className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">Top 8</span>
             </div>
            {stats.length === 0 ? (
                <div className="p-8 text-center text-gray-500 bg-gray-900/50 rounded-lg border border-gray-800 border-dashed">Keine Daten für {year}.</div>
            ) : (
                <div className="space-y-4">
                    {stats.map((stat, index) => (
                        <div key={index} className="group">
                            <div className="flex justify-between text-xs mb-1.5">
                                <span className="font-semibold text-gray-300 group-hover:text-white transition-colors">{stat.name}</span>
                                <span className="text-gray-400 font-mono">{stat.count}</span>
                            </div>
                            <div className="w-full bg-gray-700/30 rounded-full h-2.5 overflow-hidden ring-1 ring-white/5">
                                <div 
                                    className="bg-gradient-to-r from-red-600 to-orange-600 h-full rounded-full transition-all duration-1000 ease-out relative" 
                                    style={{ width: `${stat.percentage}%` }}
                                >
                                    <div className="absolute inset-0 bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ... (SimplePieChart & OrganizationTypeChart Logik bleibt weitgehend gleich, aber visueller Refresh)
const SimplePieChart: React.FC<{ data: { name: string; value: number; color: string }[] }> = ({ data }) => {
    const total = data.reduce((acc, item) => acc + item.value, 0);
    let currentAngle = 0;
    if (total === 0) return null;

    if (data.length === 1) {
        return (
             // ... single circle code
             <div className="relative w-40 h-40 mx-auto">
                <svg viewBox="-100 -100 200 200" className="w-full h-full drop-shadow-xl">
                    <circle cx="0" cy="0" r="100" fill={data[0].color} />
                    <circle cx="0" cy="0" r="70" fill="#1f2937" />
                </svg>
                 <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center">
                        <span className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Gesamt</span>
                        <span className="text-white text-lg font-bold block">{total}</span>
                    </div>
                </div>
             </div>
        );
    }

    return (
        <div className="relative w-40 h-40 mx-auto">
            <svg viewBox="-100 -100 200 200" className="w-full h-full transform -rotate-90 drop-shadow-xl">
                {data.map((item) => {
                    const percentage = item.value / total;
                    const angle = percentage * 360;
                    const largeArcFlag = angle > 180 ? 1 : 0;
                    const r = 100;
                    const startRad = (currentAngle * Math.PI) / 180;
                    const endRad = ((currentAngle + angle) * Math.PI) / 180;
                    const x1 = r * Math.cos(startRad);
                    const y1 = r * Math.sin(startRad);
                    const x2 = r * Math.cos(endRad);
                    const y2 = r * Math.sin(endRad);
                    const path = `M 0 0 L ${x1} ${y1} A ${r} ${r} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`;
                    currentAngle += angle;
                    return <path key={item.name} d={path} fill={item.color} stroke="#1f2937" strokeWidth="4" className="hover:opacity-80 transition-opacity cursor-pointer" />;
                })}
                <circle cx="0" cy="0" r="70" fill="#1f2937" />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="text-center">
                    <span className="text-gray-400 text-[10px] uppercase font-bold tracking-wider">Gesamt</span>
                    <span className="text-white text-lg font-bold block">{total}</span>
                </div>
            </div>
        </div>
    );
};

const OrganizationTypeChart: React.FC = () => {
    // ... (logic identical, just better UI wrapper)
    const [stats, setStats] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [retryTrigger, setRetryTrigger] = useState(0);
    const COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#0ea5e9'];

    useEffect(() => {
        const controller = new AbortController();
        const fetchTypes = async () => {
             try {
                setLoading(true);
                setError(null);
                const params = new URLSearchParams('limit=200');
                const result = await getList<Organization>('organizations', params, controller.signal);
                const counts = new Map<string, number>();
                let totalCount = 0;
                result.data.forEach(org => {
                    const type = org.organizationType || org.classification || 'Sonstige';
                    counts.set(type, (counts.get(type) || 0) + 1);
                    totalCount++;
                });
                if (totalCount === 0) { setLoading(false); return; }
                const sortedStats = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([name, count], index) => ({ name, count, percentage: (count / totalCount) * 100, color: COLORS[index % COLORS.length] }));
                if (!controller.signal.aborted) { setStats(sortedStats); setLoading(false); }
            } catch (e) { if (!controller.signal.aborted) { setLoading(false); setError("Fehler"); } }
        };
        fetchTypes();
        return () => controller.abort();
    }, [retryTrigger]);

    if (loading) return <div className="h-40 flex items-center justify-center"><LoadingSpinner /></div>;
    if (stats.length === 0) return null;
    const chartData = stats.map(s => ({ name: s.name, value: s.count, color: s.color }));

    return (
        <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-6 backdrop-blur-sm shadow-lg">
            <h3 className="text-base font-bold text-white mb-6 flex items-center gap-2">
                <span>📊</span> Verteilung nach Typ
            </h3>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8">
                <div className="flex-shrink-0 scale-100 hover:scale-105 transition-transform duration-300">
                    <SimplePieChart data={chartData} />
                </div>
                <div className="flex-1 w-full grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {stats.map((stat, i) => (
                        <div key={i} className="flex items-center p-2 rounded-lg hover:bg-white/5 transition-colors cursor-default">
                            <div className="w-2.5 h-2.5 rounded-full mr-3 flex-shrink-0 ring-2 ring-white/10" style={{ backgroundColor: stat.color }}></div>
                            <div className="flex-1 min-w-0">
                                <div className="flex justify-between items-baseline">
                                    <p className="text-xs font-semibold text-gray-200 truncate">{stat.name}</p>
                                    <span className="text-[10px] text-gray-400 font-mono ml-2">{Math.round(stat.percentage)}%</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ... (TrendingTopics updated style)
const TrendingTopics: React.FC = () => {
    // Logic identical
    const [topics, setTopics] = useState<{ word: string, count: number }[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const controller = new AbortController();
        const fetchAndAnalyze = async () => {
             try {
                setLoading(true);
                const params = new URLSearchParams('limit=100&sort=-date');
                const result = await getList<Paper>('papers', params, controller.signal);
                const wordCounts = new Map<string, number>();
                result.data.forEach(paper => {
                    const text = paper.name.toLowerCase();
                    const words = text.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, " ").split(/\s+/);
                    words.forEach(word => { if (word.length > 3 && !STOP_WORDS.has(word) && isNaN(Number(word))) wordCounts.set(word, (wordCounts.get(word) || 0) + 1); });
                });
                const sortedTopics = Array.from(wordCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([word, count]) => ({ word: word.charAt(0).toUpperCase() + word.slice(1), count }));
                if (!controller.signal.aborted) { setTopics(sortedTopics); setLoading(false); }
            } catch (e) { if (!controller.signal.aborted) setLoading(false); }
        };
        fetchAndAnalyze();
        return () => controller.abort();
    }, []);

    const handleTopicClick = (word: string) => navigate(`/papers?q=${encodeURIComponent(word)}`);

    if (loading) return <div className="h-20 animate-pulse bg-gray-800/50 rounded-lg"></div>;
    if (topics.length === 0) return null;

    return (
        <div className="bg-gradient-to-br from-indigo-900/30 to-purple-900/30 border border-indigo-500/20 rounded-2xl p-6 mb-8 relative overflow-hidden">
             <div className="absolute top-0 right-0 p-4 opacity-10"><SparklesIcon /></div>
             <h3 className="text-base font-bold text-white mb-4 flex items-center gap-2 relative z-10">
                <span>🏷️</span> Aktuelle Themen
            </h3>
            <div className="flex flex-wrap gap-2 relative z-10">
                {topics.map((topic, i) => (
                    <button
                        key={i}
                        onClick={() => handleTopicClick(topic.word)}
                        className="px-3 py-1.5 rounded-lg bg-gray-800/80 hover:bg-indigo-600 text-gray-300 hover:text-white text-xs font-medium transition-all duration-200 border border-gray-700 hover:border-indigo-400 flex items-center shadow-sm"
                    >
                        {topic.word}
                        {/* Remove count bubble for cleaner look, or style it subtler */}
                    </button>
                ))}
            </div>
        </div>
    );
};

// New Filter Component
const FilterSelect: React.FC<{ 
    label: string, 
    paramName: string, 
    options: { value: string, label: string }[],
    icon?: React.ReactNode
}> = ({ label, paramName, options, icon }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = new URLSearchParams(location.search);
    const currentVal = searchParams.get(paramName) || '';

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        const newParams = new URLSearchParams(location.search);
        
        if (val) newParams.set(paramName, val);
        else newParams.delete(paramName);
        
        newParams.set('page', '1');
        navigate({ search: newParams.toString() });
    };

    return (
        <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-5 mb-6 backdrop-blur-sm">
            <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2 mb-4">
                {icon || <span className="text-lg">⚙️</span>} {label}
            </h3>
            <select
                value={currentVal}
                onChange={handleChange}
                className="w-full bg-gray-900/50 border border-gray-700 text-white text-sm rounded-lg px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all appearance-none cursor-pointer hover:bg-gray-800"
            >
                <option value="">Alle anzeigen</option>
                {options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                        {opt.label}
                    </option>
                ))}
            </select>
        </div>
    );
};

// ... PaperTypeChart (similar minimal UI updates)
const PaperTypeChart: React.FC = () => { return null; } // Placeholder logic kept simple for brevity if needed

const FavoritesList: React.FC = () => {
    const { favorites } = useFavorites();
    if (favorites.length === 0) return null;
    // ... logic same
     return (
         <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl mb-8 overflow-hidden backdrop-blur-sm">
            <div className="p-4 border-b border-gray-700/50 flex items-center justify-between bg-gray-800/50">
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                    <span className="text-yellow-400"><StarIconSolid /></span> Merkliste
                </h2>
                <span className="bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full">{favorites.length}</span>
            </div>
            <ul className="divide-y divide-gray-700/50 max-h-60 overflow-y-auto">
                {favorites.map(item => (
                    <li key={item.id} className="p-3 hover:bg-white/5 flex items-center group transition-colors">
                        <div className="text-gray-500 mr-3 group-hover:text-gray-300 transition-colors">
                            {/* Icon logic inline for brevity */}
                            <StarIconSolid /> 
                        </div>
                        <div className="flex-1 min-w-0">
                            <Link to={item.path} className="block font-medium text-sm text-gray-200 hover:text-red-400 truncate transition-colors">
                                {item.name}
                            </Link>
                            {item.info && <p className="text-[10px] text-gray-500">{item.info}</p>}
                        </div>
                        <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                            <FavoriteButton item={item} />
                        </div>
                    </li>
                ))}
            </ul>
        </div>
    );
}

// Optimized DateRangeFilter with clearer UI
const DateRangeFilter: React.FC = () => {
    // ... Logic same as before
    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const minDateParam = searchParams.get('minDate') || '';
    const maxDateParam = searchParams.get('maxDate') || '';
    const [minDate, setMinDate] = useState(minDateParam);
    const [maxDate, setMaxDate] = useState(maxDateParam);
    const [specificDate, setSpecificDate] = useState('');

    useEffect(() => {
        const urlMin = searchParams.get('minDate') || '';
        const urlMax = searchParams.get('maxDate') || '';
        if (urlMin && urlMin === urlMax) { setSpecificDate(urlMin); setMinDate(''); setMaxDate(''); } 
        else { setSpecificDate(''); setMinDate(urlMin); setMaxDate(urlMax); }
    }, [searchParams]);

    const applyFilters = (e: React.FormEvent) => {
        e.preventDefault();
        const currentParams = new URLSearchParams(location.search);
        currentParams.delete('minDate'); currentParams.delete('maxDate');
        if (specificDate) { currentParams.set('minDate', specificDate); currentParams.set('maxDate', specificDate); } 
        else { if (minDate) currentParams.set('minDate', minDate); if (maxDate) currentParams.set('maxDate', maxDate); }
        currentParams.set('page', '1');
        navigate({ search: currentParams.toString() });
    };

    const clearFilters = () => {
        const currentParams = new URLSearchParams(location.search);
        currentParams.delete('minDate'); currentParams.delete('maxDate');
        currentParams.set('page', '1');
        navigate({ search: currentParams.toString() });
    };

    return (
        <form onSubmit={applyFilters} className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-5 mb-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-gray-200 flex items-center gap-2">
                    <CalendarDaysIcon /> Zeitraum filtern
                </h3>
                {(minDateParam || maxDateParam) && (
                    <button type="button" onClick={clearFilters} className="text-xs text-red-400 hover:text-red-300 font-medium bg-red-900/10 px-2 py-1 rounded hover:bg-red-900/20 transition-colors">
                        Zurücksetzen
                    </button>
                )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                    <label className="block text-[10px] uppercase text-gray-500 font-bold mb-2">Exakter Tag</label>
                    <input 
                        type="date" 
                        value={specificDate}
                        onChange={(e) => { setSpecificDate(e.target.value); setMinDate(''); setMaxDate(''); }}
                        className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-md px-3 py-2 focus:ring-2 focus:ring-red-500 focus:border-transparent outline-none transition-all"
                    />
                </div>
                <div className="flex gap-2 items-center bg-gray-900/50 p-3 rounded-lg border border-gray-800">
                    <div className="flex-1">
                        <label className="block text-[10px] uppercase text-gray-500 font-bold mb-2">Von</label>
                        <input 
                            type="date" 
                            value={minDate}
                            onChange={(e) => { setMinDate(e.target.value); setSpecificDate(''); }}
                            className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-md px-3 py-2 focus:ring-2 focus:ring-red-500 outline-none"
                        />
                    </div>
                    <span className="text-gray-600 mt-5">→</span>
                    <div className="flex-1">
                        <label className="block text-[10px] uppercase text-gray-500 font-bold mb-2">Bis</label>
                        <input 
                            type="date" 
                            value={maxDate}
                            onChange={(e) => { setMaxDate(e.target.value); setSpecificDate(''); }}
                            className="w-full bg-gray-800 border border-gray-700 text-white text-sm rounded-md px-3 py-2 focus:ring-2 focus:ring-red-500 outline-none"
                        />
                    </div>
                </div>
            </div>
            <div className="mt-4 flex justify-end">
                <button type="submit" className="px-5 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-lg transition-all shadow-lg shadow-red-900/20 active:scale-95">
                    Filter anwenden
                </button>
            </div>
        </form>
    );
};

// === MCP Guide Page ===
const McpGuidePage: React.FC = () => {
    return (
        <div className="animate-in fade-in duration-300 max-w-4xl mx-auto py-8">
            <PageTitle title="MCP Server Integration" subtitle="Verbinden Sie Ihre KI mit dem Ratsinformationssystem" />
            
            <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-8 backdrop-blur-sm mb-8">
                <div className="flex items-start gap-4 mb-6">
                    <div className="p-3 bg-indigo-500/20 text-indigo-400 rounded-xl">
                        <CommandLineIcon />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-white mb-2">Was ist das?</h2>
                        <p className="text-gray-400 leading-relaxed">
                            Das <strong>Model Context Protocol (MCP)</strong> ermöglicht es KI-Assistenten wie Claude Desktop oder IDEs (Cursor), 
                            direkt mit externen Datenquellen zu kommunizieren. Wir stellen einen vorgefertigten MCP-Server bereit, 
                            der als Brücke zwischen Ihrer KI und dem OParl-System der Stadt Köln fungiert.
                        </p>
                    </div>
                </div>

                <div className="space-y-6">
                    <h3 className="text-lg font-bold text-white border-b border-gray-700 pb-2">Schnellstart</h3>
                    
                    <div className="space-y-4">
                        <div className="flex gap-4 items-center">
                            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold text-gray-300">1</span>
                            <div className="flex-1">
                                <p className="text-gray-300 font-medium">Server herunterladen & bauen</p>
                                <div className="mt-2 bg-gray-950 rounded-lg p-4 border border-gray-800 font-mono text-xs text-gray-400 overflow-x-auto">
                                    cd mcp-server<br/>
                                    npm install<br/>
                                    npm run build
                                </div>
                            </div>
                        </div>

                        <div className="flex gap-4 items-center">
                            <span className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center font-bold text-gray-300">2</span>
                            <div className="flex-1">
                                <p className="text-gray-300 font-medium">In Claude Desktop konfigurieren</p>
                                <p className="text-sm text-gray-500 mb-2">Bearbeiten Sie Ihre config Datei (z.B. <code>claude_desktop_config.json</code>):</p>
                                <div className="bg-gray-950 rounded-lg p-4 border border-gray-800 font-mono text-xs text-green-400 overflow-x-auto">
{`{
  "mcpServers": {
    "ratsinfo-koeln": {
      "command": "node",
      "args": ["/PFAD/ZU/DIESEM/PROJEKT/mcp-server/build/index.js"]
    }
  }
}`}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-gray-800/40 border border-gray-700/50 rounded-xl p-6">
                    <h4 className="font-bold text-white mb-4 flex items-center gap-2">🛠️ Verfügbare Tools</h4>
                    <ul className="space-y-3 text-sm text-gray-400">
                        <li className="flex gap-2"><span className="text-indigo-400 font-mono">search_meetings</span> Findet Sitzungen nach Thema/Datum</li>
                        <li className="flex gap-2"><span className="text-indigo-400 font-mono">search_papers</span> Durchsucht Anträge & Vorlagen</li>
                        <li className="flex gap-2"><span className="text-indigo-400 font-mono">search_people</span> Findet Mandatsträger</li>
                        <li className="flex gap-2"><span className="text-indigo-400 font-mono">get_details</span> Lädt Details zu ID/URL</li>
                    </ul>
                </div>
                <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border border-indigo-500/20 rounded-xl p-6">
                    <h4 className="font-bold text-white mb-4 flex items-center gap-2">🤖 Beispiel-Prompts</h4>
                    <ul className="space-y-3 text-sm text-indigo-200">
                        <li>"Wann tagt der Verkehrsausschuss das nächste Mal?"</li>
                        <li>"Fasse mir die aktuellen Anträge zum Thema Radverkehr zusammen."</li>
                        <li>"Wer sitzt für die Grünen im Rat?"</li>
                    </ul>
                </div>
            </div>
        </div>
    );
};

// === DASHBOARD ===
const Dashboard: React.FC = () => {
    const now = new Date();
    const hours = now.getHours();
    const greeting = hours < 12 ? 'Guten Morgen' : hours < 18 ? 'Guten Tag' : 'Guten Abend';
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    const { data: meetingsData, isLoading: meetingsLoading, refetch: refetchMeetings } = useOparlList<Meeting>('meetings', useMemo(() => new URLSearchParams({ "sort": "start", "minDate": today, "limit": "15" }), [today]));
    const { data: papersData, isLoading: papersLoading } = useOparlList<Paper>('papers', useMemo(() => new URLSearchParams({ "limit": "1" }), []));
    const { favorites } = useFavorites();

    const upcomingMeetings = useMemo(() => meetingsData?.data ? [...meetingsData.data].sort(sortMeetingsAsc).slice(0, 5) : [], [meetingsData]);

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Hero Section */}
            <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-gray-900 via-[#1a1c2e] to-[#251515] border border-gray-800 shadow-2xl p-8 md:p-12">
                <div className="absolute top-0 right-0 p-8 opacity-20 pointer-events-none">
                   <svg className="w-64 h-64 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L1 21h22L12 2zm0 3.99L19.53 19H4.47L12 5.99zM11 16h2v2h-2zm0-6h2v4h-2z"/></svg>
                </div>
                <div className="relative z-10">
                    <h1 className="text-3xl md:text-5xl font-extrabold text-white mb-2 tracking-tight">
                        {greeting}, <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-400 to-orange-400">Bürger.</span>
                    </h1>
                    <p className="text-gray-400 text-lg max-w-xl">
                        Willkommen bei RATISA. Hier finden Sie aktuelle Sitzungen, Vorlagen und Entscheidungen transparent aufbereitet.
                    </p>
                    <div className="mt-8 flex flex-wrap gap-4">
                        <Link to="/meetings" className="px-6 py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-red-900/30 active:scale-95 flex items-center gap-2">
                           <CalendarDaysIcon /> Nächste Sitzungen
                        </Link>
                        <Link to="/search" className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold transition-all border border-gray-700 hover:border-gray-600 flex items-center gap-2">
                           <MagnifyingGlassIcon /> Suchen
                        </Link>
                    </div>
                </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card 
                    title="Kommende Sitzungen" 
                    value={meetingsLoading ? '...' : meetingsData?.pagination.totalElements || 0} 
                    icon={<CalendarDaysIcon />} 
                    gradient="from-blue-600/20 to-indigo-600/20"
                />
                <Card 
                    title="Aktuelle Vorlagen" 
                    value={papersLoading ? '...' : papersData?.pagination.totalElements || 0} 
                    icon={<DocumentTextIcon />} 
                    gradient="from-emerald-600/20 to-teal-600/20"
                />
                <Card 
                    title="Meine Merkliste" 
                    value={favorites.length} 
                    icon={<StarIconSolid />} 
                    gradient="from-yellow-600/20 to-orange-600/20"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    {/* Next Meetings List */}
                    <div>
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold text-white">Nächste Sitzungen</h2>
                            <Link to="/meetings" className="text-sm text-red-400 hover:text-red-300 hover:underline">Alle anzeigen →</Link>
                        </div>
                        <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl overflow-hidden backdrop-blur-sm">
                            {meetingsLoading ? <div className="p-8"><LoadingSpinner /></div> : (
                                <div className="divide-y divide-gray-700/50">
                                    {upcomingMeetings.length > 0 ? upcomingMeetings.map(meeting => (
                                        <div key={meeting.id} className="p-4 hover:bg-white/5 transition-colors group">
                                            <div className="flex items-start gap-4">
                                                <div className="flex-shrink-0 w-16 text-center bg-gray-900/80 rounded-lg p-2 border border-gray-700">
                                                    <span className="block text-xs text-red-400 font-bold uppercase">{new Date(meeting.start).toLocaleString('de-DE', { month: 'short' })}</span>
                                                    <span className="block text-xl text-white font-bold">{new Date(meeting.start).getDate()}</span>
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <Link to={`/meetings/${encodeUrl(meeting.id)}`} className="block font-bold text-gray-200 group-hover:text-red-400 transition-colors mb-1 truncate">
                                                        {meeting.name}
                                                    </Link>
                                                    <div className="flex items-center text-sm text-gray-500">
                                                        <span className="mr-3">⏰ {new Date(meeting.start).toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'})}</span>
                                                        {typeof meeting.location === 'object' && meeting.location?.description && (
                                                            <span className="truncate">📍 {meeting.location.description}</span>
                                                        )}
                                                    </div>
                                                </div>
                                                <FavoriteButton item={{ id: meeting.id, type: 'meeting', name: meeting.name, path: `/meetings/${encodeUrl(meeting.id)}`, info: formatDateTime(meeting.start) }} />
                                            </div>
                                        </div>
                                    )) : <p className="p-6 text-gray-500 text-center">Keine bevorstehenden Sitzungen.</p>}
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <div className="space-y-8">
                    <FavoritesList />
                    <div>
                        <h2 className="text-xl font-bold text-white mb-4">Aktivitäten</h2>
                        <div className="bg-gray-800/40 border border-gray-700/50 rounded-2xl p-6 backdrop-blur-sm">
                            <PartyActivityChart year="2025" />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Generic List with MOBILE CARD VIEW
interface GenericListPageProps {
    resource: string;
    title?: string;
    subtitle?: string;
    searchPlaceholder?: string;
    searchParam?: string;
    renderItem: (item: any) => React.ReactNode; // For Desktop Table
    renderCard?: (item: any) => React.ReactNode; // For Mobile Card View
    topContent?: React.ReactNode;
    columnClasses?: string[];
    sort?: string;
    baseParams?: URLSearchParams;
    sortItems?: (a: any, b: any) => number;
}

const GenericListPage: React.FC<GenericListPageProps> = ({ resource, title, subtitle, searchPlaceholder, searchParam = 'q', renderItem, renderCard, topContent, columnClasses = [], sort, baseParams, sortItems }) => {
    const location = useLocation();
    const navigate = useNavigate();
    const searchParams = useMemo(() => {
        const params = new URLSearchParams(location.search);
        if (!params.has('page')) params.set('page', '1');
        if (baseParams) baseParams.forEach((v, k) => { if (!((k === 'minDate' || k === 'maxDate') && (params.has('minDate') || params.has('maxDate'))) && !params.has(k)) params.set(k, v); });
        if (sort && !params.has('sort')) params.set('sort', sort);
        return params;
    }, [location.search, sort, baseParams]);
    
    const query = searchParams.get(searchParam) || '';
    const [currentQuery, setCurrentQuery] = useState(query);
    useEffect(() => { const handler = setTimeout(() => { if(currentQuery !== query) { const p = new URLSearchParams(location.search); if(currentQuery.trim()) p.set(searchParam, currentQuery); else p.delete(searchParam); p.set('page','1'); navigate({search:p.toString()}); } }, 500); return () => clearTimeout(handler); }, [currentQuery]);

    const { data, isLoading, error, refetch } = useOparlList<any>(resource, searchParams);
    const displayData = useMemo(() => { if (!data?.data) return []; const items = [...data.data]; if (sortItems) items.sort(sortItems); return items; }, [data, sortItems]);
    const handlePageChange = (p: number) => { const np = new URLSearchParams(location.search); np.set('page', p.toString()); navigate({ search: np.toString() }); };
    
    return (
        <div className="animate-in fade-in duration-300">
            {title && subtitle && <PageTitle title={title} subtitle={subtitle} />}
            {topContent}

            <div className="mb-6 relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
                    <MagnifyingGlassIcon />
                </div>
                <input
                    type="search"
                    value={currentQuery}
                    onChange={(e) => setCurrentQuery(e.target.value)}
                    placeholder={searchPlaceholder || "Suchen..."}
                    className="w-full pl-10 pr-4 py-3 bg-gray-800/60 border border-gray-700 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent text-white placeholder-gray-500 transition-all shadow-sm"
                />
            </div>

            {error && <ErrorMessage message={error.message} onRetry={refetch} />}
            
            {/* Desktop Table View */}
            <div className="hidden md:block bg-gray-800/40 border border-gray-700/50 rounded-2xl shadow-lg backdrop-blur-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-gray-300">
                        <thead className="bg-gray-900/50 text-gray-400 text-xs uppercase font-bold tracking-wider">
                            {renderItem("header")}
                        </thead>
                        <tbody className="divide-y divide-gray-700/50">
                            {isLoading && !data && <TableSkeleton columnClasses={columnClasses} />}
                            {displayData.map(item => renderItem(item))}
                            {!isLoading && data && data.data.length === 0 && (
                                <tr><td colSpan={10} className="p-12 text-center text-gray-500">Keine Ergebnisse.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Mobile Card View */}
            <div className="md:hidden space-y-4">
                {isLoading && !data && [1,2,3].map(i => <div key={i} className="h-32 bg-gray-800/50 animate-pulse rounded-xl"></div>)}
                {displayData.map(item => renderCard ? renderCard(item) : (
                    // Fallback generic card if renderCard not provided
                    <div key={item.id} className="bg-gray-800/60 p-4 rounded-xl border border-gray-700">
                        <p className="text-white font-bold">{item.name}</p>
                    </div>
                ))}
                {!isLoading && data && data.data.length === 0 && <div className="text-center text-gray-500 py-10">Keine Ergebnisse.</div>}
            </div>
            
            {data && <Pagination currentPage={data.pagination.currentPage} totalPages={data.pagination.totalPages} onPageChange={handlePageChange} />}
        </div>
    );
};

const MeetingDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const decodedId = id ? decodeUrl(id) : null;
    const { data: meeting, isLoading, error } = useOparlItem<Meeting>(decodedId);
    const [summary, setSummary] = useState<string>("");
    const [isSummarizing, setIsSummarizing] = useState(false);

    const handleSummarize = async () => {
        if (!meeting) return;
        setIsSummarizing(true);
        try {
            const prompt = `Fasse die wichtigsten Punkte dieser Sitzung zusammen. Titel: ${meeting.name}. Agenda: ${meeting.agendaItem?.map(i => i.name).join('; ') || 'Keine Agenda'}`;
            const result = await askGemini(prompt);
            setSummary(result);
        } catch (e) {
            setSummary("Fehler bei der Zusammenfassung.");
        } finally {
            setIsSummarizing(false);
        }
    };

    if (isLoading) return <div className="p-12"><LoadingSpinner /></div>;
    if (error || !meeting) return <ErrorMessage message={error?.message || "Sitzung nicht gefunden"} />;

    return (
        <div className="animate-in fade-in duration-300">
             <PageTitle 
                title={meeting.name} 
                subtitle={`Sitzung vom ${formatDateTime(meeting.start)}`} 
                actions={<FavoriteButton item={{ id: meeting.id, type: 'meeting', name: meeting.name, path: `/meetings/${id}`, info: formatDateTime(meeting.start) }} className="bg-gray-800 hover:bg-gray-700 !p-3 !rounded-xl" />}
            />
             
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <GeminiCard 
                        title="KI-Zusammenfassung der Agenda" 
                        content={summary} 
                        isLoading={isSummarizing} 
                        onAction={handleSummarize} 
                        actionLabel="Agenda analysieren" 
                    />

                    <DetailSection title="Tagesordnung">
                         {meeting.agendaItem?.length ? (
                             <div className="space-y-4">
                                 {meeting.agendaItem.map((item, index) => (
                                     <div key={item.id} className="bg-gray-800/40 border border-gray-700/50 p-4 rounded-xl">
                                         <div className="flex gap-4">
                                             <div className="flex-shrink-0 w-8 h-8 bg-gray-700 rounded-full flex items-center justify-center text-sm font-bold text-gray-300">
                                                 {index + 1}
                                             </div>
                                             <div className="flex-1">
                                                 <h4 className="font-bold text-gray-200">{item.name}</h4>
                                                 <div className="flex flex-wrap gap-2 mt-2">
                                                    {item.public === false && <span className="inline-block text-[10px] bg-red-900/30 text-red-400 px-2 py-0.5 rounded border border-red-900/50">Nicht öffentlich</span>}
                                                    {item.result && <span className="inline-block text-[10px] bg-green-900/30 text-green-400 px-2 py-0.5 rounded border border-green-900/50">Ergebnis: {item.result}</span>}
                                                 </div>
                                             </div>
                                         </div>
                                     </div>
                                 ))}
                             </div>
                         ) : <p className="text-gray-500">Keine Tagesordnungspunkte verfügbar.</p>}
                    </DetailSection>
                </div>
                
                <div className="space-y-6">
                    <div className="bg-gray-800/40 border border-gray-700/50 p-6 rounded-2xl backdrop-blur-sm">
                        <h3 className="text-lg font-bold text-white mb-4">Details</h3>
                        <div className="space-y-4 text-sm">
                            <div>
                                <span className="block text-gray-500 text-xs uppercase font-bold">Datum & Uhrzeit</span>
                                <span className="text-gray-200">{formatDateTime(meeting.start)} {meeting.end ? `- ${new Date(meeting.end).toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'})}` : ''}</span>
                            </div>
                            <div>
                                <span className="block text-gray-500 text-xs uppercase font-bold">Ort</span>
                                <span className="text-gray-200">{typeof meeting.location === 'object' ? meeting.location.description : meeting.location || 'Keine Angabe'}</span>
                            </div>
                        </div>
                    </div>
                </div>
             </div>
        </div>
    );
};

const PaperDetailPage: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const decodedId = id ? decodeUrl(id) : null;
    const { data: paper, isLoading, error } = useOparlItem<Paper>(decodedId);
    const [summary, setSummary] = useState<string>("");
    const [isSummarizing, setIsSummarizing] = useState(false);

    const handleSummarize = async () => {
        if (!paper) return;
        setIsSummarizing(true);
        try {
            const filesToAnalyze: Attachment[] = [];
            if (paper.mainFile?.accessUrl) filesToAnalyze.push({ url: paper.mainFile.accessUrl, mimeType: paper.mainFile.mimeType });
            
            const prompt = `Fasse den Inhalt dieser Vorlage zusammen. Titel: ${paper.name}.`;
            const result = await askGemini(prompt, filesToAnalyze);
            setSummary(result);
        } catch (e) {
            setSummary("Fehler bei der Zusammenfassung.");
        } finally {
            setIsSummarizing(false);
        }
    };

    if (isLoading) return <div className="p-12"><LoadingSpinner /></div>;
    if (error || !paper) return <ErrorMessage message={error?.message || "Vorlage nicht gefunden"} />;

    return (
        <div className="animate-in fade-in duration-300">
             <PageTitle 
                title={paper.name} 
                subtitle={paper.reference || 'Keine Referenz'} 
                actions={<FavoriteButton item={{ id: paper.id, type: 'paper', name: paper.name, path: `/papers/${id}`, info: paper.reference }} className="bg-gray-800 hover:bg-gray-700 !p-3 !rounded-xl" />}
            />
            
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-8">
                    <GeminiCard 
                        title="KI-Analyse der Dokumente" 
                        content={summary} 
                        isLoading={isSummarizing} 
                        onAction={handleSummarize} 
                        actionLabel="Dokumente analysieren" 
                    />

                    <DetailSection title="Basisdaten">
                        <DetailItem label="Typ">{paper.paperType}</DetailItem>
                        <DetailItem label="Datum">{formatDateOnly(paper.date)}</DetailItem>
                        <DetailItem label="Referenz">{paper.reference}</DetailItem>
                    </DetailSection>

                    {(paper.mainFile || (paper.auxiliaryFile && paper.auxiliaryFile.length > 0)) && (
                        <DetailSection title="Dokumente">
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {paper.mainFile && <DownloadLink file={paper.mainFile} />}
                                {paper.auxiliaryFile?.map(f => <DownloadLink key={f.id} file={f} />)}
                             </div>
                        </DetailSection>
                    )}
                </div>
             </div>
        </div>
    );
};

const PapersPage: React.FC = () => {
    return (
        <GenericListPage
            resource="papers"
            title="Vorlagen"
            subtitle="Anträge & Mitteilungen"
            sort="-date"
            searchPlaceholder="Vorlage suchen..."
            topContent={
                <>
                    <TrendingTopics />
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <FilterSelect 
                            label="Typ filtern" 
                            paramName="paperType" 
                            options={[
                                { value: "Antrag", label: "Antrag" },
                                { value: "Anfrage", label: "Anfrage" },
                                { value: "Mitteilung", label: "Mitteilung" },
                                { value: "Beschlussvorlage", label: "Beschlussvorlage" },
                                { value: "Niederschrift", label: "Niederschrift" }
                            ]}
                            icon={<DocumentTextIcon />}
                        />
                        <DateRangeFilter />
                    </div>
                </>
            }
            columnClasses={['', 'hidden md:table-cell', 'hidden lg:table-cell']} 
            renderItem={(item: Paper | "header") => {
                if (item === "header") return <tr><th className="p-4 pl-6">Betreff</th><th className="p-4 hidden md:table-cell whitespace-nowrap">Datum</th><th className="p-4 hidden lg:table-cell whitespace-nowrap">Typ</th></tr>;
                return (
                    <tr key={item.id} className="hover:bg-white/5 border-b border-gray-700/50 last:border-0 group transition-colors">
                        <td className="p-4 pl-6 font-medium relative pr-10">
                            <Link to={`/papers/${encodeUrl(item.id)}`} className="text-gray-200 hover:text-red-400 font-bold block transition-colors mb-1">{item.name}</Link>
                            <span className="text-xs text-gray-500 font-mono">{item.reference}</span>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <FavoriteButton item={{ id: item.id, type: 'paper', name: item.name, path: `/papers/${encodeUrl(item.id)}`, info: item.reference }} />
                            </div>
                        </td>
                        <td className="p-4 hidden md:table-cell whitespace-nowrap text-gray-400 font-mono text-sm">{formatDateOnly(item.date)}</td>
                        <td className="p-4 hidden lg:table-cell whitespace-nowrap text-gray-400 text-xs uppercase tracking-wide">
                            <span className="bg-gray-700/50 px-2 py-1 rounded">{item.paperType || 'Sonstige'}</span>
                        </td>
                    </tr>
                );
            }}
            renderCard={(item: Paper) => (
                <div key={item.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 flex flex-col gap-2 relative">
                     <div className="flex justify-between items-start">
                        <span className="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-900/20 px-2 py-0.5 rounded">{item.paperType || 'Vorlage'}</span>
                        <FavoriteButton item={{ id: item.id, type: 'paper', name: item.name, path: `/papers/${encodeUrl(item.id)}` }} />
                    </div>
                    <Link to={`/papers/${encodeUrl(item.id)}`} className="text-base font-bold text-white leading-tight mt-1">{item.name}</Link>
                    <div className="flex justify-between items-center mt-2">
                        <span className="text-xs text-gray-500 font-mono">{item.reference}</span>
                        <span className="text-xs text-gray-400">{formatDateOnly(item.date)}</span>
                    </div>
                </div>
            )}
        />
    );
};

const MeetingArchive: React.FC = () => {
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    return (
        <GenericListPage
            resource="meetings"
            title="Archiv"
            subtitle="Vergangene Sitzungen"
            sort="-start"
            sortItems={sortMeetingsDesc}
            baseParams={new URLSearchParams({ "maxDate": todayStr })}
            searchPlaceholder="Im Archiv suchen..."
            topContent={<DateRangeFilter />}
            columnClasses={['', 'hidden md:table-cell']} 
            renderItem={(item: Meeting | "header") => {
                if (item === "header") return <tr><th className="p-4 pl-6">Name</th><th className="p-4 hidden md:table-cell whitespace-nowrap">Datum</th></tr>;
                return (
                    <tr key={item.id} className="hover:bg-white/5 border-b border-gray-700/50 last:border-0 group transition-colors">
                        <td className="p-4 pl-6 font-medium relative pr-10">
                             <Link to={`/meetings/${encodeUrl(item.id)}`} className="text-gray-200 hover:text-red-400 font-bold block transition-colors">{item.name}</Link>
                             <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <FavoriteButton item={{ id: item.id, type: 'meeting', name: item.name, path: `/meetings/${encodeUrl(item.id)}`, info: formatDateTime(item.start) }} />
                            </div>
                        </td>
                        <td className="p-4 hidden md:table-cell whitespace-nowrap text-gray-400 font-mono text-sm">{formatDateTime(item.start)}</td>
                    </tr>
                );
            }}
            renderCard={(item: Meeting) => (
                <div key={item.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 flex flex-col gap-2 relative opacity-80 hover:opacity-100 transition-opacity">
                    <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-gray-500 bg-gray-900/20 px-2 py-1 rounded uppercase tracking-wider">{formatDateOnly(item.start)}</span>
                         <FavoriteButton item={{ id: item.id, type: 'meeting', name: item.name, path: `/meetings/${encodeUrl(item.id)}` }} />
                    </div>
                    <Link to={`/meetings/${encodeUrl(item.id)}`} className="text-lg font-bold text-gray-300 hover:text-white leading-tight mt-1">{item.name}</Link>
                </div>
            )}
        />
    );
};

// Search Page Component with AI support
const SearchPage: React.FC = () => {
    const navigate = useNavigate();
    const [query, setQuery] = useState('');
    const [isAiLoading, setIsAiLoading] = useState(false);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if(!query.trim()) return;
        // Default to global search across everything if implemented, or redirect to papers as fallback
        // Since we don't have a unified search result page in this mock, let's redirect to papers for generic search
        navigate(`/papers?q=${encodeURIComponent(query)}`);
    };

    const handleAiSearch = async () => {
        if (!query.trim()) return;
        setIsAiLoading(true);
        try {
            const structured = await parseSearchQuery(query);
            if (structured) {
                const params = new URLSearchParams();
                if (structured.q) params.set('q', structured.q);
                if (structured.minDate) params.set('minDate', structured.minDate);
                if (structured.maxDate) params.set('maxDate', structured.maxDate);
                
                let targetPath = '/papers'; // Default
                if (structured.resource === 'meetings') targetPath = '/meetings';
                else if (structured.resource === 'people') targetPath = '/people';
                else if (structured.resource === 'organizations') targetPath = '/organizations';
                
                navigate(`${targetPath}?${params.toString()}`);
            } else {
                // Fallback if parsing failed
                handleSearch({ preventDefault: () => {} } as React.FormEvent);
            }
        } catch (e) {
            console.error("AI Search failed", e);
             handleSearch({ preventDefault: () => {} } as React.FormEvent);
        } finally {
            setIsAiLoading(false);
        }
    }

    return (
        <div className="animate-in fade-in duration-300 max-w-2xl mx-auto py-12">
            <div className="text-center mb-10">
                <h1 className="text-4xl font-extrabold text-white mb-4">Was suchen Sie?</h1>
                <p className="text-gray-400">Durchsuchen Sie Sitzungen, Vorlagen, Personen und Gremien der Stadt Köln.</p>
            </div>

            <form onSubmit={handleSearch} className="relative">
                 <div className="bg-gray-800/80 border border-gray-700/50 rounded-2xl p-2 flex items-center shadow-xl backdrop-blur-sm focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent transition-all">
                    <div className="pl-4 text-gray-400">
                        <MagnifyingGlassIcon />
                    </div>
                    <input 
                        type="text" 
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Suchbegriff eingeben (z.B. 'Klimaschutz' oder 'Verkehrsausschuss Mai 2024')" 
                        className="w-full bg-transparent border-none text-white px-4 py-3 focus:ring-0 placeholder-gray-500 text-lg"
                    />
                     <button 
                        type="button"
                        onClick={handleAiSearch}
                        disabled={isAiLoading || !query.trim()}
                        className="hidden sm:flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-indigo-900/30 disabled:opacity-50 disabled:cursor-not-allowed mr-2"
                        title="Intelligente Suche mit Gemini"
                    >
                         {isAiLoading ? <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full"></div> : <SparklesIcon />}
                         <span>KI-Suche</span>
                    </button>
                    <button 
                        type="submit"
                        disabled={isAiLoading || !query.trim()}
                        className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2.5 rounded-xl font-bold transition-colors"
                    >
                        Suchen
                    </button>
                 </div>
                 <p className="text-xs text-gray-500 mt-3 text-center">
                    Tipp: Nutzen Sie die <strong>KI-Suche</strong>, um natürliche Anfragen wie <em>"Zeige mir alle Anträge der Grünen zum Thema Radverkehr aus 2024"</em> automatisch zu filtern.
                 </p>
            </form>
            
            {/* Quick Links */}
            <div className="mt-12 grid grid-cols-2 md:grid-cols-4 gap-4">
                <Link to="/meetings" className="bg-gray-800/40 hover:bg-gray-800 border border-gray-700/50 p-4 rounded-xl flex flex-col items-center gap-3 transition-all hover:scale-105">
                    <div className="p-3 bg-blue-900/20 text-blue-400 rounded-full"><CalendarDaysIcon /></div>
                    <span className="font-bold text-gray-300">Sitzungen</span>
                </Link>
                <Link to="/papers" className="bg-gray-800/40 hover:bg-gray-800 border border-gray-700/50 p-4 rounded-xl flex flex-col items-center gap-3 transition-all hover:scale-105">
                    <div className="p-3 bg-green-900/20 text-green-400 rounded-full"><DocumentTextIcon /></div>
                    <span className="font-bold text-gray-300">Vorlagen</span>
                </Link>
                <Link to="/people" className="bg-gray-800/40 hover:bg-gray-800 border border-gray-700/50 p-4 rounded-xl flex flex-col items-center gap-3 transition-all hover:scale-105">
                    <div className="p-3 bg-purple-900/20 text-purple-400 rounded-full"><UsersIcon /></div>
                    <span className="font-bold text-gray-300">Personen</span>
                </Link>
                <Link to="/organizations" className="bg-gray-800/40 hover:bg-gray-800 border border-gray-700/50 p-4 rounded-xl flex flex-col items-center gap-3 transition-all hover:scale-105">
                    <div className="p-3 bg-orange-900/20 text-orange-400 rounded-full"><BuildingLibraryIcon /></div>
                    <span className="font-bold text-gray-300">Gremien</span>
                </Link>
            </div>
        </div>
    );
};

// --- Updated Routes with RenderCard ---

const App: React.FC = () => {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  return (
    <Router initialEntries={['/']}>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/meetings" element={<GenericListPage
            resource="meetings"
            sort="start"
            sortItems={sortMeetingsAsc}
            baseParams={new URLSearchParams({ "minDate": todayStr })}
            title="Sitzungen"
            subtitle="Übersicht der Termine"
            topContent={<DateRangeFilter />}
            searchPlaceholder="Sitzung suchen..."
            columnClasses={['', 'hidden md:table-cell']} 
            renderItem={(item: Meeting | "header") => {
                if (item === "header") return <tr><th className="p-4 pl-6">Name</th><th className="p-4 hidden md:table-cell whitespace-nowrap">Datum</th></tr>;
                return (
                    <tr key={item.id} className="hover:bg-white/5 border-b border-gray-700/50 last:border-0 group transition-colors">
                        <td className="p-4 pl-6 font-medium relative pr-10">
                            <Link to={`/meetings/${encodeUrl(item.id)}`} className="text-gray-200 hover:text-red-400 font-bold block transition-colors">{item.name}</Link>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <FavoriteButton item={{ id: item.id, type: 'meeting', name: item.name, path: `/meetings/${encodeUrl(item.id)}`, info: formatDateTime(item.start) }} />
                            </div>
                        </td>
                        <td className="p-4 hidden md:table-cell whitespace-nowrap text-gray-400 font-mono text-sm">{formatDateTime(item.start)}</td>
                    </tr>
                );
            }}
            renderCard={(item: Meeting) => (
                <div key={item.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 flex flex-col gap-2 relative shadow-sm">
                    <div className="flex justify-between items-start">
                        <span className="text-xs font-bold text-red-400 bg-red-900/10 px-2 py-1 rounded uppercase tracking-wider">{formatDateOnly(item.start)}</span>
                        <FavoriteButton item={{ id: item.id, type: 'meeting', name: item.name, path: `/meetings/${encodeUrl(item.id)}` }} />
                    </div>
                    <Link to={`/meetings/${encodeUrl(item.id)}`} className="text-lg font-bold text-white leading-tight mt-1">{item.name}</Link>
                    <div className="flex items-center text-gray-500 text-sm mt-2">
                        <span className="mr-4">⏰ {item.start ? new Date(item.start).toLocaleTimeString('de-DE', {hour:'2-digit', minute:'2-digit'}) : '--:--'}</span>
                        {typeof item.location === 'object' && <span className="truncate">📍 {item.location.description}</span>}
                    </div>
                </div>
            )}
            />} />

            <Route path="/meetings/:id" element={<MeetingDetailPage />} />
            <Route path="/archive" element={<MeetingArchive />} />
            <Route path="/papers" element={<PapersPage />} />
            <Route path="/papers/:id" element={<PaperDetailPage />} />
            <Route path="/search" element={<SearchPage />} />

          <Route path="/people" element={<GenericListPage
            resource="people"
            title="Personen"
            subtitle="Mandatsträger"
            searchPlaceholder="Name suchen..."
            columnClasses={['', 'hidden sm:table-cell']} 
            renderItem={(item: Person | "header") => {
                if (item === "header") return <tr><th className="p-4 pl-6">Name</th><th className="p-4 hidden sm:table-cell">Anrede</th></tr>;
                return (
                    <tr key={item.id} className="hover:bg-white/5 border-b border-gray-700/50 last:border-0 group transition-colors">
                        <td className="p-4 pl-6 font-medium relative pr-10">
                            <span className="text-gray-200 font-bold">{item.name}</span>
                            <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <FavoriteButton item={{ id: item.id, type: 'person', name: item.name, path: `/people`, info: item.formOfAddress }} />
                            </div>
                        </td>
                        <td className="p-4 hidden sm:table-cell text-gray-400">{item.formOfAddress}</td>
                    </tr>
                );
            }}
            renderCard={(item: Person) => (
                <div key={item.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-700 flex items-center justify-center text-gray-400 text-lg">👤</div>
                        <div>
                            <p className="text-white font-bold">{item.name}</p>
                            <p className="text-xs text-gray-500">{item.formOfAddress}</p>
                        </div>
                    </div>
                    <FavoriteButton item={{ id: item.id, type: 'person', name: item.name, path: `/people` }} />
                </div>
            )}
            />} />

          <Route path="/organizations" element={<GenericListPage
            resource="organizations"
            title="Gremien"
            subtitle="Ausschüsse & Fraktionen"
            topContent={
                <>
                    <OrganizationTypeChart />
                    <FilterSelect 
                        label="Gremienart filtern" 
                        paramName="organizationType" 
                        options={[
                            { value: "Ausschuss", label: "Ausschüsse" },
                            { value: "Fraktion", label: "Fraktionen" },
                            { value: "Bezirksvertretung", label: "Bezirksvertretungen" },
                            { value: "Rat", label: "Rat" },
                            { value: "Beirat", label: "Beiräte" },
                            { value: "Gremium", label: "Sonstige Gremien" }
                        ]}
                        icon={<BuildingLibraryIcon />}
                    />
                </>
            }
            searchPlaceholder="Gremium suchen..."
            searchParam="name"
            columnClasses={['', 'hidden md:table-cell', 'hidden sm:table-cell']}
            renderItem={(item: Organization | "header") => {
                if (item === "header") return <tr><th className="p-4 pl-6">Name</th><th className="p-4 hidden md:table-cell">Typ</th><th className="p-4 hidden sm:table-cell">Art</th></tr>;
                return (
                    <tr key={item.id} className="hover:bg-white/5 border-b border-gray-700/50 last:border-0 group transition-colors">
                        <td className="p-4 pl-6 font-medium relative pr-10">
                            <span className="text-gray-200 font-bold">{item.name}</span>
                             <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                                <FavoriteButton item={{ id: item.id, type: 'organization', name: item.name, path: `/organizations`, info: item.organizationType }} />
                            </div>
                        </td>
                        <td className="p-4 hidden md:table-cell text-gray-400 text-sm">{item.organizationType}</td>
                        <td className="p-4 hidden sm:table-cell text-gray-500 text-xs uppercase tracking-wide">{item.classification}</td>
                    </tr>
                );
            }}
            renderCard={(item: Organization) => (
                <div key={item.id} className="bg-gray-800/60 border border-gray-700/50 rounded-xl p-4">
                    <div className="flex justify-between items-start mb-2">
                         <span className="text-[10px] uppercase font-bold text-indigo-400 bg-indigo-900/20 px-2 py-0.5 rounded">{item.organizationType || 'Gremium'}</span>
                         <FavoriteButton item={{ id: item.id, type: 'organization', name: item.name, path: `/organizations` }} />
                    </div>
                    <p className="text-white font-bold">{item.name}</p>
                    {item.classification && <p className="text-xs text-gray-500 mt-1">{item.classification}</p>}
                </div>
            )}
            />} />
            
            <Route path="/mcp" element={<McpGuidePage />} />
        </Routes>
      </Layout>
    </Router>
  );
};

export default App;