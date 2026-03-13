import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { FavoriteItem, useFavorites } from './useFavorites';

const favoriteItem: FavoriteItem = {
  id: 'meeting-1',
  type: 'meeting',
  name: 'Mobilitätsausschuss',
  path: '/meetings/meeting-1',
  info: '12.03.2026 18:00',
};

describe('useFavorites', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('shares favorite updates across multiple subscribers', () => {
    const first = renderHook(() => useFavorites());
    const second = renderHook(() => useFavorites());

    expect(first.result.current.favorites).toEqual([]);
    expect(second.result.current.favorites).toEqual([]);

    act(() => {
      first.result.current.toggleFavorite(favoriteItem);
    });

    expect(first.result.current.isFavorite(favoriteItem.id)).toBe(true);
    expect(second.result.current.isFavorite(favoriteItem.id)).toBe(true);
    expect(second.result.current.favorites).toEqual([favoriteItem]);

    act(() => {
      second.result.current.toggleFavorite(favoriteItem);
    });

    expect(first.result.current.favorites).toEqual([]);
    expect(second.result.current.favorites).toEqual([]);
  });

  it('ignores invalid and duplicate entries from persisted storage', () => {
    localStorage.setItem(
      'oparl_favorites',
      JSON.stringify([
        favoriteItem,
        favoriteItem,
        { id: 42, type: 'meeting', name: 'Invalid', path: '/invalid' },
        { foo: 'bar' },
      ]),
    );

    const { result } = renderHook(() => useFavorites());

    expect(result.current.favorites).toEqual([favoriteItem]);
  });
});
