
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useFavorites, FavoriteItem } from '../hooks/useFavorites';
import { ApiError } from '../services/oparlApiService';
import { File as OparlFile } from '../types';

// --- ICONS ---

export const HomeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
  </svg>
);

export const MagnifyingGlassIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
  </svg>
);

export const CalendarDaysIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5m-9-6h.008v.008H12v-.008zM12 15h.008v.008H12V15zm0 2.25h.008v.008H12v-.008zM9.75 15h.008v.008H9.75V15zm0 2.25h.008v.008H9.75v-.008zM7.5 15h.008v.008H7.5V15zm0 2.25h.008v.008H7.5v-.008zM14.25 15h.008v.008H14.25V15zm0 2.25h.008v.008H14.25v-.008zM16.5 15h.008v.008H16.5V15zm0 2.25h.008v.008H16.5v-.008z" />
  </svg>
);

export const ArchiveBoxIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
  </svg>
);

export const DocumentTextIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

export const UsersIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
  </svg>
);

export const BuildingLibraryIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18M12 6.75h.008v.008H12V6.75z" />
  </svg>
);

export const LinkIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244" />
  </svg>
);

export const CommandLineIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18.75V5.25A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25v13.5A2.25 2.25 0 005.25 21z" />
  </svg>
);

export const SparklesIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
);

export const StarIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
    </svg>
);

export const StarIconSolid = () => (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
    </svg>
);


// --- COMPONENTS ---

export const LoadingSpinner: React.FC = () => (
  <div className="flex justify-center items-center p-8">
    <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-red-500 shadow-lg shadow-red-500/20"></div>
  </div>
);

// New robust Error Display
interface ErrorDisplayProps {
  error: Error | ApiError;
  onRetry?: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ error, onRetry }) => {
    let title = "Ein Fehler ist aufgetreten";
    let icon = (
        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
    );
    let message = error.message;

    // Determine error type based on status or message
    const isNetworkError = (error instanceof ApiError && error.status === 0) || message.toLowerCase().includes('netzwerk') || message.includes('failed to fetch');
    const isServerError = (error instanceof ApiError && error.status >= 500);
    const isNotFound = (error instanceof ApiError && error.status === 404);

    if (isNetworkError) {
        title = "Verbindung fehlgeschlagen";
        message = "Wir können den Server nicht erreichen. Bitte prüfen Sie Ihre Internetverbindung.";
        icon = (
             <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 10l-2 2m0 0l2 2m-2-2h12" />
            </svg>
        );
    } else if (isServerError) {
        title = "Serverfehler";
        message = "Der OParl-Server der Stadt Köln hat ein Problem gemeldet. Bitte versuchen Sie es später erneut.";
        icon = (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
        );
    } else if (isNotFound) {
        title = "Nicht gefunden";
        message = "Die angeforderte Ressource existiert nicht oder wurde verschoben.";
        icon = (
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
        );
    }

    return (
        <div className="bg-red-900/20 border border-red-500/30 text-red-200 px-6 py-5 rounded-xl shadow-lg flex flex-col md:flex-row items-center md:items-start gap-4 animate-in fade-in slide-in-from-top-2 mx-auto max-w-2xl my-6">
            <div className="flex-shrink-0 text-red-400 bg-red-900/30 p-3 rounded-full">
                {icon}
            </div>
            <div className="flex-1 text-center md:text-left">
                <strong className="font-bold block mb-1 text-red-100 text-lg">{title}</strong>
                <span className="block text-sm text-red-200/80 leading-relaxed mb-4 md:mb-0">{message}</span>
            </div>
            {onRetry && (
                <button
                    onClick={onRetry}
                    className="flex-shrink-0 px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white text-sm font-bold rounded-lg transition-all shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 focus:ring-offset-gray-900 whitespace-nowrap"
                >
                    Erneut versuchen
                </button>
            )}
        </div>
    );
};

export const ErrorMessage: React.FC<{ message: string, onRetry?: () => void }> = ({ message, onRetry }) => (
    <ErrorDisplay error={new Error(message)} onRetry={onRetry} />
);

interface CardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  gradient?: string;
}
export const Card: React.FC<CardProps> = ({ title, value, icon, gradient = "from-gray-800 to-gray-800" }) => (
  <div className={`relative overflow-hidden border border-gray-700/50 rounded-2xl p-6 shadow-xl bg-gradient-to-br ${gradient} hover:scale-[1.02] transition-transform duration-300`}>
    <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none transform translate-x-1/4 -translate-y-1/4 scale-150">
        {icon}
    </div>
    <div className="relative z-10 flex items-center">
      <div className="p-3.5 rounded-xl bg-white/10 text-white shadow-inner backdrop-blur-sm">{icon}</div>
      <div className="ml-5">
        <p className="text-xs font-bold text-gray-300 uppercase tracking-wider mb-1">{title}</p>
        <p className="text-3xl font-extrabold text-white tracking-tight">{value}</p>
      </div>
    </div>
  </div>
);

export const TableSkeleton: React.FC<{ columnClasses: string[], rowCount?: number }> = ({ columnClasses, rowCount = 8 }) => (
    <>
        {Array.from({ length: rowCount }).map((_, rIdx) => (
            <tr key={rIdx} className="border-b border-gray-700/50 last:border-0 animate-pulse">
                {columnClasses.map((cls, cIdx) => (
                    <td key={cIdx} className={`p-4 align-middle ${cls}`}>
                        <div 
                            className="h-4 bg-gray-700/40 rounded-full" 
                            style={{ width: (rIdx + cIdx) % 3 === 0 ? '60%' : (rIdx + cIdx) % 3 === 1 ? '80%' : '40%' }}
                        ></div>
                    </td>
                ))}
            </tr>
        ))}
    </>
);

export const Pagination: React.FC<{ currentPage: number, totalPages: number, onPageChange: (page: number) => void }> = ({ currentPage, totalPages, onPageChange }) => {
    if (totalPages <= 1) return null;

    const getPageNumbers = () => {
        const pages = [];
        if (totalPages <= 5) {
            for (let i = 1; i <= totalPages; i++) pages.push(i);
        } else {
            if (currentPage <= 3) {
                pages.push(1, 2, 3, 4, '...', totalPages);
            } else if (currentPage >= totalPages - 2) {
                pages.push(1, '...', totalPages - 3, totalPages - 2, totalPages - 1, totalPages);
            } else {
                pages.push(1, '...', currentPage - 1, currentPage, currentPage + 1, '...', totalPages);
            }
        }
        return pages;
    };

    return (
        <div className="flex justify-center items-center space-x-2 mt-8 py-4">
            <button
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                ←
            </button>
            {getPageNumbers().map((page, index) => (
                <button
                    key={index}
                    onClick={() => typeof page === 'number' && onPageChange(page)}
                    disabled={typeof page !== 'number'}
                    className={`min-w-[40px] px-3 py-2 rounded-lg font-medium transition-all ${
                        page === currentPage
                            ? 'bg-red-600 text-white shadow-lg shadow-red-900/30 transform scale-105'
                            : typeof page === 'number'
                                ? 'bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 hover:border-gray-600'
                                : 'text-gray-500 cursor-default'
                    }`}
                >
                    {page}
                </button>
            ))}
            <button
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-gray-300 hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
                →
            </button>
        </div>
    );
};

export const PageTitle: React.FC<{ title: string, subtitle?: string, actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 mb-8 pb-4 border-b border-gray-800">
        <div>
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">{title}</h1>
            {subtitle && <p className="text-gray-400 mt-1 text-sm md:text-base">{subtitle}</p>}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
);

export const DetailSection: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <span className="w-1 h-6 bg-red-600 rounded-full inline-block"></span>
            {title}
        </h3>
        <div className="bg-gray-800/20 rounded-2xl p-1">{children}</div>
    </section>
);

export const DetailItem: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => {
    if (!children) return null;
    return (
        <div className="py-3 px-2 border-b border-gray-800 last:border-0 flex flex-col sm:flex-row sm:justify-between gap-1">
            <span className="text-gray-500 font-medium text-sm">{label}</span>
            <span className="text-gray-200 font-medium text-right">{children}</span>
        </div>
    );
};

export const DownloadLink: React.FC<{ file: OparlFile }> = ({ file }) => (
    <a
        href={file.accessUrl} // Note: This will likely need a proxy or backend in real world due to CORS
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center p-4 bg-gray-800/60 hover:bg-gray-700 border border-gray-700 rounded-xl transition-all hover:shadow-lg group"
    >
        <div className="p-3 bg-red-900/20 text-red-500 rounded-lg mr-4 group-hover:scale-110 transition-transform">
            <DocumentTextIcon />
        </div>
        <div className="flex-1 min-w-0">
            <p className="font-bold text-gray-200 truncate group-hover:text-red-400 transition-colors">{file.name || 'Dokument'}</p>
            <div className="flex gap-2 text-xs text-gray-500 mt-0.5">
                <span className="uppercase">{file.mimeType.split('/')[1] || 'Datei'}</span>
                {file.size && <span>• {(file.size / 1024).toFixed(1)} KB</span>}
            </div>
        </div>
        <div className="text-gray-600 group-hover:text-white transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
        </div>
    </a>
);

// Markdown Renderer for AI content
const MarkdownRenderer: React.FC<{ content: string }> = ({ content }) => {
    // Very basic markdown parser to avoid external dependencies
    const lines = content.split('\n');
    return (
        <div className="space-y-2 text-sm leading-relaxed text-gray-300">
            {lines.map((line, i) => {
                if (line.startsWith('### ')) return <h4 key={i} className="text-white font-bold text-base mt-4 mb-2">{line.replace('### ', '')}</h4>;
                if (line.startsWith('## ')) return <h3 key={i} className="text-white font-bold text-lg mt-6 mb-3 border-b border-gray-700 pb-1">{line.replace('## ', '')}</h3>;
                if (line.startsWith('* ') || line.startsWith('- ')) {
                    return (
                        <div key={i} className="flex gap-2 ml-1">
                            <span className="text-indigo-400 mt-1.5">•</span>
                            <span dangerouslySetInnerHTML={{ __html: parseBold(line.substring(2)) }}></span>
                        </div>
                    );
                }
                if (line.trim() === '') return <br key={i} />;
                return <p key={i} dangerouslySetInnerHTML={{ __html: parseBold(line) }}></p>;
            })}
        </div>
    );
};

// Helper for simple bold parsing (**text**)
const parseBold = (text: string) => {
    return text.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white font-semibold">$1</strong>');
};

export const GeminiCard: React.FC<{ 
    title: string; 
    content: string; 
    isLoading: boolean; 
    onAction?: () => void;
    actionLabel?: string;
}> = ({ title, content, isLoading, onAction, actionLabel }) => (
    <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border border-indigo-500/30 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
            <SparklesIcon />
        </div>
        
        <div className="flex justify-between items-start mb-4 relative z-10">
            <h3 className="font-bold text-indigo-100 flex items-center gap-2">
                <span className="text-indigo-400"><SparklesIcon /></span> {title}
            </h3>
        </div>

        <div className="relative z-10">
            {isLoading ? (
                <div className="space-y-3 animate-pulse">
                    <div className="h-4 bg-indigo-500/20 rounded w-3/4"></div>
                    <div className="h-4 bg-indigo-500/20 rounded w-full"></div>
                    <div className="h-4 bg-indigo-500/20 rounded w-5/6"></div>
                </div>
            ) : content ? (
                <div className="bg-gray-900/40 rounded-xl p-4 border border-indigo-500/10">
                    <MarkdownRenderer content={content} />
                </div>
            ) : (
                <div className="text-center py-6">
                    <p className="text-indigo-200/60 text-sm mb-4">Lassen Sie die KI diesen Inhalt analysieren und zusammenfassen.</p>
                    {onAction && (
                        <button 
                            onClick={onAction}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-900/20 transition-all hover:scale-105"
                        >
                            {actionLabel || 'Analysieren'}
                        </button>
                    )}
                </div>
            )}
        </div>
    </div>
);

export const FavoriteButton: React.FC<{ item: FavoriteItem, className?: string }> = ({ item, className }) => {
    const { isFavorite, toggleFavorite } = useFavorites();
    const active = isFavorite(item.id);

    return (
        <button
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite(item);
            }}
            className={`p-2 rounded-lg transition-all duration-200 ${
                active 
                    ? 'text-yellow-400 hover:text-yellow-300 bg-yellow-400/10' 
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            } ${className}`}
            title={active ? "Von Merkliste entfernen" : "Auf Merkliste setzen"}
        >
            {active ? <StarIconSolid /> : <StarIcon />}
        </button>
    );
};
