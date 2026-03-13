
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

export const ComputerDesktopIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 4.5h10.5A2.25 2.25 0 0119.5 6.75v6a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 12.75v-6A2.25 2.25 0 016.75 4.5z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 19.5h9M10 15.75v3.75m4-3.75v3.75" />
  </svg>
);

export const LightBulbIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75a6 6 0 00-3.78 10.66c.67.55 1.07 1.36 1.12 2.22h5.32c.05-.86.45-1.67 1.12-2.22A6 6 0 0012 3.75z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 18h4.5M10.5 20.25h3" />
  </svg>
);

export const SunIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 3.75v1.5m0 13.5v1.5m8.25-8.25h-1.5M5.25 12h-1.5m13.864 5.864l-1.06-1.06M7.446 7.446l-1.06-1.06m11.228 0l-1.06 1.06M7.446 16.554l-1.06 1.06M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

export const MoonIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.7} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12.79A9 9 0 1111.21 3a7.5 7.5 0 009.79 9.79z" />
  </svg>
);

export const MapIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75v10.5m6-9v10.5m-10.5 1.5 4.07-1.628a1.5 1.5 0 011.114 0l4.632 1.853a1.5 1.5 0 001.114 0L19.5 18.75V4.5l-4.07 1.628a1.5 1.5 0 01-1.114 0L9.684 4.275a1.5 1.5 0 00-1.114 0L4.5 5.25v14.25z" />
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

export const InformationCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
    <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.09.67v4.08a.75.75 0 001.5 0v-4.08a2.25 2.25 0 00-3.27-2.01l-.041.02a.75.75 0 10.68 1.34zM12 7.5h.008v.008H12V7.5z" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
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
  <div className="flex justify-center items-center p-8" role="status" aria-live="polite" aria-label="Wird geladen">
    <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-t-2 border-app-accent shadow-lg shadow-black/10"></div>
    <span className="sr-only">Wird geladen</span>
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
        <div className="mx-auto my-6 flex max-w-2xl animate-in flex-col items-center gap-4 rounded-xl border border-app-danger/25 bg-app-danger/10 px-6 py-5 text-app-danger shadow-lg shadow-black/10 fade-in slide-in-from-top-2 md:flex-row md:items-start">
            <div className="flex-shrink-0 rounded-full bg-app-danger/10 p-3 text-app-danger">
                {icon}
            </div>
            <div className="flex-1 text-center md:text-left">
                <strong className="mb-1 block text-lg font-bold text-app-text">{title}</strong>
                <span className="mb-4 block text-sm leading-relaxed text-app-danger md:mb-0">{message}</span>
            </div>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="app-button-primary flex-shrink-0 whitespace-nowrap"
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
export const Card: React.FC<CardProps> = ({ title, value, icon, gradient = "from-app-surface-alt to-app-surface" }) => (
  <div className={`relative overflow-hidden rounded-2xl border border-app-border bg-gradient-to-br ${gradient} p-6 shadow-sm shadow-black/10 transition-transform duration-300 hover:scale-[1.01]`}>
    <div className="pointer-events-none absolute right-0 top-0 translate-x-1/4 -translate-y-1/4 scale-150 p-4 opacity-10">
        {icon}
    </div>
    <div className="relative z-10 flex items-center">
      <div className="rounded-xl bg-app-accent/10 p-3.5 text-app-accent shadow-inner">{icon}</div>
      <div className="ml-5">
        <p className="mb-1 text-xs font-bold uppercase tracking-[0.18em] text-app-muted">{title}</p>
        <p className="text-3xl font-semibold tracking-tight text-app-text">{value}</p>
      </div>
    </div>
  </div>
);

export const TableSkeleton: React.FC<{ columnClasses: string[], rowCount?: number }> = ({ columnClasses, rowCount = 8 }) => (
    <>
        {Array.from({ length: rowCount }).map((_, rIdx) => (
            <tr key={rIdx} className="animate-pulse border-b border-app-border last:border-0">
                {columnClasses.map((cls, cIdx) => (
                    <td key={cIdx} className={`p-4 align-middle ${cls}`}>
                        <div 
                            className="h-4 rounded-full bg-app-surface-alt" 
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
        <nav className="mt-8 flex items-center justify-center space-x-2 py-4" aria-label="Seitennavigation">
            <button
                type="button"
                onClick={() => onPageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className="rounded-lg border border-app-border bg-app-surface px-3 py-2 text-app-text transition-colors hover:bg-app-surface-alt disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Vorherige Seite"
            >
                ←
            </button>
            {getPageNumbers().map((page, index) => (
                <button
                    key={index}
                    type="button"
                    onClick={() => typeof page === 'number' && onPageChange(page)}
                    disabled={typeof page !== 'number'}
                    className={`min-w-[40px] px-3 py-2 rounded-lg font-medium transition-all ${
                        page === currentPage
                            ? 'scale-105 bg-app-accent text-white shadow-sm shadow-black/10'
                            : typeof page === 'number'
                                ? 'border border-app-border bg-app-surface text-app-text hover:bg-app-surface-alt'
                                : 'cursor-default text-app-muted'
                    }`}
                    aria-label={typeof page === 'number' ? `Seite ${page}` : 'Weitere Seiten'}
                    aria-current={page === currentPage ? 'page' : undefined}
                >
                    {page}
                </button>
            ))}
            <button
                type="button"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="rounded-lg border border-app-border bg-app-surface px-3 py-2 text-app-text transition-colors hover:bg-app-surface-alt disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Nächste Seite"
            >
                →
            </button>
        </nav>
    );
};

export const PageTitle: React.FC<{ title: string, subtitle?: string, actions?: React.ReactNode }> = ({ title, subtitle, actions }) => (
    <div className="mb-8 flex flex-col items-start justify-between gap-4 border-b border-app-border pb-4 md:flex-row md:items-end">
        <div>
            <h1 className="text-2xl font-semibold tracking-tight text-app-text md:text-3xl">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-app-muted md:text-base">{subtitle}</p>}
        </div>
        {actions && <div className="flex-shrink-0">{actions}</div>}
    </div>
);

export const DetailSection: React.FC<{ title: string, children: React.ReactNode }> = ({ title, children }) => (
    <section className="mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold text-app-text">
            <span className="inline-block h-6 w-1 rounded-full bg-app-accent"></span>
            {title}
        </h3>
        <div className="app-surface p-1">{children}</div>
    </section>
);

export const DetailItem: React.FC<{ label: string, children: React.ReactNode }> = ({ label, children }) => {
    if (!children) return null;
    return (
        <div className="flex flex-col gap-1 border-b border-app-border px-2 py-3 last:border-0 sm:flex-row sm:justify-between">
            <span className="text-sm font-medium text-app-muted">{label}</span>
            <span className="text-right font-medium text-app-text">{children}</span>
        </div>
    );
};

export const DownloadLink: React.FC<{ file: OparlFile }> = ({ file }) => (
    <a
        href={file.accessUrl} // Note: This will likely need a proxy or backend in real world due to CORS
        target="_blank"
        rel="noopener noreferrer"
        className="group flex items-center rounded-xl border border-app-border bg-app-surface px-4 py-4 transition-colors hover:bg-app-surface-alt"
    >
        <div className="mr-4 rounded-lg bg-app-accent/10 p-3 text-app-accent transition-transform group-hover:scale-110">
            <DocumentTextIcon />
        </div>
        <div className="flex-1 min-w-0">
            <p className="truncate font-semibold text-app-text transition-colors group-hover:text-app-accent">{file.name || 'Dokument'}</p>
            <div className="mt-0.5 flex gap-2 text-xs text-app-muted">
                <span className="uppercase">{file.mimeType.split('/')[1] || 'Datei'}</span>
                {file.size && <span>• {(file.size / 1024).toFixed(1)} KB</span>}
            </div>
        </div>
        <div className="text-app-muted transition-colors group-hover:text-app-text">
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
        <div className="space-y-2 text-sm leading-relaxed text-app-text">
            {lines.map((line, i) => {
                if (line.startsWith('### ')) return <h4 key={i} className="mt-4 mb-2 text-base font-bold text-app-text">{line.replace('### ', '')}</h4>;
                if (line.startsWith('## ')) return <h3 key={i} className="mt-6 mb-3 border-b border-app-border pb-1 text-lg font-bold text-app-text">{line.replace('## ', '')}</h3>;
                if (line.startsWith('* ') || line.startsWith('- ')) {
                    return (
                        <div key={i} className="ml-1 flex gap-2">
                            <span className="mt-1.5 text-app-info">•</span>
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

const escapeHtml = (text: string) => (
    text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
);

// Helper for simple bold parsing (**text**) with HTML escaping to avoid XSS.
export const parseBold = (text: string) => {
    const escaped = escapeHtml(text);
    return escaped.replace(/\*\*(.*?)\*\*/g, '<strong class="text-app-text font-semibold">$1</strong>');
};

export const GeminiCard: React.FC<{ 
    title: string; 
    content: string; 
    isLoading: boolean; 
    onAction?: () => void;
    actionLabel?: string;
}> = ({ title, content, isLoading, onAction, actionLabel }) => (
    <div className="group relative overflow-hidden rounded-2xl border border-app-info/20 bg-app-info/10 p-6 shadow-sm shadow-black/10">
        <div className="absolute top-0 right-0 p-3 opacity-10 transition-opacity group-hover:opacity-20">
            <SparklesIcon />
        </div>
        
        <div className="relative z-10 mb-4 flex items-start justify-between">
            <h3 className="flex items-center gap-2 font-semibold text-app-text">
                <span className="text-app-info"><SparklesIcon /></span> {title}
            </h3>
        </div>

        <div className="relative z-10">
            {isLoading ? (
                <div className="space-y-3 animate-pulse">
                    <div className="h-4 w-3/4 rounded bg-app-info/20"></div>
                    <div className="h-4 w-full rounded bg-app-info/20"></div>
                    <div className="h-4 w-5/6 rounded bg-app-info/20"></div>
                </div>
            ) : content ? (
                <div className="rounded-xl border border-app-info/10 bg-app-surface p-4">
                    <MarkdownRenderer content={content} />
                </div>
            ) : (
                <div className="py-6 text-center">
                    <p className="mb-4 text-sm text-app-muted">Lassen Sie die KI diesen Inhalt analysieren und zusammenfassen.</p>
                    {onAction && (
                        <button 
                            type="button"
                            onClick={onAction}
                            className="app-button-info"
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
    const actionLabel = active ? 'Von Merkliste entfernen' : 'Auf Merkliste setzen';

    return (
        <button
            type="button"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                toggleFavorite(item);
            }}
            className={`p-2 rounded-lg transition-all duration-200 ${
                active 
                    ? 'bg-app-warning/10 text-app-warning hover:text-app-warning' 
                    : 'text-app-muted hover:bg-app-surface-alt hover:text-app-text'
            } ${className}`}
            title={actionLabel}
            aria-label={`${actionLabel}: ${item.name}`}
            aria-pressed={active}
        >
            {active ? <StarIconSolid /> : <StarIcon />}
        </button>
    );
};
