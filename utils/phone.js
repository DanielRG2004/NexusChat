function normalizeCRPhone(input) {
  const raw = String(input || '').trim();

  if (!raw) return null;

  const digits = raw.replace(/\D/g, '');

  if (digits.length === 8) {
    return `+506${digits}`;
  }

  if (digits.length === 11 && digits.startsWith('506')) {
    return `+${digits}`;
  }

  if (raw.startsWith('+506') && raw.replace(/\D/g, '').length === 11) {
    return `+${raw.replace(/\D/g, '')}`;
  }

  return null;
}

module.exports = {
  normalizeCRPhone
};