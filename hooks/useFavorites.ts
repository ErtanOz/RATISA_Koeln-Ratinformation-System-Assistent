
import { useCallback, useSyncExternalStore } from 'react';

export interface FavoriteItem {
    id: string;
    type: 'meeting' | 'paper' | 'person' | 'organization';
    name: string;
    path: string;
    info?: string; // Date or additional info
}

const STORAGE_KEY = 'oparl_favorites';
const FAVORITE_TYPES = new Set<FavoriteItem['type']>([
    'meeting',
    'paper',
    'person',
    'organization',
]);

type Listener = () => void;

const listeners = new Set<Listener>();

let cachedFavorites: FavoriteItem[] | null = null;
let cachedStorageValue: string | null | undefined;
let hasBoundStorageListener = false;

function isFavoriteItem(value: unknown): value is FavoriteItem {
    if (!value || typeof value !== 'object') return false;

    const candidate = value as Partial<FavoriteItem>;
    return (
        typeof candidate.id === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.path === 'string' &&
        typeof candidate.type === 'string' &&
        FAVORITE_TYPES.has(candidate.type as FavoriteItem['type']) &&
        (candidate.info === undefined || typeof candidate.info === 'string')
    );
}

function normalizeFavorites(value: unknown): FavoriteItem[] {
    if (!Array.isArray(value)) return [];

    const seen = new Set<string>();
    const favorites: FavoriteItem[] = [];

    value.forEach((entry) => {
        if (!isFavoriteItem(entry) || seen.has(entry.id)) return;
        seen.add(entry.id);
        favorites.push(entry);
    });

    return favorites;
}

function parseFavorites(rawValue: string | null): FavoriteItem[] {
    try {
        if (!rawValue) return [];
        return normalizeFavorites(JSON.parse(rawValue));
    } catch (error) {
        console.error('Failed to parse favorites', error);
        return [];
    }
}

function getFavoritesSnapshot(): FavoriteItem[] {
    if (typeof window === 'undefined') return [];

    const rawValue = localStorage.getItem(STORAGE_KEY);
    if (cachedFavorites !== null && rawValue === cachedStorageValue) {
        return cachedFavorites;
    }

    cachedStorageValue = rawValue;
    cachedFavorites = parseFavorites(rawValue);
    return cachedFavorites;
}

function notifyListeners() {
    listeners.forEach((listener) => listener());
}

function syncFavoritesFromStorage() {
    if (typeof window === 'undefined') {
        cachedStorageValue = null;
        cachedFavorites = [];
    } else {
        cachedStorageValue = localStorage.getItem(STORAGE_KEY);
        cachedFavorites = parseFavorites(cachedStorageValue);
    }
    notifyListeners();
}

function ensureStorageListener() {
    if (typeof window === 'undefined' || hasBoundStorageListener) return;

    window.addEventListener('storage', (event) => {
        if (event.key && event.key !== STORAGE_KEY) return;
        syncFavoritesFromStorage();
    });

    hasBoundStorageListener = true;
}

function subscribe(listener: Listener) {
    listeners.add(listener);
    ensureStorageListener();

    return () => {
        listeners.delete(listener);
    };
}

function persistFavorites(nextFavorites: FavoriteItem[]) {
    const serializedFavorites = JSON.stringify(nextFavorites);
    cachedFavorites = nextFavorites;
    cachedStorageValue = serializedFavorites;

    if (typeof window !== 'undefined') {
        try {
            localStorage.setItem(STORAGE_KEY, serializedFavorites);
        } catch (error) {
            console.error('Failed to persist favorites', error);
        }
    }

    notifyListeners();
}

export function useFavorites() {
    const favorites = useSyncExternalStore(subscribe, getFavoritesSnapshot, () => []);

    const isFavorite = useCallback((id: string) => {
        return favorites.some(f => f.id === id);
    }, [favorites]);

    const toggleFavorite = useCallback((item: FavoriteItem) => {
        const currentFavorites = [...favorites];
        const index = currentFavorites.findIndex(f => f.id === item.id);

        let newFavorites;
        if (index >= 0) {
            // Remove
            newFavorites = currentFavorites.filter(f => f.id !== item.id);
        } else {
            // Add
            newFavorites = [item, ...currentFavorites];
        }

        persistFavorites(newFavorites);
    }, [favorites]);

    return { favorites, isFavorite, toggleFavorite };
}
