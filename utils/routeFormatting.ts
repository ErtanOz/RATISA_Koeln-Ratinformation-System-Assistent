export const encodeUrl = (url: string) =>
  btoa(encodeURIComponent(url))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

export const decodeUrl = (encoded: string) => {
  try {
    let value = encoded.replace(/-/g, '+').replace(/_/g, '/');
    while (value.length % 4) value += '=';
    return decodeURIComponent(atob(value));
  } catch (error) {
    console.error('Failed to decode URL:', encoded, error);
    return '';
  }
};

export const formatDateTime = (dateStr?: string) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return 'Ungültiges Datum';

    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
      .format(date)
      .replace(',', '');
  } catch {
    return 'Formatierungsfehler';
  }
};

export const formatDateOnly = (dateStr?: string) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return new Intl.DateTimeFormat('de-DE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date);
  } catch {
    return '';
  }
};
