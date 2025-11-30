
import { useState, useEffect, useCallback } from 'react';

export interface FavoriteItem {
    id: string;
    type: 'meeting' | 'paper' | 'person' | 'organization';
    name: string;
    path: string;
    info?: string; // Date or additional info
}

const STORAGE_KEY = 'oparl_favorites';
const EVENT_KEY = 'favorites-updated';

export function useFavorites() {
    const [favorites, setFavorites] = useState<FavoriteItem[]>([]);

    // Load initial state
    useEffect(() => {
        const loadFavorites = () => {
            try {
                const stored = localStorage.getItem(STORAGE_KEY);
                if (stored) {
                    setFavorites(JSON.parse(stored));
                }
            } catch (e) {
                console.error("Failed to parse favorites", e);
            }
        };

        loadFavorites();

        // Listen for changes from other components
        const handleStorageChange = () => loadFavorites();
        window.addEventListener(EVENT_KEY, handleStorageChange);
        
        return () => {
            window.removeEventListener(EVENT_KEY, handleStorageChange);
        };
    }, []);

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

        setFavorites(newFavorites);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(newFavorites));
        
        // Notify other components
        window.dispatchEvent(new Event(EVENT_KEY));
    }, [favorites]);

    return { favorites, isFavorite, toggleFavorite };
}
